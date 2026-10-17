import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { attachConfirmedPlace } from "@/lib/geo/profileLocation";
import { getPlace } from "@/lib/geo/places";
import type { ClientView } from "./types";

/**
 * A client as a ProfileDocument, so hardFilters.ts and scoring.ts compare
 * them with candidates exactly as they compare two candidates. Built in
 * memory for each search, never stored as a profile.
 *
 * Age: clients tell us an age, not a birth date. The birth date used here
 * is the day that age was recorded minus that many years and half a year,
 * so the age reads correctly then and moves on with time during a six-month
 * programme (off by at most six months in either direction).
 */
export function birthDateForAge(ageYears: number, recordedOn: string): Date {
  const d = new Date(`${recordedOn}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - ageYears);
  d.setUTCDate(d.getUTCDate() - 182);
  return d;
}

export function clientAsProfile(client: ClientView, now: Date = new Date()): ProfileDocument {
  const birthDate =
    client.ageYears === null
      ? null
      : birthDateForAge(client.ageYears, client.ageRecordedOn ?? now.toISOString().slice(0, 10));
  const profile = withProfileDefaults(`client_${client.id}`, {
    visible: {
      ...client.profile.visible,
      firstName: client.firstName,
      city: client.city,
      market: "madrid",
      marketAvailability: null,
    } as ProfileDocument["visible"],
    private: {
      // hardFilters/scoring only ever call `.toDate()` on it.
      birthDate: birthDate ? ({ toDate: () => birthDate } as unknown as ProfileDocument["private"]["birthDate"]) : null,
      incomeRange: client.profile.incomeRange,
    },
    dealbreakers: client.profile.dealbreakers,
    preferences: client.profile.preferences,
  });
  attachConfirmedPlace(profile, getPlace(client.placeIne));
  return profile;
}
