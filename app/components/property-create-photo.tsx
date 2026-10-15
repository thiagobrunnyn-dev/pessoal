'use client';
import {useEffect, useRef, useState} from 'react';
import {PropertyFrontPhotoPicker} from './property-details-fields';
import {prepareMobilizationPhoto} from '../mobilization-form';
import './property-create-photo.css';

/** Preparation stays on this device. Never fall back to the original image. */
export async function prepareFrontPhoto(file: File) {
  const prepared = await prepareMobilizationPhoto(file);
  return new File([prepared], 'frente-imovel.jpg', {type: 'image/jpeg'});
}

/** One creation attempt keeps its UUID through errors, including an uncertain response. */
export function usePropertyCreateDraft() {
  const [file, updateFile] = useState<File | null>(null);
  const [preparing, updatePreparing] = useState(false);
  const photo = useRef<File | null>(null);
  const preparation = useRef(false);
  const pending = useRef(false);
  const request = useRef('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  function setFile(next: File | null) {
    if (!active.current || pending.current) return;
    photo.current = next;
    updateFile(next);
  }
  function setPreparing(next: boolean) {
    if (!active.current) return;
    preparation.current = next;
    updatePreparing(next);
  }
  function begin(form: FormData) {
    if (!active.current || pending.current || preparation.current) return null;
    // Delete even unexpected native file fields, then attach only the prepared selection.
    form.delete('front_photo');
    form.delete('front_photo_camera');
    form.set('action', 'property');
    if (!request.current) request.current = crypto.randomUUID();
    form.set('request_id', request.current);
    if (photo.current) form.set('front_photo', photo.current, 'frente-imovel.jpg');
    pending.current = true;
    return form;
  }
  function finish() { pending.current = false; }
  function reset() {
    if (!active.current || pending.current) return;
    request.current = '';
    photo.current = null;
    preparation.current = false;
    updateFile(null);
    updatePreparing(false);
  }
  return {file, preparing, setFile, setPreparing, begin, finish, reset,
    isActive: () => active.current, isPending: () => pending.current};
}

export function PropertyCreatePhotoField({draft, disabled = false}: {
  draft: ReturnType<typeof usePropertyCreateDraft>;
  disabled?: boolean;
}) {
  return <div className="property-create-photo">
    <PropertyFrontPhotoPicker file={draft.file} onChange={draft.setFile}
      onPreparingChange={draft.setPreparing} preparePhoto={prepareFrontPhoto} disabled={disabled}/>
    <p className="muted property-create-photo-help">Uma foto da fachada, privada para a gestão autorizada. Evite pessoas e documentos. A imagem só será enviada ao tocar em Salvar imóvel.</p>
  </div>;
}
