import type {Metadata,Viewport} from 'next';
import './globals.css';
import './google-maps.css';
export const metadata:Metadata={
 title:{default:'MOBILIZA GESTÃO',template:'%s | MOBILIZA GESTÃO'},
 description:'Painel dos controles da Mobiliza: centrais de ar, lavanderia e limpeza de imóveis.',
 applicationName:'MOBILIZA GESTÃO',
 robots:{index:false,follow:false},
 manifest:'/manifest.webmanifest',
 appleWebApp:{capable:true,title:'MOBILIZA GESTÃO',statusBarStyle:'default'},
 icons:{icon:[{url:'/icons/favicon-symbol-32-v54.png',sizes:'32x32',type:'image/png'},{url:'/icons/favicon-symbol-16-v54.png',sizes:'16x16',type:'image/png'}],apple:[{url:'/icons/apple-touch-symbol-180-v54.png',sizes:'180x180',type:'image/png'}]},
 other:{'apple-mobile-web-app-capable':'yes'}
};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#ed641a'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><head><link rel="preload" as="font" type="font/woff2" href="/fonts/dm-sans-468d56b6b25b.woff2" crossOrigin="anonymous"/><link rel="preload" as="font" type="font/woff2" href="/fonts/manrope-e310b55a7fd9.woff2" crossOrigin="anonymous"/></head><body>{children}</body></html>;}
