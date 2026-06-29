import { prisma } from '@/lib/db';

export interface OrgGoals {
  year: number;
  billingGoal: number;
  interviewGoal: number;
  phoneMinutesGoal: number;
}

export interface RecruiterActivityGoals {
  interviewGoal: number;
  phoneMinutesGoal: number;
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Company goals for a year. Returns zeros (not null) when unset so the UI is simple. */
export async function getOrgGoals(year: number): Promise<OrgGoals> {
  const row = await prisma.orgGoal.findUnique({ where: { year } });
  return {
    year,
    billingGoal: num(row?.billingGoal),
    interviewGoal: num(row?.interviewGoal),
    phoneMinutesGoal: num(row?.phoneMinutesGoal)
  };
}

export async function setOrgGoals(input: OrgGoals): Promise<void> {
  await prisma.orgGoal.upsert({
    where: { year: input.year },
    update: {
      billingGoal: String(input.billingGoal),
      interviewGoal: Math.round(input.interviewGoal),
      phoneMinutesGoal: Math.round(input.phoneMinutesGoal)
    },
    create: {
      year: input.year,
      billingGoal: String(input.billingGoal),
      interviewGoal: Math.round(input.interviewGoal),
      phoneMinutesGoal: Math.round(input.phoneMinutesGoal)
    }
  });
}

/** Per-recruiter activity targets keyed by recruiterId for a year. */
export async function getActivityTargets(year: number): Promise<Map<string, RecruiterActivityGoals>> {
  const rows = await prisma.activityTarget.findMany({ where: { year } });
  const map = new Map<string, RecruiterActivityGoals>();
  for (const r of rows) {
    map.set(r.recruiterId, { interviewGoal: num(r.interviewGoal), phoneMinutesGoal: num(r.phoneMinutesGoal) });
  }
  return map;
}

export async function setActivityTarget(
  recruiterId: string,
  year: number,
  goals: RecruiterActivityGoals
): Promise<void> {
  await prisma.activityTarget.upsert({
    where: { recruiterId_year: { recruiterId, year } },
    update: {
      interviewGoal: Math.round(goals.interviewGoal),
      phoneMinutesGoal: Math.round(goals.phoneMinutesGoal)
    },
    create: {
      recruiterId,
      year,
      interviewGoal: Math.round(goals.interviewGoal),
      phoneMinutesGoal: Math.round(goals.phoneMinutesGoal)
    }
  });
}
