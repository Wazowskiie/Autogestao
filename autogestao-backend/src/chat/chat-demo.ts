/**
 * Atendimento automático sem IA (CHAT_PROVIDER=demo).
 * Lê o que o cliente pediu (modelo, marca, ano, tipo, orçamento), procura no estoque disponível
 * e responde com o que existe — sem repetir o cumprimento e sem inventar veículos.
 */

export type DemoVehicle = {
  brand: string; model: string; version: string | null; year: number; km: number;
  price: unknown; type: string; color: string | null;
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Palavras que não ajudam a identificar o veículo
const STOP = new Set(`a o as os um uma uns umas de da do das dos e em no na nos nas para pra pro por com sem que se
eu voce vc vcs me te lhe meu minha seu sua tem tenho tinha teria ter ha quero queria gostaria procuro procurando
estou to tô busco buscando preciso precisando algum alguma alguns algumas qual quais quanto quanta custa custando
valor preco precos ano anos modelo modelos veiculo veiculos moto motos motocicleta carro carros automovel
disponivel disponiveis estoque loja ai aí la ja so mais menos mil reais real rs ate entre barato barata
oi ola bom boa dia tarde noite tudo bem obrigado obrigada ok sim nao favor por favor vcs voces
usado usada usados usadas novo nova novos novas seminovo seminova km rodagem cor ou mesmo tipo
`.split(/\s+/).filter(Boolean));

function budgetOf(q: string): number | null {
  // "até 15 mil", "15mil", "R$ 15.000", "15.000,00", "15k"
  const mil = q.match(/(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:mil|k)\b/);
  if (mil) return Math.round(parseFloat(mil[1].replace(',', '.')) * 1000);
  const money = q.match(/r\$\s*(\d{1,3}(?:\.\d{3})+|\d{4,7})(?:,\d{2})?/) ?? q.match(/\b(\d{1,3}(?:\.\d{3})+)(?:,\d{2})?\b/);
  if (money) return Number(money[1].replace(/\./g, ''));
  return null;
}

function yearOf(q: string): number | null {
  const m = q.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  return m ? Number(m[1]) : null;
}

/** Termos que identificam o veículo: "pcx", "bros", "cg", "160"... */
function termsOf(q: string): string[] {
  return q.replace(/r\$\s*[\d.,]+/g, ' ').replace(/\b\d{1,3}(?:[.,]\d{1,3})?\s*(?:mil|k)\b/g, ' ')
    .replace(/\b(19[5-9]\d|20[0-4]\d)\b/g, ' ')
    .split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t) && !/^\d{4,}$/.test(t) && (t.length > 1 || /\d/.test(t)));
}

const typeOf = (q: string) => /\bmotos?\b|motocicleta|scooter|\bcg\b|\bbiz\b|\bpop\b/.test(q) ? 'moto'
  : /\bcarros?\b|automovel|\bsuv\b|\bsedan\b|\bhatch\b|picape|pickup/.test(q) ? 'car' : null;

const label = (v: DemoVehicle) => [v.brand, v.model, v.version, v.year].filter(Boolean).join(' ');
const line = (v: DemoVehicle) => `• ${label(v)} — ${brl(Number(v.price))}${v.km ? ` · ${v.km.toLocaleString('pt-BR')} km` : ''}`;

/** Texto do veículo para busca: "honda nxr160 bros esdd" também vira "nxr 160" */
function haystack(v: DemoVehicle) {
  const base = norm([v.brand, v.model, v.version ?? '', v.color ?? ''].join(' '));
  const split = base.replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2');
  const words = new Set(`${base} ${split}`.split(/[^a-z0-9]+/).filter(Boolean));
  return { words, joined: base.replace(/[^a-z0-9]/g, '') };
}

function matches(v: DemoVehicle, terms: string[]) {
  const h = haystack(v);
  let hits = 0, wordHits = 0;
  for (const t of terms) {
    const isNum = /^\d+$/.test(t);
    if (h.words.has(t) || (!isNum && t.length >= 3 && h.joined.includes(t))) { hits++; if (!isNum) wordHits++; }
  }
  const words = terms.filter((t) => !/^\d+$/.test(t)).length;
  // Precisa bater todas as palavras pedidas (números como "160" ajudam, mas sozinhos não bastam)
  return { ok: words ? wordHits === words : hits > 0 && hits === terms.length, hits };
}

export function demoReply(vehicles: DemoVehicle[], history: { role: string; content: string }[]) {
  const users = history.filter((m) => m.role === 'user');
  const raw = users[users.length - 1]?.content ?? '';
  const q = norm(raw);

  if (/vendedor|humano|atendente|pessoa real|falar com alguem/.test(q)) {
    return 'Clique em “Falar com vendedor” para encaminhar seu atendimento à equipe. Se preferir retorno, deixe seu nome e telefone em “Deixar contato”.';
  }
  if (/financ|parcel|entrada|consorcio|troca|desconto|negocia|aceita/.test(q)) {
    return 'Financiamento, troca, entrada e descontos são combinados com um vendedor. Clique em “Falar com vendedor” e a equipe te atende. Se quiser, me diga o modelo que te interessa que eu vejo se temos disponível.';
  }
  if (/endereco|onde fica|localiza|horario|abre|fecha|funciona/.test(q)) {
    return 'Para endereço e horário de atendimento, clique em “Falar com vendedor” que a equipe te informa. Posso te ajudar a encontrar um veículo enquanto isso?';
  }

  let terms = termsOf(q);
  let year = yearOf(q);
  let budget = budgetOf(q);
  let type = typeOf(q);
  // "e até 15 mil?" / "tem 2020?": aproveita o modelo da pergunta anterior
  if (!terms.length && (year || budget) && users.length > 1) {
    const prev = norm(users[users.length - 2].content);
    terms = termsOf(prev); year ??= yearOf(prev); type ??= typeOf(prev);
    budget ??= budgetOf(prev);
  }

  if (!terms.length && !year && !budget && !type) {
    if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa)\b/.test(q)) return 'Olá! Que veículo você procura? Me diga o modelo, o ano ou quanto quer investir.';
    return 'Não entendi qual veículo você procura. Me diga o modelo (por exemplo, "CG 160" ou "PCX"), o ano ou quanto quer investir.';
  }

  const pool = vehicles.filter((v) => !type || v.type === type);
  const wanted = [terms.join(' ').toUpperCase(), year].filter(Boolean).join(' ');
  const contact = 'Para ver fotos, negociar ou reservar, clique em “Falar com vendedor”.';
  const notify = 'Se quiser, clique em “Deixar contato” que a loja te avisa quando chegar.';

  if (terms.length) {
    const found = pool.map((v) => ({ v, m: matches(v, terms) })).filter((x) => x.m.ok).map((x) => x.v);
    if (!found.length) {
      const alt = pool.filter((v) => !budget || Number(v.price) <= budget).slice(0, 3);
      return [
        `No momento não temos ${wanted} disponível no estoque.`,
        notify,
        alt.length ? `\nOutras opções${type === 'moto' ? ' de motos' : type === 'car' ? ' de carros' : ''} disponíveis agora:\n${alt.map(line).join('\n')}` : '',
      ].filter(Boolean).join('\n');
    }
    let list = found;
    let note = '';
    if (budget) {
      const inBudget = list.filter((v) => Number(v.price) <= budget);
      if (!inBudget.length) note = `Não temos ${wanted} até ${brl(budget)}, mas temos:`;
      else list = inBudget;
    }
    if (year && !note) {
      const sameYear = list.filter((v) => v.year === year);
      if (sameYear.length) list = sameYear;
      else note = `Não temos ${terms.join(' ').toUpperCase()} ${year}, mas temos de outros anos:`;
    }
    list = [...list].sort((a, b) => (year ? Math.abs(a.year - year) - Math.abs(b.year - year) : 0) || Number(a.price) - Number(b.price)).slice(0, 5);
    const head = note || (list.length === 1 ? `Encontrei esta opção de ${terms.join(' ').toUpperCase()}:` : `Encontrei estas opções de ${terms.join(' ').toUpperCase()}:`);
    return `${head}\n${list.map(line).join('\n')}\n${contact}`;
  }

  // Sem modelo: filtra por tipo, ano e orçamento
  let list = pool;
  if (budget) list = list.filter((v) => Number(v.price) <= budget);
  if (year) list = list.filter((v) => v.year === year);
  if (!list.length) {
    return `No momento não temos ${type === 'car' ? 'carros' : type === 'moto' ? 'motos' : 'veículos'}${year ? ` ${year}` : ''}${budget ? ` até ${brl(budget)}` : ''} no estoque. ${notify}`;
  }
  list = [...list].sort((a, b) => Number(b.price) - Number(a.price)).slice(0, 5);
  const what = type === 'car' ? 'carros' : type === 'moto' ? 'motos' : 'veículos';
  return `${budget || year ? `Opções de ${what}${year ? ` ${year}` : ''}${budget ? ` até ${brl(budget)}` : ''} disponíveis:` : `Opções de ${what} disponíveis agora:`}\n${list.map(line).join('\n')}\n${budget || year ? contact : 'Tem algum modelo em mente? Me diga que eu procuro.'}`;
}
