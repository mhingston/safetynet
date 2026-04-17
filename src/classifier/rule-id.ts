import { NerLabel } from "./types.js";

export function deriveRuleId(label: NerLabel): string {
  const str = label as string;
  if (str === NerLabel.O) return "";
  if (str === NerLabel.B_CREDENTIAL || str === NerLabel.I_CREDENTIAL) return "credential-generic";
  if (str.startsWith("B-CREDENTIAL-") || str.startsWith("I-CREDENTIAL-")) {
    const subType = str.split("-").slice(2).join("-").toLowerCase();
    return `credential-${subType}`;
  }
  if (str.startsWith("B-INJECTION") || str.startsWith("I-INJECTION")) return "injection";
  if (str.startsWith("B-ESCALATION") || str.startsWith("I-ESCALATION")) return "escalation";
  return "";
}

export function deriveTags(label: NerLabel): string[] {
  const str = label as string;
  if (str === NerLabel.O) return [];
  if (str === NerLabel.B_CREDENTIAL || str === NerLabel.I_CREDENTIAL) return ["credential", "generic"];
  const tag = deriveRuleId(label);
  if (tag === "") return [];
  const firstHyphen = tag.indexOf("-");
  if (firstHyphen === -1) return [tag];
  return [tag.slice(0, firstHyphen), tag.slice(firstHyphen + 1)];
}