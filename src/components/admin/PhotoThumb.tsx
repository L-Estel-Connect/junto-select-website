/**
 * Streams through /api/admin/dashboard/photo (cookie-authenticated, no
 * Storage download URL ever created — see that route's doc comment). A
 * plain <img> works here because the admin page-load cookie is sent
 * automatically with the request.
 */
export default function PhotoThumb({
  path,
  alt,
  size = 40,
  rounded = "full",
}: {
  path: string | null;
  alt: string;
  size?: number;
  rounded?: "full" | "lg";
}) {
  const dimension = `${size}px`;
  const radiusClass = rounded === "full" ? "rounded-full" : "rounded-lg";

  if (!path) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center bg-rose-tint text-[11px] font-medium text-ink-soft ${radiusClass}`}
        style={{ width: dimension, height: dimension }}
        aria-hidden="true"
      >
        {alt.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated, per-request-cookie-gated proxy; next/image's optimizer can't route through it.
    <img
      src={`/api/admin/dashboard/photo?path=${encodeURIComponent(path)}`}
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 object-cover ${radiusClass}`}
      style={{ width: dimension, height: dimension }}
    />
  );
}
