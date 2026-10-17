"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import EventCards from "@/components/salon/EventCards";
import { toPublicEvent, type PublicEvent } from "@/lib/events/publicView";
import type { EligibleTicketTailorEventDocument } from "@/lib/eventBenefits/types";

/** Loads one event with the admin's session and renders the exact public card. */
export default function EventPreview({ id }: { id: string }) {
  const [state, setState] = useState<{ event?: PublicEvent | null; error?: string }>({});

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setState({ error: "Inicia sesión en el panel de administración para ver la vista previa." });
        return;
      }
      adminFetchJson<{ event: EligibleTicketTailorEventDocument }>(`/api/admin/events/${encodeURIComponent(id)}`)
        .then(({ event }) => setState({ event: toPublicEvent(event) }))
        .catch(() => setState({ error: "No se ha podido cargar el evento." }));
    });
  }, [id]);

  if (state.error) return <p className="txt">{state.error}</p>;
  if (state.event === undefined) return <p className="txt">Cargando…</p>;
  if (state.event === null) {
    return <p className="txt">Este evento aún no se mostraría en la web: necesita fecha y un estado Próximamente, Entradas disponibles o Completo.</p>;
  }
  return <EventCards events={[state.event]} />;
}
