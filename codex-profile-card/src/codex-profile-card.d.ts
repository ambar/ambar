export type IdentityField = "name" | "handle" | "avatar";

export interface CodexUsageDay {
  date: string;
  totalTokens?: number;
  turns?: number;
}

export interface CodexCardData {
  sourceLabel?: string;
  days?: CodexUsageDay[];
  lifetimeTokens?: number;
  peakDayTokens?: number;
  currentStreak?: number;
  longestStreak?: number;
}

export interface RenderCodexStatsCardOptions {
  name?: string;
  handle?: string;
  initials?: string;
  avatarUrl?: string;
  identityFields?: IdentityField[] | string;
  data?: CodexCardData;
}

export interface SummarizeUsageDaysOptions {
  throughDate?: string;
}

export interface BuildLocalCardDataOptions {
  codexHome?: string;
  now?: string;
  days?: number;
}

export interface BuildAnalyticsCardDataOptions {
  buckets?: AnalyticsBucket[];
  now?: string;
  days?: number;
  analyticsUser?: string;
}

export interface MergeAnalyticsHistoryOptions {
  historyPath?: string;
  buckets?: AnalyticsBucket[];
  now?: string;
  days?: number;
  analyticsGroup?: string;
  analyticsUser?: string;
}

export interface FetchAnalyticsUsageOptions {
  apiKey: string;
  workspaceId: string;
  startTime: number;
  endTime: number;
  groupBy?: string;
  group?: string;
  baseUrl?: string;
}

export type AnalyticsBucket = Record<string, unknown>;

export function renderCodexStatsCard(
  options?: RenderCodexStatsCardOptions,
): string;

export function summarizeUsageDays(
  days: CodexUsageDay[],
  options?: SummarizeUsageDaysOptions,
): Required<
  Pick<
    CodexCardData,
    "lifetimeTokens" | "peakDayTokens" | "currentStreak" | "longestStreak"
  >
>;

export function buildLocalCardData(
  options?: BuildLocalCardDataOptions,
): Promise<CodexCardData>;

export function buildAnalyticsCardData(
  options?: BuildAnalyticsCardDataOptions,
): CodexCardData;

export function mergeAnalyticsHistory(
  options?: MergeAnalyticsHistoryOptions,
): Promise<{ days: CodexUsageDay[] }>;

export function fetchAnalyticsUsage(
  options: FetchAnalyticsUsageOptions,
): Promise<AnalyticsBucket[]>;

export function extractBuckets(response: unknown): AnalyticsBucket[];

export function runCli(argv?: string[]): Promise<void>;
