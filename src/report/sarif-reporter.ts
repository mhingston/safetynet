import type { Finding } from "../findings/finding.js";
import type { Reporter } from "./reporter-factory.js";

export class SarifReporter implements Reporter {
  report(findings: Finding[]): string {
    const uniqueRules = [...new Set(findings.map((f) => f.ruleId))];
    const rules = uniqueRules.map((id) => ({ id }));

    const results = findings.map((f) => ({
      ruleId: f.ruleId,
      message: { text: f.description },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: f.file },
            region: {
              startLine: f.startLine,
              endLine: f.endLine,
              startColumn: f.startColumn,
              endColumn: f.endColumn,
            },
          },
        },
      ],
      fingerprints: { primaryLocationLineHash: f.fingerprint },
      level: "error",
      partialFingerprints: { commitSha: f.commit },
    }));

    const sarif = {
      $schema:
        "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "safetynet",
              version: "0.1.0",
              rules,
            },
          },
          results,
        },
      ],
    };

    return JSON.stringify(sarif, null, 2);
  }
}