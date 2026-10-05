import { classifyFragment } from "../classifier/pipeline.js";
import { extractSpans } from "../classifier/span-extractor.js";
import { deriveRuleId, deriveTags } from "../classifier/rule-id.js";
import type { Finding } from "../findings/finding.js";
import type { FragmentChunk } from "./fragment-reader.js";

export interface FragmentFindingContext {
  file: string;
  commit?: string;
  author?: string;
  email?: string;
  date?: string;
  message?: string;
}

/**
 * Map a character offset within `fragmentText` (lines joined by '\n') to a
 * 1-based line number relative to the fragment and a 0-based column offset
 * within that line.
 *
 * Columns are 0-based character offsets within the line to match the existing
 * Finding convention used across reporters and tests.
 */
export function fragmentOffsetToLineCol(
  lines: string[],
  fragmentText: string,
  offset: number,
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, fragmentText.length));
  // Walk line start offsets. lines.join('\n') puts '\n' between lines.
  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = lineStart + lines[i].length;
    // Offset inside this line, or at the newline boundary (belongs to this line end).
    if (clamped <= lineEnd || i === lines.length - 1) {
      return { line: i + 1, column: clamped - lineStart };
    }
    lineStart = lineEnd + 1; // skip '\n'
  }
  const last = lines.length;
  return { line: last, column: lines[last - 1]?.length ?? 0 };
}

/**
 * Convert one extracted BIO span into a Finding with correct absolute file
 * positions. Token offsets are character offsets within `fragmentText`; they
 * are mapped back to absolute (line, column) using the fragment's offsetLine.
 *
 * The secret text is sliced from the fragment source so subword tokenization
 * artifacts (##, Ġ) can never leak into the reported secret.
 */
export function spanToFinding(
  spanTokens: { start: number; end: number; label: unknown; confidence: number }[],
  span: { text: string; maxConfidence: number; tokens: { label: unknown }[] },
  fragmentText: string,
  fragmentLines: string[],
  fragmentOffsetLine: number,
  ctx: FragmentFindingContext,
): Finding | null {
  if (spanTokens.length === 0) return null;
  const spanStart = spanTokens[0].start;
  const spanEnd = spanTokens[spanTokens.length - 1].end;
  if (!(spanStart < spanEnd)) return null;
  if (spanStart < 0 || spanEnd > fragmentText.length) return null;

  const start = fragmentOffsetToLineCol(fragmentLines, fragmentText, spanStart);
  const end = fragmentOffsetToLineCol(fragmentLines, fragmentText, spanEnd);
  const absoluteStartLine = fragmentOffsetLine + start.line - 1;
  const absoluteEndLine = fragmentOffsetLine + end.line - 1;

  const secret = fragmentText.slice(spanStart, spanEnd);
  if (!secret) return null;

  const firstLabel = span.tokens[0]?.label as Parameters<typeof deriveRuleId>[0];
  const ruleId = deriveRuleId(firstLabel);
  const tags = deriveTags(firstLabel);

  return {
    ruleId,
    description: `${String(firstLabel)} detected`,
    startLine: absoluteStartLine,
    endLine: absoluteEndLine,
    startColumn: start.column,
    endColumn: end.column,
    match: secret,
    secret,
    file: ctx.file,
    commit: ctx.commit ?? "",
    author: ctx.author ?? "",
    email: ctx.email ?? "",
    date: ctx.date ?? "",
    message: ctx.message ?? "",
    entropy: 0,
    fingerprint: "",
    tags,
    confidence: span.maxConfidence,
  };
}

/** Dedup key for overlapping windows: same file, same span, same secret. */
export function overlapKey(f: Finding): string {
  return [
    f.file,
    f.commit,
    f.ruleId,
    f.startLine,
    f.startColumn,
    f.endLine,
    f.endColumn,
    f.secret,
  ].join("\u0000");
}

/**
 * Remove duplicate findings produced by overlapping fragments. When the same
 * span is reported twice with different confidences, keep the highest.
 * Repeated identical secret values at *different* locations have different
 * keys and are preserved.
 */
export function deduplicateOverlap(findings: Finding[]): Finding[] {
  const best = new Map<string, Finding>();
  for (const f of findings) {
    const key = overlapKey(f);
    const existing = best.get(key);
    if (!existing || f.confidence > existing.confidence) {
      best.set(key, f);
    }
  }
  return [...best.values()];
}

/**
 * Classify one line-based fragment chunk and return span-level findings with
 * correct absolute positions.
 */
export async function classifyChunk(
  chunk: FragmentChunk,
  ctx: FragmentFindingContext,
): Promise<Finding[]> {
  const fragmentText = chunk.lines.join("\n");
  if (!fragmentText.trim()) return [];
  const tokens = await classifyFragment(fragmentText);
  const spans = extractSpans(tokens, chunk.offsetLine);
  const findings: Finding[] = [];
  for (const span of spans) {
    const finding = spanToFinding(
      span.tokens,
      span,
      fragmentText,
      chunk.lines,
      chunk.offsetLine,
      ctx,
    );
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Classify many chunks (e.g. all chunks of one file) and deduplicate
 * overlapping-window duplicates.
 */
export async function classifyChunks(
  chunks: FragmentChunk[],
  ctx: FragmentFindingContext,
): Promise<Finding[]> {
  const all: Finding[] = [];
  for (const chunk of chunks) {
    const findings = await classifyChunk(chunk, ctx);
    all.push(...findings);
  }
  return deduplicateOverlap(all);
}

/**
 * Classify a single-line git-diff fragment. Offsets are already relative to
 * the single line, so the absolute line is the fragment's startLine.
 */
export async function classifyGitFragment(
  raw: string,
  startLine: number,
  ctx: FragmentFindingContext,
): Promise<Finding[]> {
  if (!raw.trim()) return [];
  const tokens = await classifyFragment(raw);
  const spans = extractSpans(tokens, startLine);
  const findings: Finding[] = [];
  for (const span of spans) {
    const spanStart = span.tokens[0]?.start ?? 0;
    const spanEnd = span.tokens[span.tokens.length - 1]?.end ?? 0;
    if (!(spanStart < spanEnd)) continue;
    const secret = raw.slice(spanStart, spanEnd);
    if (!secret) continue;
    const firstLabel = span.tokens[0]?.label as Parameters<typeof deriveRuleId>[0];
    findings.push({
      ruleId: deriveRuleId(firstLabel),
      description: `${String(firstLabel)} detected`,
      startLine,
      endLine: startLine,
      startColumn: spanStart,
      endColumn: spanEnd,
      match: secret,
      secret,
      file: ctx.file,
      commit: ctx.commit ?? "",
      author: ctx.author ?? "",
      email: ctx.email ?? "",
      date: ctx.date ?? "",
      message: ctx.message ?? "",
      entropy: 0,
      fingerprint: "",
      tags: deriveTags(firstLabel),
      confidence: span.maxConfidence,
    });
  }
  return deduplicateOverlap(findings);
}
