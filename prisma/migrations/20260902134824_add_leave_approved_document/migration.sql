-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "approved_document_id" TEXT;

-- CreateIndex
CREATE INDEX "leave_requests_approved_document_id_idx" ON "leave_requests"("approved_document_id");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_document_id_fkey" FOREIGN KEY ("approved_document_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
