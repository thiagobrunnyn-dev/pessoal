import {getOperator, recheckOperator} from '../../../../lib/app-access';
import {citiesForState, citySource} from '../../../../lib/city-catalog';
import {isRegionalRequest} from '../../../../lib/regional-access';
import {noCache} from '../../../../lib/maintenance';
import {RequestError} from '../../../../lib/http-security';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const reply = (value: unknown, status = 200) => Response.json(value, {status, headers: noCache});
  try {
    const operator = await getOperator();
    if (!operator) return reply({error: 'Acesso restrito à gestão autorizada.'}, 401);
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => key !== 'state_code') || query.getAll('state_code').length !== 1) throw new RequestError('Selecione uma UF válida.');
    const state = query.get('state_code') || '';
    if (isRegionalRequest() && state !== 'PA') throw new RequestError('Este acesso permite consultar cidades do Pará.', 403);
    const cities = citiesForState(state);
    await recheckOperator(operator);
    return reply({state_code: state, cities, source: citySource});
  } catch (error) {
    return reply({error: error instanceof RequestError ? error.message : 'A lista de cidades está indisponível. Você pode informar a cidade manualmente.'}, error instanceof RequestError ? error.status : 503);
  }
}
