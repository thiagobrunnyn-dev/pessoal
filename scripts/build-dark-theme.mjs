// Generates the dark counterpart of each plain stylesheet.
//
// The light look stays exactly as written: source files are never touched. For every rule that
// sets a colour, this script writes a sibling rule under `:root[data-theme=dark]` (screen only,
// so paper stays light) with the colour mapped by its job: surface, text or line. Every colour
// declaration gets a counterpart, even when the value does not change, so the cascade between
// rules stays the same as in the light sheet.
//
//   node scripts/build-dark-theme.mjs          write the *.dark.css files
//   node scripts/build-dark-theme.mjs --check  fail if any generated file is out of date
import {existsSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Plain stylesheets that follow the theme. The dashboard (hub.css + hub-theme.css) and the
 *  shared theme layer (theme.css) are written by hand with tokens; the institutional home keeps
 *  its own palette. */
export const SOURCES = [
  'app/globals.css',
  'app/google-maps.css',
  'app/equipment-public.css',
  'app/mobilizations.css',
  'app/occupancy.css',
  'app/property-import.css',
  'app/cadastros/cadastros.css',
  'app/components/guest-channel.css',
  'app/components/guest-requests.css',
  'app/components/property-address-filter.css',
  'app/components/property-create-photo.css',
  'app/components/property-furniture.css',
  'app/components/property-inspections.css',
  'app/components/property-text.css',
  'app/configuracoes/settings.css',
  'app/gestao-a-vista/mural.css',
  'app/pessoas/people-directory.css',
  'app/servicos-laudos/services.css',
  'app/veiculos/vehicles-directory.css',
  'app/whatsapp/whatsapp.css',
];
export const darkPath = source => source.replace(/\.css$/, '.dark.css');

const DARK = ':root[data-theme=dark]';
/** Light values of the shared custom properties, resolved where they are used. */
const LIGHT_VARS = {orange: '#ed641a', 'orange-dark': '#c84608', navy: '#1a3548', ink: '#203746', muted: '#667783', line: '#e0e5e8', bg: '#f4f6f7'};
/** Things that stand for paper stay light on screen: printed labels, print sheets, signatures. */
const PAPER = /\.equipment-label\b|\.cleaning-print\b|\.clean-print-|\.piv-signature\b/;
const PAGE_BACKGROUND = '#08121a';

// ---------- Colour maths (OKLCH) ----------
const toLinear = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const toGamma = value => value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
function parseHex(hex) {
  let digits = hex.slice(1);
  if (digits.length === 3 || digits.length === 4) digits = [...digits].map(digit => digit + digit).join('');
  const channel = index => parseInt(digits.slice(index, index + 2), 16) / 255;
  return {r: channel(0), g: channel(2), b: channel(4), alpha: digits.length === 8 ? digits.slice(6, 8).toLowerCase() : ''};
}
function toOklch(hex) {
  const {r, g, b, alpha} = parseHex(hex), [R, G, B] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {l: L, c: Math.hypot(A, Bb), h: (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360, alpha};
}
function fromOklch({l, c, h, alpha = ''}) {
  const rgb = chroma => {
    const a = chroma * Math.cos(h * Math.PI / 180), b = chroma * Math.sin(h * Math.PI / 180);
    const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3, M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S];
  };
  // Keep hue and lightness; give up chroma until the colour fits sRGB.
  let chroma = c, channels = rgb(chroma);
  for (let step = 0; step < 40 && channels.some(value => value < -0.0005 || value > 1.0005); step++) { chroma *= 0.94; channels = rgb(chroma); }
  return '#' + channels.map(value => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, value))))) * 255).toString(16).padStart(2, '0')).join('') + alpha;
}

/** Piecewise scale: input lightness -> dark-theme colour, blended in OKLCH between anchors. */
function scale(anchors) {
  const points = anchors.map(([lightness, hex]) => [lightness, toOklch(hex)]).sort((a, b) => a[0] - b[0]);
  return lightness => {
    if (lightness <= points[0][0]) return points[0][1];
    for (let index = 1; index < points.length; index++) {
      const [upper, to] = points[index], [lower, from] = points[index - 1];
      if (lightness > upper) continue;
      const t = (lightness - lower) / (upper - lower || 1);
      return {l: from.l + (to.l - from.l) * t, c: from.c + (to.c - from.c) * t, h: from.h + (to.h - from.h) * t};
    }
    return points[points.length - 1][1];
  };
}
// Anchors are the dashboard tokens: #101e2b card, #152737 inner surface, #223a4d line, #e9f0f5 ink, #94a9b9 muted.
const SURFACE = scale([[1, '#101e2b'], [0.985, '#132332'], [0.965, '#152737'], [0.93, '#1a2e3f'], [0.9, '#1d3447'], [0.85, '#243d52'], [0.75, '#2f4a60'], [0.6, '#4a6377'], [0.5, '#44596b'], [0.42, '#27425a'], [0.32, '#1e374b'], [0.2, '#14222e'], [0, '#060d13']]);
const TEXT = scale([[0, '#f2f6f9'], [0.33, '#e9f0f5'], [0.45, '#c9d5de'], [0.51, '#aebfcc'], [0.55, '#94a9b9'], [0.66, '#8298a8'], [0.76, '#6f8494'], [0.9, '#7b90a0']]);
// Brand oranges used as text or icons take the dashboard accent tokens.
const BRAND_TEXT = {'#ed641a': '#ff8a3d', '#e45a12': '#ff8a3d', '#c84608': '#ffae78', '#a8460d': '#ffae78', '#ae3b05': '#ffae78'};
const LINE = scale([[1, '#1c3143'], [0.95, '#1f3547'], [0.915, '#223a4d'], [0.86, '#2b475c'], [0.8, '#345269'], [0.75, '#3f5f77'], [0.6, '#56778f'], [0.45, '#6d8da4'], [0.33, '#8ba5b8'], [0, '#a9bfce']]);
// Greys and the slate blues of the interface share one family; everything else keeps its hue.
// (A pale green or red tint is not neutral: it must stay a tint, just darker.)
const isNeutral = ({c, h}) => c < 0.012 || (c < 0.075 && h >= 200 && h <= 280);

function mapColor(hex, role) {
  const color = toOklch(hex);
  if (color.alpha === '00') return hex.toLowerCase();
  const keep = hex.toLowerCase(), out = value => fromOklch({...value, alpha: color.alpha});
  if (role === 'surface') {
    if (isNeutral(color)) return out(SURFACE(color.l));
    if (color.l >= 0.93) return out({l: 0.27, c: Math.min(0.075, color.c * 1.7 + 0.015), h: color.h});
    if (color.l >= 0.8) return out({l: 0.34, c: Math.min(0.09, color.c * 1.2), h: color.h});
    return keep;
  }
  if (role === 'text') {
    if (BRAND_TEXT[keep] && !color.alpha) return BRAND_TEXT[keep];
    if (color.l > 0.9) return keep;
    if (isNeutral(color)) return out(TEXT(color.l));
    if (color.l <= 0.5) return out({l: 0.82, c: Math.min(color.c, 0.11), h: color.h});
    if (color.l <= 0.66) return out({l: 0.8, c: Math.min(color.c, 0.13), h: color.h});
    if (color.l <= 0.8) return out({l: Math.max(color.l, 0.76), c: color.c, h: color.h});
    return keep;
  }
  if (isNeutral(color)) return out(LINE(color.l));
  if (color.l >= 0.85) return out({l: 0.42, c: Math.min(0.09, color.c * 1.3 + 0.01), h: color.h});
  // Saturated accents (the brand orange, status colours) stay as they are; only pale tints dim.
  if (color.c >= 0.09) return color.l < 0.5 ? out({l: 0.6, c: color.c, h: color.h}) : keep;
  return out({l: 0.52, c: color.c, h: color.h});
}

// ---------- Declarations ----------
const TOKEN = /#[0-9a-fA-F]{3,8}\b|\b(?:white|black)\b|var\(--(?:orange-dark|orange|navy|muted|line|ink|bg)\)/g;
const SURFACE_PROPS = new Set(['background', 'background-color', 'background-image']);
const TEXT_PROPS = new Set(['color', 'fill', 'stroke', 'caret-color', 'text-decoration-color', '-webkit-text-fill-color']);
const LINE_SHORTHANDS = new Set(['border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-block', 'border-block-start', 'border-block-end', 'border-inline', 'border-inline-start', 'border-inline-end', 'column-rule']);
const LINE_COLORS = new Set(['border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-block-color', 'border-inline-color', 'column-rule-color']);
const lightValue = token => token.startsWith('var(') ? LIGHT_VARS[token.slice(6, -1)] : token === 'white' ? '#ffffff' : token === 'black' ? '#000000' : token;

/** Replaces colour tokens outside url(...) with their dark value for the given job. */
function mapValue(value, role) {
  return value.split(/(url\([^)]*\))/).map((part, index) => index % 2 ? part : part.replace(TOKEN, token => mapColor(lightValue(token), role))).join('');
}
function darkDeclaration(prop, rawValue, selector) {
  const important = /!important\s*$/.test(rawValue) ? '!important' : '';
  const value = rawValue.replace(/\s*!important\s*$/, '').trim();
  const tokens = value.replace(/url\([^)]*\)/g, '').match(TOKEN);
  if (!tokens) return null;
  if (SURFACE_PROPS.has(prop)) {
    // The page itself sits below every surface.
    if (/^(?:html|body)$/.test(selector.trim()) && tokens.length === 1) return `background-color:${PAGE_BACKGROUND}${important}`;
    const single = tokens.length === 1 && value === tokens[0];
    return `${prop === 'background' && single ? 'background-color' : prop}:${mapValue(value, 'surface')}${important}`;
  }
  if (TEXT_PROPS.has(prop)) return `${prop}:${mapValue(value, 'text')}${important}`;
  // A shorthand would also reset width and style, so only its colour is repeated.
  if (LINE_SHORTHANDS.has(prop)) return `${prop}-color:${mapColor(lightValue(tokens[0]), 'line')}${important}`;
  if (LINE_COLORS.has(prop)) return `${prop}:${mapValue(value, 'line')}${important}`;
  return null;
}

// ---------- Stylesheet walk ----------
function splitTop(text, separator) {
  const parts = []; let depth = 0, start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === separator && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}
function blocks(css) {
  const nodes = []; let index = 0;
  while (index < css.length) {
    const open = css.indexOf('{', index), semicolon = css.indexOf(';', index);
    if (open === -1) break;
    if (semicolon !== -1 && semicolon < open && css.slice(index, semicolon).trim().startsWith('@')) { index = semicolon + 1; continue; }
    let depth = 1, close = open + 1;
    for (; close < css.length && depth; close++) { if (css[close] === '{') depth++; else if (css[close] === '}') depth--; }
    nodes.push({prelude: css.slice(index, open).trim(), body: css.slice(open + 1, close - 1)});
    index = close;
  }
  return nodes;
}
function darkSelector(selector) {
  const text = selector.trim();
  if (!text || PAPER.test(text)) return null;
  return /^(?::root|html)(?![\w-])/.test(text) ? text.replace(/^(?::root|html)/, DARK) : `${DARK} ${text}`;
}
function darkRules(css) {
  const out = [];
  for (const {prelude, body} of blocks(css)) {
    if (prelude.startsWith('@')) {
      const name = prelude.match(/^@([\w-]+)/)[1];
      if (!['media', 'supports', 'container', 'layer'].includes(name)) continue;
      if (name === 'media' && /\bprint\b/.test(prelude) && !/\bscreen\b/.test(prelude)) continue;
      const inner = darkRules(body);
      if (inner.length) out.push(`${prelude}{\n${inner.join('\n')}\n}`);
      continue;
    }
    const selectors = splitTop(prelude, ',').map(darkSelector).filter(Boolean);
    if (!selectors.length) continue;
    const declarations = splitTop(body, ';').map(declaration => {
      const colon = declaration.indexOf(':');
      return colon === -1 ? null : darkDeclaration(declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1), prelude);
    }).filter(Boolean);
    if (declarations.length) out.push(`${selectors.join(',')}{${declarations.join(';')}}`);
  }
  return out;
}

/** Dark sheet for one source file, or '' when the source sets no colour. */
export function buildDark(source) {
  const css = readFileSync(join(root, source), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = darkRules(css);
  if (!rules.length) return '';
  const name = source.split('/').pop();
  return `/* Generated from ${name} by scripts/build-dark-theme.mjs. Do not edit: change ${name} or the\n   generator and run \`npm run theme:dark\`. Screen only, so printed pages stay light. */\n@media screen{\n${rules.join('\n')}\n}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check'), stale = [];
  for (const source of SOURCES) {
    const target = join(root, darkPath(source)), next = buildDark(source);
    const current = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current === next) continue;
    if (check) { stale.push(darkPath(source)); continue; }
    if (next) writeFileSync(target, next); else unlinkSync(target);
    console.log((next ? 'wrote ' : 'removed ') + darkPath(source));
  }
  if (stale.length) { console.error('Out of date: ' + stale.join(', ') + '\nRun `npm run theme:dark`.'); process.exit(1); }
  if (check) console.log('Dark sheets are up to date.');
}
