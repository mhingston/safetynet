import * as path from "node:path";
import * as os from "node:os";
import * as url from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function getBundledModelDir(): string {
  return path.resolve(__dirname, "..", "..", "models");
}

export interface ModelDirOptions {
  flagDir: string;
  configDir: string;
  envDir?: string;
}

export function resolveModelDir(options: ModelDirOptions): string {
  if (options.flagDir) return options.flagDir;
  if (options.configDir) return options.configDir;
  const envDir = options.envDir ?? process.env.SAFETYNET_MODEL_DIR ?? "";
  if (envDir) return envDir;
  return path.join(os.homedir(), ".cache", "huggingface", "hub");
}

export function resolveModelPath(modelId: string, modelDir: string): string {
  if (modelId === "safetynet-ner") {
    if (modelDir) return path.join(modelDir, modelId);
    const bundled = getBundledModelDir();
    if (existsSync(path.join(bundled, "config.json"))) return bundled;
    return path.join(resolveModelDir({ flagDir: "", configDir: "" }), "models--answerdotai--modernbert-base-safetynet");
  }
  if (modelDir) return path.join(modelDir, modelId);
  return modelId;
}