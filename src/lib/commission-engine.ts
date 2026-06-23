import { AdjustmentKind, PayFrequency, PlacementStatus } from '@prisma/client';
import { endOfMonth, monthName, toIsoDate } from '@/lib/dates';
import { roundMoney } from '@/lib/money';

export type PlanInput = {
  year: number;
  annualGoal: number;
  commissionRate: number;
  salaryPerPayPeriod: number;
  payFrequency: PayFrequency | keyof typeof PayFrequency | string;
  monthlyPayoutRate: number;
  quarterlyTrueUp: boolean;
  openingBalance: number;
};

export type PlacementInput = {
  id: string;
  placementName: string;
  paymentDate: Date | string;
  billAmount: number;
  payoutOverride?: number | null;
  status: PlacementStatus | keyof typeof PlacementStatus | string;
};

export type AdjustmentInput = {
  id: string;
  effectiveDate: Date | string;
  amount: number;
  kind: AdjustmentKind | keyof typeof AdjustmentKind | string;
};

export type LedgerRowType = 'OPENING' | 'DRAW' | 'MONTHLY_CLOSE' | 'QUARTERLY_TRUE_UP' | 'ANNUAL_CHECK';

export type LedgerRow = {
  type: LedgerRowType;
  date: string;
  label: string;
  month: number | null;
  sales: number;
  commissionEarned: number;
  drawPaid: number;
  payout: number;
  endingBalance: number;
  annualSalesToDate: number;
  annualGoalRemaining: number;
};

export type LedgerSummary = {
  year: number;
  annualGoal: number;
  salesToDate: number;
  remainingGoal: number;
  commissionEarned: number;
  drawPaid: number;
  paidOut: number;
  endingBalance: number;
  projectedPayoutAvailable: number;
};

export type LedgerResult = {
  rows: LedgerRow[];
  summary: LedgerSummary;
};

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function monthIndex(value: Date | string) {
  return asDate(value).getUTCMonth();
}

function yearOf(value: Date | string) {
  return asDate(value).getUTCFullYear();
}

function isLastMonthOfQuarter(month: number) {
  return month === 2 || month === 5 || month === 8 || month === 11;
}

export function generatePayDates(year: number, frequency: string): Date[] {
  if (frequency === 'MONTHLY') {
    return Array.from({ length: 12 }, (_, month) => endOfMonth(year, month));
  }

  if (frequency === 'BI_WEEKLY') {
    const dates: Date[] = [];
    let cursor = new Date(Date.UTC(year, 0, 2, 12, 0, 0));
    while (cursor.getUTCFullYear() === year) {
      dates.push(new Date(cursor));
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 14, 12, 0, 0));
    }
    return dates;
  }

  const dates: Date[] = [];
  for (let month = 0; month < 12; month++) {
    dates.push(new Date(Date.UTC(year, month, 15, 12, 0, 0)));
    dates.push(endOfMonth(year, month));
  }
  return dates;
}

export function calculatePlacementCommission(placement: PlacementInput, commissionRate: number) {
  if (placement.status !== 'PAID') return 0;
  if (placement.payoutOverride !== null && placement.payoutOverride !== undefined && Number.isFinite(placement.payoutOverride)) {
    return roundMoney(Number(placement.payoutOverride));
  }
  return roundMoney(Number(placement.billAmount) * commissionRate);
}

export function buildCommissionLedger(plan: PlanInput, placements: PlacementInput[], adjustments: AdjustmentInput[]): LedgerResult {
  const payDates = generatePayDates(plan.year, String(plan.payFrequency));
  const rows: LedgerRow[] = [];
  let balance = roundMoney(plan.openingBalance || 0);
  let annualSales = 0;
  let annualCommission = 0;
  let annualDraws = 0;
  let annualPayouts = 0;

  rows.push({
    type: 'OPENING',
    date: `${plan.year}-01-01`,
    label: 'Opening balance',
    month: null,
    sales: 0,
    commissionEarned: 0,
    drawPaid: 0,
    payout: 0,
    endingBalance: balance,
    annualSalesToDate: 0,
    annualGoalRemaining: roundMoney(plan.annualGoal)
  });

  for (let month = 0; month < 12; month++) {
    const monthPayDates = payDates.filter((date) => date.getUTCMonth() === month);
    const openingBalance = balance;
    let monthDraws = 0;
    let monthPayouts = 0;

    for (const payDate of monthPayDates) {
      monthDraws = roundMoney(monthDraws + plan.salaryPerPayPeriod);
      annualDraws = roundMoney(annualDraws + plan.salaryPerPayPeriod);
      balance = roundMoney(balance - plan.salaryPerPayPeriod);
      rows.push({
        type: 'DRAW',
        date: toIsoDate(payDate),
        label: `${monthName(month)} draw`,
        month,
        sales: 0,
        commissionEarned: 0,
        drawPaid: plan.salaryPerPayPeriod,
        payout: 0,
        endingBalance: balance,
        annualSalesToDate: annualSales,
        annualGoalRemaining: roundMoney(Math.max(0, plan.annualGoal - annualSales))
      });
    }

    const monthPlacements = placements.filter((placement) => {
      const date = asDate(placement.paymentDate);
      return yearOf(date) === plan.year && monthIndex(date) === month && placement.status === 'PAID';
    });

    const monthSales = roundMoney(monthPlacements.reduce((sum, placement) => sum + Number(placement.billAmount), 0));
    let monthCommission = roundMoney(
      monthPlacements.reduce((sum, placement) => sum + calculatePlacementCommission(placement, plan.commissionRate), 0)
    );

    const monthAdjustments = adjustments.filter((adjustment) => {
      const date = asDate(adjustment.effectiveDate);
      return yearOf(date) === plan.year && monthIndex(date) === month;
    });

    const commissionAdjustments = roundMoney(
      monthAdjustments
        .filter((adjustment) => adjustment.kind === 'COMMISSION' || adjustment.kind === 'MANUAL')
        .reduce((sum, adjustment) => sum + Number(adjustment.amount), 0)
    );

    const drawAdjustments = roundMoney(
      monthAdjustments
        .filter((adjustment) => adjustment.kind === 'DRAW')
        .reduce((sum, adjustment) => sum + Number(adjustment.amount), 0)
    );

    const manualPayoutAdjustments = roundMoney(
      monthAdjustments
        .filter((adjustment) => adjustment.kind === 'PAYOUT')
        .reduce((sum, adjustment) => sum + Number(adjustment.amount), 0)
    );

    monthCommission = roundMoney(monthCommission + commissionAdjustments);
    annualSales = roundMoney(annualSales + monthSales);
    annualCommission = roundMoney(annualCommission + monthCommission);

    balance = roundMoney(balance + monthCommission + drawAdjustments);

    // Monthly payout mirrors the source spreadsheet exactly:
    //   payout = max(0, monthlyPayoutRate * commission - drawsThisMonth + priorNegativeCarry)
    // and it only fires in a month where commission exceeds the draws advanced that
    // month. In a "dry" month (no/low commission) no monthly payout is released, so the
    // held-back portion (the 1 - monthlyPayoutRate slice) stays in the balance and is
    // only released by the quarterly true-up below. Only a *negative* prior balance
    // (unrecovered draw) is carried into the monthly payout; positive held-back commission
    // is never released early. See docs/SPREADSHEET_MAPPING.md.
    const carriedNegativeBalance = Math.min(0, openingBalance);
    const monthlyEligible = roundMoney(
      monthCommission * plan.monthlyPayoutRate - monthDraws + drawAdjustments + carriedNegativeBalance
    );
    const commissionExceedsDraw = monthCommission > monthDraws;
    const monthlyPayout = commissionExceedsDraw ? roundMoney(Math.max(0, Math.min(balance, monthlyEligible))) : 0;
    monthPayouts = roundMoney(monthlyPayout + Math.max(0, manualPayoutAdjustments));
    balance = roundMoney(balance - monthPayouts);
    annualPayouts = roundMoney(annualPayouts + monthPayouts);

    rows.push({
      type: 'MONTHLY_CLOSE',
      date: toIsoDate(endOfMonth(plan.year, month)),
      label: `${monthName(month)} sales / commission close`,
      month,
      sales: monthSales,
      commissionEarned: monthCommission,
      drawPaid: 0,
      payout: monthPayouts,
      endingBalance: balance,
      annualSalesToDate: annualSales,
      annualGoalRemaining: roundMoney(Math.max(0, plan.annualGoal - annualSales))
    });

    if (plan.quarterlyTrueUp && isLastMonthOfQuarter(month)) {
      const trueUp = roundMoney(Math.max(0, balance));
      if (trueUp > 0) {
        balance = roundMoney(balance - trueUp);
        annualPayouts = roundMoney(annualPayouts + trueUp);
      }
      rows.push({
        type: 'QUARTERLY_TRUE_UP',
        date: toIsoDate(endOfMonth(plan.year, month)),
        label: `Q${Math.floor(month / 3) + 1} true-up`,
        month,
        sales: 0,
        commissionEarned: 0,
        drawPaid: 0,
        payout: trueUp,
        endingBalance: balance,
        annualSalesToDate: annualSales,
        annualGoalRemaining: roundMoney(Math.max(0, plan.annualGoal - annualSales))
      });
    }
  }

  rows.push({
    type: 'ANNUAL_CHECK',
    date: `${plan.year}-12-31`,
    label: 'Annual check',
    month: null,
    sales: 0,
    commissionEarned: 0,
    drawPaid: 0,
    payout: 0,
    endingBalance: balance,
    annualSalesToDate: annualSales,
    annualGoalRemaining: roundMoney(Math.max(0, plan.annualGoal - annualSales))
  });

  return {
    rows,
    summary: {
      year: plan.year,
      annualGoal: roundMoney(plan.annualGoal),
      salesToDate: roundMoney(annualSales),
      remainingGoal: roundMoney(Math.max(0, plan.annualGoal - annualSales)),
      commissionEarned: roundMoney(annualCommission),
      drawPaid: roundMoney(annualDraws),
      paidOut: roundMoney(annualPayouts),
      endingBalance: roundMoney(balance),
      projectedPayoutAvailable: roundMoney(Math.max(0, balance))
    }
  };
}
