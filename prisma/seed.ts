import { PrismaClient, Role, PayFrequency, PlacementStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME || 'Admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required for seeding.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, role: Role.ADMIN, passwordHash, isActive: true },
    create: {
      email: email.toLowerCase(),
      name,
      role: Role.ADMIN,
      passwordHash,
      isActive: true
    }
  });

  if (process.env.ALLOW_SAMPLE_DATA === 'true') {
    const recruiterEmail = 'sample.recruiter@example.com';
    const recruiterUser = await prisma.user.upsert({
      where: { email: recruiterEmail },
      update: {},
      create: {
        email: recruiterEmail,
        name: 'Sample Recruiter',
        role: Role.RECRUITER,
        passwordHash: await bcrypt.hash('change-this-sample-password', 12),
        isActive: true
      }
    });

    const recruiter = await prisma.recruiter.upsert({
      where: { userId: recruiterUser.id },
      update: { displayName: 'Sample Recruiter', active: true },
      create: { userId: recruiterUser.id, displayName: 'Sample Recruiter', active: true }
    });

    const year = new Date().getFullYear();
    await prisma.commissionPlan.upsert({
      where: { recruiterId_year: { recruiterId: recruiter.id, year } },
      update: {},
      create: {
        recruiterId: recruiter.id,
        year,
        annualGoal: '250000',
        commissionRate: '0.10',
        salaryPerPayPeriod: '1923.07',
        payFrequency: PayFrequency.SEMI_MONTHLY,
        monthlyPayoutRate: '0.90',
        quarterlyTrueUp: true,
        openingBalance: '0',
        notes: 'Sanitized sample based on draw-against-commission structure.'
      }
    });

    await prisma.placement.createMany({
      data: [
        {
          recruiterId: recruiter.id,
          externalSource: 'seed',
          externalId: `sample-${year}-1`,
          placementName: 'Sample Commercial Lender Placement',
          clientName: 'Sample Bank',
          candidateName: 'Sample Candidate',
          paymentDate: new Date(`${year}-03-20T00:00:00.000Z`),
          billAmount: '35000',
          status: PlacementStatus.PAID
        },
        {
          recruiterId: recruiter.id,
          externalSource: 'seed',
          externalId: `sample-${year}-2`,
          placementName: 'Sample Credit Officer Placement',
          clientName: 'Example Community Bank',
          candidateName: 'Example Candidate',
          paymentDate: new Date(`${year}-05-08T00:00:00.000Z`),
          billAmount: '52000',
          status: PlacementStatus.PAID
        }
      ],
      skipDuplicates: true
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
