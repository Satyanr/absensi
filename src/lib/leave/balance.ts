export type LeaveDaysByYear = {
  year: number;
  days: number;
};

export function countLeaveDaysByYear(
  startDate: Date,
  endDate: Date
): LeaveDaysByYear[] {
  const result =
    new Map<number, number>();

  const cursor = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate()
    )
  );

  const end = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate()
    )
  );

  while (
    cursor.getTime() <=
    end.getTime()
  ) {
    const year =
      cursor.getUTCFullYear();

    result.set(
      year,
      (result.get(year) ?? 0) +
        1
    );

    cursor.setUTCDate(
      cursor.getUTCDate() + 1
    );
  }

  return Array.from(
    result.entries()
  ).map(([year, days]) => ({
    year,
    days,
  }));
}