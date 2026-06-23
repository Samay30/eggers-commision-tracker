'use server';

import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser, requireAdminLike } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encryptString } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';
import { assertCanMutate, assertCanDelete } from '@/lib/permissions';
import {
  adjustmentSchema,
  adminResetPasswordSchema,
  changePasswordSchema,
  createRecruiterSchema,
  placementSchema,
  planSchema,
  recruiterStatusSchema,
  updateAdjustmentSchema,
  updatePlacementSchema,
  updatePlanSchema
} from '@/lib/validators';

function optionalDate(value?: string) {
  return value && value.trim() ? new Date(value) : null;
}

function optionalMoney(value?: string) {
  return value && value.trim() ? value.trim() : null;
}

// Optimistic-concurrency guard: two people (e.g. a recruiter and Adrian) can have
// the same record open. If it changed since the form was rendered, refuse the write
// instead of silently clobbering the other person's edit.
function assertFresh(currentUpdatedAt: Date, expected?: string) {
  if (expected && currentUpdatedAt.toISOString() !== expected) {
    throw new Error('This record was changed by someone else while you were editing. Reload the page and re-apply your changes.');
  }
}

// Shallow before/after diff for the audit log. Compares stringified values so
// Decimal/Date fields compare cleanly. Sensitive free-text is never logged.
function diffFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changed: Record<string, { from: string; to: string }> = {};
  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (String(from ?? '') !== String(to ?? '')) {
      changed[key] = { from: String(from ?? ''), to: String(to ?? '') };
    }
  }
  return changed;
}

async function assertNotLastAdmin(userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) return;
  if (target.role === Role.ADMIN || target.role === Role.OWNER) {
    const remaining = await prisma.user.count({
      where: { isActive: true, role: { in: [Role.ADMIN, Role.OWNER] }, NOT: { id: userId } }
    });
    if (remaining === 0) {
      throw new Error('You cannot remove the last active administrator. Promote another admin first.');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Recruiter + user management (admin only)                            */
/* ------------------------------------------------------------------ */

export async function createRecruiterAction(formData: FormData) {
  const actor = await requireAdminLike();
  const parsed = createRecruiterSchema.parse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role') || 'RECRUITER'
  });

  const passwordHash = await bcrypt.hash(parsed.password, 12);

  const user = await prisma.user.create({
    data: {
      email: parsed.email,
      name: parsed.name,
      role: parsed.role as Role,
      passwordHash,
      recruiterProfile:
        parsed.role === 'RECRUITER'
          ? { create: { displayName: parsed.name, active: true } }
          : undefined
    },
    include: { recruiterProfile: true }
  });

  await auditLog({ actorUserId: actor.id, action: 'CREATE_USER', entityType: 'User', entityId: user.id, metadata: { role: parsed.role } });
  revalidatePath('/recruiters');
  redirect(user.recruiterProfile ? `/recruiters/${user.recruiterProfile.id}` : '/recruiters');
}

/**
 * Soft enable/disable a recruiter. This is the default "remove" path:
 * it preserves all financial history and audit trail while revoking the
 * linked login. Reversible. Admin only; cannot target your own account.
 */
export async function setRecruiterStatusAction(formData: FormData) {
  const actor = await requireAdminLike();
  const parsed = recruiterStatusSchema.parse({
    recruiterId: formData.get('recruiterId'),
    active: formData.get('active')
  });

  const recruiter = await prisma.recruiter.findUnique({
    where: { id: parsed.recruiterId },
    include: { user: { select: { id: true } } }
  });
  if (!recruiter) throw new Error('Recruiter not found.');

  if (recruiter.user && recruiter.user.id === actor.id) {
    throw new Error('You cannot change your own access from here.');
  }
  if (!parsed.active && recruiter.user) {
    await assertNotLastAdmin(recruiter.user.id);
  }

  await prisma.$transaction([
    prisma.recruiter.update({ where: { id: recruiter.id }, data: { active: parsed.active } }),
    ...(recruiter.userId
      ? [prisma.user.update({ where: { id: recruiter.userId }, data: { isActive: parsed.active } })]
      : [])
  ]);

  await auditLog({
    actorUserId: actor.id,
    action: parsed.active ? 'REACTIVATE_RECRUITER' : 'DEACTIVATE_RECRUITER',
    entityType: 'Recruiter',
    entityId: recruiter.id
  });
  revalidatePath('/recruiters');
  revalidatePath(`/recruiters/${recruiter.id}`);
}

/**
 * Hard delete. Destructive: cascades to plans, placements, and adjustments
 * (all financial history for this recruiter is permanently removed). The
 * linked login is deactivated rather than deleted so existing audit-log
 * entries keep a valid actor. Prefer setRecruiterStatusAction in almost all
 * cases. Admin only; cannot target your own account.
 */
export async function deleteRecruiterAction(formData: FormData) {
  const actor = await requireAdminLike();
  const recruiterId = String(formData.get('recruiterId') || '');
  if (!recruiterId) throw new Error('Missing recruiter.');

  const recruiter = await prisma.recruiter.findUnique({
    where: { id: recruiterId },
    include: {
      user: { select: { id: true } },
      _count: { select: { placements: true, adjustments: true, plans: true } }
    }
  });
  if (!recruiter) throw new Error('Recruiter not found.');
  if (recruiter.user && recruiter.user.id === actor.id) {
    throw new Error('You cannot delete your own account.');
  }
  if (recruiter.user) await assertNotLastAdmin(recruiter.user.id);

  await prisma.$transaction([
    ...(recruiter.userId
      ? [prisma.user.update({ where: { id: recruiter.userId }, data: { isActive: false } })]
      : []),
    prisma.recruiter.delete({ where: { id: recruiter.id } })
  ]);

  await auditLog({
    actorUserId: actor.id,
    action: 'DELETE_RECRUITER',
    entityType: 'Recruiter',
    entityId: recruiter.id,
    metadata: {
      displayName: recruiter.displayName,
      removedPlacements: recruiter._count.placements,
      removedAdjustments: recruiter._count.adjustments,
      removedPlans: recruiter._count.plans
    }
  });
  revalidatePath('/recruiters');
  redirect('/recruiters');
}

/* ------------------------------------------------------------------ */
/* Commission plan ("yearly form")                                     */
/* ------------------------------------------------------------------ */

export async function upsertPlanAction(formData: FormData) {
  const actor = await requireUser();
  const parsed = planSchema.parse({
    recruiterId: formData.get('recruiterId'),
    year: formData.get('year'),
    annualGoal: formData.get('annualGoal'),
    commissionRate: formData.get('commissionRate'),
    salaryPerPayPeriod: formData.get('salaryPerPayPeriod'),
    payFrequency: formData.get('payFrequency'),
    monthlyPayoutRate: formData.get('monthlyPayoutRate'),
    quarterlyTrueUp: formData.get('quarterlyTrueUp'),
    openingBalance: formData.get('openingBalance') || '0'
  });
  assertCanMutate(actor, parsed.recruiterId, 'plan');

  const existing = await prisma.commissionPlan.findUnique({
    where: { recruiterId_year: { recruiterId: parsed.recruiterId, year: parsed.year } }
  });

  await prisma.commissionPlan.upsert({
    where: { recruiterId_year: { recruiterId: parsed.recruiterId, year: parsed.year } },
    update: {
      annualGoal: parsed.annualGoal,
      commissionRate: parsed.commissionRate,
      salaryPerPayPeriod: parsed.salaryPerPayPeriod,
      payFrequency: parsed.payFrequency,
      monthlyPayoutRate: parsed.monthlyPayoutRate,
      quarterlyTrueUp: parsed.quarterlyTrueUp,
      openingBalance: parsed.openingBalance
    },
    create: {
      recruiterId: parsed.recruiterId,
      year: parsed.year,
      annualGoal: parsed.annualGoal,
      commissionRate: parsed.commissionRate,
      salaryPerPayPeriod: parsed.salaryPerPayPeriod,
      payFrequency: parsed.payFrequency,
      monthlyPayoutRate: parsed.monthlyPayoutRate,
      quarterlyTrueUp: parsed.quarterlyTrueUp,
      openingBalance: parsed.openingBalance
    }
  });

  await auditLog({
    actorUserId: actor.id,
    action: existing ? 'UPDATE_PLAN' : 'CREATE_PLAN',
    entityType: 'CommissionPlan',
    entityId: parsed.recruiterId,
    metadata: { year: parsed.year, byRole: actor.role }
  });
  revalidatePath(`/recruiters/${parsed.recruiterId}`);
}

export async function updatePlanAction(formData: FormData) {
  const actor = await requireUser();
  const parsed = updatePlanSchema.parse({
    planId: formData.get('planId'),
    expectedUpdatedAt: formData.get('expectedUpdatedAt') || undefined,
    annualGoal: formData.get('annualGoal'),
    commissionRate: formData.get('commissionRate'),
    salaryPerPayPeriod: formData.get('salaryPerPayPeriod'),
    payFrequency: formData.get('payFrequency'),
    monthlyPayoutRate: formData.get('monthlyPayoutRate'),
    quarterlyTrueUp: formData.get('quarterlyTrueUp'),
    openingBalance: formData.get('openingBalance') || '0'
  });

  const existing = await prisma.commissionPlan.findUnique({ where: { id: parsed.planId } });
  if (!existing) throw new Error('Plan not found.');
  assertCanMutate(actor, existing.recruiterId, 'plan');
  assertFresh(existing.updatedAt, parsed.expectedUpdatedAt);

  await prisma.commissionPlan.update({
    where: { id: parsed.planId },
    data: {
      annualGoal: parsed.annualGoal,
      commissionRate: parsed.commissionRate,
      salaryPerPayPeriod: parsed.salaryPerPayPeriod,
      payFrequency: parsed.payFrequency,
      monthlyPayoutRate: parsed.monthlyPayoutRate,
      quarterlyTrueUp: parsed.quarterlyTrueUp,
      openingBalance: parsed.openingBalance
    }
  });

  const changes = diffFields(
    {
      annualGoal: existing.annualGoal,
      commissionRate: existing.commissionRate,
      salaryPerPayPeriod: existing.salaryPerPayPeriod,
      payFrequency: existing.payFrequency,
      monthlyPayoutRate: existing.monthlyPayoutRate,
      quarterlyTrueUp: existing.quarterlyTrueUp,
      openingBalance: existing.openingBalance
    },
    {
      annualGoal: parsed.annualGoal,
      commissionRate: parsed.commissionRate,
      salaryPerPayPeriod: parsed.salaryPerPayPeriod,
      payFrequency: parsed.payFrequency,
      monthlyPayoutRate: parsed.monthlyPayoutRate,
      quarterlyTrueUp: parsed.quarterlyTrueUp,
      openingBalance: parsed.openingBalance
    }
  );

  await auditLog({
    actorUserId: actor.id,
    action: 'UPDATE_PLAN',
    entityType: 'CommissionPlan',
    entityId: existing.recruiterId,
    metadata: { planId: existing.id, year: existing.year, byRole: actor.role, changes }
  });
  revalidatePath(`/recruiters/${existing.recruiterId}`);
}

export async function deletePlanAction(formData: FormData) {
  const actor = await requireUser();
  const planId = String(formData.get('planId') || '');
  if (!planId) throw new Error('Missing plan.');

  const existing = await prisma.commissionPlan.findUnique({ where: { id: planId } });
  if (!existing) throw new Error('Plan not found.');
  assertCanDelete(actor, existing.recruiterId, 'plan');

  await prisma.commissionPlan.delete({ where: { id: planId } });
  await auditLog({
    actorUserId: actor.id,
    action: 'DELETE_PLAN',
    entityType: 'CommissionPlan',
    entityId: existing.recruiterId,
    metadata: { planId, year: existing.year }
  });
  revalidatePath(`/recruiters/${existing.recruiterId}`);
}

/* ------------------------------------------------------------------ */
/* Placements                                                          */
/* ------------------------------------------------------------------ */

export async function createPlacementAction(formData: FormData) {
  const actor = await requireUser();
  const parsed = placementSchema.parse({
    recruiterId: formData.get('recruiterId'),
    placementName: formData.get('placementName'),
    clientName: formData.get('clientName') || undefined,
    candidateName: formData.get('candidateName') || undefined,
    paymentDate: formData.get('paymentDate'),
    startDate: formData.get('startDate') || undefined,
    payDate: formData.get('payDate') || undefined,
    billAmount: formData.get('billAmount'),
    payoutOverride: formData.get('payoutOverride') || undefined,
    status: formData.get('status'),
    note: formData.get('note') || undefined
  });
  assertCanMutate(actor, parsed.recruiterId, 'placement');

  const encryptedNote = encryptString(parsed.note);

  const created = await prisma.placement.create({
    data: {
      recruiterId: parsed.recruiterId,
      placementName: parsed.placementName,
      clientName: parsed.clientName || null,
      candidateName: parsed.candidateName || null,
      paymentDate: new Date(parsed.paymentDate),
      startDate: optionalDate(parsed.startDate),
      payDate: optionalDate(parsed.payDate),
      billAmount: parsed.billAmount,
      payoutOverride: optionalMoney(parsed.payoutOverride),
      status: parsed.status,
      noteCiphertext: encryptedNote.ciphertext,
      noteIv: encryptedNote.iv,
      noteAuthTag: encryptedNote.authTag,
      createdById: actor.id
    }
  });

  await auditLog({
    actorUserId: actor.id,
    action: 'CREATE_PLACEMENT',
    entityType: 'Placement',
    entityId: created.id,
    metadata: { recruiterId: parsed.recruiterId, status: parsed.status, byRole: actor.role }
  });
  revalidatePath(`/recruiters/${parsed.recruiterId}`);
  revalidatePath('/placements');
}

export async function updatePlacementAction(formData: FormData) {
  const actor = await requireUser();
  const parsed = updatePlacementSchema.parse({
    placementId: formData.get('placementId'),
    expectedUpdatedAt: formData.get('expectedUpdatedAt') || undefined,
    placementName: formData.get('placementName'),
    clientName: formData.get('clientName') || undefined,
    candidateName: formData.get('candidateName') || undefined,
    paymentDate: formData.get('paymentDate'),
    startDate: formData.get('startDate') || undefined,
    payDate: formData.get('payDate') || undefined,
    billAmount: formData.get('billAmount'),
    payoutOverride: formData.get('payoutOverride') || undefined,
    status: formData.get('status'),
    note: formData.get('note') || undefined
  });

  const existing = await prisma.placement.findUnique({ where: { id: parsed.placementId } });
  if (!existing) throw new Error('Placement not found.');
  assertCanMutate(actor, existing.recruiterId, 'placement');
  assertFresh(existing.updatedAt, parsed.expectedUpdatedAt);

  const encryptedNote = encryptString(parsed.note);

  await prisma.placement.update({
    where: { id: existing.id },
    data: {
      placementName: parsed.placementName,
      clientName: parsed.clientName || null,
      candidateName: parsed.candidateName || null,
      paymentDate: new Date(parsed.paymentDate),
      startDate: optionalDate(parsed.startDate),
      payDate: optionalDate(parsed.payDate),
      billAmount: parsed.billAmount,
      payoutOverride: optionalMoney(parsed.payoutOverride),
      status: parsed.status,
      noteCiphertext: encryptedNote.ciphertext,
      noteIv: encryptedNote.iv,
      noteAuthTag: encryptedNote.authTag
    }
  });

  const changes = diffFields(
    {
      placementName: existing.placementName,
      clientName: existing.clientName,
      candidateName: existing.candidateName,
      paymentDate: existing.paymentDate.toISOString().slice(0, 10),
      startDate: existing.startDate ? existing.startDate.toISOString().slice(0, 10) : '',
      payDate: existing.payDate ? existing.payDate.toISOString().slice(0, 10) : '',
      billAmount: existing.billAmount,
      payoutOverride: existing.payoutOverride,
      status: existing.status
    },
    {
      placementName: parsed.placementName,
      clientName: parsed.clientName || null,
      candidateName: parsed.candidateName || null,
      paymentDate: new Date(parsed.paymentDate).toISOString().slice(0, 10),
      startDate: parsed.startDate || '',
      payDate: parsed.payDate || '',
      billAmount: parsed.billAmount,
      payoutOverride: optionalMoney(parsed.payoutOverride),
      status: parsed.status
    }
  );

  await auditLog({
    actorUserId: actor.id,
    action: 'UPDATE_PLACEMENT',
    entityType: 'Placement',
    entityId: existing.id,
    metadata: { recruiterId: existing.recruiterId, byRole: actor.role, changes }
  });
  revalidatePath(`/recruiters/${existing.recruiterId}`);
  revalidatePath('/placements');
}

export async function deletePlacementAction(formData: FormData) {
  const actor = await requireUser();
  const placementId = String(formData.get('placementId') || '');
  if (!placementId) throw new Error('Missing placement.');

  const existing = await prisma.placement.findUnique({ where: { id: placementId } });
  if (!existing) throw new Error('Placement not found.');
  assertCanDelete(actor, existing.recruiterId, 'placement');

  await prisma.placement.delete({ where: { id: placementId } });
  await auditLog({
    actorUserId: actor.id,
    action: 'DELETE_PLACEMENT',
    entityType: 'Placement',
    entityId: placementId,
    metadata: {
      recruiterId: existing.recruiterId,
      placementName: existing.placementName,
      externalSource: existing.externalSource ?? null,
      byRole: actor.role
    }
  });
  revalidatePath(`/recruiters/${existing.recruiterId}`);
  revalidatePath('/placements');
}

/* ------------------------------------------------------------------ */
/* Adjustments                                                         */
/* ------------------------------------------------------------------ */

export async function createAdjustmentAction(formData: FormData) {
  const actor = await requireUser();
  const parsed = adjustmentSchema.parse({
    recruiterId: formData.get('recruiterId'),
    effectiveDate: formData.get('effectiveDate'),
    amount: formData.get('amount'),
    kind: formData.get('kind'),
    reason: formData.get('reason') || undefined
  });
  assertCanMutate(actor, parsed.recruiterId, 'adjustment');

  const encryptedReason = encryptString(parsed.reason);

  const created = await prisma.adjustment.create({
    data: {
      recruiterId: parsed.recruiterId,
      effectiveDate: new Date(parsed.effectiveDate),
      amount: parsed.amount,
      kind: parsed.kind,
      reasonCiphertext: encryptedReason.ciphertext,
      reasonIv: encryptedReason.iv,
      reasonAuthTag: encryptedReason.authTag,
      createdById: actor.id
    }
  });

  await auditLog({
    actorUserId: actor.id,
    action: 'CREATE_ADJUSTMENT',
    entityType: 'Adjustment',
    entityId: created.id,
    metadata: { recruiterId: parsed.recruiterId, kind: parsed.kind, byRole: actor.role }
  });
  revalidatePath(`/recruiters/${parsed.recruiterId}`);
}

export async function updateAdjustmentAction(formData: FormData) {
  const actor = await requireUser();
  const parsed = updateAdjustmentSchema.parse({
    adjustmentId: formData.get('adjustmentId'),
    expectedUpdatedAt: formData.get('expectedUpdatedAt') || undefined,
    effectiveDate: formData.get('effectiveDate'),
    amount: formData.get('amount'),
    kind: formData.get('kind'),
    reason: formData.get('reason') || undefined
  });

  const existing = await prisma.adjustment.findUnique({ where: { id: parsed.adjustmentId } });
  if (!existing) throw new Error('Adjustment not found.');
  assertCanMutate(actor, existing.recruiterId, 'adjustment');
  assertFresh(existing.updatedAt, parsed.expectedUpdatedAt);

  const encryptedReason = encryptString(parsed.reason);

  await prisma.adjustment.update({
    where: { id: existing.id },
    data: {
      effectiveDate: new Date(parsed.effectiveDate),
      amount: parsed.amount,
      kind: parsed.kind,
      reasonCiphertext: encryptedReason.ciphertext,
      reasonIv: encryptedReason.iv,
      reasonAuthTag: encryptedReason.authTag
    }
  });

  const changes = diffFields(
    {
      effectiveDate: existing.effectiveDate.toISOString().slice(0, 10),
      amount: existing.amount,
      kind: existing.kind
    },
    {
      effectiveDate: new Date(parsed.effectiveDate).toISOString().slice(0, 10),
      amount: parsed.amount,
      kind: parsed.kind
    }
  );

  await auditLog({
    actorUserId: actor.id,
    action: 'UPDATE_ADJUSTMENT',
    entityType: 'Adjustment',
    entityId: existing.id,
    metadata: { recruiterId: existing.recruiterId, byRole: actor.role, changes }
  });
  revalidatePath(`/recruiters/${existing.recruiterId}`);
}

export async function deleteAdjustmentAction(formData: FormData) {
  const actor = await requireUser();
  const adjustmentId = String(formData.get('adjustmentId') || '');
  if (!adjustmentId) throw new Error('Missing adjustment.');

  const existing = await prisma.adjustment.findUnique({ where: { id: adjustmentId } });
  if (!existing) throw new Error('Adjustment not found.');
  assertCanDelete(actor, existing.recruiterId, 'adjustment');

  await prisma.adjustment.delete({ where: { id: adjustmentId } });
  await auditLog({
    actorUserId: actor.id,
    action: 'DELETE_ADJUSTMENT',
    entityType: 'Adjustment',
    entityId: adjustmentId,
    metadata: { recruiterId: existing.recruiterId, kind: existing.kind }
  });
  revalidatePath(`/recruiters/${existing.recruiterId}`);
}

/* ------------------------------------------------------------------ */
/* Passwords                                                           */
/* ------------------------------------------------------------------ */

export async function changeOwnPasswordAction(formData: FormData) {
  const actor = await requireUser();
  const parsed = changePasswordSchema.parse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword')
  });

  const dbUser = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!dbUser) throw new Error('Account not found.');

  const ok = await bcrypt.compare(parsed.currentPassword, dbUser.passwordHash);
  if (!ok) throw new Error('Your current password is incorrect.');

  const passwordHash = await bcrypt.hash(parsed.newPassword, 12);
  await prisma.user.update({ where: { id: actor.id }, data: { passwordHash } });

  await auditLog({ actorUserId: actor.id, action: 'CHANGE_PASSWORD', entityType: 'User', entityId: actor.id });
  redirect('/settings?pw=ok');
}

export async function adminResetPasswordAction(formData: FormData) {
  const actor = await requireAdminLike();
  const parsed = adminResetPasswordSchema.parse({
    userId: formData.get('userId'),
    newPassword: formData.get('newPassword')
  });

  const target = await prisma.user.findUnique({ where: { id: parsed.userId }, select: { id: true } });
  if (!target) throw new Error('User not found.');

  const passwordHash = await bcrypt.hash(parsed.newPassword, 12);
  await prisma.user.update({ where: { id: parsed.userId }, data: { passwordHash } });

  await auditLog({ actorUserId: actor.id, action: 'ADMIN_RESET_PASSWORD', entityType: 'User', entityId: parsed.userId });
}
