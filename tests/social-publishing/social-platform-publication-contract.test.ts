import { describe, expect, it } from "vitest";

import {
  FakeSocialPlatformPublicationTransport,
  browserCheckpointFor,
  connectionRequirementsFor,
} from "../../src/index.js";

describe("Social publication browser checkpoints", () => {
  it("keeps TikTok and Instagram disconnected, unpublished, and free of invented identifiers", async () => {
    for (const platform of ["instagram", "tiktok"] as const) {
      const transport = new FakeSocialPlatformPublicationTransport(platform);
      await expect(transport.requestBrowserCheckpoint()).resolves.toMatchObject({
        externalEffectOccurred: false,
        platform,
        publicationAllowed: false,
        status: "BROWSER_CONNECTION_REQUIRED",
      });
      expect(transport.calls).toEqual([platform]);
      expect(JSON.stringify(browserCheckpointFor(platform))).not.toMatch(
        /(?:client_secret|token|account_id|app_id)/iu,
      );
      expect(connectionRequirementsFor(platform)).toMatchObject({
        platform,
        readiness: "BROWSER_CONNECTION_REQUIRED",
      });
      expect(connectionRequirementsFor(platform).documentationUrls).toHaveLength(2);
    }
  });
});
