import { describe, it, expect } from "vitest";
import { createReporter } from "../../../src/report/reporter-factory.js";
import { JsonReporter } from "../../../src/report/json-reporter.js";
import { SarifReporter } from "../../../src/report/sarif-reporter.js";
import { CsvReporter } from "../../../src/report/csv-reporter.js";
import { JunitReporter } from "../../../src/report/junit-reporter.js";

describe("createReporter", () => {
  it("returns JsonReporter for json format", () => {
    expect(createReporter("json")).toBeInstanceOf(JsonReporter);
  });

  it("returns SarifReporter for sarif format", () => {
    expect(createReporter("sarif")).toBeInstanceOf(SarifReporter);
  });

  it("returns CsvReporter for csv format", () => {
    expect(createReporter("csv")).toBeInstanceOf(CsvReporter);
  });

  it("returns JunitReporter for junit format", () => {
    expect(createReporter("junit")).toBeInstanceOf(JunitReporter);
  });

  it("throws for unknown format", () => {
    expect(() => createReporter("unknown" as never)).toThrow(
      "Unknown report format: unknown"
    );
  });
});