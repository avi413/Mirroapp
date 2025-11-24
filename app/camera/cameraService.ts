export interface CaptureResult {
  filePath: string;
  capturedAt: number;
}

export interface CameraStatus {
  connected: boolean;
  model?: string;
  liveView: boolean;
}

export class CameraService {
  private liveViewClients = new Set<(frame: Buffer) => void>();
  private status: CameraStatus = { connected: false, liveView: false };

  async initialize(): Promise<void> {
    // TODO: bind to Canon EDSDK via native addon
    this.status = { connected: true, model: 'Canon EOS 2000D', liveView: false };
  }

  getStatus(): CameraStatus {
    return this.status;
  }

  async startLiveView(): Promise<void> {
    if (!this.status.connected) {
      throw new Error('Camera not connected');
    }
    this.status.liveView = true;
    // In production, stream frames from native module
  }

  async stopLiveView(): Promise<void> {
    this.status.liveView = false;
  }

  registerLiveViewClient(cb: (frame: Buffer) => void) {
    this.liveViewClients.add(cb);
  }

  unregisterLiveViewClient(cb: (frame: Buffer) => void) {
    this.liveViewClients.delete(cb);
  }

  async capture(): Promise<CaptureResult> {
    if (!this.status.connected) {
      throw new Error('Camera not connected');
    }
    // Mock capture file path
    const filePath = `C:/LOOQA/captures/${Date.now()}.jpg`;
    return { filePath, capturedAt: Date.now() };
  }
}
