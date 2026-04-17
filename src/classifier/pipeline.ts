import { pipeline } from "@huggingface/transformers";
import { NerLabel } from "./types.js";
import type { TokenClassification } from "./types.js";
import { resolveModelPath } from "./model-resolver.js";

let classifier: any = null;

export async function loadPipeline(modelId: string, options: { maxTokens: number; modelDir?: string }): Promise<void> {
  const resolvedPath = resolveModelPath(modelId, options.modelDir ?? "");
  classifier = await pipeline("token-classification", resolvedPath, {
    dtype: "q8",
  });
}

export async function classifyFragment(text: string, timeoutMs: number = 5000): Promise<TokenClassification[]> {
  if (!classifier) throw new Error("Pipeline not loaded. Call loadPipeline first.");
  const result = await Promise.race([
    classifier(text),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Inference timeout")), timeoutMs)
    ),
  ]);
  const raw = result as any[];
  const results = Array.isArray(raw) ? raw : [raw];
  return results.map((r: any) => ({
    token: r.word ?? r.token_str ?? "",
    label: mapLabel(r.entity_group ?? r.entity),
    confidence: r.score ?? 0,
    start: r.start ?? 0,
    end: r.end ?? 0,
  }));
}

function mapLabel(entityGroup: string): NerLabel {
  const mapped = `B-${entityGroup}`.toUpperCase().replace(/-/g, "_");
  if (mapped in NerLabel) return NerLabel[mapped as keyof typeof NerLabel];
  return NerLabel.O;
}