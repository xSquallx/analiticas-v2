-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "reviewerId" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "report_comments" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT,
    "userLabel" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_comments_reportId_createdAt_idx" ON "report_comments"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_reviewerId_idx" ON "reports"("reviewerId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

