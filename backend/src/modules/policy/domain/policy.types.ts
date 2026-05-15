import type { PolicyScope } from "@prisma/client";

export type ActivePolicyRecord = {
  id: number;
  public_id: string;
  scope: PolicyScope;
  version: string;
  title: string;
  content_url: string;
  activated_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type PolicyAcceptanceStatus = {
  hasActivePolicy: boolean;
  accepted: boolean;
  policy: ActivePolicyRecord | null;
  acceptedAt: Date | null;
};

export type AcceptPolicyResult =
  | {
      ok: true;
      policy: ActivePolicyRecord;
    }
  | {
      ok: false;
      code: "POLICY_NOT_FOUND" | "POLICY_VERSION_MISMATCH";
      message: string;
      policy?: ActivePolicyRecord;
    };
