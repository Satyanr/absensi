import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { deleteLeaveRequest } from "../src/lib/leave/delete";

// Intentionally never fall back to DATABASE_URL or load the server .env.
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("Set TEST_DATABASE_URL ke database pengujian terpisah.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  for (const type of ["ANNUAL_LEAVE", "PERMISSION", "SICK"] as const) {
    const employeeCode = `test-delete-${crypto.randomUUID()}`;
    const rollback = new Error("ROLLBACK_TEST_FIXTURES");
    try {
      await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            employeeCode, name: "Deletion integration test",
            leaveBalances: { create: [
              { year: 2026, entitlement: 12, used: type === "ANNUAL_LEAVE" ? 2 : 0 },
              { year: 2027, entitlement: 12, used: type === "ANNUAL_LEAVE" ? 2 : 0 },
            ] },
          },
        });
        const actor = await tx.user.create({ data: { role: "ADMIN" } });
        const attachment = await tx.attachment.create({ data: {
          storagePath: `test/${employeeCode}.pdf`, mimeType: "application/pdf", fileSize: BigInt(4), checksum: "test",
        } });
        const leave = await tx.leaveRequest.create({ data: {
          employeeId: employee.id, type, status: "APPROVED", reason: "Integration test",
          startDate: new Date("2026-12-30T00:00:00Z"), endDate: new Date("2027-01-02T00:00:00Z"),
          attachmentId: attachment.id,
        } });
        await tx.attendanceDay.create({ data: {
          employeeId: employee.id, attendanceDate: leave.startDate,
          status: type === "ANNUAL_LEAVE" ? "LEAVE" : type,
        } });
        const actualAttendance = await tx.attendanceDay.create({ data: {
          employeeId: employee.id, attendanceDate: leave.endDate, checkInAt: leave.endDate,
        } });
        await tx.notificationLog.create({ data: {
          channel: "EMAIL", type: "LEAVE_APPROVED", recipient: "test@example.test",
          entityType: "LeaveRequest", entityId: leave.id,
        } });

        const result = await deleteLeaveRequest(tx,leave.id,{actorId:actor.id,ipAddress:null,userAgent:null});
        assert.equal(result.attendanceDaysDeleted,1);
        assert.equal(result.files.length,1);
        assert.equal(await tx.leaveRequest.count({where:{id:leave.id}}),0);
        assert.equal(await tx.attachment.count({where:{id:attachment.id}}),0);
        assert.equal(await tx.notificationLog.count({where:{entityId:leave.id}}),0);
        assert.equal(await tx.auditLog.count({where:{entityId:leave.id,action:"DELETE"}}),1);
        assert.equal(await tx.attendanceDay.count({where:{id:actualAttendance.id}}),1);
        const balances = await tx.leaveBalance.findMany({where:{employeeId:employee.id}});
        assert.ok(balances.every(balance=>balance.used===0));
        assert.equal(result.balanceReturned.reduce((total,usage)=>total+usage.days,0),type==="ANNUAL_LEAVE"?4:0);
        await assert.rejects(deleteLeaveRequest(tx,leave.id,{actorId:actor.id,ipAddress:null,userAgent:null}),/LEAVE_NOT_FOUND/);
        throw rollback;
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    } catch(error) {
      if(error!==rollback) throw error;
    }
    assert.equal(await prisma.employee.count({where:{employeeCode}}),0);
    console.log(`PASS PostgreSQL deletion and rollback: ${type}`);
  }
} finally {
  await prisma.$disconnect();
}
