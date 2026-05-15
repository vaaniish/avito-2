import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import type { AnswerPartnerQuestionService } from "../application/services/answer-partner-question.service";
import type { ListPartnerQuestionsService } from "../application/services/list-partner-questions.service";

type SessionResult =
  | { ok: true; user: { id: number; role: string } }
  | { ok: false; status: number; message: string };

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip || null;
}

export function createPartnerQuestionsRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  services: {
    listPartnerQuestions: ListPartnerQuestionsService;
    answerPartnerQuestion: AnswerPartnerQuestionService;
  };
}) {
  const router = Router();
  const roles = ["SELLER", "ADMIN"];

  router.get("/questions", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.json(await deps.services.listPartnerQuestions.execute(session.user.id));
    } catch (error) {
      console.error("Error fetching questions:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/questions/:publicId/answer", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as { answer?: unknown };
      res.json(
        await deps.services.answerPartnerQuestion.execute({
          sellerId: session.user.id,
          sellerRole: session.user.role,
          requestIp: getRequestIp(req),
          publicId: String(req.params.publicId ?? ""),
          answer: body.answer,
        }),
      );
    } catch (error) {
      console.error("Error answering question:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
