"use client";

import { useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import PhotoThumb from "./PhotoThumb";

interface MemberOption {
  uid: string;
  firstName: string;
  city: string;
  photoPath: string | null;
}

/** Small name-search autocomplete — used to pick a member without knowing their uid (e.g. to block a pair). */
export default function PersonPicker({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: MemberOption | null;
  onSelect: (m: MemberOption | null) => void;
}) {
  const [q, setQ] = useState("");

  const { data } = useAdminQuery(() => {
    if (!q.trim()) return Promise.resolve({ items: [] as MemberOption[] });
    const params = new URLSearchParams({ q: q.trim(), pageSize: "6" });
    return adminFetchJson<{ items: MemberOption[] }>(`/api/admin/dashboard/members?${params}`).catch(
      () => ({ items: [] as MemberOption[] }),
    );
  }, [q]);
  const options = data?.items ?? [];

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2">
        <PhotoThumb path={selected.photoPath} alt={selected.firstName} size={28} />
        <span className="flex-1 text-[14px] text-ink">{selected.firstName}</span>
        <button onClick={() => onSelect(null)} className="text-[12px] text-ink-soft hover:text-ink">
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={label}
        className="w-full rounded-lg border border-hairline px-3 py-2 text-[14px] placeholder:text-ink-soft/70 focus:border-rose-dark focus:outline-none"
      />
      {options.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-hairline bg-white shadow-sm">
          {options.map((m) => (
            <button
              key={m.uid}
              onClick={() => {
                onSelect(m);
                setQ("");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-rose-tint/50"
            >
              <PhotoThumb path={m.photoPath} alt={m.firstName} size={24} />
              <span className="text-[13px] text-ink">
                {m.firstName} · {m.city}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
