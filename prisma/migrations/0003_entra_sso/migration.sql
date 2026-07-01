-- Add Microsoft Entra ID SSO alongside existing password login.
CREATE TYPE "AuthProvider" AS ENUM ('PASSWORD', 'ENTRA');

ALTER TABLE "User"
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "authProvider" "AuthProvider" NOT NULL DEFAULT 'PASSWORD',
  ADD COLUMN "entraId" TEXT;

CREATE UNIQUE INDEX "User_entraId_key" ON "User"("entraId");
