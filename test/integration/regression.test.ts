import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonReporter } from "../../src/report/json-reporter.js";
import { SarifReporter } from "../../src/report/sarif-reporter.js";
import type { Finding } from "../../src/findings/finding.js";

const goldenFindings: Finding[] = [
  {
    ruleId: "credential-aws",
    description: "AWS key detected",
    startLine: 5,
    endLine: 5,
    startColumn: 0,
    endColumn: 20,
    match: "AKIAIOSFODNN7EXAMPLE",
    secret: "AKIAIOSFODNN7EXAMPLE",
    file: "src/config.ts",
    commit: "abc123",
    author: "alice",
    email: "alice@example.com",
    date: "2025-01-01",
    message: "add config",
    entropy: 3.5,
    fingerprint: "abc123:src/config.ts:credential-aws:5",
    tags: ["key"],
    confidence: 0.9,
  },
  {
    ruleId: "credential-github",
    description: "GitHub token detected",
    startLine: 10,
    endLine: 10,
    startColumn: 2,
    endColumn: 30,
    match: "ghp_abcd1234",
    secret: "ghp_abcd1234",
    file: "src/auth.ts",
    commit: "def456",
    author: "bob",
    email: "bob@example.com",
    date: "2025-01-02",
    message: "add auth",
    entropy: 4.0,
    fingerprint: "def456:src/auth.ts:credential-github:10",
    tags: ["token"],
    confidence: 0.8,
  },
];

const fixturesDir = resolve(__dirname, "../fixtures/golden");

function loadGolden(filename: string): string {
  return readFileSync(resolve(fixturesDir, filename), "utf-8").trim();
}

describe("golden-file regression tests", () => {
  it("JsonReporter output matches golden JSON file", () => {
    const reporter = new JsonReporter();
    const output = reporter.report(goldenFindings);
    const golden = loadGolden("expected-output.json");
    expect(JSON.parse(output)).toEqual(JSON.parse(golden));
  });

  it("SarifReporter output matches golden SARIF file", () => {
    const reporter = new SarifReporter();
    const output = reporter.report(goldenFindings);
    const golden = loadGolden("expected-output.sarif.json");
    expect(JSON.parse(output)).toEqual(JSON.parse(golden));
  });
});