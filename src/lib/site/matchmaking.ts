/**
 * Copy for the public Matchmaking page, kept in one place so the page and
 * its structured data never drift apart.
 *
 * Nothing here is a contractual term: the quota rules, refunds and any
 * meeting commitment are still to be decided and reviewed, so the copy only
 * describes the service and says the full conditions are given in writing
 * before contracting.
 */

export type ProgrammeKey = "select" | "privado";

export interface Programme {
  key: ProgrammeKey;
  name: string;
  priceEuros: number;
  /** Shown as "1.950 €". */
  priceLabel: string;
  /** Where the search happens: the first difference a visitor should see. */
  reach: string;
  promise: string;
  includes: string[];
  /** How the programme starts, under the list. */
  start: string;
  cta: string;
}

export const PROGRAMMES: Programme[] = [
  {
    key: "select",
    name: "Programa Select",
    priceEuros: 1950,
    priceLabel: "1.950 €",
    reach: "En tu ciudad · Nuestra red privada",
    promise: "Buscamos por ti, dentro de nuestra red privada y en tu ciudad.",
    includes: [
      "Programa de seis meses",
      "Búsqueda dentro de nuestra red privada",
      "Búsqueda local, en tu ciudad",
      "Hasta 3 propuestas cualificadas",
      "Entrevista inicial de 20 a 30 minutos",
      "Revisión y selección humana de cada compatibilidad",
      "Organizamos la primera cita si el interés es mutuo",
    ],
    start: "Empieza con una breve llamada de cualificación.",
    cta: "Solicitar Programa Select",
  },
  {
    key: "privado",
    name: "Select Privado",
    priceEuros: 4800,
    priceLabel: "4.800 €",
    reach: "En toda España · Dentro y fuera de nuestra red",
    promise: "Una búsqueda personal, exclusiva y a medida, en toda España y más allá de nuestra red.",
    includes: [
      "Programa de seis meses",
      "Búsqueda personalizada en toda España",
      "Búsqueda activa de candidatos, dentro y fuera de nuestra red",
      "Hasta 6 propuestas cualificadas",
      "45 minutos con Lara Estelle, fundadora, al contratar el programa",
      "La fundadora dirige la búsqueda y la selección final",
      "Atención, seguimiento y organización de citas más personales",
    ],
    start: "Empieza con una breve llamada de cualificación.",
    cta: "Solicitar Select Privado",
  },
];

/** The free, passive private profile, shown as the third card. */
export const PRIVATE_PROFILE = {
  name: "Perfil privado pasivo",
  priceLabel: "Gratis",
  reach: "Red privada",
  promise:
    "Forma parte de nuestra red privada de personas solteras. Crea tu perfil para que podamos tenerte en cuenta en futuras búsquedas de compatibilidad.",
  includes: [
    "Sin suscripciones. Con total discreción.",
    "Tu perfil no se publica ni se puede buscar: solo lo compartimos, en privado, con clientes compatibles",
    "No navegas perfiles ni recibes propuestas automáticas",
    "Te escribimos solo si un cliente compatible quiere conocerte",
  ],
  start: "Crear un perfil no garantiza que te contactemos ni una presentación.",
  cta: "Crear mi perfil privado",
};

export const STEPS = [
  {
    title: "Entrevista privada",
    text: "Nos cuentas qué buscas y qué es imprescindible para ti.",
  },
  {
    title: "Búsqueda personalizada",
    text: "Buscamos y seleccionamos, en privado, a las personas que encajan con lo que buscas.",
  },
  {
    title: "Presentación y primera cita",
    text: "Te presentamos sus perfiles en privado. Si alguien te interesa, le preguntamos y, si el interés es mutuo, organizamos la cita.",
  },
];

export const FAQ = [
  {
    q: "¿Junto Select es una agencia matrimonial?",
    a: "Somos un club privado con un servicio de matchmaking personal: buscamos por ti y te presentamos a personas compatibles, con un programa de seis meses y una persona que conoce tu caso de principio a fin.",
  },
  {
    q: "¿Garantizáis que encontraré pareja?",
    a: "Nadie puede garantizarlo con honestidad: una relación depende de dos personas. Trabajamos con un objetivo claro, que conozcas en persona a alguien con quien de verdad encajes.",
  },
  {
    q: "¿Quién sabrá que he contratado el servicio?",
    a: "Solo nuestro equipo. Tu perfil no se publica y solo lo compartimos con un candidato cuando tú estás de acuerdo.",
  },
  {
    q: "¿Cómo es la primera cita?",
    a: "Cuando los dos queréis conoceros, coordinamos agendas, elegimos el lugar, hacemos la reserva y confirmamos el día y la hora. Cada persona se hace cargo de su consumición.",
  },
  {
    q: "¿Cómo se contrata?",
    a: "Después de la entrevista, si creemos que podemos ayudarte, te enviamos la propuesta y las condiciones por escrito. El programa empieza cuando lo confirmas.",
  },
];
