"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const session_1 = require("../../lib/session");
const format_1 = require("../../utils/format");
const bcrypt_1 = __importDefault(require("bcrypt"));
const authRouter = (0, express_1.Router)();
exports.authRouter = authRouter;
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
authRouter.post("/login", async (req, res) => {
    try {
        const body = (req.body ?? {});
        const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (!email || !password) {
            res.status(400).json({ error: "Email and password are required" });
            return;
        }
        const user = await prisma_1.prisma.appUser.findUnique({
            where: { email },
            select: {
                id: true,
                public_id: true,
                role: true,
                status: true,
                email: true,
                name: true,
                password: true,
                wishlist_items: {
                    select: {
                        listing: {
                            select: {
                                public_id: true,
                            },
                        },
                    },
                },
            },
        });
        if (!user) {
            res.status(401).json({ error: "Неверный email или пароль" });
            return;
        }
        const passwordMatch = await bcrypt_1.default.compare(password, user.password);
        if (!passwordMatch) {
            res.status(401).json({ error: "Неверный email или пароль" });
            return;
        }
        if (user.status === "BLOCKED") {
            res.status(403).json({ error: "Пользователь заблокирован" });
            return;
        }
        res.json({
            user: {
                id: user.id,
                public_id: user.public_id,
                role: (0, format_1.toClientRole)(user.role),
                email: user.email,
                name: user.name,
            },
            profile: {
                wishlist: user.wishlist_items.map((item) => ({ id: item.listing.public_id })),
            },
        });
    }
    catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
authRouter.post("/signup", async (req, res) => {
    try {
        const body = (req.body ?? {});
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (!name || !email || !password) {
            res.status(400).json({ error: "Name, email and password are required" });
            return;
        }
        const existing = await prisma_1.prisma.appUser.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({ error: "Пользователь с таким email уже существует" });
            return;
        }
        const sequence = await prisma_1.prisma.appUser.count({
            where: {
                role: "BUYER",
            },
        });
        const publicId = `USR-${String(sequence + 1000).padStart(3, "0")}`;
        const saltRounds = 10;
        const hashedPassword = await bcrypt_1.default.hash(password, saltRounds);
        const user = await prisma_1.prisma.appUser.create({
            data: {
                public_id: publicId,
                role: "BUYER",
                status: "ACTIVE",
                email,
                password: hashedPassword,
                name,
                display_name: name,
                username: username || null,
            },
            select: {
                id: true,
                public_id: true,
                role: true,
                email: true,
                name: true,
            },
        });
        res.status(201).json({
            user: {
                id: user.id,
                public_id: user.public_id,
                role: (0, format_1.toClientRole)(user.role),
                email: user.email,
                name: user.name,
            },
            profile: {
                wishlist: [],
            },
        });
    }
    catch (error) {
        console.error("Error during signup:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
authRouter.get("/me", async (req, res) => {
    try {
        const user = await (0, session_1.getSessionUser)(req);
        if (!user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        res.json({
            user: {
                id: user.id,
                public_id: user.public_id,
                role: (0, format_1.toClientRole)(user.role),
                email: user.email,
                name: user.name,
            },
        });
    }
    catch (error) {
        console.error("Error fetching session user:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=auth.routes.js.map