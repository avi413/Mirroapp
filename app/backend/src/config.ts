import { readFile } from 'fs/promises';
import path from 'path';

export interface Settings {
  liveView: {
    frameRate: number;
    resolution: string;
  };
  storage: {
    captureDir: string;
    processedDir: string;
    templatesDir: string;
    eventsDir: string;
  };
  ai: {
    provider: 'nano-banana' | 'gemini-nano';
    maxParallelJobs: number;
    defaultStyle: string;
  };
  printing: {
    defaultCopies: number;
    queueRetries: number;
    targetPrinters: string[];
  };
}

export class SettingsService {
  private static instance: SettingsService;
  private config?: Settings;

  private constructor() {}

  static getInstance() {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  async load(): Promise<Settings> {
    if (this.config) {
      return this.config;
    }
    const settingsPath =
      process.env.LOOQA_SETTINGS ??
      path.resolve(process.cwd(), '../config/settings.json');
    const file = await readFile(settingsPath, 'utf-8');
    this.config = JSON.parse(file) as Settings;
    return this.config;
  }
}
