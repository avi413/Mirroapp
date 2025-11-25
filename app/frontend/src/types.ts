export interface CameraStatus {
  connected: boolean;
  model?: string;
  liveView: boolean;
  driver: 'canon' | 'mock';
  lastCapture?: number;
}

export interface SessionState {
  id: string;
  name: string;
  date: string;
  aiEnabled: boolean;
  theme: string;
  maxPhotos: number;
  framesPerTemplate: number;
  copies: number;
  galleryEnabled: boolean;
  cloudBackup: boolean;
  createdAt: number;
}

export interface TemplateMetrics {
  queued: number;
  totalJobs: number;
  printing: number;
  errors: number;
}

export interface BoothStatus {
  camera: CameraStatus;
  session: SessionState | null;
  printer: TemplateMetrics;
  ai: {
    provider: string;
    pending: number;
  };
}

export interface CaptureResponse {
  filePath: string;
  capturedAt: number;
  previewData: string;
  driver: 'canon' | 'mock';
}

export interface LiveFrameResponse {
  frame: string;
}

export type StyleType =
  | 'Vogue'
  | 'Cartoon'
  | 'Cyberpunk'
  | 'Anime'
  | 'Pop Art'
  | 'Freestyle'
  | 'Studio'
  | 'Cinematic';

export interface AiResult {
  outputs: string[];
  previews: string[];
  style: StyleType;
  prompt?: string;
  provider: string;
  startedAt: number;
  completedAt: number;
}

export type TemplateId = 'classic-4x6' | 'dual-strip-2x6' | 'collage-4x6';

export interface TemplateResponse {
  composedPath: string;
  previewData: string;
  format: '4x6' | '2x6';
}

export interface PrintJobStatus {
  id: string;
  status: 'queued' | 'printing' | 'completed' | 'error';
  copies: number;
  printer?: string;
  attempts: number;
  error?: string;
  filePath: string;
  format: '4x6' | '2x6';
  createdAt: number;
}

export interface CameraSettingsPayload {
  iso?: number;
  shutter?: string;
  aperture?: string;
  whiteBalance?: string;
  exposureComp?: number;
  flash?: boolean;
}

export interface StepDescriptor {
  title: string;
  subtitle: string;
  cta?: string;
  future?: boolean;
}
