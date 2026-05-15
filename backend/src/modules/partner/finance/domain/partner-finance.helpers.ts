export function formatQuarterLabel(periodKey: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(periodKey);
  if (!match) return periodKey;
  return `${match[2]} квартал ${match[1]}`;
}
