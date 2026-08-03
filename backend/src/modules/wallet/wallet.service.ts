import { prisma } from "../../lib/prisma";
import { fetchOutgoingUsdt } from "../../utils/tronscan";

export class DuplicateAddressError extends Error {}

// --- Config (source wallet lives on Branch.walletAddress) ---

export async function getWalletConfig(branchId: number) {
  const b = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { walletAddress: true, walletCountEnabled: true },
  });
  return { address: b?.walletAddress ?? null, enabled: b?.walletCountEnabled ?? false };
}

export async function setWalletAddress(branchId: number, address: string | null) {
  await prisma.branch.update({ where: { id: branchId }, data: { walletAddress: address } });
}

export async function isWalletCountEnabled(branchId: number): Promise<boolean> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { walletCountEnabled: true } });
  return b?.walletCountEnabled ?? false;
}

// --- Recipient mappings (destination address → display name) ---

export function listRecipients(branchId: number) {
  return prisma.walletRecipient.findMany({ where: { branchId }, orderBy: { name: "asc" } });
}

export async function createRecipient(branchId: number, address: string, name: string) {
  if (await prisma.walletRecipient.findFirst({ where: { branchId, address } })) {
    throw new DuplicateAddressError();
  }
  return prisma.walletRecipient.create({ data: { branchId, address, name } });
}

export async function updateRecipient(branchId: number, id: number, data: { address?: string; name?: string }) {
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

// --- Stats: outgoing USDT grouped by recipient ---

export interface WalletRecipientStat {
  name: string;
  amount: number;
  count: number;
}

export interface WalletStats {
  address: string | null;
  total: number;
  count: number;
  byRecipient: WalletRecipientStat[];
}

export async function getWalletStats(branchId: number, from: Date, to: Date): Promise<WalletStats> {
  const [branch, recipients] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId }, select: { walletAddress: true } }),
    prisma.walletRecipient.findMany({ where: { branchId }, select: { address: true, name: true } }),
  ]);
  const address = branch?.walletAddress?.trim() || null;
  if (!address) return { address: null, total: 0, count: 0, byRecipient: [] };

  const transfers = await fetchOutgoingUsdt(address, from.getTime(), to.getTime());
  const nameByAddr = new Map(recipients.map((r) => [r.address, r.name]));

  // Only transfers to a known (mapped) recipient are counted — transfers to
  // unmapped addresses are ignored entirely (not summed, not shown).
  const agg = new Map<string, { amount: number; count: number }>();
  let total = 0;
  let count = 0;
  for (const t of transfers) {
    const name = nameByAddr.get(t.to);
    if (!name) continue;
    const cur = agg.get(name) ?? { amount: 0, count: 0 };
    cur.amount += t.amount;
    cur.count += 1;
    agg.set(name, cur);
    total += t.amount;
    count += 1;
  }

  const byRecipient = [...agg.entries()]
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  return { address, total, count, byRecipient };
}
