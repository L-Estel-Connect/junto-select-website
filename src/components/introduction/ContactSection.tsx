"use client";

import { useState } from "react";
import Link from "next/link";
import { SingleChoiceField, MultiChipField, FieldRow } from "./PreferenceFields";
import { useAuth } from "@/lib/firebase/useAuth";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import {
  isValidInstagram,
  isValidLinkedIn,
  isValidPhone,
  saveContactPreferences,
} from "@/lib/introduction/contact";
import type { ContactMethod, ContactPreferences } from "@/lib/introduction/types";
import { IntroductionError, IntroductionLoading } from "./RequireIntroductionAuth";

const METHOD_OPTIONS: { value: ContactMethod; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telefono", label: "Teléfono" },
  { value: "email", label: "Email" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
];

const inputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

function needsPhone(prefs: ContactPreferences): boolean {
  const methods = [prefs.preferredMethod, ...prefs.additionalMethods];
  return methods.includes("whatsapp") || methods.includes("telefono");
}
function needsInstagram(prefs: ContactPreferences): boolean {
  return prefs.preferredMethod === "instagram" || prefs.additionalMethods.includes("instagram");
}
function needsLinkedIn(prefs: ContactPreferences): boolean {
  return prefs.preferredMethod === "linkedin" || prefs.additionalMethods.includes("linkedin");
}

export default function ContactSection({ uid }: { uid: string }) {
  const { user } = useAuth();
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
  const [prefs, setPrefs] = useState<ContactPreferences | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [instagramInput, setInstagramInput] = useState("");
  const [linkedinInput, setLinkedinInput] = useState("");
  const [touched, setTouched] = useState(false);

  // Adjusted during render (not in an effect) — initializes local state
  // from the loaded profile exactly once, then locally controlled — same
  // reasoning as PreferencesSection: this page autosaves per field, so
  // local state (not `profile`) is the source of truth once loaded. See
  // OnboardingWizard.tsx for why this pattern is safe and doesn't loop.
  if (profile && prefs === null) {
    setPrefs(profile.contactPreferences);
    setPhoneInput(profile.contactPreferences.phone ?? "");
    setInstagramInput(profile.contactPreferences.instagram ?? "");
    setLinkedinInput(profile.contactPreferences.linkedin ?? "");
  }

  if (!profile && profileError) {
    return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
  }

  if (!prefs) {
    return <IntroductionLoading />;
  }

  function persist(next: ContactPreferences) {
    setPrefs(next);
    mutate((prev) => ({ ...prev, contactPreferences: next }));
    void saveContactPreferences(uid, next);
  }

  function setPreferredMethod(method: string) {
    const value = method as ContactMethod;
    persist({
      ...prefs!,
      preferredMethod: value,
      additionalMethods: prefs!.additionalMethods.filter((m) => m !== value),
    });
  }

  function setAdditionalMethods(methods: string[]) {
    persist({ ...prefs!, additionalMethods: methods as ContactMethod[] });
  }

  const phoneValid = phoneInput.trim() === "" || isValidPhone(phoneInput);
  const instagramValid = instagramInput.trim() === "" || isValidInstagram(instagramInput);
  const linkedinValid = linkedinInput.trim() === "" || isValidLinkedIn(linkedinInput);

  const additionalOptions = METHOD_OPTIONS.filter((o) => o.value !== prefs.preferredMethod);

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <Link href="/member/profile#editar-perfil" className={`text-sm ${linkClasses}`}>
        ← Volver a mi perfil
      </Link>

      <h1 className="mt-6 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        ¿Cómo prefieres que te contacten?
      </h1>
      <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        Solo compartiremos estos datos cuando haya interés mutuo. Nunca
        aparecen en tu perfil ni en tus selecciones.
      </p>

      <div className="mt-8">
        <FieldRow question="Método preferido">
          <SingleChoiceField
            options={METHOD_OPTIONS}
            value={prefs.preferredMethod}
            onChange={setPreferredMethod}
          />
        </FieldRow>

        {prefs.preferredMethod && (
          <FieldRow
            question="¿Algún otro medio disponible?"
            helper="Opcional — por si el primero no es posible."
          >
            <MultiChipField
              options={additionalOptions}
              value={prefs.additionalMethods}
              onChange={setAdditionalMethods}
            />
          </FieldRow>
        )}

        {needsPhone(prefs) && (
          <FieldRow question="Número de teléfono">
            <input
              type="tel"
              value={phoneInput}
              placeholder="+34 600 000 000"
              onChange={(e) => setPhoneInput(e.target.value)}
              onBlur={() => {
                setTouched(true);
                if (phoneInput.trim() === "" || isValidPhone(phoneInput)) {
                  persist({ ...prefs, phone: phoneInput.trim() || null });
                }
              }}
              className={inputClasses}
            />
            {touched && !phoneValid && (
              <p className="mt-2 text-[13px] text-[#8a3b3b]">
                Revisa el formato del teléfono.
              </p>
            )}
          </FieldRow>
        )}

        {(prefs.preferredMethod === "email" || prefs.additionalMethods.includes("email")) && (
          <FieldRow
            question="Email"
            helper="Usamos el email de tu cuenta."
          >
            <p className="text-[15px] text-ink">{user?.email ?? "—"}</p>
          </FieldRow>
        )}

        {needsInstagram(prefs) && (
          <FieldRow question="Instagram">
            <input
              type="text"
              value={instagramInput}
              placeholder="@tu_usuario"
              onChange={(e) => setInstagramInput(e.target.value)}
              onBlur={() => {
                setTouched(true);
                if (instagramInput.trim() === "" || isValidInstagram(instagramInput)) {
                  persist({ ...prefs, instagram: instagramInput.trim() || null });
                }
              }}
              className={inputClasses}
            />
            {touched && !instagramValid && (
              <p className="mt-2 text-[13px] text-[#8a3b3b]">
                Introduce un usuario o enlace de Instagram válido.
              </p>
            )}
          </FieldRow>
        )}

        {needsLinkedIn(prefs) && (
          <FieldRow question="LinkedIn">
            <input
              type="text"
              value={linkedinInput}
              placeholder="https://www.linkedin.com/in/tu-perfil"
              onChange={(e) => setLinkedinInput(e.target.value)}
              onBlur={() => {
                setTouched(true);
                if (linkedinInput.trim() === "" || isValidLinkedIn(linkedinInput)) {
                  persist({ ...prefs, linkedin: linkedinInput.trim() || null });
                }
              }}
              className={inputClasses}
            />
            {touched && !linkedinValid && (
              <p className="mt-2 text-[13px] text-[#8a3b3b]">
                Introduce un enlace de LinkedIn válido.
              </p>
            )}
          </FieldRow>
        )}
      </div>
    </div>
  );
}
