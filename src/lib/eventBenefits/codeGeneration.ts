import "server-only";
import { randomInt } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";

// Uppercase letters + digits, minus visually ambiguous characters
// (0/O, 1/I/L) — never sequential, never derived from the member's name,
// email, or uid. `randomInt` is Node's CSPRNG-backed helper (crypto, not
// Math.random()).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_PREFIX = "JS-";
const MAX_GENERATION_ATTEMPTS = 10;

function randomCodeSuffix(): string {
  let suffix = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return suffix;
}

/**
 * Generates a member-facing code like `JS-4K9X2P`. Collision handling is
 * explicit, not assumed from randomness alone (32^6 ≈ 10^9 possibilities
 * makes a collision astronomically unlikely at this product's scale, but
 * "astronomically unlikely" is not the same as "impossible," and the cost
 * of checking is one cheap Firestore read): checks the `eventBenefits`
 * collection for an existing doc with this exact code before accepting
 * it, retrying with a fresh random suffix on a hit.
 */
export async function generateUniqueEventBenefitCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const candidate = `${CODE_PREFIX}${randomCodeSuffix()}`;
    const existing = await adminDb.collection("eventBenefits").where("code", "==", candidate).limit(1).get();
    if (existing.empty) return candidate;
  }
  throw new Error("event_benefit_code_generation_exhausted");
}
