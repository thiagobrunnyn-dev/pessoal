import type {Metadata} from 'next';
import GuestChannelForm from '../../components/guest-channel-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: {absolute: 'Canal de solicitações | MOBILIZA FACILITIES'},
  description: 'Solicite manutenção ou melhorias no imóvel. Informações e fotos recebidas de forma privada pela gestão.',
  robots: {index: false, follow: false}, referrer: 'no-referrer',
};

export default async function Page({params}: {params: Promise<{token: string}>}) {
  const {token} = await params;
  return <GuestChannelForm key={token} token={token}/>;
}
