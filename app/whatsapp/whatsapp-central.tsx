'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation is required by the deployed Worker router. */
/* eslint-disable @next/next/no-img-element -- The shared fixed-size local logo follows the existing app header. */

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, ClipboardList, MessageCircle, RefreshCw, Send, Users, X} from 'lucide-react';
import {
  CATEGORY_LABELS, OUTBOX_LABELS, SENTIMENT_LABELS, STATUS_LABELS, URGENCY_LABELS,
  type RequestStatus, type WhatsappChat, type WhatsappMessage, type WhatsappOutboxItem, type WhatsappRequest, type WhatsappSummary,
} from '../../lib/whatsapp';
import './whatsapp.css';
import './whatsapp.dark.css';

type Totals = {monitored_chats: number; messages_today: number; open_requests: number; urgent_requests: number; queued_outbox: number; failed_outbox: number; pending_analysis: number; last_capture_at: string | null};
type Overview = {chats: WhatsappChat[]; chats_limited: boolean; totals: Totals; summaries: WhatsappSummary[]; properties: {id: string; name: string}[]; can_manage: boolean; retention_days: number; today: string};
type ChatData = {chat: WhatsappChat; messages: WhatsappMessage[]; has_more: boolean; requests: WhatsappRequest[]; summaries: WhatsappSummary[]; can_manage: boolean};
type RequestsData = {requests: WhatsappRequest[]; limited: boolean};
type OutboxData = {items: WhatsappOutboxItem[]};
type Tab = 'overview' | 'chats' | 'requests' | 'outbox';

const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
const dayText = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'});
const count = (total: number, one: string, many: string) => total + ' ' + (total === 1 ? one : many);
const urgencyPill = {high: 'danger', normal: 'warning', low: 'neutral'} as const;
const statusPill = {detected: 'warning', accepted: 'ok', done: 'neutral', dismissed: 'neutral'} as const;
const outboxPill = {queued: 'warning', sending: 'warning', sent: 'ok', failed: 'danger', cancelled: 'neutral'} as const;

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  let data: unknown;
  try {data = await response.json();} catch {throw new Error(fallback);}
  if (!data || typeof data !== 'object') throw new Error(fallback);
  if (!response.ok) throw new Error('error' in data && typeof data.error === 'string' ? data.error : fallback);
  return data as T;
}
async function query<T>(params: Record<string, string>, signal?: AbortSignal) {
  return readResponse<T>(await fetch('/api/whatsapp?' + new URLSearchParams(params), {cache: 'no-store', signal}), 'Não foi possível carregar a central.');
}
async function act<T>(body: Record<string, unknown>) {
  const response = await fetch('/api/whatsapp', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(20000)});
  return readResponse<T>(response, 'Não foi possível confirmar. Atualize a central antes de repetir.');
}

/** Carrega uma consulta e a recarrega quando `reload` é chamado ou os parâmetros mudam. */
function useQuery<T>(params: Record<string, string> | null) {
  const key = params ? JSON.stringify(params) : '';
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!params);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      query<T>(JSON.parse(key), controller.signal)
        .then(result => {if (!controller.signal.aborted) {setData(result); setError('');}})
        .catch(cause => {if (!controller.signal.aborted) setError(errorText(cause, 'Não foi possível carregar a central.'));})
        .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    }, 0);
    return () => {window.clearTimeout(timer); controller.abort();};
  }, [key, version]);
  const reload = useCallback(() => setVersion(current => current + 1), []);
  return {data: key ? data : null, error, loading, reload};
}

export default function WhatsappCentral({displayName, accessTitle}: {displayName: string; accessTitle: string}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [chatId, setChatId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const overview = useQuery<Overview>({view: 'overview'});
  const reloadOverview = overview.reload;
  // A central acompanha conversas em andamento: atualiza o resumo a cada minuto com a aba visível.
  useEffect(() => {
    const timer = window.setInterval(() => {if (document.visibilityState === 'visible') reloadOverview();}, 60000);
    return () => window.clearInterval(timer);
  }, [reloadOverview]);
  const done = useCallback((message: string) => {setNotice(message); reloadOverview();}, [reloadOverview]);
  const data = overview.data, totals = data?.totals;
  const tabs: [Tab, string, number | undefined][] = [['overview', 'Visão geral', undefined], ['chats', 'Grupos', totals?.monitored_chats], ['requests', 'Solicitações', totals?.open_requests], ['outbox', 'Envios', totals?.queued_outbox]];

  return <>
    <header className="topbar">
      <a className="brand" href="/"><img src="/mobiliza-logo-0cff20bedde7.jpeg" width={48} height={48} alt="Mobiliza Facilities"/><span>MOBILIZA GESTÃO<br/><strong>Central do WhatsApp</strong></span></a>
      <span className="clean-header-label">{accessTitle} · {displayName}</span>
    </header>
    <main className="shell work-orders-shell wa-shell">
      <a className="nav-back" href="/"><ArrowLeft size={19}/>Voltar ao painel</a>
      <section className="page-title">
        <div><div className="eyebrow">ATENDIMENTO</div><h1>Central do WhatsApp</h1><p>Grupos acompanhados, solicitações detectadas, resumos do dia e envios, registrados pelo n8n a partir do WAHA.</p></div>
        <button className="button secondary" type="button" disabled={overview.loading} onClick={() => {setNotice(''); reloadOverview();}}><RefreshCw size={18}/>Atualizar</button>
      </section>
      {notice && <p className="visit-success" role="status">{notice}</p>}
      {overview.error && <p className="error" role="alert">{overview.error}</p>}
      <nav className="wa-tabs" aria-label="Seções da central">
        {tabs.map(([id, label, count]) => <button key={id} type="button" className={'button ' + (tab === id ? '' : 'secondary')} aria-current={tab === id ? 'page' : undefined} onClick={() => {setTab(id); setChatId(null); setNotice('');}}>{label}{count ? <span className="wa-count">{count}</span> : null}</button>)}
      </nav>
      {!data ? <section className="panel"><p role="status">{overview.loading ? 'Carregando a central…' : 'Central indisponível.'}</p></section>
        : chatId ? <ChatPanel key={chatId} id={chatId} properties={data.properties} onClose={() => setChatId(null)} onDone={done}/>
          : tab === 'overview' ? <OverviewPanel data={data} onOpenChat={setChatId} onTab={setTab}/>
            : tab === 'chats' ? <ChatsPanel data={data} onOpenChat={setChatId}/>
              : tab === 'requests' ? <RequestsPanel onDone={done} onOpenChat={setChatId}/>
                : <OutboxPanel onDone={done}/>}
    </main>
  </>;
}

function OverviewPanel({data, onOpenChat, onTab}: {data: Overview; onOpenChat: (id: string) => void; onTab: (tab: Tab) => void}) {
  const {totals} = data;
  const capture = totals.last_capture_at ? 'Última mensagem recebida em ' + dateTime(totals.last_capture_at) + '.' : 'Nenhuma mensagem recebida ainda. Confira se os fluxos do n8n estão ativos e se há grupos acompanhados.';
  return <>
    <section className="wa-cards" aria-label="Indicadores">
      <article className="panel wa-card"><Users size={22}/><strong>{totals.monitored_chats}</strong><span>{totals.monitored_chats === 1 ? 'grupo acompanhado' : 'grupos acompanhados'}</span></article>
      <article className="panel wa-card"><MessageCircle size={22}/><strong>{totals.messages_today}</strong><span>{totals.messages_today === 1 ? 'mensagem hoje' : 'mensagens hoje'}</span></article>
      <article className="panel wa-card"><ClipboardList size={22}/><strong>{totals.open_requests}</strong><span>{totals.open_requests === 1 ? 'solicitação aberta' : 'solicitações abertas'}{totals.urgent_requests ? ' · ' + count(totals.urgent_requests, 'urgente', 'urgentes') : ''}</span></article>
      <article className="panel wa-card"><Send size={22}/><strong>{totals.queued_outbox}</strong><span>{totals.queued_outbox === 1 ? 'envio na fila' : 'envios na fila'}{totals.failed_outbox ? ' · ' + count(totals.failed_outbox, 'falha', 'falhas') + ' em 24 h' : ''}</span></article>
    </section>
    <p className="clean-access-note">{capture}{totals.pending_analysis ? ' ' + count(totals.pending_analysis, 'mensagem aguarda', 'mensagens aguardam') + ' análise.' : ''} O texto das mensagens é apagado após {data.retention_days} dias.</p>
    {totals.monitored_chats === 0 && <section className="panel"><div className="empty"><h3>Nenhum grupo acompanhado</h3><p>Depois que o n8n sincronizar os grupos do WAHA, um administrador escolhe na aba Grupos quais serão registrados.</p><button type="button" className="button secondary" onClick={() => onTab('chats')}>Ver grupos</button></div></section>}
    <section className="panel">
      <div className="section-heading"><h2>Resumos recentes</h2></div>
      {!data.summaries.length ? <p className="muted">Os resumos aparecem aqui depois da primeira análise diária do n8n.</p>
        : data.summaries.map(summary => <SummaryCard key={summary.id} summary={summary} onOpenChat={onOpenChat}/>)}
    </section>
  </>;
}

function SummaryCard({summary, onOpenChat}: {summary: WhatsappSummary; onOpenChat?: (id: string) => void}) {
  return <article className="wa-item">
    <div className="section-heading"><div><h3>{summary.chat_name}</h3><p className="muted">{dayText(summary.day)} · {count(summary.message_count, 'mensagem', 'mensagens')} · {count(summary.participant_count, 'participante', 'participantes')} · {count(summary.request_count, 'solicitação', 'solicitações')}</p></div><span className={'pill ' + (summary.sentiment === 'negative' ? 'danger' : summary.sentiment === 'positive' ? 'ok' : 'neutral')}>{SENTIMENT_LABELS[summary.sentiment]}</span></div>
    <p className="wa-text">{summary.summary}</p>
    {!!summary.topics.length && <p className="wa-topics">{summary.topics.map(topic => <span key={topic} className="pill neutral">{topic}</span>)}</p>}
    {onOpenChat && <div className="form-actions"><button type="button" className="button secondary" onClick={() => onOpenChat(summary.chat_id)}>Abrir grupo</button></div>}
  </article>;
}

function ChatsPanel({data, onOpenChat}: {data: Overview; onOpenChat: (id: string) => void}) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const chats = data.chats.filter(chat => !term || chat.name.toLowerCase().includes(term) || (chat.property_name || '').toLowerCase().includes(term));
  return <section className="panel">
    <div className="section-heading"><h2>Grupos</h2></div>
    <label className="field"><span>Buscar grupo ou imóvel</span><input type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)}/></label>
    {data.chats_limited && <p className="clean-access-note">Exibindo os 300 primeiros grupos.</p>}
    {!data.chats.length ? <div className="empty"><h3>Nenhum grupo sincronizado</h3><p>Ative o fluxo “Central WhatsApp · Sincronizar grupos” no n8n para listar os grupos da conta.</p></div>
      : !chats.length ? <p className="muted">Nenhum grupo neste filtro.</p>
        : chats.map(chat => <article key={chat.id} className="wa-item">
          <div className="section-heading"><div><h3>{chat.name}</h3><p className="muted">{[chat.property_name, chat.participants_count ? chat.participants_count + ' participantes' : '', chat.last_message_at ? 'última mensagem ' + dateTime(chat.last_message_at) : ''].filter(Boolean).join(' · ') || 'Sem mensagens registradas'}</p></div><span className={'pill ' + (chat.monitored ? 'ok' : 'neutral')}>{chat.monitored ? 'Acompanhado' : 'Não registrado'}</span></div>
          <div className="form-actions"><button type="button" className="button secondary" onClick={() => onOpenChat(chat.id)}>{chat.monitored ? 'Abrir conversa' : 'Configurar'}</button>{chat.monitored ? <span className="muted">{count(chat.messages_24h, 'mensagem', 'mensagens')} em 24 h · {count(chat.open_requests, 'solicitação aberta', 'solicitações abertas')}</span> : null}</div>
        </article>)}
  </section>;
}

function ChatPanel({id, properties, onClose, onDone}: {id: string; properties: {id: string; name: string}[]; onClose: () => void; onDone: (message: string) => void}) {
  const {data, error, loading, reload} = useQuery<ChatData>({view: 'chat', id});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [consent, setConsent] = useState(false);
  const requestId = useRef('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {heading.current?.focus();}, []);

  async function run(body: Record<string, unknown>, message: string) {
    if (busy) return false;
    setBusy(true);
    setFailure('');
    try {
      await act(body);
      onDone(message);
      reload();
      return true;
    } catch (cause) {
      setFailure(errorText(cause, 'Não foi possível confirmar.'));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    // O mesmo identificador é reutilizado em uma nova tentativa, para a mensagem não entrar duas vezes na fila.
    if (!requestId.current) requestId.current = crypto.randomUUID();
    if (await run({action: 'send', chat_id: id, body: text, request_id: requestId.current}, 'Mensagem colocada na fila de envio.')) {setText(''); requestId.current = '';}
  }
  const chat = data?.chat;
  return <section className="panel wa-chat" aria-busy={loading}>
    <div className="section-heading"><div><h2 ref={heading} tabIndex={-1}>{chat?.name || 'Grupo'}</h2>{chat && <p className="muted">{[chat.property_name, chat.participants_count ? chat.participants_count + ' participantes' : ''].filter(Boolean).join(' · ')}</p>}</div><button type="button" className="button secondary" aria-label="Fechar grupo" onClick={onClose}><X size={18}/></button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {failure && <p className="error" role="alert">{failure}</p>}
    {!data || !chat ? <p role="status">{loading ? 'Carregando grupo…' : 'Grupo indisponível.'}</p> : <>
      {data.can_manage && <fieldset className="wa-settings" disabled={busy}>
        <legend>Configuração</legend>
        {chat.monitored ? <>
          <p className="muted">As mensagens deste grupo são registradas, analisadas e apagadas após 90 dias.</p>
          <button type="button" className="button secondary" onClick={() => {if (window.confirm('Parar de registrar as mensagens deste grupo? O histórico já salvo é mantido até o prazo de retenção.')) void run({action: 'monitor', chat_id: id, monitored: false, expected_revision: chat.revision}, 'Grupo deixou de ser acompanhado.');}}>Parar de acompanhar</button>
        </> : <>
          <label className="confirm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>Os participantes foram avisados de que as mensagens deste grupo serão registradas e analisadas pela gestão.</span></label>
          <button type="button" className="button" disabled={!consent} onClick={() => void run({action: 'monitor', chat_id: id, monitored: true, confirmed: true, expected_revision: chat.revision}, 'Grupo passou a ser acompanhado.')}>Acompanhar este grupo</button>
        </>}
        <label className="field"><span>Imóvel relacionado (opcional)</span><select value={chat.property_id || ''} onChange={event => void run({action: 'link_property', chat_id: id, property_id: event.target.value || null, expected_revision: chat.revision}, 'Imóvel do grupo atualizado.')}><option value="">Nenhum</option>{properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      </fieldset>}
      {!!data.requests.length && <><h3>Solicitações deste grupo</h3>{data.requests.map(request => <RequestCard key={request.id} request={request} onDone={message => {onDone(message); reload();}}/>)}</>}
      {!!data.summaries.length && <details className="wa-details"><summary>Resumos diários ({data.summaries.length})</summary>{data.summaries.map(summary => <SummaryCard key={summary.id} summary={summary}/>)}</details>}
      <h3>Mensagens</h3>
      {!chat.monitored && !data.messages.length ? <p className="muted">Este grupo não é acompanhado; nenhuma mensagem é registrada.</p>
        : !data.messages.length ? <p className="muted">Nenhuma mensagem registrada ainda.</p>
          : <ol className="wa-messages">{[...data.messages].reverse().map(message => <li key={message.id} className={'wa-message ' + message.direction}>
            <p className="muted">{message.direction === 'out' ? 'Mobiliza' + (message.sender_name ? ' · ' + message.sender_name : '') : message.sender_name || 'Participante'} · {dateTime(message.sent_at)}{message.category && message.category !== 'chatter' ? ' · ' + CATEGORY_LABELS[message.category] : ''}{message.is_request ? ' · solicitação' : ''}</p>
            <p className="wa-text">{message.purged_at ? 'Texto apagado pelo prazo de retenção.' : message.body || (message.has_media ? 'Mídia sem texto (não armazenada).' : 'Mensagem sem texto.')}</p>
          </li>)}</ol>}
      {data.has_more && <p className="muted">Exibindo as 100 mensagens mais recentes.</p>}
      {chat.monitored ? <form className="wa-send" onSubmit={send}>
        <label className="field"><span>Enviar mensagem ao grupo</span><textarea rows={3} maxLength={2000} value={text} disabled={busy} onChange={event => {setText(event.target.value); requestId.current = '';}}/><small>A mensagem entra na fila e o n8n envia pelo WAHA em até um minuto, com seu nome registrado.</small></label>
        <div className="form-actions"><button className="button" type="submit" disabled={busy || !text.trim()}><Send size={16}/>{busy ? 'Enviando…' : 'Colocar na fila'}</button></div>
      </form> : null}
    </>}
  </section>;
}

function RequestCard({request, onDone, onOpenChat}: {request: WhatsappRequest; onDone: (message: string) => void; onOpenChat?: (id: string) => void}) {
  const [note, setNote] = useState(request.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function change(status: RequestStatus, message: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await act({action: 'request_status', id: request.id, status, note, expected_revision: request.revision});
      onDone(message);
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível confirmar.'));
    } finally {
      setBusy(false);
    }
  }
  const open = request.status === 'detected' || request.status === 'accepted';
  return <article className="wa-item">
    <div className="section-heading"><div><h3>{CATEGORY_LABELS[request.category]} · {request.chat_name}</h3><p className="muted">{request.requester_name || 'Participante'} · {dateTime(request.created_at)}{request.handled_by_name ? ' · tratada por ' + request.handled_by_name : ''}</p></div><span><span className={'pill ' + urgencyPill[request.urgency]}>Urgência {URGENCY_LABELS[request.urgency].toLowerCase()}</span> <span className={'pill ' + statusPill[request.status]}>{STATUS_LABELS[request.status]}</span></span></div>
    <p className="wa-text">{request.summary}</p>
    <fieldset className="wa-settings" disabled={busy}>
      <label className="field"><span>Observação{open ? ' (obrigatória para descartar)' : ''}</span><textarea rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)}/></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        {request.status === 'detected' && <button type="button" className="button" onClick={() => void change('accepted', 'Solicitação em andamento.')}>Assumir</button>}
        {open && <button type="button" className="button secondary" onClick={() => void change('done', 'Solicitação concluída.')}>Concluir</button>}
        {open && <button type="button" className="button secondary" disabled={!note.trim()} onClick={() => void change('dismissed', 'Solicitação descartada.')}>Descartar</button>}
        {!open && <button type="button" className="button secondary" onClick={() => void change('detected', 'Solicitação reaberta.')}>Reabrir</button>}
        {onOpenChat && <button type="button" className="button secondary" onClick={() => onOpenChat(request.chat_id)}>Abrir grupo</button>}
      </div>
    </fieldset>
  </article>;
}

function RequestsPanel({onDone, onOpenChat}: {onDone: (message: string) => void; onOpenChat: (id: string) => void}) {
  const [status, setStatus] = useState('open');
  const {data, error, loading, reload} = useQuery<RequestsData>({view: 'requests', status});
  return <section className="panel" aria-busy={loading}>
    <div className="section-heading"><h2>Solicitações detectadas</h2></div>
    <label className="field"><span>Situação</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="open">Abertas</option><option value="done">Concluídas</option><option value="dismissed">Descartadas</option><option value="all">Todas</option></select></label>
    <p className="muted">A análise do n8n marca as mensagens que parecem pedidos. Confira antes de assumir: a detecção é automática e pode errar.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!data ? <p role="status">{loading ? 'Carregando solicitações…' : 'Lista indisponível.'}</p>
      : !data.requests.length ? <div className="empty"><h3>Nenhuma solicitação neste filtro</h3></div>
        : data.requests.map(request => <RequestCard key={request.id + ':' + request.revision} request={request} onOpenChat={onOpenChat} onDone={message => {onDone(message); reload();}}/>)}
    {data?.limited && <p className="clean-access-note">Exibindo as 200 primeiras solicitações.</p>}
  </section>;
}

function OutboxPanel({onDone}: {onDone: (message: string) => void}) {
  const {data, error, loading, reload} = useQuery<OutboxData>({view: 'outbox'});
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  async function cancel(id: string) {
    if (busy) return;
    setBusy(id);
    setFailure('');
    try {
      await act({action: 'cancel_send', id});
      onDone('Envio cancelado.');
      reload();
    } catch (cause) {
      setFailure(errorText(cause, 'Não foi possível cancelar.'));
    } finally {
      setBusy('');
    }
  }
  return <section className="panel" aria-busy={loading}>
    <div className="section-heading"><h2>Envios</h2><button type="button" className="button secondary" disabled={loading} onClick={reload}><RefreshCw size={16}/>Atualizar</button></div>
    <p className="muted">Mensagens escritas no painel. O n8n retira da fila a cada minuto; um envio sem confirmação em 10 minutos é marcado como falha e não é repetido sozinho. O texto dos envios finalizados é apagado após 90 dias.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {failure && <p className="error" role="alert">{failure}</p>}
    {!data ? <p role="status">{loading ? 'Carregando envios…' : 'Lista indisponível.'}</p>
      : !data.items.length ? <div className="empty"><h3>Nenhum envio registrado</h3><p>Abra um grupo acompanhado para escrever uma mensagem.</p></div>
        : data.items.map(item => <article key={item.id} className="wa-item">
          <div className="section-heading"><div><h3>{item.chat_name}</h3><p className="muted">{item.created_by_name} · {dateTime(item.created_at)}{item.sent_at ? ' · enviada ' + dateTime(item.sent_at) : ''}</p></div><span className={'pill ' + outboxPill[item.status]}>{OUTBOX_LABELS[item.status]}</span></div>
          <p className="wa-text">{item.purged_at ? 'Texto apagado pelo prazo de retenção.' : item.body}</p>
          {item.error && <p className="error">{item.error}</p>}
          {item.status === 'queued' && <div className="form-actions"><button type="button" className="button secondary" disabled={!!busy} onClick={() => void cancel(item.id)}>Cancelar envio</button></div>}
        </article>)}
  </section>;
}
