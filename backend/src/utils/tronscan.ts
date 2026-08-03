// Reads USDT TRC-20 transfers for a TRON address from Tronscan's public API.
// Used by the "Считать кош" module to total outgoing payments per recipient.
//
// Tronscan is public; TRONSCAN_API_KEY (env) is sent as TRON-PRO-API-KEY when
// set, to lift the anonymous rate limit. Amounts come back as integer base
// units ("quant") — USDT has 6 decimals.
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

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (process.env.TRONSCAN_API_KEY) h["TRON-PRO-API-KEY"] = process.env.TRONSCAN_API_KEY;
  return h;
}

// All OUTGOING USDT transfers (from == address) in [fromMs, toMs). Tronscan
// returns transfers newest-first; `total` is a capped/approximate value and
// its time-range params aren't reliable, so we page from the newest and filter
// by block_ts in JS, stopping as soon as we pass below `fromMs` (everything
// after that is older). Bounded by MAX_PAGES.
export async function fetchOutgoingUsdt(address: string, fromMs: number, toMs: number): Promise<UsdtTransfer[]> {
  const out: UsdtTransfer[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      start: String(page * PAGE_SIZE),
      contract_address: USDT_CONTRACT,
      relatedAddress: address,
      // Sent as hints — honored when Tronscan supports them, otherwise the JS
      // filter below still gets it right.
      start_timestamp: String(fromMs),
      end_timestamp: String(toMs),
    });
    const res = await fetch(`${BASE}?${params.toString()}`, { headers: headers(), signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Tronscan ответил ${res.status}`);
    const body = (await res.json()) as { token_transfers?: TronscanTransfer[] };
    const rows = body.token_transfers ?? [];
    if (rows.length === 0) break;

    let reachedOlder = false;
    for (const r of rows) {
      const ts = r.block_ts ?? 0;
      if (ts < fromMs) {
        reachedOlder = true; // newest-first — nothing after this is in range
        break;
      }
      if (ts >= toMs) continue; // newer than the range — skip, keep paging
      // relatedAddress returns both directions — keep only outgoing.
      if (!r.from_address || !r.to_address || r.from_address !== address) continue;
      const decimals = r.tokenInfo?.tokenDecimal ?? 6;
      out.push({ from: r.from_address, to: r.to_address, amount: Number(r.quant ?? "0") / 10 ** decimals, timestamp: ts });
    }

    if (reachedOlder || rows.length < PAGE_SIZE) break;
  }

  return out;
}
