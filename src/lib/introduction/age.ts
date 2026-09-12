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
