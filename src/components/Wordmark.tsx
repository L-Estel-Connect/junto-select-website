export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-light uppercase tracking-[0.32em] ${className}`}
    >
      Junto <span className="text-rose-dark">Select</span>
    </span>
  );
}
