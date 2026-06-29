import { PlacementStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { isAdminLike, type CurrentUser } from '@/lib/auth';
import { startOfYear, endOfYear } from '@/lib/dates';
import { getOrgGoals, getActivityTargets } from '@/lib/goals';

export interface RecruiterScoreRow {
  recruiterId: string;
  displayName: string;
  email: string | null;
  active: boolean;
  billingGoal: number;
  billings: number;
  interviews: number;
  interviewGoal: number;
  phoneMinutes: number;
  phoneMinutesGoal: number;
}

export interface GoalDashboardData {
  year: number;
  isAdmin: boolean;
  org: {
    billingGoal: number;
    billings: number;
    interviews: number;
    interviewGoal: number;
    phoneMinutes: number;
    phoneMinutesGoal: number;
  };
  rows: RecruiterScoreRow[];
}

function pct(value: number, goal: number) {
  if (!goal || goal <= 0) return 0;
  return Math.min(100, Math.round((value / goal) * 100));
}

export { pct as goalPercent };

/**
 * Everything the goal dashboard needs in one query pass: billings (from
 * placements, so it works even before a commission plan exists), interviews,
 * and phone time, per accessible recruiter, plus company totals and goals.
 *
 * Access: admins/owners see all recruiters and company totals; a recruiter sees
 * only their own row and their own numbers (never company-wide figures).
 */
export async function getGoalDashboard(
  user: CurrentUser,
  year = new Date().getFullYear()
): Promise<GoalDashboardData> {
  const admin = isAdminLike(user.role);
  const yStart = startOfYear(year);
  const yEnd = endOfYear(year);

  const recruiterWhere = admin ? {} : { id: user.recruiterProfile?.id ?? '__none__' };

  const recruiters = await prisma.recruiter.findMany({
    where: recruiterWhere,
    orderBy: [{ active: 'desc' }, { displayName: 'asc' }],
    include: {
      user: { select: { email: true } },
      plans: { where: { year }, take: 1 }
    }
  });

  const recruiterIds = recruiters.map((r) => r.id);
  const scopeWhere = { recruiterId: { in: recruiterIds.length ? recruiterIds : ['__none__'] } };

  const [billingGroups, callGroups, interviewGroups, targets, orgGoals] = await Promise.all([
    prisma.placement.groupBy({
      by: ['recruiterId'],
      where: { ...scopeWhere, status: { not: PlacementStatus.CANCELED }, paymentDate: { gte: yStart, lte: yEnd } },
      _sum: { billAmount: true }
    }),
    prisma.callActivityDay.groupBy({
      by: ['recruiterId'],
      where: { ...scopeWhere, date: { gte: yStart, lte: yEnd } },
      _sum: { talkSeconds: true }
    }),
    prisma.interviewActivityDay.groupBy({
      by: ['recruiterId'],
      where: { ...scopeWhere, date: { gte: yStart, lte: yEnd } },
      _sum: { interviews: true }
    }),
    getActivityTargets(year),
    getOrgGoals(year)
  ]);

  const billingBy = new Map<string, number>();
  for (const g of billingGroups) billingBy.set(g.recruiterId, Number(g._sum.billAmount ?? 0));
  const talkBy = new Map<string, number>();
  for (const g of callGroups) talkBy.set(g.recruiterId, Number(g._sum.talkSeconds ?? 0));
  const interviewBy = new Map<string, number>();
  for (const g of interviewGroups) interviewBy.set(g.recruiterId, Number(g._sum.interviews ?? 0));

  const rows: RecruiterScoreRow[] = recruiters.map((r) => {
    const target = targets.get(r.id);
    return {
      recruiterId: r.id,
      displayName: r.displayName,
      email: r.user?.email ?? null,
      active: r.active,
      billingGoal: Number(r.plans[0]?.annualGoal ?? 0),
      billings: billingBy.get(r.id) ?? 0,
      interviews: interviewBy.get(r.id) ?? 0,
      interviewGoal: target?.interviewGoal ?? 0,
      phoneMinutes: Math.round((talkBy.get(r.id) ?? 0) / 60),
      phoneMinutesGoal: target?.phoneMinutesGoal ?? 0
    };
  });

  // Company totals come from the full recruiter set when admin; for a recruiter
  // the "org" block just mirrors their own numbers (we never leak firm totals).
  const org = rows.reduce(
    (acc, row) => {
      acc.billings += row.billings;
      acc.interviews += row.interviews;
      acc.phoneMinutes += row.phoneMinutes;
      return acc;
    },
    { billings: 0, interviews: 0, phoneMinutes: 0 }
  );

  return {
    year,
    isAdmin: admin,
    org: {
      billingGoal: admin ? orgGoals.billingGoal : rows[0]?.billingGoal ?? 0,
      billings: org.billings,
      interviews: org.interviews,
      interviewGoal: admin ? orgGoals.interviewGoal : rows[0]?.interviewGoal ?? 0,
      phoneMinutes: org.phoneMinutes,
      phoneMinutesGoal: admin ? orgGoals.phoneMinutesGoal : rows[0]?.phoneMinutesGoal ?? 0
    },
    rows
  };
}
