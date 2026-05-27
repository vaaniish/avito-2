function parsePasswordHashSaltRounds(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 4 || parsed > 31) {
    return fallback;
  }
  return parsed;
}

export function getPasswordHashSaltRounds(defaultRounds = 10): number {
  return parsePasswordHashSaltRounds(process.env.PASSWORD_HASH_SALT_ROUNDS, defaultRounds);
}
