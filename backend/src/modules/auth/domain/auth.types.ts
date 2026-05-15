export type AuthUserView = {
  id: number;
  public_id: string;
  role: string;
  email: string;
  name: string;
};

export type AuthProfileView = {
  wishlist: Array<{ id: string }>;
};

export type AuthSuccessResult = {
  user: AuthUserView;
  sessionToken: string;
  profile: AuthProfileView;
};

export type SessionUser = {
  id: number;
  publicId: string;
  role: string;
  status: "ACTIVE" | "BLOCKED";
  blockedUntil: Date | null;
  email: string;
  name: string;
};
