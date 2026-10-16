import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { findFreePort } from './local-ports.mjs';

test('Porta ocupada é ignorada e a alternativa aceita conexões', async () => {
  const occupied = createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  try {
    const preferred = occupied.address().port;
    const chosen = await findFreePort(preferred);
    assert.notEqual(chosen, preferred);
    const other = createServer();
    await new Promise((resolve, reject) => { other.once('error', reject); other.listen(chosen, '127.0.0.1', resolve); });
    await new Promise(resolve => other.close(resolve));
  } finally { await new Promise(resolve => occupied.close(resolve)); }
});
