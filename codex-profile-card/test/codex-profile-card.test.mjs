import assert from "node:assert/strict";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createMockCodexProfileData } from "../scripts/mock-card-data.mjs";
import * as publicApi from "../src/codex-profile-card.mjs";
import {
  buildAnalyticsCardData,
  buildLocalCardData,
  mergeAnalyticsHistory,
  renderCodexStatsCard,
  runCli,
  summarizeUsageDays,
} from "../src/codex-profile-card.mjs";

const HEATMAP_DAYS = 182;
const TEST_AVATAR_URL = "https://avatars.githubusercontent.com/u/105919?v=4";

test("public API does not export mock data helpers", () => {
  assert.equal(publicApi.createMockCodexProfileData, undefined);
});

test("package metadata exposes TypeScript declarations for the public API", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(packageJson.types, "./src/codex-profile-card.d.ts");
  assert.equal(packageJson.repository, "github:ambar/codex-profile-card");
  assert.deepEqual(packageJson.exports["."], {
    types: "./src/codex-profile-card.d.ts",
    import: "./src/codex-profile-card.mjs",
  });

  const source = await readFile("src/codex-profile-card.mjs", "utf8");
  assert.match(
    source,
    /@typedef \{import\("\.\/codex-profile-card\.d\.ts"\)\.RenderCodexStatsCardOptions\}/,
  );

  const declarations = await readFile("src/codex-profile-card.d.ts", "utf8");
  assert.match(declarations, /export interface RenderCodexStatsCardOptions/);
  assert.match(declarations, /export function renderCodexStatsCard/);
  assert.doesNotMatch(declarations, /createMockCodexProfileData/);
});

test("README embeds the generated example image", async () => {
  const examplePath = "assets/codex-profile-card.svg";
  const readme = await readFile("README.md", "utf8");
  const svg = await readFile(examplePath, "utf8");

  assert.match(
    readme,
    new RegExp(
      `!\\[Codex profile card example\\]\\(https://raw\\.githubusercontent\\.com/ambar/ambar/main/codex-profile-card/${escapeRegExp(examplePath)}\\)`,
    ),
  );
  assert.match(svg, /<svg width="998" height="612" viewBox="0 0 998 612"/);
  assert.match(svg, /<title id="title">.*Codex profile stats<\/title>/);
  assert.match(svg, /data-testid="heatmap"/);
});

test("renderCodexStatsCard matches the reference heatmap card structure", () => {
  const svg = renderCodexStatsCard({
    name: "Ambar Li",
    handle: "@ambarli",
    initials: "AL",
    data: createMockCodexProfileData(),
  });

  assert.match(svg, /<svg width="998" height="612" viewBox="0 0 998 612"/);
  assert.match(svg, /<rect class="card-bg" x="0" y="0" width="998" height="612" rx="64"/);
  assert.match(svg, />AL</);
  assert.match(svg, />Ambar Li</);
  assert.match(svg, />@ambarli</);
  assert.match(svg, />Codex</);
  assert.doesNotMatch(svg, /<image /);
  assert.equal(countMatches(svg, /data-testid="heat-cell"/g), HEATMAP_DAYS);
  assert.match(svg, />lifetime tokens</);
  assert.match(svg, />peak day</);
  assert.match(svg, />current streak</);
  assert.match(svg, />longest streak</);
});

test("renderCodexStatsCard does not derive a handle from the name", () => {
  const svg = renderCodexStatsCard({
    name: "Hidden Name",
    initials: "HN",
    identityFields: ["handle"],
    data: createMockCodexProfileData(),
  });

  assert.match(svg, /<title id="title">Codex profile stats<\/title>/);
  assert.doesNotMatch(svg, />Hidden Name</);
  assert.doesNotMatch(svg, />@hiddenname</);
  assert.doesNotMatch(svg, />HN</);
  assert.doesNotMatch(svg, /<image /);
  assert.doesNotMatch(svg, /<circle cx="116" cy="116" r="52"/);
});

test("renderCodexStatsCard can hide all identity fields without losing derived data internally", () => {
  const svg = renderCodexStatsCard({
    name: "Hidden Name",
    identityFields: [],
    data: createMockCodexProfileData(),
  });

  assert.match(svg, /<title id="title">Codex profile stats<\/title>/);
  assert.doesNotMatch(svg, />Hidden Name</);
  assert.doesNotMatch(svg, />@hiddenname</);
  assert.doesNotMatch(svg, /<image /);
  assert.doesNotMatch(svg, /<circle cx="116" cy="116" r="52"/);
  assert.equal(countMatches(svg, /data-testid="heat-cell"/g), HEATMAP_DAYS);
});

test("renderCodexStatsCard does not inject mock usage when data is omitted", () => {
  const svg = renderCodexStatsCard({
    name: "Codex User",
    handle: "@codex",
    initials: "CU",
  });

  assert.match(svg, />0</);
  assert.match(svg, />0 days</);
  assert.doesNotMatch(svg, />11\.2B</);
  assert.doesNotMatch(svg, />605\.3M</);
  assert.equal(countMatches(svg, /data-level="0"/g), HEATMAP_DAYS);
});

test("createMockCodexProfileData returns explicit reference-style mock data", () => {
  const data = createMockCodexProfileData();

  assert.equal(data.sourceLabel, "Mock Codex usage");
  assert.equal(data.days.length, HEATMAP_DAYS);
  assert.equal(data.lifetimeTokens, 11_200_000_000);
  assert.equal(data.peakDayTokens, 605_300_000);
  assert.equal(data.currentStreak, 32);
  assert.equal(data.longestStreak, 32);
});

test("renderCodexStatsCard maps usage intensity from dark gray to bright blue", () => {
  const days = [
    { date: "2026-06-01", totalTokens: 0 },
    { date: "2026-06-02", totalTokens: 10 },
    { date: "2026-06-03", totalTokens: 40 },
    { date: "2026-06-04", totalTokens: 80 },
    { date: "2026-06-05", totalTokens: 100 },
  ];
  const svg = renderCodexStatsCard({
    name: "Ambar Li",
    handle: "@ambarli",
    initials: "AL",
    data: {
      days,
      ...summarizeUsageDays(days),
    },
  });

  assert.match(svg, /data-level="0"[^>]+fill="#2f2f2f"/);
  assert.match(svg, /data-level="1"[^>]+fill="#21476c"/);
  assert.match(svg, /data-level="2"[^>]+fill="#266aa0"/);
  assert.match(svg, /data-level="3"[^>]+fill="#2d8bd6"/);
  assert.match(svg, /data-level="4"[^>]+fill="#35a8ff"/);
});

test("renderCodexStatsCard fills heatmap days top-to-bottom by column, then left-to-right", () => {
  const days = makeDays("2026-01-01", HEATMAP_DAYS, (index) => index + 1);
  const svg = renderCodexStatsCard({
    name: "Ambar Li",
    handle: "@ambarli",
    initials: "AL",
    data: {
      days,
      ...summarizeUsageDays(days),
    },
  });

  const cells = [...svg.matchAll(/data-testid="heat-cell" data-date="([^"]+)" data-level="[^"]+" x="([^"]+)" y="([^"]+)"/g)]
    .slice(0, 8)
    .map((match) => ({ date: match[1], x: Number(match[2]), y: Number(match[3]) }));

  assert.deepEqual(cells, [
    { date: "2026-01-01", x: 0, y: 0 },
    { date: "2026-01-02", x: 0, y: 34 },
    { date: "2026-01-03", x: 0, y: 68 },
    { date: "2026-01-04", x: 0, y: 102 },
    { date: "2026-01-05", x: 0, y: 136 },
    { date: "2026-01-06", x: 0, y: 170 },
    { date: "2026-01-07", x: 0, y: 204 },
    { date: "2026-01-08", x: 34, y: 0 },
  ]);
});

test("summarizeUsageDays calculates lifetime, peak day, current streak, and longest streak", () => {
  const days = [
    { date: "2026-06-01", totalTokens: 100 },
    { date: "2026-06-02", totalTokens: 200 },
    { date: "2026-06-03", totalTokens: 0 },
    { date: "2026-06-04", totalTokens: 300 },
    { date: "2026-06-05", totalTokens: 400 },
    { date: "2026-06-06", totalTokens: 500 },
  ];

  assert.deepEqual(summarizeUsageDays(days), {
    lifetimeTokens: 1500,
    peakDayTokens: 500,
    currentStreak: 3,
    longestStreak: 3,
  });
});

test("summarizeUsageDays treats missing calendar days as streak breaks", () => {
  const days = [
    { date: "2026-06-01", totalTokens: 100 },
    { date: "2026-06-03", totalTokens: 200 },
  ];

  assert.deepEqual(summarizeUsageDays(days), {
    lifetimeTokens: 300,
    peakDayTokens: 200,
    currentStreak: 1,
    longestStreak: 1,
  });
});

test("summarizeUsageDays can calculate current streak through an explicit date", () => {
  const days = [
    { date: "2026-06-01", totalTokens: 100 },
    { date: "2026-06-02", totalTokens: 200 },
  ];

  assert.deepEqual(summarizeUsageDays(days, { throughDate: "2026-06-04" }), {
    lifetimeTokens: 300,
    peakDayTokens: 200,
    currentStreak: 0,
    longestStreak: 2,
  });
});

test("renderCodexStatsCard keeps metric labels compact with full-height separators", () => {
  const days = makeDays("2026-01-01", HEATMAP_DAYS, (index) => index + 1);
  const svg = renderCodexStatsCard({
    name: "Ambar Li",
    handle: "@ambarli",
    initials: "AL",
    data: {
      days,
      ...summarizeUsageDays(days),
    },
  });

  assert.match(svg, /font-size="28"[^>]+>lifetime tokens</);
  assert.match(svg, /<line class="separator" x1="282" y1="469" x2="282" y2="548" \/>/);
});

test("buildLocalCardData aggregates local Codex logs into lifetime and recent daily usage", async () => {
  const root = await makeTempDir();
  const sessionDir = path.join(root, "sessions", "2026", "06", "18");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(sessionDir, "rollout-test.jsonl"),
    [
      event("session_meta", "2026-06-17T00:00:00.000Z", { id: "session-a" }),
      event("event_msg", "2026-06-17T00:00:01.000Z", tokenPayload(100)),
      event("event_msg", "2026-06-17T00:00:02.000Z", tokenPayload(250)),
      event("event_msg", "2026-06-17T00:00:03.000Z", tokenPayload(250)),
      event("session_meta", "2026-06-18T00:00:00.000Z", { id: "session-b" }),
      event("event_msg", "2026-06-18T00:00:01.000Z", tokenPayload(300)),
      "",
    ].join("\n"),
  );

  const data = await buildLocalCardData({
    codexHome: root,
    now: "2026-06-19T00:00:00.000Z",
    days: HEATMAP_DAYS,
  });

  assert.equal(data.sourceLabel, "Local Codex logs");
  assert.equal(data.lifetimeTokens, 550);
  assert.equal(data.peakDayTokens, 300);
  assert.equal(data.currentStreak, 2);
  assert.equal(data.longestStreak, 2);
  assert.equal(data.days.length, HEATMAP_DAYS);
  assert.deepEqual(
    data.days.filter((day) => day.totalTokens > 0).map((day) => [day.date, day.totalTokens]),
    [
      ["2026-06-17", 250],
      ["2026-06-18", 300],
    ],
  );
});

test("mergeAnalyticsHistory writes cumulative 182-day history for analytics cards", async () => {
  const root = await makeTempDir();
  const historyPath = path.join(root, "codex-analytics-history.json");
  await writeFile(
    historyPath,
    JSON.stringify({
      days: [
        { date: "2026-06-16", totalTokens: 50, turns: 1 },
        { date: "2026-06-17", totalTokens: 75, turns: 2 },
      ],
    }),
  );

  const merged = await mergeAnalyticsHistory({
    historyPath,
    buckets: [
      { date: "2026-06-17", turns: 4, input_tokens: 100, output_tokens: 20 },
      { date: "2026-06-18", turns: 5, input_tokens: 200, output_tokens: 25 },
    ],
    now: "2026-06-19T00:00:00.000Z",
    days: HEATMAP_DAYS,
  });

  assert.deepEqual(
    merged.days.filter((day) => day.totalTokens > 0).map((day) => [day.date, day.totalTokens, day.turns]),
    [
      ["2026-06-16", 50, 1],
      ["2026-06-17", 120, 4],
      ["2026-06-18", 225, 5],
    ],
  );
  assert.equal(JSON.parse(await readFile(historyPath, "utf8")).days.length, HEATMAP_DAYS);
  assert.equal(buildAnalyticsCardData({ buckets: merged.days }).lifetimeTokens, 395);
});

test("buildAnalyticsCardData aggregates duplicate date buckets and can filter a user", () => {
  const data = buildAnalyticsCardData({
    buckets: [
      { date: "2026-06-18", user_email: "a@example.com", input_tokens: 100, output_tokens: 20 },
      { date: "2026-06-18", user_email: "b@example.com", input_tokens: 300, output_tokens: 30 },
      { date: "2026-06-19", user_email: "a@example.com", input_tokens: 200, output_tokens: 40 },
    ],
    analyticsUser: "a@example.com",
    now: "2026-06-19T00:00:00.000Z",
  });

  assert.equal(data.lifetimeTokens, 360);
  assert.deepEqual(
    data.days.filter((day) => day.totalTokens > 0).map((day) => [day.date, day.totalTokens]),
    [
      ["2026-06-18", 120],
      ["2026-06-19", 240],
    ],
  );
});

test("runCli writes its default output to the current directory", async () => {
  const root = await makeTempDir();
  const fixturePath = path.join(root, "analytics-fixture.json");
  const historyPath = path.join(root, "analytics-history.json");
  await writeFile(
    fixturePath,
    JSON.stringify({
      data: [
        {
          date: "2026-06-18",
          input_tokens: 100,
          output_tokens: 20,
        },
      ],
    }),
  );

  const originalCwd = process.cwd();
  const originalLog = console.log;
  const logs = [];
  console.log = (message) => logs.push(String(message));
  try {
    process.chdir(root);
    await runCli([
      "--source",
      "analytics",
      "--fixture",
      fixturePath,
      "--history-path",
      historyPath,
      "--name",
      "No Handle",
      "--now",
      "2026-06-19T00:00:00.000Z",
    ]);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
  }

  const svg = await readFile(path.join(root, "codex-analytics.svg"), "utf8");
  assert.match(svg, />No Handle</);
  assert.doesNotMatch(svg, />@nohandle</);
  await assert.rejects(
    readFile(path.join(root, "profile", "codex-analytics.svg"), "utf8"),
    { code: "ENOENT" },
  );
  assert.deepEqual(logs, ["Wrote codex-analytics.svg"]);
});

test("runCli infers default identity from Codex auth", async () => {
  const root = await makeTempDir();
  const codexHome = path.join(root, "codex-home");
  await writeCodexAuth(codexHome, { name: "Codex Native" });

  const originalCwd = process.cwd();
  const originalLog = console.log;
  console.log = () => {};
  try {
    process.chdir(root);
    await runCli([
      "--output",
      "codex-local.svg",
      "--codex-home",
      codexHome,
      "--now",
      "2026-06-19T00:00:00.000Z",
    ]);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
  }

  const svg = await readFile(path.join(root, "codex-local.svg"), "utf8");
  assert.match(svg, />Codex Native</);
  assert.doesNotMatch(svg, />@codexnative</);
  assert.match(svg, />CN</);
});

test("runCli can render the test avatar URL without showing name or handle", async () => {
  const root = await makeTempDir();
  const fixturePath = path.join(root, "analytics-fixture.json");
  const historyPath = path.join(root, "analytics-history.json");
  await writeFile(fixturePath, JSON.stringify({ data: [] }));

  const originalCwd = process.cwd();
  const originalLog = console.log;
  console.log = () => {};
  try {
    process.chdir(root);
    await runCli([
      "--source",
      "analytics",
      "--fixture",
      fixturePath,
      "--history-path",
      historyPath,
      "--name",
      "Avatar Only",
      "--identity-fields",
      "avatar",
      "--avatar-url",
      TEST_AVATAR_URL,
      "--now",
      "2026-06-19T00:00:00.000Z",
    ]);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
  }

  const svg = await readFile(path.join(root, "codex-analytics.svg"), "utf8");
  assert.match(svg, new RegExp(`<image href="${escapeRegExp(TEST_AVATAR_URL)}"`));
  assert.doesNotMatch(svg, />Avatar Only</);
  assert.doesNotMatch(svg, />@avataronly</);
  assert.doesNotMatch(svg, />AO</);
});

test("runCli treats an empty identity fields value as hiding all identity fields", async () => {
  const root = await makeTempDir();
  const fixturePath = path.join(root, "analytics-fixture.json");
  const historyPath = path.join(root, "analytics-history.json");
  await writeFile(fixturePath, JSON.stringify({ data: [] }));

  const originalCwd = process.cwd();
  const originalLog = console.log;
  console.log = () => {};
  try {
    process.chdir(root);
    await runCli([
      "--source",
      "analytics",
      "--fixture",
      fixturePath,
      "--history-path",
      historyPath,
      "--name",
      "Fully Hidden",
      "--identity-fields",
      "",
      "--now",
      "2026-06-19T00:00:00.000Z",
    ]);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
  }

  const svg = await readFile(path.join(root, "codex-analytics.svg"), "utf8");
  assert.match(svg, /<title id="title">Codex profile stats<\/title>/);
  assert.doesNotMatch(svg, />Fully Hidden</);
  assert.doesNotMatch(svg, />@fullyhidden</);
  assert.doesNotMatch(svg, /<image /);
  assert.doesNotMatch(svg, /<circle cx="116" cy="116" r="52"/);
});

test("runCli accepts equals-style empty identity fields", async () => {
  const root = await makeTempDir();
  const fixturePath = path.join(root, "analytics-fixture.json");
  const historyPath = path.join(root, "analytics-history.json");
  await writeFile(fixturePath, JSON.stringify({ data: [] }));

  const originalCwd = process.cwd();
  const originalLog = console.log;
  console.log = () => {};
  try {
    process.chdir(root);
    await runCli([
      "--source=analytics",
      `--fixture=${fixturePath}`,
      `--history-path=${historyPath}`,
      "--name=Equals Hidden",
      "--identity-fields=",
      "--now=2026-06-19T00:00:00.000Z",
    ]);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
  }

  const svg = await readFile(path.join(root, "codex-analytics.svg"), "utf8");
  assert.match(svg, /<title id="title">Codex profile stats<\/title>/);
  assert.doesNotMatch(svg, />Equals Hidden</);
  assert.doesNotMatch(svg, />@equalshidden</);
});

test("runCli rejects unknown CLI options", async () => {
  await assert.rejects(
    runCli(["--unknown-option"]),
    /Unknown option '--unknown-option'/,
  );
});

test("runCli ignores project-specific profile environment variables", async () => {
  const root = await makeTempDir();
  const fixturePath = path.join(root, "analytics-fixture.json");
  const historyPath = path.join(root, "analytics-history.json");
  await writeFile(fixturePath, JSON.stringify({ data: [] }));

  const restoreEnv = setEnvForTest({
    CODEX_PROFILE_NAME: "Env Name",
    CODEX_PROFILE_HANDLE: "@envhandle",
    CODEX_PROFILE_INITIALS: "EN",
    CODEX_PROFILE_AVATAR_URL: TEST_AVATAR_URL,
  });
  const originalCwd = process.cwd();
  const originalLog = console.log;
  console.log = () => {};
  try {
    process.chdir(root);
    await runCli([
      "--source",
      "analytics",
      "--fixture",
      fixturePath,
      "--history-path",
      historyPath,
      "--codex-home",
      path.join(root, "codex-home"),
      "--now",
      "2026-06-19T00:00:00.000Z",
    ]);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
    restoreEnv();
  }

  const svg = await readFile(path.join(root, "codex-analytics.svg"), "utf8");
  assert.match(svg, />Codex User</);
  assert.doesNotMatch(svg, />@codexuser</);
  assert.match(svg, />CU</);
  assert.doesNotMatch(svg, />Env Name</);
  assert.doesNotMatch(svg, />@envhandle</);
  assert.doesNotMatch(svg, />EN</);
  assert.doesNotMatch(svg, /<image /);
});

test("runCli requires explicit analytics credentials instead of project-specific env vars", async () => {
  const restoreEnv = setEnvForTest({
    CHATGPT_ANALYTICS_API_KEY: "env-key",
    CHATGPT_WORKSPACE_ID: "env-workspace",
  });

  try {
    await assert.rejects(
      runCli(["--source", "analytics", "--now", "2026-06-19T00:00:00.000Z"]),
      /--api-key and --workspace-id are required for analytics source/,
    );
  } finally {
    restoreEnv();
  }
});

test("generateMockCards writes visual test files to one fixed output directory", async () => {
  const root = await realpath(await makeTempDir());
  const { generateMockCards, MOCK_CARD_OUTPUT_DIR } = await import(
    "../scripts/generate-mock-cards.mjs"
  );

  const originalCwd = process.cwd();
  let generated;
  try {
    process.chdir(root);
    generated = await generateMockCards();
  } finally {
    process.chdir(originalCwd);
  }

  assert.equal(MOCK_CARD_OUTPUT_DIR, "test-output");
  assert.deepEqual(
    generated.map((file) => path.relative(root, file)).sort(),
    [
      "test-output/codex-mock-identity-all.svg",
      "test-output/codex-mock-identity-avatar-url.svg",
      "test-output/codex-mock-identity-handle.svg",
      "test-output/codex-mock-identity-none.svg",
    ],
  );

  const avatarSvg = await readFile(
    path.join(root, "test-output", "codex-mock-identity-avatar-url.svg"),
    "utf8",
  );
  assert.match(avatarSvg, new RegExp(`<image href="${escapeRegExp(TEST_AVATAR_URL)}"`));
  await assert.rejects(
    readFile(path.join(root, "codex-mock-identity-avatar-url.svg"), "utf8"),
    { code: "ENOENT" },
  );
});

function makeDays(startDate, length, tokenForIndex) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      totalTokens: tokenForIndex(index),
    };
  });
}

async function makeTempDir() {
  const unique = `codex-profile-card-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dir = path.join(tmpdir(), unique);
  await mkdir(dir, { recursive: true });
  return dir;
}

function tokenPayload(totalTokens) {
  return {
    type: "token_count",
    info: {
      total_token_usage: {
        input_tokens: totalTokens,
        cached_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: totalTokens,
      },
    },
  };
}

function event(type, timestamp, payload) {
  return JSON.stringify({ type, timestamp, payload });
}

async function writeCodexAuth(codexHome, claims) {
  await mkdir(codexHome, { recursive: true });
  await writeFile(
    path.join(codexHome, "auth.json"),
    JSON.stringify({ tokens: { id_token: fakeJwt(claims) } }),
  );
}

function fakeJwt(payload) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setEnvForTest(values) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
