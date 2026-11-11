/* eslint-disable @typescript-eslint/no-require-imports -- Use the CommonJS transpile harness shared by the backend suites. */
// Tema global e estrutura comum das telas: folhas escuras geradas, layout por rota e menu lateral.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const {spawnSync} = require('node:child_process');
const React = require('react');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
function files(dir, test, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
    const child = dir + '/' + entry.name;
    if (entry.isDirectory()) files(child, test, out); else if (test.test(entry.name)) out.push(child);
  }
  return out;
}
function load(file, stubs = {}) {
  const js = ts.transpileModule(read(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText;
  const mod = {exports: {}};
  new Function('require', 'module', 'exports', 'React', js)(id => id in stubs ? stubs[id] : require(id), mod, mod.exports, React);
  return mod.exports;
}

const report = [];
async function test(name, body) {
  try {await body(); report.push([name, true]);}
  catch (error) {report.push([name, false]); console.error('FAIL ' + name + '\n' + (error && error.stack || error));}
}

// Telas da equipe (ganham o menu lateral) e telas de quem é de fora (ficam simples).
const FRAMED = ['arquivados', 'cadastros', 'centrais', 'configuracoes', 'entregas', 'equipamentos', 'equipe', 'gestao-a-vista', 'hoje', 'hospedes', 'imoveis', 'limpeza', 'mobilizacoes', 'ocupacao', 'ordens', 'pessoas', 'prestadores', 'servicos-laudos', 'solicitacoes', 'veiculos', 'whatsapp'];
const PLAIN = ['acesso', 'canal', 'entrar', 'formularios', 'mapa'];

(async () => {
  await test('as folhas escuras geradas estão em dia com as folhas claras', () => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-dark-theme.mjs'), '--check'], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });

  await test('cada folha escura só vale na tela, sob o tema escuro', () => {
    const sheets = files('app', /\.dark\.css$/);
    assert.ok(sheets.length >= 15, 'folhas geradas: ' + sheets.length);
    for (const sheet of sheets) {
      const css = read(sheet);
      assert.match(css, /^\/\* Generated from [\w.-]+\.css by scripts\/build-dark-theme\.mjs\./, sheet);
      assert.match(css, /\n@media screen\{\n/, sheet);
      const body = css.slice(css.indexOf('@media screen{') + 14);
      // Toda regra começa pelo seletor do tema escuro (dentro ou fora de @media aninhado).
      for (const line of body.split('\n')) {
        if (!line || line === '}' || line.startsWith('@')) continue;
        assert.ok(line.startsWith(':root[data-theme=dark]'), sheet + ': ' + line.slice(0, 80));
      }
      assert.ok(fs.existsSync(path.join(root, sheet.replace('.dark.css', '.css'))), 'sem folha clara: ' + sheet);
    }
  });

  await test('o papel continua claro: etiquetas e folhas de impressão não entram no tema', () => {
    const dark = read('app/globals.dark.css');
    assert.doesNotMatch(dark, /\.equipment-label|\.cleaning-print|\.clean-print-/);
    assert.doesNotMatch(dark, /@media[^{]*print/);
    // Âncoras do tema: página, cartão, texto e a cor da marca preservada nos botões.
    assert.match(dark, /:root\[data-theme=dark\] body\{background-color:#08121a;color:#e9f0f5\}/);
    assert.match(dark, /:root\[data-theme=dark\] \.panel\{background-color:#101e2b;/);
    assert.match(dark, /:root\[data-theme=dark\] \.button\{border-color:#ed641a;background-color:#ed641a;color:#ffffff\}/);
  });

  await test('quem importa uma folha clara importa a escura logo depois', () => {
    for (const file of files('app', /\.tsx?$/)) {
      const lines = read(file).split('\n');
      lines.forEach((line, index) => {
        const match = line.match(/^import '(\.[^']*?)\.css';?$/);
        if (!match || match[1].endsWith('.dark') || match[1].endsWith('.module')) return;
        const dark = path.join(path.dirname(path.join(root, file)), match[1] + '.dark.css');
        if (fs.existsSync(dark)) assert.equal(lines[index + 1], `import '${match[1]}.dark.css';`, file + ': ' + line);
      });
    }
  });

  await test('o tema vem do cookie e fica no <html>', () => {
    const layout = read('app/layout.tsx');
    assert.match(layout, /hubThemeFromCookie\(\(await headers\(\)\)\.get\('cookie'\)\)/);
    assert.match(layout, /<html lang="pt-BR" data-theme=\{theme\} suppressHydrationWarning>/);
    assert.match(layout, /<ThemeToggle floating\/>/);
    const theme = read('app/theme.css');
    assert.match(theme, /:root\[data-theme=dark\]\{\n color-scheme:dark;/);
    assert.match(theme, /@media print\{\n :root\[data-theme=dark\]\{\n {2}color-scheme:light;/);
    // A página institucional mantém a paleta própria.
    assert.match(read('app/public-home.tsx'), /document\.documentElement\.dataset\.theme='light'/);
    assert.match(theme, /body:has\(\[data-home-root\]\) \.theme-toggle-floating/);
  });

  await test('toda tela interna tem o layout da estrutura; as externas não', () => {
    for (const route of FRAMED) assert.match(read(`app/${route}/layout.tsx`), /export \{default\} from '\.\.\/components\/frame-layout';/, route);
    for (const route of PLAIN) assert.ok(!fs.existsSync(path.join(root, `app/${route}/layout.tsx`)), route);
    // Nenhuma pasta de rota interna ficou de fora.
    const routes = fs.readdirSync(path.join(root, 'app'), {withFileTypes: true}).filter(entry => entry.isDirectory() && !['api', 'components', ...FRAMED, ...PLAIN].includes(entry.name)).map(entry => entry.name);
    assert.deepEqual(routes, []);
  });

  await test('a estrutura só envolve a tela de quem tem acesso à gestão', async () => {
    const AppFrame = function AppFrame() {};
    const operator = {actor: {displayName: 'QA'}, title: 'Gestão'};
    let next = async () => operator;
    const {default: FrameLayout} = load('app/components/frame-layout.tsx', {'../../lib/app-access': {getOperator: () => next()}, './app-frame': {__esModule: true, default: AppFrame}});
    const screen = React.createElement('main', null, 'tela');
    const framed = await FrameLayout({children: screen});
    assert.equal(framed.type, AppFrame);
    assert.equal(framed.props.op, operator);
    assert.equal(framed.props.children, screen);
    next = async () => null;
    assert.equal(await FrameLayout({children: screen}), screen);
    next = async () => { throw new Error('Credencial expirada ou revogada.'); };
    assert.equal(await FrameLayout({children: screen}), screen);
  });

  await test('o menu lateral marca a área de cada tela', () => {
    const {menuTarget} = load('app/components/hub-navigation.tsx', {'next/navigation': {usePathname: () => '/'}, 'lucide-react': new Proxy({}, {get: () => () => null})});
    const cases = {'/': '/', '': '/', '/hoje': '/hoje', '/imoveis': '/imoveis', '/imoveis/abc': '/imoveis', '/imoveis/importar': '/imoveis', '/equipamentos/abc': '/centrais', '/limpeza/locais/abc': '/limpeza', '/pessoas': '/cadastros', '/hospedes': '/cadastros', '/prestadores': '/cadastros', '/veiculos': '/cadastros', '/arquivados': '/cadastros', '/configuracoes/mapas': '/configuracoes'};
    for (const [pathname, target] of Object.entries(cases)) assert.equal(menuTarget(pathname), target, pathname);
    const source = read('app/components/hub-navigation.tsx');
    for (const href of ['/hoje', '/centrais', '/ordens', '/limpeza', '/servicos-laudos', '/solicitacoes', '/whatsapp', '/entregas', '/gestao-a-vista', '/imoveis', '/ocupacao', '/mobilizacoes', '/cadastros']) assert.match(source, new RegExp(`<NavLink [^>]*href="${href}"`), href);
  });

  console.log(JSON.stringify({passed: report.filter(item => item[1]).length, total: report.length}));
  if (report.some(item => !item[1])) process.exitCode = 1;
})();
