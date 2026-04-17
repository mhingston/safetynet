import type { Finding } from "../findings/finding.js";
import { JsonReporter } from "./json-reporter.js";
import { SarifReporter } from "./sarif-reporter.js";
import { CsvReporter } from "./csv-reporter.js";
import { JunitReporter } from "./junit-reporter.js";

export interface Reporter {
  report(findings: Finding[]): string;
}

export function createReporter(
  format: "json" | "sarif" | "csv" | "junit"
): Reporter {
  switch (format) {
    case "json":
      return new JsonReporter();
    case "sarif":
      return new SarifReporter();
    case "csv":
      return new CsvReporter();
    case "junit":
      return new JunitReporter();
    default:
      throw new Error(`Unknown report format: ${format}`);
  }
}