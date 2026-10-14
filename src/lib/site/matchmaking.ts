/**
 * Copy for the public Matchmaking page, kept in one place so the page, its
 * structured data and the consultation request never drift apart.
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
  duration: string;
  promise: string;
  /** Same labels, same order in both programmes, so they compare row by row. */
  rows: { label: string; text: string }[];
  cta: string;
}

export const PROGRAMMES: Programme[] = [
  {
    key: "select",
    name: "Programa Select",
    priceEuros: 1950,
    priceLabel: "1.950 €",
    duration: "6 meses",
    promise: "Buscamos por ti dentro de nuestra red privada.",
    rows: [
      {
        label: "Entrevista",
        text: "Una conversación privada de 20 a 30 minutos con nuestro equipo de matchmaking.",
      },
      {
        label: "La búsqueda",
        text: "En nuestra red privada de candidatos, con tecnología de compatibilidad y la revisión de una persona en cada perfil.",
      },
      { label: "Propuestas", text: "Hasta 3 candidatos seleccionados durante el programa." },
      { label: "Quién selecciona", text: "Nuestro equipo de matchmaking." },
      {
        label: "La primera cita",
        text: "Si el interés es mutuo, coordinamos agendas, elegimos el lugar y hacemos la reserva.",
      },
      { label: "Seguimiento", text: "Una breve conversación después de cada cita para afinar la búsqueda." },
    ],
    cta: "Solicitar una entrevista",
  },
  {
    key: "privado",
    name: "Select Privado",
    priceEuros: 4800,
    priceLabel: "4.800 €",
    duration: "6 meses",
    promise: "Buscamos personalmente por ti, también fuera de nuestra red.",
    rows: [
      {
        label: "Entrevista",
        text: "45 minutos en privado con Lara Estelle, fundadora de Junto Select: tu historia, tu forma de vivir y lo que de verdad importa a largo plazo.",
      },
      {
        label: "La búsqueda",
        text: "Nuestra red privada y, además, una búsqueda activa y discreta fuera de ella: contactos profesionales y personales, recomendaciones y presentaciones de confianza.",
      },
      { label: "Propuestas", text: "Hasta 6 candidatos seleccionados durante el programa." },
      { label: "Quién selecciona", text: "La fundadora define la estrategia y aprueba cada propuesta." },
      {
        label: "La primera cita",
        text: "Organizada a tu medida: el lugar, el momento y cada detalle.",
      },
      {
        label: "Seguimiento",
        text: "Acompañamiento personal durante todo el programa; ajustamos los criterios según lo que vayas descubriendo.",
      },
    ],
    cta: "Solicitar una entrevista con la fundadora",
  },
];

/** What both programmes share, said once under the two cards. */
export const BOTH_PROGRAMMES = [
  "Cada candidato te llega presentado: por qué encaja contigo, su forma de ser, su estilo de vida y sus valores, siempre con su consentimiento.",
  "Nadie recibe datos de contacto y no se organiza ninguna cita hasta que las dos personas queréis conoceros.",
  "Seis meses de búsqueda, con una persona de referencia que conoce tu caso.",
];

export const STEPS = [
  {
    title: "Una entrevista privada",
    text: "Nos cuentas qué buscas, qué es imprescindible para ti y qué no lo es. Sin cuestionarios interminables.",
  },
  {
    title: "Una búsqueda a tu medida",
    text: "Nuestra tecnología de compatibilidad analiza a los candidatos; nuestro equipo revisa cada perfil antes de pensar en ti.",
  },
  {
    title: "Propuestas presentadas una a una",
    text: "Te presentamos a cada persona y te explicamos por qué creemos que podéis encajar.",
  },
  {
    title: "Primero, el interés mutuo",
    text: "Confirmamos que la otra persona también quiere conocerte antes de compartir ningún dato.",
  },
  {
    title: "Nosotros organizamos la cita",
    text: "Coordinamos agendas, elegimos el lugar, hacemos la reserva y confirmamos. Después, tu impresión nos ayuda a afinar.",
  },
];

export const DISCRETION = [
  {
    title: "Tu perfil nunca se publica",
    text: "No hay catálogo ni buscador: nadie puede ver ni recorrer perfiles, ni en una web ni en una aplicación.",
  },
  {
    title: "Tu identidad, solo con tu permiso",
    text: "Solo presentamos tu perfil a un candidato cuando tú estás de acuerdo.",
  },
  {
    title: "Interés mutuo antes que nada",
    text: "Los datos de contacto se comparten únicamente cuando las dos personas queréis conoceros.",
  },
  {
    title: "Nadie está obligado",
    text: "Ni tú ni los candidatos tenéis que aceptar una propuesta ni acudir a una cita.",
  },
];

export const FAQ = [
  {
    q: "¿Junto Select es una agencia matrimonial?",
    a: "Somos un club privado con un servicio de matchmaking personal. Como una buena agencia, buscamos por ti y te presentamos a personas compatibles. Lo hacemos con un programa de seis meses, un número definido de propuestas y una persona que conoce tu caso de principio a fin.",
  },
  {
    q: "¿Quién puede ver mi perfil?",
    a: "Solo nuestro equipo. Tu perfil no se publica en ningún sitio, y solo lo compartimos con un candidato cuando tú estás de acuerdo.",
  },
  {
    q: "¿Garantizáis que encontraré pareja?",
    a: "Nadie puede garantizarlo con honestidad: una relación depende de dos personas. Lo que sí hacemos es trabajar con un objetivo claro, que conozcas en persona a alguien con quien de verdad encajes, y dedicarle tiempo, criterio y discreción.",
  },
  {
    q: "¿Y si una propuesta no me convence?",
    a: "Nos lo dices, y hablamos para entender qué no encajaba y ajustar la búsqueda. Cómo se cuentan las propuestas se explica en las condiciones del programa, que recibes por escrito antes de contratar.",
  },
  {
    q: "¿Cómo es la primera cita?",
    a: "Cuando las dos personas queréis conoceros, coordinamos agendas, proponemos un lugar adecuado, hacemos la reserva y confirmamos el día y la hora. Cada persona se hace cargo de su consumición.",
  },
  {
    q: "¿Trabajáis fuera de Madrid?",
    a: "Hoy, el matchmaking se centra en Madrid. Si vives en otra ciudad, cuéntanoslo en tu solicitud y te diremos con franqueza si podemos ayudarte.",
  },
  {
    q: "¿Cómo se contrata?",
    a: "Después de la entrevista, si creemos que podemos ayudarte, te enviamos la propuesta y las condiciones por escrito. El programa empieza cuando lo confirmas.",
  },
];
