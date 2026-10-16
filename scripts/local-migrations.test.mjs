import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { applyLocalMigrations } from './local-migrations.mjs';
const req=createRequire(new URL('../autogestao-backend/package.json',import.meta.url));
const {PGlite}=await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href);
test('Atualização local preserva dados, faz backup recuperável e é idempotente',async()=>{
  const folder=mkdtempSync(resolve(tmpdir(),'crm-migration-test-'));
  const migrations=resolve(folder,'migrations'),backups=resolve(folder,'backups');
  mkdirSync(resolve(migrations,'001'),{recursive:true});
  writeFileSync(resolve(migrations,'001/migration.sql'),"CREATE TABLE sample(id INT PRIMARY KEY, name TEXT); INSERT INTO sample VALUES (1, 'Cliente de teste');");
  const db=await PGlite.create();let recovered;
  try{
    assert.equal(await applyLocalMigrations(db,migrations,backups,()=>{}),1);
    mkdirSync(resolve(migrations,'002'),{recursive:true});
    writeFileSync(resolve(migrations,'002/migration.sql'),'ALTER TABLE sample ADD COLUMN notes TEXT;');
    assert.equal(await applyLocalMigrations(db,migrations,backups,()=>{}),1);
    assert.equal((await db.query('SELECT name FROM sample WHERE id=1')).rows[0].name,'Cliente de teste');
    const files=readdirSync(backups);assert.equal(files.length,1);
    recovered=await PGlite.create({loadDataDir:new Blob([readFileSync(resolve(backups,files[0]))])});
    assert.equal((await recovered.query('SELECT name FROM sample WHERE id=1')).rows[0].name,'Cliente de teste');
    assert.equal(await applyLocalMigrations(db,migrations,backups,()=>{}),0);
    writeFileSync(resolve(migrations,'001/migration.sql'),'SELECT 1;');
    await assert.rejects(applyLocalMigrations(db,migrations,backups,()=>{}),/Migração já aplicada foi alterada/);
  }finally{
    if(recovered)await recovered.close();await db.close();
    const absolute=resolve(folder);
    if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.includes('crm-migration-test-'))throw new Error('Unsafe test cleanup path');
    rmSync(absolute,{recursive:true,force:true});
  }
});
