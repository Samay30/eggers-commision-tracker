import { notFound } from 'next/navigation';
import type { Adjustment, CommissionPlan, Placement, Recruiter } from '@prisma/client';
import { prisma } from '@/lib/db';
import { assertRecruiterAccess, isAdminLike, type CurrentUser } from '@/lib/auth';
import { buildCommissionLedger, type LedgerResult } from '@/lib/commission-engine';
import { decryptString } from '@/lib/encryption';
import { startOfYear, endOfYear } from '@/lib/dates';

export type RecruiterWithPlan = Recruiter & {
  user: { email: string; name: string; role: string } | null;
  plans: CommissionPlan[];
};

export type PlacementWithNote = Placement & { note: string | null };
export type AdjustmentWithReason = Adjustment & { reason: string | null };

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function safeDecrypt(ciphertext: string | null, iv: string | null, authTag: string | null): string | null {
  try {
    return decryptString({ ciphertext, iv, authTag });
  } catch {
    // Never let a decryption hiccup take down a page; surface a marker instead.
    return ciphertext ? '[unable to decrypt]' : null;
  }
}

export async function getAccessibleRecruiters(user: CurrentUser, year = new Date().getFullYear()) {
  const where = isAdminLike(user.role)
    ? {}
    : { id: user.recruiterProfile?.id ?? '__none__' };

  return prisma.recruiter.findMany({
    where,
    orderBy: [{ active: 'desc' }, { displayName: 'asc' }],
    include: {
      user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
      plans: { where: { year }, take: 1 }
    }
  });
}

export async function getRecruiter(user: CurrentUser, recruiterId: string) {
  assertRecruiterAccess(user, recruiterId);
  const recruiter = await prisma.recruiter.findUnique({
    where: { id: recruiterId },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
      plans: { orderBy: { year: 'desc' } }
    }
  });
  if (!recruiter) notFound();
  return recruiter;
}

/**
 * Placements and adjustments for a recruiter/year, independent of whether a
 * plan exists, with private notes/reasons decrypted for inline editing.
 * Used by the management UI so records can be edited even before a plan is set.
 */
export async function getRecruiterRecords(
  user: CurrentUser,
  recruiterId: string,
  year: number
): Promise<{ placements: PlacementWithNote[]; adjustments: AdjustmentWithReason[] }> {
  assertRecruiterAccess(user, recruiterId);

  const [placements, adjustments] = await Promise.all([
    prisma.placement.findMany({
      where: { recruiterId, paymentDate: { gte: startOfYear(year), lte: endOfYear(year) } },
      orderBy: { paymentDate: 'desc' }
    }),
    prisma.adjustment.findMany({
      where: { recruiterId, effectiveDate: { gte: startOfYear(year), lte: endOfYear(year) } },
      orderBy: { effectiveDate: 'desc' }
    })
  ]);

  return {
    placements: placements.map((p) => ({
      ...p,
      note: safeDecrypt(p.noteCiphertext, p.noteIv, p.noteAuthTag)
    })),
    adjustments: adjustments.map((a) => ({
      ...a,
      reason: safeDecrypt(a.reasonCiphertext, a.reasonIv, a.reasonAuthTag)
    }))
  };
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
