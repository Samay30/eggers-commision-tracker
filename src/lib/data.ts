import { notFound } from 'next/navigation';
import type { Adjustment, CommissionPlan, Placement, Recruiter } from '@prisma/client';
import { prisma } from '@/lib/db';
import { assertRecruiterAccess, isAdminLike, type CurrentUser } from '@/lib/auth';
import { buildCommissionLedger, type LedgerResult } from '@/lib/commission-engine';
import { startOfYear, endOfYear } from '@/lib/dates';

export type RecruiterWithPlan = Recruiter & {
  user: { email: string; name: string; role: string } | null;
  plans: CommissionPlan[];
};

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export async function getAccessibleRecruiters(user: CurrentUser, year = new Date().getFullYear()) {
  const where = isAdminLike(user.role)
    ? {}
    : { id: user.recruiterProfile?.id ?? '__none__' };

  return prisma.recruiter.findMany({
    where,
    orderBy: { displayName: 'asc' },
    include: {
      user: { select: { email: true, name: true, role: true } },
      plans: { where: { year }, take: 1 }
    }
  });
}

export async function getRecruiter(user: CurrentUser, recruiterId: string) {
  assertRecruiterAccess(user, recruiterId);
  const recruiter = await prisma.recruiter.findUnique({
    where: { id: recruiterId },
    include: {
      user: { select: { email: true, name: true, role: true } },
      plans: { orderBy: { year: 'desc' } }
    }
  });
  if (!recruiter) notFound();
  return recruiter;
}

export async function getLedger(user: CurrentUser, recruiterId: string, year: number): Promise<LedgerResult & { plan: CommissionPlan; placements: Placement[]; adjustments: Adjustment[] }> {
  assertRecruiterAccess(user, recruiterId);

  const plan = await prisma.commissionPlan.findUnique({
    where: { recruiterId_year: { recruiterId, year } }
  });

  if (!plan) {
    throw new Error(`No commission plan is configured for ${year}.`);
  }

  const [placements, adjustments] = await Promise.all([
    prisma.placement.findMany({
      where: {
        recruiterId,
        paymentDate: { gte: startOfYear(year), lte: endOfYear(year) }
      },
      orderBy: { paymentDate: 'asc' }
    }),
    prisma.adjustment.findMany({
      where: {
        recruiterId,
        effectiveDate: { gte: startOfYear(year), lte: endOfYear(year) }
      },
      orderBy: { effectiveDate: 'asc' }
    })
  ]);

  const ledger = buildCommissionLedger(
    {
      year: plan.year,
      annualGoal: decimalToNumber(plan.annualGoal),
      commissionRate: decimalToNumber(plan.commissionRate),
      salaryPerPayPeriod: decimalToNumber(plan.salaryPerPayPeriod),
      payFrequency: plan.payFrequency,
      monthlyPayoutRate: decimalToNumber(plan.monthlyPayoutRate),
      quarterlyTrueUp: plan.quarterlyTrueUp,
      openingBalance: decimalToNumber(plan.openingBalance)
    },
    placements.map((placement) => ({
      id: placement.id,
      placementName: placement.placementName,
      paymentDate: placement.paymentDate,
      billAmount: decimalToNumber(placement.billAmount),
      payoutOverride: placement.payoutOverride === null ? null : decimalToNumber(placement.payoutOverride),
      status: placement.status
    })),
    adjustments.map((adjustment) => ({
      id: adjustment.id,
      effectiveDate: adjustment.effectiveDate,
      amount: decimalToNumber(adjustment.amount),
      kind: adjustment.kind
    }))
  );

  return { ...ledger, plan, placements, adjustments };
}

export async function getAccessiblePlacements(user: CurrentUser) {
  const where = isAdminLike(user.role)
    ? {}
    : { recruiterId: user.recruiterProfile?.id ?? '__none__' };

  return prisma.placement.findMany({
    where,
    orderBy: { paymentDate: 'desc' },
    include: { recruiter: { select: { displayName: true } } },
    take: 200
  });
}
