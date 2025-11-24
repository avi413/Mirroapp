export type StyleType =
  | 'Cartoon'
  | 'Vogue'
  | 'Cyberpunk'
  | 'Anime'
  | 'Pop Art'
  | 'Freestyle';

export interface AIJobRequest {
  capturePath: string;
  prompt?: string;
  style: StyleType;
  intensity: number;
  variations: number;
}

export interface AIJobResult {
  outputs: string[];
  style: StyleType;
  completedAt: number;
}

export class AIProcessor {
  private queue: AIJobRequest[] = [];
  private activeJobs = 0;
  private readonly maxParallelJobs: number;

  constructor(maxParallelJobs: number) {
    this.maxParallelJobs = maxParallelJobs;
  }

  enqueue(job: AIJobRequest): Promise<AIJobResult> {
    return new Promise((resolve) => {
      this.queue.push(job);
      this.processQueue(resolve);
    });
  }

  private async processQueue(
    resolver: (value: AIJobResult | PromiseLike<AIJobResult>) => void
  ) {
    if (this.activeJobs >= this.maxParallelJobs || this.queue.length === 0) {
      return;
    }
    const job = this.queue.shift()!;
    this.activeJobs += 1;
    // mock AI processing delay
    setTimeout(() => {
      this.activeJobs -= 1;
      const outputs = Array.from({ length: job.variations }).map(
        (_, idx) => `${job.capturePath.replace('.jpg', '')}_V${idx + 1}.jpg`
      );
      resolver({ outputs, style: job.style, completedAt: Date.now() });
      this.processQueue(resolver);
    }, 1000);
  }
}
