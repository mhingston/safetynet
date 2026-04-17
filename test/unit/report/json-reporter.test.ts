import { describe, it, expect } from "vitest";
import { JsonReporter } from "../../../src/report/json-reporter.js";
import type { Finding } from "../../../src/findings/finding.js";

const sampleFindings: Finding[] = [
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

describe("JsonReporter", () => {
  it("produces a JSON array of Finding objects", () => {
    const reporter = new JsonReporter();
    const output = reporter.report(sampleFindings);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].ruleId).toBe("credential-aws");
    expect(parsed[1].ruleId).toBe("credential-github");
  });

  it("preserves all Finding fields", () => {
    const reporter = new JsonReporter();
    const output = reporter.report(sampleFindings);
    const parsed = JSON.parse(output);
    const first = parsed[0];
    expect(first.fingerprint).toBe("abc123:src/config.ts:credential-aws:5");
    expect(first.file).toBe("src/config.ts");
    expect(first.startLine).toBe(5);
    expect(first.match).toBe("AKIAIOSFODNN7EXAMPLE");
    expect(first.secret).toBe("AKIAIOSFODNN7EXAMPLE");
    expect(first.commit).toBe("abc123");
    expect(first.entropy).toBe(3.5);
    expect(first.tags).toEqual(["key"]);
    expect(first.confidence).toBe(0.9);
  });

  it("returns empty array for no findings", () => {
    const reporter = new JsonReporter();
    const output = reporter.report([]);
    const parsed = JSON.parse(output);
    expect(parsed).toEqual([]);
  });

  it("outputs pretty-printed JSON", () => {
    const reporter = new JsonReporter();
    const output = reporter.report(sampleFindings);
    expect(output).toContain("\n");
  });
});