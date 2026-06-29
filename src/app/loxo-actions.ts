'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminLike } from '@/lib/auth';
import { syncLoxoPlacements } from '@/lib/loxo/sync';
import { syncLoxoInterviews } from '@/lib/loxo/interviews';
import { loxoConfigured } from '@/lib/loxo/client';

export async function syncLoxoAction(formData: FormData) {
  const actor = await requireAdminLike();
  if (!loxoConfigured()) {
    throw new Error('Loxo is not configured. Set LOXO_API_KEY and LOXO_AGENCY_SLUG, then redeploy.');
  }
  const year = Number(formData.get('year')) || new Date().getFullYear();
  await syncLoxoPlacements({ year, actorUserId: actor.id });
  revalidatePath('/integrations');
  revalidatePath('/dashboard');
}

export async function syncLoxoInterviewsAction(formData: FormData) {
  const actor = await requireAdminLike();
  if (!loxoConfigured()) {
    throw new Error('Loxo is not configured. Set LOXO_API_KEY and LOXO_AGENCY_SLUG, then redeploy.');
  }
  const year = Number(formData.get('year')) || new Date().getFullYear();
  await syncLoxoInterviews({ year, actorUserId: actor.id });
  revalidatePath('/integrations');
  revalidatePath('/dashboard');
}
