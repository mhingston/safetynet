import { describe, it, expect } from "vitest";
import { parseConfig } from "../../../src/config/config.js";
import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import type { SafetynetConfig } from "../../../src/config/config.js";

describe("parseConfig", () => {
  it("returns defaults for empty input", () => {
    const result = parseConfig("");
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it("parses custom classifier settings", () => {
    const toml = `
[classifier]
model = "my-org/my-model"
threshold = 0.75
min_confidence = 0.3
concurrency = 8
`;
    const result = parseConfig(toml);
    expect(result.classifier.model).toBe("my-org/my-model");
    expect(result.classifier.threshold).toBe(0.75);
    expect(result.classifier.minConfidence).toBe(0.3);
    expect(result.classifier.concurrency).toBe(8);
    expect(result.classifier.maxTokens).toBe(DEFAULT_CONFIG.classifier.maxTokens);
    expect(result.classifier.modelDir).toBe(DEFAULT_CONFIG.classifier.modelDir);
  });

  it("parses allowlist paths, commits, stopwords", () => {
    const toml = `
[allowlist]
paths = ["\\\\.env\\\\.", "secrets/"]
commits = ["abc123", "def456"]
stopwords = ["password", "token"]
`;
    const result = parseConfig(toml);
    expect(result.allowlist.paths).toEqual(["\\.env\\.", "secrets/"]);
    expect(result.allowlist.commits).toEqual(["abc123", "def456"]);
    expect(result.allowlist.stopwords).toEqual(["password", "token"]);
  });

  it("merges partial config with defaults", () => {
    const toml = `
[classifier]
concurrency = 16
`;
    const result = parseConfig(toml);
    expect(result.classifier.concurrency).toBe(16);
    expect(result.classifier.threshold).toBe(DEFAULT_CONFIG.classifier.threshold);
    expect(result.classifier.model).toBe(DEFAULT_CONFIG.classifier.model);
    expect(result.title).toBe(DEFAULT_CONFIG.title);
    expect(result.allowlist).toEqual(DEFAULT_CONFIG.allowlist);
  });

  it("handles invalid TOML gracefully by returning defaults", () => {
    const result = parseConfig("this is not [valid [[[ toml");
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it("parses title", () => {
    const toml = `title = "my project"`;
    const result = parseConfig(toml);
    expect(result.title).toBe("my project");
    expect(result.classifier).toEqual(DEFAULT_CONFIG.classifier);
    expect(result.allowlist).toEqual(DEFAULT_CONFIG.allowlist);
  });

  it("parses model_dir", () => {
    const toml = `
[classifier]
model_dir = "/tmp/models"
`;
    const result = parseConfig(toml);
    expect(result.classifier.modelDir).toBe("/tmp/models");
    expect(result.classifier.model).toBe(DEFAULT_CONFIG.classifier.model);
  });

  it("parses max_tokens", () => {
    const toml = `
[classifier]
max_tokens = 4096
`;
    const result = parseConfig(toml);
    expect(result.classifier.maxTokens).toBe(4096);
    expect(result.classifier.threshold).toBe(DEFAULT_CONFIG.classifier.threshold);
  });
});