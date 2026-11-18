import "server-only";
import { getDb } from "./db";
import { utcDay } from "./usage";
import { TIER_IDS, type TierId } from "@/lib/shared/types";

export interface DailyPoint {
  day: string;
  messages: Record<TierId, number>;
  totalMessages: number;
  costUsd: number;
  activeUsers: number;
}

export interface TierTotals {
  tier: TierId;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TopUser {
  userId: string | null;
  email: string;
  messages: number;
  costUsd: number;
}

export interface AdminStats {
  users: { total: number; suspended: number; newLast7Days: number; activeToday: number };
  conversations: number;
  messages: number;
  today: { messages: number; costUsd: number; inputTokens: number; outputTokens: number };
  last30Days: { messages: number; costUsd: number };
  daily: DailyPoint[];
  tiers: TierTotals[];
  topUsers: TopUser[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function count(sql: string, ...params: unknown[]): number {
  return (getDb().prepare(sql).get(...params) as { n: number }).n;
}

export function getAdminStats(days = 30): AdminStats {
  const db = getDb();
  const now = Date.now();
  const today = utcDay(now);
  const firstDay = utcDay(now - (days - 1) * DAY_MS);

  const dailyRows = db
    .prepare(
      `SELECT day, tier,
              SUM(CASE WHEN kind = 'chat' THEN 1 ELSE 0 END) AS messages,
              SUM(cost_micro_usd) AS cost
         FROM usage_events WHERE day >= ? GROUP BY day, tier`,
    )
    .all(firstDay) as { day: string; tier: string; messages: number; cost: number }[];

  const activeRows = db
    .prepare(
      `SELECT day, COUNT(DISTINCT user_id) AS users
         FROM usage_events WHERE day >= ? AND user_id IS NOT NULL GROUP BY day`,
    )
    .all(firstDay) as { day: string; users: number }[];
  const activeByDay = new Map(activeRows.map((row) => [row.day, row.users]));

  const daily: DailyPoint[] = [];
  const byDay = new Map<string, DailyPoint>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = utcDay(now - offset * DAY_MS);
    const point: DailyPoint = {
      day,
      messages: { lite: 0, pro: 0, ultra: 0 },
      totalMessages: 0,
      costUsd: 0,
      activeUsers: activeByDay.get(day) ?? 0,
    };
    daily.push(point);
    byDay.set(day, point);
  }
  for (const row of dailyRows) {
    const point = byDay.get(row.day);
    if (!point) continue;
    if ((TIER_IDS as readonly string[]).includes(row.tier)) {
      point.messages[row.tier as TierId] += row.messages;
    }
    point.totalMessages += row.messages;
    point.costUsd += row.cost / 1_000_000;
  }

  const tierRows = db
    .prepare(
      `SELECT tier,
              SUM(CASE WHEN kind = 'chat' THEN 1 ELSE 0 END) AS messages,
              SUM(input_tokens + cache_read_tokens + cache_write_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens,
              SUM(cost_micro_usd) AS cost
         FROM usage_events WHERE day >= ? GROUP BY tier`,
    )
    .all(firstDay) as {
    tier: string;
    messages: number;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  }[];
  const tiers: TierTotals[] = TIER_IDS.map((tier) => {
    const row = tierRows.find((candidate) => candidate.tier === tier);
    return {
      tier,
      messages: row?.messages ?? 0,
      inputTokens: row?.input_tokens ?? 0,
      outputTokens: row?.output_tokens ?? 0,
      costUsd: (row?.cost ?? 0) / 1_000_000,
    };
  });

  const topUsers = (
    db
      .prepare(
        `SELECT e.user_id AS userId, COALESCE(u.email, 'deleted account') AS email,
                SUM(CASE WHEN e.kind = 'chat' THEN 1 ELSE 0 END) AS messages,
                SUM(e.cost_micro_usd) AS cost
           FROM usage_events e LEFT JOIN users u ON u.id = e.user_id
          WHERE e.day >= ?
          GROUP BY e.user_id ORDER BY cost DESC LIMIT 8`,
      )
      .all(firstDay) as { userId: string | null; email: string; messages: number; cost: number }[]
  ).map((row) => ({
    userId: row.userId,
    email: row.email,
    messages: row.messages,
    costUsd: row.cost / 1_000_000,
  }));

  const todayRow = db
    .prepare(
      `SELECT SUM(CASE WHEN kind = 'chat' THEN 1 ELSE 0 END) AS messages,
              COALESCE(SUM(cost_micro_usd), 0) AS cost,
              COALESCE(SUM(input_tokens + cache_read_tokens + cache_write_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens
         FROM usage_events WHERE day = ?`,
    )
    .get(today) as { messages: number | null; cost: number; input_tokens: number; output_tokens: number };

  return {
    users: {
      total: count("SELECT COUNT(*) AS n FROM users"),
      suspended: count("SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"),
      newLast7Days: count("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", now - 7 * DAY_MS),
      activeToday: activeByDay.get(today) ?? 0,
    },
    conversations: count("SELECT COUNT(*) AS n FROM conversations"),
    messages: count("SELECT COUNT(*) AS n FROM messages"),
    today: {
      messages: todayRow.messages ?? 0,
      costUsd: todayRow.cost / 1_000_000,
      inputTokens: todayRow.input_tokens,
      outputTokens: todayRow.output_tokens,
    },
    last30Days: {
      messages: daily.reduce((sum, point) => sum + point.totalMessages, 0),
      costUsd: daily.reduce((sum, point) => sum + point.costUsd, 0),
    },
    daily,
    tiers,
    topUsers,
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  limitMultiplier: number;
  createdAt: number;
  lastLoginAt: number | null;
  conversations: number;
  messagesToday: number;
  messages30d: number;
  cost30dUsd: number;
}

export function listAdminUsers(options: {
  query: string;
  limit: number;
  offset: number;
}): { rows: AdminUserRow[]; total: number } {
  const db = getDb();
  const like = `%${options.query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const today = utcDay();
  const firstDay = utcDay(Date.now() - 29 * DAY_MS);
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.status,
              u.limit_multiplier AS limitMultiplier,
              u.created_at AS createdAt, u.last_login_at AS lastLoginAt,
              (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id) AS conversations,
              (SELECT COUNT(*) FROM usage_events e
                WHERE e.user_id = u.id AND e.day = ? AND e.kind = 'chat') AS messagesToday,
              (SELECT COUNT(*) FROM usage_events e
                WHERE e.user_id = u.id AND e.day >= ? AND e.kind = 'chat') AS messages30d,
              (SELECT COALESCE(SUM(e.cost_micro_usd), 0) FROM usage_events e
                WHERE e.user_id = u.id AND e.day >= ?) / 1000000.0 AS cost30dUsd
         FROM users u
        WHERE u.email LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\'
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(today, firstDay, firstDay, like, like, options.limit, options.offset) as AdminUserRow[];
  const total = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM users u WHERE u.email LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\'",
      )
      .get(like, like) as { n: number }
  ).n;
  return { rows, total };
}
