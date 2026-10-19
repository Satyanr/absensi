import assert from 'node:assert/strict';
import test from 'node:test';
import {getAttendanceDate,evaluateCheckIn,evaluateCheckOut} from '../src/lib/attendance/time.ts';
import {validateGpsFreshness} from '../src/lib/attendance/location-security.ts';
import {getDistanceMeters} from '../src/lib/attendance/geofence.ts';
import {createPublicLeaveRequestSchema} from '../src/lib/validation/leave.ts';
import {detectImageFile,detectDocxFile} from '../src/lib/security/file-signature.ts';
import {enforceRateLimit} from '../src/lib/security/rate-limit.ts';
import fs from 'node:fs';

const policy={workStart:'08:00',lateAfter:'08:15',workEnd:'17:00',overtimeAfter:'19:00',weekendIsOvertime:true};
test('attendance date follows office timezone across UTC midnight',()=>{
  assert.equal(getAttendanceDate(new Date('2026-10-18T18:00:00Z')).toISOString(),'2026-10-19T00:00:00.000Z');
});
test('check-in handles on-time boundary and lateness',()=>{
  assert.equal(evaluateCheckIn(new Date('2026-10-19T01:15:00Z'),policy).status,'ON_TIME');
  assert.deepEqual(evaluateCheckIn(new Date('2026-10-19T01:16:00Z'),policy),{status:'LATE',lateMinutes:1});
});
test('check-out handles early departure, normal hours and overtime',()=>{
  const checkin=new Date('2026-10-19T01:00:00Z');
  assert.equal(evaluateCheckOut(new Date('2026-10-19T09:59:00Z'),checkin,policy).earlyLeaveMinutes,1);
  assert.equal(evaluateCheckOut(new Date('2026-10-19T10:00:00Z'),checkin,policy).status,'NORMAL');
  assert.equal(evaluateCheckOut(new Date('2026-10-19T12:10:00Z'),checkin,policy).overtimeMinutes,10);
});
test('weekend overtime uses elapsed work duration',()=>{
  assert.equal(evaluateCheckOut(new Date('2026-10-18T05:00:00Z'),new Date('2026-10-18T01:00:00Z'),policy).overtimeMinutes,240);
});
test('GPS rejects invalid, old and future coordinates',()=>{
  const now=new Date('2026-10-19T01:00:00Z');
  assert.equal(validateGpsFreshness('invalid',now).reason,'INVALID');
  assert.equal(validateGpsFreshness('2026-10-19T00:55:00Z',now).reason,'STALE');
  assert.equal(validateGpsFreshness('2026-10-19T01:05:00Z',now).reason,'FUTURE');
  assert.equal(validateGpsFreshness(now.toISOString(),now).ok,true);
});
test('geofence distance uses meters and identical points have no distance',()=>{
  assert.equal(getDistanceMeters(-6.2,106.8,-6.2,106.8),0);
  assert.ok(getDistanceMeters(0,0,0,0.01)>1100);
});
test('leave input rejects impossible dates and reversed periods',()=>{
  const input={employeeCode:'EMP001',type:'SICK',startDate:'2026-02-30',endDate:'2026-03-01',reason:'Sakit'};
  assert.equal(createPublicLeaveRequestSchema.safeParse(input).success,false);
  assert.equal(createPublicLeaveRequestSchema.safeParse({...input,startDate:'2026-03-02'}).success,false);
  assert.equal(createPublicLeaveRequestSchema.safeParse({...input,startDate:'2026-02-28'}).success,true);
});
test('file detector rejects disguised text and accepts the real leave template',()=>{
  assert.equal(detectImageFile(Buffer.from('fake photo')),null);
  assert.ok(detectDocxFile(fs.readFileSync('resources/templates/form-pengajuan-cuti.docx')));
});
test('login rate limiting returns 429 and retry delay',()=>{
  const request=new Request('http://localhost/api/auth/login',{headers:{'x-forwarded-for':'192.0.2.1'}});
  const options={scope:`test-login-${Date.now()}`,limit:2,windowMs:60000};
  assert.equal(enforceRateLimit(request,options),null);
  assert.equal(enforceRateLimit(request,options),null);
  const limited=enforceRateLimit(request,options);
  assert.equal(limited.status,429);
  assert.ok(Number(limited.headers.get('retry-after'))>0);
});
