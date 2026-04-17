import { resolveModelDir } from "../classifier/model-resolver.js";
import { loadPipeline } from "../classifier/pipeline.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

export async function downloadHandler(options: { modelDir?: string; configDir?: string }): Promise<void> {
  const modelDir = resolveModelDir({
    flagDir: options.modelDir ?? "",
    configDir: options.configDir ?? "",
  });

  const modelId = DEFAULT_CONFIG.classifier.model || "answerdotai/modernbert-base-safetynet";
  console.log(`Downloading model to ${modelDir}...`);

  try {
    await loadPipeline(modelId, { maxTokens: DEFAULT_CONFIG.classifier.maxTokens });
    console.log("Model downloaded successfully.");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to download model: ${msg}`);
    process.exit(2);
  }
}