export const MINIMUM_AGE = 35;

/**
 * Exact age in whole years as of `at` (defaults to now), from an
 * ISO `YYYY-MM-DD` birth date. Day-precise: turning 35 today counts as 35.
 */
export function getAge(birthDateISO: string, at: Date = new Date()): number {
  const birth = new Date(`${birthDateISO}T00:00:00`);
  let age = at.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear =
    at.getMonth() > birth.getMonth() ||
    (at.getMonth() === birth.getMonth() && at.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export function isEligibleAge(birthDateISO: string): boolean {
  return getAge(birthDateISO) >= MINIMUM_AGE;
}

/**
 * Whether someone born in `birthYear` could still be `thresholdAge` or
 * younger, using birth YEAR alone (never a full birth date for a child —
 * see README "Children / future children"). Calendar-year subtraction is
 * ambiguous by exactly ±1 year depending on whether the birthday has
 * passed yet this year; this always resolves that ambiguity toward
 * "could still be under the threshold" rather than asserting they're
 * older than they might actually be — the same "never treat ambiguous as
 * compatible" rule applied to date math instead of missing data.
 */
export function isPossiblyUnderAge(
  birthYear: number,
  thresholdAge: number,
  at: Date = new Date(),
): boolean {
  return at.getFullYear() - birthYear <= thresholdAge;
}

/** True if ANY of the given birth years could still be under `thresholdAge`. */
export function hasChildUnderAge(
  childrenBirthYears: number[],
  thresholdAge: number,
  at: Date = new Date(),
): boolean {
  return childrenBirthYears.some((year) => isPossiblyUnderAge(year, thresholdAge, at));
}
