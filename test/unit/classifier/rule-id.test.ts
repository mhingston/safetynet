import { describe, it, expect } from "vitest";
import { NerLabel } from "../../../src/classifier/types.js";
import { deriveRuleId, deriveTags } from "../../../src/classifier/rule-id.js";

describe("deriveRuleId", () => {
  it("maps B-CREDENTIAL-AWS", () => {
    expect(deriveRuleId(NerLabel.B_CREDENTIAL_AWS)).toBe("credential-aws");
  });

  it("maps I-CREDENTIAL-AWS", () => {
    expect(deriveRuleId(NerLabel.I_CREDENTIAL_AWS)).toBe("credential-aws");
  });

  it("maps B-CREDENTIAL-API-KEY", () => {
    expect(deriveRuleId(NerLabel.B_CREDENTIAL_API_KEY)).toBe("credential-api-key");
  });

  it("maps I-CREDENTIAL-API-KEY", () => {
    expect(deriveRuleId(NerLabel.I_CREDENTIAL_API_KEY)).toBe("credential-api-key");
  });

  it("maps B-CREDENTIAL-TOKEN", () => {
    expect(deriveRuleId(NerLabel.B_CREDENTIAL_TOKEN)).toBe("credential-token");
  });

  it("maps I-CREDENTIAL-TOKEN", () => {
    expect(deriveRuleId(NerLabel.I_CREDENTIAL_TOKEN)).toBe("credential-token");
  });

  it("maps B-CREDENTIAL-PASSWORD", () => {
    expect(deriveRuleId(NerLabel.B_CREDENTIAL_PASSWORD)).toBe("credential-password");
  });

  it("maps I-CREDENTIAL-PASSWORD", () => {
    expect(deriveRuleId(NerLabel.I_CREDENTIAL_PASSWORD)).toBe("credential-password");
  });

  it("maps B-CREDENTIAL-CONNECTION-STRING", () => {
    expect(deriveRuleId(NerLabel.B_CREDENTIAL_CONNECTION_STRING)).toBe("credential-connection-string");
  });

  it("maps I-CREDENTIAL-CONNECTION-STRING", () => {
    expect(deriveRuleId(NerLabel.I_CREDENTIAL_CONNECTION_STRING)).toBe("credential-connection-string");
  });

  it("maps B-CREDENTIAL-PRIVATE-KEY", () => {
    expect(deriveRuleId(NerLabel.B_CREDENTIAL_PRIVATE_KEY)).toBe("credential-private-key");
  });

  it("maps I-CREDENTIAL-PRIVATE-KEY", () => {
    expect(deriveRuleId(NerLabel.I_CREDENTIAL_PRIVATE_KEY)).toBe("credential-private-key");
  });

  it("maps B-CREDENTIAL-GENERIC", () => {
    expect(deriveRuleId(NerLabel.B_CREDENTIAL_GENERIC)).toBe("credential-generic");
  });

  it("maps I-CREDENTIAL-GENERIC", () => {
    expect(deriveRuleId(NerLabel.I_CREDENTIAL_GENERIC)).toBe("credential-generic");
  });

  it("maps bare B-CREDENTIAL to credential-generic", () => {
    expect(deriveRuleId(NerLabel.B_CREDENTIAL)).toBe("credential-generic");
  });

  it("maps bare I-CREDENTIAL to credential-generic", () => {
    expect(deriveRuleId(NerLabel.I_CREDENTIAL)).toBe("credential-generic");
  });

  it("maps B-INJECTION", () => {
    expect(deriveRuleId(NerLabel.B_INJECTION)).toBe("injection");
  });

  it("maps I-INJECTION", () => {
    expect(deriveRuleId(NerLabel.I_INJECTION)).toBe("injection");
  });

  it("maps B-ESCALATION", () => {
    expect(deriveRuleId(NerLabel.B_ESCALATION)).toBe("escalation");
  });

  it("maps I-ESCALATION", () => {
    expect(deriveRuleId(NerLabel.I_ESCALATION)).toBe("escalation");
  });

  it("maps O to empty string", () => {
    expect(deriveRuleId(NerLabel.O)).toBe("");
  });
});

describe("deriveTags", () => {
  it("maps B-CREDENTIAL-AWS", () => {
    expect(deriveTags(NerLabel.B_CREDENTIAL_AWS)).toEqual(["credential", "aws"]);
  });

  it("maps I-CREDENTIAL-AWS", () => {
    expect(deriveTags(NerLabel.I_CREDENTIAL_AWS)).toEqual(["credential", "aws"]);
  });

  it("maps B-CREDENTIAL-API-KEY keeping sub-type as one tag", () => {
    expect(deriveTags(NerLabel.B_CREDENTIAL_API_KEY)).toEqual(["credential", "api-key"]);
  });

  it("maps I-CREDENTIAL-API-KEY keeping sub-type as one tag", () => {
    expect(deriveTags(NerLabel.I_CREDENTIAL_API_KEY)).toEqual(["credential", "api-key"]);
  });

  it("maps B-CREDENTIAL-CONNECTION-STRING keeping sub-type as one tag", () => {
    expect(deriveTags(NerLabel.B_CREDENTIAL_CONNECTION_STRING)).toEqual(["credential", "connection-string"]);
  });

  it("maps I-CREDENTIAL-CONNECTION-STRING keeping sub-type as one tag", () => {
    expect(deriveTags(NerLabel.I_CREDENTIAL_CONNECTION_STRING)).toEqual(["credential", "connection-string"]);
  });

  it("maps B-CREDENTIAL-PRIVATE-KEY keeping sub-type as one tag", () => {
    expect(deriveTags(NerLabel.B_CREDENTIAL_PRIVATE_KEY)).toEqual(["credential", "private-key"]);
  });

  it("maps I-CREDENTIAL-PRIVATE-KEY keeping sub-type as one tag", () => {
    expect(deriveTags(NerLabel.I_CREDENTIAL_PRIVATE_KEY)).toEqual(["credential", "private-key"]);
  });

  it("maps B-CREDENTIAL-GENERIC", () => {
    expect(deriveTags(NerLabel.B_CREDENTIAL_GENERIC)).toEqual(["credential", "generic"]);
  });

  it("maps I-CREDENTIAL-GENERIC", () => {
    expect(deriveTags(NerLabel.I_CREDENTIAL_GENERIC)).toEqual(["credential", "generic"]);
  });

  it("maps bare B-CREDENTIAL to credential generic", () => {
    expect(deriveTags(NerLabel.B_CREDENTIAL)).toEqual(["credential", "generic"]);
  });

  it("maps bare I-CREDENTIAL to credential generic", () => {
    expect(deriveTags(NerLabel.I_CREDENTIAL)).toEqual(["credential", "generic"]);
  });

  it("maps B-CREDENTIAL-TOKEN", () => {
    expect(deriveTags(NerLabel.B_CREDENTIAL_TOKEN)).toEqual(["credential", "token"]);
  });

  it("maps B-CREDENTIAL-PASSWORD", () => {
    expect(deriveTags(NerLabel.B_CREDENTIAL_PASSWORD)).toEqual(["credential", "password"]);
  });

  it("maps B-INJECTION", () => {
    expect(deriveTags(NerLabel.B_INJECTION)).toEqual(["injection"]);
  });

  it("maps I-INJECTION", () => {
    expect(deriveTags(NerLabel.I_INJECTION)).toEqual(["injection"]);
  });

  it("maps B-ESCALATION", () => {
    expect(deriveTags(NerLabel.B_ESCALATION)).toEqual(["escalation"]);
  });

  it("maps I-ESCALATION", () => {
    expect(deriveTags(NerLabel.I_ESCALATION)).toEqual(["escalation"]);
  });

  it("maps O to empty array", () => {
    expect(deriveTags(NerLabel.O)).toEqual([]);
  });
});