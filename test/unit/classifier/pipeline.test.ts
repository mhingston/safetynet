import { describe, it, expect, vi } from "vitest";

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn().mockResolvedValue(
    async (text: string) => [
      { entity_group: "CREDENTIAL-AWS", score: 0.92, word: "AKIAIOSF", start: 0, end: 8 },
      { entity_group: "CREDENTIAL-AWS", score: 0.90, word: "ODNN7EX", start: 8, end: 15 },
    ]
  ),
}));

describe("classifyFragment", () => {
  it("returns TokenClassification array from pipeline", async () => {
    const { classifyFragment, loadPipeline } = await import("../../../src/classifier/pipeline.js");
    await loadPipeline("test-model", { maxTokens: 8192 });
    const results = await classifyFragment("key=AKIAIOSFODNN7EX");
    expect(results).toHaveLength(2);
    expect(results[0].label).toBe("B-CREDENTIAL-AWS");
  });
});