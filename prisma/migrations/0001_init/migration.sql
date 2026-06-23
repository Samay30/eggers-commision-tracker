-- Initial production schema for Commission Tracker.
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OWNER', 'RECRUITER');
CREATE TYPE "PayFrequency" AS ENUM ('SEMI_MONTHLY', 'BI_WEEKLY', 'MONTHLY');
CREATE TYPE "PlacementStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');
CREATE TYPE "AdjustmentKind" AS ENUM ('COMMISSION', 'DRAW', 'PAYOUT', 'MANUAL');
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'RECRUITER',
  "passwordHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Recruiter" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "displayName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Recruiter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionPlan" (
  "id" TEXT NOT NULL,
  "recruiterId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "annualGoal" DECIMAL(14,2) NOT NULL,
  "commissionRate" DECIMAL(8,6) NOT NULL,
  "salaryPerPayPeriod" DECIMAL(14,2) NOT NULL,
  "payFrequency" "PayFrequency" NOT NULL DEFAULT 'SEMI_MONTHLY',
  "monthlyPayoutRate" DECIMAL(8,6) NOT NULL DEFAULT 0.90,
  "quarterlyTrueUp" BOOLEAN NOT NULL DEFAULT true,
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Placement" (
  "id" TEXT NOT NULL,
  "recruiterId" TEXT NOT NULL,
  "externalSource" TEXT,
  "externalId" TEXT,
  "placementName" TEXT NOT NULL,
  "clientName" TEXT,
  "candidateName" TEXT,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "startDate" TIMESTAMP(3),
  "payDate" TIMESTAMP(3),
  "billAmount" DECIMAL(14,2) NOT NULL,
  "payoutOverride" DECIMAL(14,2),
  "status" "PlacementStatus" NOT NULL DEFAULT 'PENDING',
  "noteCiphertext" TEXT,
  "noteIv" TEXT,
  "noteAuthTag" TEXT,
  "metadata" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Adjustment" (
  "id" TEXT NOT NULL,
  "recruiterId" TEXT NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "kind" "AdjustmentKind" NOT NULL,
  "reasonCiphertext" TEXT,
  "reasonIv" TEXT,
  "reasonAuthTag" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Adjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalId" TEXT,
  "payloadHash" TEXT NOT NULL,
  "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  "error" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Recruiter_userId_key" ON "Recruiter"("userId");
CREATE INDEX "Recruiter_displayName_idx" ON "Recruiter"("displayName");
CREATE UNIQUE INDEX "CommissionPlan_recruiterId_year_key" ON "CommissionPlan"("recruiterId", "year");
CREATE INDEX "CommissionPlan_year_idx" ON "CommissionPlan"("year");
CREATE UNIQUE INDEX "Placement_externalSource_externalId_key" ON "Placement"("externalSource", "externalId");
CREATE INDEX "Placement_recruiterId_paymentDate_idx" ON "Placement"("recruiterId", "paymentDate");
CREATE INDEX "Placement_status_idx" ON "Placement"("status");
CREATE INDEX "Adjustment_recruiterId_effectiveDate_idx" ON "Adjustment"("recruiterId", "effectiveDate");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE UNIQUE INDEX "WebhookEvent_source_externalId_key" ON "WebhookEvent"("source", "externalId");
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

ALTER TABLE "Recruiter" ADD CONSTRAINT "Recruiter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
