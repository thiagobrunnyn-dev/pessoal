'use client';
import PhotoFileControls from './photo-file-controls';
import {useEffect, useRef, useState} from 'react';
import {PROPERTY_LEVELS} from '../../lib/property-capacity';
import {PROPERTY_TYPES} from '../../lib/property-type';
import {type PropertyCounts, propertyCountLabel} from '../../lib/property-details';

/** Mount in each EXISTING property create form; editing uses the correction form. */
export function PropertyCountFields({values, disabled = false}: {values?: PropertyCounts; disabled?: boolean}) {
  return <><label className="field"><span>Tipo de imóvel (opcional)</span><select name="property_type" defaultValue="" disabled={disabled}><option value="">Não informado</option>{Object.entries(PROPERTY_TYPES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><div className="two-col"><label className="field"><span>Nível (opcional)</span><select name="property_level" defaultValue="" disabled={disabled}><option value="">Não informado</option>{Object.entries(PROPERTY_LEVELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label className="field"><span>Quantidade total de vagas declaradas (opcional)</span><input name="declared_slots" type="number" inputMode="numeric" min={0} step={1} max={Number.MAX_SAFE_INTEGER} disabled={disabled}/><small>Total declarado do imóvel. Não cria quartos ou altera a ocupação.</small></label></div><div className="two-col">
    <label className="field"><span>Quantidade de quartos (opcional)</span>
      <input name="bedrooms" type="number" inputMode="numeric" min={0} step={1} max={Number.MAX_SAFE_INTEGER}
        defaultValue={values?.bedrooms ?? ''} disabled={disabled}/>
    </label>
    <label className="field"><span>Quantidade de banheiros (opcional)</span>
      <input name="bathrooms" type="number" inputMode="numeric" min={0} step={1} max={Number.MAX_SAFE_INTEGER}
        defaultValue={values?.bathrooms ?? ''} disabled={disabled}/>
    </label>
  </div></>;
}

export function PropertyCountSummary({values}: {values: PropertyCounts}) {
  return <dl className="specs">
    <div><dt>Quartos</dt><dd>{propertyCountLabel(values.bedrooms)}</dd></div>
    <div><dt>Banheiros</dt><dd>{propertyCountLabel(values.bathrooms)}</dd></div>
  </dl>;
}

/** Supply the existing prepareProfilePhoto function to reuse its 640px canvas path.
 * Mount with key={propertyId}; the owning details form submits the prepared File.
 * This component deliberately contains no fetch, form, GPS, auth, or public URL.
 */
export function PropertyFrontPhotoPicker({file, onChange, onPreparingChange, preparePhoto, disabled = false}: {
  file: File | null;
  onChange: (file: File | null) => void;
  onPreparingChange: (preparing: boolean) => void;
  preparePhoto: (file: File) => Promise<File>;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const preparingCallback = useRef(onPreparingChange);
  preparingCallback.current = onPreparingChange;
  useEffect(() => () => { generation.current++; preparingCallback.current(false); }, []);
  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : '';
    setPreview(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [file]);
  async function select(file: File | undefined) {
    if (!file || disabled) return;
    const ownGeneration = ++generation.current;
    setBusy(true); preparingCallback.current(true); setError('');
    try {
      const prepared = await preparePhoto(file);
      if (ownGeneration !== generation.current) return;
      onChange(new File([prepared], 'frente-imovel.jpg', {type: prepared.type}));
    } catch (cause) {
      if (ownGeneration === generation.current) setError(cause instanceof Error ? cause.message : 'Não foi possível preparar a foto.');
    } finally {
      if (ownGeneration === generation.current) { setBusy(false); preparingCallback.current(false); }
    }
  }
  function cancel() {
    generation.current++;
    setBusy(false); preparingCallback.current(false); setError(''); onChange(null);
  }
  return <fieldset className="clean-inset" disabled={disabled}>
    <legend>Foto da frente do imóvel (opcional)</legend>
    <p className="muted">Fotografe a fachada para ajudar a identificar o imóvel.</p>
    <PhotoFileControls disabled={disabled||busy} onSelect={input=>{const chosen=input.files?.[0];input.value='';return select(chosen);}}/>
    {busy && <p role="status">Preparando foto…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {preview && <img src={preview} alt="Prévia da frente do imóvel" loading="lazy" decoding="async"
      width={240} height={160} style={{objectFit: 'contain', maxWidth: '100%'}}/>}
    {(file || busy) && <button type="button" className="button secondary" onClick={cancel}>
      {busy ? 'Cancelar seleção' : 'Descartar foto selecionada'}
    </button>}
  </fieldset>;
}

/** The server supplies a visible asset ID, never an R2 key or a public bucket URL. */
export function PropertyFrontPhotoThumbnail({assetId}: {assetId: string | null}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [assetId]);
  if (!assetId) return <p className="muted">Foto da frente não informada.</p>;
  if (failed) return <p className="muted">Foto indisponível neste acesso. Atualize a ficha para conferir.</p>;
  const url = '/api/property-front-photo/' + encodeURIComponent(assetId);
  return <a href={url} target="_blank" rel="noopener noreferrer" className="identification-photo">
    <img src={url} alt="Frente do imóvel" loading="lazy" decoding="async" width={240} height={160}
      referrerPolicy="no-referrer" onError={() => setFailed(true)}
      style={{objectFit: 'contain', maxWidth: '100%'}}/>
    <span>Ampliar foto da frente</span>
  </a>;
}
