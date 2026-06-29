'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminLike } from '@/lib/auth';
import { syncRingoverCalls } from '@/lib/ringover/sync';
import { ringoverConfigured } from '@/lib/ringover/client';

export async function syncRingoverAction(formData: FormData) {
  const actor = await requireAdminLike();
  if (!ringoverConfigured()) {
    throw new Error('Ringover is not configured. Set RINGOVER_API_KEY, then redeploy.');
  }
  const year = Number(formData.get('year')) || new Date().getFullYear();
  await syncRingoverCalls({ year, actorUserId: actor.id });
  revalidatePath('/integrations');
  revalidatePath('/dashboard');
}
