-- Monthly Puzzle Challenge: Puzzle / PuzzleAttempt / PuzzleWinner (+ IN_APP notification channel)

-- AlterEnum
ALTER TYPE "NotifChannel" ADD VALUE 'IN_APP';

-- CreateEnum
CREATE TYPE "PuzzleAttemptStatus" AS ENUM ('STARTED', 'COMPLETED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "PuzzlePrizeStatus" AS ENUM ('PENDING', 'AWARDED', 'PENDING_ADDRESS', 'FAILED');

-- CreateTable
CREATE TABLE "Puzzle" (
    "id" TEXT NOT NULL,
    "monthIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "imageUrl" TEXT,
    "size" INTEGER NOT NULL DEFAULT 4,
    "unlockAt" TIMESTAMP(3) NOT NULL,
    "closeAt" TIMESTAMP(3) NOT NULL,
    "winnerAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuzzleAttempt" (
    "id" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PuzzleAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "shuffleSeed" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "moves" INTEGER,
    "device" TEXT,
    "browser" TEXT,
    "ip" TEXT,

    CONSTRAINT "PuzzleAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuzzleWinner" (
    "id" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prizeStatus" "PuzzlePrizeStatus" NOT NULL DEFAULT 'PENDING',
    "subscriptionId" TEXT,
    "notes" TEXT,

    CONSTRAINT "PuzzleWinner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Puzzle_monthIndex_key" ON "Puzzle"("monthIndex");

-- CreateIndex
CREATE INDEX "Puzzle_unlockAt_active_idx" ON "Puzzle"("unlockAt", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleAttempt_puzzleId_userId_key" ON "PuzzleAttempt"("puzzleId", "userId");

-- CreateIndex
CREATE INDEX "PuzzleAttempt_puzzleId_status_moves_durationMs_completedAt_idx" ON "PuzzleAttempt"("puzzleId", "status", "moves", "durationMs", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleWinner_puzzleId_key" ON "PuzzleWinner"("puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleWinner_attemptId_key" ON "PuzzleWinner"("attemptId");

-- CreateIndex
CREATE INDEX "PuzzleWinner_userId_idx" ON "PuzzleWinner"("userId");

-- AddForeignKey
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleWinner" ADD CONSTRAINT "PuzzleWinner_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleWinner" ADD CONSTRAINT "PuzzleWinner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleWinner" ADD CONSTRAINT "PuzzleWinner_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PuzzleAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
