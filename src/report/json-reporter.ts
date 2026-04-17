import type { Finding } from "../findings/finding.js";
import type { Reporter } from "./reporter-factory.js";

export class JsonReporter implements Reporter {
  report(findings: Finding[]): string {
    return JSON.stringify(findings, null, 2);
  }
}