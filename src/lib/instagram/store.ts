import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getTokenKey } from "./config";
import { decrypt, encrypt, type EncryptedValue } from "./crypto";

/**
 * Server-only Firestore documents (firestore.rules denies every client read
 * and write outside the listed collections):
 *   instagramAutomation/state              connection + automation settings, token encrypted
 *   instagramComments/{commentId}          one per comment seen (doc id = de-duplication)
 *   instagramReplyLocks/{mediaId_fromId}   one message per person on a Reel
 *   instagramWebhookDeliveries/{auto}      every webhook POST, fields only (no body)
 */
export const stateRef = adminDb.doc("instagramAutomation/state");
export const commentsCol = adminDb.collection("instagramComments");
export const locksCol = adminDb.collection("instagramReplyLocks");
export const deliveriesCol = adminDb.collection("instagramWebhookDeliveries");

/** off: comments are ignored. paused: comments are detected and recorded, nothing is sent. active: matching comments get the message. */
export type AutomationStatus = "off" | "paused" | "active";

export interface InstagramState {
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
  keyword?: string | null;
  replyText?: string | null;
  status?: AutomationStatus;
  /** Comments older than this never get a message (set each time the automation is activated). */
  activeSince?: Timestamp | null;
  dailyLimit?: number;
  dailyDate?: string;
  dailyCount?: number;
  sentTotal?: number;
  updatedAt?: Timestamp;
}

export async function readState(): Promise<InstagramState> {
  const snap = await stateRef.get();
  return (snap.data() as InstagramState | undefined) ?? {};
}

export async function readToken(state?: InstagramState): Promise<string | null> {
  const s = state ?? (await readState());
  if (!s.token) return null;
  return decrypt(s.token, getTokenKey());
}

export function encryptToken(token: string): EncryptedValue {
  return encrypt(token, getTokenKey());
}

export { FieldValue, Timestamp };
