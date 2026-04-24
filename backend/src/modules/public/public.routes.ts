import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import {
  getActivePolicy,
  normalizePolicyScope,
  toClientPolicyScope,
} from "../policy/policy.shared";

const publicRouter = Router();

publicRouter.get("/policy/current", async (req: Request, res: Response) => {
  try {
    const scope = normalizePolicyScope(req.query.scope);
    if (!scope) {
      res.status(400).json({ error: "Invalid policy scope. Use checkout or partnership." });
      return;
    }

    const policy = await getActivePolicy(prisma, scope);
    if (!policy) {
      res.status(404).json({ error: "Active policy not found" });
      return;
    }

    res.json({
      id: policy.public_id,
      scope: toClientPolicyScope(policy.scope),
      version: policy.version,
      title: policy.title,
      contentUrl: policy.content_url,
      activatedAt: policy.activated_at,
      updatedAt: policy.updated_at,
    });
  } catch (error) {
    console.error("Error fetching active policy:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { publicRouter };
