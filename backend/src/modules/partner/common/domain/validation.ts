export function isValidTaxId(taxId: string): boolean {
  return taxId.length === 10 || taxId.length === 12;
}

export function isValidBic(bic: string): boolean {
  return bic.length === 9;
}

export function isValidBankAccount(account: string): boolean {
  return account.length === 20;
}

function hasValidBankChecksum(controlDigits: string, account: string): boolean {
  if (controlDigits.length !== 3 || account.length !== 20) return false;
  const combined = `${controlDigits}${account}`;
  if (combined.length !== 23) return false;

  const coefficients = [7, 1, 3];
  let checksum = 0;

  for (let index = 0; index < combined.length; index += 1) {
    const digit = Number(combined[index]);
    if (Number.isNaN(digit)) return false;
    checksum += (digit * coefficients[index % coefficients.length]) % 10;
  }

  return checksum % 10 === 0;
}

export function isValidSettlementBankAccount(account: string, bic: string): boolean {
  if (!isValidBankAccount(account) || !isValidBic(bic)) return false;
  return hasValidBankChecksum(bic.slice(-3), account);
}

export function isValidCorrespondentBankAccount(account: string, bic: string): boolean {
  if (!isValidBankAccount(account) || !isValidBic(bic)) return false;
  return hasValidBankChecksum(`0${bic.slice(4, 6)}`, account);
}
