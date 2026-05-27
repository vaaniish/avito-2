import bcrypt from "bcrypt";
import { getPasswordHashSaltRounds } from "../../../common/config/password-hash";
import type { PasswordHasher } from "../application/auth.ports";

const SALT_ROUNDS = getPasswordHashSaltRounds();

export class BcryptPasswordHasher implements PasswordHasher {
  compare(raw: string, hash: string): Promise<boolean> {
    return bcrypt.compare(raw, hash);
  }

  hash(raw: string): Promise<string> {
    return bcrypt.hash(raw, SALT_ROUNDS);
  }
}
