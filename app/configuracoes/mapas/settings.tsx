'use client';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, MapPin} from 'lucide-react';

type Status = {configured: boolean; enabled: boolean; revision: number};
const SITE_ORIGIN = 'https://mobiliza.example.invalid';
const ENDPOINT = '/api/settings/google-maps';
const confirmations = [
  ['referrers_confirmed', 'Restringi os websites à origem exata deste Site e ao mesmo endereço com /*, sem liberar outros domínios ou previews.'],
  ['api_confirmed', 'Restringi esta chave somente à Maps JavaScript API.'],
  ['quotas_confirmed', 'Defini e conferi pessoalmente as quotas e os limites no Google Cloud, descritos abaixo.'],
  ['costs_confirmed', 'Autorizo o uso da Maps JavaScript API por gestores autenticados e aceito os custos na minha conta Google conforme as condições e limites que defini. Entendo que alertas de orçamento não são uma trava automática de gastos.'],
  ['data_sharing_confirmed', 'Autorizo o envio de IP, área visualizada e coordenadas ao Google quando um gestor escolher carregar o mapa, incluindo a posição do dispositivo se ele solicitar GPS.'],
  ['browser_visibility_confirmed', 'Entendo que uma chave de navegador fica visível durante o uso. As restrições e quotas precisam ser mantidas no Google.'],
] as const;

export default function GoogleMapsSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const live = useRef(true);
  const generation = useRef(0);
  const saving = useRef(false);
  const keyInput = useRef<HTMLInputElement>(null);
  const activation = useRef<HTMLFormElement>(null);

  async function load() {
    const current = ++generation.current;
    try {
      const response = await fetch(ENDPOINT, {cache: 'no-store', credentials: 'same-origin'});
      const data = await response.json() as Status & {error?: string};
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o mapa.');
      if (live.current && generation.current === current) {setStatus(data); activation.current?.reset();}
    } catch (failure) {
      if (live.current && generation.current === current) setError((failure as Error).message);
    }
  }
  useEffect(() => {
    live.current = true;
    const current = ++generation.current;
    void fetch(ENDPOINT, {cache: 'no-store', credentials: 'same-origin'}).then(async response => {
      const data = await response.json() as Status & {error?: string};
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o mapa.');
      if (live.current && generation.current === current) {setStatus(data); activation.current?.reset();}
    }).catch(failure => {
      if (live.current && generation.current === current) setError((failure as Error).message);
    });
    return () => {live.current = false; generation.current++;};
  }, []);

  async function act(action: string, values: Record<string, unknown> = {}) {
    if (!status || saving.current) return false;
    saving.current = true;
    generation.current++;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action, expected_revision: status.revision, ...values}),
      });
      const data = await response.json() as Status & {error?: string};
      if (!response.ok) {
        // An uncertain/failed write is never automatically retried; refresh exposes only status.
        if (response.status === 409) {
          activation.current?.reset();
          await load();
          throw new Error('A configuração mudou. Revise as restrições da chave atual e confirme novamente todas as condições.');
        }
        throw new Error(data.error || 'Não foi possível salvar. Atualize para conferir o estado.');
      }
      if (live.current) {
        setStatus(data);
        setNotice(action === 'save_key' ? 'Chave salva. O Google continua desativado; a ativação é uma etapa separada.' :
          action === 'enable' ? 'Google Maps ativado. Cada gestor ainda precisa escolher carregar o mapa.' :
          'Novos carregamentos do Google estão desativados. Um mapa já aberto pode continuar funcionando; restrições e revogação da chave são feitas no Google Cloud.');
        activation.current?.reset();
      }
      return true;
    } catch (failure) {
      if (live.current) setError((failure as Error).message);
      return false;
    } finally {
      saving.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = keyInput.current?.value || '';
    // Clear the field immediately; no saved key is ever fetched, echoed, logged or put in browser storage.
    if (keyInput.current) keyInput.current.value = '';
    await act('save_key', {browser_key: value});
  }
  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await act('enable', {
      declared_limits: String(data.get('declared_limits') || ''),
      ...Object.fromEntries(confirmations.map(([name]) => [name, data.get(name) === 'on'])),
    });
  }
  return <>
    <header className="topbar"><a href="/" className="brand"><img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza"/><span>MOBILIZA GESTÃO<br/><strong>Configuração de mapas</strong></span></a></header>
    <main className="tech-shell maps-settings">
      <a href="/configuracoes" className="nav-back"><ArrowLeft size={19}/>Voltar às configurações</a>
      <section className="panel">
        <div className="eyebrow">EXCLUSIVO DO PROPRIETÁRIO</div>
        <h1><MapPin size={26}/> Google Maps</h1>
        <p className="muted">O OpenStreetMap e as coordenadas cadastradas continuam disponíveis. Salvar a chave não carrega nem ativa o Google.</p>
        <p role="status">{status ? status.enabled ? 'Google ativado para carregamento voluntário.' : status.configured ? 'Chave configurada. Google desativado.' : 'Nenhuma chave configurada. Google desativado.' : 'Consultando configuração…'}</p>
        <button type="button" className="button secondary" onClick={() => {setError(''); void load();}} disabled={busy}>Atualizar estado</button>
      </section>
      <section className="panel">
        <h2>1. Prepare a chave no Google Cloud</h2>
        <p>Na sua conta Google, habilite a Maps JavaScript API e crie uma chave para navegador. Restrinja o uso aos dois endereços abaixo e somente à Maps JavaScript API:</p>
        <ul className="maps-referrers"><li>{SITE_ORIGIN}</li><li>{SITE_ORIGIN + '/*'}</li></ul>
        <p>Defina pessoalmente as quotas e acompanhe os custos. Orçamentos e alertas do Google não interrompem automaticamente o gasto. Este painel não altera quotas, não define um teto financeiro e não comprova as restrições da chave.</p>
        <div className="form-actions"><a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener noreferrer" className="button secondary">Credenciais do Google Cloud</a><a href="https://developers.google.com/maps/documentation/javascript/usage-and-billing" target="_blank" rel="noopener noreferrer" className="text-button">Uso, quotas e cobrança</a></div>
      </section>
      <section className="panel">
        <h2>2. Salve pessoalmente a chave</h2>
        <p>A chave fica em armazenamento privado do Site, fora das tabelas gerais. Quando um gestor autorizado carrega o mapa, o navegador recebe a chave para executar o SDK. Ela não é um segredo absoluto.</p>
        <form onSubmit={saveKey} autoComplete="off">
          <label className="field"><span>{status?.configured ? 'Nova chave de navegador (substituir)' : 'Chave de navegador'}</span><input ref={keyInput} type="password" name="maps_browser_key" required minLength={39} maxLength={39} pattern="AIza[A-Za-z0-9_-]{35}" autoComplete="new-password" spellCheck={false} autoCapitalize="none" disabled={!status || busy}/></label>
          <small>A validação deste campo confere apenas o formato. Não cole a chave em conversas. Substituir ou salvar a chave desativa o Google até uma nova confirmação abaixo.</small>
          <div className="form-actions"><button className="button" disabled={!status || busy}>{busy ? 'Aguarde…' : 'Salvar chave e manter Google desativado'}</button></div>
        </form>
      </section>
      <section className="panel">
        <h2>3. Revise custos e envio de dados para ativar</h2>
        <form ref={activation} onSubmit={enable}>
          <fieldset disabled={!status?.configured || status.enabled || busy} className="maps-confirmations">
            <legend>Confirmações do proprietário</legend>
            {confirmations.map(([name, label]) => <label key={name}><input type="checkbox" name={name} required/><span>{label}</span></label>)}
            <label className="field"><span>Quotas e limites que você definiu no Google</span><textarea name="declared_limits" required maxLength={2000} rows={4} placeholder="Descreva as quotas, seus valores e o período. Informe também como você acompanhará a cobrança."/></label>
            <small>Esta declaração registra sua decisão. O texto não configura nem impõe os limites no Google.</small>
            <div className="form-actions"><button className="button">Ativar Google com estas condições</button></div>
          </fieldset>
        </form>
        {status?.enabled && <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => act('disable')}>Desativar novos carregamentos</button></div>}
      </section>
      {notice && <p className="visit-success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  </>;
}
