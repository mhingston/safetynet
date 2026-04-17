import type { TokenClassification, EntitySpan } from "./types.js";
import { NerLabel } from "./types.js";

function entityGroupFromLabel(label: NerLabel): string {
  const str = label as string;
  if (str === NerLabel.O) return "";
  return str.replace(/^[BI]-/, "");
}

function labelPrefix(label: NerLabel): string {
  const str = label as string;
  if (str === NerLabel.O) return "O";
  return str.startsWith("B-") ? "B" : "I";
}

export function extractSpans(tokens: TokenClassification[], startLine: number): EntitySpan[] {
  const spans: EntitySpan[] = [];
  let currentGroup = "";
  let currentTokens: TokenClassification[] = [];

  function flush(): void {
    if (currentTokens.length === 0) return;
    const text = currentTokens.map((t) => t.token).join("");
    const confidences = currentTokens.map((t) => t.confidence);
    const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const max = Math.max(...confidences);
    spans.push({
      tokens: currentTokens,
      entityGroup: currentGroup,
      startLine,
      endLine: startLine,
      startColumn: currentTokens[0].start,
      endColumn: currentTokens[currentTokens.length - 1].end,
      text,
      averageConfidence: avg,
      maxConfidence: max,
    });
    currentGroup = "";
    currentTokens = [];
  }

  for (const token of tokens) {
    const prefix = labelPrefix(token.label);
    const group = entityGroupFromLabel(token.label);

    if (prefix === "O") {
      flush();
      continue;
    }

    if (prefix === "B") {
      flush();
      currentGroup = group;
      currentTokens = [token];
      continue;
    }

    if (prefix === "I") {
      if (currentGroup !== "" && currentGroup === group) {
        currentTokens.push(token);
      } else {
        flush();
        currentGroup = group;
        currentTokens = [token];
      }
    }
  }

  flush();
  return spans;
}