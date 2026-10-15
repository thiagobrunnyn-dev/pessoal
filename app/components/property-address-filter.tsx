'use client';
import {useId, useState} from 'react';
import {matchPropertyAddress, type PropertyAddressOption} from '../../lib/property-address-options';
import './property-address-filter.css';

export default function PropertyAddressFilter({options, value, onChange, disabled = false}: {options: PropertyAddressOption[]; value: string; onChange: (id: string) => void; disabled?: boolean}) {
  const [query, setQuery] = useState('');
  const id = useId(), selected = options.find(option => option.id === value);
  const matches = options.filter(option => matchPropertyAddress(option, query));
  const visible = selected && !matches.some(option => option.id === value) ? [selected, ...matches] : matches;
  return <div className="property-address-filter">
    <label className="field"><span>Procurar endereço cadastrado</span><input type="search" value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} placeholder="Digite parte da rua, número ou cidade" aria-describedby={id + '-hint'} autoComplete="off"/></label>
    <label className="field"><span>Escolher endereço</span><select value={value} disabled={disabled} onChange={event => onChange(event.target.value)} aria-describedby={id + '-selection'}><option value="">Todos os endereços</option>{value && !selected && <option value={value}>Endereço selecionado indisponível</option>}{visible.map(option => <option key={option.id} value={option.id}>{option.control_number ? String(option.control_number).padStart(2, '0') + ' · ' : ''}{option.address}{option.historical ? ' · histórico' : ''}</option>)}</select></label>
    <p className="muted" id={id + '-hint'}>{query && !matches.length ? 'Nenhum endereço corresponde à busca. Limpe o texto para ver a lista.' : 'Escolha na lista para filtrar os ciclos deste imóvel.'}</p>
    <p className="address-filter-selection" id={id + '-selection'}>{selected ? selected.address + (selected.historical ? ' · Endereço preservado no histórico.' : '') : value ? 'Este endereço não está mais disponível no seu acesso. Selecione outro ou Todos os endereços.' : 'Todos os endereços permitidos pelo seu acesso.'}</p>
  </div>;
}
