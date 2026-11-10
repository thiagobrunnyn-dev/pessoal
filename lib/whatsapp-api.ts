// Central do WhatsApp — API. O painel consulta e age por aqui; o n8n usa as mesmas rotas pelo
// gateway de integrações (/api/integrations/v1/whatsapp) para registrar o que captura no WAHA.
// O painel nunca chama o WAHA nem o n8n: mensagens a enviar ficam numa fila que o n8n consome.
import type {Operator} from './app-access';
import {boundedJson, requireSameOrigin, RequestError} from './http-security';
import {
  cleanText, dayOf, dayRange, parseTopics, readAnalysis, readChat, readMessage, readStatus, readSummary, requireDay,
  requireList, requireObject, requireRevision, requireUuid, WHATSAPP_RETENTION_DAYS, WHATSAPP_SEND_TIMEOUT_MINUTES,
  type IncomingChat, type IncomingMessage, type WhatsappChat, type WhatsappMessage, type WhatsappOutboxItem, type WhatsappRequest,
} from './whatsapp';

type Guard = {sql: string; args: unknown[]};
export type WhatsappDependencies = {
  getOperator: () => Promise<Operator | null>;
  recheckOperator: (op: Operator) => Promise<void>;
  operatorGuard: (op: Operator) => Guard;
  isRegionalRequest: () => boolean;
  first: <T>(sql: string, ...args: unknown[]) => Promise<T | null>;
  all: <T>(sql: string, ...args: unknown[]) => Promise<T[]>;
  db: () => D1Database;
  noCache: Record<string, string>;
  now?: () => Date;
};
type Json = Record<string, unknown>;
type SummaryRow = {id: string; chat_id: string; chat_name: string; day: string; summary: string; topics_json: string; sentiment: string; message_count: number; participant_count: number; request_count: number; updated_at: string};

const MAX_BODY = 300 * 1024;
const MACHINE_ACTIONS = ['sync_chats', 'ingest', 'analysis', 'summary', 'outbox_claim', 'outbox_result'];
const ADMIN_ACTIONS = ['monitor', 'link_property'];
const VIEWS = ['overview', 'chat', 'requests', 'outbox', 'pending_analysis', 'summary_targets', 'day'];
const chatColumns = `c.id,c.chat_jid,c.name,c.participants_count,c.monitored,c.property_id,p.name property_name,c.last_message_at,c.revision,
  (SELECT count(*) FROM whatsapp_messages m WHERE m.chat_id=c.id AND m.owner_id=c.owner_id AND m.sent_at>=?) messages_24h,
  (SELECT count(*) FROM whatsapp_requests r WHERE r.chat_id=c.id AND r.owner_id=c.owner_id AND r.status IN ('detected','accepted')) open_requests`;
const chatFrom = 'FROM whatsapp_chats c LEFT JOIN properties p ON p.id=c.property_id AND p.owner_id=c.owner_id';
const requestColumns = 'r.id,r.chat_id,c.name chat_name,r.message_id,r.category,r.urgency,r.summary,r.requester_name,r.status,r.note,r.handled_by_name,r.revision,r.created_at,r.updated_at';
const requestFrom = 'FROM whatsapp_requests r JOIN whatsapp_chats c ON c.id=r.chat_id AND c.owner_id=r.owner_id';
const summaryColumns = 's.id,s.chat_id,c.name chat_name,s.day,s.summary,s.topics_json,s.sentiment,s.message_count,s.participant_count,s.request_count,s.updated_at';
const summaryFrom = 'FROM whatsapp_summaries s JOIN whatsapp_chats c ON c.id=s.chat_id AND c.owner_id=s.owner_id';
const changes = (result: D1Result) => Number(result.meta?.changes || 0);
const summaryOut = ({topics_json, ...row}: SummaryRow) => ({...row, topics: parseTopics(topics_json)});
const FINAL_OUTBOX = ['sent', 'failed', 'cancelled'], CLOSED_REQUEST = ['done', 'dismissed'];

export function createWhatsappApi(d: WhatsappDependencies) {
  const clock = () => d.now ? d.now() : new Date();
  const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: d.noCache});
  const stmt = (sql: string, ...args: unknown[]) => d.db().prepare(sql).bind(...args);
  const isAdmin = (op: Operator) => !op.integrationId && (op.role === 'owner' || op.role === 'admin');
  const actorName = (op: Operator) => op.actor.fullName || op.actor.displayName;
  const failure = (error: unknown, fallback: string) => {
    if (error instanceof RequestError) return reply({error: error.message}, error.status);
    console.error('whatsapp', error instanceof Error ? error.message : 'erro desconhecido');
    return reply({error: fallback}, 503);
  };

  const retentionCutoff = (now: Date) => new Date(now.getTime() - WHATSAPP_RETENTION_DAYS * 86_400_000).toISOString();
  /**
   * Apaga o que passou do prazo de retenção, em lotes pequenos. Roda junto das ações agendadas do
   * n8n (captura, sincronização de grupos e fila de envio), então não depende de chegar mensagem nova.
   */
  function retentionStatements(op: Operator, now: Date) {
    const nowIso = now.toISOString(), cutoff = retentionCutoff(now);
    return [
      stmt('UPDATE whatsapp_messages SET body=NULL,sender_jid=NULL,sender_name=NULL,purged_at=? WHERE id IN (SELECT id FROM whatsapp_messages WHERE owner_id=? AND purged_at IS NULL AND sent_at<? LIMIT 500)', nowIso, op.ownerId, cutoff),
      stmt("UPDATE whatsapp_outbox SET body='',purged_at=? WHERE id IN (SELECT id FROM whatsapp_outbox WHERE owner_id=? AND purged_at IS NULL AND status IN ('sent','failed','cancelled') AND created_at<? LIMIT 200)", nowIso, op.ownerId, cutoff),
      stmt("UPDATE whatsapp_requests SET requester_name=NULL WHERE id IN (SELECT id FROM whatsapp_requests WHERE owner_id=? AND requester_name IS NOT NULL AND status IN ('done','dismissed') AND updated_at<? LIMIT 200)", op.ownerId, cutoff),
    ];
  }
  // As consultas também escondem o que já venceu, mesmo que a limpeza ainda não tenha rodado.
  const expiredRequest = (request: WhatsappRequest, cutoff: string) => CLOSED_REQUEST.includes(request.status) && request.updated_at < cutoff ? {...request, requester_name: null} : request;

  async function operator(): Promise<Operator> {
    const op = await d.getOperator();
    if (!op) throw new RequestError('Acesso restrito à gestão autorizada.', 401);
    // As tabelas do WhatsApp não têm recorte por região; o acesso regional fica de fora.
    if (d.isRegionalRequest()) throw new RequestError('A Central do WhatsApp não está disponível neste acesso regional.', 403);
    return op;
  }
  async function assertAccess(op: Operator) {
    await d.recheckOperator(op);
    const guard = d.operatorGuard(op);
    if (!await d.first('SELECT 1 permitted WHERE ' + guard.sql, ...guard.args)) throw new RequestError('O acesso mudou. Atualize a página.', 409);
  }

  // ---------------------------------------------------------------- consultas
  async function overview(op: Operator) {
    const now = clock(), since = new Date(now.getTime() - 86_400_000).toISOString(), [todayStart] = dayRange(dayOf(now));
    const chats = await d.all<WhatsappChat>(`SELECT ${chatColumns} ${chatFrom} WHERE c.owner_id=? ORDER BY c.monitored DESC,c.last_message_at DESC,c.name LIMIT 301`, since, op.ownerId);
    const totals = await d.first<Json>(`SELECT
      (SELECT count(*) FROM whatsapp_chats WHERE owner_id=? AND monitored=1) monitored_chats,
      (SELECT count(*) FROM whatsapp_messages WHERE owner_id=? AND sent_at>=?) messages_today,
      (SELECT count(*) FROM whatsapp_requests WHERE owner_id=? AND status IN ('detected','accepted')) open_requests,
      (SELECT count(*) FROM whatsapp_requests WHERE owner_id=? AND status IN ('detected','accepted') AND urgency='high') urgent_requests,
      (SELECT count(*) FROM whatsapp_outbox WHERE owner_id=? AND status IN ('queued','sending')) queued_outbox,
      (SELECT count(*) FROM whatsapp_outbox WHERE owner_id=? AND status='failed' AND created_at>=?) failed_outbox,
      (SELECT count(*) FROM whatsapp_messages WHERE owner_id=? AND analyzed_at IS NULL) pending_analysis,
      (SELECT max(received_at) FROM whatsapp_messages WHERE owner_id=? AND direction='in') last_capture_at`,
      op.ownerId, op.ownerId, todayStart, op.ownerId, op.ownerId, op.ownerId, op.ownerId, since, op.ownerId, op.ownerId);
    const summaries = await d.all<SummaryRow>(`SELECT ${summaryColumns} ${summaryFrom} WHERE s.owner_id=? ORDER BY s.day DESC,s.updated_at DESC LIMIT 12`, op.ownerId);
    const properties = isAdmin(op) ? await d.all<{id: string; name: string}>('SELECT id,name FROM properties WHERE owner_id=? AND archived_at IS NULL ORDER BY name LIMIT 500', op.ownerId) : [];
    return {chats: chats.slice(0, 300), chats_limited: chats.length > 300, totals, summaries: summaries.map(summaryOut), properties, can_manage: isAdmin(op), retention_days: WHATSAPP_RETENTION_DAYS, today: dayOf(now)};
  }
  async function chatRow(op: Operator, id: string) {
    const since = new Date(clock().getTime() - 86_400_000).toISOString();
    const chat = await d.first<WhatsappChat>(`SELECT ${chatColumns} ${chatFrom} WHERE c.id=? AND c.owner_id=?`, since, id, op.ownerId);
    if (!chat) throw new RequestError('Grupo não encontrado.', 404);
    return chat;
  }
  async function chatView(op: Operator, query: URLSearchParams) {
    const id = requireUuid(query.get('id'), 'Grupo não encontrado.'), before = query.get('before') || '9999';
    if (before !== '9999' && Number.isNaN(Date.parse(before))) throw new RequestError('Consulta inválida.');
    const chat = await chatRow(op, id);
    const messages = await d.all<WhatsappMessage>('SELECT id,direction,sender_name,kind,body,has_media,sent_at,purged_at,category,is_request FROM whatsapp_messages WHERE chat_id=? AND owner_id=? AND sent_at<? ORDER BY sent_at DESC,id DESC LIMIT 101', id, op.ownerId, before);
    const requests = await d.all<WhatsappRequest>(`SELECT ${requestColumns} ${requestFrom} WHERE r.chat_id=? AND r.owner_id=? ORDER BY r.created_at DESC LIMIT 30`, id, op.ownerId);
    const now = clock(), cutoff = retentionCutoff(now);
    const visible = messages.slice(0, 100).map(message => message.sent_at < cutoff && !message.purged_at ? {...message, body: null, sender_name: null, purged_at: now.toISOString()} : message);
    const summaries = await d.all<SummaryRow>(`SELECT ${summaryColumns} ${summaryFrom} WHERE s.chat_id=? AND s.owner_id=? ORDER BY s.day DESC LIMIT 14`, id, op.ownerId);
    return {chat, messages: visible, has_more: messages.length > 100, requests: requests.map(request => expiredRequest(request, cutoff)), summaries: summaries.map(summaryOut), can_manage: isAdmin(op)};
  }
  async function requestsView(op: Operator, query: URLSearchParams) {
    const status = query.get('status') || 'open';
    const where = status === 'open' ? " AND r.status IN ('detected','accepted')" : status === 'all' ? '' : ' AND r.status=?';
    const requests = await d.all<WhatsappRequest>(`SELECT ${requestColumns} ${requestFrom} WHERE r.owner_id=?${where} ORDER BY CASE r.urgency WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,r.created_at DESC LIMIT 201`,
      op.ownerId, ...(where.endsWith('?') ? [readStatus(status)] : []));
    const cutoff = retentionCutoff(clock());
    return {requests: requests.slice(0, 200).map(request => expiredRequest(request, cutoff)), limited: requests.length > 200};
  }
  async function outboxView(op: Operator) {
    const items = await d.all<WhatsappOutboxItem>('SELECT o.id,o.chat_id,c.name chat_name,o.body,o.status,o.created_by_name,o.created_at,o.sent_at,o.error,o.purged_at FROM whatsapp_outbox o JOIN whatsapp_chats c ON c.id=o.chat_id AND c.owner_id=o.owner_id WHERE o.owner_id=? ORDER BY o.created_at DESC LIMIT 50', op.ownerId);
    const now = clock(), cutoff = retentionCutoff(now);
    return {items: items.map(item => !item.purged_at && item.created_at < cutoff && FINAL_OUTBOX.includes(item.status) ? {...item, body: '', purged_at: now.toISOString()} : item)};
  }
  async function pendingAnalysis(op: Operator, query: URLSearchParams) {
    const rawLimit = query.get('limit') || '25';
    if (!/^\d{1,2}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 40) throw new RequestError('Limite inválido (1 a 40).');
    const messages = await d.all("SELECT m.id,c.name chat_name,m.sender_name,m.sent_at,m.kind,m.body FROM whatsapp_messages m JOIN whatsapp_chats c ON c.id=m.chat_id AND c.owner_id=m.owner_id WHERE m.owner_id=? AND m.analyzed_at IS NULL AND m.direction='in' AND m.body IS NOT NULL AND m.sent_at>=? AND c.monitored=1 ORDER BY m.sent_at LIMIT ?", op.ownerId, retentionCutoff(clock()), Number(rawLimit));
    return {messages};
  }
  async function summaryTargets(op: Operator, query: URLSearchParams) {
    const day = query.get('day') ? requireDay(query.get('day')) : dayOf(clock()), [start, end] = dayRange(day);
    const chats = await d.all<{chat_id: string; name: string; message_count: number; summarized_count: number | null}>(`SELECT c.id chat_id,c.name,count(m.id) message_count,
      (SELECT s.message_count FROM whatsapp_summaries s WHERE s.chat_id=c.id AND s.owner_id=c.owner_id AND s.day=?) summarized_count
      FROM whatsapp_chats c JOIN whatsapp_messages m ON m.chat_id=c.id AND m.owner_id=c.owner_id AND m.sent_at>=? AND m.sent_at<? AND m.body IS NOT NULL
      WHERE c.owner_id=? AND c.monitored=1 GROUP BY c.id ORDER BY c.name LIMIT 100`, day, start, end, op.ownerId);
    return {day, chats: chats.map(chat => ({...chat, needs_summary: chat.summarized_count === null || chat.message_count > chat.summarized_count}))};
  }
  async function dayView(op: Operator, query: URLSearchParams) {
    const id = requireUuid(query.get('id'), 'Grupo não encontrado.'), day = requireDay(query.get('day')), [start, end] = dayRange(day);
    const chat = await d.first<{id: string; name: string}>('SELECT id,name FROM whatsapp_chats WHERE id=? AND owner_id=?', id, op.ownerId);
    if (!chat) throw new RequestError('Grupo não encontrado.', 404);
    const messages = await d.all('SELECT sender_name,direction,sent_at,category,substr(body,1,600) body FROM whatsapp_messages WHERE chat_id=? AND owner_id=? AND sent_at>=? AND sent_at<? AND sent_at>=? AND body IS NOT NULL ORDER BY sent_at LIMIT 401', id, op.ownerId, start, end, retentionCutoff(clock()));
    return {chat, day, messages: messages.slice(0, 400), limited: messages.length > 400};
  }

  async function GET(request: Request) {
    try {
      const op = await operator();
      const query = new URL(request.url).searchParams;
      for (const key of query.keys()) if (!['view', 'id', 'day', 'status', 'before', 'limit'].includes(key) || query.getAll(key).length !== 1) throw new RequestError('Consulta inválida.');
      const view = query.get('view') || 'overview';
      if (!VIEWS.includes(view)) throw new RequestError('Consulta inválida.');
      const body = view === 'overview' ? await overview(op) : view === 'chat' ? await chatView(op, query) : view === 'requests' ? await requestsView(op, query)
        : view === 'outbox' ? await outboxView(op) : view === 'pending_analysis' ? await pendingAnalysis(op, query)
        : view === 'summary_targets' ? await summaryTargets(op, query) : await dayView(op, query);
      await assertAccess(op);
      return reply(body);
    } catch (error) {
      return failure(error, 'Não foi possível carregar a Central do WhatsApp.');
    }
  }

  // ------------------------------------------------- ações do n8n (integração)
  async function syncChats(op: Operator, body: Json) {
    const nowIso = clock().toISOString(), guard = d.operatorGuard(op);
    const chats = requireList(body.chats, 300, 'Envie de 1 a 300 grupos por chamada.').map(readChat).filter((chat): chat is IncomingChat => !!chat);
    const unique = [...new Map(chats.map(chat => [chat.jid, chat])).values()];
    let saved = 0;
    for (let index = 0; index < unique.length; index += 50) {
      const results = await d.db().batch(unique.slice(index, index + 50).map(chat => stmt(
        `INSERT INTO whatsapp_chats (id,owner_id,chat_jid,kind,name,participants_count,monitored,revision,created_at,updated_at)
         SELECT ?,?,?,'group',?,?,0,0,?,? WHERE ${guard.sql}
         ON CONFLICT(owner_id,chat_jid) DO UPDATE SET name=CASE WHEN excluded.name=excluded.chat_jid THEN whatsapp_chats.name ELSE excluded.name END,
           participants_count=COALESCE(excluded.participants_count,whatsapp_chats.participants_count),updated_at=excluded.updated_at`,
        crypto.randomUUID(), op.ownerId, chat.jid, chat.name, chat.participants, nowIso, nowIso, ...guard.args)));
      saved += results.reduce((sum, result) => sum + changes(result), 0);
    }
    await d.db().batch(retentionStatements(op, clock()));
    return {synced: saved, ignored: (body.chats as unknown[]).length - unique.length};
  }

  async function ingest(op: Operator, body: Json) {
    const now = clock(), nowIso = now.toISOString(), guard = d.operatorGuard(op);
    const items = requireList(body.messages, 50, 'Envie de 1 a 50 mensagens por chamada.');
    const messages = items.map(item => readMessage(item, now)).filter((message): message is IncomingMessage => !!message);
    const jids = [...new Set(messages.map(message => message.chatJid))];
    if (!jids.length) {
      await d.db().batch(retentionStatements(op, now));
      return {stored: 0, duplicates: 0, unmonitored: 0, ignored: items.length};
    }
    // Grupo novo é só cadastrado (sem monitorar): a gestão decide no painel o que acompanhar.
    await d.db().batch(jids.map(jid => stmt(
      `INSERT INTO whatsapp_chats (id,owner_id,chat_jid,kind,name,monitored,revision,created_at,updated_at)
       SELECT ?,?,?,'group',?,0,0,?,? WHERE ${guard.sql} ON CONFLICT(owner_id,chat_jid) DO NOTHING`,
      crypto.randomUUID(), op.ownerId, jid, messages.find(message => message.chatJid === jid && message.chatName)?.chatName || jid, nowIso, nowIso, ...guard.args)));
    const chats = await d.all<{id: string; chat_jid: string; monitored: number}>('SELECT id,chat_jid,monitored FROM whatsapp_chats WHERE owner_id=? AND chat_jid IN (SELECT value FROM json_each(?))', op.ownerId, JSON.stringify(jids));
    const byJid = new Map(chats.map(chat => [chat.chat_jid, chat]));
    const accepted = messages.filter(message => byJid.get(message.chatJid)?.monitored === 1);
    const inserts = accepted.map(message => {
      const chat = byJid.get(message.chatJid)!;
      // Mensagens enviadas pela própria conta ou sem texto não vão para a análise.
      const analyzedAt = message.direction === 'out' || !message.body ? nowIso : null;
      return stmt(
        `INSERT INTO whatsapp_messages (id,owner_id,chat_id,wa_message_id,direction,sender_jid,sender_name,kind,body,has_media,sent_at,received_at,analyzed_at)
         SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql} AND EXISTS(SELECT 1 FROM whatsapp_chats WHERE id=? AND owner_id=? AND monitored=1)
         ON CONFLICT(owner_id,wa_message_id) DO NOTHING`,
        crypto.randomUUID(), op.ownerId, chat.id, message.waMessageId, message.direction, message.senderJid, message.senderName, message.kind, message.body,
        message.hasMedia, message.sentAt, nowIso, analyzedAt, ...guard.args, chat.id, op.ownerId);
    });
    const latest = new Map<string, string>();
    for (const message of accepted) {
      const id = byJid.get(message.chatJid)!.id;
      if (!latest.has(id) || latest.get(id)! < message.sentAt) latest.set(id, message.sentAt);
    }
    const touches = [...latest].map(([id, sentAt]) => stmt('UPDATE whatsapp_chats SET last_message_at=?,updated_at=? WHERE id=? AND owner_id=? AND (last_message_at IS NULL OR last_message_at<?)', sentAt, nowIso, id, op.ownerId, sentAt));
    const results = await d.db().batch([...inserts, ...touches, ...retentionStatements(op, now)]);
    const stored = results.slice(0, inserts.length).reduce((sum, result) => sum + changes(result), 0);
    return {stored, duplicates: accepted.length - stored, unmonitored: messages.length - accepted.length, ignored: items.length - messages.length};
  }

  async function analysis(op: Operator, body: Json) {
    const nowIso = clock().toISOString(), guard = d.operatorGuard(op);
    const items = requireList(body.items, 50, 'Envie de 1 a 50 análises por chamada.').map(readAnalysis);
    const statements: D1PreparedStatement[] = [], requestIndexes: number[] = [], updateIndexes: number[] = [];
    for (const item of items) {
      if (item.isRequest) {
        requestIndexes.push(statements.length);
        statements.push(stmt(
          `INSERT INTO whatsapp_requests (id,owner_id,chat_id,message_id,category,urgency,summary,requester_name,status,note,revision,created_at,updated_at)
           SELECT ?,m.owner_id,m.chat_id,m.id,?,?,?,m.sender_name,'detected','',0,?,? FROM whatsapp_messages m
           WHERE m.id=? AND m.owner_id=? AND m.direction='in' AND ${guard.sql} ON CONFLICT(message_id) DO NOTHING`,
          crypto.randomUUID(), item.category, item.urgency, item.summary, nowIso, nowIso, item.messageId, op.ownerId, ...guard.args));
      }
      updateIndexes.push(statements.length);
      statements.push(stmt(`UPDATE whatsapp_messages SET analyzed_at=COALESCE(analyzed_at,?),category=?,is_request=? WHERE id=? AND owner_id=? AND ${guard.sql}`,
        nowIso, item.category, item.isRequest ? 1 : 0, item.messageId, op.ownerId, ...guard.args));
    }
    const results = await d.db().batch(statements);
    const count = (indexes: number[]) => indexes.reduce((sum, index) => sum + changes(results[index]), 0);
    return {analyzed: count(updateIndexes), requests: count(requestIndexes)};
  }

  async function summary(op: Operator, body: Json) {
    const input = readSummary(body), nowIso = clock().toISOString(), guard = d.operatorGuard(op), [start, end] = dayRange(input.day);
    const range = [input.chatId, op.ownerId, start, end];
    const result = await stmt(
      `INSERT INTO whatsapp_summaries (id,owner_id,chat_id,day,summary,topics_json,sentiment,message_count,participant_count,request_count,created_at,updated_at)
       SELECT ?,?,?,?,?,?,?,
         (SELECT count(*) FROM whatsapp_messages WHERE chat_id=? AND owner_id=? AND sent_at>=? AND sent_at<? AND body IS NOT NULL),
         (SELECT count(DISTINCT COALESCE(sender_jid,sender_name)) FROM whatsapp_messages WHERE chat_id=? AND owner_id=? AND sent_at>=? AND sent_at<? AND direction='in'),
         (SELECT count(*) FROM whatsapp_requests r JOIN whatsapp_messages m ON m.id=r.message_id WHERE r.chat_id=? AND r.owner_id=? AND m.sent_at>=? AND m.sent_at<?),
         ?,? WHERE ${guard.sql} AND EXISTS(SELECT 1 FROM whatsapp_chats WHERE id=? AND owner_id=?)
       ON CONFLICT(owner_id,chat_id,day) DO UPDATE SET summary=excluded.summary,topics_json=excluded.topics_json,sentiment=excluded.sentiment,
         message_count=excluded.message_count,participant_count=excluded.participant_count,request_count=excluded.request_count,updated_at=excluded.updated_at`,
      crypto.randomUUID(), op.ownerId, input.chatId, input.day, input.summary, JSON.stringify(input.topics), input.sentiment,
      ...range, ...range, ...range, nowIso, nowIso, ...guard.args, input.chatId, op.ownerId).run();
    if (!changes(result)) throw new RequestError('Grupo não encontrado.', 404);
    return {saved: true, chat_id: input.chatId, day: input.day};
  }

  async function outboxClaim(op: Operator, body: Json) {
    const now = clock(), nowIso = now.toISOString(), guard = d.operatorGuard(op);
    const limit = body.limit === undefined ? 5 : body.limit;
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new RequestError('Limite inválido (1 a 10).');
    // Envio entregue ao n8n e nunca confirmado vira falha. Não há reenvio automático,
    // para um grupo não receber a mesma mensagem duas vezes.
    const stale = new Date(now.getTime() - WHATSAPP_SEND_TIMEOUT_MINUTES * 60_000).toISOString();
    await stmt(`UPDATE whatsapp_outbox SET status='failed',error='Envio não confirmado pelo n8n. Confira o grupo antes de reenviar.' WHERE owner_id=? AND status='sending' AND claimed_at<? AND ${guard.sql}`, op.ownerId, stale, ...guard.args).run();
    const queued = await d.all<{id: string; body: string; chat_jid: string}>("SELECT o.id,o.body,c.chat_jid FROM whatsapp_outbox o JOIN whatsapp_chats c ON c.id=o.chat_id AND c.owner_id=o.owner_id WHERE o.owner_id=? AND o.status='queued' ORDER BY o.created_at LIMIT ?", op.ownerId, limit);
    if (!queued.length) {
      await d.db().batch(retentionStatements(op, now));
      return {messages: []};
    }
    const results = await d.db().batch(queued.map(item => stmt(`UPDATE whatsapp_outbox SET status='sending',claimed_at=? WHERE id=? AND owner_id=? AND status='queued' AND ${guard.sql}`, nowIso, item.id, op.ownerId, ...guard.args)));
    await d.db().batch(retentionStatements(op, now));
    return {messages: queued.filter((_, index) => changes(results[index]) === 1)};
  }

  async function outboxResult(op: Operator, body: Json) {
    const id = requireUuid(body.id, 'Envio não encontrado.'), nowIso = clock().toISOString(), guard = d.operatorGuard(op);
    if (typeof body.ok !== 'boolean') throw new RequestError('Informe ok como verdadeiro ou falso.');
    const item = await d.first<{chat_id: string; body: string; created_by_name: string}>("SELECT chat_id,body,created_by_name FROM whatsapp_outbox WHERE id=? AND owner_id=? AND status='sending'", id, op.ownerId);
    if (!item) throw new RequestError('Este envio não está aguardando confirmação.', 409);
    if (!body.ok) {
      const result = await stmt(`UPDATE whatsapp_outbox SET status='failed',error=? WHERE id=? AND owner_id=? AND status='sending' AND ${guard.sql}`, cleanText(body.error, 300) || 'Falha no envio.', id, op.ownerId, ...guard.args).run();
      if (!changes(result)) throw new RequestError('Este envio não está aguardando confirmação.', 409);
      return {id, status: 'failed'};
    }
    const waId = typeof body.wa_message_id === 'string' && /^[\w@.:-]{1,200}$/.test(body.wa_message_id) ? body.wa_message_id : 'outbox:' + id;
    const results = await d.db().batch([
      stmt(`UPDATE whatsapp_outbox SET status='sent',sent_at=?,wa_message_id=?,error=NULL WHERE id=? AND owner_id=? AND status='sending' AND ${guard.sql}`, nowIso, waId, id, op.ownerId, ...guard.args),
      // A mensagem enviada entra no histórico do grupo; se o WAHA também a devolver na captura, o id repetido é ignorado.
      stmt(`INSERT INTO whatsapp_messages (id,owner_id,chat_id,wa_message_id,direction,sender_name,kind,body,has_media,sent_at,received_at,analyzed_at)
            SELECT ?,?,?,?,'out',?,'text',?,0,?,?,? WHERE EXISTS(SELECT 1 FROM whatsapp_outbox WHERE id=? AND owner_id=? AND status='sent' AND sent_at=?)
            ON CONFLICT(owner_id,wa_message_id) DO NOTHING`, crypto.randomUUID(), op.ownerId, item.chat_id, waId, item.created_by_name, item.body, nowIso, nowIso, nowIso, id, op.ownerId, nowIso),
      stmt('UPDATE whatsapp_chats SET last_message_at=?,updated_at=? WHERE id=? AND owner_id=? AND (last_message_at IS NULL OR last_message_at<?)', nowIso, nowIso, item.chat_id, op.ownerId, nowIso),
    ]);
    if (!changes(results[0])) throw new RequestError('Este envio não está aguardando confirmação.', 409);
    return {id, status: 'sent'};
  }

  // ----------------------------------------------------------- ações da gestão
  async function monitor(op: Operator, body: Json) {
    const id = requireUuid(body.chat_id, 'Grupo não encontrado.'), revision = requireRevision(body.expected_revision), nowIso = clock().toISOString(), guard = d.operatorGuard(op);
    if (typeof body.monitored !== 'boolean') throw new RequestError('Informe se o grupo deve ser acompanhado.');
    if (body.monitored && body.confirmed !== true) throw new RequestError('Confirme que o grupo foi avisado sobre o registro das mensagens.');
    const result = await stmt(`UPDATE whatsapp_chats SET monitored=?,monitored_changed_at=?,monitored_changed_by=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND ${guard.sql}`,
      body.monitored ? 1 : 0, nowIso, actorName(op), nowIso, id, op.ownerId, revision, ...guard.args).run();
    if (!changes(result)) throw new RequestError('O grupo mudou ou não foi encontrado. Atualize a página.', 409);
    return {chat: await chatRow(op, id)};
  }
  async function linkProperty(op: Operator, body: Json) {
    const id = requireUuid(body.chat_id, 'Grupo não encontrado.'), revision = requireRevision(body.expected_revision), nowIso = clock().toISOString(), guard = d.operatorGuard(op);
    const propertyId = body.property_id === null || body.property_id === '' ? null : requireUuid(body.property_id, 'Imóvel não encontrado.');
    const result = await stmt(`UPDATE whatsapp_chats SET property_id=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND ${guard.sql}
      AND (? IS NULL OR EXISTS(SELECT 1 FROM properties WHERE id=? AND owner_id=? AND archived_at IS NULL))`,
      propertyId, nowIso, id, op.ownerId, revision, ...guard.args, propertyId, propertyId, op.ownerId).run();
    if (!changes(result)) throw new RequestError('O grupo ou o imóvel mudou. Atualize a página.', 409);
    return {chat: await chatRow(op, id)};
  }
  async function send(op: Operator, body: Json) {
    const chatId = requireUuid(body.chat_id, 'Grupo não encontrado.'), requestId = requireUuid(body.request_id, 'Identificador do envio inválido.');
    const text = cleanText(body.body, 2000, true), nowIso = clock().toISOString(), guard = d.operatorGuard(op);
    if (!text) throw new RequestError('Escreva a mensagem antes de enviar.');
    const existing = () => d.first<{id: string; chat_id: string; body: string; status: string}>('SELECT id,chat_id,body,status FROM whatsapp_outbox WHERE request_id=? AND owner_id=?', requestId, op.ownerId);
    const repeated = (row: {id: string; chat_id: string; body: string; status: string}) => {
      if (row.chat_id !== chatId || row.body !== text) throw new RequestError('Este identificador já foi usado em outro envio.', 409);
      return {id: row.id, status: row.status, already_saved: true};
    };
    const before = await existing();
    if (before) return repeated(before);
    const waiting = await d.first<{total: number}>("SELECT count(*) total FROM whatsapp_outbox WHERE owner_id=? AND status IN ('queued','sending')", op.ownerId);
    if ((waiting?.total || 0) >= 100) throw new RequestError('Há muitos envios aguardando. Confira se o n8n está em execução.', 429);
    const id = crypto.randomUUID();
    let result: D1Result;
    try {
      result = await stmt(`INSERT INTO whatsapp_outbox (id,owner_id,chat_id,body,status,created_by_user_id,created_by_name,request_id,created_at)
        SELECT ?,?,?,?,'queued',?,?,?,? WHERE ${guard.sql} AND EXISTS(SELECT 1 FROM whatsapp_chats WHERE id=? AND owner_id=? AND monitored=1)`,
        id, op.ownerId, chatId, text, op.actor.userId, actorName(op), requestId, nowIso, ...guard.args, chatId, op.ownerId).run();
    } catch (error) {
      const raced = await existing();
      if (raced) return repeated(raced);
      throw error;
    }
    if (!changes(result)) throw new RequestError('Só é possível enviar para grupos acompanhados pela central.', 409);
    return {id, status: 'queued'};
  }
  async function cancelSend(op: Operator, body: Json) {
    const id = requireUuid(body.id, 'Envio não encontrado.'), guard = d.operatorGuard(op);
    const result = await stmt(`UPDATE whatsapp_outbox SET status='cancelled' WHERE id=? AND owner_id=? AND status='queued' AND ${guard.sql}`, id, op.ownerId, ...guard.args).run();
    if (!changes(result)) throw new RequestError('Este envio já saiu da fila e não pode ser cancelado.', 409);
    return {id, status: 'cancelled'};
  }
  async function requestStatus(op: Operator, body: Json) {
    const id = requireUuid(body.id, 'Solicitação não encontrada.'), status = readStatus(body.status), revision = requireRevision(body.expected_revision);
    const note = cleanText(body.note, 1000, true), nowIso = clock().toISOString(), guard = d.operatorGuard(op);
    if (status === 'dismissed' && !note) throw new RequestError('Informe o motivo para descartar a solicitação.');
    const result = await stmt(`UPDATE whatsapp_requests SET status=?,note=?,handled_by_user_id=?,handled_by_name=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND ${guard.sql}`,
      status, note, op.actor.userId, actorName(op), nowIso, id, op.ownerId, revision, ...guard.args).run();
    if (!changes(result)) throw new RequestError('A solicitação mudou ou não foi encontrada. Atualize a página.', 409);
    return {request: await d.first<WhatsappRequest>(`SELECT ${requestColumns} ${requestFrom} WHERE r.id=? AND r.owner_id=?`, id, op.ownerId)};
  }

  async function POST(request: Request) {
    try {
      const op = await operator();
      requireSameOrigin(request);
      const body = requireObject(await boundedJson(request, MAX_BODY)), action = body.action;
      if (typeof action !== 'string') throw new RequestError('Informe a ação.');
      if (MACHINE_ACTIONS.includes(action) && !op.integrationId) throw new RequestError('Esta ação é exclusiva da integração com o n8n.', 403);
      if (ADMIN_ACTIONS.includes(action) && !isAdmin(op)) throw new RequestError('Somente administradores definem os grupos acompanhados.', 403);
      await assertAccess(op);
      switch (action) {
        case 'sync_chats': return reply(await syncChats(op, body));
        case 'ingest': return reply(await ingest(op, body));
        case 'analysis': return reply(await analysis(op, body));
        case 'summary': return reply(await summary(op, body));
        case 'outbox_claim': return reply(await outboxClaim(op, body));
        case 'outbox_result': return reply(await outboxResult(op, body));
        case 'monitor': return reply(await monitor(op, body));
        case 'link_property': return reply(await linkProperty(op, body));
        case 'send': return reply(await send(op, body), 201);
        case 'cancel_send': return reply(await cancelSend(op, body));
        case 'request_status': return reply(await requestStatus(op, body));
        default: throw new RequestError('Ação não reconhecida.');
      }
    } catch (error) {
      return failure(error, 'Não foi possível confirmar a operação. Consulte a central antes de repetir.');
    }
  }

  return {GET, POST};
}
