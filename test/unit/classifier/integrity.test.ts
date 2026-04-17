import { describe, it, expect } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

describe("verifyModelIntegrity", () => {
  it("returns true when SHA-256 matches", async () => {
    const { verifyModelIntegrity } = await import("../../../src/classifier/integrity.js");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "safetynet-test-"));
    const filePath = path.join(tmpDir, "model.onnx");
    await fs.writeFile(filePath, "test data");
    const hash = crypto.createHash("sha256").update("test data").digest("hex");
    const result = await verifyModelIntegrity(filePath, hash);
    expect(result).toBe(true);
    await fs.rm(tmpDir, { recursive: true });
  });

  it("returns false when SHA-256 mismatches", async () => {
    const { verifyModelIntegrity } = await import("../../../src/classifier/integrity.js");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "safetynet-test-"));
    const filePath = path.join(tmpDir, "model.onnx");
    await fs.writeFile(filePath, "test data");
    const result = await verifyModelIntegrity(filePath, "0000badhash");
    expect(result).toBe(false);
    await fs.rm(tmpDir, { recursive: true });
  });
});