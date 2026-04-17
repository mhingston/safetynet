import { parse } from "smol-toml";
import { DEFAULT_CONFIG } from "./defaults.js";
type DefaultConfig = typeof DEFAULT_CONFIG;

export interface SafetynetConfig {
  title: string;
  allowlist: {
    paths: string[];
    commits: string[];
    stopwords: string[];
  };
  classifier: {
    model: string;
    modelDir: string;
    threshold: number;
    minConfidence: number;
    maxTokens: number;
    concurrency: number;
  };
}

function mergeDeep<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Record<string, unknown>
): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const overrideVal = overrides[key];
    const defaultVal = defaults[key];
    if (
      overrideVal !== null &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      defaultVal !== null &&
      typeof defaultVal === "object" &&
      !Array.isArray(defaultVal)
    ) {
      result[key as keyof T] = mergeDeep(
        defaultVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>
      ) as T[keyof T];
    } else {
      result[key as keyof T] = overrideVal as T[keyof T];
    }
  }
  return result;
}

function toCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function convertKeysToCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(convertKeysToCamel);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[toCamelCase(key)] = convertKeysToCamel(value);
    }
    return result;
  }
  return obj;
}

export function parseConfig(tomlString: string): SafetynetConfig {
  if (!tomlString.trim()) return { ...DEFAULT_CONFIG } as SafetynetConfig;

  let parsed: Record<string, unknown>;
  try {
    parsed = parse(tomlString) as Record<string, unknown>;
  } catch {
    return { ...DEFAULT_CONFIG } as SafetynetConfig;
  }

  const camelParsed = convertKeysToCamel(parsed) as Record<string, unknown>;
  const deepCopy: DefaultConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  return mergeDeep(deepCopy, camelParsed) as SafetynetConfig;
}