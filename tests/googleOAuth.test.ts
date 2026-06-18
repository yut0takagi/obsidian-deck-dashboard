import { describe, it, expect } from "vitest";
import { REQUIRED_SCOPES, hasScope } from "../src/auth/googleOAuth";

describe("Gmail scope", () => {
  it("REQUIRED_SCOPES に gmail.modify を含む", () => {
    expect(REQUIRED_SCOPES).toContain(
      "https://www.googleapis.com/auth/gmail.modify"
    );
  });

  it("hasScope は付与済みスコープを検知する", () => {
    const tokens = {
      access_token: "a",
      refresh_token: "r",
      expires_at: 0,
      scope:
        "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.modify",
    };
    expect(hasScope(tokens, "https://www.googleapis.com/auth/gmail.modify")).toBe(true);
    expect(hasScope(tokens, "https://www.googleapis.com/auth/spreadsheets")).toBe(false);
    expect(hasScope(null, "https://www.googleapis.com/auth/gmail.modify")).toBe(false);
  });
});
