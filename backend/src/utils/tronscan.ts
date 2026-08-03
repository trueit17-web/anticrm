// Reads USDT TRC-20 transfers for a TRON address from Tronscan's public API.
// Used by the "Считать кош" module to total outgoing payments per recipient
// and to trace where rotating deposit addresses sweep to (hub tracing).
//
// A per-branch Tronscan API key (or the TRONSCAN_API_KEY env fallback) is sent
// as TRON-PRO-API-KEY to lift the anonymous rate limit. Amounts come back as
// integer base units ("quant") — USDT has 6 decimals.
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const BASE = "https://apilist.tronscanapi.com/api/token_trc20/transfers";
const PAGE_SIZE = 50;
// Safety cap so a huge/wide range can't spin forever (50 × 60 = 3000 transfers).
const MAX_PAGES = 60;

export interface UsdtTransfer {
  from: string;
  to: string;
  amount: number; // in USDT (already divided by 10^decimals)
  timestamp: number; // ms
}

interface TronscanTransfer {
  from_address?: string;
  to_address?: string;
  quant?: string;
  block_ts?: number;
  tokenInfo?: { tokenDecimal?: number };
}

function headers(apiKey?: string | null): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = apiKey || process.env.TRONSCAN_API_KEY;
  if (key) h["TRON-PRO-API-KEY"] = key;
  return h;
}

async function fetchPage(address: string, page: number, apiKey?: string | null): Promise<TronscanTransfer[]> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    start: String(page * PAGE_SIZE),
    contract_address: USDT_CONTRACT,
    relatedAddress: address,
  });
  const res = await fetch(`${BASE}?${params.toString()}`, { headers: headers(apiKey), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Tronscan ответил ${res.status}`);
  const body = (await res.json()) as { token_transfers?: TronscanTransfer[] };
  return body.token_transfers ?? [];
}

// All OUTGOING USDT transfers (from == address) in [fromMs, toMs). Tronscan
// returns transfers newest-first, so we page from the newest and stop as soon
// as we drop below fromMs. Bounded by MAX_PAGES.
export async function fetchOutgoingUsdt(
  address: string,
  fromMs: number,
  toMs: number,
  apiKey?: string | null
): Promise<UsdtTransfer[]> {
  const out: UsdtTransfer[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await fetchPage(address, page, apiKey);
    if (rows.length === 0) break;

    let reachedOlder = false;
    for (const r of rows) {
      const ts = r.block_ts ?? 0;
      if (ts < fromMs) {
        reachedOlder = true;
        break;
      }
      if (ts >= toMs) continue;
      if (!r.from_address || !r.to_address || r.from_address !== address) continue;
      const decimals = r.tokenInfo?.tokenDecimal ?? 6;
      out.push({ from: r.from_address, to: r.to_address, amount: Number(r.quant ?? "0") / 10 ** decimals, timestamp: ts });
    }

    if (reachedOlder || rows.length < PAGE_SIZE) break;
  }

  return out;
}

// Distinct destinations `address` has forwarded USDT to (one hop). Used to
// tell whether a rotating deposit address sweeps into a mapped hub. Looks at
// the most recent few pages only — a deposit address forwards to very few
// addresses, so this is cheap.
const NEXT_HOP_PAGES = 3;

export async function fetchNextHops(address: string, apiKey?: string | null): Promise<string[]> {
  const dests = new Set<string>();
  for (let page = 0; page < NEXT_HOP_PAGES; page++) {
    const rows = await fetchPage(address, page, apiKey);
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.from_address === address && r.to_address) dests.add(r.to_address);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return [...dests];
}
