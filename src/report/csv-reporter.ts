import type { Finding } from "../findings/finding.js";
import type { Reporter } from "./reporter-factory.js";

const HEADERS = "file,ruleId,startLine,endLine,match,secret,commit,fingerprint";

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export class CsvReporter implements Reporter {
  report(findings: Finding[]): string {
    const rows = [HEADERS];
    for (const f of findings) {
      const row = [
        escapeCsvField(f.file),
        escapeCsvField(f.ruleId),
        String(f.startLine),
        String(f.endLine),
        escapeCsvField(f.match),
        escapeCsvField(f.secret),
        escapeCsvField(f.commit),
        escapeCsvField(f.fingerprint),
      ];
      rows.push(row.join(","));
    }
    return rows.join("\n");
  }
}