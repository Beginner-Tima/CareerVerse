-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('RU', 'KK');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('CLARIFYING_QUESTION', 'PROFESSION_TRIAL');

-- AlterTable
ALTER TABLE "Level" ADD COLUMN     "promptHint" TEXT,
ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "Profession" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "titleKk" TEXT;

-- AlterTable
ALTER TABLE "UserProgress" ALTER COLUMN "completedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "LaborMarketData" (
    "id" TEXT NOT NULL,
    "professionId" TEXT NOT NULL,
    "medianSalaryKzt" INTEGER,
    "vacancyCount" INTEGER,
    "demandTrend" TEXT,
    "regions" JSONB,
    "source" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaborMarketData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'RU',
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "consentAcceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskInstance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "TaskKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "professionId" TEXT,
    "levelId" TEXT,
    "prompt" TEXT NOT NULL,
    "payload" JSONB,
    "modelId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "taskInstanceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "scores" JSONB,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestProfile" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "traits" JSONB NOT NULL,
    "topProfessions" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterestProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentLetter" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'RU',
    "content" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaborMarketData_professionId_key" ON "LaborMarketData"("professionId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "TaskInstance_sessionId_idx" ON "TaskInstance"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskInstance_sessionId_order_key" ON "TaskInstance"("sessionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_taskInstanceId_key" ON "Answer"("taskInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_answerId_key" ON "Assessment"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "InterestProfile_sessionId_key" ON "InterestProfile"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentLetter_sessionId_key" ON "ParentLetter"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProgress_userId_levelId_key" ON "UserProgress"("userId", "levelId");

-- AddForeignKey
ALTER TABLE "LaborMarketData" ADD CONSTRAINT "LaborMarketData_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstance" ADD CONSTRAINT "TaskInstance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstance" ADD CONSTRAINT "TaskInstance_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstance" ADD CONSTRAINT "TaskInstance_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_taskInstanceId_fkey" FOREIGN KEY ("taskInstanceId") REFERENCES "TaskInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestProfile" ADD CONSTRAINT "InterestProfile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLetter" ADD CONSTRAINT "ParentLetter_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
