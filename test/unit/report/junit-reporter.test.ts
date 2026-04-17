import { describe, it, expect } from "vitest";
import { JunitReporter } from "../../../src/report/junit-reporter.js";
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

describe("JunitReporter", () => {
  it("produces valid XML with xml declaration", () => {
    const reporter = new JunitReporter();
    const output = reporter.report(sampleFindings);
    expect(output).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it("produces testsuite element with correct attributes", () => {
    const reporter = new JunitReporter();
    const output = reporter.report(sampleFindings);
    expect(output).toContain('<testsuite name="safetynet"');
    expect(output).toContain('tests="2"');
    expect(output).toContain('failures="2"');
    expect(output).toContain('errors="0"');
  });

  it("produces one testcase per finding", () => {
    const reporter = new JunitReporter();
    const output = reporter.report(sampleFindings);
    const testcaseMatches = output.match(/<testcase /g);
    expect(testcaseMatches).toHaveLength(2);
  });

  it("includes correct classname and name in testcase", () => {
    const reporter = new JunitReporter();
    const output = reporter.report(sampleFindings);
    expect(output).toContain('classname="credential-aws"');
    expect(output).toContain('name="src/config.ts:5"');
  });

  it("includes failure element with message and type", () => {
    const reporter = new JunitReporter();
    const output = reporter.report(sampleFindings);
    expect(output).toContain('<failure message="AWS key detected"');
    expect(output).toContain('type="credential-aws"');
  });

  it("includes finding details in failure text content", () => {
    const reporter = new JunitReporter();
    const output = reporter.report(sampleFindings);
    expect(output).toContain("file: src/config.ts, line: 5, match: AKIAIOSFODNN7EXAMPLE");
  });

  it("handles no findings", () => {
    const reporter = new JunitReporter();
    const output = reporter.report([]);
    expect(output).toContain('tests="0"');
    expect(output).toContain('failures="0"');
  });

  it("escapes XML special characters", () => {
    const specialFinding: Finding = {
      ruleId: "credential-aws",
      description: 'Found <secret> & "key"',
      startLine: 5,
      endLine: 5,
      startColumn: 0,
      endColumn: 20,
      match: 'value<with>&"special\'chars',
      secret: 'value<with>&"special\'chars',
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
    const reporter = new JunitReporter();
    const output = reporter.report([specialFinding]);
    expect(output).toContain("&lt;secret&gt;");
    expect(output).toContain("&amp;");
    expect(output).toContain("&quot;");
  });
});