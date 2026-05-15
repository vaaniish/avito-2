import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { getRequestMetaFromExpressLike } from "../../../../common/http/request-meta";
import { normalizePolicyScope, toClientPolicyScope } from "../../../policy/domain/policy-scope";
import type { AcceptPolicyService } from "../../../policy/application/services/accept-policy.service";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

export function createProfilePolicyRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  acceptPolicyService: AcceptPolicyService;
}) {
  const router = Router();
  const roles = ["BUYER", "SELLER", "ADMIN"];

  router.post("/policy-acceptance", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        scope?: unknown;
        policyId?: unknown;
      };

      const scope = normalizePolicyScope(body.scope);
      if (!scope) {
        res
          .status(400)
          .json({ error: "Invalid policy scope. Use checkout or partnership." });
        return;
      }

      const requestMeta = getRequestMetaFromExpressLike(req);
      const policy = await deps.acceptPolicyService.execute({
        userId: session.user.id,
        scope,
        requestPolicyPublicId:
          typeof body.policyId === "string" ? body.policyId.trim() : null,
        requestIp: requestMeta.ipAddress,
        requestUserAgent: requestMeta.userAgent,
      });

      res.status(201).json({
        success: true,
        policy: {
          id: policy.public_id,
          scope: toClientPolicyScope(policy.scope),
          version: policy.version,
          title: policy.title,
          contentUrl: policy.content_url,
        },
      });
    } catch (error) {
      console.error("Error accepting policy:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
