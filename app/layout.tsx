import type {Metadata,Viewport} from 'next';
import {headers} from 'next/headers';
import {hubThemeFromCookie} from '../lib/hub-theme';
import ThemeToggle from './components/theme-toggle';
import './globals.css';
import './globals.dark.css';
import './google-maps.css';
import './google-maps.dark.css';
import './theme.css';
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
// The look (dark by default) is a per-browser preference kept in a cookie. Rendering it on <html>
// here means the first paint already has it; the theme button only flips the attribute.
export default async function RootLayout({children}:{children:React.ReactNode}){const theme=hubThemeFromCookie((await headers()).get('cookie'));return <html lang="pt-BR" data-theme={theme} suppressHydrationWarning><head><link rel="preload" as="font" type="font/woff2" href="/fonts/dm-sans-468d56b6b25b.woff2" crossOrigin="anonymous"/><link rel="preload" as="font" type="font/woff2" href="/fonts/manrope-e310b55a7fd9.woff2" crossOrigin="anonymous"/></head><body>{children}<ThemeToggle floating/></body></html>;}
