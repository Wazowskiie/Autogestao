// Segurança do banco: nenhuma tabela pode ficar aberta para a API pública do Supabase
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');

test('Todas as tabelas têm RLS ligado depois das migrações', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create();
  try {
    const dir = path.join(__dirname, '../prisma/migrations');
    for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
    const { rows } = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`);
    assert.deepEqual(rows.map((r) => r.relname), [],
      'Tabela(s) sem RLS. Termine a migração que cria a tabela com: ALTER TABLE "nome" ENABLE ROW LEVEL SECURITY;');
    const total = await db.query(`select count(*)::int n from pg_tables where schemaname = 'public'`);
    assert.ok(total.rows[0].n >= 39);
  } finally { await db.close(); }
});
