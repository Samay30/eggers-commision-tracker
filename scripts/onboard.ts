/**
 * One-time onboarding: creates logins + recruiter profiles for the EES team.
 *
 * Run:
 *   JASON_INITIAL_PASSWORD='<his chosen password>' npx tsx scripts/onboard.ts
 *
 * - Idempotent: existing emails are skipped (passwords are never reset here).
 * - Generates a strong temporary password for each person and prints it ONCE.
 *   Distribute securely; everyone should change it under Settings after first sign-in.
 *
 * IMPORTANT — verify every email below before running. The login email is what the
 * Loxo sync uses to attribute placements to a recruiter, so each email MUST match
 * that person's email in Loxo, or their placements will land in "Needs review" /
 * unmapped. Emails here are a best guess at the firstname+lastinitial pattern.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

type Person = { name: string; email: string; role: Role };

const ROSTER: Person[] = [
  // Admins (see the collective dashboard + every recruiter)
  { name: 'Jason Eggers', email: 'jasone@eggersesearch.com', role: Role.ADMIN },
  { name: 'Adrian Rider', email: 'adrianr@eggersesearch.com', role: Role.ADMIN },
  // Recruiters (VERIFY THESE EMAILS against Loxo before running)
  { name: 'Aaron Rider', email: 'aaronr@eggersesearch.com', role: Role.RECRUITER },
  { name: 'Caleb Passo', email: 'calebp@eggersesearch.com', role: Role.RECRUITER },
  { name: 'Cathy Sorrell', email: 'cathys@eggersesearch.com', role: Role.RECRUITER },
  { name: 'Chris Finken', email: 'chrisf@eggersesearch.com', role: Role.RECRUITER },
  { name: 'Kelly Bromley', email: 'kellyb@eggersesearch.com', role: Role.RECRUITER },
  { name: 'Luke Tesar', email: 'luket@eggersesearch.com', role: Role.RECRUITER },
  { name: 'Phil Anania', email: 'phila@eggersesearch.com', role: Role.RECRUITER },
  { name: 'Ryan Terry', email: 'ryant@eggersesearch.com', role: Role.RECRUITER },
  { name: 'Vaughn Sipple', email: 'vaughns@eggersesearch.com', role: Role.RECRUITER }
];

function tempPassword() {
  const base = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  return `${base.slice(0, 14)}A9!`;
}

async function main() {
  const created: { email: string; role: string; password: string }[] = [];
  const skipped: string[] = [];

  for (const person of ROSTER) {
    const email = person.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      skipped.push(email);
      continue;
    }

    const plain =
      email === 'jasone@eggersesearch.com' && process.env.JASON_INITIAL_PASSWORD
        ? process.env.JASON_INITIAL_PASSWORD
        : tempPassword();

    const passwordHash = await bcrypt.hash(plain, 12);

    await prisma.user.create({
      data: {
        email,
        name: person.name,
        role: person.role,
        passwordHash,
        recruiterProfile:
          person.role === Role.RECRUITER ? { create: { displayName: person.name, active: true } } : undefined
      }
    });

    created.push({ email, role: person.role, password: plain });
  }

  console.log('\n=== Created accounts (store securely, then have each user change their password) ===');
  for (const c of created) console.log(`${c.role.padEnd(9)} ${c.email}  ->  ${c.password}`);
  if (skipped.length) console.log(`\nSkipped (already existed): ${skipped.join(', ')}`);
  console.log('\nReminder: verify these emails match Loxo, and ask everyone to change their password under Settings.');
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
