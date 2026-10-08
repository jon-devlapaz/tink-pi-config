export function visibleStatuses(
  statuses: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  return new Map(
    [...statuses].filter(
      ([key, value]) =>
        key !== "pi-herdr" || !/^herdr \d+\.\d+\.\d+$/.test(value),
    ),
  );
}
