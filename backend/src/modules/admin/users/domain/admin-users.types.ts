export type UserStatusValue = "ACTIVE" | "BLOCKED";
export type UserRoleValue = "BUYER" | "SELLER";

export type AdminAuditWriteInput = {
  actorUserId: number;
  requestIp: string | null;
  action: "user.status_changed" | "user.role_changed";
  entityPublicId: string;
  details: Record<string, unknown>;
};

export interface AdminAuditWriterPort {
  write(input: AdminAuditWriteInput): Promise<void>;
}

export type AdminUserListRecord = {
  id: number;
  public_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  joined_at: Date;
  phone: string | null;
  block_reason: string | null;
  blocked_until: Date | null;
  addresses: Array<{ city: string; region: string }>;
  seller_profile: {
    is_verified: boolean;
    average_response_minutes: number | null;
  } | null;
  orders_as_buyer: Array<{
    public_id: string;
    status: string;
    total_price: number;
    created_at: Date;
  }>;
  orders_as_seller: Array<{
    public_id: string;
    status: string;
    total_price: number;
    created_at: Date;
  }>;
  listings: Array<{
    public_id: string;
    status: string;
    moderation_status: string;
    created_at: Date;
  }>;
  complaints_reported: Array<{ id: number }>;
  complaints_against: Array<{ id: number }>;
  kyc_requests: Array<{
    public_id: string;
    status: string;
    created_at: Date;
    reviewed_at: Date | null;
  }>;
};

export type AdminUserSanctionAggregate = {
  approvedViolationsByUser: Map<number, number>;
  sanctionsTotalByUser: Map<number, number>;
  activeSanctionsByUser: Map<number, number>;
  latestSanctionByUser: Map<
    number,
    {
      public_id: string;
      level: string;
      status: "ACTIVE" | "COMPLETED";
      starts_at: Date;
      ends_at: Date | null;
      reason: string;
      created_at: Date;
    }
  >;
};

export interface AdminUsersRepositoryPort {
  listUsers(): Promise<AdminUserListRecord[]>;
  loadSanctionAggregate(userIds: number[]): Promise<AdminUserSanctionAggregate>;
  findUserForStatusUpdate(publicId: string): Promise<{
    id: number;
    public_id: string;
    role: string;
    status: string;
    block_reason: string | null;
    blocked_until: Date | null;
  } | null>;
  updateUserStatus(params: {
    userId: number;
    status: UserStatusValue;
    blockReason: string | null;
  }): Promise<{
    status: string;
    blocked_until: Date | null;
    block_reason: string | null;
  }>;
  findUserForRoleUpdate(publicId: string): Promise<{
    id: number;
    public_id: string;
    role: string;
  } | null>;
  updateUserRole(params: {
    userId: number;
    role: UserRoleValue;
  }): Promise<void>;
}
