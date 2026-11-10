// Central do WhatsApp — modelo puro: constantes, tipos e validação de entrada.
// Sem acesso a banco ou rede; usado pela API (lib/whatsapp-api.ts) e pela tela.
import {RequestError} from './http-security';

/**
 * Prazo de retenção. Depois dele são apagados o texto e o remetente das mensagens, o texto dos
 * envios já finalizados e o nome do solicitante das solicitações encerradas.
 */
export const WHATSAPP_RETENTION_DAYS = 90;
/** Envio sem confirmação do n8n depois deste prazo vira falha; nunca é reenviado sozinho. */
export const WHATSAPP_SEND_TIMEOUT_MINUTES = 10;
/** Os dias de análise seguem o horário de Brasília (UTC-3, sem horário de verão). */
export const WHATSAPP_DAY_OFFSET_HOURS = 3;

export const WHATSAPP_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const WHATSAPP_GROUP_JID = /^[\w.-]{1,80}@g\.us$/;
const WA_MESSAGE_ID = /^[\w@.:-]{1,200}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const MESSAGE_KINDS = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'poll', 'other'] as const;
export const REQUEST_CATEGORIES = ['maintenance', 'purchase', 'cleaning', 'lodging', 'complaint', 'other'] as const;
export const MESSAGE_CATEGORIES = [...REQUEST_CATEGORIES, 'info', 'chatter'] as const;
export const REQUEST_URGENCIES = ['low', 'normal', 'high'] as const;
export const REQUEST_STATUSES = ['detected', 'accepted', 'done', 'dismissed'] as const;
export const SUMMARY_SENTIMENTS = ['positive', 'neutral', 'negative', 'mixed'] as const;

export type MessageKind = typeof MESSAGE_KINDS[number];
export type RequestCategory = typeof REQUEST_CATEGORIES[number];
export type MessageCategory = typeof MESSAGE_CATEGORIES[number];
export type RequestUrgency = typeof REQUEST_URGENCIES[number];
export type RequestStatus = typeof REQUEST_STATUSES[number];
export type SummarySentiment = typeof SUMMARY_SENTIMENTS[number];
export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';

export const CATEGORY_LABELS: Record<MessageCategory, string> = {
  maintenance: 'Manutenção', purchase: 'Compra', cleaning: 'Limpeza', lodging: 'Hospedagem',
  complaint: 'Reclamação', other: 'Outros', info: 'Informativo', chatter: 'Conversa',
};
export const URGENCY_LABELS: Record<RequestUrgency, string> = {low: 'Baixa', normal: 'Normal', high: 'Alta'};
export const STATUS_LABELS: Record<RequestStatus, string> = {detected: 'Detectada', accepted: 'Em andamento', done: 'Concluída', dismissed: 'Descartada'};
export const SENTIMENT_LABELS: Record<SummarySentiment, string> = {positive: 'Positivo', neutral: 'Neutro', negative: 'Negativo', mixed: 'Misto'};
export const OUTBOX_LABELS: Record<OutboxStatus, string> = {queued: 'Na fila', sending: 'Enviando', sent: 'Enviada', failed: 'Falhou', cancelled: 'Cancelada'};

export type WhatsappChat = {
  id: string; chat_jid: string; name: string; participants_count: number | null; monitored: number;
  property_id: string | null; property_name: string | null; last_message_at: string | null; revision: number;
  messages_24h: number; open_requests: number;
};
export type WhatsappMessage = {
  id: string; direction: 'in' | 'out'; sender_name: string | null; kind: MessageKind; body: string | null;
  has_media: number; sent_at: string; purged_at: string | null; category: MessageCategory | null; is_request: number;
};
export type WhatsappRequest = {
  id: string; chat_id: string; chat_name: string; message_id: string; category: RequestCategory; urgency: RequestUrgency;
  summary: string; requester_name: string | null; status: RequestStatus; note: string; handled_by_name: string | null;
  revision: number; created_at: string; updated_at: string;
};
export type WhatsappSummary = {
  id: string; chat_id: string; chat_name: string; day: string; summary: string; topics: string[]; sentiment: SummarySentiment;
  message_count: number; participant_count: number; request_count: number; updated_at: string;
};
export type WhatsappOutboxItem = {
  id: string; chat_id: string; chat_name: string; body: string; status: OutboxStatus; created_by_name: string;
  created_at: string; sent_at: string | null; error: string | null; purged_at: string | null;
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

/** Remove caracteres de controle (mantém quebras de linha) e limita o tamanho. */
export function cleanText(value: unknown, max: number, multiline = false): string {
  if (typeof value !== 'string') return '';
  const pattern = multiline ? /[^\P{Cc}\n]/gu : /\p{Cc}/gu;
  return value.replace(pattern, ' ').trim().slice(0, max);
}
export function requireObject(value: unknown): Json {
  if (!isObject(value)) throw new RequestError('Solicitação inválida.');
  return value;
}
export function requireUuid(value: unknown, message = 'Registro não encontrado.'): string {
  if (typeof value !== 'string' || !WHATSAPP_UUID.test(value)) throw new RequestError(message, 404);
  return value;
}
export function requireList(value: unknown, max: number, message: string): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new RequestError(message);
  return value;
}
export function requireRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new RequestError('Revisão inválida. Atualize a página.');
  return value;
}
export function requireDay(value: unknown): string {
  if (typeof value !== 'string' || !DAY.test(value) || Number.isNaN(Date.parse(value + 'T12:00:00Z'))) throw new RequestError('Dia inválido. Use AAAA-MM-DD.');
  return value;
}
/** Intervalo UTC [início, fim) do dia informado no horário de Brasília. */
export function dayRange(day: string): [string, string] {
  const start = new Date(day + 'T00:00:00Z').getTime() + WHATSAPP_DAY_OFFSET_HOURS * 3600_000;
  return [new Date(start).toISOString(), new Date(start + 86_400_000).toISOString()];
}
export function dayOf(date: Date): string {
  return new Date(date.getTime() - WHATSAPP_DAY_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);
}

export type IncomingChat = {jid: string; name: string; participants: number | null};
export function readChat(value: unknown): IncomingChat | null {
  if (!isObject(value) || typeof value.jid !== 'string' || !WHATSAPP_GROUP_JID.test(value.jid)) return null;
  const participants = typeof value.participants === 'number' && Number.isSafeInteger(value.participants) && value.participants >= 0 && value.participants <= 100_000 ? value.participants : null;
  return {jid: value.jid, name: cleanText(value.name, 150) || value.jid, participants};
}

export type IncomingMessage = {
  chatJid: string; chatName: string; waMessageId: string; direction: 'in' | 'out'; senderJid: string | null;
  senderName: string | null; kind: MessageKind; body: string | null; hasMedia: number; sentAt: string;
};
/**
 * Normaliza uma mensagem enviada pelo n8n. Devolve null para o que a central não registra
 * (conversas individuais, identificadores inválidos); lança erro só quando o item é malformado.
 */
export function readMessage(value: unknown, now: Date): IncomingMessage | null {
  if (!isObject(value)) throw new RequestError('Mensagem inválida.');
  if (typeof value.chat_jid !== 'string' || !WHATSAPP_GROUP_JID.test(value.chat_jid)) return null;
  if (typeof value.wa_message_id !== 'string' || !WA_MESSAGE_ID.test(value.wa_message_id)) return null;
  const raw = value.timestamp;
  let time = NaN;
  if (typeof raw === 'number' && Number.isFinite(raw)) time = raw < 100_000_000_000 ? raw * 1000 : raw;
  else if (typeof raw === 'string') time = Date.parse(raw);
  if (!Number.isFinite(time) || time < Date.UTC(2020, 0, 1) || time > now.getTime() + 86_400_000) throw new RequestError('Data da mensagem inválida.');
  const body = cleanText(value.body, 4000, true) || null;
  return {
    chatJid: value.chat_jid,
    chatName: cleanText(value.chat_name, 150),
    waMessageId: value.wa_message_id,
    direction: value.from_me === true ? 'out' : 'in',
    senderJid: cleanText(value.sender_jid, 100) || null,
    senderName: cleanText(value.sender_name, 120) || null,
    kind: oneOf(MESSAGE_KINDS, value.kind) ? value.kind : 'other',
    body,
    hasMedia: value.has_media === true ? 1 : 0,
    sentAt: new Date(time).toISOString(),
  };
}

export type IncomingAnalysis = {messageId: string; category: MessageCategory; isRequest: boolean; urgency: RequestUrgency; summary: string};
export function readAnalysis(value: unknown): IncomingAnalysis {
  if (!isObject(value)) throw new RequestError('Análise inválida.');
  const category = oneOf(MESSAGE_CATEGORIES, value.category) ? value.category : 'other';
  // Só categorias operacionais viram solicitação; "informativo" e "conversa" nunca.
  const isRequest = value.is_request === true && oneOf(REQUEST_CATEGORIES, category);
  const summary = cleanText(value.summary, 500);
  if (isRequest && !summary) throw new RequestError('Solicitação detectada sem resumo.');
  return {messageId: requireUuid(value.message_id, 'Mensagem inválida.'), category, isRequest, urgency: oneOf(REQUEST_URGENCIES, value.urgency) ? value.urgency : 'normal', summary};
}

export type IncomingSummary = {chatId: string; day: string; summary: string; topics: string[]; sentiment: SummarySentiment};
export function readSummary(value: Json): IncomingSummary {
  const summary = cleanText(value.summary, 4000, true);
  if (!summary) throw new RequestError('Informe o resumo do dia.');
  const topics = Array.isArray(value.topics) ? value.topics.map(topic => cleanText(topic, 80)).filter(Boolean).slice(0, 10) : [];
  return {chatId: requireUuid(value.chat_id, 'Grupo não encontrado.'), day: requireDay(value.day), summary, topics, sentiment: oneOf(SUMMARY_SENTIMENTS, value.sentiment) ? value.sentiment : 'neutral'};
}

export function readStatus(value: unknown): RequestStatus {
  if (!oneOf(REQUEST_STATUSES, value)) throw new RequestError('Situação inválida.');
  return value;
}
export function parseTopics(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((topic): topic is string => typeof topic === 'string') : [];
  } catch {
    return [];
  }
}
