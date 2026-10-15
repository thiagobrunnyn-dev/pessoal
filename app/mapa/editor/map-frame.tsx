'use client';
import {useEffect, useRef, useState} from 'react';
import {validMapPoint, type MapPoint} from '../../../lib/google-maps-browser';

const SITE_ORIGIN = 'https://mobiliza.example.invalid';
export default function GoogleMapFrame({propertyId}: {propertyId: string}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('Abra este mapa pelo botão do ponto do imóvel no painel.');
  const [canLoad, setCanLoad] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (window.parent === window || window.location.origin !== SITE_ORIGIN) return;
    let disposed = false, started = false, token = '';
    const frameId = crypto.randomUUID();
    let map: {setPoint(p: MapPoint): void; markCenter(): void; destroy(): void} | undefined;
    let unsubscribe: (() => void) | undefined;
    const abort = new AbortController();
    const send = (type: string, extra: Record<string, unknown> = {}) => {
      if (!disposed) window.parent.postMessage({type, token, property_id: propertyId, ...extra}, SITE_ORIGIN);
    };
    const error = (text: string) => {if (!disposed) {setMessage(text); send('mbl-map-error', {error: text});}};
    async function start(data: Record<string, unknown>) {
      if (started || typeof data.token !== 'string' || !/^[a-f0-9-]{36}$/.test(data.token) ||
          data.property_id !== propertyId ||
          data.initial !== null && !validMapPoint(data.initial)) return;
      started = true; token = data.token; setLoading(true); setCanLoad(false); setMessage('Carregando Google Maps…');
      try {
        const response = await fetch('/api/maps/bootstrap', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({action: 'load_google_map', property_id: propertyId, data_sharing_confirmed: true}),
        });
        const payload = await response.json() as {browser_key?: string; error?: string};
        if (!response.ok) throw new Error(payload.error || 'Google Maps indisponível.');
        if (disposed || !canvas.current) return;
        if (typeof payload.browser_key !== 'string') throw new Error('Google Maps indisponível.');
        const api = await import('../../../lib/google-maps-browser');
        if (disposed) return;
        unsubscribe = api.listenForMapsAuthFailure(() => {
          map?.destroy(); map = undefined;
          error('O Google recusou o mapa. Confira a configuração com o proprietário ou use OpenStreetMap.');
        });
        const maps = await api.loadGoogleMaps(payload.browser_key);
        delete payload.browser_key;
        if (disposed || !canvas.current) return;
        map = api.createGooglePointMap(maps, canvas.current, data.initial as MapPoint | null, point => send('mbl-map-point', {point}));
        setMessage(''); setLoading(false); send('mbl-map-ready');
      } catch (failure) {
        if (!disposed && !abort.signal.aborted) {setLoading(false); error((failure as Error).message || 'Google Maps indisponível.');}
      }
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== SITE_ORIGIN || event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
      const data = event.data as Record<string, unknown>;
      if (data.property_id !== propertyId) return;
      if (data.type === 'mbl-map-init' && data.frame_id === frameId && !started && !token && typeof data.token === 'string' && /^[a-f0-9-]{36}$/.test(data.token) && (data.initial === null || validMapPoint(data.initial))) {
        token = data.token;
        // An iframe load or postMessage never starts Google. Only this frame's informed button does.
        load.current = () => {void start(data);};
        setMessage('O Google receberá seu IP, a área visualizada e as coordenadas do ponto. O carregamento pode gerar cobrança na conta configurada pelo proprietário.');
        setCanLoad(true);
        return;
      }
      if (!token || data.token !== token) return;
      if (data.type === 'mbl-map-set-point' && validMapPoint(data.point)) map?.setPoint(data.point);
      if (data.type === 'mbl-map-center') map?.markCenter();
    };
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape' && token) send('mbl-map-close');};
    window.addEventListener('message', receive);
    window.addEventListener('keydown', escape);
    window.parent.postMessage({type: 'mbl-map-frame-ready', property_id: propertyId, frame_id: frameId}, SITE_ORIGIN);
    return () => {disposed = true; abort.abort(); load.current = null; unsubscribe?.(); map?.destroy(); window.removeEventListener('message', receive); window.removeEventListener('keydown', escape);};
  }, [propertyId]);
  return <main className="google-map-frame"><div ref={canvas} className="google-map-canvas" aria-label="Mapa do Google para selecionar o ponto"/>{message && <section className="google-map-frame-message"><p role="status">{message}</p>{canLoad && <button type="button" className="button" disabled={loading} onClick={() => load.current?.()}>Carregar Google Maps</button>}</section>}</main>;
}
