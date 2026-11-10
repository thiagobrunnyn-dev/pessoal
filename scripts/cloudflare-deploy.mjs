import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {isIP} from 'node:net';
import {isAbsolute, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const server = join(dist, 'server');
const slug = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const databaseUuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const databasePlaceholders = new Set([
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000000',
]);

function requiredSetting(name, valid) {
  const value = process.env[name]?.trim();
  if (!value || !valid(value) || /^site-creator(?:-|$)/i.test(value)) {
    throw new Error(`Configure ${name} com um valor válido do ambiente de destino.`);
  }
  return value;
}

function adminOrigin() {
  const value = process.env.MOBILIZA_ADMIN_URL?.trim();
  if (!value) return null;
  const url = URL.parse(value);
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port ||
      !url.hostname.includes('.') || isIP(url.hostname) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MOBILIZA_ADMIN_URL deve ser uma origem HTTPS, sem caminho, parâmetros ou credenciais.');
  }
  return url.origin;
}

function checkArtifact(value, field, directory = false) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) {
    throw new Error(`O build precisa fornecer ${field} como caminho relativo.`);
  }
  const target = resolve(server, value);
  const fromDist = relative(dist, target);
  const info = statSync(target, {throwIfNoEntry: false});
  if (fromDist.startsWith('..') || isAbsolute(fromDist) || !(directory ? info?.isDirectory() : info?.isFile())) {
    throw new Error(`O artefato ${field} do Worker está ausente ou fora de dist. Execute npm run build.`);
  }
}

function standaloneConfig(workersDev, withoutR2) {
  const name = requiredSetting('CLOUDFLARE_WORKER_NAME', value => slug.test(value));
  const databaseName = requiredSetting('CLOUDFLARE_D1_DATABASE_NAME', value => /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(value));
  const databaseId = requiredSetting('CLOUDFLARE_D1_DATABASE_ID', value => databaseUuid.test(value) && !databasePlaceholders.has(value));
  const bucketName = withoutR2 ? null : requiredSetting('CLOUDFLARE_R2_BUCKET_NAME', value => value.length >= 3 && slug.test(value));
  const admin = adminOrigin();
  const input = join(server, 'wrangler.json');
  if (!statSync(input, {throwIfNoEntry: false})?.isFile()) {
    throw new Error('dist/server/wrangler.json ausente. Execute npm run build.');
  }
  const built = JSON.parse(readFileSync(input, 'utf8'));
  checkArtifact(built.main, 'main');
  checkArtifact(built.assets?.directory, 'assets.directory', true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(built.compatibility_date) ||
      !Array.isArray(built.compatibility_flags) || !built.compatibility_flags.includes('nodejs_compat')) {
    throw new Error('O build não forneceu a data de compatibilidade e o modo nodejs_compat esperados.');
  }

  return {
    name,
    main: built.main,
    assets: built.assets,
    compatibility_date: built.compatibility_date,
    compatibility_flags: built.compatibility_flags,
    no_bundle: built.no_bundle,
    rules: built.rules,
    observability: built.observability,
    upload_source_maps: built.upload_source_maps,
    d1_databases: [{binding: 'DB', database_name: databaseName, database_id: databaseId, migrations_dir: '../../drizzle'}],
    r2_buckets: bucketName ? [{binding: 'BUCKET', bucket_name: bucketName}] : [],
    keep_vars: true,
    vars: {MOBILIZA_AUTH_MODE: 'cloudflare-access', ...(admin ? {MOBILIZA_ADMIN_URL: admin} : {})},
    workers_dev: workersDev,
    preview_urls: false,
  };
}

function run() {
  const [mode, ...args] = process.argv.slice(2);
  if (!['prepare', 'dry-run', 'deploy'].includes(mode) || args.length) {
    throw new Error('Use cloudflare:prepare, cloudflare:dry-run ou cloudflare:deploy sem argumentos adicionais.');
  }
  const environment = process.env.CLOUDFLARE_DEPLOY_ENV?.trim() || '';
  if (environment && !/^[a-z][a-z0-9-]{0,31}$/.test(environment)) {
    throw new Error('CLOUDFLARE_DEPLOY_ENV deve começar com letra minúscula e conter apenas letras minúsculas, números ou hífens.');
  }
  if (mode === 'deploy' && environment !== 'staging') {
    throw new Error('O deploy manual requer CLOUDFLARE_DEPLOY_ENV=staging.');
  }
  const workersDev = process.env.CLOUDFLARE_WORKERS_DEV?.trim() || '0';
  if (!['0', '1'].includes(workersDev) || (workersDev === '1' && environment !== 'staging')) {
    throw new Error('Use CLOUDFLARE_WORKERS_DEV=0 ou habilite workers.dev com valor 1 apenas em staging.');
  }
  const withoutR2 = process.env.CLOUDFLARE_STAGING_WITHOUT_R2?.trim() || '0';
  if (!['0', '1'].includes(withoutR2) || (withoutR2 === '1' && environment !== 'staging')) {
    throw new Error('CLOUDFLARE_STAGING_WITHOUT_R2=1 só pode ser usado com CLOUDFLARE_DEPLOY_ENV=staging.');
  }
  if (withoutR2 === '1' && process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim()) {
    throw new Error('Remova CLOUDFLARE_R2_BUCKET_NAME ao usar CLOUDFLARE_STAGING_WITHOUT_R2=1.');
  }

  const config = standaloneConfig(workersDev === '1', withoutR2 === '1');
  const output = join(server, `wrangler.cloudflare${environment ? '.' + environment : ''}.json`);
  const temporary = join(server, `.wrangler.cloudflare.${randomUUID()}.json`);
  try {
    writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', {flag: 'wx'});
    if (mode === 'prepare') {
      renameSync(temporary, output);
      console.log(`Configuração Cloudflare de ${config.name} gravada em ${relative(root, output)}.`);
      return;
    }

    const cli = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const flags = mode === 'dry-run' ? ['--dry-run'] : [];
    const result = spawnSync(process.execPath, [cli, 'deploy', '--config', temporary, ...flags], {
      cwd: root,
      env: {...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false'},
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    rmSync(temporary, {force: true});
  }
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Não foi possível preparar o deploy Cloudflare.');
  process.exitCode = 1;
}
