export function parseToCents(amount: string | number): number {
  if (typeof amount === 'number') {
    amount = amount.toString();
  }
  const clean = amount.replace(/[^\d.-]/g, '');
  const [dollars, cents = '00'] = clean.split('.');
  const paddedCents = (cents + '00').slice(0, 2);
  const totalCents = parseInt(dollars || '0', 10) * 100 + parseInt(paddedCents, 10);
  return amount.startsWith('-') && totalCents > 0 ? -totalCents : totalCents;
}

export function formatFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function sumCents(amounts: number[]): number {
  return amounts.reduce((acc, curr) => acc + curr, 0);
}
