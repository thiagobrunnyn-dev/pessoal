'use client';
import {useEffect, useRef, useState} from 'react';
import {MapPin, Navigation, X} from 'lucide-react';
import OpenStreetMapPropertyMap from './property-map-osm';
import {validMapPoint, type MapPoint} from '../../lib/google-maps-browser';

const SITE_ORIGIN = 'https://mobiliza.example.invalid';
type Props = {propertyId: string; initial: MapPoint | null; onSave: (point: MapPoint) => Promise<boolean>; onClose: () => void; busy: boolean; error: string};
export default function PropertyMap({propertyId, initial, onSave, onClose, busy, error}: Props) {
  const [provider, setProvider] = useState<'google' | 'osm' | null>(null);
  const [point, setPoint] = useState<MapPoint | null>(initial);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const token = useRef(crypto.randomUUID());
  const gpsGeneration = useRef(0);
  const initialPoint = useRef(initial);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  useEffect(() => {initialPoint.current = point; busyRef.current = busy; closeRef.current = onClose;}, [point, busy, onClose]);
  function send(type: string, extra: Record<string, unknown> = {}) {
    frame.current?.contentWindow?.postMessage({type, token: token.current, property_id: propertyId, ...extra}, SITE_ORIGIN);
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape' && !busyRef.current) closeRef.current();};
    document.addEventListener('keydown', escape);
    return () => {gpsGeneration.current++; document.removeEventListener('keydown', escape); if (previous?.isConnected) previous.focus();};
  }, []);
  useEffect(() => {
    if (provider !== 'google') return;
    let currentFrame = '';
    const timer = window.setTimeout(() => setMapError('O editor não abriu. Confira se sua sessão está ativa ou use OpenStreetMap.'), 20000);
    const receive = (event: MessageEvent) => {
      if (event.origin !== SITE_ORIGIN || event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const data = event.data as Record<string, unknown>;
      if (data.property_id !== propertyId) return;
      if (data.type === 'mbl-map-frame-ready' && typeof data.frame_id === 'string' && /^[a-f0-9-]{36}$/.test(data.frame_id) && data.frame_id !== currentFrame) {
        currentFrame = data.frame_id; token.current = crypto.randomUUID();
        gpsGeneration.current++; setLocating(false); setReady(false); setMapError(''); window.clearTimeout(timer);
        frame.current?.contentWindow?.postMessage({type: 'mbl-map-init', frame_id: currentFrame, token: token.current, property_id: propertyId, initial: initialPoint.current}, SITE_ORIGIN);
        return;
      }
      if (data.token !== token.current) return;
      if (data.type === 'mbl-map-ready') {setReady(true); setMapError('');}
      if (data.type === 'mbl-map-point' && validMapPoint(data.point)) {
        gpsGeneration.current++; setLocating(false); setPoint(data.point);
      }
      if (data.type === 'mbl-map-error') {
        gpsGeneration.current++; setLocating(false); setReady(false);
        setMapError(typeof data.error === 'string' ? data.error.slice(0, 250) : 'Google Maps indisponível. Você pode escolher OpenStreetMap.');
      }
      if (data.type === 'mbl-map-close' && !busyRef.current) closeRef.current();
    };
    window.addEventListener('message', receive);
    return () => {window.clearTimeout(timer); gpsGeneration.current++; window.removeEventListener('message', receive);};
  }, [propertyId, provider]);
  function locate() {
    if (!navigator.geolocation) {setMapError('Localização indisponível. Escolha o ponto manualmente.'); return;}
    const generation = ++gpsGeneration.current; setLocating(true); setMapError('');
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (generation !== gpsGeneration.current) return;
        setLocating(false);
        const p = {latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_m: position.coords.accuracy};
        if (!validMapPoint(p)) {setMapError('Não foi possível ler a posição. Escolha o ponto manualmente.'); return;}
        send('mbl-map-set-point', {point: p});
      }, failure => {
        if (generation !== gpsGeneration.current) return;
        setLocating(false); setMapError(failure.code === 1 ? 'Permissão negada. Escolha o ponto manualmente.' : 'Não foi possível obter a posição. Escolha o ponto manualmente.');
      }, {enableHighAccuracy: true, timeout: 12000, maximumAge: 0});
    } catch {setLocating(false); setMapError('A localização não está disponível. Escolha o ponto manualmente.');}
  }
  if (provider === 'osm') return <OpenStreetMapPropertyMap initial={point} busy={busy} error={error} onClose={onClose} onSave={onSave}/>;
  return <div className="modal-backdrop no-print" onClick={event => {if (event.target === event.currentTarget && !busy) onClose();}}>
    <section ref={dialog} tabIndex={-1} className="modal property-map-modal" role="dialog" aria-modal="true" aria-labelledby="property-map-title" onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],iframe,[tabindex]:not([tabindex="-1"])')).filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) {event.preventDefault(); dialog.current?.focus();}
      else if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
    }}>
      <header><div><span className="eyebrow">PONTO DO IMÓVEL</span><h2 id="property-map-title">Escolha o ponto no mapa</h2></div><button ref={closeButton} type="button" className="button secondary" aria-label="Fechar mapa" disabled={busy} onClick={onClose}><X size={20}/></button></header>
      {!provider ? <>
        <p className="muted">Ao carregar, o provedor recebe seu IP e a área visualizada, incluindo as coordenadas do ponto. O nome e o endereço do imóvel não são enviados pelo painel. Nenhum ponto é salvo antes de sua confirmação.</p>
        <div className="form-actions"><button type="button" className="button" onClick={() => setProvider('google')}>Abrir editor Google Maps</button><button type="button" className="button secondary" onClick={() => setProvider('osm')}>Carregar OpenStreetMap</button></div>
        <small>O Google só carrega após sua confirmação dentro do editor e quando estiver ativado pelo proprietário. Não há pesquisa automática de endereços.</small>
      </> : <>
        <p className="muted">O Google recebe seu IP, a área visualizada e coordenadas após tocar em “Carregar Google Maps” no editor abaixo. Toque no mapa ou arraste o pino. Nenhum ponto é salvo até sua confirmação.</p>
        <div className="map-locate"><button type="button" className="button secondary" disabled={busy || locating || !ready} onClick={locate}><Navigation size={18}/>{locating ? 'Consultando localização…' : 'Usar minha localização'}</button><small>Consulta única, somente ao tocar e permitir no navegador. A posição centraliza o mapa e é enviada ao Google. Confira o imóvel antes de salvar.</small></div>
        <iframe ref={frame} src={'/mapa/editor?property_id=' + encodeURIComponent(propertyId)} title="Editor privado do ponto no Google Maps" className="property-map-box google-map-iframe" referrerPolicy="no-referrer" onLoad={() => {gpsGeneration.current++; setLocating(false); setReady(false);}}/>
        <button type="button" className="text-button" disabled={!ready || busy} onClick={() => send('mbl-map-center')}>Marcar centro do mapa</button>
        {point ? <p className="location-status"><MapPin size={16}/>Ponto selecionado: {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}{point.accuracy_m == null ? '' : ' · precisão aproximada: ' + Math.round(point.accuracy_m) + ' m'}</p> : <p className="location-status">Ainda sem ponto. A visão inicial do Brasil é apenas referência.</p>}
        <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => {gpsGeneration.current++; setLocating(false); setProvider('osm');}}>Usar OpenStreetMap</button><button type="button" className="button" disabled={busy || !point || !ready} onClick={() => point && onSave(point)}>{busy ? 'Salvando…' : 'Salvar este ponto'}</button></div>
      </>}
      {(mapError || error) && <p className="error" role="alert">{error || mapError}</p>}
    </section>
  </div>;
}
