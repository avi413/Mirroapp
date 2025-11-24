export interface CameraStatus {
  connected: boolean;
  model?: string;
  liveView: boolean;
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

export interface StepDescriptor {
  title: string;
  subtitle: string;
  cta?: string;
  future?: boolean;
}
