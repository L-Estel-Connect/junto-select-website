type PhotoProps = {
  /** Tailwind aspect-ratio class(es), e.g. "aspect-[4/5] sm:aspect-[21/9]" */
  ratio: string;
  /** Description of the real photograph that belongs in this slot. Used as
   *  the accessible label until the real asset is supplied. */
  label: string;
  className?: string;
};

/**
 * Stand-in for supplied/commissioned photography that isn't in the repo yet
 * (see ASSETS.md) — an abstract warm-toned panel evoking candlelight rather
 * than a literal placeholder graphic. Replace usages of this component with
 * `next/image` pointed at the real file once one is added under
 * /public/images.
 */
export default function Photo({ ratio, label, className = "" }: PhotoProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative overflow-hidden bg-[linear-gradient(160deg,#f3ece9_0%,#e9dad5_55%,#d8c1b8_100%)] ${ratio} ${className}`}
    >
      <div className="pointer-events-none absolute -left-8 top-[8%] h-2/5 w-2/5 rounded-full bg-rose/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-[6%] h-1/2 w-1/2 rounded-full bg-[#b98f7f]/25 blur-3xl" />
    </div>
  );
}
