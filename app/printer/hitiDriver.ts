export interface PrintJob {
  filePath: string;
  format: '4x6' | '2x6';
  copies: number;
}

export type PrintStatus = 'queued' | 'printing' | 'completed' | 'error';

export class PrinterQueue {
  private queue: PrintJob[] = [];
  private statusMap = new Map<string, PrintStatus>();

  enqueue(job: PrintJob): string {
    const id = `print-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.queue.push(job);
    this.statusMap.set(id, 'queued');
    this.processNext(id, job);
    return id;
  }

  getStatus(id: string): PrintStatus | undefined {
    return this.statusMap.get(id);
  }

  private processNext(id: string, job: PrintJob) {
    this.statusMap.set(id, 'printing');
    setTimeout(() => {
      this.statusMap.set(id, 'completed');
    }, 2000);
  }
}
