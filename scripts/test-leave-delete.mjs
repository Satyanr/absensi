import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// Resolve the extensionless TypeScript helper without requiring npm packages.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === './balance' && context.parentURL?.endsWith('/leave/delete.ts') ? './balance.ts' : specifier, context);
  },
});
const { deleteLeaveRequest } = await import('../src/lib/leave/delete.ts');
const date = (value) => new Date(`${value}T00:00:00.000Z`);
const context = { actorId: 'admin', ipAddress: null, userAgent: null };
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'NOT') return value.every((condition) => !matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('none' in value) return (row[key] ?? []).length === 0;
      return Object.entries(value).every(([op, expected]) => {
        if (op === 'in') return expected.includes(row[key]);
        if (op === 'gte') return row[key] >= expected;
        if (op === 'lte') return row[key] <= expected;
        throw new Error(`Unhandled filter ${op}`);
      });
    }
    return value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value;
  });
}
function fixture(overrides = {}) {
  const leave = {
    id: 'leave', employeeId: 'employee', type: 'ANNUAL_LEAVE', status: 'APPROVED',
    startDate: date('2026-10-01'), endDate: date('2026-10-03'), updatedAt: date('2026-10-01'),
    attachmentId: 'form', approvedDocumentId: 'final', reason: 'Test', ...overrides,
  };
  return {
    leaves: [leave], balances: [{ employeeId: 'employee', year: 2026, entitlement: 12, used: 3 }],
    attendance: [], notifications: [{entityType:'LeaveRequest',entityId:'leave'}, {entityType:'LeaveRequest',entityId:'other'}],
    attachments: ['form','final'].map(id => ({id, storageDisk:'local', storagePath:`${id}.pdf`})), audits: [],
  };
}
async function transaction(state, options = {}) {
  const draft = structuredClone(state);
  const remove = (key, where) => {
    const old = draft[key].length;
    draft[key] = draft[key].filter(row => !matches(row, where));
    return {count: old - draft[key].length};
  };
  const tx = {
    leaveRequest: {
      findUnique: async ({where}) => draft.leaves.find(row => matches(row, where)) ?? null,
      deleteMany: async ({where}) => options.changed ? {count:0} : remove('leaves', where),
      findMany: async ({where}) => draft.leaves.filter(row => matches(row, where)),
    },
    leaveBalance: { updateMany: async ({where, data}) => {
      const rows = draft.balances.filter(row => matches(row, where));
      for (const row of rows) row.used -= data.used.decrement;
      return {count:rows.length};
    }},
    attendanceDay: {deleteMany: async ({where}) => remove('attendance',where)},
    notificationLog: {deleteMany: async ({where}) => remove('notifications',where)},
    attachment: {
      findMany: async ({where}) => draft.attachments.filter(row => matches(row,where)),
      deleteMany: async ({where}) => remove('attachments',where),
    },
    auditLog: {create: async ({data}) => {
      if (options.auditFailure) throw new Error('AUDIT_FAILURE');
      draft.audits.push(data);
    }},
  };
  const result = await deleteLeaveRequest(tx, 'leave', context);
  Object.assign(state, draft);
  return result;
}

test('approved annual leave returns its days, removes request, documents and notifications, and records audit', async () => {
  const state = fixture();
  const result = await transaction(state);
  assert.equal(state.balances[0].entitlement - state.balances[0].used,12);
  assert.deepEqual(result.balanceReturned,[{year:2026,days:3}]);
  assert.equal(state.leaves.length,0);
  assert.equal(state.attachments.length,0);
  assert.deepEqual(state.notifications,[{entityType:'LeaveRequest',entityId:'other'}]);
  assert.equal(state.audits[0].action,'DELETE');
  const after = structuredClone(state);
  await assert.rejects(transaction(state),/LEAVE_NOT_FOUND/);
  assert.deepEqual(state,after);
});

for (const status of ['PENDING','REJECTED','CANCELLED']) {
  test(`${status} annual leave does not refund unused days`, async () => {
    const state = fixture({status});
    const result = await transaction(state);
    assert.equal(state.balances[0].used,3);
    assert.deepEqual(result.balanceReturned,[]);
  });
}
for (const type of ['PERMISSION','SICK','ANNUAL_LEAVE']) {
  test(`${type} clears only absence placeholders on its dates and employee`, async () => {
    const state = fixture({type});
    const status = type === 'ANNUAL_LEAVE' ? 'LEAVE' : type;
    const blank = {employeeId:'employee',attendanceDate:date('2026-10-02'),status,checkInAt:null,checkOutAt:null,events:[]};
    state.attendance = [
      {id:'placeholder',...blank},
      {id:'present',...blank,checkInAt:new Date()},
      {id:'checkout',...blank,checkOutAt:new Date()},
      {id:'event',...blank,events:[{id:'event'}]},
      {id:'other-employee',...blank,employeeId:'other'},
      {id:'other-date',...blank,attendanceDate:date('2026-10-04')},
      {id:'other-status',...blank,status:'ABSENT'},
    ];
    const result = await transaction(state);
    assert.equal(result.attendanceDaysDeleted,1);
    assert.deepEqual(state.attendance.map(row=>row.id),['present','checkout','event','other-employee','other-date','other-status']);
    if(type !== 'ANNUAL_LEAVE') assert.equal(state.balances[0].used,3);
  });
}
test('refund preserves other approved leave usage', async () => {
  const state = fixture();
  state.balances[0].used = 5;
  await transaction(state);
  assert.equal(state.balances[0].used,2);
});
test('cross-year leave refunds each year using the approval day counting rules', async () => {
  const state = fixture({startDate:date('2026-12-30'),endDate:date('2027-01-02')});
  state.balances = [{employeeId:'employee',year:2026,used:2},{employeeId:'employee',year:2027,used:2}];
  const result = await transaction(state);
  assert.deepEqual(result.balanceReturned,[{year:2026,days:2},{year:2027,days:2}]);
  assert.deepEqual(state.balances.map(row=>row.used),[0,0]);
});
for(const missing of [false,true]) {
  test(`inconsistent or missing balance rolls back deletion (${missing})`,async()=>{
    const state=fixture();
    state.balances = missing ? [] : [{employeeId:'employee',year:2026,used:1}];
    const before=structuredClone(state);
    await assert.rejects(transaction(state),/BALANCE_INVALID:2026/);
    assert.deepEqual(state,before);
  });
}
test('shared attachments and dates covered by other approved leave are preserved',async()=>{
  const state=fixture({type:'SICK'});
  state.leaves.push({...state.leaves[0],id:'other',startDate:date('2026-10-02'),endDate:date('2026-10-02')});
  state.attachments[0].leaveRequests=[{id:'other'}];
  state.attendance=[1,2,3].map(day=>({id:day,employeeId:'employee',attendanceDate:date(`2026-10-0${day}`),status:'SICK',checkInAt:null,checkOutAt:null,events:[]}));
  await transaction(state);
  assert.deepEqual(state.attendance.map(row=>row.id),[2]);
  assert.deepEqual(state.attachments.map(row=>row.id),['form']);
});
for (const options of [{changed:true},{auditFailure:true}]) {
  test(`concurrent change or audit failure rolls back all changes: ${JSON.stringify(options)}`, async()=>{
    const state=fixture();
    const before=structuredClone(state);
    await assert.rejects(transaction(state,options),/LEAVE_CHANGED|AUDIT_FAILURE/);
    assert.deepEqual(state,before);
  });
}
