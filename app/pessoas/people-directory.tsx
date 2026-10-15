'use client';
import {filterPeople,emptyPeopleFilters,missingPersonData,type PeopleFilters} from '../../lib/people-filters';
import PeopleFilterControls from './people-filter-controls';
import PersonAssignmentFields,{type PersonClient,type PersonCenter,type PersonCatalog} from './person-assignment-fields';
import {personNumber} from '../../lib/person-number';
import {uppercasePersonText} from '../../lib/person-text';
import {uppercaseFieldEvent} from './uppercase-field';
import GuestDocuments from '../components/guest-documents';
import PhotoFileControls from '../components/photo-file-controls';

import {useCallback, useEffect, useRef, useState, lazy, Suspense, type FormEvent} from 'react';
import {ArrowLeft, Plus, RefreshCw, Users, X} from 'lucide-react';
import {BRAZIL_STATES} from '../../lib/brazil-states';
import {prepareProfilePhoto} from './profile-photo';
import './people-directory.css';
import PeopleViewMenu, {type PeopleView} from './people-view-menu';
import PeopleCardMenu from './people-card-menu';
import PersonPrivateFields, {type PrivatePersonFields} from './person-private-fields';

const CityPicker = lazy(() => import('./city-picker'));
const ACCOUNT_ROLES: Record<string, string> = {owner: 'Sócio-administrador', general_manager: 'Gerente geral', maintenance_lead: 'Encarregado de manutenção', administrative_analyst: 'Analista administrativo'};
type Directory = 'collaborator' | 'technician' | 'supervisor' | 'guest';
type Action = 'create' | 'update' | 'archive' | 'restore';
type Profile = {
  id: string;
  control_number?: number | null;
  client_id?: string | null;
  cost_center_id?: string | null;
  client?: PersonClient | null;
  cost_center?: PersonCenter | null;
  has_assignment?: boolean;
  assignment_unavailable?: boolean;
  directory: Directory;
  name_pending?:boolean;
  display_name: string;
  job_title: string;
  state_code: string;
  city?: string | null;
  supervisor_profile_id: string | null;
  supervisor_account_user_id?: string | null;
  status: 'active' | 'archived';
  revision: number;
  photo_asset_id: string | null;
  has_account_link: boolean;
  app_member_user_id?: string | null;
  created_at: string;
  updated_at: string;
};
type SupervisorOption = {ref: string; display_name: string; title?: string; kind: 'person' | 'account'; state_code: string | null; allowed_state_code?: string | null; profile_id?: string; aliases?: string[]};
type DirectoryData = {
  profiles: Profile[];
  catalog: PersonCatalog;
  can_initialize_numbers?: boolean;
  supervisors: {id: string; display_name: string; state_code: string; revision: number}[];
  supervisor_options?: SupervisorOption[];
  regional: boolean;
  can_link_accounts: boolean;
  eligible_members?: {user_id: string; display_name: string; role: string}[];
};
type Entry = {action: Action; directory: Directory; profile?: Profile};
type Photo = {file: File; url: string};
type SaveResult = {id: string; revision: number; alreadySaved?: boolean; unchanged?: boolean};

const photoUrl = (id: string) => '/api/people/photos/' + encodeURIComponent(id);
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

async function responseJson(response: Response, fallback: string) {
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error(fallback); }
  if (!result || typeof result !== 'object') throw new Error(fallback);
  if (!response.ok) {
    const error = 'error' in result && typeof result.error === 'string' ? result.error : fallback;
    throw new Error(error);
  }
  return result;
}

function supervisorOptions(data: DirectoryData): SupervisorOption[] {
  return data.supervisor_options ?? data.supervisors.map(item => ({ref: 'person:' + item.id, display_name: item.display_name, kind: 'person', state_code: item.state_code || null, profile_id: item.id}));
}
function supervisorRef(profile?: Profile) {
  return profile?.supervisor_account_user_id ? 'account:' + profile.supervisor_account_user_id : profile?.supervisor_profile_id ? 'person:' + profile.supervisor_profile_id : '';
}
function matchesSupervisor(option: SupervisorOption, ref: string) {return option.ref === ref || option.aliases?.includes(ref);}
function supervisorName(profile: Profile, data: DirectoryData) {
  const ref = supervisorRef(profile);
  if (!ref) return 'Não informado';
  return supervisorOptions(data).find(item => matchesSupervisor(item, ref))?.display_name
    || data.profiles.find(item => item.id === profile.supervisor_profile_id)?.display_name
    || 'Vínculo preservado';
}

export default function PeopleDirectory({displayName, accessTitle, view = 'active', guests=false}: {displayName: string; accessTitle: string; view?: PeopleView; guests?: boolean}) {
  const [data, setData] = useState<DirectoryData | null>(null);
  const status = view === 'archived' ? 'archived' : 'active';
  const [search, setSearch] = useState('');
  const [filters,setFilters]=useState<PeopleFilters>({...emptyPeopleFilters});
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(view !== 'trash');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [numbering, setNumbering] = useState(false);
  const numberingRequest = useRef(false);
  const alive = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(guests?'/api/people?registry=guests':'/api/people', {cache: 'no-store', signal: request.signal});
      const result = await responseJson(response, 'Não foi possível carregar os cadastros. Tente novamente.') as DirectoryData;
      if (!Array.isArray(result.profiles) || !Array.isArray(result.supervisors)
        || typeof result.regional !== 'boolean' || typeof result.can_link_accounts !== 'boolean') {
        throw new Error('Não foi possível conferir os cadastros. Atualize a lista.');
      }
      if (alive.current && current === generation.current) setData(result);
    } catch (cause) {
      if (alive.current && current === generation.current && !request.signal.aborted) {
        setData(null);
        setError(errorMessage(cause, 'Não foi possível carregar os cadastros. Tente novamente.'));
      }
    } finally {
      if (alive.current && current === generation.current) setLoading(false);
    }
  }, [guests]);

  useEffect(() => {
    alive.current = true;
    const timer = view === 'trash' ? undefined : window.setTimeout(() => void load(), 0);
    const requests = generation;
    const activeController = controller;
    return () => {
      alive.current = false;
      window.clearTimeout(timer);
      requests.current++;
      activeController.current?.abort();
    };
  }, [load, view]);

  function open(next: Entry, button: HTMLElement) {
    trigger.current = button;
    setError('');
    setNotice('');
    setEntry(next);
  }

  function close() {
    setEntry(null);
    window.requestAnimationFrame(() => trigger.current?.focus());
  }

  async function saved(action: Action, result: SaveResult) {
    setEntry(null);
    setNotice(result.unchanged ? 'Nenhuma alteração necessária.' : result.alreadySaved ? 'Cadastro já salvo.'
      : action === 'archive' ? 'Cadastro retirado da lista ativa. Você pode restaurá-lo em Arquivados.' : action === 'restore' ? 'Cadastro restaurado. Ele voltou à lista de ativos.' : 'Cadastro salvo.');
    await load();
  }

  async function initializeNumbers() {
    if(numberingRequest.current || entry || !data?.can_initialize_numbers)return;
    numberingRequest.current=true;setNumbering(true);setError('');setNotice('');
    const request=new AbortController(),timeout=window.setTimeout(()=>request.abort(),25000);
    try{
      const response=await fetch('/api/people/numbers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'initialize_numbers'}),signal:request.signal});
      const result=await responseJson(response,'Não foi possível confirmar a numeração. Atualize ou tente novamente; os números já gerados serão mantidos.') as {assigned:number;remaining:number};
      if(!Number.isSafeInteger(result.assigned)||!Number.isSafeInteger(result.remaining)||result.assigned<0||result.remaining<0)throw new Error('Resposta não confirmada. Atualize a lista.');
      if(alive.current){setNotice(result.remaining?'Números gerados. Toque novamente para numerar os cadastros restantes.':'Números de controle conferidos. Eles permanecem os mesmos ao editar ou arquivar.');await load();}
    }catch(cause){if(alive.current)setError(request.signal.aborted?'A numeração demorou para responder. Atualize a lista ou tente novamente; os números já gerados serão mantidos.':errorMessage(cause,'Não foi possível confirmar a numeração. Atualize ou tente novamente; os números já gerados serão mantidos.'));}
    finally{window.clearTimeout(timeout);numberingRequest.current=false;if(alive.current)setNumbering(false);}
  }
  const pendingNumbers=(data?.profiles||[]).some(profile=>profile.directory!=='guest'&&!personNumber(profile.control_number));
  const baseProfiles=(data?.profiles||[]).filter(profile=>profile.status===status && (guests?profile.directory==='guest':profile.directory!=='guest'));
  const availableSupervisors=data?supervisorOptions(data):[];
  const profiles=filterPeople(baseProfiles,filters,search,availableSupervisors);

  return <>
    <header className="topbar">
      <a className="brand" href="/"><img src="/mobiliza-logo-0cff20bedde7.jpeg" width={48} height={48} alt="Mobiliza Facilities"/><span>MOBILIZA GESTÃO<br/><strong>{guests?'Hóspedes':'Colaboradores'}</strong></span></a>
      <div className="header-actions people-header-actions"><span className="clean-header-label"><span className="people-access-title">{accessTitle} · </span>{displayName}</span><PeopleViewMenu guests={guests} view={view} disabled={!!entry||numbering}/></div>
    </header>
    <main className="shell work-orders-shell people-shell">
      <a className="nav-back" href={guests?view==='active'?'/ocupacao':'/hospedes':view === 'active' ? '/' : '/pessoas'} onClick={event => {
        if (entry && !window.confirm('Sair sem salvar este formulário?')) event.preventDefault();
      }}><ArrowLeft size={19}/>{view === 'active' ? guests?'Voltar à hospedagem':'Voltar ao painel' : 'Voltar aos ativos'}</a>
      <section className="page-title">
        <div><div className="eyebrow">CADASTROS</div><h1>{view === 'archived' ? 'Pessoas arquivadas' : view === 'trash' ? 'Lixeira' : guests?'Cadastro de hóspedes':'Colaboradores'}</h1><p>{view === 'archived' ? 'Cadastros guardados, com opção de restaurar.' : view === 'trash' ? 'Os cadastros são preservados por arquivamento.' : guests?'Nome, função, empresa, centro de custo e fotos privadas dos hóspedes.':'Cadastros ativos de colaboradores, técnicos e supervisores.'}</p></div>
        {view !== 'trash' && <button type="button" className="button secondary" disabled={loading || !!entry || numbering} onClick={() => void load()}><RefreshCw size={18}/>Atualizar</button>}
      </section>
      {data?.regional && <p className="clean-access-note">Cadastros do Pará · UF fixa PA.</p>}
      {notice && <p className="visit-success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {data?.can_initialize_numbers && pendingNumbers && view !== 'trash' && !entry && <div className="people-number-setup"><div><strong>Números de controle</strong><p>Numere os colaboradores já cadastrados, incluindo os arquivados. Novos cadastros recebem o número automaticamente.</p></div><button type="button" className="button secondary" disabled={numbering||loading} onClick={() => void initializeNumbers()}>{numbering?'Gerando números…':'Numerar cadastros existentes'}</button></div>}
      {view === 'active' && !entry && <button type="button" className="button work-order-create" disabled={!data || loading || numbering}
        onClick={event => open({action: 'create', directory: guests?'guest':'collaborator'}, event.currentTarget)}><Plus size={18}/>{guests?'Cadastrar hóspede':'Cadastrar colaborador'}</button>}
      {entry && data && <PersonForm key={entry.action + ':' + (entry.profile?.id || entry.directory)} entry={entry} data={data}
        onClose={close} onSaved={result => saved(entry.action, result)}/>}
      {view === 'trash' ? <section className="panel people-trash"><h2>Nenhuma exclusão é feita aqui</h2><p>As pessoas retiradas da lista ativa ficam em Arquivados e podem ser restauradas.</p><a className="button secondary" href={guests?'/hospedes?view=archived':'/pessoas?view=archived'}>Abrir Arquivados</a></section> : <section className="panel" aria-busy={loading}>
        <div className="section-heading"><h2>{view === 'archived' ? 'Arquivados' : guests?'Hóspedes ativos':'Colaboradores ativos'}</h2>{data && !loading && <span className="pill neutral" role="status">{profiles.length} de {baseProfiles.length} cadastro{baseProfiles.length === 1 ? '' : 's'}</span>}</div>
        <div className="handover-filters">
          <label className="field"><span>Buscar nome ou número</span><input type="search" value={search} onChange={event => setSearch(event.target.value)}/></label>
        </div>
        {data&&<PeopleFilterControls rows={baseProfiles} filters={filters} supervisors={availableSupervisors} regional={data.regional} disabled={loading||!!entry||numbering} onChange={setFilters} onClear={()=>{setFilters({...emptyPeopleFilters});setSearch('');}} hasSearch={!!search.trim()}/>}
        {loading ? <p role="status">Carregando cadastros…</p> : !data ? <div className="empty"><h3>Lista indisponível</h3><button type="button" className="button secondary" onClick={() => void load()}>Tentar novamente</button></div>
          : !profiles.length ? <div className="empty"><div className="empty-icon"><Users size={30}/></div><h3>Nenhuma pessoa neste filtro</h3><p>{view === 'archived' ? 'Nenhum cadastro arquivado corresponde à busca.' : 'Altere a busca ou cadastre uma pessoa.'}</p></div>
            : profiles.map(profile => <article className="handover-card people-card" key={profile.id}>
              <div className="section-heading people-card-heading">
                <div style={{display: 'flex', alignItems: 'center', gap: 14, minWidth: 0}}>
                  {profile.photo_asset_id && <img src={photoUrl(profile.photo_asset_id)} alt={'Foto de ' + profile.display_name}
                    width={64} height={64} loading="lazy" style={{objectFit: 'cover', borderRadius: 10, flexShrink: 0}}/>}
                  <div style={{minWidth: 0, overflowWrap: 'anywhere'}}>{profile.directory!=='guest'&&<small className="people-control" aria-label={personNumber(profile.control_number)?'Número de controle '+personNumber(profile.control_number):'Número de controle pendente'}>{personNumber(profile.control_number)||'Número pendente'}</small>}<h3>{uppercasePersonText(profile.display_name)}</h3>{profile.directory==='guest'&&<span className="pill neutral">Hóspede</span>}{profile.name_pending&&<span className="pill warning">Nome a conferir</span>}<p className="muted">{profile.job_title ? uppercasePersonText(profile.job_title) : 'Função não informada'}</p></div>
                </div>
                <div className="people-card-tools"><span className={'pill ' + (profile.status === 'active' ? 'ok' : 'neutral')}>{profile.status === 'active' ? 'Ativo' : 'Arquivado'}</span><PeopleCardMenu name={profile.display_name} archived={profile.status==='archived'} disabled={!!entry||numbering} onAction={(action, button) => open({action, directory: profile.directory, profile}, button)}/></div>
              </div>
              <dl className="handover-details">
                <div className="people-secondary"><dt>Localidade</dt><dd>{uppercasePersonText([profile.city, profile.state_code].filter(Boolean).join(' · ')) || 'Não informada'}</dd></div>
                {profile.directory!=='guest'&&<div className="people-secondary"><dt>Supervisor direto</dt><dd>{uppercasePersonText(supervisorName(profile, data))}</dd></div>}
                {<div className="people-secondary people-work-assignment"><dt>Empresa / Centro de custo</dt><dd>{profile.assignment_unavailable?'Vínculo preservado, indisponível neste acesso':profile.client?<>{uppercasePersonText(profile.client.name)}{profile.cost_center?' · '+uppercasePersonText(profile.cost_center.name):' · CC não informado'}{profile.client.archived||profile.cost_center?.archived?' · Arquivado':''}</>:'Não informado'}</dd></div>}
                {profile.has_account_link && <div><dt>Conta</dt><dd>Vínculo cadastral existente</dd></div>}
              </dl>
              {guests&&<GuestDocuments profileId={profile.id} profileRevision={profile.revision} archived={profile.status==='archived'} disabled={!!entry}/>}
              {missingPersonData(profile).length>0&&<details className="people-completeness"><summary>Dados a completar</summary><p>Não informados: {missingPersonData(profile).join(', ')}. Você pode completar depois, sem impedir o salvamento.</p></details>}
            </article>)}
      </section>}
    </main>
  </>;
}

function PersonForm({entry, data, onClose, onSaved}: {entry: Entry; data: DirectoryData; onClose: () => void; onSaved: (result: SaveResult) => Promise<void>}) {
  const {action, directory, profile} = entry;
  const [namePending,setNamePending]=useState(profile?.name_pending||false);
  const statusAction = action === 'archive' || action === 'restore';
  const canLink = directory!=='guest' && data.can_link_accounts && !data.regional;
  const [displayName, setDisplayName] = useState(uppercasePersonText(profile?.display_name || ''));
  const [jobTitle, setJobTitle] = useState(uppercasePersonText(profile?.job_title || ''));
  const [city, setCity] = useState(uppercasePersonText(profile?.city || ''));
  const [cityCode, setCityCode] = useState('');
  const [stateCode, setStateCode] = useState(data.regional ? 'PA' : profile?.state_code || '');
  const [supervisor, setSupervisor] = useState(supervisorRef(profile));
  const [member, setMember] = useState(profile?.app_member_user_id || '');
  const [clientId,setClientId]=useState(profile?.client_id||'');
  const [centerId,setCenterId]=useState(profile?.cost_center_id||'');
  const [assignmentChanged,setAssignmentChanged]=useState(false);
  const [reason, setReason] = useState('');
  const [privateChanges, setPrivateChanges] = useState<Partial<PrivatePersonFields>>({});
  const [privateLoading, setPrivateLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef('');
  const failedRequest = useRef(false);
  const busyRef = useRef(false);
  const preparingRef = useRef(false);
  const photoGeneration = useRef(0);
  const selectedPhotoUrl = useRef<string | null>(null);
  const alive = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    alive.current = true;
    heading.current?.focus();
    const generation = photoGeneration;
    const currentUrl = selectedPhotoUrl;
    return () => {
      alive.current = false;
      generation.current++;
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
    };
  }, []);

  function changed() {
    if (failedRequest.current) {
      requestId.current = crypto.randomUUID();
      failedRequest.current = false;
    }
    setError('');
    setConfirmed(false);
  }

  async function selectPhoto(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file || busyRef.current) return;
    const generation = ++photoGeneration.current;
    preparingRef.current = true;
    setPreparing(true);
    setConfirmed(false);
    setError('');
    try {
      const prepared = await prepareProfilePhoto(file);
      if (!alive.current || generation !== photoGeneration.current) return;
      const url = URL.createObjectURL(prepared);
      changed();
      if (selectedPhotoUrl.current) URL.revokeObjectURL(selectedPhotoUrl.current);
      selectedPhotoUrl.current = url;
      setPhoto({file: prepared, url});
    } catch (cause) {
      if (alive.current && generation === photoGeneration.current) {
        setError(errorMessage(cause, 'Não foi possível preparar a foto. Escolha outra imagem.') + ' Os dados e a foto anterior foram mantidos.');
      }
    } finally {
      if (alive.current && generation === photoGeneration.current) {
        preparingRef.current = false;
        setPreparing(false);
      }
    }
  }

  function cancelPreparation() {
    photoGeneration.current++;
    preparingRef.current = false;
    setPreparing(false);
    setError('');
  }

  function removePhoto() {
    cancelPreparation();
    changed();
    if (selectedPhotoUrl.current) URL.revokeObjectURL(selectedPhotoUrl.current);
    selectedPhotoUrl.current = null;
    setPhoto(null);
  }

  function close() {
    if (!busyRef.current && window.confirm('Fechar sem salvar este formulário?')) {
      photoGeneration.current++;
      onClose();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || preparingRef.current || privateLoading || !confirmed) return;
    if (action !== 'create' && (!profile || statusAction && !reason.trim())) {
      setError('Informe o motivo antes de confirmar.');
      return;
    }
    if (!statusAction && !displayName.trim()) {
      setError('Informe o nome da pessoa.');
      return;
    }
    if (profile && !Number.isSafeInteger(profile.revision)) {
      setError('Não foi possível conferir a versão do cadastro. Feche o formulário e atualize a lista.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      const form = new FormData();
      form.set('action', action);
      form.set('request_id', requestId.current);
      form.set('confirmed', 'yes');
      if (profile) {
        form.set('id', profile.id);
        form.set('expected_revision', String(profile.revision));
        form.set('reason', uppercasePersonText(reason.trim()));
      }
      if (!statusAction) {
        form.set('directory', directory);
        form.set('display_name', uppercasePersonText(displayName.trim()));
        if(directory==='guest'||profile?.name_pending)form.set('name_pending',namePending?'yes':'no');
        form.set('job_title', uppercasePersonText(jobTitle.trim()));
        form.set('state_code', data.regional ? 'PA' : stateCode);
        form.set('city', uppercasePersonText(city.trim()));
        if (cityCode) form.set('city_code', cityCode);
        if(directory!=='guest')form.set('supervisor_ref', supervisor);
        if(action==='create'||assignmentChanged){form.set('client_id',clientId);form.set('cost_center_id',centerId);}
        if (canLink) form.set('app_member_user_id', member);
        if (photo) form.set('photo', photo.file);
        for (const [key, value] of Object.entries(privateChanges)) form.set(key, value);
      }
      const response = await fetch(directory==='guest'?'/api/people?registry=guests':'/api/people', {method: 'POST', body: form});
      const result = await responseJson(response, 'Não foi possível confirmar o salvamento. Seus dados e a foto continuam neste formulário.') as SaveResult;
      if (typeof result.id !== 'string' || !result.id || !Number.isSafeInteger(result.revision) || (profile && result.id !== profile.id)) {
        throw new Error('Não foi possível conferir a resposta. Seus dados e a foto continuam neste formulário; tente novamente.');
      }
      if (alive.current) await onSaved(result);
    } catch (cause) {
      failedRequest.current = true;
      if (alive.current) setError(errorMessage(cause, 'Não foi possível salvar. Seus dados e a foto continuam neste formulário.'));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const supervisors = supervisorOptions(data).filter(item => (!profile || item.profile_id !== profile.id && item.ref !== 'person:' + profile.id) && (!item.allowed_state_code || item.allowed_state_code === (data.regional ? 'PA' : stateCode)));
  const preservedSupervisor = supervisor && !supervisors.some(item => matchesSupervisor(item, supervisor));
  const preservedMember = member && !(data.eligible_members || []).some(item => item.user_id === member);
  const title = action === 'create' ? directory==='guest'?'Cadastrar hóspede':'Cadastrar colaborador' : action === 'update' ? 'Editar cadastro'
    : action === 'archive' ? 'Excluir da lista ativa' : 'Restaurar cadastro';
  const preview = photo?.url || (profile?.photo_asset_id ? photoUrl(profile.photo_asset_id) : '');

  return <section className="panel handover-entry person-form" aria-labelledby="person-form-title">
    <div className="section-heading"><div><h2 id="person-form-title" tabIndex={-1} ref={heading}>{title}</h2></div>
      <button type="button" className="button secondary" aria-label="Fechar formulário" disabled={busy} onClick={close}><X size={18}/></button>
    </div>
    {statusAction && <div className="clean-inset"><strong>{profile?.display_name}</strong><p className="muted">{action === 'archive'
      ? 'O cadastro será guardado em Arquivados, de onde poderá ser restaurado. Vínculos, fotos e histórico serão preservados. Esta ação não muda o acesso da conta.'
      : 'A pessoa voltará às listas ativas.'}</p></div>}
    {action === 'update' && profile?.status === 'archived' && <p className="clean-access-note">Este cadastro está arquivado. Salvar alterações mantém essa situação.</p>}
    {action === 'restore' && preservedSupervisor && <p className="today-alert">O responsável vinculado não está na lista ativa. Antes de restaurar, use Editar cadastro para remover ou trocar esse vínculo.</p>}
    <form onSubmit={submit}>
      <fieldset className="correction-fields" disabled={busy}>
        {!statusAction && <>
          <div className="two-col">
            <label className="field"><span>Nome completo</span><input autoComplete="off" className="person-uppercase" autoCapitalize="characters" value={displayName} required maxLength={120}
              onChange={event => uppercaseFieldEvent(event, value => {changed(); setDisplayName(value);})} onCompositionEnd={event => uppercaseFieldEvent(event, value => {changed(); setDisplayName(value);})}/></label>
            {(directory==='guest'||profile?.name_pending)&&<label className="confirm"><input type="checkbox" checked={namePending} onChange={e=>{setNamePending(e.target.checked);changed();}}/><span>Nome ainda incompleto / a conferir</span></label>}<label className="field"><span>Função (opcional)</span><input autoComplete="off" className="person-uppercase" autoCapitalize="characters" value={jobTitle} maxLength={120}
              onChange={event => uppercaseFieldEvent(event, value => {changed(); setJobTitle(value);})} onCompositionEnd={event => uppercaseFieldEvent(event, value => {changed(); setJobTitle(value);})}/></label>
          </div>
          <div className="two-col">
            <label className="field"><span>UF</span>{data.regional ? <input value="PA · Pará" readOnly/> : <select value={stateCode}
              onChange={event => { changed(); setStateCode(event.target.value); setCityCode(''); }}><option value="">Geral · sem UF</option>
              {Object.entries(BRAZIL_STATES).map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
            </select>}</label>
            <Suspense fallback={<label className="field"><span>Cidade (opcional)</span><input autoComplete="off" autoCapitalize="characters" className="person-uppercase" value={city} maxLength={120} onChange={event => uppercaseFieldEvent(event, value => {changed(); setCity(value); setCityCode('');})} onCompositionEnd={event => uppercaseFieldEvent(event, value => {changed(); setCity(value); setCityCode('');})}/></label>}>
              <CityPicker key={stateCode} stateCode={data.regional ? 'PA' : stateCode} value={city} selectedCode={cityCode} disabled={busy} onChange={(value, code) => {changed(); setCity(value); setCityCode(code);}}/>
            </Suspense>
          </div>
          {directory!=='guest'&&<div className="two-col">
            <label className="field"><span>Supervisor direto (opcional)</span><select value={supervisor}
              onChange={event => { changed(); setSupervisor(event.target.value); }}><option value="">Sem responsável vinculado</option>
              {preservedSupervisor && <option value={supervisor}>{profile ? supervisorName(profile, data) : 'Responsável atual'} · vínculo atual preservado</option>}
              {(['account', 'person'] as const).map(kind => supervisors.some(item => item.kind === kind) && <optgroup key={kind} label={kind === 'account' ? 'Gestão' : 'Colaboradores'}>{supervisors.filter(item => item.kind === kind).map(item => <option key={item.ref} value={matchesSupervisor(item, supervisor) ? supervisor : item.ref}>{uppercasePersonText(item.display_name)}{item.title ? ' · ' + uppercasePersonText(item.title) : ''}</option>)}</optgroup>)}
            </select><small>Escolha quem é responsável por este colaborador. Isso não altera permissões.</small>{preservedSupervisor && <small>O responsável atual não está na lista ativa. Selecione outra pessoa ou remova o vínculo para salvar.</small>}</label>
          </div>}
          {<PersonAssignmentFields catalog={data.catalog||{clients:[],costCenters:[]}} clientId={clientId} centerId={centerId} currentClient={profile?.client} currentCenter={profile?.cost_center} unavailable={!!profile?.assignment_unavailable} changed={assignmentChanged} disabled={busy} onChange={(client,center)=>{changed();setAssignmentChanged(true);setClientId(client);setCenterId(center);}}/>}
          {directory!=='guest'&&<PersonPrivateFields profileId={profile?.id} revision={profile?.revision} disabled={busy} onLoading={setPrivateLoading} onChange={values => {changed(); setPrivateChanges(values);}}/>}
          {canLink && <label className="field"><span>Conta já cadastrada (opcional)</span><select value={member}
            onChange={event => { changed(); setMember(event.target.value); }}><option value="">Sem vínculo de conta</option>
            {preservedMember && <option value={member}>Conta vinculada atual · preservar</option>}
            {(data.eligible_members || []).map(item => <option key={item.user_id} value={item.user_id}>{uppercasePersonText(item.display_name)} · {uppercasePersonText(ACCOUNT_ROLES[item.role] || item.role)}</option>)}
          </select><small>Cadastro de pessoas; não libera login.</small></label>}
          <fieldset className="clean-inset person-photo" aria-busy={preparing}><legend>Foto (opcional)</legend>
            <div className="person-photo-actions"><PhotoFileControls capture="user" disabled={busy||preparing} cameraLabel="Tirar foto do perfil" fileLabel={preview?'Escolher outra foto':'Escolher foto'} onSelect={selectPhoto}/>
              {preparing && <button type="button" className="button secondary" onClick={cancelPreparation}>Cancelar preparação</button>}
              {photo && <button type="button" className="button secondary" onClick={removePhoto}>Desfazer seleção</button>}
            </div>
            {preview && <img className="person-photo-preview" src={preview} alt={photo ? 'Foto selecionada para o cadastro' : 'Foto atual do cadastro'} width={96} height={96}/>}
            {photo && <p className="muted">{photo.file.name}</p>}
            {preparing && <p className="muted" role="status">Preparando foto…</p>}
            <p className="muted person-photo-help">{directory==='guest'?'Foto da pessoa, opcional e privada à gestão autorizada. JPG, PNG ou WebP até 20 MB; reduzida antes do envio. Depois de salvar, abra Fotos de documentos na ficha do hóspede para anexar os documentos separadamente.':'JPG, PNG ou WebP, até 20 MB; reduzida antes do envio. Ao vincular este perfil a um serviço, foto, nome e função poderão aparecer no QR de consulta ativado. A assinatura permanece privada para a gestão.'}</p>
          </fieldset>
        </>}
        {action !== 'create' && <label className="field"><span>{statusAction?'Motivo (obrigatório)':'Motivo (opcional)'}</span><textarea className="person-uppercase" autoCapitalize="characters" required={statusAction} maxLength={1000} rows={3} value={reason}
          onChange={event => uppercaseFieldEvent(event, value => {changed(); setReason(value);})} onCompositionEnd={event => uppercaseFieldEvent(event, value => {changed(); setReason(value);})}/></label>}
        <label className="confirm"><input type="checkbox" required disabled={preparing} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
          <span>{action === 'archive' ? 'Conferi a pessoa e confirmo a retirada da lista ativa. Poderei restaurar em Arquivados.' : action === 'restore'
            ? 'Conferi a pessoa e confirmo a restauração.' : 'Conferi os dados e confirmo este cadastro.'}</span>
        </label>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancelar</button>
        <button type="submit" className="button" disabled={busy || preparing || privateLoading || !confirmed || (statusAction && !reason.trim())}>
          {busy ? 'Salvando…' : action === 'archive' ? 'Excluir da lista ativa' : action === 'restore' ? 'Restaurar cadastro' : 'Salvar cadastro'}
        </button>
      </div>
    </form>
  </section>;
}
