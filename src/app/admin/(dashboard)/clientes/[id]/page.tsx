"use client";

import { use, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import type { SearchResult } from "@/lib/clients/search";
import {
  COUNTS_AS_PROPOSAL,
  PAYMENT_STATUSES,
  PROGRAMMES,
  clientFullName,
  missingForSearch,
  type ClientView,
  type ShortlistEntryView,
} from "@/lib/clients/types";
import ClientForm, { type SaveState } from "@/components/admin/clients/ClientForm";
import SearchResults, { initialFilters, type Filters } from "@/components/admin/clients/SearchResults";
import ShortlistView from "@/components/admin/clients/ShortlistView";
import CandidatePanel from "@/components/admin/clients/CandidatePanel";
import { errorText, formatDate, primaryPill } from "@/components/admin/clients/ui";

type Tab = "ficha" | "compatibles" | "preseleccion";

/**
 * One client, start to finish: the ficha, "Buscar perfiles compatibles",
 * and the hand-picked preselection, on a single page. Nothing here sends
 * a message or creates a proposal.
 */
export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, reload } = useAdminQuery(
    () => adminFetchJson<{ client: ClientView; shortlist: ShortlistEntryView[] }>(`/api/admin/clients/${id}`),
    [id],
  );
  if (error) return <AdminError message={errorText(error) ?? undefined} />;
  if (!data) return <AdminLoading />;
  return <ClientWorkspace key={id} initial={data.client} shortlist={data.shortlist} reloadShortlist={reload} />;
}

function ClientWorkspace({
  initial,
  shortlist,
  reloadShortlist,
}: {
  initial: ClientView;
  shortlist: ShortlistEntryView[];
  reloadShortlist: () => void;
}) {
  const [client, setClient] = useState(initial);
  const [tab, setTab] = useState<Tab>(missingForSearch(initial).length > 0 ? "ficha" : "compatibles");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => initialFilters(initial.programme));
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const name = clientFullName(client);
  const programme = client.programme ? PROGRAMMES[client.programme] : null;
  const presented = shortlist.filter((e) => COUNTS_AS_PROPOSAL.includes(e.status)).length;
  const payment = PAYMENT_STATUSES.find((p) => p.value === client.payment.status);
  const missing = missingForSearch(client);

  async function runSearch() {
    setNotice(null);
    await flushRef.current?.();
    setTab("compatibles");
    setSearching(true);
    setSearchError(null);
    try {
      const res = await adminFetchJson<SearchResult>(`/api/admin/clients/${client.id}/search`, { method: "POST" });
      setSearch(res);
      if (res.missing.length > 0) setTab("ficha");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "request_failed");
    } finally {
      setSearching(false);
    }
  }

  const shortlistCandidate = useCallback(
    async (uid: string, score: number | null) => {
      try {
        await adminFetchJson(`/api/admin/clients/${client.id}/shortlist`, {
          method: "POST",
          body: JSON.stringify({ candidateUid: uid, score }),
        });
        setSearch((s) =>
          s && { ...s, results: s.results.map((r) => (r.uid === uid ? { ...r, shortlistStatus: r.shortlistStatus ?? "preseleccionado" } : r)) },
        );
        reloadShortlist();
      } catch (e) {
        setNotice(errorText(e instanceof Error ? e.message : null));
      }
    },
    [client.id, reloadShortlist],
  );

  const openResult = search?.results.find((r) => r.uid === openUid);
  const openEntry = shortlist.find((e) => e.candidateUid === openUid);
  const closePanel = useCallback(() => setOpenUid(null), []);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/clientes" className="text-[13px] font-medium text-ink-soft hover:text-ink">
          ← Clientes
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[34px] leading-tight text-ink">{name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
            {programme ? <Badge>{programme.label}</Badge> : <Badge tone="muted">Sin programa</Badge>}
            {payment && <Badge tone={client.payment.status === "pagado" ? "positive" : client.payment.status === "pendiente" ? "warning" : "muted"}>{payment.label}</Badge>}
            {client.programmeStart && (
              <span>
                {formatDate(client.programmeStart)} – {formatDate(client.programmeEnd)}
              </span>
            )}
            <span>
              · Presentados <span className="font-medium text-ink">{presented}</span>
              {programme ? ` de ${programme.proposals}` : ""}
            </span>
            <SaveIndicator state={saveState} error={saveError} />
          </div>
        </div>
        <div className="text-right">
          <button type="button" className={primaryPill} onClick={() => void runSearch()} disabled={searching || missing.length > 0}>
            {searching ? "Buscando…" : "Buscar perfiles compatibles"}
          </button>
          {missing.length > 0 && <p className="mt-1.5 text-[12px] text-ink-soft">Falta en la ficha: {missing.join(", ")}</p>}
        </div>
      </header>

      {notice && <p className="rounded-xl bg-[#f5e2e0] px-4 py-3 text-[13px] text-[#8a3b3b]">{notice}</p>}

      <nav className="flex gap-1 border-b border-hairline" aria-label="Secciones del cliente">
        {(
          [
            ["ficha", "Ficha"],
            ["compatibles", search ? `Compatibles (${search.compatibleCount})` : "Compatibles"],
            ["preseleccion", `Preselección (${shortlist.filter((e) => e.candidate).length})`],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[14px] transition-colors ${
              tab === value ? "border-ink font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* The ficha stays mounted so a pending save is never lost when switching tabs. */}
      <div hidden={tab !== "ficha"}>
        <ClientForm
          client={initial}
          flushRef={flushRef}
          onSaved={setClient}
          onSaveState={(s, e) => {
            setSaveState(s);
            setSaveError(e);
          }}
        />
      </div>

      {tab === "compatibles" && (
        <SearchResults
          clientName={client.firstName || "el cliente"}
          search={search}
          running={searching}
          error={searchError}
          filters={filters}
          onFilters={setFilters}
          onRerun={() => void runSearch()}
          onOpen={setOpenUid}
          onShortlist={shortlistCandidate}
        />
      )}

      {tab === "preseleccion" && (
        <ShortlistView
          clientId={client.id}
          entries={shortlist}
          limit={programme?.proposals ?? null}
          onChanged={reloadShortlist}
          onOpen={setOpenUid}
        />
      )}

      <p className="pt-4 text-[12px] text-ink-soft">
        Desde esta página no se envían emails ni propuestas automáticas: el contacto con cada persona lo hace el equipo.
      </p>

      {openUid && (
        <CandidatePanel
          clientId={client.id}
          clientName={client.firstName || "el cliente"}
          uid={openUid}
          shortlistStatus={openEntry?.status ?? openResult?.shortlistStatus ?? null}
          onShortlist={shortlistCandidate}
          onClose={closePanel}
        />
      )}
    </div>
  );
}

function SaveIndicator({ state, error }: { state: SaveState; error: string | null }) {
  if (state === "saving") return <span>· Guardando…</span>;
  if (state === "saved") return <span>· Guardado</span>;
  if (state === "error") return <span className="text-[#8a3b3b]">· No se ha guardado: {error}</span>;
  return null;
}
