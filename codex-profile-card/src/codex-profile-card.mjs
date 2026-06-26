import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/**
 * @typedef {import("./codex-profile-card.d.ts").AnalyticsBucket} AnalyticsBucket
 * @typedef {import("./codex-profile-card.d.ts").BuildAnalyticsCardDataOptions} BuildAnalyticsCardDataOptions
 * @typedef {import("./codex-profile-card.d.ts").BuildLocalCardDataOptions} BuildLocalCardDataOptions
 * @typedef {import("./codex-profile-card.d.ts").CodexCardData} CodexCardData
 * @typedef {import("./codex-profile-card.d.ts").CodexUsageDay} CodexUsageDay
 * @typedef {import("./codex-profile-card.d.ts").FetchAnalyticsUsageOptions} FetchAnalyticsUsageOptions
 * @typedef {import("./codex-profile-card.d.ts").MergeAnalyticsHistoryOptions} MergeAnalyticsHistoryOptions
 * @typedef {import("./codex-profile-card.d.ts").RenderCodexStatsCardOptions} RenderCodexStatsCardOptions
 * @typedef {import("./codex-profile-card.d.ts").SummarizeUsageDaysOptions} SummarizeUsageDaysOptions
 */

const ANALYTICS_BASE_URL = "https://api.chatgpt.com/v1/analytics/codex";
const HEATMAP_ROWS = 7;
const HEATMAP_COLUMNS = 26;
const HEATMAP_DAYS = HEATMAP_ROWS * HEATMAP_COLUMNS;
const CARD_WIDTH = 998;
const CARD_HEIGHT = 612;
const HEATMAP_COLORS = ["#2f2f2f", "#21476c", "#266aa0", "#2d8bd6", "#35a8ff"];
const DEFAULT_IDENTITY_FIELDS = ["name", "handle", "avatar"];
const IDENTITY_FIELD_NAMES = new Set(DEFAULT_IDENTITY_FIELDS);
const CLI_OPTIONS = {
  help: { type: "boolean", short: "h" },
  source: { type: "string" },
  output: { type: "string" },
  name: { type: "string" },
  handle: { type: "string" },
  initials: { type: "string" },
  "identity-fields": { type: "string" },
  "identity-display": { type: "string" },
  "codex-home": { type: "string" },
  "api-key": { type: "string" },
  "workspace-id": { type: "string" },
  "analytics-base-url": { type: "string" },
  "analytics-group": { type: "string" },
  "analytics-user": { type: "string" },
  fixture: { type: "string" },
  "history-path": { type: "string" },
  days: { type: "string" },
  now: { type: "string" },
  "avatar-url": { type: "string" },
};

/**
 * @param {RenderCodexStatsCardOptions} [options]
 * @returns {string}
 */
export function renderCodexStatsCard({
  name = "",
  handle = "",
  initials,
  avatarUrl,
  identityFields,
  data,
} = {}) {
  const identity = resolveProfileIdentity({ name, handle, initials });
  const visibleIdentityFields = normalizeIdentityFields(identityFields);
  const showName = visibleIdentityFields.has("name") && Boolean(identity.name);
  const showHandle =
    visibleIdentityFields.has("handle") && Boolean(identity.handle);
  const showAvatar = visibleIdentityFields.has("avatar");
  const profileTitle = escapeXml(
    identityTitle({ identity, showName, showHandle }),
  );
  const profileName = escapeXml(identity.name);
  const profileHandle = escapeXml(identity.handle);
  const profileInitials = escapeXml(identity.initials);
  const normalizedDays = normalizeUsageDays(data?.days || [], HEATMAP_DAYS);
  const summary = {
    ...summarizeUsageDays(normalizedDays),
    ...pickDefined(data || {}, [
      "lifetimeTokens",
      "peakDayTokens",
      "currentStreak",
      "longestStreak",
    ]),
  };
  const maxTokens = Math.max(
    1,
    ...normalizedDays.map((day) => day.totalTokens || 0),
  );
  const cells = renderHeatmapCells(normalizedDays, maxTokens);
  const avatar = showAvatar
    ? renderAvatar({ avatarUrl, profileInitials })
    : "";
  const avatarDefs =
    showAvatar && avatarUrl
      ? `
  <defs>
    <clipPath id="avatar-clip">
      <circle cx="116" cy="116" r="52" />
    </clipPath>
  </defs>`
      : "";
  const identityText = renderIdentityText({
    profileName,
    profileHandle,
    showName,
    showHandle,
    showAvatar,
  });

  return `
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${profileTitle}</title>
  <desc id="desc">Codex usage heatmap with lifetime tokens, peak day, current streak, and longest streak.</desc>
  ${avatarDefs}
  <style>
    .card-bg { fill: #181818; }
    .separator { stroke: #2a2a2a; stroke-width: 2; }
    .codex-mark { stroke: #b8b8bb; stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }
    .heat-cell { shape-rendering: geometricPrecision; }
  </style>

  <rect class="card-bg" x="0" y="0" width="998" height="612" rx="64" />

  ${avatar}
  ${identityText}

  <g transform="translate(750 90)">
    <path class="codex-mark" d="M27 1.5c6 0 8.4 5.4 13 8 5.2 3 11.6 1.2 14.6 6.4 3 5.1-1.6 9.8-1.6 15.1 0 5.4 4.6 10 1.6 15.1-3 5.2-9.4 3.4-14.6 6.4-4.6 2.6-7 8-13 8s-8.4-5.4-13-8c-5.2-3-11.6-1.2-14.6-6.4-3-5.1 1.6-9.8 1.6-15.1 0-5.4-4.6-10-1.6-15.1 3-5.2 9.4-3.4 14.6-6.4 4.6-2.6 7-8 13-8Z" transform="translate(1 1)" />
    <text x="17" y="40" font-family="Helvetica Neue, Arial, sans-serif" font-size="26" font-weight="800" fill="#b8b8bb">&gt;_</text>
  </g>
  <text x="823" y="130" font-family="Helvetica Neue, Arial, sans-serif" font-size="38" font-weight="800" fill="#b8b8bb">Codex</text>

  <g data-testid="heatmap" transform="translate(64 192)">
    ${cells}
  </g>

  <g data-testid="metrics">
    ${metric(171, formatTokenCount(summary.lifetimeTokens), "lifetime tokens")}
    <line class="separator" x1="282" y1="469" x2="282" y2="548" />
    ${metric(390, formatTokenCount(summary.peakDayTokens), "peak day")}
    <line class="separator" x1="500" y1="469" x2="500" y2="548" />
    ${metric(609, `${summary.currentStreak} days`, "current streak")}
    <line class="separator" x1="718" y1="469" x2="718" y2="548" />
    ${metric(826, `${summary.longestStreak} days`, "longest streak")}
  </g>
</svg>
`.trimStart();
}

/**
 * @param {CodexUsageDay[]} days
 * @param {SummarizeUsageDaysOptions} [options]
 * @returns {{ lifetimeTokens: number, peakDayTokens: number, currentStreak: number, longestStreak: number }}
 */
export function summarizeUsageDays(days, { throughDate } = {}) {
  const sorted = aggregateUsageDays(days);
  const lifetimeTokens = sorted.reduce((sum, day) => sum + day.totalTokens, 0);
  const peakDayTokens = sorted.reduce(
    (max, day) => Math.max(max, day.totalTokens),
    0,
  );
  let longestStreak = 0;
  let currentRun = 0;
  const firstDate = sorted[0]?.date;
  const lastDate = sorted.at(-1)?.date;
  const streakEndDate = normalizeDateKey(throughDate) || lastDate;
  const calendarDays =
    firstDate && streakEndDate
      ? calendarUsageDays(sorted, firstDate, streakEndDate)
      : [];

  for (const day of calendarDays) {
    if (day.totalTokens > 0) {
      currentRun += 1;
      longestStreak = Math.max(longestStreak, currentRun);
    } else {
      currentRun = 0;
    }
  }

  let currentStreak = 0;
  for (let index = calendarDays.length - 1; index >= 0; index -= 1) {
    if (calendarDays[index].totalTokens <= 0) break;
    currentStreak += 1;
  }

  return { lifetimeTokens, peakDayTokens, currentStreak, longestStreak };
}

/**
 * @param {BuildLocalCardDataOptions} [options]
 * @returns {Promise<CodexCardData>}
 */
export async function buildLocalCardData({
  codexHome = process.env.CODEX_HOME || path.join(homedir(), ".codex"),
  now = new Date().toISOString(),
  days = HEATMAP_DAYS,
} = {}) {
  const roots = [
    path.join(codexHome, "sessions"),
    path.join(codexHome, "archived_sessions"),
  ];
  const sessionEvents = new Map();

  for (const root of roots) {
    const files = await listJsonlFiles(root);
    for (const file of files) {
      await readCodexSession(file, ({ sessionId, timestamp, payload }) => {
        if (payload.type !== "token_count") return;
        const usage = payload.info?.total_token_usage;
        if (!usage?.total_tokens || !timestamp) return;
        const id = sessionId || file;
        if (!sessionEvents.has(id)) sessionEvents.set(id, []);
        sessionEvents
          .get(id)
          .push({ timestamp, totalTokens: numberValue(usage.total_tokens) });
      });
    }
  }

  const dailyTotals = new Map();
  for (const events of sessionEvents.values()) {
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let previousTotal = 0;
    const seenTotals = new Set();

    for (const event of events) {
      if (seenTotals.has(event.totalTokens)) continue;
      seenTotals.add(event.totalTokens);
      const delta = event.totalTokens - previousTotal;
      if (delta > 0) {
        const date = event.timestamp.slice(0, 10);
        dailyTotals.set(date, (dailyTotals.get(date) || 0) + delta);
        previousTotal = event.totalTokens;
      }
    }
  }

  const rawDays = [...dailyTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, totalTokens]) => ({ date, totalTokens }));
  const normalizedDays = normalizeUsageDays(
    rawDays,
    days,
    latestDate(rawDays) || isoDate(new Date(now)),
  );

  return {
    sourceLabel: "Local Codex logs",
    days: normalizedDays,
    ...summarizeUsageDays(rawDays),
  };
}

/**
 * @param {BuildAnalyticsCardDataOptions} [options]
 * @returns {CodexCardData}
 */
export function buildAnalyticsCardData({
  buckets = [],
  now = new Date().toISOString(),
  days = HEATMAP_DAYS,
  analyticsUser,
} = {}) {
  const rawDays = bucketsToDays(buckets, { analyticsUser });
  const normalizedDays = normalizeUsageDays(
    rawDays,
    days,
    latestDate(rawDays) || isoDate(new Date(now)),
  );
  return {
    sourceLabel: "Codex Analytics API",
    days: normalizedDays,
    ...summarizeUsageDays(rawDays),
  };
}

/**
 * @param {MergeAnalyticsHistoryOptions} [options]
 * @returns {Promise<{ days: CodexUsageDay[] }>}
 */
export async function mergeAnalyticsHistory({
  historyPath = "data/codex-analytics-history.json",
  buckets = [],
  now = new Date().toISOString(),
  days = HEATMAP_DAYS,
  analyticsGroup = "workspace",
  analyticsUser,
} = {}) {
  const existing = await readHistory(historyPath);
  const scope = analyticsScopeKey({ analyticsGroup, analyticsUser });
  const existingDays = historyMatchesScope(existing, scope, analyticsUser)
    ? existing.days || []
    : [];
  const mergedByDate = new Map();

  for (const day of existingDays) {
    if (!day.date) continue;
    mergedByDate.set(day.date, {
      date: day.date,
      totalTokens: numberValue(day.totalTokens),
      turns: numberValue(day.turns),
    });
  }

  for (const day of bucketsToDays(buckets, { analyticsUser })) {
    mergedByDate.set(day.date, day);
  }

  const rawDays = [...mergedByDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const normalized = normalizeUsageDays(
    rawDays,
    days,
    latestDate(rawDays) || isoDate(new Date(now)),
  );
  await mkdir(path.dirname(historyPath), { recursive: true });
  await writeFile(
    historyPath,
    `${JSON.stringify({ version: 2, updatedAt: now, scope, analyticsGroup, analyticsUser: analyticsUser || null, days: normalized }, null, 2)}\n`,
    "utf8",
  );
  return { days: normalized };
}

/**
 * @param {FetchAnalyticsUsageOptions} options
 * @returns {Promise<AnalyticsBucket[]>}
 */
export async function fetchAnalyticsUsage({
  apiKey,
  workspaceId,
  startTime,
  endTime,
  groupBy = "day",
  group = "workspace",
  baseUrl = ANALYTICS_BASE_URL,
} = {}) {
  if (!apiKey) throw new Error("apiKey is required for analytics source");
  if (!workspaceId)
    throw new Error("workspaceId is required for analytics source");

  const rows = [];
  let page = null;

  do {
    const url = new URL(
      `${baseUrl}/workspaces/${encodeURIComponent(workspaceId)}/usage`,
    );
    url.searchParams.set("start_time", String(startTime));
    url.searchParams.set("end_time", String(endTime));
    url.searchParams.set("group_by", groupBy);
    if (shouldSendAnalyticsGroup(group)) url.searchParams.set("group", group);
    url.searchParams.set("limit", "90");
    if (page) url.searchParams.set("page", page);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Analytics API request failed: ${response.status} ${await response.text()}`,
      );
    }

    const json = await response.json();
    rows.push(...extractBuckets(json));
    page = json.page?.has_more ? json.page.next_page : null;
  } while (page);

  return rows;
}

/**
 * @param {unknown} response
 * @returns {AnalyticsBucket[]}
 */
export function extractBuckets(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.buckets)) return response.buckets;
  if (Array.isArray(response?.usage)) return response.usage;
  if (Array.isArray(response?.page?.data)) return response.page.data;
  return [];
}

async function readCodexSession(file, onEvent) {
  let sessionId = null;
  const rl = readline.createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = event.payload || {};
    if (event.type === "session_meta" && payload.id) sessionId = payload.id;
    onEvent({
      sessionId,
      timestamp: event.timestamp,
      type: event.type,
      payload,
    });
  }
}

async function listJsonlFiles(root) {
  const files = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
    }
  }

  await walk(root);
  return files;
}

async function readHistory(historyPath) {
  try {
    return JSON.parse(await readFile(historyPath, "utf8"));
  } catch {
    return { days: [] };
  }
}

function renderHeatmapCells(days, maxTokens) {
  const cellSize = 28;
  const gap = 6;
  return days
    .slice(0, HEATMAP_DAYS)
    .map((day, index) => {
      const row = index % HEATMAP_ROWS;
      const column = Math.floor(index / HEATMAP_ROWS);
      const x = column * (cellSize + gap);
      const y = row * (cellSize + gap);
      const level = heatLevel(day.totalTokens, maxTokens);
      return `<rect class="heat-cell" data-testid="heat-cell" data-date="${escapeXml(day.date)}" data-level="${level}" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="8" fill="${HEATMAP_COLORS[level]}" />`;
    })
    .join("\n    ");
}

function renderAvatar({ avatarUrl, profileInitials }) {
  return avatarUrl
    ? `<image href="${escapeXml(avatarUrl)}" x="64" y="64" width="104" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)" />`
    : `<circle cx="116" cy="116" r="52" fill="#1ec8a8" /><text x="116" y="132" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="40" font-weight="500" fill="#ffffff">${profileInitials}</text>`;
}

function renderIdentityText({
  profileName,
  profileHandle,
  showName,
  showHandle,
  showAvatar,
}) {
  const x = showAvatar ? 192 : 64;
  if (showName && showHandle) {
    return `<text x="${x}" y="111" font-family="Helvetica Neue, Arial, sans-serif" font-size="40" font-weight="800" fill="#f7f7f7">${profileName}</text>
  <text x="${x}" y="148" font-family="Helvetica Neue, Arial, sans-serif" font-size="30" font-weight="700" fill="#b8b8bb">${profileHandle}</text>`;
  }
  if (showName) {
    return `<text x="${x}" y="132" font-family="Helvetica Neue, Arial, sans-serif" font-size="40" font-weight="800" fill="#f7f7f7">${profileName}</text>`;
  }
  if (showHandle) {
    return `<text x="${x}" y="132" font-family="Helvetica Neue, Arial, sans-serif" font-size="30" font-weight="700" fill="#b8b8bb">${profileHandle}</text>`;
  }
  return "";
}

function heatLevel(tokens, maxTokens) {
  const value = numberValue(tokens);
  if (value <= 0 || maxTokens <= 0) return 0;
  const ratio = value / maxTokens;
  if (ratio >= 1) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

function metric(centerX, value, label) {
  return `
    <text x="${centerX}" y="501" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="36" font-weight="800" fill="#ffffff">${escapeXml(value)}</text>
    <text x="${centerX}" y="546" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="28" font-weight="700" fill="#b8b8bb">${escapeXml(label)}</text>`;
}

function normalizeUsageDays(rawDays, count, endDate) {
  const byDate = new Map(
    aggregateUsageDays(rawDays).map((day) => [day.date, day]),
  );

  const end = new Date(
    `${endDate || latestDate(rawDays) || isoDate(new Date())}T00:00:00.000Z`,
  );
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - 1 - index));
    const key = isoDate(date);
    return byDate.get(key) || { date: key, totalTokens: 0, turns: 0 };
  });
}

function bucketsToDays(buckets, { analyticsUser } = {}) {
  const byDate = new Map();
  for (const bucket of buckets) {
    if (!bucketMatchesAnalyticsUser(bucket, analyticsUser)) continue;
    const date = normalizeDateKey(
      bucket.date ||
        bucket.start_time ||
        bucket.start ||
        bucket.startTime ||
        bucket.period_start,
    );
    if (!date) continue;
    const totalTokens = normalizeBucketTokens(bucket);
    const turns = numberValue(bucket.turns ?? bucket.total_turns);
    const existing = byDate.get(date) || { date, totalTokens: 0, turns: 0 };
    existing.totalTokens += totalTokens;
    existing.turns += turns;
    byDate.set(date, existing);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateUsageDays(days) {
  const byDate = new Map();
  for (const day of days || []) {
    const date = normalizeDateKey(day.date);
    if (!date) continue;
    const existing = byDate.get(date) || { date, totalTokens: 0, turns: 0 };
    existing.totalTokens += numberValue(day.totalTokens);
    existing.turns += numberValue(day.turns);
    byDate.set(date, existing);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function calendarUsageDays(days, startDate, endDate) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end < start
  )
    return [];

  const result = [];
  for (
    const date = new Date(start);
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const key = isoDate(date);
    result.push(byDate.get(key) || { date: key, totalTokens: 0, turns: 0 });
  }
  return result;
}

function bucketMatchesAnalyticsUser(bucket, analyticsUser) {
  if (!analyticsUser) return true;
  const target = normalizeMatchValue(analyticsUser);
  const user =
    bucket.user && typeof bucket.user === "object" ? bucket.user : {};
  const candidates = [
    bucket.user_email,
    bucket.email,
    bucket.user_id,
    bucket.user_name,
    bucket.name,
    bucket.username,
    bucket.display_name,
    user.email,
    user.id,
    user.name,
    user.username,
    user.display_name,
  ];
  return candidates.some(
    (candidate) => normalizeMatchValue(candidate) === target,
  );
}

function normalizeMatchValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeDateKey(value) {
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function analyticsScopeKey({
  analyticsGroup = "workspace",
  analyticsUser,
} = {}) {
  const group = String(analyticsGroup || "workspace")
    .trim()
    .toLowerCase();
  const user = normalizeMatchValue(analyticsUser);
  return user ? `${group}:user:${user}` : `${group}:all`;
}

function historyMatchesScope(history, scope, analyticsUser) {
  if (history.scope) return history.scope === scope;
  return !analyticsUser;
}

function shouldSendAnalyticsGroup(group) {
  const normalized = String(group ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return !["user", "users", "per_user", "none", "false"].includes(normalized);
}

function normalizeBucketTokens(bucket) {
  if (bucket.totalTokens !== undefined) return numberValue(bucket.totalTokens);
  const nested = bucket.usage || bucket.tokens || {};
  const explicitTotal = firstNumberOrNull(
    bucket.total_tokens,
    nested.total_tokens,
  );
  if (explicitTotal !== null) return explicitTotal;
  return (
    firstNumber(
      bucket.input_tokens,
      bucket.text_input_tokens,
      nested.input_tokens,
      nested.text_input_tokens,
    ) +
    firstNumber(
      bucket.output_tokens,
      bucket.text_output_tokens,
      nested.output_tokens,
      nested.text_output_tokens,
    ) +
    firstNumber(bucket.reasoning_output_tokens, nested.reasoning_output_tokens)
  );
}

function latestDate(days) {
  return days
    .map((day) => day.date)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function pickDefined(source, keys) {
  const picked = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null)
      picked[key] = source[key];
  }
  return picked;
}

function formatTokenCount(value) {
  const number = numberValue(value);
  if (number >= 1_000_000_000) return `${trimFixed(number / 1_000_000_000)}B`;
  if (number >= 1_000_000) return `${trimFixed(number / 1_000_000)}M`;
  if (number >= 1_000) return `${trimFixed(number / 1_000)}K`;
  return String(Math.round(number));
}

function trimFixed(value) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function firstNumber(...values) {
  return firstNumberOrNull(...values) ?? 0;
}

function firstNumberOrNull(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function numberValue(value) {
  return numberOrNull(value) ?? 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resolveProfileIdentity({ name = "", handle = "", initials } = {}) {
  const resolvedName = String(name || "");
  return {
    name: resolvedName,
    handle: String(handle || ""),
    initials: (initials || initialsFromName(resolvedName))
      .slice(0, 3)
      .toUpperCase(),
  };
}

function normalizeIdentityFields(fields = DEFAULT_IDENTITY_FIELDS) {
  const rawFields = Array.isArray(fields)
    ? fields
    : String(fields)
        .split(",")
        .map((field) => field.trim());
  const normalized = rawFields
    .map((field) => String(field).trim().toLowerCase())
    .filter(Boolean);

  if (!normalized.length || normalized.includes("none")) return new Set();
  if (normalized.includes("all")) return new Set(DEFAULT_IDENTITY_FIELDS);

  const invalid = normalized.filter((field) => !IDENTITY_FIELD_NAMES.has(field));
  if (invalid.length) {
    throw new Error(`Unknown identity field: ${invalid.join(", ")}`);
  }

  return new Set(normalized);
}

function identityTitle({ identity, showName, showHandle }) {
  if (showName && identity.name) return `${identity.name}'s Codex profile stats`;
  if (showHandle && identity.handle)
    return `Codex profile stats for ${identity.handle}`;
  return "Codex profile stats";
}

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "C";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * @param {string[]} [argv]
 * @returns {Promise<void>}
 */
export async function runCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  if (args.help) {
    console.log(usageText());
    return;
  }

  const source = args.source || "local";
  const output = args.output || `codex-${source}.svg`;
  const codexHome = args["codex-home"];
  const codexIdentity = await readCodexProfileIdentity({ codexHome });
  const name = args.name || codexIdentity.name || "Codex User";
  const handle = args.handle || "";
  const initials = args.initials || initialsFromName(name);
  const avatarUrl = args["avatar-url"] || null;
  const identityFields = args["identity-fields"] ?? args["identity-display"];
  const days = Number(args.days || HEATMAP_DAYS);
  const now = args.now || new Date().toISOString();
  const analyticsUser = args["analytics-user"];
  const analyticsGroup =
    args["analytics-group"] ||
    (analyticsUser ? "user" : "workspace");

  let data;
  if (source === "local") {
    data = await buildLocalCardData({
      codexHome,
      now,
      days,
    });
  } else if (source === "analytics") {
    if (args.fixture) {
      const buckets = extractBuckets(
        JSON.parse(await readFile(args.fixture, "utf8")),
      );
      const merged = await mergeAnalyticsHistory({
        historyPath:
          args["history-path"] || "data/codex-analytics-history.json",
        buckets,
        now,
        days,
        analyticsGroup,
        analyticsUser,
      });
      data = buildAnalyticsCardData({ buckets: merged.days, now, days });
    } else {
      if (!args["api-key"] || !args["workspace-id"]) {
        throw new Error(
          "--api-key and --workspace-id are required for analytics source",
        );
      }
      const startTime = Math.floor(
        addDays(new Date(now), -90).getTime() / 1000,
      );
      const endTime = Math.floor(new Date(now).getTime() / 1000);
      const buckets = await fetchAnalyticsUsage({
        apiKey: args["api-key"],
        workspaceId: args["workspace-id"],
        startTime,
        endTime,
        group: analyticsGroup,
        baseUrl: args["analytics-base-url"],
      });
      const merged = await mergeAnalyticsHistory({
        historyPath:
          args["history-path"] || "data/codex-analytics-history.json",
        buckets,
        now,
        days,
        analyticsGroup,
        analyticsUser,
      });
      data = buildAnalyticsCardData({ buckets: merged.days, now, days });
    }
  } else {
    throw new Error(`Unknown source: ${source}`);
  }

  const svg = renderCodexStatsCard({
    name,
    handle,
    initials,
    avatarUrl,
    identityFields,
    data,
  });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, svg, "utf8");
  console.log(`Wrote ${output}`);
}

function parseCliArgs(argv) {
  return parseArgs({
    args: argv,
    options: CLI_OPTIONS,
    strict: true,
    allowPositionals: false,
  }).values;
}

async function readCodexProfileIdentity({ codexHome } = {}) {
  const root = codexHome || process.env.CODEX_HOME || path.join(homedir(), ".codex");
  try {
    const auth = JSON.parse(await readFile(path.join(root, "auth.json"), "utf8"));
    const claims = decodeJwtPayload(auth.tokens?.id_token);
    return {
      name: cleanProfileName(claims?.name),
    };
  } catch {
    return {};
  }
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function cleanProfileName(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function usageText() {
  return `
Usage:
  codex-profile-card --source local --output codex-local.svg [options]
  codex-profile-card --source analytics --output codex-analytics.svg [options]

Options:
  --source local|analytics        Data source. Defaults to local.
  --output <path>                 SVG output path. Defaults to codex-<source>.svg.
  --name <name>                   Display name. Defaults to Codex auth name, then "Codex User".
  --handle <handle>               Display handle. Defaults to empty.
  --initials <letters>            Avatar initials. Defaults to name initials.
  --avatar-url <url>               Avatar image URL. Used when the avatar identity field is visible.
  --identity-fields <fields>      Comma-separated name,handle,avatar fields. Defaults to all; use none or "" to hide all.
  --codex-home <path>             Local Codex home for local source.
  --api-key <key>                 Analytics API key for live analytics source.
  --workspace-id <id>             Analytics workspace ID for live analytics source.
  --analytics-base-url <url>      Analytics API base URL override.
  --analytics-group <group>       Analytics API group. Defaults to workspace, or user when --analytics-user is set.
  --analytics-user <id-or-email>  Keep one user from per-user Analytics buckets.
  --fixture <path>                Read Analytics buckets from a real captured fixture.
  --history-path <path>           Analytics history JSON path.
  --days <count>                  Days to render. Defaults to 182.
  --now <iso-date>                Override current time for reproducible runs.
`.trim();
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  runCli().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
