import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { getJob } from "@/utils/media/jobs";
import u from "@/utils";

export default Router().get("/", validateFields({
  directory: z.string().min(1).max(4096), id: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
}, "query"), async (req, res) => {
  const directory = await u.workspace.resolveWorkspace(req, String(req.query.directory));
  res.set("Cache-Control", "private, no-store").json(success(await getJob(directory, String(req.query.id))));
});
