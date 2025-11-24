import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

export interface SessionOptions {
  name: string;
  date: string;
  aiEnabled: boolean;
  theme: string;
  maxPhotos: number;
  framesPerTemplate: number;
  copies: number;
  galleryEnabled: boolean;
  cloudBackup: boolean;
}

export interface SessionState extends SessionOptions {
  id: string;
  createdAt: number;
}

export class SessionManager {
  private current?: SessionState;

  constructor(private eventsDir: string) {}

  async start(options: SessionOptions): Promise<SessionState> {
    const id = `session-${Date.now()}`;
    this.current = { ...options, id, createdAt: Date.now() };
    await this.persist();
    return this.current;
  }

  getActive(): SessionState | undefined {
    return this.current;
  }

  async reset(): Promise<void> {
    this.current = undefined;
  }

  private async persist() {
    if (!this.current) return;
    await mkdir(this.eventsDir, { recursive: true });
    const file = path.join(this.eventsDir, `${this.current.id}.json`);
    await writeFile(file, JSON.stringify(this.current, null, 2), 'utf-8');
  }

  async load(id: string): Promise<SessionState | undefined> {
    const file = path.join(this.eventsDir, `${id}.json`);
    try {
      const raw = await readFile(file, 'utf-8');
      this.current = JSON.parse(raw) as SessionState;
      return this.current;
    } catch {
      return undefined;
    }
  }
}
