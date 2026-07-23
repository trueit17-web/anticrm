const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export interface FetchedAvatar {
  buffer: Buffer;
}

// Reads the response body with a hard byte cap enforced during the read
// itself (not just checked after the fact) — a malicious or misbehaving
// server can't make this hold an unbounded amount of memory by sending more
// bytes than advertised, or lying about Content-Length.
async function readCapped(res: Response, maxBytes: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Telegram has no public API for "get a user's avatar by @handle" — the
// closest thing is the og:image meta tag on their public web preview page
// (t.me/<handle>), which Telegram fills in from the account's profile photo
// when the account is discoverable and privacy settings allow it. This is
// best-effort: returns null for private accounts, handles with no photo, an
// invalid handle, or any network hiccup — callers should treat that as "no
// avatar found" and leave whatever avatar was already set untouched.
export async function fetchTelegramAvatar(handle: string): Promise<FetchedAvatar | null> {
  const clean = handle.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{3,32}$/.test(clean)) return null;

  try {
    const pageRes = await fetch(`https://t.me/${clean}`, { signal: AbortSignal.timeout(5000) });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const match = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (!match) return null;

    const imageRes = await fetch(match[1], { signal: AbortSignal.timeout(5000) });
    if (!imageRes.ok) return null;
    // Coarse pre-filter only — the caller (applyFetchedAvatar) decodes the
    // buffer as an actual image before trusting it, same reasoning as the
    // direct upload path.
    if (!(imageRes.headers.get("content-type") ?? "").startsWith("image/")) return null;

    const buffer = await readCapped(imageRes, MAX_AVATAR_BYTES);
    if (!buffer) return null;
    return { buffer };
  } catch {
    return null;
  }
}
