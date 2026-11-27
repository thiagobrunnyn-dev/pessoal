// Request notices — queue. Creates the WhatsApp notices of a request when it is registered and
// when it is closed, and hands them to the n8n through the Central's send contract
// (outbox_claim / outbox_result in lib/whatsapp-api.ts). The panel never calls the WAHA.
//
// Queries here use the D1 binding directly instead of the regional read facade: a notice is a
// side effect of an action that was already authorised, and nothing read here goes back to the
// caller.
import {GUEST_MAINTENANCE_CATEGORIES, type GuestMaintenanceCategory} from './guest-request-categories';
import {
  consentedWhatsapp, maskWhatsapp, noticeBody, noticeKindLabel, noticesDisclosed, redactNumbers, whatsappJid,
  NOTICE_GROUP_HOURLY_LIMIT, NOTICE_MAX_AGE_HOURS, NOTICE_NUMBER_DAILY_LIMIT, NOTICE_QUEUE_LIMIT, NOTICE_REQUESTER_HOURLY_LIMIT, NOTICE_SENDER_NAME,
  type NoticeEvent, type NoticeItem, type NoticeRequest, type NoticeSource, type NoticeStatus, type NoticeTarget, type RequestNoticeItem,
} from './request-notices';
import {WHATSAPP_SEND_TIMEOUT_MINUTES} from './whatsapp';
import {INTAKE_WHATSAPP_PRIVACY_VERSION} from './request-intake-model';

export type NoticeGuard = {sql: string; args: unknown[]};
export type RequestNoticeDependencies = {db: () => D1Database; now?: () => Date};
/** A queued notice in the item format of outbox_claim, plus its age for ordering. */
export type ClaimableNotice = {id: string; body: string; chat_jid: string; created_at: string};
export type NoticeOutcome = {ok: true; waMessageId: string | null} | {ok: false; error: string};

type Json = Record<string, unknown>;
type Subject = {
  id: string; protocol: string; kind: string; values_json: string; received_at: string;
  property_id: string | null; property_name: string | null; event_id: string; event_at: string;
};
type NoticeRow = Omit<RequestNoticeItem, 'requester'> & {requester_jid: string | null};

// The request and the history event that causes the notice, in the same shape for both origins.
// The general forms only know the property after triage; the QR channel keeps the name it showed.
const SUBJECT: Record<NoticeSource, string> = {
  intake: `SELECT r.id,r.protocol,r.kind,r.values_json,r.received_at,r.property_id,p.name property_name,e.id event_id,e.created_at event_at
    FROM request_intakes r JOIN request_intake_events e ON e.intake_id=r.id AND e.owner_id=r.owner_id
    LEFT JOIN properties p ON p.id=r.property_id AND p.owner_id=r.owner_id WHERE r.owner_id=?`,
  guest: `SELECT r.id,r.protocol,r.kind,r.values_json,r.received_at,r.property_id,r.property_name,e.id event_id,e.created_at event_at
    FROM guest_submissions r JOIN guest_submission_events e ON e.submission_id=r.id AND e.owner_id=r.owner_id WHERE r.owner_id=?`,
};
// A group notice needs its group to still be registered; a requester notice needs the number.
const HAS_DESTINATION = `((target='group' AND EXISTS(SELECT 1 FROM whatsapp_chats c WHERE c.id=request_notices.chat_id AND c.owner_id=request_notices.owner_id))
  OR (target='requester' AND requester_jid IS NOT NULL))`;
const FINISHED: NoticeStatus[] = ['sent', 'failed', 'cancelled'];
const HOUR = 3_600_000;
const BLOCKED = {
  queue: 'Aviso não enviado: há avisos demais aguardando envio. Confira se o n8n está em execução.',
  group: 'Aviso não enviado: o limite de avisos por hora deste grupo foi atingido.',
  number: 'Aviso não enviado: o limite diário de avisos para este número foi atingido.',
  requesters: 'Aviso não enviado: o limite de avisos a solicitantes por hora foi atingido.',
};
const changes = (result: D1Result) => Number(result.meta?.changes || 0);
const text = (value: unknown) => typeof value === 'string' ? value : '';

function readValues(json: string): Json {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Json : {};
  } catch {
    return {};
  }
}
function readItems(value: unknown): NoticeItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const row = item && typeof item === 'object' ? item as Json : {};
    return typeof row.name === 'string' && typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? [{name: row.name, quantity: row.quantity, unit: text(row.unit)}] : [];
  });
}

export function createRequestNotices(d: RequestNoticeDependencies) {
  const clock = () => d.now ? d.now() : new Date();
  const stmt = (sql: string, ...args: unknown[]) => d.db().prepare(sql).bind(...args);
  const first = <T>(sql: string, ...args: unknown[]) => stmt(sql, ...args).first<T>();
  const all = async <T>(sql: string, ...args: unknown[]) => (await stmt(sql, ...args).all<T>()).results;
  const ago = (now: Date, milliseconds: number) => new Date(now.getTime() - milliseconds).toISOString();

  // ------------------------------------------------------------------ creation
  /** The property's group (the followed one first, then the oldest), else the general group. */
  const groupFor = (ownerId: string, propertyId: string | null) => first<{id: string}>(
    `SELECT id FROM whatsapp_chats WHERE owner_id=? AND (property_id=? OR requests_default=1)
     ORDER BY CASE WHEN property_id=? THEN 0 ELSE 1 END,monitored DESC,created_at,id LIMIT 1`, ownerId, propertyId, propertyId);

  /**
   * Queues one notice per target for the event. The unique index on (owner, source, event, target)
   * makes it safe to call again for the same event: a replay adds nothing, and it fills in a
   * notice that a first attempt saved the action but did not live to create.
   */
  async function enqueue(ownerId: string, source: NoticeSource, event: NoticeEvent, subject: Subject, directJid?: string) {
    const kind = noticeKindLabel(source, subject.kind);
    if (!kind) return;
    const values = readValues(subject.values_json);
    // A request sent under an earlier privacy text was told its content stays with management.
    // It never produces a notice, not even when it is closed after this feature went live.
    if (directJid
      ? values.privacy_version !== INTAKE_WHATSAPP_PRIVACY_VERSION || values.privacy_accepted !== true
      : !noticesDisclosed(source, values)) return;
    const number = directJid ? null : consentedWhatsapp(values);
    const jid = directJid ?? (number ? whatsappJid(number) : null);
    const chat = directJid ? null : await groupFor(ownerId, subject.property_id);
    if (!chat && !jid) return;

    const now = clock(), nowIso = now.toISOString();
    // Only the QR form has a subject, and only as one of its fixed options: never free text.
    const category = source === 'guest' && subject.kind === 'maintenance' ? text(values.category) : '';
    const request: NoticeRequest = {
      kind, subject: Object.hasOwn(GUEST_MAINTENANCE_CATEGORIES, category) ? GUEST_MAINTENANCE_CATEGORIES[category as GuestMaintenanceCategory] : null,
      protocol: subject.protocol, property: subject.property_name || null,
      declaredPlace: text(values.location), description: text(values.description), items: readItems(values.items),
      receivedAt: subject.received_at, closedAt: event === 'closed' ? subject.event_at : undefined,
    };
    // Each limit is a count the inserting statement makes itself. The forms are public, so two
    // requests can arrive together: counting first and inserting afterwards would let both pass a
    // limit that only one of them fits in. The first limit reached gives the reason.
    type Limit = {reason: string; count: string; args: unknown[]; max: number};
    const waiting: Limit = {reason: BLOCKED.queue, count: "SELECT count(*) FROM request_notices WHERE owner_id=? AND status IN ('queued','sending')", args: [ownerId], max: NOTICE_QUEUE_LIMIT};
    // A notice stopped by a limit is still recorded, as cancelled and with nothing personal in
    // it, so the Central shows why it did not go out and a replay does not bring it back.
    const insert = (target: NoticeTarget, chatId: string | null, requesterJid: string | null, limits: Limit[]) => stmt(
      `INSERT INTO request_notices (id,owner_id,source,source_id,protocol,event,event_key,target,chat_id,requester_jid,body,status,error,created_at,purged_at)
       SELECT ?,?,?,?,?,?,?,?,?,CASE WHEN blocked IS NULL THEN ? END,CASE WHEN blocked IS NULL THEN ? ELSE '' END,
         CASE WHEN blocked IS NULL THEN 'queued' ELSE 'cancelled' END,blocked,?,CASE WHEN blocked IS NULL THEN NULL ELSE ? END
       FROM (SELECT CASE ${limits.map(limit => `WHEN (${limit.count})>=? THEN ?`).join(' ')} END blocked) WHERE true
       ON CONFLICT(owner_id,source,event_key,target) DO NOTHING`,
      crypto.randomUUID(), ownerId, source, subject.id, subject.protocol, event, subject.event_id, target, chatId,
      requesterJid, noticeBody(event, target, request, !directJid), nowIso, nowIso,
      ...limits.flatMap(limit => [...limit.args, limit.max, limit.reason]));
    const recent = "AND status<>'cancelled' AND created_at>=?";
    // One batch: the requester's statement already counts the group notice queued just before it.
    await d.db().batch([
      ...(chat ? [insert('group', chat.id, null, [waiting,
        {reason: BLOCKED.group, count: `SELECT count(*) FROM request_notices WHERE owner_id=? AND target='group' AND chat_id=? ${recent}`, args: [ownerId, chat.id, ago(now, HOUR)], max: NOTICE_GROUP_HOURLY_LIMIT},
      ])] : []),
      ...(jid ? [insert('requester', null, jid, [waiting,
        {reason: BLOCKED.number, count: `SELECT count(*) FROM request_notices WHERE owner_id=? AND target='requester' AND requester_jid=? ${recent}`, args: [ownerId, jid, ago(now, 24 * HOUR)], max: NOTICE_NUMBER_DAILY_LIMIT},
        {reason: BLOCKED.requesters, count: `SELECT count(*) FROM request_notices WHERE owner_id=? AND target='requester' ${recent}`, args: [ownerId, ago(now, HOUR)], max: NOTICE_REQUESTER_HOURLY_LIMIT},
      ])] : []),
    ]);
  }

  /** A notice never undoes or fails the action that caused it: failures are logged, without numbers. */
  async function quietly(label: string, task: () => Promise<void>) {
    try {
      await task();
    } catch (error) {
      console.error('request-notices', label, redactNumbers(error instanceof Error ? error.message : 'erro desconhecido'));
    }
  }
  /** Call after a request was saved, including when the save was an idempotent replay. */
  const queueReceived = (ownerId: string, source: NoticeSource, protocol: string) => quietly('received', async () => {
    const subject = await first<Subject>(SUBJECT[source] + " AND r.protocol=? AND r.status<>'closed' AND e.revision=1 AND e.action='received'", ownerId, protocol);
    if (subject) await enqueue(ownerId, source, 'received', subject);
  });
  /** A direct request authorizes a receipt to its verified sender only. */
  const queueDirectReceipt = async (ownerId: string, protocol: string, senderJid: string) => {
    if (!/^[1-9]\d{9,14}@c\.us$/.test(senderJid)) throw new Error('Destinatário direto inválido.');
    const subject = await first<Subject>(SUBJECT.intake + ` AND r.protocol=? AND e.revision=1 AND e.action='received'
      AND EXISTS (SELECT 1 FROM request_agent_intakes a WHERE a.owner_id=r.owner_id AND a.intake_id=r.id)`, ownerId, protocol);
    if (!subject) throw new Error('Solicitação direta indisponível.');
    await enqueue(ownerId, 'intake', 'received', subject, senderJid);
  };
  /**
   * Call after a triage action was saved (or replayed) at `revision`. Only a close that is still
   * the request's latest event produces notices; closing again after a reopen is a new event.
   */
  const queueClosed = (ownerId: string, source: NoticeSource, id: string, revision: number) => quietly('closed', async () => {
    const subject = await first<Subject>(SUBJECT[source] + " AND r.id=? AND r.status='closed' AND r.last_event_id=e.id AND e.revision=? AND e.action='close'", ownerId, id, revision);
    if (subject) await enqueue(ownerId, source, 'closed', subject);
  });

  // ------------------------------------------------------- delivery (WhatsApp API)
  /**
   * Run before each claim, so a notice is never sent twice, late, or to a group that is gone:
   * claimed and never confirmed becomes failed (no automatic retry, as for the Central's sends);
   * queued for too long becomes cancelled; queued with no destination left becomes failed.
   */
  function sweepStatements(ownerId: string, guard: NoticeGuard, now: Date) {
    return [
      stmt(`UPDATE request_notices SET status='failed',error='Envio não confirmado pelo n8n. O aviso pode ou não ter chegado.'
        WHERE owner_id=? AND status='sending' AND claimed_at<? AND ${guard.sql}`, ownerId, ago(now, WHATSAPP_SEND_TIMEOUT_MINUTES * 60_000), ...guard.args),
      stmt(`UPDATE request_notices SET status='cancelled',error='Aviso não retirado pelo n8n em ${NOTICE_MAX_AGE_HOURS} horas. Foi cancelado para não chegar fora de hora.'
        WHERE owner_id=? AND status='queued' AND created_at<? AND ${guard.sql}`, ownerId, ago(now, NOTICE_MAX_AGE_HOURS * HOUR), ...guard.args),
      stmt(`UPDATE request_notices SET status='failed',error='O destino deste aviso não existe mais.'
        WHERE owner_id=? AND status='queued' AND NOT ${HAS_DESTINATION} AND ${guard.sql}`, ownerId, ...guard.args),
    ];
  }
  /** Oldest queued notices with a destination. The group id is read now, not when it was queued. */
  const claimable = (ownerId: string, limit: number) => all<ClaimableNotice>(
    `SELECT n.id,n.body,n.created_at,CASE n.target WHEN 'group' THEN c.chat_jid ELSE n.requester_jid END chat_jid
     FROM request_notices n LEFT JOIN whatsapp_chats c ON c.id=n.chat_id AND c.owner_id=n.owner_id
     WHERE n.owner_id=? AND n.status='queued' AND CASE n.target WHEN 'group' THEN c.chat_jid ELSE n.requester_jid END IS NOT NULL
     ORDER BY n.created_at,n.id LIMIT ?`, ownerId, limit);
  const claimStatement = (ownerId: string, id: string, guard: NoticeGuard, nowIso: string) => stmt(
    `UPDATE request_notices SET status='sending',claimed_at=? WHERE id=? AND owner_id=? AND status='queued' AND ${HAS_DESTINATION} AND ${guard.sql}`,
    nowIso, id, ownerId, ...guard.args);

  /** Records the n8n's answer for a claimed notice. Null when `id` is not a notice awaiting one. */
  async function confirm(ownerId: string, id: string, guard: NoticeGuard, outcome: NoticeOutcome, nowIso: string) {
    const notice = await first<{target: NoticeTarget; chat_id: string | null; body: string}>("SELECT target,chat_id,body FROM request_notices WHERE id=? AND owner_id=? AND status='sending'", id, ownerId);
    if (!notice) return null;
    if (!outcome.ok) {
      const result = await stmt(`UPDATE request_notices SET status='failed',error=? WHERE id=? AND owner_id=? AND status='sending' AND ${guard.sql}`,
        redactNumbers(outcome.error), id, ownerId, ...guard.args).run();
      return changes(result) ? {id, status: 'failed'} : null;
    }
    const waId = outcome.waMessageId || 'notice:' + id;
    // Runs only if the statement before it marked this notice as sent at this very moment.
    const justSent = "EXISTS(SELECT 1 FROM request_notices WHERE id=? AND owner_id=? AND status='sent' AND sent_at=?)", sentArgs = [id, ownerId, nowIso];
    const results = await d.db().batch([
      stmt(`UPDATE request_notices SET status='sent',sent_at=?,wa_message_id=?,error=NULL WHERE id=? AND owner_id=? AND status='sending' AND ${guard.sql}`,
        nowIso, waId, id, ownerId, ...guard.args),
      // Like a send written in the panel, a delivered group notice enters the group's history, but
      // only for a followed group: the Central keeps no message text of the groups it does not follow.
      ...(notice.target === 'group' && notice.chat_id ? [
        stmt(`INSERT INTO whatsapp_messages (id,owner_id,chat_id,wa_message_id,direction,sender_name,kind,body,has_media,sent_at,received_at,analyzed_at)
              SELECT ?,?,?,?,'out',?,'text',?,0,?,?,? WHERE ${justSent} AND EXISTS(SELECT 1 FROM whatsapp_chats WHERE id=? AND owner_id=? AND monitored=1)
              ON CONFLICT(owner_id,wa_message_id) DO NOTHING`,
          crypto.randomUUID(), ownerId, notice.chat_id, waId, NOTICE_SENDER_NAME, notice.body, nowIso, nowIso, nowIso, ...sentArgs, notice.chat_id, ownerId),
        stmt(`UPDATE whatsapp_chats SET last_message_at=?,updated_at=? WHERE id=? AND owner_id=? AND monitored=1 AND (last_message_at IS NULL OR last_message_at<?) AND ${justSent}`,
          nowIso, nowIso, notice.chat_id, ownerId, nowIso, ...sentArgs),
      ] : []),
    ]);
    return changes(results[0]) ? {id, status: 'sent'} : null;
  }

  /**
   * Finished notices past the retention period lose the text and the requester's number. The
   * WAHA message id goes too, because it embeds the chat id of whoever received the message.
   */
  const retentionStatement = (ownerId: string, nowIso: string, cutoff: string) => stmt(
    "UPDATE request_notices SET body='',requester_jid=NULL,wa_message_id=NULL,purged_at=? WHERE id IN (SELECT id FROM request_notices WHERE owner_id=? AND purged_at IS NULL AND status IN ('sent','failed','cancelled') AND created_at<? LIMIT 200)",
    nowIso, ownerId, cutoff);

  /** Latest notices for the Central: no message text, and the number only masked. */
  async function list(ownerId: string, now: Date, cutoff: string): Promise<RequestNoticeItem[]> {
    const rows = await all<NoticeRow>(
      `SELECT n.id,n.source,n.source_id,n.protocol,n.event,n.target,c.name chat_name,n.requester_jid,n.status,n.created_at,n.sent_at,n.error,n.purged_at
       FROM request_notices n LEFT JOIN whatsapp_chats c ON c.id=n.chat_id AND c.owner_id=n.owner_id
       WHERE n.owner_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT 50`, ownerId);
    return rows.map(({requester_jid, ...row}) => {
      // Past the retention period the number is hidden even before the cleanup has run.
      const expired = !row.purged_at && row.created_at < cutoff && FINISHED.includes(row.status);
      return {...row, requester: expired ? null : maskWhatsapp(requester_jid) || null, purged_at: expired ? now.toISOString() : row.purged_at};
    });
  }

  return {queueReceived, queueDirectReceipt, queueClosed, sweepStatements, claimable, claimStatement, confirm, retentionStatement, list};
}
