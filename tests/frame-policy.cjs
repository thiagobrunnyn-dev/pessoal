/* eslint-disable @typescript-eslint/no-require-imports -- Use the CommonJS transpile harness shared by the backend suites. */
// Regra de iframe: lib/frame-policy.ts e o middleware real, com o ambiente simulado.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const env = {};
const cache = {};
function load(file) {
  file = path.resolve(root, file);
  if (cache[file]) return cache[file].exports;
  const mod = {exports: {}};
  cache[file] = mod;
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  const req = id => {
    if (id === 'cloudflare:workers') return {env};
    if (id === 'next/server') return {NextResponse: {next: () => new Response(null)}};
    if (id.startsWith('.')) {const target = path.resolve(path.dirname(file), id); return load(target + (path.extname(target) ? '' : '.ts'));}
    return require(id);
  };
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports);
  return mod.exports;
}
const {trustedFrameOrigins, framePolicy} = load('lib/frame-policy.ts'), {middleware} = load('middleware.ts');
const headers = (pathname, configured) => {
  if (configured === undefined) delete env.MOBILIZA_FRAME_ANCESTORS; else env.MOBILIZA_FRAME_ANCESTORS = configured;
  return middleware({nextUrl: new URL('https://qa.example' + pathname)}).headers;
};

const report = [];
function test(name, body) {
  try {body(); report.push([name, true]);}
  catch (error) {report.push([name, false]); console.error('FAIL ' + name + '\n' + (error && error.stack || error));}
}

test('sem configuração, só o próprio site pode embutir', () => {
  for (const value of [undefined, null, '', '   ']) {
    assert.deepEqual(framePolicy(value), {contentSecurityPolicy: "frame-ancestors 'self'", sameOriginOnly: true});
  }
});

test('origens https válidas são aceitas, normalizadas e sem repetição', () => {
  assert.deepEqual(trustedFrameOrigins('https://Editor.Example.com, https://*.preview.example.com:8443\nhttps://editor.example.com'), ['https://editor.example.com', 'https://*.preview.example.com:8443']);
  assert.deepEqual(framePolicy('https://editor.example.com'), {contentSecurityPolicy: "frame-ancestors 'self' https://editor.example.com", sameOriginOnly: false});
});

test('valores que ampliariam ou quebrariam a regra são ignorados', () => {
  const rejected = ['*', 'https://*', 'https://*.com', 'http://editor.example.com', 'https:', 'data:', "'none'", 'editor.example.com',
    'https://editor.example.com/caminho', 'https://editor.example.com?x=1', "https://editor.example.com;script-src", 'https://a.*.example.com',
    'https://user@editor.example.com', 'https://editor.example.com:', 'https://localhost', 'https://-editor.example.com'];
  for (const value of rejected) assert.deepEqual(trustedFrameOrigins(value), [], value);
  // Um item inválido não derruba os válidos nem entra no cabeçalho.
  assert.equal(framePolicy("https://ok.example.com; default-src *").contentSecurityPolicy, "frame-ancestors 'self'");
  assert.equal(framePolicy('https://ok.example.com *').contentSecurityPolicy, "frame-ancestors 'self' https://ok.example.com");
});

test('a lista de origens tem limite', () => {
  const many = Array.from({length: 20}, (_, index) => 'https://e' + index + '.example.com').join(' ');
  assert.equal(trustedFrameOrigins(many).length, 8);
});

test('middleware: padrão continua bloqueando outros sites', () => {
  const page = headers('/whatsapp', undefined);
  assert.equal(page.get('content-security-policy'), "frame-ancestors 'self'");
  assert.equal(page.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(page.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  const api = headers('/api/whatsapp', undefined);
  assert.equal(api.get('content-security-policy'), null);
  assert.equal(api.get('x-frame-options'), 'SAMEORIGIN');
});

test('middleware: origem confiável libera só as páginas', () => {
  const page = headers('/mapa/editor', 'https://editor.example.com');
  assert.equal(page.get('content-security-policy'), "frame-ancestors 'self' https://editor.example.com");
  assert.equal(page.get('x-frame-options'), null);
  assert.equal(page.get('x-content-type-options'), 'nosniff');
  const api = headers('/api/control', 'https://editor.example.com');
  assert.equal(api.get('content-security-policy'), null);
  assert.equal(api.get('x-frame-options'), 'SAMEORIGIN');
});

test('middleware: configuração inválida mantém o bloqueio padrão', () => {
  const page = headers('/hoje', '*');
  assert.equal(page.get('content-security-policy'), "frame-ancestors 'self'");
  assert.equal(page.get('x-frame-options'), 'SAMEORIGIN');
});

console.log(JSON.stringify({passed: report.filter(item => item[1]).length, total: report.length}));
if (report.some(item => !item[1])) process.exitCode = 1;
