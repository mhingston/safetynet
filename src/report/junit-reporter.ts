import type { Finding } from "../findings/finding.js";
import type { Reporter } from "./reporter-factory.js";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export class JunitReporter implements Reporter {
  report(findings: Finding[]): string {
    const tests = findings.length;
    const failures = findings.length;
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuite name="safetynet" tests="${tests}" failures="${failures}" errors="0">`,
    ];

    for (const f of findings) {
      lines.push(
        `  <testcase classname="${escapeXml(f.ruleId)}" name="${escapeXml(f.file)}:${f.startLine}" time="0">`
      );
      lines.push(
        `    <failure message="${escapeXml(f.description)}" type="${escapeXml(f.ruleId)}">`
      );
      lines.push(
        `      file: ${escapeXml(f.file)}, line: ${f.startLine}, match: ${escapeXml(f.match)}`
      );
      lines.push("    </failure>");
      lines.push("  </testcase>");
    }

    lines.push("</testsuite>");
    return lines.join("\n");
  }
}