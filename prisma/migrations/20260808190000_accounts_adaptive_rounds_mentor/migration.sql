
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "grade" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "city" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "grade" INTEGER,
ADD COLUMN     "loginCode" TEXT,
ADD COLUMN     "name" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MentorReview" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "costCoins" INTEGER NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPlan" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "professionId" TEXT NOT NULL,
    "context" TEXT,
    "content" JSONB NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MentorReview_sessionId_key" ON "MentorReview"("sessionId");

-- CreateIndex
CREATE INDEX "MentorReview_userId_idx" ON "MentorReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPlan_sessionId_key" ON "CareerPlan"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_loginCode_key" ON "User"("loginCode");

-- AddForeignKey
ALTER TABLE "MentorReview" ADD CONSTRAINT "MentorReview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorReview" ADD CONSTRAINT "MentorReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPlan" ADD CONSTRAINT "CareerPlan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

