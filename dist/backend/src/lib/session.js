"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionUser = getSessionUser;
exports.requireRole = requireRole;
exports.requireAnyRole = requireAnyRole;
const prisma_1 = require("./prisma");
const session_token_1 = require("./session-token");
function parseBearerToken(authorization) {
    if (!authorization)
        return null;
    const normalized = authorization.trim();
    if (!normalized)
        return null;
    const parts = normalized.split(/\s+/);
    if (parts.length !== 2)
        return null;
    if (parts[0].toLowerCase() !== "bearer")
        return null;
    const token = parts[1]?.trim();
    return token || null;
}
async function getSessionUser(req) {
    const bearerToken = parseBearerToken(req.header("authorization") ?? undefined);
    const resolvedId = bearerToken ? (0, session_token_1.verifySessionToken)(bearerToken) : null;
    if (!resolvedId) {
        return null;
    }
    const user = await prisma_1.prisma.appUser.findUnique({
        where: { id: resolvedId },
        select: {
            id: true,
            public_id: true,
            role: true,
            status: true,
            blocked_until: true,
            email: true,
            name: true,
        },
    });
    if (!user) {
        return null;
    }
    if (user.status === "BLOCKED" &&
        user.blocked_until &&
        user.blocked_until.getTime() <= Date.now()) {
        const unblocked = await prisma_1.prisma.appUser.update({
            where: { id: user.id },
            data: {
                status: "ACTIVE",
                block_reason: null,
                blocked_until: null,
            },
            select: {
                id: true,
                public_id: true,
                role: true,
                status: true,
                blocked_until: true,
                email: true,
                name: true,
            },
        });
        return unblocked;
    }
    return user;
}
async function requireRole(req, role) {
    const user = await getSessionUser(req);
    if (!user) {
        return { ok: false, status: 401, message: "Unauthorized" };
    }
    if (user.role !== role) {
        return { ok: false, status: 403, message: "Forbidden" };
    }
    if (user.status === "BLOCKED") {
        const message = user.blocked_until
            ? `User is temporarily blocked until ${user.blocked_until.toISOString()}`
            : "User is blocked";
        return { ok: false, status: 403, message };
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
    if (user.status === "BLOCKED") {
        const message = user.blocked_until
            ? `User is temporarily blocked until ${user.blocked_until.toISOString()}`
            : "User is blocked";
        return { ok: false, status: 403, message };
    }
    return { ok: true, user };
}
//# sourceMappingURL=session.js.map