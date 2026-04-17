import { describe, it, expect } from "vitest";
import { NerLabel } from "../../../src/classifier/types.js";
import type { TokenClassification, EntitySpan } from "../../../src/classifier/types.js";
import { extractSpans } from "../../../src/classifier/span-extractor.js";

function t(
  token: string,
  label: NerLabel,
  confidence: number,
  start: number,
  end: number
): TokenClassification {
  return { token, label, confidence, start, end };
}

describe("extractSpans", () => {
  it("returns empty array for O-only tokens", () => {
    const tokens = [
      t("hello", NerLabel.O, 0.99, 0, 5),
      t("world", NerLabel.O, 0.99, 6, 11),
    ];
    expect(extractSpans(tokens, 1)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(extractSpans([], 1)).toEqual([]);
  });

  it("extracts a single B-I span", () => {
    const tokens = [
      t("AKIA", NerLabel.B_CREDENTIAL_AWS, 0.95, 0, 4),
      t("IOSF", NerLabel.I_CREDENTIAL_AWS, 0.90, 4, 8),
    ];
    const spans = extractSpans(tokens, 1);
    expect(spans).toHaveLength(1);
    const s = spans[0];
    expect(s.entityGroup).toBe("CREDENTIAL-AWS");
    expect(s.text).toBe("AKIAIOSF");
    expect(s.startLine).toBe(1);
    expect(s.endLine).toBe(1);
    expect(s.startColumn).toBe(0);
    expect(s.endColumn).toBe(8);
    expect(s.averageConfidence).toBeCloseTo(0.925);
    expect(s.maxConfidence).toBeCloseTo(0.95);
  });

  it("extracts a single B token as a span", () => {
    const tokens = [
      t("AKIA", NerLabel.B_CREDENTIAL_AWS, 0.95, 0, 4),
    ];
    const spans = extractSpans(tokens, 1);
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe("AKIA");
    expect(spans[0].averageConfidence).toBeCloseTo(0.95);
    expect(spans[0].maxConfidence).toBeCloseTo(0.95);
  });

  it("extracts multiple separate spans", () => {
    const tokens = [
      t("AKIA", NerLabel.B_CREDENTIAL_AWS, 0.95, 0, 4),
      t("key1", NerLabel.I_CREDENTIAL_AWS, 0.90, 5, 9),
      t("and", NerLabel.O, 0.99, 10, 13),
      t("password", NerLabel.B_CREDENTIAL_PASSWORD, 0.88, 14, 22),
    ];
    const spans = extractSpans(tokens, 1);
    expect(spans).toHaveLength(2);
    expect(spans[0].entityGroup).toBe("CREDENTIAL-AWS");
    expect(spans[0].text).toBe("AKIAkey1");
    expect(spans[1].entityGroup).toBe("CREDENTIAL-PASSWORD");
    expect(spans[1].text).toBe("password");
  });

  it("treats I- with different entity group as B-", () => {
    const tokens = [
      t("AKIA", NerLabel.B_CREDENTIAL_AWS, 0.95, 0, 4),
      t("pass", NerLabel.I_CREDENTIAL_PASSWORD, 0.88, 5, 9),
    ];
    const spans = extractSpans(tokens, 1);
    expect(spans).toHaveLength(2);
    expect(spans[0].entityGroup).toBe("CREDENTIAL-AWS");
    expect(spans[0].text).toBe("AKIA");
    expect(spans[1].entityGroup).toBe("CREDENTIAL-PASSWORD");
    expect(spans[1].text).toBe("pass");
  });

  it("ends current span when O token encountered after B", () => {
    const tokens = [
      t("secret", NerLabel.B_CREDENTIAL_GENERIC, 0.90, 0, 6),
      t("foo", NerLabel.O, 0.99, 7, 10),
    ];
    const spans = extractSpans(tokens, 1);
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe("secret");
    expect(spans[0].endColumn).toBe(6);
  });

  it("ends current span when B- follows B-", () => {
    const tokens = [
      t("aws", NerLabel.B_CREDENTIAL_AWS, 0.95, 0, 3),
      t("key", NerLabel.B_CREDENTIAL_API_KEY, 0.90, 4, 7),
    ];
    const spans = extractSpans(tokens, 1);
    expect(spans).toHaveLength(2);
    expect(spans[0].entityGroup).toBe("CREDENTIAL-AWS");
    expect(spans[1].entityGroup).toBe("CREDENTIAL-API-KEY");
  });

  it("handles mixed types: B-injection followed by I-injection then O", () => {
    const tokens = [
      t("DROP", NerLabel.B_INJECTION, 0.92, 0, 4),
      t("TABLE", NerLabel.I_INJECTION, 0.87, 5, 10),
      t("x", NerLabel.O, 0.99, 11, 12),
    ];
    const spans = extractSpans(tokens, 5);
    expect(spans).toHaveLength(1);
    expect(spans[0].entityGroup).toBe("INJECTION");
    expect(spans[0].text).toBe("DROPTABLE");
    expect(spans[0].startLine).toBe(5);
    expect(spans[0].endLine).toBe(5);
    expect(spans[0].maxConfidence).toBeCloseTo(0.92);
  });

  it("handles I- at start of sequence as B-", () => {
    const tokens = [
      t("TOKEN", NerLabel.I_CREDENTIAL_TOKEN, 0.91, 0, 5),
    ];
    const spans = extractSpans(tokens, 1);
    expect(spans).toHaveLength(1);
    expect(spans[0].entityGroup).toBe("CREDENTIAL-TOKEN");
    expect(spans[0].text).toBe("TOKEN");
  });
});