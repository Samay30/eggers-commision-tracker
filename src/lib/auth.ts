import { redirect } from 'next/navigation';
import { Role, type User } from '@prisma/client';
import { prisma } from '@/lib/db';
import { readSession } from '@/lib/session';

export type CurrentUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'isActive'> & {
  recruiterProfile: { id: string; displayName: string } | null;
};

export function isAdminLike(role: Role) {
  return role === Role.ADMIN || role === Role.OWNER;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      recruiterProfile: { select: { id: true, displayName: true } }
    }
  });

  if (!user || !user.isActive) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireAdminLike() {
  const user = await requireUser();
  if (!isAdminLike(user.role)) redirect('/dashboard');
  return user;
}

export function canAccessRecruiter(user: CurrentUser, recruiterId: string) {
  if (isAdminLike(user.role)) return true;
  return user.recruiterProfile?.id === recruiterId;
}

export function assertRecruiterAccess(user: CurrentUser, recruiterId: string) {
  if (!canAccessRecruiter(user, recruiterId)) {
    throw new Error('Forbidden');
  }
}
