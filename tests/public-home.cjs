/* eslint-disable @typescript-eslint/no-require-imports -- Use the CommonJS transpile harness shared by the backend suites. */
// Página inicial pública: renderiza os componentes reais e confere os acessos, os avisos e os arquivos de imagem.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), {renderToStaticMarkup} = require('react-dom/server');
const root = path.resolve(__dirname, '..'), cache = {};
// As classes do CSS module viram o próprio nome, para o HTML ficar legível nas conferências.
const styles = new Proxy({}, {get: (_, name) => typeof name === 'string' ? name : undefined});
function load(file) {
  file = path.resolve(root, file);
  if (cache[file]) return cache[file].exports;
  const mod = {exports: {}};
  cache[file] = mod;
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText;
  const req = id => {
    if (id.endsWith('.module.css')) return {__esModule: true, default: styles};
    if (id.startsWith('.')) {const target = path.resolve(path.dirname(file), id); return load(target + (path.extname(target) ? '' : '.tsx'));}
    return require(id);
  };
  new Function('require', 'module', 'exports', 'React', js)(req, mod, mod.exports, React);
  return mod.exports;
}
const PublicHome = load('app/public-home.tsx').default;
const SIGN_IN = '/entrar?return_to=%2F';
const html = renderToStaticMarkup(React.createElement(PublicHome, {signInHref: SIGN_IN}));
const links = [...html.matchAll(/<a\b([^>]*)>/g)].map(match => ({href: (match[1].match(/href="([^"]*)"/) || [])[1].replace(/&amp;/g, '&'), target: (match[1].match(/target="([^"]*)"/) || [])[1] || ''}));

const report = [];
function test(name, body) {
  try {body(); report.push([name, true]);}
  catch (error) {report.push([name, false]); console.error('FAIL ' + name + '\n' + (error && error.stack || error));}
}

test('o acesso ao painel continua disponível e sai de dentro de molduras', () => {
  const signIn = links.filter(link => link.href === SIGN_IN);
  assert.ok(signIn.length >= 3, 'cabeçalho, destaque e portal');
  for (const link of signIn) assert.equal(link.target, '_top');
});

test('os formulários públicos de solicitação continuam na página', () => {
  for (const href of ['/formularios/manutencao', '/formularios/compra']) assert.equal(links.filter(link => link.href === href).length, 1, href);
});

test('todo link aponta para a própria página, para o painel ou para um formulário', () => {
  for (const link of links) assert.ok(link.href === SIGN_IN || link.href.startsWith('#') || link.href.startsWith('/formularios/'), link.href);
  const anchors = new Set(links.filter(link => link.href.startsWith('#')).map(link => link.href.slice(1)));
  for (const id of anchors) assert.match(html, new RegExp(`id="${id}"`), 'âncora sem destino: ' + id);
});

test('os avisos de ilustração, demonstração e contato estão escritos', () => {
  assert.match(html, /Imagens geradas por IA; não são instalações reais\./);
  assert.match(html, /não possui IA conectada/);
  assert.match(html, /Sem IA conectada, sistemas integrados, atendimento real ou envio de dados\./);
  assert.match(html, /nenhuma mensagem é enviada por esta página/);
  assert.doesNotMatch(html, /PRÉVIA PARA REVISÃO|Nesta prévia|Esta prévia/);
});

test('o formulário de contato não tem destino de envio', () => {
  const form = html.match(/<form\b[^>]*>/)[0];
  assert.doesNotMatch(form, /action=|method=/);
  assert.doesNotMatch(html, /<input\b/);
});

test('as três cenas usam arquivos que existem e textos alternativos', () => {
  const images = [...html.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/g)].map(match => ({src: match[1], alt: match[2]}));
  const scenes = images.filter(image => image.src.startsWith('/home/'));
  assert.equal(scenes.length, 3);
  for (const image of images) {
    assert.ok(fs.existsSync(path.join(root, 'public', image.src)), image.src);
    assert.ok(image.alt.length > 5, image.src);
  }
  // Nenhum vídeo é pedido enquanto não houver arquivo configurado.
  assert.doesNotMatch(html, /<video\b/);
  assert.match(fs.readFileSync(path.join(root, 'public/_headers'), 'utf8'), /\/home\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
});

test('as sete soluções aparecem nos cartões e na lista do formulário', () => {
  for (const name of ['Hospedagem corporativa', 'Lavanderia industrial', 'Manutenção predial', 'Áreas verdes', 'Climatização e refrigeração', 'Serviços elétricos', 'Manutenção de equipamentos', 'Mais de uma solução']) {
    assert.match(html, new RegExp('<option[^>]*>' + name + '</option>'), name);
  }
  assert.equal((html.match(/Tenho interesse/g) || []).length, 7);
});

console.log(JSON.stringify({passed: report.filter(item => item[1]).length, total: report.length}));
if (report.some(item => !item[1])) process.exitCode = 1;
