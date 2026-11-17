// Relatórios: semana, mês e ano
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api } from '../api.js';
import { esc, $, $$, tagTipo, fmtData, fmtDiaMes, parseISO, isoLocal, pct, baixarCSV, TIPOS, direitos } from '../ui.js';
import { barras, linhas, tabelaDados, COR } from '../charts.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const estado = { modo: 'semana', encontro: null, mes: isoLocal(new Date()).slice(0, 7), ano: new Date().getFullYear() };
let graficos = [];

const fimMes = (ym) => { const [y, m] = ym.split('-').map(Number); return isoLocal(new Date(y, m, 0)); };
const mesAnterior = (ym) => { const [y, m] = ym.split('-').map(Number); return isoLocal(new Date(y, m - 2, 1)).slice(0, 7); };
const nomeMes = (ym) => parseISO(ym + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const periodo = (ini, fim) => api('GET', `/relatorios?ini=${ini}&fim=${fim}`);

function resumir({ encontros, presencas }) {
  const porEnc = encontros.map((e) => {
    const r = presencas.filter((p) => p.encontro_id === e.id);
    const p = r.filter((x) => x.presente).length;
    return { ...e, presentes: p, ausentes: r.length - p };
  });
  const total = porEnc.reduce((s, e) => s + e.presentes, 0);
  return { porEnc, media: porEnc.length ? Math.round((total / porEnc.length) * 10) / 10 : 0, unicos: new Set(presencas.filter((p) => p.presente).map((p) => p.pessoa_id)).size };
}
function comparar(atual, anterior) {
  if (anterior === null || anterior === undefined) return '';
  const d = Math.round((atual - anterior) * 10) / 10;
  if (d === 0) return 'igual ao período anterior';
  return `<span class="${d > 0 ? 'sobe' : 'desce'}">${d > 0 ? '+' : ''}${String(d).replace('.', ',')}</span> sobre o período anterior`;
}
const numero = (rot, val, det = '') => `<div><div class="rot">${rot}</div><div class="val">${val}</div><div class="det">${det || '&nbsp;'}</div></div>`;
const tituloImpressao = (t) => `<div class="so-impressao" style="margin-bottom:12px"><h1>Gestão do Hype · ${t}</h1><p class="small">${direitos()}</p></div>`;

export async function render(conteudo) {
  const encontros = await api('GET', '/encontros');
  if (!estado.encontro && encontros.length) estado.encontro = encontros[0].id;
  const anos = [...new Set([new Date().getFullYear(), ...encontros.map((e) => Number(e.data.slice(0, 4)))])].sort((a, b) => b - a);

  conteudo.innerHTML = `
    <div class="cabecalho nao-imprimir"><div><h1>Relatórios</h1></div>
      <div class="acoes"><button class="btn" id="csv">Baixar CSV</button><button class="btn" id="imprimir">Imprimir</button></div></div>
    <div class="nao-imprimir" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <div class="abas" id="modo"><button data-m="semana">Semana</button><button data-m="mes">Mês</button><button data-m="ano">Ano</button></div>
      <select class="input" id="sel-enc" style="width:auto">${encontros.map((e) => `<option value="${e.id}">${fmtData(e.data)}${e.tema ? ' · ' + esc(e.tema) : ''}</option>`).join('') || '<option>Nenhuma chamada</option>'}</select>
      <input type="month" class="input" id="sel-mes" style="width:auto" value="${estado.mes}">
      <select class="input" id="sel-ano" style="width:auto">${anos.map((a) => `<option ${a === estado.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
    </div>
    <div id="rel"></div>`;

  let csv = null;
  const gerar = async () => {
    graficos.forEach((g) => g?.destroy()); graficos = [];
    $$('#modo button').forEach((b) => b.classList.toggle('ativo', b.dataset.m === estado.modo));
    $('#sel-enc').classList.toggle('hidden', estado.modo !== 'semana');
    $('#sel-mes').classList.toggle('hidden', estado.modo !== 'mes');
    $('#sel-ano').classList.toggle('hidden', estado.modo !== 'ano');
    if (estado.encontro) $('#sel-enc').value = estado.encontro;
    const rel = $('#rel');
    rel.innerHTML = '<div class="boot"><span class="spin"></span></div>';
    try { csv = await ({ semana, mes, ano })[estado.modo](rel, encontros); }
    catch (e) { rel.innerHTML = `<div class="painel vazio">${esc(e.message)}</div>`; }
  };
  $$('#modo button').forEach((b) => b.addEventListener('click', () => { estado.modo = b.dataset.m; gerar(); }));
  $('#sel-enc').addEventListener('change', (e) => { estado.encontro = Number(e.target.value); gerar(); });
  $('#sel-mes').addEventListener('change', (e) => { if (e.target.value) { estado.mes = e.target.value; gerar(); } });
  $('#sel-ano').addEventListener('change', (e) => { estado.ano = Number(e.target.value); gerar(); });
  $('#imprimir').onclick = () => window.print();
  $('#csv').onclick = () => csv && baixarCSV(csv.nome, csv.linhas);
  await gerar();
  return () => { graficos.forEach((g) => g?.destroy()); graficos = []; };
}

// ---------------- Semana ----------------
async function semana(rel, encontros) {
  const i = encontros.findIndex((e) => e.id === estado.encontro);
  const enc = encontros[i];
  if (!enc) { rel.innerHTML = '<div class="painel vazio">Nenhuma chamada salva ainda.</div>'; return null; }
  const ant = encontros[i + 1];
  const { presencas } = await periodo(enc.data, enc.data);
  const r = presencas.sort((a, b) => a.nome.localeCompare(b.nome));
  const pres = r.filter((p) => p.presente), aus = r.filter((p) => !p.presente);
  const tipo = (t) => pres.filter((p) => p.tipo === t).length;
  const primeiraVez = pres.filter((p) => p.data_cadastro === enc.data).length;

  const tabela = (l, comMotivo) => l.length ? `<table class="tabela"><tbody>${l.map((p) => `<tr><td><a href="#/pessoas/${p.pessoa_id}">${esc(p.nome)}</a></td><td>${tagTipo(p.tipo)}</td>${comMotivo ? `<td class="muted">${esc(p.justificativa || '')}</td>` : ''}</tr>`).join('')}</tbody></table>` : '<p class="muted">Ninguém.</p>';
  rel.innerHTML = `
    ${tituloImpressao(`Encontro de ${fmtData(enc.data)}`)}
    <div class="numeros">
      ${numero('Presentes', pres.length, ant ? comparar(pres.length, ant.presentes) : '')}
      ${numero('Ausentes', aus.length, `${pct(pres.length, r.length)}% de presença`)}
      ${numero('Membros presentes', tipo('membro'), `${tipo('frequentador')} frequentadores`)}
      ${numero('Visitantes', tipo('visitante'), primeiraVez ? `${primeiraVez} na primeira vez` : '')}
    </div>
    ${enc.tema ? `<p style="margin-top:12px">Tema: ${esc(enc.tema)}</p>` : ''}
    <div class="colunas c2 mt">
      <section class="painel"><div class="painel-topo"><h2>Presentes (${pres.length})</h2></div><div class="painel-corpo">${tabela(pres)}</div></section>
      <section class="painel"><div class="painel-topo"><h2>Ausentes (${aus.length})</h2><span class="sub">para a Pastoral</span></div><div class="painel-corpo">${tabela(aus, true)}</div></section>
    </div>`;
  return { nome: `chamada-${enc.data}.csv`, linhas: [['Nome', 'Tipo', 'Situação', 'Motivo da falta'], ...r.map((p) => [p.nome, TIPOS[p.tipo], p.presente ? 'Presente' : 'Ausente', p.justificativa || ''])] };
}

// ---------------- Mês ----------------
async function mes(rel) {
  const ini = estado.mes + '-01', fim = fimMes(estado.mes), ma = mesAnterior(estado.mes);
  const [atual, anterior] = await Promise.all([periodo(ini, fim), periodo(ma + '-01', fimMes(ma))]);
  if (!atual.encontros.length) { rel.innerHTML = `<div class="painel vazio">Nenhuma chamada em ${nomeMes(estado.mes)}.</div>`; return null; }
  const A = resumir(atual), B = anterior.encontros.length ? resumir(anterior) : null;

  const porPessoa = new Map();
  atual.presencas.forEach((p) => {
    const x = porPessoa.get(p.pessoa_id) || { id: p.pessoa_id, nome: p.nome, tipo: p.tipo, pres: 0, tot: 0 };
    x.tot++; if (p.presente) x.pres++; porPessoa.set(p.pessoa_id, x);
  });
  const ranking = [...porPessoa.values()].sort((a, b) => b.pres / b.tot - a.pres / a.tot || a.nome.localeCompare(b.nome));
  const novos = new Set(atual.presencas.filter((p) => p.data_cadastro >= ini && p.data_cadastro <= fim).map((p) => p.pessoa_id)).size;

  rel.innerHTML = `
    ${tituloImpressao(nomeMes(estado.mes))}
    <div class="numeros">
      ${numero('Encontros', A.porEnc.length, B ? comparar(A.porEnc.length, B.porEnc.length) : '')}
      ${numero('Média de presentes', String(A.media).replace('.', ','), B ? comparar(A.media, B.media) : '')}
      ${numero('Pessoas diferentes', A.unicos, 'vieram ao menos uma vez')}
      ${numero('Novos', novos, 'cadastrados no mês')}
    </div>
    <section class="painel mt"><div class="painel-topo"><h2>Presentes por sexta</h2><span class="sub">${nomeMes(estado.mes)}</span></div><div class="painel-corpo">
      <div class="grafico" style="height:220px"><canvas id="g-mes" role="img" aria-label="Presentes por sexta no mês"></canvas></div>
      ${tabelaDados(A.porEnc.map((e) => fmtData(e.data)), [{ rotulo: 'Presentes', dados: A.porEnc.map((e) => e.presentes) }, { rotulo: 'Ausentes', dados: A.porEnc.map((e) => e.ausentes) }])}
    </div></section>
    <section class="painel mt"><div class="painel-topo"><h2>Frequência de cada pessoa</h2></div><div class="painel-corpo"><div class="tabela-wrap">
      <table class="tabela"><thead><tr><th>Nome</th><th>Tipo</th><th class="dir">Veio</th><th class="dir">%</th></tr></thead><tbody>
      ${ranking.map((p) => `<tr><td><a href="#/pessoas/${p.id}">${esc(p.nome)}</a></td><td>${tagTipo(p.tipo)}</td><td class="dir num">${p.pres} de ${p.tot}</td><td class="dir num">${pct(p.pres, p.tot)}%</td></tr>`).join('')}
      </tbody></table></div></div></section>`;
  graficos.push(barras($('#g-mes'), { rotulos: A.porEnc.map((e) => fmtDiaMes(e.data)), series: [{ rotulo: 'Presentes', dados: A.porEnc.map((e) => e.presentes), cor: COR.s1 }] }));
  return { nome: `frequencia-${estado.mes}.csv`, linhas: [['Nome', 'Tipo', 'Presenças', 'Encontros', '%'], ...ranking.map((p) => [p.nome, TIPOS[p.tipo], p.pres, p.tot, pct(p.pres, p.tot)])] };
}

// ---------------- Ano ----------------
async function ano(rel) {
  const y = estado.ano;
  const [atual, anterior] = await Promise.all([periodo(`${y}-01-01`, `${y}-12-31`), periodo(`${y - 1}-01-01`, `${y - 1}-12-31`)]);
  if (!atual.encontros.length) { rel.innerHTML = `<div class="painel vazio">Nenhuma chamada em ${y}.</div>`; return null; }
  const A = resumir(atual), B = anterior.encontros.length ? resumir(anterior) : null;
  const mediaMes = (R) => MESES.map((_, m) => { const e = R.porEnc.filter((x) => parseISO(x.data).getMonth() === m); return e.length ? Math.round((e.reduce((s, x) => s + x.presentes, 0) / e.length) * 10) / 10 : null; });
  const mA = mediaMes(A), mB = B ? mediaMes(B) : null;
  const maior = A.porEnc.reduce((m, e) => (!m || e.presentes > m.presentes ? e : m), null);

  rel.innerHTML = `
    ${tituloImpressao(`Ano de ${y}`)}
    <div class="numeros">
      ${numero('Encontros', A.porEnc.length, B ? comparar(A.porEnc.length, B.porEnc.length) : '')}
      ${numero('Média de presentes', String(A.media).replace('.', ','), B ? comparar(A.media, B.media) : '')}
      ${numero('Pessoas diferentes', A.unicos, 'vieram ao menos uma vez')}
      ${numero('Maior encontro', maior.presentes, fmtData(maior.data))}
    </div>
    <section class="painel mt"><div class="painel-topo"><h2>Média de presentes por mês</h2><span class="sub">${B ? `${y} e ${y - 1}` : y}</span></div><div class="painel-corpo">
      <div class="grafico"><canvas id="g-ano" role="img" aria-label="Média de presentes por mês"></canvas></div>
      ${tabelaDados(MESES, [{ rotulo: String(y), dados: mA }, ...(B ? [{ rotulo: String(y - 1), dados: mB }] : [])])}
    </div></section>`;
  graficos.push(linhas($('#g-ano'), { rotulos: MESES, series: [{ rotulo: String(y), dados: mA, cor: COR.s1 }, ...(B ? [{ rotulo: String(y - 1), dados: mB, cor: COR.s2, tracejado: true }] : [])] }));
  return { nome: `ano-${y}.csv`, linhas: [['Mês', `Média ${y}`, ...(B ? [`Média ${y - 1}`] : [])], ...MESES.map((m, i) => [m, mA[i] ?? '', ...(B ? [mB[i] ?? ''] : [])])] };
}
