'use client';

import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent} from 'react';

type SignaturePadProps = {
  onChange: (file: File | null) => void;
  disabled?: boolean;
  resetKey?: string;
};

const WIDTH = 960;
const HEIGHT = 320;
const INK = '#172b35';
const LINE_WIDTH = 4;
type Point = {x: number; y: number};
type Stroke = {
  pointerId: number;
  previous: Point;
  before: ImageData;
  hadInk: boolean;
};
type Status = 'empty' | 'drawing' | 'preparing' | 'ready' | 'error';

function whiteBackground(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, WIDTH, HEIGHT);
}

function releasePointer(canvas: HTMLCanvasElement, pointerId: number) {
  // A cancelled pointer can already have been released by the browser.
  try {
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  } catch {
    // Nothing remains to release when the pointer or canvas has disappeared.
  }
}

function position(event: PointerEvent<HTMLCanvasElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(WIDTH, (event.clientX - bounds.left) * WIDTH / bounds.width)),
    y: Math.max(0, Math.min(HEIGHT, (event.clientY - bounds.top) * HEIGHT / bounds.height)),
  };
}

// A new key creates a blank canvas and invalidates all work from the old one.
// There is deliberately no initial image, import, storage or network interface.
export default function SignaturePad({onChange, disabled = false, resetKey}: SignaturePadProps) {
  return <SignatureCanvas key={resetKey} onChange={onChange} disabled={disabled}/>;
}

function SignatureCanvas({onChange, disabled}: Omit<SignaturePadProps, 'resetKey'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbackRef = useRef(onChange);
  const alive = useRef(false);
  const generation = useRef(0);
  const strokeRef = useRef<Stroke | null>(null);
  const inkRef = useRef(false);
  const [status, setStatus] = useState<Status>('empty');
  const labelId = useId();
  const instructionId = useId();
  const statusId = useId();

  useLayoutEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    alive.current = true;
    generation.current++;
    if (canvas) whiteBackground(canvas);
    callbackRef.current(null);
    return () => {
      alive.current = false;
      const stroke = strokeRef.current;
      strokeRef.current = null;
      inkRef.current = false;
      if (canvas) {
        if (stroke) releasePointer(canvas, stroke.pointerId);
        whiteBackground(canvas);
      }
    };
  }, []);

  const exportImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !inkRef.current || strokeRef.current) return;
    const currentGeneration = ++generation.current;
    setStatus('preparing');
    const isCurrent = () => alive.current && generation.current === currentGeneration && !strokeRef.current;
    const fail = () => {
      if (!isCurrent()) return;
      setStatus('error');
      callbackRef.current(null);
    };
    try {
      canvas.toBlob(blob => {
        if (!isCurrent()) return;
        if (!blob || blob.type !== 'image/png') {
          fail();
          return;
        }
        // Keep only the static picture. No stroke history or capture timestamps.
        const file = new File([blob], 'assinatura.png', {type: 'image/png', lastModified: 0});
        setStatus('ready');
        callbackRef.current(file);
      }, 'image/png');
    } catch {
      fail();
    }
  }, []);

  const cancelStroke = useCallback(() => {
    const canvas = canvasRef.current;
    const stroke = strokeRef.current;
    if (!canvas || !stroke) return;
    generation.current++;
    strokeRef.current = null;
    canvas.getContext('2d')?.putImageData(stroke.before, 0, 0);
    inkRef.current = stroke.hadInk;
    releasePointer(canvas, stroke.pointerId);
    if (stroke.hadInk) exportImage();
    else {
      setStatus('empty');
      callbackRef.current(null);
    }
  }, [exportImage]);

  useEffect(() => {
    // The active gesture is imperative browser state; interruption rolls it back.
    window.addEventListener('blur', cancelStroke);
    const visibilityChanged = () => {
      if (document.hidden) cancelStroke();
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      window.removeEventListener('blur', cancelStroke);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [cancelStroke]);

  useLayoutEffect(() => {
    // Synchronize an externally disabled field with its in-progress canvas gesture.
    if (disabled) cancelStroke();
  }, [disabled, cancelStroke]);

  function clear() {
    if (disabled) return;
    const canvas = canvasRef.current;
    generation.current++;
    const stroke = strokeRef.current;
    strokeRef.current = null;
    inkRef.current = false;
    if (canvas) {
      if (stroke) releasePointer(canvas, stroke.pointerId);
      whiteBackground(canvas);
    }
    setStatus('empty');
    callbackRef.current(null);
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || strokeRef.current || !event.isPrimary || event.button !== 0) return;
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const context = canvas.getContext('2d');
    if (!context) {
      setStatus('error');
      callbackRef.current(null);
      return;
    }
    const start = position(event);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    event.preventDefault();
    generation.current++;
    strokeRef.current = {
      pointerId: event.pointerId,
      previous: start,
      before: context.getImageData(0, 0, WIDTH, HEIGHT),
      hadInk: inkRef.current,
    };
    context.fillStyle = INK;
    context.beginPath();
    context.arc(start.x, start.y, LINE_WIDTH / 2, 0, Math.PI * 2);
    context.fill();
    inkRef.current = true;
    setStatus('drawing');
    // A parent must not submit an older picture while a new stroke is in progress.
    callbackRef.current(null);
  }

  function extend(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = strokeRef.current;
    if (disabled || !stroke || stroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const next = position(event);
    context.strokeStyle = INK;
    context.lineWidth = LINE_WIDTH;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(stroke.previous.x, stroke.previous.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    stroke.previous = next;
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    if (disabled) {
      cancelStroke();
      return;
    }
    extend(event);
    strokeRef.current = null;
    releasePointer(event.currentTarget, event.pointerId);
    exportImage();
  }

  function interrupted(event: PointerEvent<HTMLCanvasElement>) {
    if (strokeRef.current?.pointerId === event.pointerId) cancelStroke();
  }

  const messages: Record<Status, string> = {
    empty: 'Aguardando assinatura.',
    drawing: 'Assinando…',
    preparing: 'Preparando assinatura…',
    ready: 'Assinatura pronta para anexar.',
    error: 'Não foi possível preparar a assinatura. Limpe e assine novamente.',
  };

  return <fieldset className="signature-pad" disabled={disabled} aria-disabled={disabled} style={{border: 0, padding: 0, margin: 0, minWidth: 0, width: '100%'}}>
    <legend id={labelId} style={{padding: 0, fontWeight: 700, marginBottom: 8}}>Assinatura</legend>
    <p id={instructionId} style={{fontSize: 14, lineHeight: 1.5, margin: '0 0 10px', color: '#52626b'}}>
      Assine pessoalmente no ato, com o dedo, uma caneta ou o mouse. Use Limpar para refazer.
    </p>
    <div style={{border: '1px solid #acb8be', borderRadius: 10, background: '#fff', opacity: disabled ? 0.65 : 1}}>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={disabled ? 'Área de assinatura indisponível' : 'Área para desenhar sua assinatura'}
        aria-describedby={`${instructionId} ${statusId}`}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={begin}
        onPointerMove={extend}
        onPointerUp={finish}
        onPointerCancel={interrupted}
        onLostPointerCapture={interrupted}
        onKeyDown={event => {if (event.key === 'Escape') cancelStroke();}}
        style={{display: 'block', width: '100%', height: 'auto', aspectRatio: '3 / 1', borderRadius: 10, background: '#fff', touchAction: disabled ? 'auto' : 'none', userSelect: 'none', cursor: disabled ? 'default' : 'crosshair', outlineOffset: 3}}
      >Use um navegador com suporte a desenho para assinar pessoalmente.</canvas>
    </div>
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8}}>
      <p id={statusId} role="status" aria-live="polite" style={{fontSize: 13, lineHeight: 1.5, color: status === 'error' ? '#a12c24' : '#52626b', margin: 0}}>{messages[status]}</p>
      <button type="button" onClick={clear} disabled={disabled || status === 'empty'} aria-label="Limpar assinatura" style={{minHeight: 44, minWidth: 68, padding: '8px 12px', flexShrink: 0, border: '1px solid #cbd2d6', borderRadius: 8, background: '#fff', color: '#344852', font: 'inherit', cursor: disabled || status === 'empty' ? 'default' : 'pointer'}}>Limpar</button>
    </div>
  </fieldset>;
}
