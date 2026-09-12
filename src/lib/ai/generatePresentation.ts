import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ActivityLevel, Gender, PresentationPrompts } from "@/lib/introduction/types";

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  muy_activo: "muy activo/a, hace deporte casi a diario",
  activo: "activo/a, hace deporte varias veces por semana",
  ocasional: "ocasionalmente activo/a",
  poco_activo: "poco activo/a",
};

const GENDER_LABELS: Record<Gender, string> = {
  mujer: "mujer",
  hombre: "hombre",
};

export interface PresentationFacts {
  firstName: string;
  gender: Gender | null;
  city: string;
  profession: string;
  activityLevel: ActivityLevel | null;
  prompts: PresentationPrompts;
}

const SYSTEM_PROMPT = `Escribes textos de presentación personal breves y elegantes, en español, para miembros de Junto Select, un servicio privado de presentaciones seleccionadas para relaciones serias (no citas casuales), dirigido a personas de 35 años en adelante.

Reglas, por orden de importancia:
1. Usa ÚNICAMENTE los datos que se te den a continuación. No inventes, no supongas y no añadas NINGÚN hecho que no esté presente explícitamente: ni rasgos de personalidad, ni aficiones, ni logros, ni información familiar, ni preferencias que no se hayan dado.
2. Si los datos son escasos, escribe un texto más breve y sencillo — nunca lo rellenes con detalles inventados ni con tópicos genéricos de apps de citas.
3. Evita frases hechas como "me encanta viajar y disfrutar de la buena comida" salvo que la persona haya escrito exactamente eso.
4. Escríbelo en primera persona, como si la propia persona lo hubiera escrito, pero pulido y elegante.
5. Tono: sofisticado, calmado, humano — nunca como un perfil de app de citas, ni como un resumen de LinkedIn, ni excesivamente entusiasta.
6. Extensión: entre 80 y 140 palabras.
7. Devuelve ÚNICAMENTE el texto de la presentación, sin comillas, sin encabezados y sin ningún comentario adicional.`;

function buildUserMessage(facts: PresentationFacts): string {
  const lines = [
    `Nombre: ${facts.firstName}`,
    facts.gender ? `Género: ${GENDER_LABELS[facts.gender]}` : null,
    facts.city ? `Ciudad: ${facts.city}` : null,
    facts.profession ? `Profesión: ${facts.profession}` : null,
    facts.activityLevel
      ? `Nivel de actividad física: ${ACTIVITY_LABELS[facts.activityLevel]}`
      : null,
    `Qué le apasiona o cómo suele pasar su tiempo libre: ${facts.prompts.freeTime}`,
    `Qué es lo más importante para ella/él en una relación seria: ${facts.prompts.values}`,
    `Algo que la gente suele decir sobre ella/él: ${facts.prompts.aboutYou}`,
  ].filter((line): line is string => Boolean(line));

  return `Datos proporcionados por la persona (usa solo estos hechos):\n${lines.join("\n")}\n\nEscribe la presentación ahora.`;
}

export async function generatePresentationText(
  facts: PresentationFacts,
): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(facts) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text returned from the model");
  }
  return textBlock.text.trim();
}
