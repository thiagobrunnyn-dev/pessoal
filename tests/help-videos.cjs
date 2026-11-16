/* eslint-disable @typescript-eslint/no-require-imports -- Use the CommonJS transpile harness shared by the backend suites. */
// Vídeos de ajuda ("Ver como funciona"): escolha por tela, arquivos publicados e botão nos cabeçalhos.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
function load(file) {
  const js = ts.transpileModule(read(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  const mod = {exports: {}};
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
  return mod.exports;
}
const {HELP_VIDEOS, helpVideoFor, helpVideoLength} = load('lib/help-videos.ts');

const report = [];
function test(name, body) {
  try {body(); report.push([name, true]);}
  catch (error) {report.push([name, false]); console.error('FAIL ' + name + '\n' + (error && error.stack || error));}
}

test('cada tela abre o vídeo do seu módulo', () => {
  const id = pathname => helpVideoFor(pathname).id;
  assert.equal(id('/'), 'visao-geral');
  assert.equal(id('/imoveis'), 'imoveis-hospedagem');
  assert.equal(id('/imoveis/'), 'imoveis-hospedagem');
  assert.equal(id('/imoveis/importar'), 'imoveis-hospedagem');
  assert.equal(id('/ocupacao'), 'imoveis-hospedagem');
  assert.equal(id('/imoveis/5eedda7a-0003-4000-8000-000000000002'), 'vistorias-laudos');
  assert.equal(id('/servicos-laudos'), 'vistorias-laudos');
  assert.equal(id('/solicitacoes'), 'solicitacoes-servicos');
  assert.equal(id('/ordens'), 'solicitacoes-servicos');
  assert.equal(id('/hoje'), 'solicitacoes-servicos');
  assert.equal(id('/cadastros'), 'modulos-acessos');
  assert.equal(id('/equipe'), 'modulos-acessos');
});

test('tela sem vídeo próprio, ou caminho ausente, abre a visão geral', () => {
  for (const pathname of ['/whatsapp', '/configuracoes', '/imoveisx', '/ordens/qualquer', '', null, undefined]) assert.equal(helpVideoFor(pathname).id, 'visao-geral', String(pathname));
});

test('lista: identificadores únicos, rotas sem repetição e duração legível', () => {
  assert.equal(new Set(HELP_VIDEOS.map(video => video.id)).size, HELP_VIDEOS.length);
  const routes = HELP_VIDEOS.flatMap(video => video.routes);
  assert.equal(new Set(routes).size, routes.length);
  for (const video of HELP_VIDEOS) {
    assert.ok(video.title && video.summary, video.id);
    assert.ok(Number.isInteger(video.seconds) && video.seconds > 0 && video.seconds < 120, video.id);
  }
  assert.equal(helpVideoLength(19), '0:19');
  assert.equal(helpVideoLength(9), '0:09');
  assert.equal(helpVideoLength(75), '1:15');
});

test('cada vídeo da lista existe em public/ajuda, é MP4 e é leve', () => {
  for (const video of HELP_VIDEOS) {
    assert.match(video.file, /^\/ajuda\/[a-z0-9-]+\.mp4$/);
    const bytes = fs.readFileSync(path.join(root, 'public', video.file));
    // Caixa "ftyp" no início: é um MP4 de verdade, com o índice na frente para tocar sem baixar tudo.
    assert.equal(bytes.subarray(4, 8).toString('latin1'), 'ftyp', video.file);
    assert.ok(bytes.indexOf(Buffer.from('moov')) < bytes.indexOf(Buffer.from('mdat')), video.file + ': índice depois dos dados');
    assert.ok(bytes.length < 3 * 1024 * 1024, video.file + ' passa de 3 MB');
  }
  const published = fs.readdirSync(path.join(root, 'public/ajuda')).sort();
  assert.deepEqual(published, HELP_VIDEOS.map(video => video.file.slice('/ajuda/'.length)).sort());
});

test('o botão está no cabeçalho das telas internas e no da visão geral, e some na impressão', () => {
  assert.match(read('app/components/app-shell.tsx'), /<HelpVideoButton\/>\s*<ThemeToggle\/>/);
  assert.match(read('app/hub.tsx'), /<HelpVideoButton\/><ThemeToggle\/>/);
  const component = read('app/components/help-video.tsx');
  // O arquivo só é pedido depois do clique: o vídeo fica dentro da janela, que só existe aberta.
  assert.match(component, /\{video && \(\s*<dialog/);
  assert.match(component, /Demonstração com dados fictícios/);
  assert.match(read('app/theme.css'), /@media print\{[\s\S]*\.theme-toggle,\.help-video-button\{display:none\}/);
  assert.match(read('public/_headers'), /\/ajuda\/\*\n\s+Cache-Control: public, max-age=86400/);
});

console.log(JSON.stringify({passed: report.filter(item => item[1]).length, total: report.length}));
if (report.some(item => !item[1])) process.exitCode = 1;
