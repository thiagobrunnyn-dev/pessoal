import {getCleaningShare,recordCleaningOpen} from '../../../../lib/cleaning-security';
import {ShareCleaning} from '../../../cleaning';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params,share=await getCleaningShare(token);if(!share)return <main className="tech-shell"><section className="panel"><h1>Consulta indisponível</h1><p>Este QR foi desativado ou não é válido. Consulte o responsável pelo local.</p></section></main>;await recordCleaningOpen(share.id);return <ShareCleaning key={token} token={token}/>;}
