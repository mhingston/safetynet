import { describe, it, expect } from "vitest";

describe("resolveModelDir", () => {
  it("prioritizes flagDir over configDir over envDir", async () => {
    const { resolveModelDir } = await import("../../../src/classifier/model-resolver.js");
    expect(resolveModelDir({ flagDir: "/flag/path", configDir: "/config/path", envDir: "/env/path" })).toBe("/flag/path");
    expect(resolveModelDir({ flagDir: "", configDir: "/config/path", envDir: "/env/path" })).toBe("/config/path");
    expect(resolveModelDir({ flagDir: "", configDir: "", envDir: "/env/path" })).toBe("/env/path");
  });

  it("uses process.env.SAFETYNET_MODEL_DIR when envDir is not provided", async () => {
    const { resolveModelDir } = await import("../../../src/classifier/model-resolver.js");
    process.env.SAFETYNET_MODEL_DIR = "/from-env";
    expect(resolveModelDir({ flagDir: "", configDir: "" })).toBe("/from-env");
    process.env.SAFETYNET_MODEL_DIR = undefined;
  });

  it("falls back to ~/.cache/huggingface/hub/ when nothing is set", async () => {
    const { resolveModelDir } = await import("../../../src/classifier/model-resolver.js");
    process.env.SAFETYNET_MODEL_DIR = "";
    const result = resolveModelDir({ flagDir: "", configDir: "" });
    expect(result).toContain(".cache/huggingface/hub");
  });
});