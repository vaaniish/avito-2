import type { Request, Response, Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import { detectCircumventionSignals } from "../moderation/anti-circumvention";
import { enforceCircumventionViolation } from "../moderation/circumvention-enforcement";
import { buildTargetUrl, createNotification } from "../notifications/notification.service";
import { toQuestionStatus } from "../../utils/format";

const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";

export function registerPartnerQuestionsRoutes(router: Router): void {
  router.get("/questions", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const questions = await prisma.listingQuestion.findMany({
        where: {
          listing: {
            seller_id: session.user.id,
          },
        },
        include: {
          listing: {
            select: {
              public_id: true,
              title: true,
            },
          },
          buyer: {
            select: {
              public_id: true,
              name: true,
            },
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });

      res.json(
        questions.map((question) => ({
          id: question.public_id,
          listingId: question.listing.public_id,
          listingTitle: question.listing.title,
          buyerName: question.buyer.name,
          buyerId: question.buyer.public_id,
          question: question.question,
          answer: question.answer,
          status: toQuestionStatus(question.status),
          createdAt: question.created_at,
          answeredAt: question.answered_at,
        })),
      );
    } catch (error) {
      console.error("Error fetching questions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/questions/:publicId/answer", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { publicId } = req.params;
      const body = (req.body ?? {}) as { answer?: unknown };
      const answer = typeof body.answer === "string" ? body.answer.trim() : "";

      if (!answer) {
        res.status(400).json({ error: "Answer must not be empty" });
        return;
      }

      const existing = await prisma.listingQuestion.findFirst({
        where: {
          public_id: String(publicId),
          listing: {
            seller_id: session.user.id,
          },
        },
        select: {
          id: true,
          public_id: true,
          buyer_id: true,
          listing: {
            select: {
              id: true,
              public_id: true,
              seller_id: true,
              title: true,
            },
          },
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      const circumventionSignals = detectCircumventionSignals(answer);
      if (circumventionSignals.length > 0) {
        const enforcement = await enforceCircumventionViolation({
          req,
          actorUserId: session.user.id,
          actorRole: session.user.role,
          channel: "seller_answer",
          text: answer,
          signals: circumventionSignals,
          listingPublicId: existing.listing.public_id,
          questionPublicId: existing.public_id,
          autoComplaint: {
            listingId: existing.listing.id,
            listingPublicId: existing.listing.public_id,
            sellerId: existing.listing.seller_id,
            reporterId: existing.buyer_id,
            questionPublicId: existing.public_id,
          },
        });

        if (enforcement.blocked) {
          const blockedUntil = enforcement.blockedUntil
            ? ` до ${enforcement.blockedUntil.toISOString()}`
            : "";
          res.status(403).json({
            error: `Аккаунт временно заблокирован${blockedUntil} за повторные попытки обхода платформы.`,
          });
          return;
        }

        res.status(400).json({
          error:
            "Ответ отклонен: запрещено передавать контакты и уводить сделку вне платформы. Нарушение зафиксировано.",
          complaintId: enforcement.complaintPublicId,
        });
        return;
      }

      const updated = await prisma.listingQuestion.update({
        where: { id: existing.id },
        data: {
          answer,
          status: "ANSWERED",
          answered_at: new Date(),
        },
      });

      await createNotification({
        userId: existing.buyer_id,
        type: "INFO",
        message: `Продавец ответил на ваш вопрос по товару «${existing.listing.title}».`,
        targetUrl: buildTargetUrl("listing", existing.listing.public_id),
      });

      res.json({
        success: true,
        id: updated.public_id,
        answer: updated.answer,
        answeredAt: updated.answered_at,
        status: toQuestionStatus(updated.status),
      });
    } catch (error) {
      console.error("Error answering question:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
