// Request notices — pure model: constants, WhatsApp number validation and the message texts.
// No database or network access. Used by the public forms, by the notice queue
// (lib/request-notices-api.ts) and by the Central do WhatsApp screen.
//
// A notice is a WhatsApp message about a request, queued when it is registered and when it is
// closed. It goes to the operation group and, when the requester gave a number and authorised it,
// to the requester. Lodging ratings are opinions, not requests, and never produce a notice.
import {RequestError} from './http-security';

export const NOTICE_SOURCES = ['intake', 'guest'] as const;
export const NOTICE_EVENTS = ['received', 'closed'] as const;
export const NOTICE_TARGETS = ['group', 'requester'] as const;
export type NoticeSource = typeof NOTICE_SOURCES[number];
export type NoticeEvent = typeof NOTICE_EVENTS[number];
export type NoticeTarget = typeof NOTICE_TARGETS[number];
export type NoticeStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';

// The forms are public and the requester's number is typed by whoever fills them in, so these
// limits bound what an outsider can make the operation's WhatsApp account send.
/** Notices waiting for the n8n. Above this, new notices are recorded as cancelled. */
export const NOTICE_QUEUE_LIMIT = 200;
/** Notices one group may receive per hour. */
export const NOTICE_GROUP_HOURLY_LIMIT = 30;
/** Notices one number may receive per day. */
export const NOTICE_NUMBER_DAILY_LIMIT = 6;
/** Notices to requesters per hour, all numbers together. */
export const NOTICE_REQUESTER_HOURLY_LIMIT = 60;
/** A notice the n8n did not pick up within this time is cancelled instead of arriving late. */
export const NOTICE_MAX_AGE_HOURS = 24;
/** Dates in the messages follow the operation's time zone, like the receipts of the forms. */
export const NOTICE_TIME_ZONE = 'America/Belem';

/**
 * Versions of each form's privacy text that tell the requester about the notices: a summary goes
 * to the operation's WhatsApp group and the number given is used to notify them. A request stored
 * under an earlier text was told its content stays with management, so it never produces a notice,
 * not even when it is closed later. A new version of a form's text has to be added here on purpose.
 */
export const NOTICE_PRIVACY_VERSIONS: Record<NoticeSource, readonly string[]> = {intake: ['general-requests-v2'], guest: ['identified-v2']};
/** Whether the privacy text a stored request was sent under covers the notices. */
export function noticesDisclosed(source: NoticeSource, values: {privacy_version?: unknown}): boolean {
  return typeof values.privacy_version === 'string' && NOTICE_PRIVACY_VERSIONS[source].includes(values.privacy_version);
}

/** Name under which a delivered group notice appears in the group's history in the Central. */
export const NOTICE_SENDER_NAME = 'Aviso de solicitação';

export const NOTICE_EVENT_LABELS: Record<NoticeEvent, string> = {received: 'Registro', closed: 'Encerramento'};
export const NOTICE_TARGET_LABELS: Record<NoticeTarget, string> = {group: 'Grupo', requester: 'Solicitante'};
export const NOTICE_STATUS_LABELS: Record<NoticeStatus, string> = {queued: 'Na fila', sending: 'Enviando', sent: 'Enviado', failed: 'Falhou', cancelled: 'Cancelado'};

/** A notice as listed in the Central: never the message text, never the full number. */
export type RequestNoticeItem = {
  id: string; source: NoticeSource; source_id: string; protocol: string; event: NoticeEvent; target: NoticeTarget;
  chat_name: string | null; requester: string | null; status: NoticeStatus; created_at: string; sent_at: string | null;
  error: string | null; purged_at: string | null;
};

// ------------------------------------------------------------------ WhatsApp number
export const WHATSAPP_INVALID = 'Confira o WhatsApp informado: use DDD e número, como (91) 98888-7777.';
export const WHATSAPP_CONSENT_REQUIRED = 'Para receber os avisos no WhatsApp, marque a autorização. Se preferir não receber, deixe o WhatsApp em branco.';

const AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
].map(String));
const NORMALIZED_NUMBER = /^55\d{10,11}$/;

/**
 * Normalises a Brazilian number to `55` + area code + number. Accepts masks, spaces, `+55` and a
 * leading zero before the area code. Returns null for anything else: other countries, a missing
 * area code, or a nine-digit number that does not start with 9.
 */
export function normalizeWhatsapp(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 32 || !/^\+?[\d\s().-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    if (!digits.startsWith('55')) return null;
    digits = digits.slice(2);
  } else if (digits.length > 11 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10 && digits.length !== 11) return null;
  const local = digits.slice(2);
  if (!AREA_CODES.has(digits.slice(0, 2))) return null;
  if (local.length === 9 ? local[0] !== '9' : !/^[2-9]/.test(local)) return null;
  return '55' + digits;
}

export type NoticeContact = {whatsapp: string; whatsapp_consent: boolean};
/**
 * Reads the optional WhatsApp number of a public form. A number is accepted only together with
 * the consent box; without a number the consent is stored as false.
 */
export function readNoticeContact(whatsapp: unknown, consent: unknown): NoticeContact {
  if (consent !== undefined && typeof consent !== 'boolean') throw new RequestError('Confira os campos do formulário.');
  if (whatsapp === undefined || whatsapp === null) return {whatsapp: '', whatsapp_consent: false};
  if (typeof whatsapp !== 'string') throw new RequestError(WHATSAPP_INVALID);
  if (!whatsapp.trim()) return {whatsapp: '', whatsapp_consent: false};
  const number = normalizeWhatsapp(whatsapp);
  if (!number) throw new RequestError(WHATSAPP_INVALID);
  if (consent !== true) throw new RequestError(WHATSAPP_CONSENT_REQUIRED);
  return {whatsapp: number, whatsapp_consent: true};
}

/** The number a stored form payload authorised for notices, or null. */
export function consentedWhatsapp(values: {whatsapp?: unknown; whatsapp_consent?: unknown}): string | null {
  return values.whatsapp_consent === true && typeof values.whatsapp === 'string' && NORMALIZED_NUMBER.test(values.whatsapp) ? values.whatsapp : null;
}

/** WhatsApp chat id of a normalised number, in the format the WAHA uses for a person. */
export function whatsappJid(number: string): string {
  return number + '@c.us';
}

/** Shows only the last four digits, as in "(••) •••••-7777". Accepts a number or a chat id. */
export function maskWhatsapp(value: unknown): string {
  if (typeof value !== 'string') return '';
  const digits = value.replace(/@.*$/, '').replace(/\D/g, '');
  const national = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) return '';
  return '(••) ' + '•'.repeat(national.length - 6) + '-' + national.slice(-4);
}

/** Copy of a stored form payload with the WhatsApp number masked, for management screens and the API. */
export function maskNoticeContact<T extends object>(values: T): T {
  const whatsapp = (values as {whatsapp?: unknown}).whatsapp;
  return typeof whatsapp === 'string' && whatsapp ? {...values, whatsapp: maskWhatsapp(whatsapp)} : values;
}

/** Hides phone-like digit runs in a technical text, such as an error returned by the n8n. */
export function redactNumbers(text: string): string {
  return text.replace(/\d{8,}/g, run => '••••' + run.slice(-4));
}

// ------------------------------------------------------------------------- messages
const KIND_LABELS: Record<NoticeSource, Record<string, string>> = {
  intake: {maintenance: 'Manutenção', purchase: 'Compra'},
  guest: {maintenance: 'Manutenção', material: 'Material'},
};
/** Label of a request type that produces notices; null for ratings and unknown types. */
export function noticeKindLabel(source: NoticeSource, kind: string): string | null {
  return Object.hasOwn(KIND_LABELS[source], kind) ? KIND_LABELS[source][kind] : null;
}

const PROPERTY_LENGTH = 100, SUBJECT_LENGTH = 60, PLACE_LENGTH = 120, DESCRIPTION_LENGTH = 280, ITEMS_LENGTH = 240, ITEM_NAME_LENGTH = 60, ITEM_UNIT_LENGTH = 20, ITEM_COUNT = 8;
export const OMITTED_NUMBER = '[número omitido]';
// Eight or more digits, with up to three spaces, dots, hyphens or parentheses between each pair.
const LONG_NUMBER = /[+(]?\d(?:[\s().-]{0,3}\d){7,}\)?/g;

/** Cuts a text at a word boundary when one is near, never in the middle of an emoji. */
function truncate(text: string, max: number): string {
  const symbols = Array.from(text);
  if (symbols.length <= max) return text;
  const cut = symbols.slice(0, max - 1).join(''), space = cut.lastIndexOf(' ');
  return (space > cut.length - 30 ? cut.slice(0, space) : cut).trimEnd() + '…';
}
/** One line without control characters, cut to `max`. For values the panel itself holds. */
export function plainLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return truncate(value.normalize('NFC').replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim(), max);
}
/**
 * Text typed in a public form, made safe to repeat to a group. Besides becoming one line, it
 * loses what could be used against its readers: invisible characters (which could reorder the
 * text or hide a number from the next step), long numbers (phones, CPF, PIX keys), which turn
 * into a marker, and anything WhatsApp would show as a link (schemes are dropped and "site.com"
 * becomes "site. com").
 */
export function declaredText(value: unknown, max: number): string {
  const text = plainLine(value, Number.MAX_SAFE_INTEGER)
    .replace(/\p{Cf}/gu, '')
    .replace(LONG_NUMBER, OMITTED_NUMBER)
    .replace(/\b[a-z][a-z0-9+.-]{1,15}:\/\/|\bwww\./gi, '')
    .replace(/([\p{L}\p{N}])\.(?=\p{L})/gu, '$1. ');
  return truncate(text.replace(/\s+/g, ' ').trim(), max);
}

let dateFormat: Intl.DateTimeFormat | undefined;
/** "13/11/2026 às 14:32", in the operation's time zone. */
export function noticeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'data não informada';
  dateFormat ??= new Intl.DateTimeFormat('pt-BR', {timeZone: NOTICE_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of dateFormat.formatToParts(date)) parts[part.type] = part.value;
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`;
}

export type NoticeItem = {name: string; quantity: number; unit: string};
function itemsLine(items: NoticeItem[]): string {
  const parts: string[] = [];
  let length = 0;
  for (const item of items) {
    const unit = declaredText(item.unit, ITEM_UNIT_LENGTH);
    const part = `${declaredText(item.name, ITEM_NAME_LENGTH)} (${String(item.quantity).replace('.', ',')}${unit ? ' ' + unit : ''})`;
    if (parts.length >= ITEM_COUNT || length + part.length > ITEMS_LENGTH) break;
    parts.push(part);
    length += part.length + 2;
  }
  const more = items.length - parts.length;
  if (more > 0) parts.push(`mais ${more} ${more === 1 ? 'item' : 'itens'}`);
  return parts.join('; ');
}

/** What a notice may say about a request. It never carries who asked or how to reach them. */
export type NoticeRequest = {
  /** Label from noticeKindLabel. */
  kind: string;
  /** Subject chosen from the fixed list of the QR form (as "Ar-condicionado"); null when the form has none. */
  subject: string | null;
  protocol: string;
  /** Property name from the panel's registry (QR channel, or set in triage); null when there is none. */
  property: string | null;
  /** Place, description and items as typed in the form. They only ever go to the group. */
  declaredPlace: string;
  description: string;
  items: NoticeItem[];
  receivedAt: string;
  /** When the request was closed; used by the closed notices. */
  closedAt?: string;
};

/**
 * Text of a notice, in WhatsApp format and without links.
 *
 * The requester's number is typed in a public form, so that message is built only from what the
 * panel itself holds: protocol, type, the subject picked from the form's fixed list, dates and the
 * registered property. The group message also repeats what was typed (place, items, description),
 * labelled as informed by the requester and passed through declaredText. Neither carries the
 * requester's identity or the closing note.
 */
export function noticeBody(event: NoticeEvent, target: NoticeTarget, request: NoticeRequest): string {
  const property = plainLine(request.property, PROPERTY_LENGTH), subject = plainLine(request.subject, SUBJECT_LENGTH);
  const facts = [`Protocolo: *${plainLine(request.protocol, 40)}*`, 'Tipo: ' + request.kind, ...(subject ? ['Assunto: ' + subject] : []), ...(property ? ['Imóvel: ' + property] : [])];
  const dates = ['Recebida em ' + noticeDate(request.receivedAt), ...(event === 'closed' ? ['Encerrada em ' + noticeDate(request.closedAt || '')] : [])];
  const footer = '_Horário de Belém._';
  if (target === 'requester') {
    return event === 'received'
      ? ['*MOBILIZA FACILITIES*', 'Recebemos a sua solicitação.', '', ...facts, ...dates, '', 'Você receberá outro aviso por aqui quando o atendimento for encerrado.', footer].join('\n')
      : ['*MOBILIZA FACILITIES*', 'O atendimento da sua solicitação foi encerrado.', '', ...facts, ...dates, footer].join('\n');
  }
  const place = declaredText(request.declaredPlace, PLACE_LENGTH);
  const declaredPlace = place ? ['Local informado: ' + place] : [];
  if (event === 'closed') return ['*Solicitação encerrada*', ...facts, ...declaredPlace, ...dates, footer].join('\n');
  const items = itemsLine(request.items), description = declaredText(request.description, DESCRIPTION_LENGTH);
  return ['*Nova solicitação*', ...facts, ...declaredPlace, ...(items ? ['Itens informados: ' + items] : []), ...(description ? ['Descrição informada: ' + description] : []), ...dates, footer].join('\n');
}
