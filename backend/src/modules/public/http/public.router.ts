import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../common/http/map-application-error";
import { normalizePolicyScope } from "../../policy/domain/policy-scope";
import type { GetCurrentPolicyService } from "../application/get-current-policy.service";

export function createPublicRouter(deps: {
  getCurrentPolicyService: GetCurrentPolicyService;
}) {
  const router = Router();

  router.get("/policy/current", async (req: Request, res: Response) => {
    try {
      res.json(
        await deps.getCurrentPolicyService.execute(
          normalizePolicyScope(req.query.scope),
        ),
      );
    } catch (error) {
      console.error("Error fetching active policy:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
