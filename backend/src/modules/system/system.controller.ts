import { Request, Response } from "express";
import { getLatestVersion } from "./system.service";

// SUPERADMIN-only: returns the newest released version from GitHub. The
// frontend compares it against its own bundled version and, if newer, shows
// the deploy command to run on the server. Failures (GitHub down, rate limit)
// come back as 502 with a message rather than a generic 500.
export async function updateCheckHandler(_req: Request, res: Response) {
  try {
    const latestVersion = await getLatestVersion();
    res.json({ latestVersion });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Не удалось проверить обновления",
    });
  }
}
