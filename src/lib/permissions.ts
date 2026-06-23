import { isAdminLike, type CurrentUser } from '@/lib/auth';

/**
 * Central place to decide *who is allowed to change what*.
 *
 * Admins/Owners (Adrian, Jason, Aaron) can always edit everything.
 * For recruiters editing their OWN records, flip the flags below.
 *
 * Defaults reflect a sensible control posture for a commission tracker:
 *  - recruiters may maintain their own annual plan and placements,
 *  - manual adjustments (draws/payouts/corrections) stay admin-only,
 *    because those are the firm's reconciliation lever, not the rep's.
 * Every change is written to the audit log with a before/after diff
 * regardless of who makes it, so Adrian retains full visibility.
 */
export const POLICY = {
  recruitersCanEditOwnPlan: true,
  recruitersCanEditOwnPlacements: true,
  recruitersCanDeleteOwnPlacements: true,
  recruitersCanEditOwnAdjustments: false
} as const;

export type MutableResource = 'plan' | 'placement' | 'adjustment' | 'recruiter';

export function ownsRecruiter(user: CurrentUser, recruiterId: string) {
  return Boolean(user.recruiterProfile?.id) && user.recruiterProfile?.id === recruiterId;
}

export function canMutate(user: CurrentUser, recruiterId: string, resource: MutableResource): boolean {
  if (isAdminLike(user.role)) return true;
  if (!ownsRecruiter(user, recruiterId)) return false;
  switch (resource) {
    case 'plan':
      return POLICY.recruitersCanEditOwnPlan;
    case 'placement':
      return POLICY.recruitersCanEditOwnPlacements;
    case 'adjustment':
      return POLICY.recruitersCanEditOwnAdjustments;
    case 'recruiter':
      return false; // recruiter records are managed by admins only
    default:
      return false;
  }
}

export function canDelete(user: CurrentUser, recruiterId: string, resource: MutableResource): boolean {
  if (isAdminLike(user.role)) return true;
  if (resource === 'placement') {
    return ownsRecruiter(user, recruiterId) && POLICY.recruitersCanDeleteOwnPlacements;
  }
  // Recruiters cannot delete plans, adjustments, or recruiter records.
  return false;
}

export function assertCanMutate(user: CurrentUser, recruiterId: string, resource: MutableResource) {
  if (!canMutate(user, recruiterId, resource)) {
    throw new Error('You do not have permission to change this record.');
  }
}

export function assertCanDelete(user: CurrentUser, recruiterId: string, resource: MutableResource) {
  if (!canDelete(user, recruiterId, resource)) {
    throw new Error('You do not have permission to delete this record.');
  }
}
