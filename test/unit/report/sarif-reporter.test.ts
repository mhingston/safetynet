import { describe, it, expect } from "vitest";
import { SarifReporter } from "../../../src/report/sarif-reporter.js";
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
];

describe("SarifReporter", () => {
  it("produces valid SARIF 2.1.0 structure", () => {
    const reporter = new SarifReporter();
    const output = reporter.report(sampleFindings);
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.$schema).toBe(
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json"
    );
    expect(parsed.runs).toBeDefined();
    expect(parsed.runs).toHaveLength(1);
  });

  it("includes tool driver with name and version", () => {
    const reporter = new SarifReporter();
    const output = reporter.report(sampleFindings);
    const parsed = JSON.parse(output);
    const driver = parsed.runs[0].tool.driver;
    expect(driver.name).toBe("safetynet");
    expect(driver.version).toBe("0.1.0");
  });

  it("includes rules in the driver", () => {
    const reporter = new SarifReporter();
    const output = reporter.report(sampleFindings);
    const parsed = JSON.parse(output);
    const rules = parsed.runs[0].tool.driver.rules;
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].id).toBe("credential-aws");
  });

  it("maps findings to results with ruleId, message, and location", () => {
    const reporter = new SarifReporter();
    const output = reporter.report(sampleFindings);
    const parsed = JSON.parse(output);
    const results = parsed.runs[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("credential-aws");
    expect(results[0].message.text).toBe("AWS key detected");
    expect(results[0].level).toBe("error");
  });

  it("includes physical location with uri and region", () => {
    const reporter = new SarifReporter();
    const output = reporter.report(sampleFindings);
    const parsed = JSON.parse(output);
    const loc = parsed.runs[0].results[0].locations[0].physicalLocation;
    expect(loc.artifactLocation.uri).toBe("src/config.ts");
    expect(loc.region.startLine).toBe(5);
    expect(loc.region.startColumn).toBe(0);
    expect(loc.region.endColumn).toBe(20);
  });

  it("includes fingerprints and partialFingerprints", () => {
    const reporter = new SarifReporter();
    const output = reporter.report(sampleFindings);
    const parsed = JSON.parse(output);
    const result = parsed.runs[0].results[0];
    expect(result.fingerprints.primaryLocationLineHash).toBe(
      "abc123:src/config.ts:credential-aws:5"
    );
    expect(result.partialFingerprints.commitSha).toBe("abc123");
  });

  it("produces empty results for no findings", () => {
    const reporter = new SarifReporter();
    const output = reporter.report([]);
    const parsed = JSON.parse(output);
    expect(parsed.runs[0].results).toEqual([]);
    expect(parsed.runs[0].tool.driver.rules).toEqual([]);
  });
});