import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);

describe("rendered launchd ProgramArguments", () => {
  it("matches every production CLI parser including Telegram --config", async () => {
    const root = await mkdtemp(join(tmpdir(), "mv-ai-os-launchd-argv-"));
    try {
      const home = join(root, "home");
      const logDirectory = join(root, "logs & <runtime> > archive");
      const backupDirectory = join(root, "backups & <verified> > retained");
      const configPath = join(root, "config & <owner> > local.json");
      const repository = join(root, "repo & <onlyway> > desktop");
      const sourceRepository = resolve(import.meta.dirname, "../..");
      const node = process.execPath;
      await mkdir(join(repository, "ops"), { recursive: true });
      await cp(join(sourceRepository, "ops", "launchd"), join(repository, "ops", "launchd"), { recursive: true });
      await writeFile(configPath, '{"marker":"config-content-must-not-be-rendered"}', { encoding: "utf8", mode: 0o600 });
      await execFile("/bin/sh", [
        join(sourceRepository, "scripts", "onlyway-local-supervisor.sh"),
        "render",
        "--repo", repository,
        "--node", node,
        "--config", configPath,
        "--log-dir", logDirectory,
        "--backup-dir", backupDirectory,
      ], { env: { ...process.env, HOME: home } });

      const expected = new Map<string, readonly string[]>([
        ["api", [node, join(repository, "dist", "command-center", "command-center-cli.js"), "--config", configPath]],
        ["backup-verifier", [node, join(repository, "dist", "operations-runtime", "operations-runtime-cli.js"), "--config", configPath, "--role", "backup-verifier", "--backup-directory", backupDirectory]],
        ["health-monitor", [node, join(repository, "dist", "operations-runtime", "operations-runtime-cli.js"), "--config", configPath, "--role", "health-monitor"]],
        ["scheduler", [node, join(repository, "dist", "operations-runtime", "operations-runtime-cli.js"), "--config", configPath, "--role", "scheduler"]],
        ["telegram", [node, join(repository, "dist", "telegram", "telegram-cli.js"), "--config", configPath]],
        ["worker", [node, join(repository, "dist", "operations-runtime", "operations-runtime-cli.js"), "--config", configPath, "--role", "worker", "--backup-directory", backupDirectory]],
      ]);
      for (const [label, arguments_] of expected) {
        const plist = await readFile(join(home, "Library", "LaunchAgents", `ai.onlyway.mv-ai-os.${label}.plist`), "utf8");
        expect(plist, label).not.toContain("config-content-must-not-be-rendered");
        expect(plist, label).not.toMatch(/<string>[^<]*(?: & | < | > )[^<]*<\/string>/u);
        expect(programArguments(plist), label).toEqual(arguments_);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function programArguments(plist: string): readonly string[] {
  const block = /<key>ProgramArguments<\/key><array>(.*?)<\/array>/su.exec(plist)?.[1];
  if (block === undefined) throw new Error("Rendered plist has no ProgramArguments array");
  return Object.freeze([...block.matchAll(/<string>(.*?)<\/string>/gsu)].map((match) => decodeXml(match[1] ?? "")));
}

function decodeXml(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", "\"").replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}
