export function isValidTaxId(taxId: string): boolean {
  return taxId.length === 10 || taxId.length === 12;
}

export function isValidBic(bic: string): boolean {
  return bic.length === 9;
}

export function isValidBankAccount(account: string): boolean {
  return account.length === 20;
}
