import { Request, Response } from "express";
import { z } from "zod";
import { listAdminChangeLog } from "./adminLog.service";

const querySchema = z.object({
  entityType: z.enum(["user", "branch"]).optional(),
});

export async function listAdminChangeLogHandler(req: Request, res: Response) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте параметры запроса" });
  }
  const entries = await listAdminChangeLog(req.user!, parsed.data);
  res.json({ entries });
}
