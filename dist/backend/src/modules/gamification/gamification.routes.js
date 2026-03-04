"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gamificationRouter = void 0;
const express_1 = require("express");
const crypto_1 = require("crypto");
const prisma_1 = require("../../lib/prisma");
const SANDBOX_PARTNER_ID = 1;
const MIN_DEAL_AMOUNT = 10000;
const MAX_DEAL_AMOUNT = 100000;
const MIN_MANUAL_DEAL_AMOUNT = 100;
const MAX_MANUAL_DEAL_AMOUNT = 10000000;
const ACHIEVEMENT_RULES = {
    "Первая продажа": { metric: "orders", target: 1 },
    "Три сделки": { metric: "orders", target: 3 },
    "Десять сделок": { metric: "orders", target: 10 },
    "50 сделок": { metric: "orders", target: 50 },
    "Мастер оборота": { metric: "sales_amount", target: 500000 },
    Миллионер: { metric: "sales_amount", target: 1000000 },
    "Легенда лиги": { metric: "xp", target: 10000 },
    "Секрет: Теневая сделка": {
        metric: "max_deal",
        target: 250000,
        isSecret: true,
    },
};
function calculateCommissionRate(xpThreshold) {
    if (xpThreshold >= 15000)
        return 5.0;
    if (xpThreshold >= 7000)
        return 6.0;
    if (xpThreshold >= 3500)
        return 7.0;
    if (xpThreshold >= 1500)
        return 8.0;
    if (xpThreshold >= 500)
        return 9.0;
    return 10.0;
}
function getRatingMultiplier(rating) {
    if (rating >= 4.7)
        return 1.2;
    if (rating <= 3.0)
        return 0.6;
    return 1.0;
}
function getXpRuleDescription(xpCoefficient) {
    if (xpCoefficient <= 1) {
        return "Базовое начисление опыта за заказы";
    }
    const bonusPercent = Math.round((xpCoefficient - 1) * 100);
    return `Увеличенное начисление опыта +${bonusPercent}%`;
}
function getCurrentLevel(levels, xp) {
    if (levels.length === 0) {
        throw new Error("LEVELS_NOT_CONFIGURED");
    }
    return levels.reduce((resolved, level) => {
        if (xp >= level.xp_threshold) {
            return level;
        }
        return resolved;
    }, levels[0]);
}
function mapAchievement(achievement) {
    return {
        achievement_id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        xp_reward: achievement.xp_reward,
    };
}
function getMetricValue(metrics, metric) {
    return metrics[metric];
}
const gamificationRouter = (0, express_1.Router)();
exports.gamificationRouter = gamificationRouter;
gamificationRouter.get("/partner-stats", async (_req, res) => {
    try {
        const [partner, levels, achievements, orderCount, salesAgg, maxDealAgg] = await Promise.all([
            prisma_1.prisma.partner.findUnique({
                where: { id: SANDBOX_PARTNER_ID },
                include: {
                    partner_achievements: {
                        include: {
                            achievement: true,
                        },
                        orderBy: {
                            achieved_date: "desc",
                        },
                    },
                },
            }),
            prisma_1.prisma.loyaltyLevel.findMany({
                orderBy: { xp_threshold: "asc" },
            }),
            prisma_1.prisma.achievement.findMany({
                orderBy: { id: "asc" },
            }),
            prisma_1.prisma.order.count({
                where: { partner_id: SANDBOX_PARTNER_ID },
            }),
            prisma_1.prisma.order.aggregate({
                where: { partner_id: SANDBOX_PARTNER_ID },
                _sum: { deal_amount: true },
            }),
            prisma_1.prisma.order.aggregate({
                where: { partner_id: SANDBOX_PARTNER_ID },
                _max: { deal_amount: true },
            }),
        ]);
        if (!partner) {
            res.status(404).json({ error: "Partner not found" });
            return;
        }
        const currentLevel = getCurrentLevel(levels, partner.current_xp);
        const nextLevel = levels.find((level) => level.xp_threshold > partner.current_xp) ?? null;
        const metrics = {
            orders: orderCount,
            sales_amount: salesAgg._sum.deal_amount ?? 0,
            xp: partner.current_xp,
            max_deal: maxDealAgg._max.deal_amount ?? 0,
        };
        const unlockedById = new Map(partner.partner_achievements.map((partnerAchievement) => [partnerAchievement.achievement.id, partnerAchievement.achieved_date]));
        const achievementsCatalog = achievements.map((achievement) => {
            const rule = ACHIEVEMENT_RULES[achievement.name] ?? {
                metric: "orders",
                target: 1,
            };
            const rawProgress = getMetricValue(metrics, rule.metric);
            const progressValue = Math.min(rawProgress, rule.target);
            const progressPercent = Math.min(Math.round((progressValue / rule.target) * 100), 100);
            const achievedDate = unlockedById.get(achievement.id) ?? null;
            const unlocked = achievedDate !== null;
            const hiddenSecret = Boolean(rule.isSecret) && !unlocked;
            return {
                ...mapAchievement(achievement),
                is_secret: Boolean(rule.isSecret),
                unlocked,
                achieved_date: achievedDate,
                progress_value: progressValue,
                progress_target: rule.target,
                progress_percent: progressPercent,
                progress_label: `${progressValue.toLocaleString("ru-RU")} / ${rule.target.toLocaleString("ru-RU")}`,
                display_name: hiddenSecret ? "Секретное достижение" : achievement.name,
                display_description: hiddenSecret
                    ? "Условие скрыто. Откройте достижение, чтобы увидеть детали."
                    : achievement.description,
            };
        });
        res.json({
            partner_id: partner.id,
            name: partner.name,
            current_xp: partner.current_xp,
            rating: partner.rating,
            current_level: currentLevel.level_name,
            xp_coefficient: currentLevel.xp_coefficient,
            commission_rate: calculateCommissionRate(currentLevel.xp_threshold),
            loyalty_levels: levels.map((level) => ({
                level_id: level.id,
                level_name: level.level_name,
                xp_threshold: level.xp_threshold,
                xp_coefficient: level.xp_coefficient,
                xp_rule_description: getXpRuleDescription(level.xp_coefficient),
                commission_rate: calculateCommissionRate(level.xp_threshold),
            })),
            xp_policy: {
                formula: "XP = (оборот / 100) * коэффициент уровня * коэффициент рейтинга",
                deductions: [
                    "Операционный сбор: -10% от XP сделки",
                    "Штраф за мелкую сделку до 1 000 ₽: -1 XP",
                    "Штраф рейтинга ниже 4.5: -15% от XP сделки",
                ],
            },
            achievements: partner.partner_achievements.map((partnerAchievement) => ({
                ...mapAchievement(partnerAchievement.achievement),
                achieved_date: partnerAchievement.achieved_date,
            })),
            achievements_catalog: achievementsCatalog,
            next_level: nextLevel
                ? {
                    level_name: nextLevel.level_name,
                    xp_needed: Math.max(nextLevel.xp_threshold - partner.current_xp, 0),
                }
                : null,
        });
    }
    catch (error) {
        console.error("Error fetching partner stats:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
gamificationRouter.get("/xp-history", async (_req, res) => {
    try {
        const xpHistory = await prisma_1.prisma.xpAccrual.findMany({
            where: {
                order: {
                    partner_id: SANDBOX_PARTNER_ID,
                },
            },
            include: {
                order: true,
            },
            orderBy: [{ accrual_date: "desc" }, { id: "desc" }],
        });
        res.json(xpHistory.map((item) => ({
            accrual_id: item.id,
            order_id: `ORDER-${item.order_id}`,
            deal_amount: item.order.deal_amount,
            xp_amount: item.xp_amount,
            accrual_date: item.accrual_date,
            description: item.description,
        })));
    }
    catch (error) {
        console.error("Error fetching XP history:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
gamificationRouter.post("/simulate-sale", async (req, res) => {
    try {
        const rawDealAmount = req.body
            ?.deal_amount;
        let dealAmount;
        if (rawDealAmount === undefined ||
            rawDealAmount === null ||
            rawDealAmount === "") {
            dealAmount = (0, crypto_1.randomInt)(MIN_DEAL_AMOUNT, MAX_DEAL_AMOUNT + 1);
        }
        else {
            const parsed = Number(rawDealAmount);
            if (!Number.isFinite(parsed) ||
                !Number.isInteger(parsed) ||
                parsed < MIN_MANUAL_DEAL_AMOUNT ||
                parsed > MAX_MANUAL_DEAL_AMOUNT) {
                res.status(400).json({
                    error: `deal_amount must be an integer between ${MIN_MANUAL_DEAL_AMOUNT} and ${MAX_MANUAL_DEAL_AMOUNT}`,
                });
                return;
            }
            dealAmount = parsed;
        }
        const result = await prisma_1.prisma.$transaction(async () => {
            const partner = await prisma_1.prisma.partner.findUnique({
                where: { id: SANDBOX_PARTNER_ID },
            });
            if (!partner) {
                throw new Error("PARTNER_NOT_FOUND");
            }
            const levels = await prisma_1.prisma.loyaltyLevel.findMany({
                orderBy: { xp_threshold: "asc" },
            });
            const previousLevel = getCurrentLevel(levels, partner.current_xp);
            const ratingMultiplier = getRatingMultiplier(partner.rating);
            const rawSaleXp = Math.round((dealAmount / 100) *
                previousLevel.xp_coefficient *
                ratingMultiplier);
            const operationalFeeXp = Math.floor(rawSaleXp * 0.1);
            const lowCheckPenaltyXp = dealAmount <= 1000 ? 1 : 0;
            const lowRatingPenaltyXp = partner.rating < 4.5 ? Math.ceil(rawSaleXp * 0.15) : 0;
            const totalPenaltyXp = operationalFeeXp + lowCheckPenaltyXp + lowRatingPenaltyXp;
            const netSaleXp = Math.max(rawSaleXp - totalPenaltyXp, 1);
            const order = await prisma_1.prisma.order.create({
                data: {
                    partner_id: SANDBOX_PARTNER_ID,
                    loyalty_level_id: previousLevel.id,
                    deal_amount: dealAmount,
                },
            });
            await prisma_1.prisma.xpAccrual.create({
                data: {
                    order_id: order.id,
                    xp_amount: rawSaleXp,
                    description: `Базовый XP за сделку: ${dealAmount.toLocaleString("ru-RU")} ₽`,
                },
            });
            if (totalPenaltyXp > 0) {
                const penaltyParts = [];
                if (operationalFeeXp > 0)
                    penaltyParts.push(`операционный сбор ${operationalFeeXp} XP`);
                if (lowCheckPenaltyXp > 0)
                    penaltyParts.push(`мелкая сделка ${lowCheckPenaltyXp} XP`);
                if (lowRatingPenaltyXp > 0)
                    penaltyParts.push(`низкий рейтинг ${lowRatingPenaltyXp} XP`);
                await prisma_1.prisma.xpAccrual.create({
                    data: {
                        order_id: order.id,
                        xp_amount: -totalPenaltyXp,
                        description: `Штрафы: ${penaltyParts.join(", ")}`,
                    },
                });
            }
            const xpAfterSale = Math.max(partner.current_xp + netSaleXp, 0);
            const [existingPartnerAchievements, achievements, totalOrders, totalSales, maxDeal,] = await Promise.all([
                prisma_1.prisma.partnerAchievement.findMany({
                    where: { partner_id: SANDBOX_PARTNER_ID },
                    select: { achievement_id: true },
                }),
                prisma_1.prisma.achievement.findMany({ orderBy: { id: "asc" } }),
                prisma_1.prisma.order.count({ where: { partner_id: SANDBOX_PARTNER_ID } }),
                prisma_1.prisma.order.aggregate({
                    where: { partner_id: SANDBOX_PARTNER_ID },
                    _sum: { deal_amount: true },
                }),
                prisma_1.prisma.order.aggregate({
                    where: { partner_id: SANDBOX_PARTNER_ID },
                    _max: { deal_amount: true },
                }),
            ]);
            const unlockedAchievementIds = new Set(existingPartnerAchievements.map((item) => item.achievement_id));
            const newAchievements = [];
            let achievementBonusXp = 0;
            const metrics = {
                orders: totalOrders,
                sales_amount: totalSales._sum.deal_amount ?? 0,
                xp: xpAfterSale,
                max_deal: maxDeal._max.deal_amount ?? 0,
            };
            for (const achievement of achievements) {
                if (unlockedAchievementIds.has(achievement.id)) {
                    continue;
                }
                const rule = ACHIEVEMENT_RULES[achievement.name];
                if (!rule) {
                    continue;
                }
                const progress = getMetricValue(metrics, rule.metric);
                if (progress < rule.target) {
                    continue;
                }
                await prisma_1.prisma.partnerAchievement.create({
                    data: {
                        partner_id: SANDBOX_PARTNER_ID,
                        achievement_id: achievement.id,
                    },
                });
                await prisma_1.prisma.xpAccrual.create({
                    data: {
                        order_id: order.id,
                        xp_amount: achievement.xp_reward,
                        description: `Достижение: ${achievement.name}`,
                    },
                });
                unlockedAchievementIds.add(achievement.id);
                achievementBonusXp += achievement.xp_reward;
                metrics.xp += achievement.xp_reward;
                newAchievements.push(mapAchievement(achievement));
            }
            const finalXp = Math.max(xpAfterSale + achievementBonusXp, 0);
            const updatedPartner = await prisma_1.prisma.partner.update({
                where: { id: SANDBOX_PARTNER_ID },
                data: { current_xp: finalXp },
            });
            const currentLevel = getCurrentLevel(levels, updatedPartner.current_xp);
            return {
                dealAmount,
                rawSaleXp,
                netSaleXp,
                operationalFeeXp,
                lowCheckPenaltyXp,
                lowRatingPenaltyXp,
                totalPenaltyXp,
                achievementBonusXp,
                totalXpGained: netSaleXp + achievementBonusXp,
                totalXp: updatedPartner.current_xp,
                previousLevel,
                currentLevel,
                newAchievements,
            };
        });
        res.json({
            success: true,
            deal_amount: result.dealAmount,
            raw_xp: result.rawSaleXp,
            xp_gained: result.netSaleXp,
            penalty_xp: result.totalPenaltyXp,
            penalty_breakdown: {
                operational_fee_xp: result.operationalFeeXp,
                low_check_penalty_xp: result.lowCheckPenaltyXp,
                low_rating_penalty_xp: result.lowRatingPenaltyXp,
            },
            achievement_bonus_xp: result.achievementBonusXp,
            total_xp_gained: result.totalXpGained,
            total_xp: result.totalXp,
            previous_level: result.previousLevel.level_name,
            current_level: result.currentLevel.level_name,
            level_up: result.currentLevel.id !== result.previousLevel.id,
            new_achievements: result.newAchievements,
            message: `Сделка подтверждена. +${result.totalXpGained} XP (чистыми).`,
        });
    }
    catch (error) {
        if (error instanceof Error && error.message === "PARTNER_NOT_FOUND") {
            res.status(404).json({ error: "Partner not found" });
            return;
        }
        console.error("Error simulating sale:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
gamificationRouter.post("/reset-sandbox", async (_req, res) => {
    try {
        const partner = await prisma_1.prisma.partner.findUnique({
            where: { id: SANDBOX_PARTNER_ID },
            select: { id: true },
        });
        if (!partner) {
            res.status(404).json({ error: "Partner not found" });
            return;
        }
        await prisma_1.prisma.$transaction(async () => {
            await prisma_1.prisma.xpAccrual.deleteMany({
                where: {
                    order: {
                        partner_id: SANDBOX_PARTNER_ID,
                    },
                },
            });
            await prisma_1.prisma.partnerAchievement.deleteMany({
                where: { partner_id: SANDBOX_PARTNER_ID },
            });
            await prisma_1.prisma.order.deleteMany({
                where: { partner_id: SANDBOX_PARTNER_ID },
            });
            await prisma_1.prisma.partner.update({
                where: { id: SANDBOX_PARTNER_ID },
                data: {
                    current_xp: 0,
                },
            });
        });
        res.json({
            success: true,
            message: "Sandbox reset complete: XP, orders and achievements were cleared.",
        });
    }
    catch (error) {
        console.error("Error resetting sandbox:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=gamification.routes.js.map