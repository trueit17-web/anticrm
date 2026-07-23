import { NextFunction, Request, Response } from "express";

// Express decodes %2F in :id before the route handler sees it, so an
// unvalidated req.params.id (e.g. "..%2F..%2Ftmp") can smuggle a path
// traversal into anything that builds a filesystem path or query off it.
// Route handlers that use :id anywhere near a filename must sit behind this.
export function requireIntegerId(req: Request, res: Response, next: NextFunction) {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: "Некорректный id" });
  }
  next();
}
