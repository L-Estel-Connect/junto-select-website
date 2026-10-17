// Ticket Tailor CSV → Reconnect participants (no emulator needed):
//   npx tsx --conditions=react-server scripts/local-test/reconnect-csv.test.mts
import { parseCsv, parseTicketTailorCsv } from "../../src/lib/eventReconnect/ticketTailorCsv";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// English export with buyer and attendee columns, quoted commas, a cancelled order, a repeat buyer.
const en = [
  "Order ID,Order reference,Created at,Status,First name,Last name,Email,Phone number,Ticket type,Attendee first name,Attendee last name,Attendee email,Accepts marketing email",
  'or_1,R1,2026-10-01,Completed,Ana,"García, López",ana@example.com,+34 600 000 001,General,Ana,"García, López",ana@example.com,Yes',
  "or_2,R2,2026-10-02,Completed,Bruno,Ruiz,bruno@example.com,,General,Carmen,Díaz,CARMEN@example.com,No",
  "or_2,R2,2026-10-02,Completed,Bruno,Ruiz,bruno@example.com,,General,Bruno,Ruiz,bruno@example.com,No",
  "or_3,R3,2026-10-03,Refunded,Diego,Sanz,diego@example.com,,General,Diego,Sanz,diego@example.com,No",
  "or_4,R4,2026-10-04,Completed,Elena,Mora,elena@example.com,,General,Elena,Mora,elena@example.com,No",
  "or_4,R4,2026-10-04,Completed,Elena,Mora,elena@example.com,,General,,,,No",
  "or_5,R5,2026-10-05,Completed,Fer,Gil,not-an-email,,General,,,,No",
].join("\r\n");
const a = parseTicketTailorCsv(en);
check("en: email column = attendee email", a.columns.email === "Attendee email", a.columns.email);
check("en: first name from attendee column", a.columns.firstName === "Attendee first name", a.columns.firstName);
check("en: order id column", a.columns.orderId === "Order ID", a.columns.orderId);
check("en: marketing column not taken as email", a.rows.every((r) => r.email.includes("@")));
check("en: 4 distinct people", a.rows.map((r) => r.email).join() === "ana@example.com,carmen@example.com,bruno@example.com,elena@example.com", a.rows.map((r) => r.email).join());
check("en: ticket for someone else uses the attendee's name", a.rows.find((r) => r.email === "carmen@example.com")?.firstName === "Carmen");
check("en: quoted comma kept", a.rows[0].lastName === "García, López");
check("en: refunded order skipped", a.skipped.some((s) => s.reason === "cancelled" && s.line === 5));
check("en: second ticket of Elena (no attendee) falls back to buyer, counted as duplicate", a.duplicatesInFile === 1);
check("en: invalid email skipped", a.skipped.some((s) => s.reason === "invalid_email" && s.value === "not-an-email"));
check("en: emails lower-cased", a.rows[1].email === "carmen@example.com");

// Spanish dashboard, Excel-style semicolons, BOM, full name only.
const es = "﻿ID del pedido;Nombre completo;Correo electrónico;Teléfono;Estado del pedido\n101;María José Pérez;mj@example.es;611 222 333;Completado\n102;Luis;luis@example.es;;Cancelado\n";
const b = parseTicketTailorCsv(es);
check("es: semicolons + BOM read", b.columns.email === "Correo electrónico", JSON.stringify(b.columns));
check("es: first name split from full name", b.rows[0]?.firstName === "María" && b.rows[0]?.lastName === "José Pérez");
check("es: phone and order id", b.rows[0]?.phone === "611 222 333" && b.rows[0]?.ticketTailorOrderId === "101");
check("es: cancelled skipped", b.rows.length === 1 && b.skipped[0]?.reason === "cancelled");

// No email column at all.
const c = parseTicketTailorCsv("Order ID,First name\n1,Ana\n");
check("no email column → clear error", !c.ok && !!c.error?.includes("email"));

// Missing first name is allowed but counted.
const d = parseTicketTailorCsv("Email\nsolo@example.com\n");
check("email only → kept, counted without first name", d.rows.length === 1 && d.withoutFirstName === 1);

// Newline inside quotes.
check("csv: newline inside quotes", parseCsv('a,b\n"x\ny",z\n')[1][0] === "x\ny");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
