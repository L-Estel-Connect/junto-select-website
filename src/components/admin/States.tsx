export function AdminLoading() {
  return <p className="py-16 text-center text-[14px] text-ink-soft">Cargando…</p>;
}

export function AdminError({ message }: { message?: string }) {
  return (
    <p className="rounded-xl border border-[#f0d7d4] bg-[#fbf1f0] px-5 py-4 text-[14px] text-[#8a3b3b]">
      {message ?? "Algo ha fallado. Inténtalo de nuevo."}
    </p>
  );
}

export function AdminEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-hairline px-5 py-10 text-center text-[14px] text-ink-soft">
      {message}
    </div>
  );
}
