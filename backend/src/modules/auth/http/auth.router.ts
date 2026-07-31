import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { forbidden, unauthorized, validationError } from "../../../common/application-error";
import { sendApplicationError } from "../../../common/http/map-application-error";
import { getRequestMetaFromExpressLike } from "../../../common/http/request-meta";
import { getAuthSessionContext } from "../../../lib/session";
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from "../../../lib/session-cookie";
import {
  isRequestOriginAllowed,
  parseCorsAllowedOrigins,
} from "../../../lib/http-security";
import type { AuthService } from "../application/auth.service";
import type { SessionService } from "../application/session.service";

const loginSchema = z.strictObject({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional().default(false),
});

const signupSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  username: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  rememberMe: z.boolean().optional().default(false),
});

function getRequestMeta(req: Request) {
  const requestMeta = getRequestMetaFromExpressLike(req);
  return {
    requestIp: requestMeta.ipAddress,
    requestUserAgent: requestMeta.userAgent,
  };
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const flattened = z.flattenError(result.error);
  throw validationError("Некорректные данные запроса", {
    code: "VALIDATION_ERROR",
    fields: flattened.fieldErrors,
  });
}

function requireTrustedOrigin(req: Request): void {
  if (!isRequestOriginAllowed(req, parseCorsAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS))) {
    throw forbidden("Недоверенный источник запроса");
  }
}

export function createAuthRouter(deps: {
  authService: AuthService;
  sessionService: SessionService;
}): Router {
  const router = Router();

  router.post("/login", async (req: Request, res: Response) => {
    try {
      requireTrustedOrigin(req);
      const body = parseBody(loginSchema, req.body);
      const result = await deps.authService.login({
        email: body.email,
        password: body.password,
        meta: getRequestMeta(req),
      });
      const session = await deps.sessionService.create(result.user.id, body.rememberMe);
      setSessionCookie(res, session.token, body.rememberMe);
      res.json({ ...result, csrfToken: session.csrfToken });
    } catch (error) {
      sendApplicationError(res, error);
    }
  });

  router.post("/signup", async (req: Request, res: Response) => {
    try {
      requireTrustedOrigin(req);
      const body = parseBody(signupSchema, req.body);
      const result = await deps.authService.signup({ ...body, meta: getRequestMeta(req) });
      const session = await deps.sessionService.create(result.user.id, body.rememberMe);
      setSessionCookie(res, session.token, body.rememberMe);
      res.status(201).json({ ...result, csrfToken: session.csrfToken });
    } catch (error) {
      sendApplicationError(res, error);
    }
  });

  router.get("/me", async (req: Request, res: Response) => {
    try {
      const context = await getAuthSessionContext(req);
      if (!context) throw unauthorized("Сессия отсутствует или истекла");
      const result = await deps.authService.getCurrentUser({
        userId: context.userId,
        meta: getRequestMeta(req),
      });
      res.json({ ...result, csrfToken: context.csrfToken });
    } catch (error) {
      sendApplicationError(res, error);
    }
  });

  router.post("/logout", async (req: Request, res: Response) => {
    try {
      await deps.sessionService.revokeCurrent(readSessionCookie(req));
      clearSessionCookie(res);
      res.json({ success: true });
    } catch (error) {
      sendApplicationError(res, error);
    }
  });

  router.post("/logout-all", async (req: Request, res: Response) => {
    try {
      const context = await getAuthSessionContext(req);
      if (!context) throw unauthorized("Сессия отсутствует или истекла");
      await deps.sessionService.revokeAll(context.userId);
      clearSessionCookie(res);
      res.json({ success: true });
    } catch (error) {
      sendApplicationError(res, error);
    }
  });

  return router;
}
