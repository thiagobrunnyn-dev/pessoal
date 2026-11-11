/* eslint-disable @typescript-eslint/no-require-imports -- Use the CommonJS transpile harness shared by the backend suites. */
// Visual da Visão Geral: preferência de tema (lib/hub-theme.ts) e os gráficos em SVG (hub-visuals.tsx).
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), {renderToStaticMarkup} = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function load(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText;
  const mod = {exports: {}};
  new Function('require', 'module', 'exports', 'React', js)(require, mod, mod.exports, React);
  return mod.exports;
}
const theme = load('lib/hub-theme.ts'), visuals = load('app/components/hub-visuals.tsx');
const html = element => renderToStaticMarkup(element);

const report = [];
function test(name, body) {
  try {body(); report.push([name, true]);}
  catch (error) {report.push([name, false]); console.error('FAIL ' + name + '\n' + (error && error.stack || error));}
}

test('escuro é o padrão; só o valor exato "light" muda', () => {
  for (const value of [null, undefined, '', 'outro=1', 'mobiliza_hub_theme=dark', 'mobiliza_hub_theme=LIGHT', 'mobiliza_hub_theme=lightx', 'xmobiliza_hub_theme=light']) assert.equal(theme.hubThemeFromCookie(value), 'dark', String(value));
  for (const value of ['mobiliza_hub_theme=light', 'a=1; mobiliza_hub_theme=light', 'a=1;mobiliza_hub_theme=light ; b=2']) assert.equal(theme.hubThemeFromCookie(value), 'light', value);
});

test('o cookie do tema vale só para este site e marca Secure em https', () => {
  assert.equal(theme.hubThemeCookie('light', false), 'mobiliza_hub_theme=light; Path=/; Max-Age=31536000; SameSite=Lax');
  assert.match(theme.hubThemeCookie('dark', true), /^mobiliza_hub_theme=dark; .*; Secure$/);
});

test('anel limita o valor entre 0 e 100%', () => {
  const dash = value => html(React.createElement(visuals.HubRing, {value, size: 50, stroke: 10})).match(/stroke-dasharray="([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  const length = 2 * Math.PI * 20;
  assert.deepEqual(dash(0), [0, length]);
  assert.deepEqual(dash(-3), [0, length]);
  assert.deepEqual(dash(NaN), [0, length]);
  assert.deepEqual(dash(2), [length, 0]);
  assert.ok(Math.abs(dash(0.25)[0] - length / 4) < 1e-9);
});

test('rosca descreve todas as partes e desenha só as que têm valor', () => {
  const parts = [{key: 'a', label: 'Manutenção geral', value: 3, tone: 'orders'}, {key: 'b', label: 'Centrais de ar', value: 0, tone: 'air'}, {key: 'c', label: 'Limpeza', value: 1, tone: 'cleaning'}];
  const out = html(React.createElement(visuals.HubDonut, {parts}, React.createElement('strong', null, '4')));
  assert.match(out, /aria-label="Manutenção geral: 3; Centrais de ar: 0; Limpeza: 1"/);
  assert.equal((out.match(/hub-donut-part/g) || []).length, 2);
  assert.match(out, /<title>Manutenção geral: 3<\/title>/);
  assert.doesNotMatch(out, /NaN/);
  // Sem nenhum valor não há fatia nem divisão por zero.
  const empty = html(React.createElement(visuals.HubDonut, {parts: parts.map(part => ({...part, value: 0}))}));
  assert.equal((empty.match(/hub-donut-part/g) || []).length, 0);
  assert.doesNotMatch(empty, /NaN/);
});

test('barra segmentada é decorativa e ignora partes zeradas', () => {
  const out = html(React.createElement(visuals.HubSegments, {parts: [{key: 'a', label: 'A', value: 2, tone: 'orders'}, {key: 'b', label: 'B', value: 0, tone: 'air'}]}));
  assert.match(out, /aria-hidden="true"/);
  assert.equal((out.match(/tone-/g) || []).length, 1);
  assert.match(html(React.createElement(visuals.HubSegments, {parts: []})), /is-empty/);
});

console.log(JSON.stringify({passed: report.filter(item => item[1]).length, total: report.length}));
if (report.some(item => !item[1])) process.exitCode = 1;
