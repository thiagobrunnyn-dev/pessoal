import {uppercasePersonText} from './person-text';
import catalog from './data/ibge-municipalities.json';
import {BRAZIL_STATES} from './brazil-states';
import {RequestError} from './http-security';

export type City = {id: string; name: string};
export function citiesForState(state: string): readonly City[] {
  if (!Object.hasOwn(BRAZIL_STATES, state)) throw new RequestError('Selecione uma UF válida.');
  return catalog.states[state as keyof typeof catalog.states];
}
export const citySource = {name: 'IBGE', url: catalog.source, retrieved_at: catalog.retrieved_at};
export function validateSelectedCity(form: FormData, state: string, city: string | number | null) {
  if (!form.has('city_code')) return;
  const values = form.getAll('city_code');
  if (values.length !== 1 || typeof values[0] !== 'string') throw new RequestError('Escolha novamente a cidade.');
  const code = values[0];
  if (!code) return;
  const selected = /^\d{7}$/.test(code) ? citiesForState(state).find(item => item.id === code) : undefined;
  if (!selected || typeof city !== 'string' || uppercasePersonText(selected.name) !== uppercasePersonText(city) || !form.has('city')) throw new RequestError('A cidade selecionada não corresponde à UF. Escolha novamente ou informe manualmente.');
}
