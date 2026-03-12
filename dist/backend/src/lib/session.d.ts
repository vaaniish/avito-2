import { type Request } from "express";
type SessionUser = {
    id: number;
    public_id: string;
    role: string;
    status: "ACTIVE" | "BLOCKED";
    blocked_until: Date | null;
    email: string;
    name: string;
};
export declare function getSessionUser(req: Request): Promise<SessionUser | null>;
export declare function requireRole(req: Request, role: string): Promise<{
    ok: true;
    user: SessionUser;
} | {
    ok: false;
    message: string;
    status: number;
}>;
export declare function requireAnyRole(req: Request, roles: string[]): Promise<{
    ok: true;
    user: SessionUser;
} | {
    ok: false;
    message: string;
    status: number;
}>;
export {};
//# sourceMappingURL=session.d.ts.map