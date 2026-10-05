import type { TransferRow } from "@/utils/apiClient";
import { describeToken, formatTokenAmount } from "@/utils/tokens";

/** One row of the Activity feed: a transfer, an arrival, a cash-out or a top-up. */
export interface ActivityEntry {
  id: string;
  direction: "send" | "receive";
  status: "pending" | "confirmed" | "failed";
  kind: TransferRow["kind"];
  token: string;
  amountRaw: string;
  decimals: number;
  self: string;
  counterparty: string;
  counterpartyHandle: string | null;
  counterpartyName: string | null;
  txHash: string | null;
  usdValue: string | null;
  memo: string | null;
  /** The API marks contract-routed sends with the durable `Ferry Flow` memo. */
  flow: boolean;
  cashout: TransferRow["cashout"];
  createdAt: string;
  confirmedAt: string | null;
}

export interface ActivitySection {
  title: string;
  data: ActivityEntry[];
}

export function activityDetailTimestamp(
  entry: Pick<ActivityEntry, "status" | "createdAt" | "confirmedAt">
): string {
  return entry.status === "confirmed"
    ? (entry.confirmedAt ?? entry.createdAt)
    : entry.createdAt;
}

export function mapTransferRowToActivityEntry(
  row: TransferRow,
  selfAddress: string
): ActivityEntry {
  const direction = row.direction === "SEND" ? "send" : "receive";
  return {
    id: row.id,
    direction,
    status: row.status.toLowerCase() as ActivityEntry["status"],
    kind: row.kind,
    token: row.token,
    amountRaw: row.amountRaw,
    decimals: row.decimals,
    self: selfAddress,
    counterparty: row.direction === "SEND" ? row.toAddress : row.fromAddress,
    counterpartyHandle: row.counterparty?.handle ?? null,
    counterpartyName: row.counterparty?.displayName ?? null,
    txHash: row.txHash,
    usdValue: row.usdValue,
    memo: row.memo,
    flow: row.memo === "Ferry Flow",
    cashout: row.cashout,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
  };
}

function byNewestFirst(a: ActivityEntry, b: ActivityEntry): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function groupIntoSections(entries: ActivityEntry[]): ActivitySection[] {
  const buckets = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    const key = entry.createdAt.slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }
  const sections: ActivitySection[] = [];
  for (const [title, data] of buckets) {
    data.sort(byNewestFirst);
    sections.push({ title, data });
  }
  sections.sort((a, b) => (a.title < b.title ? 1 : a.title > b.title ? -1 : 0));
  return sections;
}

export function counterpartyLabel(entry: ActivityEntry): string {
  if (entry.kind === "cashout") return "Cash out";
  if (entry.kind === "funding") return "Top up";
  if (entry.counterpartyHandle) return `@${entry.counterpartyHandle}`;
  if (entry.counterpartyName) return entry.counterpartyName;
  return `${entry.counterparty.slice(0, 6)}…${entry.counterparty.slice(-4)}`;
}

export function statusLabel(entry: ActivityEntry): string {
  if (entry.kind === "cashout") {
    if (entry.status === "pending") return "Settling…";
    if (entry.status === "failed") return "Failed";
    return entry.cashout?.payoutStatus === "SENT" ? "Paid out" : "Settled";
  }
  if (entry.kind === "funding")
    return entry.status === "pending" ? "Arriving…" : "Added";
  if (entry.status === "pending")
    return entry.direction === "send"
      ? entry.flow
        ? "Sending with Flow…"
        : "Sending…"
      : "Arriving…";
  if (entry.status === "failed") return "Failed";
  return entry.direction === "send"
    ? entry.flow
      ? "Sent with Flow"
      : "Sent"
    : "Received";
}

export function arrivalLabel(row: TransferRow): string {
  const { symbol } = describeToken(row.token);
  const amount = formatTokenAmount(
    Number(row.amountRaw) / 10 ** row.decimals,
    row.decimals
  );
  const from = row.counterparty?.handle
    ? ` from @${row.counterparty.handle}`
    : "";
  return `Received ${amount} ${symbol}${from}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * When a row happened, the way a person says it: "Today, 13:37",
 * "Yesterday, 09:12", "Sep 30, 14:02", and once it is from another year the
 * year takes the place of the time.
 */
export function formatActivityTime(
  iso: string,
  now: Date = new Date()
): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (sameDay(at, now)) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) return `Yesterday, ${time}`;
  const day = `${MONTHS[at.getMonth()]} ${at.getDate()}`;
  if (at.getFullYear() === now.getFullYear()) return `${day}, ${time}`;
  return `${day}, ${at.getFullYear()}`;
}
