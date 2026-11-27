import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {guestReceipt} from './guest-channel-model';
import {boundedJson, RequestError} from './http-security';
import {INTAKE_PRIVACY_VERSION, INTAKE_WHATSAPP_PRIVACY_VERSION, intakeKind, parseIntakeValues, type IntakeValues} from './request-intake-model';

type AgentConfig = {ownerId: string; token?: string; identityKey?: string; session?: string};
type AgentDependencies = {
  db: () => D1Database;
  config: () => AgentConfig;
  notify: (ownerId: string, protocol: string, senderJid: string) => Promise<unknown>;
  now?: () => Date;
};
type Json = Record<string, unknown>;
type AuthorizedConfig = {ownerId: string; identityKey: string; session: string};
type Receipt = {protocol: string; received_at: string};
type SavedReceipt = Receipt & {sender_hash: string; request_fingerprint: string};

const SECRET = /^[a-f0-9]{64}$/;
const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const DIRECT_JID = /^([1-9]\d{9,14})@(?:c\.us|s\.whatsapp\.net)$/;
const MESSAGE_ID = /^[A-Za-z0-9@._:-]{1,240}$/;
const PROTOCOL = /^(?:MAN|COM)-[A-F0-9]{16}$/;
const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
};

const reply = (data: object, status = 200) => Response.json(data, {
  status,
  headers: status === 429 ? {...HEADERS, 'Retry-After': '60'} : HEADERS,
});
const unavailable = () => new RequestError('Atendimento WhatsApp temporariamente indisponível.', 503);
const invalid = () => new RequestError('Confira os campos do atendimento.');
const missing = () => new RequestError('Protocolo indisponível para este atendimento.', 404);
const stringMatches = (value: unknown, pattern: RegExp): value is string =>
  typeof value === 'string' && value === value.trim() && pattern.test(value);
const isObject = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);

function hash(key: string, ...parts: unknown[]): string {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(JSON.stringify(parts)).digest('hex');
}

function requestAgentSenderHash(identityKey: string, session: string, senderJid: string): string {
  return hash(identityKey, 'sender', session, senderJid);
}

function authorize(request: Request, config: AgentConfig): AuthorizedConfig {
  if (request.headers.has('origin') || request.headers.has('cookie')) {
    throw new RequestError('Acesso exclusivo da integração de atendimento.', 403);
  }
  const supplied = request.headers.get('authorization');
  if (!supplied?.startsWith('Bearer ') || !stringMatches(supplied.slice(7), SECRET) ||
      !stringMatches(config.token, SECRET) ||
      !timingSafeEqual(Buffer.from(config.token, 'hex'), Buffer.from(supplied.slice(7), 'hex'))) {
    throw new RequestError('Credencial de atendimento inválida.', 401);
  }
  if (!config.ownerId?.trim() || !stringMatches(config.identityKey, SECRET) ||
      config.identityKey === config.token || !stringMatches(config.session, SESSION)) throw unavailable();
  return {ownerId: config.ownerId, identityKey: config.identityKey, session: config.session};
}

function senderFrom(input: Json, config: AuthorizedConfig): string {
  if (input.session !== config.session) throw new RequestError('Sessão de atendimento não autorizada.', 403);
  const match = stringMatches(input.sender, DIRECT_JID) ? DIRECT_JID.exec(input.sender) : null;
  if (!match) throw new RequestError('Identificador de conversa individual inválido.');
  return match[1] + '@c.us';
}

function parseValues(kind: ReturnType<typeof intakeKind>, value: unknown): IntakeValues {
  if (!isObject(value) || value.privacy_accepted !== true || value.privacy_version !== INTAKE_WHATSAPP_PRIVACY_VERSION) {
    throw new RequestError('Confirme o uso dos dados para tratar a solicitação pelo WhatsApp.');
  }
  if (Object.hasOwn(value, 'contact') || Object.hasOwn(value, 'whatsapp') || Object.hasOwn(value, 'whatsapp_consent')) {
    throw new RequestError('O destinatário é definido pela conversa de atendimento.');
  }
  const parsed = parseIntakeValues(kind, {...value, privacy_version: INTAKE_PRIVACY_VERSION});
  return {...parsed, privacy_version: INTAKE_WHATSAPP_PRIVACY_VERSION};
}

async function limitSender(db: D1Database, senderHash: string, action: 'create' | 'status', now: Date) {
  const seconds = Math.floor(now.getTime() / 1000);
  const minute = Math.floor(seconds / 60);
  const limit = action === 'create' ? 6 : 30;
  const key = 'request-agent:' + action + ':' + senderHash + ':' + minute;
  const [count] = await db.batch([
    db.prepare(`INSERT INTO visit_rate_limits(id,attempts,expires_at) VALUES(?,1,?)
      ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 WHERE attempts<?`).bind(key, (minute + 1) * 60, limit),
    db.prepare(`DELETE FROM visit_rate_limits WHERE id IN
      (SELECT id FROM visit_rate_limits WHERE id LIKE 'request-agent:%' AND expires_at<? LIMIT 50)`).bind(seconds),
  ]);
  if (!count.meta.changes) throw new RequestError('Muitas consultas ou solicitações. Aguarde e tente novamente.', 429);
}

export function createRequestAgent(d: AgentDependencies) {
  const now = () => d.now?.() ?? new Date();
  const errorResponse = (error: unknown) => {
    const safe = error instanceof RequestError ? error : unavailable();
    return reply({error: safe.message}, safe.status);
  };

  async function GET(request: Request) {
    try {
      authorize(request, d.config());
      await d.db().prepare(`SELECT a.sender_hash,i.protocol,e.id,v.attempts,n.requester_jid,n.purged_at FROM request_agent_intakes a
        CROSS JOIN request_intakes i CROSS JOIN request_intake_events e CROSS JOIN visit_rate_limits v
        CROSS JOIN request_notices n WHERE 0`).first();
      return reply({ready: true});
    } catch (error) { return errorResponse(error); }
  }

  async function readStatus(db: D1Database, config: AuthorizedConfig, senderHash: string, input: Json) {
    if (Object.keys(input).some(key => !['action', 'session', 'sender', 'protocol'].includes(key)) ||
        typeof input.protocol !== 'string') throw invalid();
    const protocol = input.protocol.trim().toUpperCase();
    if (!stringMatches(protocol, PROTOCOL)) throw missing();
    await limitSender(db, senderHash, 'status', now());
    const row = await db.prepare(`SELECT i.protocol,i.status,i.received_at
      FROM request_agent_intakes a JOIN request_intakes i ON i.id=a.intake_id AND i.owner_id=a.owner_id
      WHERE a.owner_id=? AND a.session=? AND a.sender_hash=? AND i.protocol=?`)
      .bind(config.ownerId, config.session, senderHash, protocol).first<Receipt & {status: string}>();
    if (!row) throw missing();
    return reply(row);
  }

  async function create(db: D1Database, config: AuthorizedConfig, senderJid: string, senderHash: string, input: Json) {
    if (Object.keys(input).some(key => !['action', 'session', 'sender', 'messageId', 'kind', 'values'].includes(key)) ||
        typeof input.kind !== 'string' || !stringMatches(input.messageId, MESSAGE_ID) || input.messageId.startsWith('true_')) throw invalid();
    const kind = intakeKind(input.kind);
    const values = parseValues(kind, input.values);
    const {ownerId, session, identityKey} = config;
    const eventHash = hash(identityKey, 'event', session, input.messageId);
    const fingerprint = hash(identityKey, 'request', kind, values);
    const eventScope = [ownerId, session, eventHash];
    const replay = async () => {
      const saved = await db.prepare(`SELECT i.protocol,i.received_at,a.sender_hash,a.request_fingerprint
        FROM request_agent_intakes a JOIN request_intakes i ON i.id=a.intake_id AND i.owner_id=a.owner_id
        WHERE a.owner_id=? AND a.session=? AND a.event_hash=?`).bind(...eventScope).first<SavedReceipt>();
      if (saved && (saved.sender_hash !== senderHash || saved.request_fingerprint !== fingerprint)) {
        throw new RequestError('Esta mensagem já foi registrada com outros dados.', 409);
      }
      return saved;
    };
    const receipt = async (saved: Receipt, alreadySaved: boolean) => {
      // Persisted requests remain confirmed even if a transient queue failure needs a later replay.
      try { await d.notify(ownerId, saved.protocol, senderJid); } catch { throw unavailable(); }
      return reply(guestReceipt(saved, alreadySaved), alreadySaved ? 200 : 201);
    };
    const existing = await replay();
    if (existing) return receipt(existing, true);

    const timestamp = now();
    await limitSender(db, senderHash, 'create', timestamp);
    const receivedAt = timestamp.toISOString();
    const id = crypto.randomUUID(), eventId = crypto.randomUUID();
    const protocol = (kind === 'maintenance' ? 'MAN-' : 'COM-') + randomBytes(8).toString('hex').toUpperCase();
    const committed = 'EXISTS(SELECT 1 FROM request_intakes WHERE id=? AND owner_id=? AND last_event_id=?)';
    const [created] = await db.batch([
      db.prepare(`INSERT INTO request_intakes(id,owner_id,kind,protocol,values_json,received_at,status,revision,last_event_id,request_id,request_fingerprint)
        SELECT ?,?,?,?,?,?,'received',1,?,?,? WHERE NOT EXISTS
        (SELECT 1 FROM request_agent_intakes WHERE owner_id=? AND session=? AND event_hash=?)`)
        .bind(id, ownerId, kind, protocol, JSON.stringify(values), receivedAt, eventId, id, fingerprint, ...eventScope),
      db.prepare(`INSERT INTO request_intake_events(id,owner_id,intake_id,revision,state_code,action,before_status,after_status,note,
        actor_user_id,actor_name,request_id,request_fingerprint,created_at)
        SELECT ?,?,?,1,NULL,'received',NULL,'received','','integration:whatsapp-request-agent','Atendimento WhatsApp',?,?,? WHERE ${committed}`)
        .bind(eventId, ownerId, id, 'whatsapp-agent:' + id, fingerprint, receivedAt, id, ownerId, eventId),
      db.prepare(`INSERT INTO request_agent_intakes(owner_id,session,event_hash,sender_hash,intake_id,request_fingerprint,created_at)
        SELECT ?,?,?,?,?,?,? WHERE ${committed}`).bind(...eventScope, senderHash, id, fingerprint, receivedAt, id, ownerId, eventId),
    ]);
    if (created.meta.changes) return receipt({protocol, received_at: receivedAt}, false);
    const concurrent = await replay();
    if (!concurrent) throw unavailable();
    return receipt(concurrent, true);
  }

  async function POST(request: Request) {
    try {
      const config = authorize(request, d.config());
      const input: unknown = await boundedJson(request, 16_384);
      if (!isObject(input) || (input.action !== 'create' && input.action !== 'status')) throw invalid();
      const senderJid = senderFrom(input, config);
      const senderHash = requestAgentSenderHash(config.identityKey, config.session, senderJid);
      const db = d.db();
      return input.action === 'create'
        ? await create(db, config, senderJid, senderHash, input)
        : await readStatus(db, config, senderHash, input);
    } catch (error) { return errorResponse(error); }
  }

  return {GET, POST};
}
