import { describe, it, expect, vi, beforeEach } from "vitest";
import { NerLabel } from "../../../src/classifier/types.js";
import type { TokenClassification } from "../../../src/classifier/types.js";

vi.mock("../../../src/classifier/pipeline.js", () => ({
  loadPipeline: vi.fn(),
  classifyFragment: vi.fn(),
}));

import { classifyFragment } from "../../../src/classifier/pipeline.js";
import {
  fragmentOffsetToLineCol,
  spanToFinding,
  deduplicateOverlap,
  classifyChunks,
  classifyGitFragment,
} from "../../../src/scanner/scan-pipeline.js";
import type { FragmentChunk } from "../../../src/scanner/fragment-reader.js";
import { extractSpans } from "../../../src/classifier/span-extractor.js";

const mockClassify = classifyFragment as ReturnType<typeof vi.fn>;

function tok(
  token: string,
  label: NerLabel,
  confidence: number,
  start: number,
  end: number,
): TokenClassification {
  return { token, label, confidence, start, end };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("fragmentOffsetToLineCol", () => {
  it("maps offset 0 to line 1 column 0", () => {
    const lines = ["hello", "world"];
    const text = lines.join("\n");
    expect(fragmentOffsetToLineCol(lines, text, 0)).toEqual({ line: 1, column: 0 });
  });

  it("maps offsets within the second line relative to that line", () => {
    const lines = ["hello", "world"];
    const text = lines.join("\n"); // "hello\nworld", second line starts at 6
    expect(fragmentOffsetToLineCol(lines, text, 6)).toEqual({ line: 2, column: 0 });
    expect(fragmentOffsetToLineCol(lines, text, 8)).toEqual({ line: 2, column: 2 });
  });

  it("handles offsets at the newline boundary", () => {
    const lines = ["ab", "cd"];
    const text = lines.join("\n"); // "ab\ncd"
    expect(fragmentOffsetToLineCol(lines, text, 2)).toEqual({ line: 1, column: 2 });
    expect(fragmentOffsetToLineCol(lines, text, 3)).toEqual({ line: 2, column: 0 });
  });
});

describe("spanToFinding", () => {
  it("reconstructs correct line and column for a secret on line 2", () => {
    const lines = ["prefix line", 'key = "AKIAEXAMPLE"'];
    const text = lines.join("\n");
    const secret = "AKIAEXAMPLE";
    const start = text.indexOf(secret);
    const end = start + secret.length;
    const tokens = [tok("AKIA", NerLabel.B_CREDENTIAL_AWS, 0.95, start, start + 4)];
    // Simulate a two-token span split across a subword boundary.
    const fullTokens = [
      tok("AKIA", NerLabel.B_CREDENTIAL_AWS, 0.95, start, start + 4),
      tok("EXAMPLE", NerLabel.I_CREDENTIAL_AWS, 0.9, start + 4, end),
    ];
    const spans = extractSpans(fullTokens, 10);
    expect(spans).toHaveLength(1);
    const finding = spanToFinding(fullTokens, spans[0], text, lines, 10, {
      file: "a.txt",
    });
    expect(finding).not.toBeNull();
    expect(finding!.startLine).toBe(11);
    expect(finding!.endLine).toBe(11);
    // 'key = "' is 7 chars, so the secret starts at column 7 of line 2.
    expect(finding!.startColumn).toBe(7);
    expect(finding!.endColumn).toBe(7 + secret.length);
    expect(finding!.secret).toBe(secret);
    expect(finding!.ruleId).toBe("credential-aws");
    expect(tokens.length).toBe(1); // silence unused warning
  });

  it("slices source text instead of joining subword tokens", () => {
    const lines = ['token = "abc123"'];
    const text = lines.join("\n");
    const start = text.indexOf("abc123");
    const fullTokens = [
      tok("ab", NerLabel.B_CREDENTIAL_GENERIC, 0.9, start, start + 2),
      tok("##c123", NerLabel.I_CREDENTIAL_GENERIC, 0.9, start + 2, start + 6),
    ];
    const spans = extractSpans(fullTokens, 1);
    const finding = spanToFinding(fullTokens, spans[0], text, lines, 1, {
      file: "a.txt",
    });
    // Must be the exact source slice, never "ab##c123".
    expect(finding!.secret).toBe("abc123");
    expect(finding!.secret).not.toContain("##");
  });

  it("handles multiline private-key spans across lines", () => {
    const lines = [
      "-----BEGIN PRIVATE KEY-----",
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7",
      "-----END PRIVATE KEY-----",
    ];
    const text = lines.join("\n");
    const start = 0;
    const end = text.length;
    const fullTokens = [
      tok("-----BEGIN", NerLabel.B_CREDENTIAL_PRIVATE_KEY, 0.95, start, start + 10),
      tok("rest", NerLabel.I_CREDENTIAL_PRIVATE_KEY, 0.9, start + 10, end),
    ];
    const spans = extractSpans(fullTokens, 5);
    const finding = spanToFinding(fullTokens, spans[0], text, lines, 5, {
      file: "key.pem",
    });
    expect(finding!.startLine).toBe(5);
    expect(finding!.endLine).toBe(7);
    expect(finding!.secret).toBe(text);
  });

  it("handles Unicode/non-English context without misplacing columns", () => {
    const lines = ["// cl\u00e9 secr\u00e8te: mot de passe", 'mdp = "s3cr3t-p\u00e4ss"'];
    const text = lines.join("\n");
    const secret = "s3cr3t-p\u00e4ss";
    const start = text.indexOf(secret);
    const fullTokens = [
      tok(secret, NerLabel.B_CREDENTIAL_PASSWORD, 0.9, start, start + secret.length),
    ];
    const spans = extractSpans(fullTokens, 1);
    const finding = spanToFinding(fullTokens, spans[0], text, lines, 1, {
      file: "a.txt",
    });
    expect(finding!.startLine).toBe(2);
    expect(finding!.secret).toBe(secret);
  });
});

describe("classifyChunks overlap handling", () => {
  it("emits two secrets on one line as two findings", async () => {
    const lines = ['a="AKIAEXAMPLEONE" b="AKIAEXAMPLETWO"'];
    const text = lines.join("\n");
    const s1 = "AKIAEXAMPLEONE";
    const s2 = "AKIAEXAMPLETWO";
    mockClassify.mockImplementation(async () => [
      tok(s1, NerLabel.B_CREDENTIAL_AWS, 0.95, text.indexOf(s1), text.indexOf(s1) + s1.length),
      tok(s2, NerLabel.B_CREDENTIAL_AWS, 0.94, text.indexOf(s2), text.indexOf(s2) + s2.length),
    ]);
    const chunks: FragmentChunk[] = [{ lines, offsetLine: 1 }];
    const findings = await classifyChunks(chunks, { file: "f.txt" });
    expect(findings).toHaveLength(2);
    expect(findings[0].startColumn).not.toBe(findings[1].startColumn);
  });

  it("deduplicates the same span reported by overlapping fragments", async () => {
    const allLines = ["line1", 'key = "AKIAEXAMPLE"', "line3"];
    const text1 = allLines.slice(0, 2).join("\n");
    const secret = "AKIAEXAMPLE";
    // Both chunks contain the secret at the same absolute position.
    mockClassify.mockImplementation(async (fragmentText: string) => {
      const idx = (fragmentText as string).indexOf(secret);
      if (idx === -1) return [];
      return [tok(secret, NerLabel.B_CREDENTIAL_AWS, 0.95, idx, idx + secret.length)];
    });
    void text1;
    const chunkA: FragmentChunk = { lines: allLines.slice(0, 2), offsetLine: 1 };
    const chunkB: FragmentChunk = { lines: allLines.slice(0, 2), offsetLine: 1 };
    const findings = await classifyChunks([chunkA, chunkB], { file: "f.txt" });
    expect(findings).toHaveLength(1);
  });

  it("keeps repeated identical values at different locations", async () => {
    const lines = ['a="SAMESECRET"', 'b="SAMESECRET"'];
    mockClassify.mockImplementation(async (fragmentText: string) => {
      const text = fragmentText as string;
      const out: TokenClassification[] = [];
      let idx = text.indexOf("SAMESECRET");
      while (idx !== -1) {
        out.push(
          tok("SAMESECRET", NerLabel.B_CREDENTIAL_GENERIC, 0.9, idx, idx + 10),
        );
        idx = text.indexOf("SAMESECRET", idx + 1);
      }
      // BIO: second occurrence must restart with B- so it becomes its own span.
      return out;
    });
    const chunks: FragmentChunk[] = [{ lines, offsetLine: 1 }];
    const findings = await classifyChunks(chunks, { file: "f.txt" });
    expect(findings).toHaveLength(2);
    expect(findings[0].startLine).toBe(1);
    expect(findings[1].startLine).toBe(2);
  });

  it("maps secrets near chunk boundaries to absolute lines", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    lines[9] = 'key = "AKIAEXAMPLE"';
    const text = lines.join("\n");
    const idx = text.indexOf("AKIAEXAMPLE");
    mockClassify.mockResolvedValue([
      tok("AKIAEXAMPLE", NerLabel.B_CREDENTIAL_AWS, 0.95, idx, idx + 11),
    ]);
    const chunks: FragmentChunk[] = [{ lines, offsetLine: 101 }];
    const findings = await classifyChunks(chunks, { file: "f.txt" });
    expect(findings).toHaveLength(1);
    expect(findings[0].startLine).toBe(110);
    expect(findings[0].endLine).toBe(110);
  });
});

describe("deduplicateOverlap", () => {
  it("keeps the highest-confidence duplicate", async () => {
    const base = {
      ruleId: "credential-aws",
      description: "",
      startLine: 1,
      endLine: 1,
      startColumn: 5,
      endColumn: 15,
      match: "SECRET",
      secret: "SECRET",
      file: "f.txt",
      commit: "",
      author: "",
      email: "",
      date: "",
      message: "",
      entropy: 0,
      fingerprint: "",
      tags: [],
    };
    const out = deduplicateOverlap([
      { ...base, confidence: 0.7 },
      { ...base, confidence: 0.95 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBeCloseTo(0.95);
  });
});

describe("classifyGitFragment", () => {
  it("produces findings on the fragment's start line", async () => {
    const raw = 'password = "hunter2hunter2"';
    const secret = "hunter2hunter2";
    const idx = raw.indexOf(secret);
    mockClassify.mockResolvedValue([
      tok(secret, NerLabel.B_CREDENTIAL_PASSWORD, 0.9, idx, idx + secret.length),
    ]);
    const findings = await classifyGitFragment(raw, 42, {
      file: "app.txt",
      commit: "abc",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].startLine).toBe(42);
    expect(findings[0].endLine).toBe(42);
    expect(findings[0].secret).toBe(secret);
    expect(findings[0].commit).toBe("abc");
  });
});
