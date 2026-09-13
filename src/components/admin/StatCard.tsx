import Link from "next/link";

export default function StatCard({
  label,
  value,
  href,
  helper,
}: {
  label: string;
  value: string | number;
  href?: string;
  helper?: string;
}) {
  const content = (
    <>
      <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-ink-soft">{label}</p>
      <p className="mt-2 font-serif text-[30px] leading-none text-ink">{value}</p>
      {helper && <p className="mt-1 text-[12px] text-ink-soft">{helper}</p>}
    </>
  );

  const className =
    "block rounded-2xl border border-hairline bg-white p-5 transition-colors" +
    (href ? " hover:border-rose" : "");

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
