import { summarizeUsageDays } from "../src/codex-profile-card.mjs";

const HEATMAP_ROWS = 7;
const HEATMAP_COLUMNS = 26;
const HEATMAP_DAYS = HEATMAP_ROWS * HEATMAP_COLUMNS;

export function createMockCodexProfileData({
  now = "2026-06-19T00:00:00.000Z",
  days = HEATMAP_DAYS,
} = {}) {
  const rawDays = createMockUsageDays(new Date(now), days);
  return {
    sourceLabel: "Mock Codex usage",
    days: normalizeUsageDays(rawDays, days, latestDate(rawDays)),
    ...summarizeUsageDays(rawDays),
  };
}

function normalizeUsageDays(rawDays, count, endDate) {
  const byDate = new Map(rawDays.map((day) => [day.date, day]));
  const end = new Date(`${endDate || latestDate(rawDays) || isoDate(new Date())}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - 1 - index));
    const key = isoDate(date);
    return byDate.get(key) || { date: key, totalTokens: 0, turns: 0 };
  });
}

function latestDate(days) {
  return days
    .map((day) => day.date)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function createMockUsageDays(now, dayCount) {
  const end = new Date(now);
  const peakIndex = Math.max(0, dayCount - 11);
  const streakStart = Math.max(0, dayCount - 32);
  const burstStart = Math.max(0, dayCount - 56);
  const burstEnd = Math.max(burstStart, dayCount - 34);
  const targetLifetime = 11_200_000_000;
  const targetPeak = 605_300_000;

  const baseDays = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (dayCount - 1 - index));
    let totalTokens = 0;

    if (index >= burstStart && index < burstEnd && index % 3 !== 0) {
      const wave = Math.sin(index * 0.8) * 0.28 + 0.72;
      totalTokens = Math.round(
        (130_000_000 + (index - burstStart) * 7_800_000) * wave,
      );
    }

    if (index >= streakStart) {
      totalTokens = Math.max(
        totalTokens,
        185_000_000 + (index - streakStart) * 7_300_000,
      );
    }

    return {
      date: isoDate(date),
      totalTokens,
      turns:
        totalTokens > 0 ? Math.max(1, Math.round(totalTokens / 20_000_000)) : 0,
    };
  });

  const otherTotal = baseDays.reduce(
    (sum, day, index) => sum + (index === peakIndex ? 0 : day.totalTokens),
    0,
  );
  const multiplier = (targetLifetime - targetPeak) / Math.max(1, otherTotal);
  const scaledDays = baseDays.map((day, index) => ({
    ...day,
    totalTokens:
      index === peakIndex
        ? targetPeak
        : Math.round(day.totalTokens * multiplier),
  }));
  const correction =
    targetLifetime - scaledDays.reduce((sum, day) => sum + day.totalTokens, 0);
  const correctionIndex = scaledDays.findIndex(
    (day, index) => index !== peakIndex && day.totalTokens > 0,
  );
  if (correctionIndex >= 0)
    scaledDays[correctionIndex].totalTokens += correction;

  return scaledDays;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}
