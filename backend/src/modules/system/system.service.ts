// Reads the latest released version straight from the changelog on GitHub, so
// the Админка can tell an admin whether the running deploy is behind. The repo
// is public, so no token is needed; GITHUB_TOKEN is honored if set (e.g. if
// the repo is later made private or to lift the anonymous rate limit).
const REPO = process.env.GITHUB_REPO || "trueit17-web/anticrm";
const BRANCH = process.env.GITHUB_BRANCH || "master";
const CHANGELOG_PATH = "frontend/src/data/changelog.ts";

export async function getLatestVersion(): Promise<string | null> {
  const url = `https://api.github.com/repos/${REPO}/contents/${CHANGELOG_PATH}?ref=${BRANCH}`;
  const headers: Record<string, string> = {
    // Ask GitHub to hand back the raw file body instead of the JSON wrapper.
    Accept: "application/vnd.github.raw+json",
    "User-Agent": "anticrm-update-check",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`GitHub ответил ${res.status}`);
  const text = await res.text();

  // The newest entry is first in the CHANGELOG array; grab the first quoted
  // semver (the `version: string;` interface field has no quotes, so it's
  // skipped).
  const match = text.match(/version:\s*"(\d+\.\d+\.\d+)"/);
  return match ? match[1] : null;
}
