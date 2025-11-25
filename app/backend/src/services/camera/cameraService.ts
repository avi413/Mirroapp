import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';

import { logger } from '../../logger';

export interface CaptureResult {
  filePath: string;
  capturedAt: number;
  previewData: string;
  driver: 'canon' | 'mock';
}

export interface CameraStatus {
  connected: boolean;
  model?: string;
  liveView: boolean;
  driver: 'canon' | 'mock';
  lastCapture?: number;
}

export interface CameraSettings {
  iso?: number;
  shutter?: string;
  aperture?: string;
  whiteBalance?: string;
  exposureComp?: number;
  flash?: boolean;
}

interface CameraDriver {
  readonly name: 'canon' | 'mock';
  init(): Promise<void>;
  getStatus(): Omit<CameraStatus, 'driver' | 'liveView'>;
  getLiveFrame(): Promise<Buffer>;
  capture(): Promise<{ filePath: string; buffer: Buffer }>;
  setSettings(settings: CameraSettings): Promise<void>;
  dispose(): Promise<void>;
}

interface CameraServiceOptions {
  captureDir: string;
  liveView: {
    frameRate: number;
    resolution: string;
  };
}

const FALLBACK_RESOLUTION = { width: 1280, height: 720 };

const parseResolution = (value: string) => {
  const [width, height] = value.split('x').map((part) => Number.parseInt(part, 10));
  if (Number.isFinite(width) && Number.isFinite(height)) {
    return { width, height };
  }
  return FALLBACK_RESOLUTION;
};

class MockCameraDriver implements CameraDriver {
  readonly name = 'mock' as const;
  private frame = 0;

  constructor(
    private readonly opts: {
      captureDir: string;
      resolution: { width: number; height: number };
    }
  ) {}

  async init(): Promise<void> {
    await mkdir(this.opts.captureDir, { recursive: true });
  }

  async dispose(): Promise<void> {
    // nothing to release
  }

  async getLiveFrame(): Promise<Buffer> {
    return this.generateFrame(false);
  }

  async capture(): Promise<{ filePath: string; buffer: Buffer }> {
    const buffer = await this.generateFrame(true);
    const filePath = path.join(this.opts.captureDir, `mock-${Date.now()}.jpg`);
    await writeFile(filePath, buffer);
    return { filePath, buffer };
  }

  async setSettings(): Promise<void> {
    // Mock driver ignores settings but keeps API parity.
  }

  getStatus() {
    return {
      connected: true,
      model: 'Mock DSLR (offline mode)',
    };
  }

  private async generateFrame(highQuality: boolean) {
    this.frame += 1;
    const { width, height } = this.opts.resolution;
    const timestamp = new Date().toLocaleTimeString();
    const hue = (this.frame * 37) % 360;

    const svg = `
      <svg width="${width}" height="${height}">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="hsl(${hue},70%,40%)" />
            <stop offset="100%" stop-color="hsl(${(hue + 120) % 360},70%,25%)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#grad)" rx="20" ry="20"/>
        <text x="50%" y="45%" font-size="${Math.round(
          height * 0.08
        )}" fill="#ffffff" text-anchor="middle" font-family="Inter, sans-serif">LOOQA MOCK FEED</text>
        <text x="50%" y="55%" font-size="${Math.round(
          height * 0.05
        )}" fill="#ffffff" text-anchor="middle" font-family="Inter, sans-serif" opacity="0.7">${timestamp}</text>
        <text x="50%" y="65%" font-size="${Math.round(
          height * 0.035
        )}" fill="#ffffff" text-anchor="middle" font-family="Inter, sans-serif" opacity="0.6">Frame #${this.frame}</text>
      </svg>
    `;

    return sharp(Buffer.from(svg))
      .jpeg({ quality: highQuality ? 92 : 70 })
      .toBuffer();
  }
}

class CanonEdsdkDriver implements CameraDriver {
  readonly name = 'canon' as const;
  private native?: {
    initialize: () => boolean;
    startLiveView: () => boolean;
    stopLiveView: () => void;
    getLiveFrame: () => Buffer;
    capture: () => string;
    setSettings: (settings: CameraSettings) => void;
  };
  private liveViewStarted = false;

  constructor(private readonly opts: { captureDir: string }) {
    const candidate = path.resolve(
      __dirname,
      '../../../../camera/native/build/Release/camera.node'
    );
    if (fs.existsSync(candidate)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      this.native = require(candidate);
    } else {
      throw new Error('Canon native module not found. Compile camera/native.');
    }
  }

  async init(): Promise<void> {
    if (!this.native?.initialize()) {
      throw new Error('Canon driver failed to initialize');
    }
    await mkdir(this.opts.captureDir, { recursive: true });
  }

  async dispose(): Promise<void> {
    if (this.liveViewStarted) {
      this.native?.stopLiveView();
    }
  }

  async getLiveFrame(): Promise<Buffer> {
    this.ensureLiveView();
    const frame = this.native?.getLiveFrame();
    if (!frame) {
      throw new Error('Canon driver did not return a frame');
    }
    return frame;
  }

  async capture(): Promise<{ filePath: string; buffer: Buffer }> {
    const capturePath = this.native?.capture();
    if (!capturePath) {
      throw new Error('Canon driver failed to capture image');
    }
    const normalized = path.isAbsolute(capturePath)
      ? capturePath
      : path.join(this.opts.captureDir, capturePath);
    const buffer = await fs.promises.readFile(normalized);
    return { filePath: normalized, buffer };
  }

  async setSettings(settings: CameraSettings): Promise<void> {
    this.native?.setSettings(settings);
  }

  getStatus() {
    return {
      connected: true,
      model: 'Canon EOS 2000D',
    };
  }

  private ensureLiveView() {
    if (!this.liveViewStarted) {
      const ok = this.native?.startLiveView();
      if (!ok) {
        throw new Error('Canon driver could not start LiveView');
      }
      this.liveViewStarted = true;
    }
  }
}

type FrameListener = (frame: Buffer) => void;

export class CameraService {
  private driver!: CameraDriver;
  private latestFrame?: Buffer;
  private readonly liveViewClients = new Set<FrameListener>();
  private liveInterval?: NodeJS.Timeout;
  private readonly captureDir: string;
  private readonly resolution: { width: number; height: number };
  private readonly frameInterval: number;
  private liveViewEnabled = false;
  private lastCapture?: number;

  constructor(private readonly options: CameraServiceOptions) {
    this.captureDir = options.captureDir;
    this.resolution = parseResolution(options.liveView.resolution);
    this.frameInterval = Math.max(1, Math.round(1000 / options.liveView.frameRate));
  }

  async initialize(): Promise<void> {
    this.driver = await this.selectDriver();
    logger.info(`[Camera] Driver ready: ${this.driver.name}`);
  }

  async dispose(): Promise<void> {
    await this.driver?.dispose();
  }

  getStatus(): CameraStatus {
    return {
      ...this.driver.getStatus(),
      liveView: this.liveViewEnabled,
      driver: this.driver.name,
      lastCapture: this.lastCapture,
    };
  }

  async setSettings(settings: CameraSettings): Promise<void> {
    await this.driver.setSettings(settings);
    logger.info(`[Camera] Settings updated ${JSON.stringify(settings)}`);
  }

  async getLatestFrame(): Promise<Buffer | undefined> {
    if (this.latestFrame) {
      return this.latestFrame;
    }
    try {
      const buffer = await this.driver.getLiveFrame();
      this.latestFrame = buffer;
      return buffer;
    } catch (error) {
      logger.error(`[Camera] Failed to get frame: ${(error as Error).message}`);
      return undefined;
    }
  }

  async startLiveView(): Promise<void> {
    if (this.liveInterval) {
      this.liveViewEnabled = true;
      return;
    }
    this.liveInterval = setInterval(async () => {
      try {
        const frame = await this.driver.getLiveFrame();
        this.latestFrame = frame;
        for (const cb of this.liveViewClients) {
          cb(frame);
        }
      } catch (error) {
        logger.error(`[Camera] LiveView error: ${(error as Error).message}`);
      }
    }, this.frameInterval);
    this.liveViewEnabled = true;
    logger.info('[Camera] LiveView started');
  }

  async stopLiveView(): Promise<void> {
    if (this.liveInterval) {
      clearInterval(this.liveInterval);
      this.liveInterval = undefined;
    }
    this.liveViewEnabled = false;
    logger.info('[Camera] LiveView stopped');
  }

  registerLiveViewClient(cb: FrameListener) {
    this.liveViewClients.add(cb);
  }

  unregisterLiveViewClient(cb: FrameListener) {
    this.liveViewClients.delete(cb);
  }

  async capture(): Promise<CaptureResult> {
    const result = await this.driver.capture();
    this.latestFrame = result.buffer;
    this.lastCapture = Date.now();
    const previewData = `data:image/jpeg;base64,${result.buffer.toString('base64')}`;
    logger.info(`[Camera] Capture saved to ${result.filePath}`);
    return {
      filePath: result.filePath,
      capturedAt: this.lastCapture,
      previewData,
      driver: this.driver.name,
    };
  }

  private async selectDriver(): Promise<CameraDriver> {
    if (process.platform === 'win32' && !process.env.LOOQA_FORCE_MOCK_CAMERA) {
      try {
        const canon = new CanonEdsdkDriver({ captureDir: this.captureDir });
        await canon.init();
        return canon;
      } catch (error) {
        logger.warn(
          `[Camera] Canon driver unavailable, fallback to mock. Reason: ${(error as Error).message}`
        );
      }
    }
    const mock = new MockCameraDriver({
      captureDir: this.captureDir,
      resolution: this.resolution,
    });
    await mock.init();
    return mock;
  }
}
