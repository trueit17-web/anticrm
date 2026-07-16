const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export interface FetchedAvatar {
  buffer: Buffer;
  ext: string;
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
    const contentType = imageRes.headers.get("content-type") ?? "";
    const ext = EXT_BY_CONTENT_TYPE[contentType];
    if (!ext) return null;

    const arrayBuffer = await imageRes.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), ext };
  } catch {
    return null;
  }
}
