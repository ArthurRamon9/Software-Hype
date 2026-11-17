// Relatórios: semanal, mensal e anual (com comparações)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { sb, ok } from '../supabase.js';
import { icon, esc, $, $$, avatar, badgeTipo, fmtData, fmtDataCurta, parseISO, isoLocal, pct, baixarCSV, TIPOS, copyright } from '../ui.js';
import { barras, linhas, tabelaAlt, COR } from '../charts.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const estado = { modo: 'semanal', encontro: null, mes: isoLocal(new Date()).slice(0, 7), ano: new Date().getFullYear() };
let charts = [];

async function dadosPeriodo(ini, fim) {
  const encontros = ok(await sb.from('encontros').select('id,data,tema').gte('data', ini).lte('data', fim).order('data'));
  if (!encontros.length) return { encontros, pres: [] };
  const pres = ok(await sb.from('presencas').select('encontro_id,pessoa_id,presente,justificativa,pessoas(id,nome,tipo,data_cadastro)').in('encontro_id', encontros.map((e) => e.id)));
  return { encontros, pres };
}
const fimMes = (ym) => { const [y, m] = ym.split('-').map(Number); return isoLocal(new Date(y, m, 0)); };
const mesAnterior = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return isoLocal(d).slice(0, 7); };
const nomeMes = (ym) => parseISO(ym + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

function resumo({ encontros, pres }) {
  const porEnc = encontros.map((e) => {
    const r = pres.filter((p) => p.encontro_id === e.id);
    const p = r.filter((x) => x.presente);
    return { ...e, presentes: p.length, faltas: r.length - p.length, membros: p.filter((x) => x.pessoas?.tipo === 'membro').length, visitantes: p.filter((x) => x.pessoas?.tipo === 'visitante').length };
  });
  const total = porEnc.reduce((s, e) => s + e.presentes, 0);
  const media = porEnc.length ? Math.round((total / porEnc.length) * 10) / 10 : 0;
  const unicos = new Set(pres.filter((p) => p.presente).map((p) => p.pessoa_id)).size;
  return { porEnc, total, media, unicos };
}

function deltaHtml(atual, anterior, sufixo = '') {
  if (anterior === null || anterior === undefined) return '';
  const d = Math.round((atual - anterior) * 10) / 10;
  if (d === 0) return '<span class="muted">= igual ao período anterior</span>';
  return `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${sufixo}</span> vs período anterior`;
}
const stat = (ic, label, valor, foot = '') => `<div class="card stat"><div class="label"><span class="ic">${icon(ic)}</span>${label}</div><div class="value">${valor}</div><div class="foot">${foot}</div></div>`;

export async function render(content) {
  const todos = ok(await sb.from('encontros').select('id,data,tema').order('data', { ascending: false }));
  if (!estado.encontro && todos.length) estado.encontro = todos[0].id;
  const anos = [...new Set([new Date().getFullYear(), ...todos.map((e) => Number(e.data.slice(0, 4)))])].sort((a, b) => b - a);

  content.innerHTML = `
    <div class="page-head no-print">
      <div><h1>Relatórios</h1><p>Acompanhe a presença e compare períodos.</p></div>
      <div class="actions"><button class="btn btn-ghost" id="csv">${icon('download')} Exportar CSV</button><button class="btn btn-ghost" id="print">${icon('printer')} Imprimir / PDF</button></div>
    </div>
    <div class="toolbar no-print">
      <div class="seg" id="modo">
        <button data-m="semanal">Semanal</button><button data-m="mensal">Mensal</button><button data-m="anual">Anual</button>
      </div>
      <select class="input" id="sel-enc" style="width:auto">${todos.map((e) => `<option value="${e.id}">${fmtData(e.data)}${e.tema ? ' — ' + esc(e.tema) : ''}</option>`).join('') || '<option>Nenhum encontro</option>'}</select>
      <input type="month" class="input" id="sel-mes" style="width:auto" value="${estado.mes}">
      <select class="input" id="sel-ano" style="width:auto">${anos.map((a) => `<option ${a === estado.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
    </div>
    <div id="rel"></div>`;

  const sync = () => {
    $$('#modo button').forEach((b) => b.classList.toggle('active', b.dataset.m === estado.modo));
    $('#sel-enc').classList.toggle('hidden', estado.modo !== 'semanal');
    $('#sel-mes').classList.toggle('hidden', estado.modo !== 'mensal');
    $('#sel-ano').classList.toggle('hidden', estado.modo !== 'anual');
    if (estado.encontro) $('#sel-enc').value = estado.encontro;
  };
  let csvAtual = null;
  const gerar = async () => {
    charts.forEach((c) => c?.destroy()); charts = [];
    sync();
    const rel = $('#rel');
    rel.innerHTML = '<div class="boot" style="min-height:30vh"><div class="spinner"></div></div>';
    try {
      if (estado.modo === 'semanal') csvAtual = await semanal(rel, todos);
      else if (estado.modo === 'mensal') csvAtual = await mensal(rel);
      else csvAtual = await anual(rel);
    } catch (e) { rel.innerHTML = `<div class="card empty">${icon('alert')}<p>${esc(e.message)}</p></div>`; }
  };
  $$('#modo button').forEach((b) => b.addEventListener('click', () => { estado.modo = b.dataset.m; gerar(); }));
  $('#sel-enc').addEventListener('change', (e) => { estado.encontro = Number(e.target.value); gerar(); });
  $('#sel-mes').addEventListener('change', (e) => { if (e.target.value) { estado.mes = e.target.value; gerar(); } });
  $('#sel-ano').addEventListener('change', (e) => { estado.ano = Number(e.target.value); gerar(); });
  $('#print').onclick = () => window.print();
  $('#csv').onclick = () => csvAtual && baixarCSV(csvAtual.nome, csvAtual.linhas);
  await gerar();
  return () => { charts.forEach((c) => c?.destroy()); charts = []; };
}

const cabecalhoImpressao = (titulo) => `<div class="print-only" style="margin-bottom:16px"><h1>Gestão do Hype — ${titulo}</h1><p class="small">${copyright()}</p></div>`;

// ---------------- SEMANAL ----------------
async function semanal(rel, todos) {
  const idx = todos.findIndex((e) => e.id === estado.encontro);
  const enc = todos[idx];
  if (!enc) { rel.innerHTML = `<div class="card empty">${icon('calendar')}<p>Nenhum encontro registrado ainda.</p><a class="btn btn-primary" href="#/presenca">Marcar presença</a></div>`; return null; }
  const ant = todos[idx + 1];
  const ids = [enc.id, ant?.id].filter(Boolean);
  const pres = ok(await sb.from('presencas').select('encontro_id,pessoa_id,presente,justificativa,pessoas(id,nome,tipo,data_cadastro)').in('encontro_id', ids));
  const r = pres.filter((p) => p.encontro_id === enc.id).sort((a, b) => (a.pessoas?.nome || '').localeCompare(b.pessoas?.nome || ''));
  const presentes = r.filter((p) => p.presente), faltas = r.filter((p) => !p.presente);
  const antPres = ant ? pres.filter((p) => p.encontro_id === ant.id && p.presente).length : null;
  const novos = presentes.filter((p) => p.pessoas?.data_cadastro === enc.data);
  const porTipo = (t) => presentes.filter((p) => p.pessoas?.tipo === t).length;

  const linhaP = (p) => `<div class="list-item">${avatar(p.pessoas?.nome || '?', null, 'sm')}<div class="grow"><b>${esc(p.pessoas?.nome)}</b><span>${badgeTipo(p.pessoas?.tipo)}${p.justificativa ? ' · ' + esc(p.justificativa) : ''}</span></div></div>`;
  rel.innerHTML = `
    ${cabecalhoImpressao(`Relatório do encontro de ${fmtData(enc.data)}`)}
    <div class="grid grid-4">
      ${stat('checkSquare', 'Presentes', presentes.length, deltaHtml(presentes.length, antPres))}
      ${stat('x', 'Faltas', faltas.length, `${pct(presentes.length, r.length)}% de presença`)}
      ${stat('users', 'Membros presentes', porTipo('membro'), `${porTipo('frequentador')} frequentadores`)}
      ${stat('sparkles', 'Visitantes', porTipo('visitante'), `${novos.length} vieram pela 1ª vez`)}
    </div>
    ${enc.tema ? `<div class="notice info mt">${icon('info')}<span><b>Tema:</b> ${esc(enc.tema)}</span></div>` : ''}
    <div class="grid grid-2 mt">
      <div class="card"><div class="card-head"><h2>Presentes (${presentes.length})</h2></div><div class="list">${presentes.map(linhaP).join('') || '<p class="muted small">—</p>'}</div></div>
      <div class="card"><div class="card-head"><div><h2>Faltaram (${faltas.length})</h2><p>Lista para repassar à Pastoral</p></div></div><div class="list">${faltas.map(linhaP).join('') || '<p class="muted small">Ninguém faltou! 🙌</p>'}</div></div>
    </div>`;
  return {
    nome: `presenca-${enc.data}.csv`,
    linhas: [['Nome', 'Tipo', 'Situação', 'Justificativa'], ...r.map((p) => [p.pessoas?.nome, TIPOS[p.pessoas?.tipo], p.presente ? 'Presente' : 'Falta', p.justificativa || ''])],
  };
}

// ---------------- MENSAL ----------------
async function mensal(rel) {
  const ini = estado.mes + '-01', fim = fimMes(estado.mes);
  const ma = mesAnterior(estado.mes);
  const [atual, anterior] = await Promise.all([dadosPeriodo(ini, fim), dadosPeriodo(ma + '-01', fimMes(ma))]);
  const A = resumo(atual), B = resumo(anterior);

  // Frequência individual no mês
  const pessoas = new Map();
  atual.pres.forEach((p) => {
    if (!p.pessoas) return;
    const x = pessoas.get(p.pessoa_id) || { nome: p.pessoas.nome, tipo: p.pessoas.tipo, id: p.pessoa_id, pres: 0, tot: 0 };
    x.tot++; if (p.presente) x.pres++;
    pessoas.set(p.pessoa_id, x);
  });
  const ranking = [...pessoas.values()].sort((a, b) => b.pres / b.tot - a.pres / a.tot || b.pres - a.pres || a.nome.localeCompare(b.nome));
  const nEnc = atual.encontros.length;
  const novos = new Set(atual.pres.filter((p) => p.pessoas?.data_cadastro >= ini && p.pessoas?.data_cadastro <= fim).map((p) => p.pessoa_id)).size;

  if (!nEnc) { rel.innerHTML = `<div class="card empty">${icon('calendar')}<p>Nenhum encontro em ${nomeMes(estado.mes)}.</p></div>`; return null; }

  rel.innerHTML = `
    ${cabecalhoImpressao(`Relatório de ${nomeMes(estado.mes)}`)}
    <div class="grid grid-4">
      ${stat('calendar', 'Encontros', nEnc, deltaHtml(nEnc, anterior.encontros.length ? B.porEnc.length : null))}
      ${stat('chart', 'Média de presentes', A.media, deltaHtml(A.media, anterior.encontros.length ? B.media : null))}
      ${stat('users', 'Pessoas diferentes', A.unicos, 'vieram pelo menos 1 vez')}
      ${stat('sparkles', 'Novos no mês', novos, 'cadastrados e presentes')}
    </div>
    <div class="card mt">
      <div class="card-head"><div><h2>Presentes por encontro</h2><p>${nomeMes(estado.mes)}</p></div></div>
      <div class="chart-box sm"><canvas id="ch-m" role="img" aria-label="Presentes por encontro no mês"></canvas></div>
      ${tabelaAlt(A.porEnc.map((e) => fmtData(e.data)), [{ label: 'Presentes', data: A.porEnc.map((e) => e.presentes) }, { label: 'Faltas', data: A.porEnc.map((e) => e.faltas) }])}
    </div>
    <div class="card mt">
      <div class="card-head"><div><h2>Frequência individual</h2><p>Quantos encontros cada pessoa marcou presença no mês</p></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Tipo</th><th class="num">Presenças</th><th class="num">%</th></tr></thead>
      <tbody>${ranking.map((p) => `<tr><td><a href="#/pessoas/${p.id}">${esc(p.nome)}</a></td><td>${badgeTipo(p.tipo)}</td><td class="num">${p.pres}/${p.tot}</td>
        <td class="num"><span class="badge ${pct(p.pres, p.tot) >= 75 ? 'ok' : pct(p.pres, p.tot) >= 50 ? 'warn' : 'bad'}">${pct(p.pres, p.tot)}%</span></td></tr>`).join('')}</tbody></table></div>
    </div>`;

  charts.push(barras($('#ch-m'), {
    labels: A.porEnc.map((e) => fmtDataCurta(e.data)),
    series: [{ label: 'Presentes', data: A.porEnc.map((e) => e.presentes), cor: COR.s1 }],
  }));
  return {
    nome: `frequencia-${estado.mes}.csv`,
    linhas: [['Nome', 'Tipo', 'Presenças', 'Encontros marcados', '%'], ...ranking.map((p) => [p.nome, TIPOS[p.tipo], p.pres, p.tot, pct(p.pres, p.tot)])],
  };
}

// ---------------- ANUAL ----------------
async function anual(rel) {
  const y = estado.ano;
  const [atual, anterior] = await Promise.all([dadosPeriodo(`${y}-01-01`, `${y}-12-31`), dadosPeriodo(`${y - 1}-01-01`, `${y - 1}-12-31`)]);
  const A = resumo(atual), B = resumo(anterior);
  const porMes = (R) => MESES.map((_, m) => {
    const e = R.porEnc.filter((x) => parseISO(x.data).getMonth() === m);
    return e.length ? Math.round((e.reduce((s, x) => s + x.presentes, 0) / e.length) * 10) / 10 : null;
  });
  const mA = porMes(A), mB = porMes(B);
  const temAnterior = anterior.encontros.length > 0;
  const melhor = A.porEnc.reduce((m, e) => (!m || e.presentes > m.presentes ? e : m), null);

  if (!atual.encontros.length) { rel.innerHTML = `<div class="card empty">${icon('calendar')}<p>Nenhum encontro registrado em ${y}.</p></div>`; return null; }

  rel.innerHTML = `
    ${cabecalhoImpressao(`Relatório anual ${y}`)}
    <div class="grid grid-4">
      ${stat('calendar', 'Encontros no ano', atual.encontros.length, deltaHtml(atual.encontros.length, temAnterior ? anterior.encontros.length : null))}
      ${stat('chart', 'Média de presentes', A.media, deltaHtml(A.media, temAnterior ? B.media : null))}
      ${stat('users', 'Pessoas alcançadas', A.unicos, 'diferentes ao longo do ano')}
      ${stat('sparkles', 'Maior encontro', melhor ? melhor.presentes : '—', melhor ? fmtData(melhor.data) : '')}
    </div>
    <div class="card mt">
      <div class="card-head"><div><h2>Média de presentes por mês</h2><p>${temAnterior ? `${y} comparado com ${y - 1}` : `${y}`}</p></div></div>
      <div class="chart-box"><canvas id="ch-a" role="img" aria-label="Média mensal de presentes"></canvas></div>
      ${tabelaAlt(MESES, [{ label: String(y), data: mA }, ...(temAnterior ? [{ label: String(y - 1), data: mB }] : [])])}
    </div>`;

  charts.push(linhas($('#ch-a'), {
    labels: MESES,
    series: [{ label: String(y), data: mA, cor: COR.s1 }, ...(temAnterior ? [{ label: String(y - 1), data: mB, cor: COR.s2, tracejado: true }] : [])],
  }));
  return {
    nome: `relatorio-anual-${y}.csv`,
    linhas: [['Mês', `Média ${y}`, ...(temAnterior ? [`Média ${y - 1}`] : [])], ...MESES.map((m, i) => [m, mA[i] ?? '', ...(temAnterior ? [mB[i] ?? ''] : [])])],
  };
}
