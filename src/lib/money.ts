export function currency(value: number | null | undefined) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(safe);
}

export function percent(value: number | null | undefined) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${(safe * 100).toFixed(1)}%`;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
