import {
  signSessionToken,
  verifySessionToken,
} from "../../../lib/session-token";
import type { SessionTokenProvider } from "../application/auth.ports";

export class JwtSessionTokenProvider implements SessionTokenProvider {
  sign(userId: number): string {
    return signSessionToken(userId);
  }

  verify(token: string): number | null {
    return verifySessionToken(token);
  }
}
