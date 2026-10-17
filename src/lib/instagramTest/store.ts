import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getTokenKey } from "./config";
import { decrypt, encrypt, type EncryptedValue } from "./crypto";

/**
 * Server-only Firestore documents (firestore.rules already denies every
 * client read and write outside the listed collections):
 *   instagramTest/state                  connection + test settings, token encrypted
 *   instagramTestEvents/{commentId}      one per comment received (doc id = de-duplication)
 *   instagramTestLocks/{mediaId_fromId}  one reply per person on the test Reel
 *   instagramTestDeliveries/{auto}       every webhook POST, fields only (no body)
 * All of it is test data in the staging project; delete it after the test.
 */
export const stateRef = adminDb.doc("instagramTest/state");
export const eventsCol = adminDb.collection("instagramTestEvents");
export const locksCol = adminDb.collection("instagramTestLocks");
export const deliveriesCol = adminDb.collection("instagramTestDeliveries");

export interface InstagramTestState {
  igUserId?: string;
  /** The app-scoped user id the OAuth exchange returned, kept to compare with webhook entry ids. */
  oauthUserId?: string;
  username?: string;
  accountType?: string;
  permissions?: string[];
  token?: EncryptedValue;
  tokenExpiresAt?: Timestamp;
  connectedAt?: Timestamp;
  connectedBy?: string;
  subscribed?: boolean;
  subscribeError?: string | null;
  mediaId?: string | null;
  mediaPermalink?: string | null;
  mediaCaption?: string | null;
  testCommenterUsername?: string | null;
  sendEnabled?: boolean;
  sentCount?: number;
  updatedAt?: Timestamp;
}

export async function readState(): Promise<InstagramTestState> {
  const snap = await stateRef.get();
  return (snap.data() as InstagramTestState | undefined) ?? {};
}

export async function readToken(state?: InstagramTestState): Promise<string | null> {
  const s = state ?? (await readState());
  if (!s.token) return null;
  return decrypt(s.token, getTokenKey());
}

export function encryptToken(token: string): EncryptedValue {
  return encrypt(token, getTokenKey());
}

export { FieldValue, Timestamp };
