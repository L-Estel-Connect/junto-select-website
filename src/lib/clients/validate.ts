import { aboutMeSteps, type StepId } from "@/lib/introduction/aboutMeFields";
import {
  CLIENT_STATUSES,
  CONTACT_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  emptyClientProfile,
  type ClientPayment,
  type ClientProfileAnswers,
  type ClientView,
} from "./types";
import { getPlace } from "@/lib/geo/places";

/**
 * Turns an admin PATCH body into a clean update for `clients/{id}`. Every
 * option value is checked against the SAME lists the candidate
 * questionnaire uses (aboutMeFields.ts), so a client can never hold an
 * answer a candidate couldn't. Unknown keys are ignored; a wrong value
 * makes the whole request fail with the field's name, rather than being
 * silently dropped.
 */

export class ClientValidationError extends Error {
  constructor(public field: string) {
    super(`invalid_${field}`);
  }
}

function optionValues(id: StepId): string[] {
  const step = aboutMeSteps.find((s) => s.id === id);
  return step && "options" in step ? step.options.map((o) => o.value) : [];
}

const GENDERS = optionValues("gender");
const EDUCATION = optionValues("educationLevel");
const INCOME = optionValues("incomeRange");
const LANGUAGES = optionValues("languages");
const INTENTIONS = optionValues("relationshipIntention");
const FREQUENCY = optionValues("smoking");
const ACTIVITY = optionValues("activityLevel");
const FUTURE_CHILDREN = optionValues("wantsFutureChildren");
const DISTANCE = ["misma_ciudad", "sin_limite"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(v: unknown, field: string, max: number): string {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string" || v.length > max) throw new ClientValidationError(field);
  return v.trim();
}

function oneOf<T extends string>(v: unknown, allowed: readonly string[], field: string): T | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !allowed.includes(v)) throw new ClientValidationError(field);
  return v as T;
}

function manyOf<T extends string>(v: unknown, allowed: readonly string[], field: string): T[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !allowed.includes(x))) {
    throw new ClientValidationError(field);
  }
  return [...new Set(v as string[])] as T[];
}

function int(v: unknown, field: string, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new ClientValidationError(field);
  return n;
}

function bool(v: unknown, field: string): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "boolean") throw new ClientValidationError(field);
  return v;
}

function date(v: unknown, field: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new ClientValidationError(field);
  return v;
}

function profileAnswers(v: unknown): ClientProfileAnswers {
  const empty = emptyClientProfile();
  if (v === null || v === undefined) return empty;
  if (typeof v !== "object") throw new ClientValidationError("profile");
  const p = v as Record<string, Record<string, unknown> | undefined> & { incomeRange?: unknown };
  const vis = p.visible ?? {};
  const db = p.dealbreakers ?? {};
  const pr = p.preferences ?? {};
  const hasChildren = bool(vis.hasChildren, "hasChildren");
  const gendersSought = manyOf<"mujer" | "hombre">(db.gendersSought, GENDERS, "gendersSought");
  if (gendersSought.length > 1) throw new ClientValidationError("gendersSought");
  const ageMin = int(db.ageMin, "ageMin", 18, 99);
  const ageMax = int(db.ageMax, "ageMax", 18, 99);
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) throw new ClientValidationError("ageRange");
  const heightMinCm = int(pr.heightMinCm, "heightMinCm", 130, 220);
  const heightMaxCm = int(pr.heightMaxCm, "heightMaxCm", 130, 220);
  if (heightMinCm !== null && heightMaxCm !== null && heightMinCm > heightMaxCm) throw new ClientValidationError("heightRange");
  return {
    visible: {
      gender: oneOf(vis.gender, GENDERS, "gender"),
      profession: text(vis.profession, "profession", 80),
      educationLevel: oneOf(vis.educationLevel, EDUCATION, "educationLevel"),
      heightCm: int(vis.heightCm, "heightCm", 130, 220),
      languages: manyOf(vis.languages, LANGUAGES, "languages"),
      hasChildren,
      // Same rule as the candidate questionnaire: only meaningful with children.
      hasYoungChildren: hasChildren === true ? bool(vis.hasYoungChildren, "hasYoungChildren") : hasChildren === false ? false : null,
      wantsFutureChildren: oneOf(vis.wantsFutureChildren, FUTURE_CHILDREN, "wantsFutureChildren"),
      relationshipIntention: oneOf(vis.relationshipIntention, INTENTIONS, "relationshipIntention"),
      smoking: oneOf(vis.smoking, FREQUENCY, "smoking"),
      drinking: oneOf(vis.drinking, FREQUENCY, "drinking"),
      activityLevel: oneOf(vis.activityLevel, ACTIVITY, "activityLevel"),
    },
    incomeRange: oneOf(p.incomeRange, INCOME, "incomeRange"),
    dealbreakers: {
      ...empty.dealbreakers,
      gendersSought,
      ageMin,
      ageMax,
      maxDistance: oneOf(db.maxDistance, DISTANCE, "maxDistance"),
      relationshipIntentionsAccepted: manyOf(db.relationshipIntentionsAccepted, INTENTIONS, "relationshipIntentionsAccepted"),
      smokingAccepted: manyOf(db.smokingAccepted, FREQUENCY, "smokingAccepted"),
      partnerYoungChildrenMatters: bool(db.partnerYoungChildrenMatters, "partnerYoungChildrenMatters"),
    },
    preferences: {
      heightMinCm,
      heightMaxCm,
      drinkingAccepted: manyOf(pr.drinkingAccepted, FREQUENCY, "drinkingAccepted"),
      activityLevelsPreferred: manyOf(pr.activityLevelsPreferred, ACTIVITY, "activityLevelsPreferred"),
    },
  };
}

function payment(v: unknown): ClientPayment {
  if (v === null || v === undefined) return { status: "pendiente", amountEur: null, method: null, reference: "", paidOn: null };
  if (typeof v !== "object") throw new ClientValidationError("payment");
  const p = v as Record<string, unknown>;
  return {
    status: oneOf<ClientPayment["status"]>(p.status, PAYMENT_STATUSES.map((s) => s.value), "paymentStatus") ?? "pendiente",
    amountEur: int(p.amountEur, "amountEur", 0, 100000),
    method: oneOf<NonNullable<ClientPayment["method"]>>(p.method, PAYMENT_METHODS.map((s) => s.value), "paymentMethod"),
    reference: text(p.reference, "paymentReference", 120),
    paidOn: date(p.paidOn, "paidOn"),
  };
}

/** The editable fields of a client, as stored. */
export type ClientWritable = Omit<ClientView, "id" | "createdAt" | "updatedAt" | "createdBy" | "inquiryId">;

const EDITABLE: (keyof ClientWritable)[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "channel",
  "ageYears",
  "city",
  "placeIne",
  "programme",
  "status",
  "programmeStart",
  "programmeEnd",
  "payment",
  "profile",
  "valuesInterests",
  "dealbreakersNotes",
  "notes",
];

/**
 * Validates the keys present in `body`. Sections are replaced whole
 * (`profile`, `payment`), which is what the page sends: the page always
 * holds the complete section it edits.
 */
export function sanitizeClientPatch(body: Record<string, unknown>, today: string): Partial<ClientWritable> {
  const out: Partial<ClientWritable> = {};
  for (const key of EDITABLE) {
    if (!(key in body)) continue;
    const v = body[key];
    switch (key) {
      case "firstName":
      case "lastName":
        out[key] = text(v, key, 80);
        break;
      case "email": {
        const e = text(v, key, 200).toLowerCase();
        if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ClientValidationError(key);
        out.email = e;
        break;
      }
      case "phone":
        out.phone = text(v, key, 40);
        break;
      case "channel":
        out.channel = oneOf<ClientView["channel"] & string>(v, CONTACT_CHANNELS.map((c) => c.value), key);
        break;
      case "ageYears":
        out.ageYears = int(v, key, 18, 99);
        out.ageRecordedOn = out.ageYears === null ? null : today;
        break;
      case "city":
        out.city = text(v, key, 80);
        break;
      case "placeIne": {
        const ine = v === null || v === "" ? null : typeof v === "string" ? v : "";
        if (ine !== null && !getPlace(ine)) throw new ClientValidationError(key);
        out.placeIne = ine;
        break;
      }
      case "programme":
        out.programme = oneOf<"select" | "privado">(v, ["select", "privado"], key);
        break;
      case "status":
        out.status = oneOf<ClientView["status"]>(v, CLIENT_STATUSES.map((s) => s.value), key) ?? "activo";
        break;
      case "programmeStart":
      case "programmeEnd":
        out[key] = date(v, key);
        break;
      case "payment":
        out.payment = payment(v);
        break;
      case "profile":
        out.profile = profileAnswers(v);
        break;
      case "valuesInterests":
      case "dealbreakersNotes":
      case "notes":
        out[key] = text(v, key, 6000);
        break;
    }
  }
  return out;
}

/** Six months after the start, the day before (3 Nov → 2 May). */
export function programmeEndFor(start: string, months: number): string {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
