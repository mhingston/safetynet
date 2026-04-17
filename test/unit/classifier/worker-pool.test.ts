import { describe, it, expect, vi } from "vitest";

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn().mockResolvedValue(
    async (text: string) => [
      { entity_group: "CREDENTIAL-AWS", score: 0.92, word: "AKIAIOSF", start: 0, end: 8 },
      { entity_group: "CREDENTIAL-AWS", score: 0.90, word: "ODNN7EX", start: 8, end: 15 },
    ]
  ),
}));

describe("WorkerPool", () => {
  it("delegates classification to worker threads", async () => {
    const { WorkerPool } = await import("../../../src/classifier/worker-pool.js");
    const pool = new WorkerPool({ concurrency: 2 });
    await pool.initialize("test-model");
    const result = await pool.classify("key=AKIAIOSFODNN7EX");
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    await pool.terminate();
  });

  it("falls back to single-threaded when shared allocator unavailable", async () => {
    const { WorkerPool } = await import("../../../src/classifier/worker-pool.js");
    const pool = new WorkerPool({ concurrency: 4 });
    vi.spyOn(pool, "trySharedAllocator").mockResolvedValue(false);
    await pool.initialize("test-model");
    expect(pool.concurrency).toBe(1);
    expect(pool.isFallback).toBe(true);
    await pool.terminate();
  });
});