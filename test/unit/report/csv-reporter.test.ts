import { describe, it, expect } from "vitest";
import { CsvReporter } from "../../../src/report/csv-reporter.js";
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

describe("CsvReporter", () => {
  it("produces header row with correct columns", () => {
    const reporter = new CsvReporter();
    const output = reporter.report(sampleFindings);
    const lines = output.split("\n");
    expect(lines[0]).toBe(
      "file,ruleId,startLine,endLine,match,secret,commit,fingerprint"
    );
  });

  it("produces one data row per finding", () => {
    const reporter = new CsvReporter();
    const output = reporter.report(sampleFindings);
    const lines = output.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
  });

  it("includes correct data in rows", () => {
    const reporter = new CsvReporter();
    const output = reporter.report(sampleFindings);
    const lines = output.split("\n");
    const row = lines[1].split(",");
    expect(row[0]).toBe("src/config.ts");
    expect(row[1]).toBe("credential-aws");
    expect(row[2]).toBe("5");
    expect(row[3]).toBe("5");
    expect(row[6]).toBe("abc123");
    expect(row[7]).toBe("abc123:src/config.ts:credential-aws:5");
  });

  it("escapes fields containing commas or quotes", () => {
    const findingWithComma: Finding = {
      ruleId: "credential-aws",
      description: "AWS key detected",
      startLine: 5,
      endLine: 5,
      startColumn: 0,
      endColumn: 20,
      match: 'value, with "quotes"',
      secret: 'value, with "quotes"',
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
    };
    const reporter = new CsvReporter();
    const output = reporter.report([findingWithComma]);
    const lines = output.split("\n");
    const row = lines[1];
    expect(row).toContain('"value, with ""quotes"""');
  });

  it("produces only header for no findings", () => {
    const reporter = new CsvReporter();
    const output = reporter.report([]);
    const lines = output.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "file,ruleId,startLine,endLine,match,secret,commit,fingerprint"
    );
  });
});