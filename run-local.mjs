// Development only: persistent embedded PostgreSQL, API and storefront.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { findFreePort } from './scripts/local-ports.mjs';
import { applyLocalMigrations } from './scripts/local-migrations.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const backend = resolve(root, 'autogestao-backend');
const frontend = resolve(root, 'autogestao-frontend');
const children = [];
let db, server;
let stopping = false;
function run(executable, args, cwd, env = process.env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`Comando terminou com código ${code}`)));
  });
}
async function npm(args, cwd) {
  // Resolve npm through its shell shim only for fixed, trusted commands.
  if (process.platform === 'win32') return run('cmd.exe', ['/d', '/c', 'npm.cmd', ...args], cwd);
  return run('npm', args, cwd);
}
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  if (server) await server.stop();
  if (db) await db.close();
}
process.once('SIGINT', () => stop().finally(() => process.exit(0)));
process.once('SIGTERM', () => stop().finally(() => process.exit(0)));
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use Node.js 24 LTS.');
  await run(process.execPath, ['setup.mjs'], root);
  const dbPort = await findFreePort(5433);
  const apiPort = await findFreePort(3000);
  const webPort = await findFreePort(5173);
  if (dbPort !== 5433 || apiPort !== 3000 || webPort !== 5173) {
    console.log(`Portas padrão ocupadas. Usando banco ${dbPort}, API ${apiPort} e site ${webPort}.`);
  }
  for (const directory of [backend, frontend]) {
    if (!existsSync(resolve(directory, 'node_modules/.package-lock.json'))) await npm(['ci'], directory);
  }
  const req = createRequire(resolve(backend, 'package.json'));
  const { PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href);
  const { PGLiteSocketServer } = await import(pathToFileURL(req.resolve('@electric-sql/pglite-socket')).href);
  db = await PGlite.create(resolve(root, '.local-data'));
  await applyLocalMigrations(db, resolve(backend, 'prisma/migrations'), resolve(root, '.local-backups'));
  server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: dbPort, maxConnections: 10 });
  await server.start();
  const settings = req('dotenv').parse(readFileSync(resolve(backend, '.env')));
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`;
  const env = { ...settings, ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
    LOCAL_EMBEDDED_DB: 'true',
    PORT: String(apiPort),
    CORS_ORIGINS: [...new Set([...(settings.CORS_ORIGINS ?? '').split(',').filter(Boolean), `http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`])].join(','),
    VITE_API_URL: `http://localhost:${apiPort}/api/v1`,
  };
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], backend, env);
  await npm(['run', 'build'], backend);
  if (process.platform === 'win32') await run('cmd.exe', ['/d', '/c', 'npm.cmd', 'run', 'build'], frontend, env);
  else await run('npm', ['run', 'build'], frontend, env);
  await run(process.execPath, ['dist/prisma/seed.js'], backend, env);
  await run(process.execPath, ['dist/prisma/seed-demo.js'], backend, env);
  const api = spawn(process.execPath, ['dist/src/main.js'], { cwd: backend, env, stdio: 'inherit', windowsHide: true });
  const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { cwd: frontend, env, stdio: 'inherit', windowsHide: true });
  children.push(api, web);
  for (const child of children) { child.on('error', e => { console.error(e.message); stop().finally(() => process.exit(1)); }); child.on('exit', () => { if (!stopping) stop().finally(() => process.exit(1)); }); }
  console.log(`\nPainel: http://localhost:${webPort}\nLoja e chat: http://localhost:${webPort}/loja/loja-demo\nLogin: demo@autogestao.local | Senha: DemoChat2026!\nBanco local persistido em .local-data. Ctrl+C para parar.\n`);
} catch (e) {
  console.error('Não foi possível iniciar:', e.message);
  await stop(); process.exitCode = 1;
}
