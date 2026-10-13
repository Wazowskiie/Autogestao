// Lê o XML de uma NF-e (modelo 55) e extrai os dados principais.
// Não valida assinatura: serve só para preencher o cadastro da nota.

export interface ParsedNfe {
  accessKey: string | null;
  number: string | null;
  series: string | null;
  operation: string | null;
  cfop: string | null;
  type: 'entrada' | 'saida' | null;
  issuedAt: Date | null;
  amount: number | null;
  issuerName: string | null;
  issuerDocument: string | null;
  recipientName: string | null;
  recipientDocument: string | null;
}

function block(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  return m ? m[1] : '';
}

function value(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]*)</(?:\\w+:)?${tag}>`));
  return m ? decode(m[1].trim()) || null : null;
}

function decode(text: string) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseNfeXml(raw: string): ParsedNfe {
  const xml = raw.replace(/^﻿/, '');
  if (!/<(?:\w+:)?infNFe\b/.test(xml)) {
    throw new Error('Este arquivo não parece ser o XML de uma NF-e.');
  }

  const ide = block(xml, 'ide');
  const emit = block(xml, 'emit');
  const dest = block(xml, 'dest');
  const total = block(xml, 'ICMSTot');

  // Chave: vem no protocolo (chNFe) ou no atributo Id="NFe..." do infNFe
  const idAttr = xml.match(/<(?:\w+:)?infNFe\b[^>]*\bId="NFe(\d{44})"/);
  const accessKey = value(xml, 'chNFe') ?? (idAttr ? idAttr[1] : null);

  const tpNF = value(ide, 'tpNF');
  const issued = value(ide, 'dhEmi') ?? value(ide, 'dEmi');
  const amount = value(total, 'vNF');

  return {
    accessKey,
    number: value(ide, 'nNF'),
    series: value(ide, 'serie'),
    operation: value(ide, 'natOp'),
    cfop: value(block(xml, 'prod'), 'CFOP'),
    type: tpNF === '0' ? 'entrada' : tpNF === '1' ? 'saida' : null,
    issuedAt: issued && !Number.isNaN(Date.parse(issued)) ? new Date(issued) : null,
    amount: amount !== null && Number.isFinite(Number(amount)) ? Number(amount) : null,
    issuerName: value(emit, 'xNome'),
    issuerDocument: value(emit, 'CNPJ') ?? value(emit, 'CPF'),
    recipientName: value(dest, 'xNome'),
    recipientDocument: value(dest, 'CNPJ') ?? value(dest, 'CPF'),
  };
}