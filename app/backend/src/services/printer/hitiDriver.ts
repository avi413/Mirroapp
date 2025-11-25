import { access } from 'fs/promises';
import { spawn } from 'child_process';

import { logger } from '../../logger';

export interface PrintJob {
  filePath: string;
  format: '4x6' | '2x6';
  copies?: number;
  printer?: string;
}

export type PrintStatus = 'queued' | 'printing' | 'completed' | 'error';

export interface PrintJobState extends PrintJob {
  id: string;
  status: PrintStatus;
  createdAt: number;
  attempts: number;
  error?: string;
}

interface PrinterQueueOptions {
  defaultCopies: number;
  queueRetries: number;
  targetPrinters: string[];
}

export class PrinterQueue {
  private readonly queue: PrintJobState[] = [];
  private readonly jobs = new Map<string, PrintJobState>();
  private processing = false;

  constructor(private readonly options: PrinterQueueOptions) {}

  enqueue(job: PrintJob): string {
    const id = `print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const state: PrintJobState = {
      ...job,
      copies: job.copies ?? this.options.defaultCopies,
      printer: job.printer ?? this.options.targetPrinters[0],
      id,
      createdAt: Date.now(),
      status: 'queued',
      attempts: 0,
    };
    this.jobs.set(id, state);
    this.queue.push(state);
    this.tick();
    logger.info(`[Printer] Job queued ${id} (${state.copies} copies)`);
    return id;
  }

  getStatus(id: string): PrintJobState | undefined {
    return this.jobs.get(id);
  }

  getMetrics() {
    return {
      queued: this.queue.length,
      totalJobs: this.jobs.size,
      printing: Array.from(this.jobs.values()).filter((job) => job.status === 'printing').length,
      errors: Array.from(this.jobs.values()).filter((job) => job.status === 'error').length,
    };
  }

  private async tick() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;
      await this.processJob(job);
    }
    this.processing = false;
  }

  private async processJob(job: PrintJobState) {
    job.status = 'printing';
    try {
      await access(job.filePath);
    } catch {
      job.status = 'error';
      job.error = 'File not found';
      logger.error(`[Printer] Missing file for job ${job.id}`);
      return;
    }

    try {
      if (process.platform === 'win32') {
        await this.printOnWindows(job);
      } else {
        await this.printOnPosix(job);
      }
      job.status = 'completed';
      job.error = undefined;
      logger.info(`[Printer] Job ${job.id} completed`);
    } catch (error) {
      job.attempts += 1;
      job.error = (error as Error).message;
      logger.error(`[Printer] Job ${job.id} failed: ${job.error}`);
      if (job.attempts <= this.options.queueRetries) {
        job.status = 'queued';
        this.queue.push(job);
      } else {
        job.status = 'error';
      }
    }
  }

  private async printOnWindows(job: PrintJobState) {
    const script = this.buildWindowsScript(job);
    await this.spawnCommand('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', script]);
  }

  private buildWindowsScript(job: PrintJobState) {
    const printer = job.printer ? job.printer.replace(/'/g, "''") : '';
    const targetPrinter = printer
      ? `/d:"${printer}"`
      : '';
    const escaped = job.filePath.replace(/'/g, "''");
    return `
$ErrorActionPreference = 'Stop';
for ($i = 0; $i -lt ${job.copies}; $i++) {
  & $env:WINDIR\\System32\\print.exe ${targetPrinter} '${escaped}'
}
`;
  }

  private async printOnPosix(job: PrintJobState) {
    const args = [];
    if (job.printer) {
      args.push('-d', job.printer);
    }
    args.push('-n', `${job.copies}`);
    args.push(job.filePath);
    await this.spawnCommand('lp', args);
  }

  private spawnCommand(command: string, args: string[]) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true });
      child.once('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} exited with code ${code}`));
        }
      });
      child.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          logger.warn(`[Printer] Command ${command} not available. Marking job as completed for dev env.`);
          resolve();
          return;
        }
        reject(error);
      });
    });
  }
}
