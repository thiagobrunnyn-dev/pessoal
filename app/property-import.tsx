'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Native anchors deliberately recheck server access on navigation. */

import {useCallback, useEffect, useId, useRef, useState} from 'react';
import {propertyNumber} from '../lib/property-number';
import './property-import.css';

const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 100;
const API = '/api/property-imports';
type SourceRow = Record<string, unknown>;
export type ImportDocument = {format: 'mbl-properties-v1'; rows: SourceRow[]};
type ImportFields = {
  name: string; address: string; city: string | null; state_code: string | null;
  source_company: string | null; source_slots: number | null; source_delivered_on: string | null;
  source_reference?: string | null;
};
export type ImportRow = {
  row_id: string; position: number; source_key: string; status: 'valid' | 'duplicate' | 'invalid';
  original: SourceRow; normalized: ImportFields;
  issues: {code: string; message: string}[];
  duplicate_of: null | {kind: 'row' | 'property'; id: string; control_number?: number};
  result: {status: 'pending' | 'created' | 'ignored'; property_id: string | null; control_number: number | null};
};
export type ImportBatch = {
  batch_id: string; status: 'preview' | 'completed'; review_hash: string;
  created_at: string; completed_at: string | null;
  summary: {total: number; valid: number; duplicate: number; invalid: number; created: number; ignored: number};
  rows: ImportRow[];
};
type ConfirmRequest = {
  action: 'confirm'; batch_id: string; review_hash: string; selected_row_ids: string[];
  request_id: string; confirmed: true;
};
type RequestFailure = {message: string; stale: boolean; denied: boolean};

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const textOrNull = (value: unknown) => value === null || typeof value === 'string';
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** Local format checks only. The server independently authorizes and validates every row. */
export function readImportDocument(text: string): ImportDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('O arquivo deve ter até 256 KB.');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Não foi possível ler o JSON. Escolha o arquivo de importação preparado.'); }
  if (!isObject(value) || value.format !== 'mbl-properties-v1' || !Array.isArray(value.rows) ||
    !value.rows.length || value.rows.length > MAX_ROWS || !value.rows.every(isObject)) {
    throw new Error('Use um arquivo mbl-properties-v1 com 1 a 100 imóveis.');
  }
  return value as ImportDocument;
}

/** Reject incomplete replies rather than turn unknown data into empty totals or fake codes. */
export function readImportBatch(value: unknown): ImportBatch {
  const unavailable = () => { throw new Error('A resposta da importação está incompleta. Verifique o resultado antes de tentar de novo.'); };
  if (!isObject(value) || !safeId(value.batch_id) || !['preview', 'completed'].includes(String(value.status)) ||
    typeof value.review_hash !== 'string' || !value.review_hash || typeof value.created_at !== 'string' ||
    !textOrNull(value.completed_at) || !isObject(value.summary) || !Array.isArray(value.rows) ||
    !value.rows.length || value.rows.length > MAX_ROWS) return unavailable();
  for (const key of ['total', 'valid', 'duplicate', 'invalid', 'created', 'ignored']) {
    const count = value.summary[key];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return unavailable();
  }
  const ids = new Set<string>();
  for (const row of value.rows) {
    if (!isObject(row) || !safeId(row.row_id) || ids.has(row.row_id) ||
      !Number.isSafeInteger(row.position) || typeof row.source_key !== 'string' ||
      !['valid', 'duplicate', 'invalid'].includes(String(row.status)) || !isObject(row.original) ||
      !isObject(row.normalized) || !isObject(row.result) || !Array.isArray(row.issues)) return unavailable();
    ids.add(row.row_id);
    const fields = row.normalized;
    if (typeof fields.name !== 'string' || typeof fields.address !== 'string' ||
      !textOrNull(fields.city) || !textOrNull(fields.state_code) || !textOrNull(fields.source_company) ||
      !textOrNull(fields.source_delivered_on) ||
      !(fields.source_reference === undefined || textOrNull(fields.source_reference)) ||
      !(fields.source_slots === null || (typeof fields.source_slots === 'number' && Number.isFinite(fields.source_slots))) ||
      !row.issues.every(issue => isObject(issue) && typeof issue.code === 'string' && typeof issue.message === 'string') ||
      !['pending', 'created', 'ignored'].includes(String(row.result.status))) return unavailable();
    if (row.duplicate_of !== null && (!isObject(row.duplicate_of) ||
      !['row', 'property'].includes(String(row.duplicate_of.kind)) || !safeId(row.duplicate_of.id))) return unavailable();
    if (row.result.status === 'created' && (!safeId(row.result.property_id) || !propertyNumber(row.result.control_number))) return unavailable();
    if (value.status === 'preview' && row.result.status !== 'pending') return unavailable();
    if (value.status === 'completed' && row.result.status === 'pending') return unavailable();
  }
  if (value.summary.total !== value.rows.length) return unavailable();
  return value as ImportBatch;
}

function describeFailure(error: unknown): RequestFailure {
  if (isObject(error) && typeof error.message === 'string') return {
    message: error.message, stale: error.stale === true, denied: error.denied === true,
  };
  return {message: 'Não foi possível confirmar a resposta. Tente novamente com a mesma solicitação.', stale: false, denied: false};
}

async function readResponse(response: Response): Promise<ImportBatch> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const stale = response.status === 409 && isObject(value) && value.code === 'review_stale';
    const denied = response.status === 401 || response.status === 403;
    throw {
      stale, denied,
      message: denied ? 'Seu acesso à importação não pôde ser confirmado. Entre novamente com um perfil autorizado.'
        : stale ? 'Os cadastros mudaram desde esta revisão. Prepare uma nova prévia e confira a seleção antes de confirmar.'
        : isObject(value) && typeof value.error === 'string' ? value.error
        : 'Não foi possível confirmar a resposta. Tente novamente com a mesma solicitação.',
    };
  }
  return readImportBatch(value);
}

/** A timeout leaves the outcome unknown. Callers keep the same batch and request IDs. */
async function requestImport(url: string, init: RequestInit, controller = new AbortController()) {
  const timer = window.setTimeout(() => controller.abort(), 25000);
  try { return await readResponse(await fetch(url, {...init, signal: controller.signal})); }
  catch (cause) {
    if (controller.signal.aborted) throw {message: 'A resposta demorou mais do que o esperado. Verifique o resultado ou tente novamente com a mesma solicitação.', stale: false, denied: false};
    throw cause;
  } finally { window.clearTimeout(timer); }
}

function setBatchUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('batch', id); else url.searchParams.delete('batch');
  // Only the opaque batch ID enters history. The document stays in memory.
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function sourceDate(value: string | null) {
  if (!value) return 'Não informada';
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : value;
}

export default function PropertyImport({initialBatchId = ''}: {initialBatchId?: string}) {
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<'read' | 'preview' | 'confirm' | null>(initialBatchId ? 'read' : null);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [denied, setDenied] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [recoveryBatchId, setRecoveryBatchId] = useState(initialBatchId);
  const fileInput = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const documentRef = useRef<ImportDocument | null>(null);
  const previewRequestId = useRef('');
  const confirmRequest = useRef<ConfirmRequest | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const id = useId();

  const acceptBatch = useCallback((next: ImportBatch, preserveSelection = false) => {
    setBatch(next);
    setRecoveryBatchId(next.batch_id);
    setBatchUrl(next.batch_id);
    setSelected(previous => preserveSelection
      ? previous.filter(rowId => next.rows.some(row => row.row_id === rowId && row.status === 'valid'))
      : next.rows.filter(row => row.status === 'valid').map(row => row.row_id));
    setAcknowledged(false);
    setStale(false);
    setDenied(false);
    if (next.status === 'completed') {
      setUncertain(false);
      confirmRequest.current = null;
    }
  }, []);

  const loadBatch = useCallback(async (batchId: string) => {
    if (inFlight.current) return;
    if (!safeId(batchId)) { setError('Esta referência de importação é inválida.'); setBusy(null); return; }
    inFlight.current = true;
    setBusy('read'); setError('');
    const token = ++generation.current;
    const controller = new AbortController();
    readController.current = controller;
    try {
      const next = await requestImport(`${API}?id=${encodeURIComponent(batchId)}`, {
        credentials: 'same-origin', cache: 'no-store',
      }, controller);
      if (!active.current || token !== generation.current) return;
      acceptBatch(next, confirmRequest.current !== null);
      if (next.status === 'preview' && confirmRequest.current) {
        setError('A confirmação ainda não tem um resultado final. Você pode repetir a mesma confirmação com segurança.');
      }
    } catch (failure) {
      if (!active.current || token !== generation.current) return;
      const problem = describeFailure(failure);
      setError(problem.message); setDenied(problem.denied);
    } finally {
      if (active.current && token === generation.current) { inFlight.current = false; setBusy(null); }
    }
  }, [acceptBatch]);

  useEffect(() => {
    const requests = generation, controller = readController;
    active.current = true;
    let mounted = true;
    queueMicrotask(() => { if (mounted && initialBatchId) void loadBatch(initialBatchId); });
    return () => {
      mounted = false; active.current = false; requests.current++;
      controller.current?.abort(); inFlight.current = false;
    };
  }, [initialBatchId, loadBatch]);

  useEffect(() => { reviewHeading.current?.focus(); }, [batch?.batch_id, batch?.status]);
  useEffect(() => { if (error) { errorSummary.current?.focus({preventScroll: true}); errorSummary.current?.scrollIntoView({block: 'center'}); } }, [error]);

  // Native Back/Forward navigation returns to the server-authorized batch view.
  useEffect(() => {
    const onHistory = () => window.location.reload();
    window.addEventListener('popstate', onHistory);
    return () => window.removeEventListener('popstate', onHistory);
  }, []);

  function chooseFile(next: File | null) {
    if (inFlight.current || uncertain) return;
    // Closing the native picker preserves a previously chosen file and preview.
    if (!next) return;
    if (next.size > MAX_BYTES) { setError('O arquivo deve ter até 256 KB.'); return; }
    setFile(next); setBatch(null); setSelected([]); setAcknowledged(false);
    documentRef.current = null; previewRequestId.current = ''; confirmRequest.current = null;
    setRecoveryBatchId(''); setStale(false); setDenied(false); setError(''); setBatchUrl(null);
  }

  async function preparePreview() {
    if (inFlight.current || uncertain || denied) return;
    inFlight.current = true; setBusy('preview'); setError(''); setAcknowledged(false);
    const token = ++generation.current;
    try {
      let document = documentRef.current;
      if (!document && file) {
        if (file.size > MAX_BYTES) throw new Error('O arquivo deve ter até 256 KB.');
        const bytes = await file.arrayBuffer();
        let text: string;
        try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
        catch { throw new Error('O arquivo precisa estar em UTF-8. Escolha o JSON preparado.'); }
        document = readImportDocument(text);
      }
      if (!document && batch) document = {format: 'mbl-properties-v1', rows: [...batch.rows].sort((a, b) => a.position - b.position).map(row => row.original)};
      if (!document) throw new Error('Escolha primeiro o arquivo JSON preparado.');
      if (!active.current || token !== generation.current) return;
      documentRef.current = document;
      if (!previewRequestId.current) previewRequestId.current = crypto.randomUUID();
      const next = await requestImport(API, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'preview', request_id: previewRequestId.current, document}),
      });
      if (!active.current || token !== generation.current) return;
      confirmRequest.current = null; acceptBatch(next); setUncertain(false);
    } catch (failure) {
      if (!active.current || token !== generation.current) return;
      const problem = describeFailure(failure);
      setError(problem.message); setDenied(problem.denied);
    } finally {
      if (active.current && token === generation.current) { inFlight.current = false; setBusy(null); }
    }
  }

  async function confirmImport() {
    if (inFlight.current || !batch || batch.status !== 'preview' || stale || denied) return;
    if (!confirmRequest.current) {
      if (!acknowledged || !selected.length) return;
      const available = new Set(batch.rows.filter(row => row.status === 'valid').map(row => row.row_id));
      if (!selected.every(rowId => available.has(rowId))) return;
      confirmRequest.current = {action: 'confirm', batch_id: batch.batch_id, review_hash: batch.review_hash,
        selected_row_ids: [...selected], request_id: crypto.randomUUID(), confirmed: true};
    }
    inFlight.current = true; setBusy('confirm'); setError('');
    const token = ++generation.current;
    try {
      const next = await requestImport(API, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(confirmRequest.current),
      });
      if (!active.current || token !== generation.current) return;
      if (next.status !== 'completed') throw new Error('A confirmação ainda não tem um resultado final. Verifique o resultado.');
      acceptBatch(next); setUncertain(false);
    } catch (failure) {
      if (!active.current || token !== generation.current) return;
      const problem = describeFailure(failure);
      setError(problem.message); setStale(problem.stale); setDenied(problem.denied);
      setAcknowledged(false);
      if (problem.stale) { confirmRequest.current = null; previewRequestId.current = ''; setUncertain(false); }
      else setUncertain(true);
    } finally {
      if (active.current && token === generation.current) { inFlight.current = false; setBusy(null); }
    }
  }

  function reset() {
    if (inFlight.current || uncertain) return;
    setFile(null); setBatch(null); setSelected([]); setAcknowledged(false); setError('');
    setStale(false); setDenied(false); documentRef.current = null; previewRequestId.current = '';
    confirmRequest.current = null; setRecoveryBatchId(''); setBatchUrl(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  const completed = batch?.status === 'completed';
  const validRows = batch?.rows.filter(row => row.status === 'valid') ?? [];
  const selectedRows = validRows.filter(row => selected.includes(row.row_id));
  const missingState = selectedRows.filter(row => !row.normalized.state_code).length;
  const createdRows = batch?.rows.filter(row => row.result.status === 'created') ?? [];
  const locked = !!busy || stale || denied || uncertain;

  return <div className="property-import" aria-busy={!!busy}>
    <div className="pi-intro">
      <p>Escolha o arquivo preparado, confira cada imóvel e confirme a seleção.</p>
      <p className="pi-muted">A prévia é privada. Os imóveis só são cadastrados quando você confirma.</p>
    </div>

    {error && <div ref={errorSummary} tabIndex={-1} className="pi-alert" role="alert"><p>{error}</p>
      {denied && <a className="pi-link" href="/imoveis/importar">Entrar novamente</a>}
    </div>}
    <p className="pi-status" role="status" aria-live="polite">{busy === 'read' ? 'Recuperando importação…'
      : busy === 'preview' ? 'Preparando prévia privada…' : busy === 'confirm' ? 'Confirmando os imóveis selecionados…' : ''}</p>

    {!batch && <section className="pi-panel" aria-labelledby={`${id}-upload`}>
      <h2 id={`${id}-upload`}>1. Escolher arquivo</h2>
      <p className="pi-muted">JSON preparado · até 100 imóveis · até 256 KB</p>
      <label className="pi-file-label" htmlFor={`${id}-file`}>Arquivo de imóveis</label>
      <input ref={fileInput} id={`${id}-file`} type="file" accept=".json,application/json" disabled={!!busy || uncertain}
        aria-describedby={`${id}-file-help`} onChange={event => chooseFile(event.target.files?.[0] ?? null)}/>
      <p id={`${id}-file-help`} className="pi-hint">{file ? `Selecionado: ${file.name}` : 'Selecionar um arquivo ainda não envia seu conteúdo.'}</p>
      <div className="pi-actions">
        <button className="button" type="button" disabled={!file || !!busy || denied} onClick={() => void preparePreview()}>Preparar prévia</button>
        {file && <button className="button secondary" type="button" disabled={!!busy} onClick={reset}>Cancelar seleção</button>}
        {recoveryBatchId && <button className="button secondary" type="button" disabled={!!busy} onClick={() => void loadBatch(recoveryBatchId)}>Tentar recuperar prévia</button>}
      </div>
    </section>}

    {batch && <>
      <section className={`pi-panel${completed ? ' pi-success' : ''}`} aria-labelledby={`${id}-review`}>
        <div className="pi-heading">
          <h2 ref={reviewHeading} tabIndex={-1} id={`${id}-review`}>{completed ? 'Importação concluída' : '2. Conferir os imóveis'}</h2>
          <span className="pi-badge">{batch.rows.length} no arquivo</span>
        </div>
        {completed ? <>
          <p><strong>{createdRows.length} {createdRows.length === 1 ? 'imóvel cadastrado' : 'imóveis cadastrados'}.</strong> Os códigos abaixo foram gerados pelo sistema.</p>
          {batch.rows.length > createdRows.length && <p className="pi-muted">{batch.rows.length - createdRows.length} {batch.rows.length - createdRows.length === 1 ? 'linha não foi importada' : 'linhas não foram importadas'}. A origem continua preservada nesta prévia.</p>}
        </> : <>
          <p>Confira nomes, endereços e UF. Desmarque o que quiser deixar para depois.</p>
          <div className="pi-counts" aria-label="Resumo da prévia">
            <span>{validRows.length} disponíveis</span>
            <span>{batch.rows.filter(row => row.status === 'duplicate').length} duplicados</span>
            <span>{batch.rows.filter(row => row.status === 'invalid').length} com dados inválidos</span>
          </div>
          {validRows.length > 0 && <label className="pi-check pi-select-all">
            <input type="checkbox" checked={selected.length === validRows.length} disabled={locked}
              onChange={event => { setSelected(event.target.checked ? validRows.map(row => row.row_id) : []); setAcknowledged(false); }}/>
            <span>Selecionar todos os disponíveis</span>
          </label>}
        </>}
        <p className="pi-source-note">Empresa, vagas e data do arquivo ficam apenas como referência privada da origem. Esta importação não cria entregas nem vínculos automáticos.</p>
      </section>

      <div className="pi-cards">
        {batch.rows.map(row => {
          const created = row.result.status === 'created';
          const ignored = completed && row.result.status === 'ignored' && row.status === 'valid';
          const propertyId = row.result.property_id;
          const propertyCode = propertyNumber(row.result.control_number);
          return <article key={row.row_id} className={`pi-card pi-card-${row.status}`} aria-labelledby={`${id}-${row.row_id}`}>
            <div className="pi-card-top"><span className="pi-muted">Linha {row.position}</span>
              <span className={`pi-badge pi-badge-${created ? 'created' : ignored ? 'ignored' : row.status}`}>
                {created ? 'Cadastrado' : ignored ? 'Não selecionado' : row.status === 'valid' ? 'Disponível' : row.status === 'duplicate' ? 'Duplicado' : 'Revisar dados'}
              </span>
            </div>
            <h3 id={`${id}-${row.row_id}`}>{row.normalized.name || 'Nome não informado'}</h3>
            {!completed && <label className="pi-check">
              <input type="checkbox" checked={selected.includes(row.row_id)} disabled={locked || row.status !== 'valid'}
                aria-label={`Importar ${row.normalized.name || `linha ${row.position}`}`} onChange={event => {
                  const checked = event.target.checked;
                  setSelected(previous => checked ? [...previous, row.row_id] : previous.filter(rowId => rowId !== row.row_id));
                  setAcknowledged(false);
                }}/>
              <span>{row.status === 'valid' ? 'Importar este imóvel' : 'Indisponível para importar'}</span>
            </label>}
            <dl className="pi-fields">
              <div><dt>Endereço</dt><dd>{row.normalized.address || 'Não informado'}</dd></div>
              <div><dt>Cidade</dt><dd>{row.normalized.city || 'Não informada'}</dd></div>
              <div><dt>Estado (UF)</dt><dd>{row.normalized.state_code || <span className="pi-badge pi-badge-warning">UF a confirmar</span>}</dd></div>
            </dl>
            {!!row.issues.length && <ul className="pi-issues">{row.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>}
            {row.status === 'duplicate' && <p className="pi-duplicate">{row.duplicate_of?.kind === 'property'
              ? <>Este imóvel já tem cadastro. <a className="pi-link" href={`/imoveis/${encodeURIComponent(row.duplicate_of.id)}`}>{propertyNumber(row.duplicate_of.control_number) ? `Abrir imóvel ${propertyNumber(row.duplicate_of.control_number)}` : 'Abrir cadastro existente'}</a></>
              : 'Este imóvel repete outra linha do arquivo. Confira a linha original antes de importar.'}</p>}
            <details className="pi-source"><summary>Ver dados da origem</summary>
              <dl className="pi-fields">
                <div><dt>Empresa na origem</dt><dd>{row.normalized.source_company || 'Não informada'}</dd></div>
                <div><dt>Vagas na origem</dt><dd>{row.normalized.source_slots ?? 'Não informadas'}</dd></div>
                <div><dt>Data na origem</dt><dd>{sourceDate(row.normalized.source_delivered_on)}</dd></div>
                {row.normalized.source_reference && <div><dt>Referência</dt><dd>{row.normalized.source_reference}</dd></div>}
              </dl>
              <p className="pi-hint">Esses dados ficam preservados para consulta. A data não será registrada como entrega.</p>
            </details>
            {created && propertyId && <div className="pi-created"><strong>Imóvel {propertyCode}</strong>
              <a className="button secondary" href={`/imoveis/${encodeURIComponent(propertyId)}`}>Abrir imóvel {propertyCode}</a>
            </div>}
          </article>;
        })}
      </div>

      {completed ? <section className="pi-panel pi-finish">
        <p>Dados complementares podem ser preenchidos em Editar imóvel.</p>
        <div className="pi-actions"><a className="button" href="/imoveis">Ver imóveis</a>
          <button type="button" className="button secondary" onClick={reset}>Escolher outro arquivo</button></div>
      </section> : <section className="pi-panel pi-confirm" aria-labelledby={`${id}-confirm`}>
        <h2 id={`${id}-confirm`}>3. Confirmar seleção</h2>
        <p><strong>{selectedRows.length} {selectedRows.length === 1 ? 'imóvel selecionado' : 'imóveis selecionados'}</strong> de {validRows.length} disponíveis.</p>
        {!selectedRows.length && <p className="pi-hint">Selecione pelo menos um imóvel disponível para continuar.</p>}
        {missingState > 0 && <p className="pi-warning">{missingState} {missingState === 1 ? 'imóvel ficará com a UF a confirmar' : 'imóveis ficarão com a UF a confirmar'}. Nenhum estado será presumido.</p>}
        <label className="pi-check pi-acknowledgement">
          <input type="checkbox" checked={acknowledged} disabled={locked || !selectedRows.length}
            onChange={event => setAcknowledged(event.target.checked)}/>
          <span>Conferi os {selectedRows.length} imóveis selecionados{missingState ? `, incluindo ${missingState} com UF a confirmar` : ''}. Entendo que empresa, vagas e data ficam como origem privada, sem entregas ou vínculos automáticos.</span>
        </label>
        <div className="pi-actions">
          {stale ? <button className="button" type="button" disabled={!!busy || denied} onClick={() => void preparePreview()}>Preparar nova prévia</button>
            : uncertain ? <>
              <button className="button" type="button" disabled={!!busy || denied} onClick={() => void loadBatch(batch.batch_id)}>Verificar resultado</button>
              <button className="button secondary" type="button" disabled={!!busy || denied} onClick={() => void confirmImport()}>Repetir a mesma confirmação</button>
            </> : <button className="button" type="button" disabled={locked || !acknowledged || !selectedRows.length} onClick={() => void confirmImport()}>
              {busy === 'confirm' ? 'Confirmando…' : `Confirmar ${selectedRows.length} ${selectedRows.length === 1 ? 'imóvel' : 'imóveis'}`}
            </button>}
          <button className="button secondary" type="button" disabled={!!busy || uncertain} onClick={reset}>Cancelar prévia</button>
        </div>
        {uncertain && <p className="pi-hint">A seleção foi mantida. Verifique o resultado ou repita a mesma solicitação para evitar uma confirmação diferente.</p>}
        <p className="pi-hint">Os códigos definitivos aparecem após a confirmação. O que não foi selecionado continua neste registro de origem.</p>
      </section>}
    </>}
  </div>;
}
