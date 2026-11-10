import {requireAdministrator} from '../../lib/app-access';
import Settings from './settings';
export const dynamic='force-dynamic';
export const metadata={title:'Configurações e integração n8n | Mobiliza'};
export default async function Page(){await requireAdministrator('/configuracoes');return <Settings/>;}
