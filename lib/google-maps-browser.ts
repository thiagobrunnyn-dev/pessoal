// SDK insertion is only invoked in the authenticated /mapa/editor frame after its consent button.
export type MapPoint = {latitude: number; longitude: number; accuracy_m?: number | null};
type LatLng = {lat(): number; lng(): number};
type Pixel = {x: number; y: number};
type Listener = {remove(): void};
type GoogleMap = {addListener(name: string, handler: (e: {latLng?: LatLng}) => void): Listener; setCenter(p: LatLng | {lat: number; lng: number}): void; setZoom(zoom: number): void; getCenter(): LatLng | undefined};
type Overlay = {
  setMap(map: GoogleMap | null): void;
  getPanes(): {overlayMouseTarget: HTMLElement} | null;
  getProjection(): {fromLatLngToDivPixel(p: LatLng): Pixel | null; fromLatLngToContainerPixel(p: LatLng): Pixel | null; fromContainerPixelToLatLng(p: Pixel): LatLng | null};
};
type Maps = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  LatLng: new (lat: number, lng: number) => LatLng;
  Point: new (x: number, y: number) => Pixel;
  OverlayView: {new (): Overlay; preventMapHitsAndGesturesFrom(element: HTMLElement): void};
  event: {clearInstanceListeners(instance: unknown): void};
};
type MapsWindow = Window & {google?: {maps?: Maps}; __mblGoogleReady?: () => void; gm_authFailure?: () => void};
let sdk: Promise<Maps> | null = null;
const authListeners = new Set<() => void>();
let failed = false;
export const validMapPoint = (value: unknown): value is MapPoint => {
  if (!value || typeof value !== 'object') return false;
  const p = value as MapPoint;
  return Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 &&
    (p.accuracy_m === undefined || p.accuracy_m === null || Number.isFinite(p.accuracy_m) && p.accuracy_m >= 0);
};
export function listenForMapsAuthFailure(callback: () => void) {
  authListeners.add(callback);
  if (failed) callback();
  return () => {authListeners.delete(callback);};
}
export function loadGoogleMaps(browserKey: string): Promise<Maps> {
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    const target = window as MapsWindow;
    const script = document.createElement('script');
    const fail = () => {
      failed = true;
      script.remove();
      for (const callback of authListeners) callback();
      reject(new Error('Google Maps não carregou. Use OpenStreetMap ou feche e tente novamente.'));
    };
    const timer = window.setTimeout(fail, 15000);
    target.gm_authFailure = () => {window.clearTimeout(timer); fail();};
    target.__mblGoogleReady = () => {
      window.clearTimeout(timer);
      if (failed) return;
      const maps = target.google?.maps;
      if (!maps?.Map || !maps.OverlayView) {fail(); return;}
      resolve(maps);
    };
    const url = new URL('https://maps.googleapis.com/maps/api/js');
    url.search = new URLSearchParams({key: browserKey, loading: 'async', callback: '__mblGoogleReady',
      v: 'quarterly', language: 'pt-BR', region: 'BR', auth_referrer_policy: 'origin'}).toString();
    script.async = true;
    script.referrerPolicy = 'origin';
    script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || '';
    script.onerror = () => {window.clearTimeout(timer); fail();};
    script.src = url.toString();
    // URL, response and key are not logged, persisted or put into React props/storage.
    document.head.appendChild(script);
  });
  return sdk;
}
export function createGooglePointMap(maps: Maps, container: HTMLElement, initial: MapPoint | null, onSelect: (point: MapPoint) => void) {
  const map = new maps.Map(container, {
    center: initial ? {lat: initial.latitude, lng: initial.longitude} : {lat: -14.235, lng: -51.9253},
    zoom: initial ? 16 : 4, mapTypeId: 'roadmap', renderingType: 'RASTER',
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    clickableIcons: false, keyboardShortcuts: true,
  });
  class Pin extends maps.OverlayView {
    position: LatLng | null = null;
    button = document.createElement('button');
    drag: null | {id: number; clientX: number; clientY: number; pixel: Pixel} = null;
    constructor() {
      super();
      this.button.type = 'button';
      this.button.className = 'google-property-pin';
      this.button.setAttribute('aria-label', 'Ponto do imóvel: arraste ou use as setas para ajustar');
      const dot = document.createElement('span'); dot.setAttribute('aria-hidden', 'true'); this.button.appendChild(dot);
      maps.OverlayView.preventMapHitsAndGesturesFrom(this.button);
      this.button.addEventListener('pointerdown', this.down);
      this.button.addEventListener('pointermove', this.move);
      this.button.addEventListener('pointerup', this.up);
      this.button.addEventListener('pointercancel', this.up);
      this.button.addEventListener('keydown', this.key);
      this.setMap(map);
    }
    onAdd() {this.getPanes()?.overlayMouseTarget.appendChild(this.button);}
    draw() {
      const p = this.position && this.getProjection().fromLatLngToDivPixel(this.position);
      this.button.style.display = p ? 'grid' : 'none';
      if (p) {this.button.style.left = `${p.x}px`; this.button.style.top = `${p.y}px`;}
    }
    onRemove() {
      this.button.removeEventListener('pointerdown', this.down);
      this.button.removeEventListener('pointermove', this.move);
      this.button.removeEventListener('pointerup', this.up);
      this.button.removeEventListener('pointercancel', this.up);
      this.button.removeEventListener('keydown', this.key);
      this.button.remove(); this.drag = null;
    }
    down = (event: PointerEvent) => {
      if (!this.position || event.button !== 0) return;
      const pixel = this.getProjection().fromLatLngToContainerPixel(this.position);
      if (!pixel) return;
      event.preventDefault();
      this.drag = {id: event.pointerId, clientX: event.clientX, clientY: event.clientY, pixel};
      this.button.setPointerCapture(event.pointerId);
    };
    move = (event: PointerEvent) => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      event.preventDefault();
      const p = this.getProjection().fromContainerPixelToLatLng(new maps.Point(
        this.drag.pixel.x + event.clientX - this.drag.clientX, this.drag.pixel.y + event.clientY - this.drag.clientY,
      ));
      if (p) select(p.lat(), p.lng(), null);
    };
    up = (event: PointerEvent) => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      this.drag = null;
      if (this.button.hasPointerCapture(event.pointerId)) this.button.releasePointerCapture(event.pointerId);
    };
    key = (event: KeyboardEvent) => {
      if (!this.position || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const p = this.getProjection().fromLatLngToContainerPixel(this.position); if (!p) return;
      const step = event.shiftKey ? 20 : 5;
      const next = this.getProjection().fromContainerPixelToLatLng(new maps.Point(
        p.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        p.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
      ));
      if (next) select(next.lat(), next.lng(), null);
    };
  }
  const pin = new Pin();
  function select(latitude: number, longitude: number, accuracy_m: number | null = null) {
    const point = {latitude, longitude: ((longitude + 180) % 360 + 360) % 360 - 180, accuracy_m};
    if (!validMapPoint(point)) return;
    pin.position = new maps.LatLng(point.latitude, point.longitude);
    if (pin.getPanes()) pin.draw();
    onSelect(point);
  }
  const click = map.addListener('click', event => {if (event.latLng) select(event.latLng.lat(), event.latLng.lng());});
  if (initial) {
    pin.position = new maps.LatLng(initial.latitude, initial.longitude);
    if (pin.getPanes()) pin.draw();
  }
  return {
    setPoint(point: MapPoint) {
      select(point.latitude, point.longitude, point.accuracy_m ?? null);
      map.setCenter({lat: point.latitude, lng: point.longitude}); map.setZoom(17);
    },
    markCenter() {const center = map.getCenter(); if (center) select(center.lat(), center.lng());},
    destroy() {click.remove(); pin.setMap(null); maps.event.clearInstanceListeners(map); container.replaceChildren();},
  };
}
