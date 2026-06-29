-- Goals + activity tables for the company/team/individual goal dashboard.
-- Purely additive: no existing table or column is altered.

CREATE TABLE "OrgGoal" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "billingGoal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interviewGoal" INTEGER NOT NULL DEFAULT 0,
    "phoneMinutesGoal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrgGoal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgGoal_year_key" ON "OrgGoal"("year");

CREATE TABLE "ActivityTarget" (
    "id" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "interviewGoal" INTEGER NOT NULL DEFAULT 0,
    "phoneMinutesGoal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ActivityTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivityTarget_recruiterId_year_key" ON "ActivityTarget"("recruiterId", "year");
CREATE INDEX "ActivityTarget_year_idx" ON "ActivityTarget"("year");
ALTER TABLE "ActivityTarget" ADD CONSTRAINT "ActivityTarget_recruiterId_fkey"
    FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CallActivityDay" (
    "id" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "outboundCalls" INTEGER NOT NULL DEFAULT 0,
    "talkSeconds" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'ringover',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CallActivityDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CallActivityDay_recruiterId_date_key" ON "CallActivityDay"("recruiterId", "date");
CREATE INDEX "CallActivityDay_date_idx" ON "CallActivityDay"("date");
ALTER TABLE "CallActivityDay" ADD CONSTRAINT "CallActivityDay_recruiterId_fkey"
    FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InterviewActivityDay" (
    "id" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "interviews" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'loxo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewActivityDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InterviewActivityDay_recruiterId_date_key" ON "InterviewActivityDay"("recruiterId", "date");
CREATE INDEX "InterviewActivityDay_date_idx" ON "InterviewActivityDay"("date");
ALTER TABLE "InterviewActivityDay" ADD CONSTRAINT "InterviewActivityDay_recruiterId_fkey"
    FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
