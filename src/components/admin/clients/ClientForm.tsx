"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { aboutMeSteps, type StepId } from "@/lib/introduction/aboutMeFields";
import {
  ACTIVITY_OPTIONS,
  DISTANCE_OPTIONS,
  FREQUENCY_OPTIONS,
  GENDER_OPTIONS,
  INTENTION_OPTIONS,
} from "@/lib/introduction/preferenceOptions";
import {
  BooleanField,
  MultiChipField,
  NumberRangeField,
  SingleChoiceField,
} from "@/components/introduction/PreferenceFields";
import {
  CLIENT_STATUSES,
  CONTACT_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PROGRAMMES,
  type ClientProfileAnswers,
  type ClientView,
  type Programme,
} from "@/lib/clients/types";
import PlaceField from "./PlaceField";
import { Card, Field, Question, errorText, formatEuros, inputClasses } from "./ui";

/**
 * La ficha del cliente: programme and payment, contact details, and the
 * candidate questionnaire answered by the team on the client's behalf —
 * the same questions and option lists (aboutMeFields.ts,
 * preferenceOptions.ts) and the same answer inputs (PreferenceFields.tsx)
 * candidates use, so the answers compare one to one.
 *
 * Saves on its own a moment after each change; there is no save button.
 */

type Draft = ClientView;

const SAVE_DELAY_MS = 700;

const EDITABLE_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "channel",
  "ageYears",
  "city",
  "placeIne",
  "programme",
  "status",
  "programmeStart",
  "programmeEnd",
  "payment",
  "profile",
  "valuesInterests",
  "dealbreakersNotes",
  "notes",
] as const;

function stepOptions(id: StepId): { value: string; label: string }[] {
  const step = aboutMeSteps.find((s) => s.id === id);
  return step && "options" in step ? step.options : [];
}

const CHILDREN_OPTIONS = [
  { value: "none", label: "No tiene hijos" },
  { value: "grown", label: "Sí, todos de 15 años o más" },
  { value: "young", label: "Sí, al menos uno menor de 15" },
];

function childrenValue(v: ClientProfileAnswers["visible"]): string | null {
  if (v.hasChildren === false) return "none";
  if (v.hasChildren === true && v.hasYoungChildren === true) return "young";
  if (v.hasChildren === true && v.hasYoungChildren === false) return "grown";
  return null;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export default function ClientForm({
  client,
  onSaved,
  onSaveState,
  flushRef,
}: {
  client: ClientView;
  onSaved: (client: ClientView) => void;
  onSaveState: (state: SaveState, error: string | null) => void;
  /** Lets the page save pending changes right now (before a search). */
  flushRef: MutableRefObject<(() => Promise<void>) | null>;
}) {
  const [draft, setDraft] = useState<Draft>(client);
  const lastSaved = useRef<Draft>(client);
  const latest = useRef<Draft>(client);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null);

  function changedKeys(): string[] {
    return EDITABLE_KEYS.filter((k) => JSON.stringify(latest.current[k]) !== JSON.stringify(lastSaved.current[k]));
  }

  // Sends whatever differs from the last saved version, one save at a time.
  async function save(): Promise<void> {
    const current = latest.current;
    const keys = changedKeys();
    if (keys.length === 0) return;
    const patch: Record<string, unknown> = Object.fromEntries(keys.map((k) => [k, current[k as keyof Draft]]));
    // Typing a city clears the confirmed municipality: let the server place the new text itself.
    if ("city" in patch && patch.placeIne === null) delete patch.placeIne;
    onSaveState("saving", null);
    try {
      const res = await adminFetchJson<{ client: ClientView }>(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const server = res.client;
      const derived: Partial<Draft> = {
        programmeEnd: server.programmeEnd,
        placeIne: server.placeIne,
        payment: server.payment,
        ageRecordedOn: server.ageRecordedOn,
      };
      lastSaved.current = { ...lastSaved.current, ...pick(current, keys), ...derived };
      // Take the server's derived values unless the field was edited again meanwhile.
      const next = { ...latest.current, updatedAt: server.updatedAt };
      for (const [k, val] of Object.entries(derived) as [keyof Draft, unknown][]) {
        if (JSON.stringify(latest.current[k]) === JSON.stringify(current[k])) (next as Record<string, unknown>)[k] = val;
      }
      latest.current = next;
      setDraft(next);
      onSaved(server);
      onSaveState("saved", null);
    } catch (e) {
      onSaveState("error", errorText(e instanceof Error ? e.message : null));
    }
  }

  async function flush(): Promise<void> {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (saving.current) await saving.current;
    if (changedKeys().length === 0) return;
    saving.current = save().finally(() => {
      saving.current = null;
    });
    await saving.current;
  }

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  useEffect(() => {
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registered once; flush reads refs only
  }, []);

  function update(patch: Partial<Draft>) {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft(next);
    schedule();
  }

  function updateProfile(patch: Partial<ClientProfileAnswers>) {
    update({ profile: { ...latest.current.profile, ...patch } });
  }
  function updateVisible(patch: Partial<ClientProfileAnswers["visible"]>) {
    updateProfile({ visible: { ...latest.current.profile.visible, ...patch } });
  }
  function updateDealbreakers(patch: Partial<ClientProfileAnswers["dealbreakers"]>) {
    updateProfile({ dealbreakers: { ...latest.current.profile.dealbreakers, ...patch } });
  }
  function updatePreferences(patch: Partial<ClientProfileAnswers["preferences"]>) {
    updateProfile({ preferences: { ...latest.current.profile.preferences, ...patch } });
  }

  const v = draft.profile.visible;
  const d = draft.profile.dealbreakers;
  const p = draft.profile.preferences;
  const programme = draft.programme ? PROGRAMMES[draft.programme] : null;

  return (
    <div className="space-y-6">
      <Card title="Programa y pago">
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(PROGRAMMES) as Programme[]).map((key) => {
            const pr = PROGRAMMES[key];
            const selected = draft.programme === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => update({ programme: key })}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  selected ? "border-rose-dark bg-rose-tint" : "border-hairline hover:border-rose"
                }`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-medium text-ink">{pr.label}</span>
                  <span className="text-[14px] text-ink">{formatEuros(pr.priceEur)}</span>
                </span>
                <span className="mt-1 block text-[13px] text-ink-soft">{pr.summary}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Estado del cliente">
            <select className={inputClasses} value={draft.status} onChange={(e) => update({ status: e.target.value as Draft["status"] })}>
              {CLIENT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Inicio del programa">
            <input type="date" className={inputClasses} value={draft.programmeStart ?? ""} onChange={(e) => update({ programmeStart: e.target.value || null })} />
          </Field>
          <Field label="Fin del programa" hint={programme ? `Se calcula a ${programme.months} meses; puedes cambiarla.` : undefined}>
            <input type="date" className={inputClasses} value={draft.programmeEnd ?? ""} onChange={(e) => update({ programmeEnd: e.target.value || null })} />
          </Field>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-5">
          <Field label="Pago">
            <select
              className={inputClasses}
              value={draft.payment.status}
              onChange={(e) => update({ payment: { ...latest.current.payment, status: e.target.value as Draft["payment"]["status"] } })}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Importe (€)">
            <input
              type="number"
              inputMode="numeric"
              className={inputClasses}
              value={draft.payment.amountEur ?? ""}
              onChange={(e) => update({ payment: { ...latest.current.payment, amountEur: e.target.value === "" ? null : Math.round(Number(e.target.value)) } })}
            />
          </Field>
          <Field label="Forma de pago">
            <select
              className={inputClasses}
              value={draft.payment.method ?? ""}
              onChange={(e) => update({ payment: { ...latest.current.payment, method: (e.target.value || null) as Draft["payment"]["method"] } })}
            >
              <option value="">—</option>
              {PAYMENT_METHODS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha de pago">
            <input
              type="date"
              className={inputClasses}
              value={draft.payment.paidOn ?? ""}
              onChange={(e) => update({ payment: { ...latest.current.payment, paidOn: e.target.value || null } })}
            />
          </Field>
          <Field label="Referencia / factura">
            <input
              className={inputClasses}
              value={draft.payment.reference}
              onChange={(e) => update({ payment: { ...latest.current.payment, reference: e.target.value } })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Datos personales">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <input className={inputClasses} value={draft.firstName} onChange={(e) => update({ firstName: e.target.value })} />
          </Field>
          <Field label="Apellidos">
            <input className={inputClasses} value={draft.lastName} onChange={(e) => update({ lastName: e.target.value })} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputClasses} value={draft.email} onChange={(e) => update({ email: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <input type="tel" className={inputClasses} value={draft.phone} onChange={(e) => update({ phone: e.target.value })} />
          </Field>
          <Field label="Prefiere que le contactemos por">
            <select className={inputClasses} value={draft.channel ?? ""} onChange={(e) => update({ channel: (e.target.value || null) as Draft["channel"] })}>
              <option value="">—</option>
              {CONTACT_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Edad">
            <input
              type="number"
              inputMode="numeric"
              min={18}
              max={99}
              className={inputClasses}
              value={draft.ageYears ?? ""}
              onChange={(e) => update({ ageYears: e.target.value === "" ? null : Math.round(Number(e.target.value)) })}
            />
          </Field>
        </div>
        <div className="mt-4">
          <PlaceField
            city={draft.city}
            placeIne={draft.placeIne}
            onChange={(city, placeIne) => update({ city, placeIne })}
          />
        </div>
      </Card>

      <Card title="Sobre el cliente">
        <Question label="Género">
          <SingleChoiceField options={stepOptions("gender")} value={v.gender} onChange={(x) => updateVisible({ gender: x as typeof v.gender })} />
        </Question>
        <Question label="Profesión">
          <input className={`${inputClasses} max-w-[440px]`} value={v.profession} onChange={(e) => updateVisible({ profession: e.target.value })} />
        </Question>
        <Question label="Formación">
          <SingleChoiceField options={stepOptions("educationLevel")} value={v.educationLevel} onChange={(x) => updateVisible({ educationLevel: x as typeof v.educationLevel })} />
        </Question>
        <Question label="Ingresos anuales" hint="Privado. Solo cuenta en la puntuación.">
          <SingleChoiceField
            options={stepOptions("incomeRange")}
            value={draft.profile.incomeRange}
            onChange={(x) => updateProfile({ incomeRange: x as ClientProfileAnswers["incomeRange"] })}
          />
        </Question>
        <Question label="Altura (cm)">
          <input
            type="number"
            inputMode="numeric"
            min={130}
            max={220}
            className={`${inputClasses} max-w-[140px]`}
            value={v.heightCm ?? ""}
            onChange={(e) => updateVisible({ heightCm: e.target.value === "" ? null : Math.round(Number(e.target.value)) })}
          />
        </Question>
        <Question label="Idiomas">
          <MultiChipField options={stepOptions("languages")} value={v.languages} onChange={(x) => updateVisible({ languages: x })} />
        </Question>
        <Question label="Hijos">
          <SingleChoiceField
            options={CHILDREN_OPTIONS}
            value={childrenValue(v)}
            onChange={(x) =>
              updateVisible(
                x === "none"
                  ? { hasChildren: false, hasYoungChildren: false }
                  : x === "grown"
                    ? { hasChildren: true, hasYoungChildren: false }
                    : { hasChildren: true, hasYoungChildren: true },
              )
            }
          />
        </Question>
        <Question label="¿Quiere tener hijos en el futuro?">
          <SingleChoiceField options={stepOptions("wantsFutureChildren")} value={v.wantsFutureChildren} onChange={(x) => updateVisible({ wantsFutureChildren: x as typeof v.wantsFutureChildren })} />
        </Question>
        <Question label="Qué tipo de relación busca">
          <SingleChoiceField options={stepOptions("relationshipIntention")} value={v.relationshipIntention} onChange={(x) => updateVisible({ relationshipIntention: x as typeof v.relationshipIntention })} />
        </Question>
        <Question label="¿Fuma?">
          <SingleChoiceField options={stepOptions("smoking")} value={v.smoking} onChange={(x) => updateVisible({ smoking: x as typeof v.smoking })} />
        </Question>
        <Question label="¿Bebe alcohol?">
          <SingleChoiceField options={stepOptions("drinking")} value={v.drinking} onChange={(x) => updateVisible({ drinking: x as typeof v.drinking })} />
        </Question>
        <Question label="Actividad física">
          <SingleChoiceField options={stepOptions("activityLevel")} value={v.activityLevel} onChange={(x) => updateVisible({ activityLevel: x as typeof v.activityLevel })} />
        </Question>
      </Card>

      <Card title="Lo que busca · imprescindible" aside={<span className="text-[12px] text-ink-soft">Nadie que no lo cumpla aparece en los resultados</span>}>
        <Question label="Busca">
          <SingleChoiceField
            options={GENDER_OPTIONS}
            value={d.gendersSought.length === 1 ? d.gendersSought[0] : null}
            onChange={(x) => updateDealbreakers({ gendersSought: [x as "mujer" | "hombre"] })}
          />
        </Question>
        <Question label="Edad">
          <NumberRangeField
            min={18}
            max={99}
            minValue={d.ageMin}
            maxValue={d.ageMax}
            onChangeMin={(x) => updateDealbreakers({ ageMin: x })}
            onChangeMax={(x) => updateDealbreakers({ ageMax: x })}
            unit="años"
          />
        </Question>
        <Question label="Distancia" hint="«Misma ciudad» significa hasta 20 km.">
          <SingleChoiceField
            options={DISTANCE_OPTIONS.map((o) => (o.value === "misma_ciudad" ? { ...o, label: "Misma ciudad" } : o))}
            value={d.maxDistance}
            onChange={(x) => updateDealbreakers({ maxDistance: x as typeof d.maxDistance })}
          />
        </Question>
        <Question label="Tipo de relación que debe buscar la otra persona">
          <MultiChipField
            options={INTENTION_OPTIONS}
            value={d.relationshipIntentionsAccepted}
            onChange={(x) => updateDealbreakers({ relationshipIntentionsAccepted: x as typeof d.relationshipIntentionsAccepted })}
          />
        </Question>
        <Question label="¿Aceptaría a alguien que fuma?">
          <MultiChipField options={FREQUENCY_OPTIONS} value={d.smokingAccepted} onChange={(x) => updateDealbreakers({ smokingAccepted: x as typeof d.smokingAccepted })} />
        </Question>
        <Question label="¿Le importaría que tuviera hijos menores de 15 años?">
          <BooleanField
            value={d.partnerYoungChildrenMatters}
            onChange={(x) => updateDealbreakers({ partnerYoungChildrenMatters: x })}
            yesLabel="Sí, le importaría"
            noLabel="No le importaría"
          />
        </Question>
      </Card>

      <Card title="Lo que busca · preferencias" aside={<span className="text-[12px] text-ink-soft">Suman puntos, nunca descartan</span>}>
        <Question label="Altura">
          <NumberRangeField
            min={140}
            max={210}
            minValue={p.heightMinCm}
            maxValue={p.heightMaxCm}
            onChangeMin={(x) => updatePreferences({ heightMinCm: x })}
            onChangeMax={(x) => updatePreferences({ heightMaxCm: x })}
            unit="cm"
          />
        </Question>
        <Question label="Alcohol">
          <MultiChipField options={FREQUENCY_OPTIONS} value={p.drinkingAccepted} onChange={(x) => updatePreferences({ drinkingAccepted: x as typeof p.drinkingAccepted })} />
        </Question>
        <Question label="Actividad física">
          <MultiChipField options={ACTIVITY_OPTIONS} value={p.activityLevelsPreferred} onChange={(x) => updatePreferences({ activityLevelsPreferred: x as typeof p.activityLevelsPreferred })} />
        </Question>
      </Card>

      <Card title="Notas del equipo" aside={<span className="text-[12px] text-ink-soft">Privadas. No se usan en la puntuación</span>}>
        <div className="grid gap-4">
          <Field label="Valores e intereses">
            <textarea rows={3} className={inputClasses} value={draft.valuesInterests} onChange={(e) => update({ valuesInterests: e.target.value })} />
          </Field>
          <Field label="Líneas rojas y requisitos que no recoge el cuestionario">
            <textarea rows={3} className={inputClasses} value={draft.dealbreakersNotes} onChange={(e) => update({ dealbreakersNotes: e.target.value })} />
          </Field>
          <Field label="Notas internas">
            <textarea rows={4} className={inputClasses} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

function pick<T extends object>(obj: T, keys: string[]): Partial<T> {
  return Object.fromEntries(keys.map((k) => [k, (obj as Record<string, unknown>)[k]])) as Partial<T>;
}
