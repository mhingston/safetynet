import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";

export async function verifyModelIntegrity(filePath: string, expectedHash: string): Promise<boolean> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    return hash === expectedHash;
  } catch {
    return false;
  }
}