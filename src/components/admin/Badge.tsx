const TONE_CLASSES = {
  neutral: "bg-rose-tint text-ink",
  positive: "bg-[#e7f0e6] text-[#3a5a37]",
  warning: "bg-[#f6ead2] text-[#7a5a1e]",
  negative: "bg-[#f5e2e0] text-[#8a3b3b]",
  muted: "bg-hairline/60 text-ink-soft",
} as const;

export default function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof TONE_CLASSES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
