import { classifyFragment, loadPipeline } from "./pipeline.js";
import type { TokenClassification } from "./types.js";

export class WorkerPool {
  concurrency: number;
  isFallback = false;
  private modelId = "";

  constructor(opts: { concurrency: number }) {
    this.concurrency = opts.concurrency;
  }

  async initialize(modelId: string): Promise<void> {
    this.modelId = modelId;
    await loadPipeline(modelId, { maxTokens: 8192 });
    const sharedOk = await this.trySharedAllocator();
    if (!sharedOk && this.concurrency > 1) {
      this.isFallback = true;
      this.concurrency = 1;
      process.stderr.write("[safetynet] Warning: shared ONNX allocator unavailable, falling back to single-threaded\n");
    }
  }

  async trySharedAllocator(): Promise<boolean> {
    return true;
  }

  async classify(text: string): Promise<TokenClassification[]> {
    return classifyFragment(text);
  }

  async terminate(): Promise<void> {
  }
}