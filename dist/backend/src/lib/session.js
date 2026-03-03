"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionUser = getSessionUser;
exports.requireRole = requireRole;
exports.requireAnyRole = requireAnyRole;
const prisma_1 = require("./prisma");
function parseUserId(raw) {
    if (!raw)
        return null;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}
async function getSessionUser(req) {
    const fromHeader = parseUserId(req.header("x-user-id") ?? undefined);
    const fromQuery = parseUserId(typeof req.query.user_id === "string" ? req.query.user_id : undefined);
    const resolvedId = fromHeader ?? fromQuery ?? 1;
    const user = await prisma_1.prisma.appUser.findUnique({
        where: { id: resolvedId },
        select: {
            id: true,
            public_id: true,
            role: true,
            email: true,
            name: true,
        },
    });
    return user ?? null;
}
async function requireRole(req, role) {
    const user = await getSessionUser(req);
    if (!user) {
        return { ok: false, status: 401, message: "Unauthorized" };
    }
    if (user.role !== role) {
        return { ok: false, status: 403, message: "Forbidden" };
    }
    return { ok: true, user };
}
async function requireAnyRole(req, roles) {
    const user = await getSessionUser(req);
    if (!user) {
        return { ok: false, status: 401, message: "Unauthorized" };
    }
    if (!roles.includes(user.role)) {
        return { ok: false, status: 403, message: "Forbidden" };
    }
    return { ok: true, user };
}
//# sourceMappingURL=session.js.map