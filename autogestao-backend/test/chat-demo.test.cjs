const { test } = require('node:test');
const assert = require('node:assert/strict');
const { demoReply } = require('../dist/src/chat/chat-demo');

const V = [
  { brand: 'Honda', model: 'Nxr160 Bros', version: 'Esdd', year: 2019, km: 32000, price: 18900, type: 'moto', color: 'Vermelha' },
  { brand: 'Honda', model: 'PCX 160', version: 'DLX', year: 2024, km: 8000, price: 21500, type: 'moto', color: 'Branca' },
  { brand: 'Honda', model: 'CG 160', version: 'Fan', year: 2022, km: 15000, price: 15990, type: 'moto', color: 'Preta' },
  { brand: 'Fiat', model: 'Mobi', version: 'Like', year: 2020, km: 50000, price: 45000, type: 'car', color: 'Prata' },
];
const ask = (...msgs) => demoReply(V, msgs.flatMap((m) => [{ role: 'user', content: m }, { role: 'assistant', content: 'ok' }]).slice(0, -1));

test('Atendimento automático acha o modelo pedido e não repete o cumprimento', () => {
  const r = ask('procuro uma PCX 2026');
  assert.match(r, /Não temos PCX 2026, mas temos de outros anos/);
  assert.match(r, /PCX 160 DLX 2024/);
  assert.doesNotMatch(r, /Bros|Sou o assistente|modelo específico/);
  assert.match(ask('tem bros?'), /Nxr160 Bros/);
  assert.match(ask('nxr 160'), /Nxr160 Bros/);
});

test('Atendimento automático: modelo inexistente, orçamento e continuação', () => {
  assert.match(ask('quero uma XRE 300'), /No momento não temos XRE 300/);
  const b = ask('moto até 16 mil');
  assert.match(b, /CG 160/); assert.doesNotMatch(b, /PCX|Mobi/);
  assert.match(ask('procuro uma PCX', 'e até 20 mil?'), /Não temos PCX até R\$\s?20\.000,00/);
  assert.match(ask('carro'), /Mobi/);
  assert.match(ask('faz financiamento?'), /Falar com vendedor/);
  assert.match(ask('quero falar com um vendedor'), /Falar com vendedor/);
});
