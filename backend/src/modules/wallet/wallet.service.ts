import { prisma } from "../../lib/prisma";
import { fetchNextHops, fetchOutgoingUsdt } from "../../utils/tronscan";

export class DuplicateAddressError extends Error {}

// --- Config (source wallets + Tronscan key) ---

export async function getWalletConfig(branchId: number) {
  const [b, sources] = await Promise.all([
    prisma.branch.findUnique({
      where: { id: branchId },
      select: { walletCountEnabled: true, tronscanApiKey: true },
    }),
    prisma.walletSource.findMany({ where: { branchId }, orderBy: { createdAt: "asc" }, select: { id: true, address: true } }),
  ]);
  return {
    sources,
    enabled: b?.walletCountEnabled ?? false,
    // Write-only: only whether a key is set, never the key itself.
    hasTronscanApiKey: !!b?.tronscanApiKey?.trim(),
  };
}

// tronscanApiKey: undefined = leave unchanged, null = clear, string = set.
export async function setWalletConfig(branchId: number, patch: { tronscanApiKey?: string | null }) {
  if (patch.tronscanApiKey === undefined) return;
  await prisma.branch.update({ where: { id: branchId }, data: { tronscanApiKey: patch.tronscanApiKey } });
}

// --- Source wallets (multiple per branch) ---

export function listSources(branchId: number) {
  return prisma.walletSource.findMany({ where: { branchId }, orderBy: { createdAt: "asc" }, select: { id: true, address: true } });
}

export async function addSource(branchId: number, address: string) {
  if (await prisma.walletSource.findFirst({ where: { branchId, address } })) {
    throw new DuplicateAddressError();
  }
  return prisma.walletSource.create({ data: { branchId, address }, select: { id: true, address: true } });
}

export async function deleteSource(branchId: number, id: number) {
  const result = await prisma.walletSource.deleteMany({ where: { id, branchId } });
  return result.count > 0;
}

async function getTronscanApiKey(branchId: number): Promise<string | null> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { tronscanApiKey: true } });
  return b?.tronscanApiKey?.trim() || process.env.TRONSCAN_API_KEY || null;
}

export async function isWalletCountEnabled(branchId: number): Promise<boolean> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { walletCountEnabled: true } });
  return b?.walletCountEnabled ?? false;
}

// --- Recipient mappings (destination/hub address → display name) ---

export function listRecipients(branchId: number) {
  return prisma.walletRecipient.findMany({ where: { branchId }, orderBy: { name: "asc" } });
}

export async function createRecipient(branchId: number, address: string, name: string, isHub: boolean) {
  if (await prisma.walletRecipient.findFirst({ where: { branchId, address } })) {
    throw new DuplicateAddressError();
  }
  return prisma.walletRecipient.create({ data: { branchId, address, name, isHub } });
}

export async function updateRecipient(
  branchId: number,
  id: number,
  data: { address?: string; name?: string; isHub?: boolean }
) {
  if (data.address) {
    const dup = await prisma.walletRecipient.findFirst({
      where: { branchId, address: data.address, id: { not: id } },
    });
    if (dup) throw new DuplicateAddressError();
  }
  const result = await prisma.walletRecipient.updateMany({ where: { id, branchId }, data });
  if (result.count === 0) return null;
  return prisma.walletRecipient.findUnique({ where: { id } });
}

export async function deleteRecipient(branchId: number, id: number) {
  const result = await prisma.walletRecipient.deleteMany({ where: { id, branchId } });
  return result.count > 0;
}

// --- Hop cache: where an address forwards its USDT (for hub tracing) ---

const HOP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Bounds Tronscan calls per stats load — only this many distinct unmapped
// destinations get traced (the rest fall through as unknown); the cache makes
// repeat loads cheap.
const MAX_TRACE = 60;

async function getNextHopsCached(branchId: number, address: string, apiKey: string | null): Promise<string[]> {
  const cached = await prisma.walletHopCache.findUnique({ where: { branchId_address: { branchId, address } } });
  if (cached && Date.now() - cached.checkedAt.getTime() < HOP_CACHE_TTL_MS) {
    return cached.nextHops ? cached.nextHops.split(",") : [];
  }
  const hops = await fetchNextHops(address, apiKey);
  await prisma.walletHopCache.upsert({
    where: { branchId_address: { branchId, address } },
    create: { branchId, address, nextHops: hops.join(","), checkedAt: new Date() },
    update: { nextHops: hops.join(","), checkedAt: new Date() },
  });
  return hops;
}

// --- Stats: outgoing USDT grouped by recipient (direct + hub tracing) ---

export interface WalletRecipientStat {
  name: string;
  amount: number;
  count: number;
}

export interface WalletHubSuggestion {
  address: string;
  fromCount: number; // how many of your unrecognized destinations sweep here
}

export interface WalletStats {
  sources: string[];
  total: number;
  count: number;
  byRecipient: WalletRecipientStat[];
  // Candidate hubs: addresses that several unrecognized destinations forward
  // into — the admin can add one as a hub to auto-attribute all of them.
  suggestedHubs: WalletHubSuggestion[];
}

export async function getWalletStats(branchId: number, from: Date, to: Date): Promise<WalletStats> {
  const [sourceRows, recipients, apiKey] = await Promise.all([
    prisma.walletSource.findMany({ where: { branchId }, select: { address: true } }),
    prisma.walletRecipient.findMany({ where: { branchId }, select: { address: true, name: true, isHub: true } }),
    getTronscanApiKey(branchId),
  ]);
  const sources = sourceRows.map((s) => s.address.trim()).filter(Boolean);
  if (sources.length === 0) return { sources: [], total: 0, count: 0, byRecipient: [], suggestedHubs: [] };

  // Outgoing of every source wallet, merged — but a transfer between two of
  // our own source wallets isn't a payment out, so it's dropped.
  const sourceSet = new Set(sources);
  const transfers = (
    await Promise.all(sources.map((s) => fetchOutgoingUsdt(s, from.getTime(), to.getTime(), apiKey)))
  )
    .flat()
    .filter((t) => !sourceSet.has(t.to));

  const nameByAddr = new Map(recipients.map((r) => [r.address, r.name]));
  const mappedAddrs = new Set(recipients.map((r) => r.address));
  const hubs = recipients.filter((r) => r.isHub);

  // Sum per destination first so each distinct address is traced at most once.
  const perDest = new Map<string, { amount: number; count: number }>();
  for (const t of transfers) {
    const cur = perDest.get(t.to) ?? { amount: 0, count: 0 };
    cur.amount += t.amount;
    cur.count += 1;
    perDest.set(t.to, cur);
  }

  const agg = new Map<string, { amount: number; count: number }>();
  const hubSuggestions = new Map<string, number>();
  let total = 0;
  let count = 0;
  let traced = 0;

  const addTo = (name: string, v: { amount: number; count: number }) => {
    const cur = agg.get(name) ?? { amount: 0, count: 0 };
    cur.amount += v.amount;
    cur.count += v.count;
    agg.set(name, cur);
    total += v.amount;
    count += v.count;
  };

  for (const [dest, v] of perDest) {
    const direct = nameByAddr.get(dest);
    if (direct) {
      addTo(direct, v);
      continue;
    }

    // Unmapped — trace one hop (cached, capped) to check for a hub match, and
    // to gather hub suggestions.
    if (traced >= MAX_TRACE) continue;
    traced++;
    let nextHops: string[] = [];
    try {
      nextHops = await getNextHopsCached(branchId, dest, apiKey);
    } catch {
      continue; // trace failure — treat as unknown, keep going
    }

    const matchedHub = hubs.find((h) => nextHops.includes(h.address));
    if (matchedHub) {
      addTo(matchedHub.name, v);
      continue;
    }

    // Unknown — its next-hops are hub candidates (skip already-mapped ones).
    for (const hop of nextHops) {
      if (mappedAddrs.has(hop)) continue;
      hubSuggestions.set(hop, (hubSuggestions.get(hop) ?? 0) + 1);
    }
  }

  const byRecipient = [...agg.entries()]
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  const suggestedHubs = [...hubSuggestions.entries()]
    .map(([address, fromCount]) => ({ address, fromCount }))
    .filter((s) => s.fromCount >= 2) // only addresses several unknowns share
    .sort((a, b) => b.fromCount - a.fromCount)
    .slice(0, 5);

  return { sources, total, count, byRecipient, suggestedHubs };
}
