// Executa todos os testes em tests/*.cjs e resume. Uso: npm test [filtro]
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filter = process.argv[2] || '';
const files = readdirSync(path.join(root, 'tests')).filter(f => f.endsWith('.cjs') && !f.includes('harness') && f.includes(filter)).sort();
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, [path.join(root, 'tests', file)], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  const out = (r.stdout || '') + (r.stderr || '');
  const summary = out.match(/\{"passed":\d+[^}]*\}/g)?.pop() || '';
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'OK    ' : 'FALHOU'} ${file.padEnd(34)} ${summary}`);
  if (!ok) console.log(out.split('\n').filter(l => /^FAIL|Error|error/.test(l)).slice(0, 6).map(l => '       ' + l).join('\n'));
}
console.log(`\n${files.length - failed}/${files.length} arquivos de teste passaram`);
process.exit(failed ? 1 : 0);
