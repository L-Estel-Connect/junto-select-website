type PhotoProps = {
  /** Tailwind aspect-ratio class(es), e.g. "aspect-[4/5] sm:aspect-[21/9]" */
  ratio: string;
  /** Description of the real photograph that belongs in this slot. Shown as a
   *  small on-page caption until the real asset is supplied, and doubles as
   *  the alt text once it is. */
  label: string;
  className?: string;
};

/**
 * Placeholder for supplied photography that could not be retrieved as a file
 * in this environment (see ASSETS.md). Replace usages of this component with
 * `next/image` pointed at the real file once it is added under /public/images.
 */
export default function Photo({ ratio, label, className = "" }: PhotoProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative flex items-end overflow-hidden bg-[linear-gradient(155deg,#efe7e4_0%,#e4d8d5_45%,#d9c9c6_100%)] ${ratio} ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-multiply [background-image:radial-gradient(circle_at_1px_1px,#262220_1px,transparent_0)] [background-size:14px_14px]" />
      <p className="relative z-10 m-4 max-w-[85%] text-[10px] font-medium uppercase tracking-[0.15em] text-ink-soft sm:m-6">
        Photography placeholder — {label}
      </p>
    </div>
  );
}
