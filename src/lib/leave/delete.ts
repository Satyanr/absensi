import type { Prisma } from "@/generated/prisma/client";
import { countLeaveDaysByYear } from "./balance";

type DeleteContext = {
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export async function deleteLeaveRequest(
  tx: Prisma.TransactionClient,
  id: string,
  context: DeleteContext,
) {
  const leave = await tx.leaveRequest.findUnique({ where: { id } });
  if (!leave) throw new Error("LEAVE_NOT_FOUND");

  const deleted = await tx.leaveRequest.deleteMany({
    where: { id, updatedAt: leave.updatedAt },
  });
  if (deleted.count !== 1) throw new Error("LEAVE_CHANGED");

  const balanceReturned =
    leave.status === "APPROVED" && leave.type === "ANNUAL_LEAVE"
      ? countLeaveDaysByYear(leave.startDate, leave.endDate)
      : [];

  for (const usage of balanceReturned) {
    const result = await tx.leaveBalance.updateMany({
      where: {
        employeeId: leave.employeeId,
        year: usage.year,
        used: { gte: usage.days },
      },
      data: { used: { decrement: usage.days } },
    });
    if (result.count !== 1) throw new Error(`BALANCE_INVALID:${usage.year}`);
  }

  let attendanceDaysDeleted = 0;
  if (leave.status === "APPROVED") {
    const otherLeaves = await tx.leaveRequest.findMany({
      where: {
        employeeId: leave.employeeId,
        status: "APPROVED",
        startDate: { lte: leave.endDate },
        endDate: { gte: leave.startDate },
      },
      select: { startDate: true, endDate: true },
    });

    // Remove only absence placeholders, preserving actual attendance and
    // dates still covered by a different approved request (including imports).
    const removed = await tx.attendanceDay.deleteMany({
      where: {
        employeeId: leave.employeeId,
        attendanceDate: { gte: leave.startDate, lte: leave.endDate },
        status: leave.type === "ANNUAL_LEAVE" ? "LEAVE" : leave.type,
        checkInAt: null,
        checkOutAt: null,
        events: { none: {} },
        NOT: otherLeaves.map((other) => ({
          attendanceDate: { gte: other.startDate, lte: other.endDate },
        })),
      },
    });
    attendanceDaysDeleted = removed.count;
  }

  await tx.notificationLog.deleteMany({
    where: { entityType: "LeaveRequest", entityId: id },
  });

  const attachmentIds = [leave.attachmentId, leave.approvedDocumentId].filter(
    (value): value is string => value !== null,
  );
  const orphanWhere = {
    id: { in: attachmentIds },
    attendanceEvents: { none: {} },
    leaveRequests: { none: {} },
    approvedLeaveDocuments: { none: {} },
  };
  const files = await tx.attachment.findMany({
    where: orphanWhere,
    select: { storageDisk: true, storagePath: true },
  });
  await tx.attachment.deleteMany({ where: orphanWhere });

  await tx.auditLog.create({
    data: {
      ...context,
      action: "DELETE",
      entityType: "LeaveRequest",
      entityId: id,
      before: {
        employeeId: leave.employeeId,
        type: leave.type,
        status: leave.status,
        startDate: leave.startDate.toISOString().slice(0, 10),
        endDate: leave.endDate.toISOString().slice(0, 10),
        reason: leave.reason,
        attachmentId: leave.attachmentId,
        approvedDocumentId: leave.approvedDocumentId,
      },
      after: { balanceReturned, attendanceDaysDeleted },
    },
  });

  return { balanceReturned, attendanceDaysDeleted, files };
}
