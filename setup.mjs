import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
for (const name of ['autogestao-backend', 'autogestao-frontend']) {
  const target = resolve(root, name, '.env');
  if (existsSync(target)) { console.log(`${name}/.env já existe; preservado.`); continue; }
  const content = readFileSync(resolve(root, name, '.env.example'), 'utf8').replaceAll('GENERATE_ME', () => randomBytes(48).toString('hex'));
  writeFileSync(target, content, { mode: 0o600 });
  console.log(`${name}/.env criado.`);
}
