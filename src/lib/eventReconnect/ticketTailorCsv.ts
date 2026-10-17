/**
 * Reads a Ticket Tailor export (CSV, as downloaded from the dashboard) into
 * Reconnect participant rows — pure, no Firebase, so the admin screen can
 * preview it and the tests can check it without a server.
 *
 * Ticket Tailor lets the organiser pick which fields an export contains, and
 * the dashboard can be in English or Spanish, so columns are found by their
 * header rather than by position. Attendee columns win over buyer columns
 * when both exist (a buyer can hold tickets for other people).
 */

export interface ParsedParticipantRow {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  ticketTailorOrderId: string | null;
  /** 1-based line in the file, for messages. */
  line: number;
}

export interface SkippedRow {
  line: number;
  reason: "missing_email" | "invalid_email" | "cancelled";
  value: string;
}

export interface ParsedTicketTailorCsv {
  ok: boolean;
  /** Set when the file can't be used at all (no email column, empty file). */
  error: string | null;
  /** Which header each field was read from, for the preview. */
  columns: Partial<Record<"email" | "firstName" | "lastName" | "fullName" | "phone" | "orderId" | "status", string>>;
  /** One per distinct email, in file order. */
  rows: ParsedParticipantRow[];
  skipped: SkippedRow[];
  /** Extra tickets for an email already in `rows` (same person, several tickets). */
  duplicatesInFile: number;
  /** Rows kept without a first name: they can activate, but stay out of the gallery until they do. */
  withoutFirstName: number;
  totalDataRows: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CANCELLED_RE = /cancel|refund|void|reembols|anulad|devuelt/;

/** Lower case, no accents, words separated by single spaces. */
function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** RFC 4180 CSV (quoted fields, doubled quotes, newlines inside quotes), with the delimiter Excel or Ticket Tailor used. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inQuotes) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** Header indexes for one field, best match first. */
function findColumns(headers: string[], tests: ((h: string) => boolean)[]): number[] {
  const found: number[] = [];
  for (const test of tests) {
    headers.forEach((h, i) => {
      if (test(h) && !found.includes(i)) found.push(i);
    });
  }
  return found;
}

const has = (h: string, ...words: string[]) => words.every((w) => h.split(" ").includes(w) || h.includes(w));
const isAttendee = (h: string) => has(h, "attendee") || has(h, "asistente") || has(h, "ticket holder");

export function parseTicketTailorCsv(text: string): ParsedTicketTailorCsv {
  const empty: ParsedTicketTailorCsv = {
    ok: false,
    error: null,
    columns: {},
    rows: [],
    skipped: [],
    duplicatesInFile: 0,
    withoutFirstName: 0,
    totalDataRows: 0,
  };
  const table = parseCsv(text);
  if (table.length < 2) return { ...empty, error: "El archivo no tiene filas de participantes." };

  const rawHeaders = table[0].map((h) => h.trim());
  const headers = rawHeaders.map(normalizeHeader);
  const isEmail = (h: string) => /\be ?mail\b|correo/.test(h) && !/opt|consent|marketing|subscri|newsletter|acept|confirm/.test(h);
  const isFirst = (h: string) => /\bfirst name\b|\bfirstname\b|\bgiven name\b|^nombre$|nombre de pila|\bnombre del asistente\b/.test(h) || (isAttendee(h) && /^(attendee|asistente) nombre$/.test(h));
  const isLast = (h: string) => /\blast name\b|\blastname\b|\bsurname\b|\bfamily name\b|apellido/.test(h);
  const isFull = (h: string) => /\bfull name\b|^name$|^attendee name$|^buyer name$|^customer name$|nombre completo/.test(h);
  const isPhone = (h: string) => /phone|mobile|telefono|movil/.test(h);
  const isOrder = (h: string) => /\border (id|reference|ref|number|no)\b|^order$|pedido/.test(h) && !/date|fecha|status|estado/.test(h);
  const isStatus = (h: string) => /\bstatus\b|\bestado\b/.test(h);

  const emailCols = findColumns(headers, [(h) => isEmail(h) && isAttendee(h), isEmail]);
  if (emailCols.length === 0) {
    return { ...empty, error: "No encontramos una columna de email en el archivo. Exporta los pedidos o las entradas de Ticket Tailor incluyendo el email." };
  }
  const firstCols = findColumns(headers, [(h) => isFirst(h) && isAttendee(h), isFirst]);
  const lastCols = findColumns(headers, [(h) => isLast(h) && isAttendee(h), isLast]);
  const fullCols = findColumns(headers, [(h) => isFull(h) && isAttendee(h), isFull]);
  const phoneCols = findColumns(headers, [(h) => isPhone(h) && isAttendee(h), isPhone]);
  const orderCols = findColumns(headers, [isOrder]);
  const statusCols = findColumns(headers, [isStatus]);

  const first = (cells: string[], cols: number[]) => {
    for (const c of cols) {
      const v = (cells[c] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const result: ParsedTicketTailorCsv = {
    ...empty,
    ok: true,
    columns: {
      email: rawHeaders[emailCols[0]],
      ...(firstCols.length ? { firstName: rawHeaders[firstCols[0]] } : {}),
      ...(lastCols.length ? { lastName: rawHeaders[lastCols[0]] } : {}),
      ...(fullCols.length ? { fullName: rawHeaders[fullCols[0]] } : {}),
      ...(phoneCols.length ? { phone: rawHeaders[phoneCols[0]] } : {}),
      ...(orderCols.length ? { orderId: rawHeaders[orderCols[0]] } : {}),
      ...(statusCols.length ? { status: rawHeaders[statusCols[0]] } : {}),
    },
    totalDataRows: table.length - 1,
  };
  const seen = new Set<string>();

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const status = first(cells, statusCols).toLowerCase();
    // The first email-looking value: attendee column first, then buyer column.
    const rawEmail = emailCols.map((c) => (cells[c] ?? "").trim()).find((v) => v.includes("@")) ?? first(cells, emailCols);
    if (status && CANCELLED_RE.test(normalizeHeader(status))) {
      result.skipped.push({ line, reason: "cancelled", value: rawEmail || status });
      return;
    }
    if (!rawEmail) {
      result.skipped.push({ line, reason: "missing_email", value: "" });
      return;
    }
    const email = rawEmail.toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      result.skipped.push({ line, reason: "invalid_email", value: rawEmail });
      return;
    }
    if (seen.has(email)) {
      result.duplicatesInFile += 1;
      return;
    }
    seen.add(email);

    let firstName = first(cells, firstCols);
    let lastName = first(cells, lastCols);
    if (!firstName) {
      const full = first(cells, fullCols);
      if (full) {
        const [given, ...rest] = full.split(/\s+/);
        firstName = given;
        if (!lastName) lastName = rest.join(" ");
      }
    }
    if (!firstName) result.withoutFirstName += 1;

    result.rows.push({
      email,
      firstName: firstName || null,
      lastName: lastName || null,
      phone: first(cells, phoneCols) || null,
      ticketTailorOrderId: first(cells, orderCols) || null,
      line,
    });
  });

  return result;
}

export const SKIP_REASON_LABELS: Record<SkippedRow["reason"], string> = {
  missing_email: "sin email",
  invalid_email: "email no válido",
  cancelled: "pedido cancelado o reembolsado",
};

export function isValidParticipantEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return EMAIL_RE.test(e) && e.length <= 254;
}
