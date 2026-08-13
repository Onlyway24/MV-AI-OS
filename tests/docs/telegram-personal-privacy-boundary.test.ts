import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Telegram personal privacy boundary", () => {
  it("records the mandatory personal-account and data-minimization prohibitions", async () => {
    const document = await readFile(resolve("docs/TELEGRAM_PERSONAL_PRIVACY_BOUNDARY.md"), "utf8");
    for (const required of ["standard Telegram Bot API", "MTProto", "TDLib", "userbots", "Telegram Business", "Saved Messages", "chat enumeration", "social graphs", "getFile", "Raw Update persistence", "transcripts", "raw text logging", "non-allowlisted chat", "default-deny"]) expect(document).toContain(required);
    expect(document).toMatch(/explicitly\s+selects and confirms/iu);
  });
});
