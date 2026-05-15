import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../common/http/map-application-error";
import type { AuthService } from "../application/auth.service";

function getRequestMeta(req: Request) {
  const forwarded = req.header("x-forwarded-for")?.trim();
  const requestIp = forwarded
    ? (forwarded.split(",")[0]?.trim() ?? null)
    : (req.ip?.trim() ?? null);

  return {
    requestIp,
    requestUserAgent: req.header("user-agent")?.trim() || null,
  };
}

function getAuthorizationHeader(req: Request): string | undefined {
  return req.header("authorization") ?? undefined;
}

export function createAuthRouter(deps: { authService: AuthService }): Router {
  const router = Router();

  router.post("/login", async (req: Request, res: Response) => {
    try {
      const result = await deps.authService.login({
        email: req.body?.email,
        password: req.body?.password,
        meta: getRequestMeta(req),
      });
      res.json(result);
    } catch (error) {
      sendApplicationError(res, error);
    }
  });

  router.post("/signup", async (req: Request, res: Response) => {
    try {
      const result = await deps.authService.signup({
        name: req.body?.name,
        username: req.body?.username,
        email: req.body?.email,
        password: req.body?.password,
        meta: getRequestMeta(req),
      });
      res.status(201).json(result);
    } catch (error) {
      sendApplicationError(res, error);
    }
  });

  router.get("/me", async (req: Request, res: Response) => {
    try {
      const result = await deps.authService.getCurrentUser({
        sessionToken: getAuthorizationHeader(req)?.replace(/^Bearer\s+/i, "") ?? null,
        meta: getRequestMeta(req),
      });
      res.json(result);
    } catch (error) {
      sendApplicationError(res, error);
    }
  });

  return router;
}
