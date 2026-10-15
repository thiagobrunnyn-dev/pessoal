'use client';

import {useCallback, useEffect, useId, useRef, useState} from 'react';
import {clientDisplayName} from '../../lib/client-types';

export type CatalogStatus = 'loading' | 'ready' | 'error';
export type CatalogClient = {id: string; name: string; entity_type: string};
export type CatalogCenter = {id: string; client_id: string; name: string};
type Catalog = {clients: CatalogClient[]; costCenters: CatalogCenter[]; regional: boolean};

export type ClientCatalogSelectorProps = {
  clientId: string;
  centerId: string;
  onClientChange: (id: string) => void;
  onCenterChange: (id: string) => void;
  clientFieldName?: string;
  centerFieldName?: string;
  required?: boolean;
  disabled?: boolean;
  refreshKey?: number | string;
  /** Keep false only in a browsing/filter panel that may stop at the company. */
  requireCenterWhenClientSelected?: boolean;
  /** Only pass the original, server-authorized binding when editing that record. */
  historicalCenter?: CatalogCenter | null;
  historicalClient?: {id: string; name: string; entity_type?: string} | null;
  onStatusChange?: (status: CatalogStatus) => void;
};

function readCatalog(value: unknown): Catalog {
  if (!value || typeof value !== 'object') throw new Error('Catálogo indisponível.');
  const data = value as Partial<Catalog>;
  const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  if (!Array.isArray(data.clients) || !Array.isArray(data.costCenters) || typeof data.regional !== 'boolean' ||
    !data.clients.every(row => row && hasText(row.id) && hasText(row.name) && typeof row.entity_type === 'string') ||
    !data.costCenters.every(row => row && hasText(row.id) && hasText(row.client_id) && hasText(row.name))) {
    throw new Error('Catálogo indisponível.');
  }
  const clientIds = new Set(data.clients.map(row => row.id));
  if (clientIds.size !== data.clients.length || new Set(data.costCenters.map(row => row.id)).size !== data.costCenters.length ||
    data.costCenters.some(row => !clientIds.has(row.client_id))) throw new Error('Catálogo indisponível.');
  return data as Catalog;
}

/** Mount inside the form/panel opened by the user; no data is shared between instances. */
export default function ClientCatalogSelector({
  clientId, centerId, onClientChange, onCenterChange,
  clientFieldName = 'client_id', centerFieldName = 'cost_center_id',
  required = false, disabled = false, refreshKey, requireCenterWhenClientSelected = true,
  historicalCenter, historicalClient, onStatusChange,
}: ClientCatalogSelectorProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [requestStatus, setRequestStatus] = useState<CatalogStatus>('loading');
  const [requestError, setRequestError] = useState('');
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const statusListener = useRef(onStatusChange);
  const clientSelect = useRef<HTMLSelectElement>(null);
  const centerSelect = useRef<HTMLSelectElement>(null);
  const id = useId();

  const load = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setRequestStatus('loading');
    setRequestError('');
    try {
      const response = await fetch('/api/client-catalog', {
        cache: 'no-store', credentials: 'same-origin', signal: request.signal,
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403
        ? 'Seu acesso ao catálogo não pôde ser confirmado.'
        : 'Não foi possível carregar as empresas e os centros de custo.');
      const next = readCatalog(await response.json());
      if (request.signal.aborted || current !== generation.current) return;
      setCatalog(next);
      setRequestStatus('ready');
    } catch (error) {
      if (request.signal.aborted || current !== generation.current) return;
      setRequestError(error instanceof Error ? error.message : 'Não foi possível carregar o catálogo.');
      setRequestStatus('error');
    }
  }, []);

  useEffect(() => {
    const requests = generation, activeController = controller;
    let active = true;
    // Starting after commit also lets Strict Mode dispose its first effect
    // without issuing a redundant request for a form that is already gone.
    queueMicrotask(() => { if (active) void load(); });
    return () => {
      active = false;
      requests.current++;
      activeController.current?.abort();
    };
  }, [load, refreshKey]);

  const clients = catalog?.clients ?? [];
  const centers = clientId ? (catalog?.costCenters ?? []).filter(row => row.client_id === clientId) : [];
  const selectedClient = clients.find(row => row.id === clientId);
  const selectedCenter = centers.find(row => row.id === centerId);
  const keepingHistory = !!historicalCenter && !!clientId && !!centerId &&
    historicalCenter.id === centerId && historicalCenter.client_id === clientId;
  const historicalOption = keepingHistory && !selectedCenter ? historicalCenter : null;
  const historicalCompany = keepingHistory && historicalClient?.id === clientId ? historicalClient : null;
  const checked = requestStatus === 'ready';
  const clientIssue = checked && clientId && !selectedClient && !keepingHistory
    ? 'A empresa selecionada não está disponível. Escolha outra empresa.'
    : checked && centerId && !clientId ? 'Escolha a empresa correspondente ao centro de custo.' : '';
  const centerIssue = checked && centerId && !selectedCenter && !keepingHistory
    ? 'O centro de custo selecionado não está disponível para esta empresa. Escolha outra opção.'
    : checked && clientId && !centerId && requireCenterWhenClientSelected
      ? 'Selecione um centro de custo / obra para concluir o vínculo com esta empresa.' : '';
  const status: CatalogStatus = requestStatus === 'loading' ? 'loading'
    : requestStatus === 'error' || clientIssue || centerIssue ? 'error' : 'ready';
  const fieldsDisabled = disabled || requestStatus !== 'ready';

  // Callback identity changes must not reload data or create notification/render loops.
  useEffect(() => { statusListener.current = onStatusChange; }, [onStatusChange]);
  useEffect(() => { statusListener.current?.(status); }, [status]);
  useEffect(() => { clientSelect.current?.setCustomValidity(clientIssue); }, [clientIssue]);
  useEffect(() => { centerSelect.current?.setCustomValidity(centerIssue); }, [centerIssue]);

  const centerHint = requestStatus === 'loading' ? 'Carregando opções…'
    : requestStatus === 'error' ? 'Atualize as opções para continuar.'
    : !clientId ? 'Selecione primeiro a empresa.'
    : !centers.length && !historicalOption ? `Nenhum centro de custo / obra disponível para esta empresa.${centerIssue ? ` ${centerIssue}` : ''}`
    : centerIssue || (historicalOption
      ? `${historicalOption.name} · Vínculo histórico deste registro; indisponível para novos vínculos.`
      : selectedCenter?.name || (centers.length ? 'As opções pertencem à empresa selecionada.' : 'Nenhum centro de custo / obra disponível para esta empresa.'));

  const clientHint = clientIssue || (checked && !clients.length && !keepingHistory ? 'Nenhuma empresa disponível.' : '');

  return <div className="client-catalog-selector" aria-busy={requestStatus === 'loading'}>
    <div className="two-col client-catalog-fields">
      <label className="field" style={{minWidth: 0}}>
        <span>Empresa {required ? '' : '(opcional)'}</span>
        <select ref={clientSelect} name={clientFieldName} value={clientId} required={required}
          disabled={fieldsDisabled} aria-invalid={!!clientIssue} aria-describedby={clientHint ? `${id}-client-hint` : undefined}
          style={{width: '100%', minWidth: 0}}
          onChange={event => {
            const next = event.target.value;
            if (next === clientId) return;
            onCenterChange('');
            onClientChange(next);
          }}>
          <option value="">{required ? 'Selecione a empresa' : 'Sem empresa vinculada'}</option>
          {clientId && !selectedClient && <option value={clientId} disabled={!keepingHistory}>
            {keepingHistory ? `${historicalCompany ? clientDisplayName(historicalCompany) : 'Empresa do registro'} · Vínculo histórico`
              : checked ? 'Empresa indisponível' : 'Empresa selecionada'}
          </option>}
          {clients.map(client => <option key={client.id} value={client.id}>{clientDisplayName(client)}</option>)}
        </select>

      </label>
      <label className="field" style={{minWidth: 0}}>
        <span>Centro de custo / obra {required ? '' : '(opcional)'}</span>
        <select ref={centerSelect} name={centerFieldName} value={centerId} required={required || (requireCenterWhenClientSelected && !!clientId)}
          disabled={fieldsDisabled || !clientId} aria-invalid={!!centerIssue} aria-describedby={`${id}-center-hint`}
          style={{width: '100%', minWidth: 0}} onChange={event => onCenterChange(event.target.value)}>
          <option value="">{!clientId ? 'Selecione primeiro a empresa' : required ? 'Selecione o centro de custo / obra' : 'Sem centro de custo / obra'}</option>
          {centerId && !selectedCenter && <option value={centerId} disabled={!historicalOption}>
            {historicalOption ? `${historicalOption.name} · Vínculo histórico` : checked ? 'Centro de custo indisponível' : 'Centro de custo selecionado'}
          </option>}
          {centers.map(center => <option key={center.id} value={center.id}>{center.name}</option>)}
        </select>

      </label>
    </div>
    <div className="client-catalog-hints">
      {clientHint && <small id={`${id}-client-hint`}>{clientHint}</small>}
      <small id={`${id}-center-hint`}>{centerHint}</small>
    </div>
    <div className="client-catalog-refresh">
      <button type="button" className="button secondary edit-action" disabled={disabled || requestStatus === 'loading'}
        onClick={() => void load()}>
        {requestStatus === 'loading' ? 'Atualizando opções…' : requestStatus === 'error' ? 'Tentar novamente' : 'Atualizar opções'}
      </button>
      {requestStatus === 'loading' && <small role="status">Carregando empresas e centros de custo…</small>}
    </div>
    {requestError && <p className="error" role="alert">{requestError} Os campos foram mantidos. Tente novamente antes de salvar.</p>}
    {(clientIssue || centerIssue) && <p className="error" role="alert">{clientIssue || centerIssue}</p>}
  </div>;
}
