'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminLike } from '@/lib/auth';
import { setOrgGoals, setActivityTarget } from '@/lib/goals';

function n(formData: FormData, key: string) {
  const v = Number(formData.get(key));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export async function saveOrgGoalsAction(formData: FormData) {
  await requireAdminLike();
  const year = Number(formData.get('year')) || new Date().getFullYear();
  await setOrgGoals({
    year,
    billingGoal: n(formData, 'billingGoal'),
    interviewGoal: n(formData, 'interviewGoal'),
    phoneMinutesGoal: n(formData, 'phoneMinutesGoal')
  });
  revalidatePath('/goals');
  revalidatePath('/dashboard');
}

export async function saveActivityTargetAction(formData: FormData) {
  await requireAdminLike();
  const recruiterId = String(formData.get('recruiterId') || '');
  const year = Number(formData.get('year')) || new Date().getFullYear();
  if (!recruiterId) throw new Error('Missing recruiter.');
  await setActivityTarget(recruiterId, year, {
    interviewGoal: n(formData, 'interviewGoal'),
    phoneMinutesGoal: n(formData, 'phoneMinutesGoal')
  });
  revalidatePath('/goals');
  revalidatePath('/dashboard');
}
