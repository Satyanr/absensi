export type LeaveReportType =
  | "PERMISSION"
  | "SICK"
  | "ANNUAL_LEAVE";

type ApprovedLeave = {
  id: string;
  type: LeaveReportType;
  startDate: Date;
  endDate: Date;
  reason: string;

  employee: {
    id: string;
    employeeCode: string;
    name: string;
    active: boolean;
  };
};

export type LeaveReportRow = {
  id: string;
  source: "LEAVE";
  reportDate: Date;
  leaveType: LeaveReportType;
  reason: string;

  employee: {
    id: string;
    employeeCode: string;
    name: string;
    active: boolean;
  };
};

function utcDate(
  value: Date
) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate()
    )
  );
}

export function expandApprovedLeaveRows(
  leaves: ApprovedLeave[],
  fromDate: Date,
  toDate: Date
): LeaveReportRow[] {
  const rows: LeaveReportRow[] =
    [];

  for (const leave of leaves) {
    const leaveStart =
      utcDate(leave.startDate);

    const leaveEnd =
      utcDate(leave.endDate);

    const reportStart =
      utcDate(fromDate);

    const reportEnd =
      utcDate(toDate);

    const start = new Date(
      Math.max(
        leaveStart.getTime(),
        reportStart.getTime()
      )
    );

    const end = new Date(
      Math.min(
        leaveEnd.getTime(),
        reportEnd.getTime()
      )
    );

    if (
      start.getTime() >
      end.getTime()
    ) {
      continue;
    }

    const cursor =
      new Date(start);

    while (
      cursor.getTime() <=
      end.getTime()
    ) {
      const dateKey =
        cursor
          .toISOString()
          .slice(0, 10);

      rows.push({
        id:
          `leave:${leave.id}:${dateKey}`,

        source:
          "LEAVE",

        reportDate:
          new Date(cursor),

        leaveType:
          leave.type,

        reason:
          leave.reason,

        employee:
          leave.employee,
      });

      cursor.setUTCDate(
        cursor.getUTCDate() + 1
      );
    }
  }

  return rows;
}