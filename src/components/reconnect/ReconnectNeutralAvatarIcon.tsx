/**
 * The tasteful, neutral silhouette used wherever a Reconnect photo can't or
 * shouldn't be shown — an unactivated attendee, an activated participant
 * who chose to hide their photo, or a requester on an incoming-request card
 * whose photo preference says the same. Deliberately generic (never a
 * "user icon" that reads as broken/incomplete) and deliberately the ONE
 * shared implementation, so every one of those surfaces renders identically
 * rather than drifting into three slightly different placeholders.
 */
export default function ReconnectNeutralAvatarIcon({ className }: { className?: string }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
      <circle cx="20" cy="15" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 34c1.5-8 7-12 14-12s12.5 4 14 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
