import bcrypt from "bcrypt";
import { getPasswordHashSaltRounds } from "../../../../../common/config/password-hash";

const SALT_ROUNDS = getPasswordHashSaltRounds();

export class ProfilePasswordHasherGateway {
  async compare(plainText: string, hashedValue: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainText, hashedValue);
    } catch {
      return plainText === hashedValue;
    }
  }

  hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, SALT_ROUNDS);
  }
}
