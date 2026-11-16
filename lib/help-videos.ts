// Short help videos of the panel ("Ver como funciona"). The files live in public/ajuda and show
// real screens with fictitious data, so they carry nothing private. Each screen opens the video
// of its module; the other videos stay one click away in the same window.

export type HelpVideo = {
  id: string;
  title: string;
  summary: string;
  /** Public path of the MP4 file. */
  file: string;
  /** Length shown beside the title, in seconds. */
  seconds: number;
  /** Screens of this module: an exact path, or a prefix ending in "/" for the screens under it. */
  routes: string[];
};

export const HELP_VIDEOS: HelpVideo[] = [
  {
    id: 'visao-geral',
    title: 'Visão geral',
    summary: 'Indicadores da operação, filtros e o que precisa de atenção.',
    file: '/ajuda/01-visao-geral.mp4',
    seconds: 19,
    routes: ['/'],
  },
  {
    id: 'imoveis-hospedagem',
    title: 'Imóveis e hospedagem',
    summary: 'Cadastro dos imóveis, ocupação por endereço, quartos e hóspedes.',
    file: '/ajuda/02-imoveis-hospedagem.mp4',
    seconds: 12,
    routes: ['/imoveis', '/imoveis/importar', '/ocupacao', '/hospedes', '/mobilizacoes', '/entregas'],
  },
  {
    id: 'vistorias-laudos',
    title: 'Vistorias e laudos',
    summary: 'Vistorias na ficha do imóvel, pendências, e os laudos de serviços.',
    file: '/ajuda/03-vistorias-laudos.mp4',
    seconds: 11,
    routes: ['/imoveis/', '/servicos-laudos', '/prestadores'],
  },
  {
    id: 'solicitacoes-servicos',
    title: 'Solicitações e serviços',
    summary: 'Pedidos de manutenção e compra, e o andamento das ordens de serviço.',
    file: '/ajuda/04-solicitacoes-servicos.mp4',
    seconds: 12,
    routes: ['/solicitacoes', '/ordens', '/hoje'],
  },
  {
    id: 'modulos-acessos',
    title: 'Módulos e acessos',
    summary: 'Cadastros de apoio e quem acessa cada parte do painel.',
    file: '/ajuda/05-modulos-acessos.mp4',
    seconds: 11,
    routes: ['/cadastros', '/equipe', '/pessoas', '/veiculos'],
  },
  {
    id: 'dia-ou-noite',
    title: 'Dia ou noite',
    summary: 'O visual claro e o escuro, trocados pelo botão no alto da tela.',
    file: '/ajuda/06-dia-ou-noite.mp4',
    seconds: 9,
    routes: [],
  },
];

/**
 * Video of the screen at `pathname`. An exact path wins over a prefix, and the longest prefix
 * wins over a shorter one. A screen without a video of its own gets the overview.
 */
export function helpVideoFor(pathname: string | null | undefined): HelpVideo {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  let best: HelpVideo | undefined, bestLength = 0;
  for (const video of HELP_VIDEOS) {
    for (const route of video.routes) {
      if (route === path) return video;
      // "/imoveis/" covers every property sheet; the import screen is listed by its exact path.
      if (route.length > 1 && route.endsWith('/') && path.startsWith(route) && route.length > bestLength) {
        best = video;
        bestLength = route.length;
      }
    }
  }
  return best || HELP_VIDEOS[0];
}

/** "0:19" for the list of videos. */
export function helpVideoLength(seconds: number): string {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
