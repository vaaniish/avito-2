import bcrypt from "bcrypt";

export class ProfilePasswordHasherGateway {
  async compare(plainText: string, hashedValue: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainText, hashedValue);
    } catch {
      return plainText === hashedValue;
    }
  }

  hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, 10);
  }
}
