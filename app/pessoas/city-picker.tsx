'use client';
import {uppercasePersonText} from '../../lib/person-text';
import {uppercaseFieldEvent, updateUppercaseField} from './uppercase-field';
import {useEffect, useId, useState} from 'react';
import {Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty} from '../../components/ui/combobox';

type City = {id: string; name: string};
const catalogs = new Map<string, readonly City[]>();
const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export default function CityPicker({stateCode, value, selectedCode, disabled, onChange}: {
  stateCode: string; value: string; selectedCode: string; disabled: boolean;
  onChange: (name: string, code: string) => void;
}) {
  const id = useId();
  const [cities, setCities] = useState<readonly City[]>(catalogs.get(stateCode) || []);
  const [loading, setLoading] = useState(!!stateCode && !catalogs.has(stateCode));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const request = new AbortController();
    if (!stateCode) {setCities([]); setLoading(false); return;}
    const cached = catalogs.get(stateCode);
    if (cached) {setCities(cached); setLoading(false); return;}
    setCities([]); setError(''); setLoading(true);
    const timeout = window.setTimeout(() => request.abort(), 12000);
    void fetch('/api/localities/cities?state_code='+encodeURIComponent(stateCode), {cache:'no-store', signal:request.signal})
      .then(async response => {
        const data = await response.json() as {state_code?: unknown; cities?: unknown};
        if (!response.ok || data.state_code !== stateCode || !Array.isArray(data.cities) || !data.cities.length || data.cities.length > 2000 || !data.cities.every((item: City) => item && typeof item.id==='string' && /^\d{7}$/.test(item.id) && typeof item.name==='string' && item.name.length>0 && item.name.length<=120)) throw new Error('Lista indisponível');
        if (!active) return;
        catalogs.set(stateCode, data.cities); setCities(data.cities);
      }).catch(() => {if (active) setError('A lista não carregou. Você pode digitar a cidade e salvar.');})
      .finally(() => {window.clearTimeout(timeout); if (active) setLoading(false);});
    return () => {active = false; window.clearTimeout(timeout); request.abort();};
  }, [stateCode, attempt]);
  const selected = cities.find(city => city.id===selectedCode) || null;
  return <div className="field people-city-field">
    <label htmlFor={id}>Cidade (opcional)</label>
    <Combobox items={cities} value={selected} inputValue={value} disabled={disabled} limit={50}
      itemToStringLabel={(city: City) => uppercasePersonText(city.name)} isItemEqualToValue={(a: City, b: City) => a.id===b.id}
      filter={(city: City, query: string) => normalized(city.name).includes(normalized(query))}
      onInputValueChange={(text, details) => {if (details.reason==='input-change') {const element=details.event?.target; updateUppercaseField(text, value => onChange(value, ''), element instanceof HTMLInputElement ? element : null, !!(details.event as InputEvent)?.isComposing);}}}
      onValueChange={(city: City | null) => {if (city) onChange(uppercasePersonText(city.name), city.id);}}>
      <ComboboxInput className="people-city-input" id={id} autoComplete="off" autoCapitalize="characters" onCompositionEnd={event => uppercaseFieldEvent(event, value => onChange(value, ''))} maxLength={120} disabled={disabled}
        showTrigger={cities.length>0} aria-describedby={id+'-help'} placeholder={stateCode?'Digite ou escolha a cidade':'Informe a cidade'} />
      <ComboboxContent className="people-city-popup">
        <ComboboxEmpty>{loading?'Carregando cidades…':'Nenhuma cidade encontrada. Você pode manter o texto digitado.'}</ComboboxEmpty>
        <ComboboxList>{(city: City) => <ComboboxItem key={city.id} value={city}>{uppercasePersonText(city.name)}</ComboboxItem>}</ComboboxList>
        <p className="people-city-source">Municípios do IBGE{stateCode?' · '+stateCode:''}. Digite para filtrar.</p>
      </ComboboxContent>
    </Combobox>
    <small id={id+'-help'}>{loading?'Carregando municípios…':error || (!stateCode?'Selecione a UF para buscar na lista. O preenchimento manual continua disponível.':selected?'Município selecionado na lista do IBGE.':'Busque pelo nome ou mantenha o preenchimento manual.')}</small>
    {error && <button type="button" className="text-button" disabled={disabled||loading} onClick={() => setAttempt(value => value+1)}>Tentar carregar a lista</button>}
  </div>;
}
