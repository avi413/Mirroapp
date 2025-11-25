import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

import { logger } from '../../logger';

export type StyleType =
  | 'Vogue'
  | 'Cartoon'
  | 'Cyberpunk'
  | 'Anime'
  | 'Pop Art'
  | 'Freestyle'
  | 'Studio'
  | 'Cinematic';

export interface AIJobRequest {
  sourcePath?: string;
  base64?: string;
  prompt?: string;
  style?: StyleType;
  intensity?: number;
  variations?: number;
}

export interface AIJobResult {
  outputs: string[];
  previews: string[];
  style: StyleType;
  prompt?: string;
  provider: string;
  startedAt: number;
  completedAt: number;
}

interface PendingJob {
  request: AIJobRequest;
  resolve: (result: AIJobResult) => void;
  reject: (error: Error) => void;
}

interface AIProcessorOptions {
  processedDir: string;
  maxParallelJobs: number;
  provider: string;
  defaultStyle: StyleType;
}

const STYLE_PRESETS: Record<
  StyleType,
  {
    saturation: number;
    contrast: number;
    gamma: number;
    blur?: number;
    tint?: [number, number, number];
  }
> = {
  Vogue: { saturation: 1.05, contrast: 1.1, gamma: 0.95 },
  Cartoon: { saturation: 1.4, contrast: 1.25, gamma: 0.8, blur: 0.5 },
  Cyberpunk: { saturation: 1.5, contrast: 1.3, gamma: 0.9, tint: [120, 60, 200] },
  Anime: { saturation: 1.35, contrast: 1.15, gamma: 0.85 },
  'Pop Art': { saturation: 1.6, contrast: 1.4, gamma: 0.7 },
  Freestyle: { saturation: 1, contrast: 1, gamma: 1 },
  Studio: { saturation: 1.1, contrast: 1.2, gamma: 0.9 },
  Cinematic: { saturation: 0.95, contrast: 1.25, gamma: 1.05, tint: [255, 130, 60] },
};

export class AIProcessor {
  private readonly queue: PendingJob[] = [];
  private activeJobs = 0;

  constructor(private readonly options: AIProcessorOptions) {}

  async initialize(): Promise<void> {
    await mkdir(this.options.processedDir, { recursive: true });
  }

  enqueue(request: AIJobRequest): Promise<AIJobResult> {
    return new Promise<AIJobResult>((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.processQueue();
    });
  }

  getPendingJobs() {
    return this.queue.length + this.activeJobs;
  }

  private processQueue() {
    if (this.activeJobs >= this.options.maxParallelJobs) {
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      return;
    }
    this.activeJobs += 1;
    this.runJob(job)
      .catch((error) => {
        job.reject(error);
      })
      .finally(() => {
        this.activeJobs -= 1;
        setImmediate(() => this.processQueue());
      });
  }

  private async runJob(job: PendingJob) {
    const startedAt = Date.now();
    try {
      const result = await this.generate(job.request, startedAt);
      job.resolve(result);
    } catch (error) {
      logger.error(`[AI] Job failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private async generate(request: AIJobRequest, startedAt: number): Promise<AIJobResult> {
    if (!request.sourcePath && !request.base64) {
      throw new Error('AI job missing source image');
    }
    const style = request.style ?? this.options.defaultStyle;
    const variations = Math.max(1, Math.min(5, request.variations ?? 1));
    const intensity = Math.min(1, Math.max(0, request.intensity ?? 0.7));
    const sourceBuffer = await this.loadSource(request);
    const outputs: string[] = [];
    const previews: string[] = [];

    for (let i = 0; i < variations; i += 1) {
      const variationBuffer = await this.applyStyle(sourceBuffer, style, intensity, i, request.prompt);
      const filename = `${randomUUID()}-${style.toLowerCase()}-v${i + 1}.jpg`;
      const outputPath = path.join(this.options.processedDir, filename);
      await writeFile(outputPath, variationBuffer);
      outputs.push(outputPath);
      previews.push(`data:image/jpeg;base64,${variationBuffer.toString('base64')}`);
    }

    const completedAt = Date.now();
    logger.info(`[AI] Generated ${outputs.length} variation(s) using ${style}`);

    return {
      outputs,
      style,
      previews,
      prompt: request.prompt,
      provider: this.options.provider,
      startedAt,
      completedAt,
    };
  }

  private async loadSource(request: AIJobRequest) {
    if (request.base64) {
      const [, raw] = request.base64.split(',');
      return Buffer.from(raw ?? request.base64, 'base64');
    }
    if (!request.sourcePath) {
      throw new Error('No AI source provided');
    }
    return readFile(request.sourcePath);
  }

  private async applyStyle(
    buffer: Buffer,
    style: StyleType,
    intensity: number,
    seed: number,
    prompt?: string
  ) {
    const preset = STYLE_PRESETS[style];
    const pipeline = sharp(buffer).resize(2048, 2048, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    const variationFactor = 1 + (((seed * 13) % 7) / 20);
    pipeline.modulate({
      saturation: preset.saturation * (1 + intensity * 0.2) * variationFactor,
      brightness: 1 + intensity * 0.05,
    });

    pipeline.linear(preset.contrast, -(preset.contrast - 1) * 32);
    pipeline.gamma(preset.gamma);

    if (preset.blur) {
      pipeline.blur(preset.blur * intensity + seed * 0.02);
    }

    if (preset.tint) {
      const [r, g, b] = preset.tint;
      const overlay = Buffer.from(
        `<svg width="2048" height="2048"><rect width="100%" height="100%" fill="rgba(${r},${g},${b},${
          0.15 * intensity
        })"/></svg>`
      );
      pipeline.composite([{ input: overlay, blend: 'overlay' }]);
    }

    if (style === 'Cartoon') {
      pipeline
        .median(3)
        .sharpen({
          sigma: 1,
          m1: 0,
          m2: 3,
          x1: 2,
          y2: 15,
          y3: 15,
        })
        .threshold(235);
    } else if (style === 'Cyberpunk') {
      pipeline
        .sharpen()
        .linear(1.2, -15)
        .modulate({ hue: 30, saturation: 1.2 });
    }

    const watermark = this.buildWatermark(style, prompt);
    pipeline.composite([{ input: watermark, gravity: 'southwest' }]);

    return pipeline.jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toBuffer();
  }

  private buildWatermark(style: StyleType, prompt?: string) {
    const width = 600;
    const height = prompt ? 140 : 90;
    const safePrompt = prompt ? prompt.slice(0, 120) : '';
    const svg = `
      <svg width="${width}" height="${height}">
        <rect width="100%" height="100%" rx="20" ry="20" fill="rgba(0,0,0,0.45)" />
        <text x="30" y="50" font-size="36" fill="#ffffff" font-family="Inter, sans-serif" font-weight="600">
          LOOQA · ${style}
        </text>
        ${
          safePrompt
            ? `<text x="30" y="95" font-size="26" fill="#ffffffcc" font-family="Inter, sans-serif">${safePrompt}</text>`
            : ''
        }
      </svg>
    `;
    return Buffer.from(svg);
  }
}
