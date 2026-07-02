import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const PROVIDER_SDK_IMPORT =
  /from\s+["'](?:openai|@anthropic-ai\/sdk|@google\/generative-ai|cohere-ai)["']/u;

describe("Model provider boundaries", () => {
  it("keeps agents and the Core Brain free of provider SDK imports", async () => {
    const agentDirectory = new URL("../../src/agents/", import.meta.url);
    const agentEntries = await readdir(agentDirectory, {
      recursive: true,
    });
    const agentFiles = agentEntries
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => new URL(entry, agentDirectory));
    const files = [
      ...agentFiles,
      new URL("../../src/core/core-brain.ts", import.meta.url),
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source).not.toMatch(PROVIDER_SDK_IMPORT);
    }
  });

  it("does not add a provider SDK dependency", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly devDependencies?: Readonly<Record<string, string>>;
    };
    const dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };

    expect(Object.keys(dependencies)).not.toEqual(
      expect.arrayContaining([
        "openai",
        "@anthropic-ai/sdk",
        "@google/generative-ai",
        "cohere-ai",
      ]),
    );
  });
});
