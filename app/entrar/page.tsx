import type {Metadata} from 'next';
import SignIn from './sign-in';
export const metadata:Metadata={title:'Entrar'};
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;const raw=params.return_to;const returnTo=typeof raw==='string'?raw:null;
 return <SignIn returnTo={returnTo}/>;
}
