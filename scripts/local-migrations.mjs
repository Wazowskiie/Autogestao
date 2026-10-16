import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export async function applyLocalMigrations(db, migrations, backupDir, log = console.log) {
  await db.exec('CREATE TABLE IF NOT EXISTS autogestao_local_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
  const previous = await db.query('SELECT name, checksum FROM autogestao_local_migrations');
  const applied = new Map(previous.rows.map(row => [row.name, row.checksum]));
  const pending = [];
  for (const name of readdirSync(migrations).sort()) {
    const file = resolve(migrations, name, 'migration.sql');
    if (!existsSync(file)) continue;
    const sql = readFileSync(file, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (applied.has(name)) {
      if (applied.get(name) !== checksum) throw new Error(`Migração já aplicada foi alterada: ${name}`);
    } else pending.push({ name, sql, checksum });
  }
  if (pending.length && applied.size) {
    mkdirSync(backupDir, { recursive: true });
    const dump = await db.dumpDataDir('gzip');
    const file = resolve(backupDir, `antes-da-atualizacao-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`);
    writeFileSync(file, Buffer.from(await dump.arrayBuffer()));
    log(`Backup do banco anterior à atualização: ${file}`);
  }
  for (const { name, sql, checksum } of pending) {
    await db.transaction(async tx => {
      await tx.exec(sql);
      await tx.query('INSERT INTO autogestao_local_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
    });
  }
  return pending.length;
}
