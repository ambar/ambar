#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderCodexStatsCard } from "../src/codex-profile-card.mjs";
import { createMockCodexProfileData } from "./mock-card-data.mjs";

export const MOCK_CARD_OUTPUT_DIR = "test-output";
export const TEST_AVATAR_URL = "https://avatars.githubusercontent.com/u/105919?v=4";

export async function generateMockCards({
  outputDir = MOCK_CARD_OUTPUT_DIR,
} = {}) {
  const data = createMockCodexProfileData();
  const absoluteOutputDir = path.resolve(outputDir);
  const variants = [
    {
      file: "codex-mock-identity-all.svg",
      options: {
        name: "Mock Codex User",
        handle: "@mockcodexuser",
        initials: "MC",
        identityFields: ["name", "handle", "avatar"],
        data,
      },
    },
    {
      file: "codex-mock-identity-handle.svg",
      options: {
        name: "Mock Codex User",
        handle: "@mockcodexuser",
        initials: "MC",
        identityFields: ["handle"],
        data,
      },
    },
    {
      file: "codex-mock-identity-none.svg",
      options: {
        name: "Mock Codex User",
        initials: "MC",
        identityFields: [],
        data,
      },
    },
    {
      file: "codex-mock-identity-avatar-url.svg",
      options: {
        name: "Mock Codex User",
        initials: "MC",
        avatarUrl: TEST_AVATAR_URL,
        identityFields: ["avatar"],
        data,
      },
    },
  ];

  await mkdir(absoluteOutputDir, { recursive: true });

  const generated = [];
  for (const variant of variants) {
    const outputPath = path.join(absoluteOutputDir, variant.file);
    await writeFile(outputPath, renderCodexStatsCard(variant.options), "utf8");
    generated.push(outputPath);
  }

  return generated;
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const generated = await generateMockCards();
  for (const file of generated) console.log(file);
}
