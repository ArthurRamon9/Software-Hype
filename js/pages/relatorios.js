// Relatórios: semana, mês e ano
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, pode, sessao } from '../api.js';
import { esc, $, $$, tagTipo, fmtData, fmtDiaMes, parseISO, isoLocal, pct, TIPOS, ehMembro, direitos } from '../ui.js';
import { baixarXLSX } from '../xlsx.js';
import { barras, linhas, tabelaDados, COR } from '../charts.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const estado = { modo: 'semana', encontro: null, mes: isoLocal(new Date()).slice(0, 7), ano: new Date().getFullYear() };
let graficos = [];

const fimMes = (ym) => { const [y, m] = ym.split('-').map(Number); return isoLocal(new Date(y, m, 0)); };
const mesAnterior = (ym) => { const [y, m] = ym.split('-').map(Number); return isoLocal(new Date(y, m - 2, 1)).slice(0, 7); };
const nomeMes = (ym) => parseISO(ym + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
// O servidor manda o período enxuto; aqui volta ao formato completo que as contas usam
const periodo = async (ini, fim) => {
  const r = await api('GET', `/relatorios?ini=${ini}&fim=${fim}`);
  if (!r.pessoas) return r;
  const quem = new Map(r.pessoas.map((p) => [p.id, p]));
  return { encontros: r.encontros, presencas: r.presencas.map(([encontro_id, pessoa_id, presente, tipo, justificativa]) => {
    const p = quem.get(pessoa_id) || {};
    return { encontro_id, pessoa_id, presente: !!presente, tipo, justificativa, nome: p.nome, referencia: p.referencia, data_cadastro: p.data_cadastro };
  }) };
};

const media = (lista, campo) => (lista.length ? Math.round((lista.reduce((s, e) => s + e[campo], 0) / lista.length) * 10) / 10 : null);
const virgula = (n) => (n === null || n === undefined ? '—' : String(n).replace('.', ','));

// Resumo de um período, separando membros e visitantes (pela situação da pessoa no dia)
function resumir({ encontros, presencas }) {
  const porEnc = encontros.map((e) => {
    const r = presencas.filter((p) => p.encontro_id === e.id);
    const pres = r.filter((x) => x.presente);
    const membros = pres.filter((x) => ehMembro(x.tipo)).length;
    return { ...e, presentes: pres.length, ausentes: r.length - pres.length, membros, visitantes: pres.length - membros };
  });
  const vieram = presencas.filter((p) => p.presente);
  const unicosM = new Set(vieram.filter((p) => ehMembro(p.tipo)).map((p) => p.pessoa_id)).size;
  const unicos = new Set(vieram.map((p) => p.pessoa_id)).size;
  const vezes = new Map(); vieram.forEach((p) => vezes.set(p.pessoa_id, (vezes.get(p.pessoa_id) || 0) + 1));
  const frequentes = (min) => [...vezes.values()].filter((n) => n >= min).length;
  return {
    porEnc, unicos, unicosMembros: unicosM, unicosVisitantes: unicos - unicosM, frequentes,
    media: media(porEnc, 'presentes') ?? 0, mediaMembros: media(porEnc, 'membros') ?? 0, mediaVisitantes: media(porEnc, 'visitantes') ?? 0,
  };
}
function comparar(atual, anterior) {
  if (anterior === null || anterior === undefined) return '';
  const d = Math.round((atual - anterior) * 10) / 10;
  if (d === 0) return 'Igual ao período anterior';
  return `<span class="${d > 0 ? 'sobe' : 'desce'}">${d > 0 ? '+' : ''}${String(d).replace('.', ',')}</span> sobre o período anterior`;
}
const numero = (rot, val, det = '') => `<div><div class="rot">${rot}</div><div class="val">${val}</div><div class="det">${det || '&nbsp;'}</div></div>`;
const tituloImpressao = (t) => `<div class="so-impressao" style="margin-bottom:12px"><h1>Gestão do Hype · ${t}</h1><p class="small">${direitos()}</p></div>`;

export async function render(conteudo) {
  const veGeral = pode('relatorios.ver');
  const encontros = veGeral ? await api('GET', '/encontros') : [];
  if (!estado.encontro && encontros.length) estado.encontro = encontros[0].id;
  const anos = [...new Set([new Date().getFullYear(), ...encontros.map((e) => Number(e.data.slice(0, 4)))])].sort((a, b) => b - a);

  conteudo.innerHTML = `
    <div class="cabecalho nao-imprimir"><div><h1>Relatórios</h1></div>
      <div class="acoes">${pode('relatorios.exportar') ? '<button class="btn" id="csv">Baixar planilha</button><button class="btn" id="imprimir">Imprimir</button>' : ''}</div></div>
    <div class="nao-imprimir" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <div class="abas" id="modo">${veGeral ? '<button data-m="semana">Semana</button><button data-m="mes">Mês</button><button data-m="ano">Ano</button>' : ''}</div>
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
  if ($('#imprimir')) $('#imprimir').onclick = () => window.print();
  // Planilha no jeito do "Imprimir": primeiro o resumo (os números de cima), depois o gráfico e as tabelas
  if ($('#csv')) $('#csv').onclick = () => {
    if (!csv) return;
    const num = (t) => { const x = t.trim().replace(/\./g, '').replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : t.trim(); };
    const resumo = [...document.querySelectorAll('#rel .numeros > div')].map((d) => [d.querySelector('.rot')?.textContent.trim() || '', num(d.querySelector('.val')?.textContent || ''), (d.querySelector('.det')?.textContent || '').replace(/\s+/g, ' ').trim()]);
    const titulo = { semana: 'Semana', mes: 'Mês', ano: 'Ano' }[estado.modo];
    const abas = [
      ...(resumo.length ? [{ nome: 'Resumo', semFiltro: true, linhas: [[`Resumo · ${titulo}`, 'Valor', 'Detalhe'], ...resumo, [], ['Gerado em', new Date().toLocaleString('pt-BR'), direitos().replace(/<[^>]+>/g, '')]] }] : []),
      ...(csv.abas || [{ nome: 'Relatório', linhas: csv.linhas }]),
    ];
    baixarXLSX(csv.nome, abas);
  };
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
  const membrosP = pres.filter((p) => ehMembro(p.tipo)).length;
  const novos = pres.filter((p) => p.tipo === 'novo_visitante').length;
  const primeiraVez = pres.filter((p) => p.data_cadastro === enc.data).length;

  const tabela = (l, comMotivo) => l.length ? `<table class="tabela"><tbody>${l.map((p) => `<tr><td><a href="#/pessoas/${p.pessoa_id}">${esc(p.nome)}</a></td><td>${tagTipo(p.tipo)}</td>${comMotivo ? `<td class="muted">${esc(p.justificativa || '')}</td>` : ''}</tr>`).join('')}</tbody></table>` : '<p class="muted">Ninguém.</p>';
  rel.innerHTML = `
    ${tituloImpressao(`Encontro de ${fmtData(enc.data)}`)}
    <div class="numeros">
      ${numero('Presentes', pres.length, ant ? comparar(pres.length, ant.presentes) : '')}
      ${numero('Ausentes', aus.length, `${pct(pres.length, r.length)}% de presença`)}
      ${numero('Membros presentes', membrosP, `${pct(membrosP, pres.length)}% dos presentes`)}
      ${numero('Visitantes', pres.length - membrosP, novos ? `${novos} novo${novos > 1 ? 's' : ''} visitante${novos > 1 ? 's' : ''}${primeiraVez ? ` · ${primeiraVez} na primeira vez` : ''}` : '')}
    </div>
    ${enc.tema ? `<p style="margin-top:12px">Tema: ${esc(enc.tema)}</p>` : ''}
    <div class="colunas c2 mt">
      <section class="painel"><div class="painel-topo"><h2>Presentes (${pres.length})</h2></div><div class="painel-corpo">${tabela(pres)}</div></section>
      <section class="painel"><div class="painel-topo"><h2>Ausentes (${aus.length})</h2><span class="sub">Para a Pastoral</span></div><div class="painel-corpo">${tabela(aus, true)}</div></section>
    </div>`;
  return { nome: `chamada-${enc.data}`, linhas: [['Nome', 'Referência', 'Situação', 'Presença', 'Motivo da falta'], ...r.map((p) => [p.nome, p.referencia, TIPOS[p.tipo], p.presente ? 'Presente' : 'Ausente', p.justificativa || ''])] };
}

// ---------------- Mês ----------------
async function mes(rel) {
  const ini = estado.mes + '-01', fim = fimMes(estado.mes), ma = mesAnterior(estado.mes);
  const [atual, anterior] = await Promise.all([periodo(ini, fim), periodo(ma + '-01', fimMes(ma))]);
  if (!atual.encontros.length) { rel.innerHTML = `<div class="painel vazio">Nenhuma chamada em ${nomeMes(estado.mes)}.</div>`; return null; }
  const A = resumir(atual), B = anterior.encontros.length ? resumir(anterior) : null;

  const porPessoa = new Map();
  atual.presencas.forEach((p) => {
    const x = porPessoa.get(p.pessoa_id) || { id: p.pessoa_id, nome: p.nome, referencia: p.referencia, tipo: p.tipo, pres: 0, tot: 0 };
    x.tot++; if (p.presente) x.pres++; porPessoa.set(p.pessoa_id, x);
  });
  const ranking = [...porPessoa.values()].sort((a, b) => b.pres / b.tot - a.pres / a.tot || a.nome.localeCompare(b.nome));
  const novos = new Set(atual.presencas.filter((p) => p.data_cadastro >= ini && p.data_cadastro <= fim).map((p) => p.pessoa_id)).size;

  rel.innerHTML = `
    ${tituloImpressao(nomeMes(estado.mes))}
    <div class="numeros">
      ${numero('Média de presentes', virgula(A.media), `${A.porEnc.length} sexta${A.porEnc.length === 1 ? '' : 's'}${B ? ` · ${comparar(A.media, B.media)}` : ''}`)}
      ${numero('Membros por sexta', virgula(A.mediaMembros), B ? comparar(A.mediaMembros, B.mediaMembros) : 'Média do mês')}
      ${numero('Visitantes por sexta', virgula(A.mediaVisitantes), B ? comparar(A.mediaVisitantes, B.mediaVisitantes) : 'Média do mês')}
      ${numero('Vieram no mês', A.unicos, `${A.frequentes(Math.max(2, Math.ceil(A.porEnc.length / 2)))} vieram em metade das sextas ou mais${novos ? ` · ${novos} novos` : ''}`)}
    </div>
    <section class="painel mt"><div class="painel-topo"><h2>Membros e visitantes por sexta</h2><span class="sub">${nomeMes(estado.mes)}</span></div><div class="painel-corpo">
      <div class="grafico" style="height:240px"><canvas id="g-mes" role="img" aria-label="Membros e visitantes por sexta no mês"></canvas></div>
      ${tabelaDados(A.porEnc.map((e) => fmtData(e.data)), [{ rotulo: 'Membros', dados: A.porEnc.map((e) => e.membros) }, { rotulo: 'Visitantes', dados: A.porEnc.map((e) => e.visitantes) }, { rotulo: 'Total', dados: A.porEnc.map((e) => e.presentes) }, { rotulo: 'Ausentes', dados: A.porEnc.map((e) => e.ausentes) }])}
    </div></section>
    <section class="painel mt"><div class="painel-topo"><h2>Frequência de cada pessoa</h2></div><div class="painel-corpo"><div class="tabela-wrap">
      <table class="tabela"><thead><tr><th>Nome</th><th>Situação</th><th class="dir">Veio</th><th class="dir">%</th></tr></thead><tbody>
      ${ranking.map((p) => `<tr><td><a href="#/pessoas/${p.id}">${esc(p.nome)}</a></td><td>${tagTipo(p.tipo)}</td><td class="dir num">${p.pres} de ${p.tot}</td><td class="dir num">${pct(p.pres, p.tot)}%</td></tr>`).join('')}
      </tbody></table></div></div></section>`;
  graficos.push(barras($('#g-mes'), {
    rotulos: A.porEnc.map((e) => fmtDiaMes(e.data)), empilhado: true,
    series: [{ rotulo: 'Membros', dados: A.porEnc.map((e) => e.membros), cor: COR.s1 }, { rotulo: 'Visitantes', dados: A.porEnc.map((e) => e.visitantes), cor: COR.s2 }],
  }));
  return { nome: `frequencia-${estado.mes}`, abas: [
    { nome: 'Gráfico', linhas: [['Sexta', 'Membros', 'Visitantes', 'Total'], ...A.porEnc.map((e) => [fmtDiaMes(e.data), e.membros, e.visitantes, e.presentes])],
      grafico: { titulo: 'Membros e visitantes por sexta', tipo: 'barra', empilhado: true, categoria: 0, series: [1, 2], rotulos: true } },
    { nome: 'Frequência', linhas: [['Nome', 'Referência', 'Situação', 'Presenças', 'Sextas marcadas', '%'], ...ranking.map((p) => [p.nome, p.referencia, TIPOS[p.tipo], p.pres, p.tot, pct(p.pres, p.tot)])] },
    { nome: 'Por sexta', linhas: [['Data', 'Tema', 'Membros', 'Visitantes', 'Total de presentes', 'Ausentes'], ...A.porEnc.map((e) => [e.data, e.tema, e.membros, e.visitantes, e.presentes, e.ausentes])] },
  ] };
}

// ---------------- Ano ----------------
async function ano(rel) {
  const y = estado.ano;
  const [atual, anterior] = await Promise.all([periodo(`${y}-01-01`, `${y}-12-31`), periodo(`${y - 1}-01-01`, `${y - 1}-12-31`)]);
  if (!atual.encontros.length) { rel.innerHTML = `<div class="painel vazio">Nenhuma chamada em ${y}.</div>`; return null; }
  const A = resumir(atual), B = anterior.encontros.length ? resumir(anterior) : null;
  const mediaMes = (R, campo = 'presentes') => MESES.map((_, m) => media(R.porEnc.filter((x) => parseISO(x.data).getMonth() === m), campo));
  const mA = mediaMes(A), mB = B ? mediaMes(B) : null;
  // Pessoas diferentes que vieram em cada mês (quem veio 4 sextas conta 1 vez). Se a situação mudou no mês, vale a da última vinda.
  const dataEnc = new Map(atual.encontros.map((e) => [e.id, e.data]));
  const unicosMes = MESES.map((_, m) => {
    const ultima = new Map();
    atual.presencas.filter((p) => p.presente && dataEnc.has(p.encontro_id) && parseISO(dataEnc.get(p.encontro_id)).getMonth() === m)
      .sort((a, b) => dataEnc.get(a.encontro_id).localeCompare(dataEnc.get(b.encontro_id)))
      .forEach((p) => ultima.set(p.pessoa_id, p.tipo));
    if (!ultima.size) return { membros: null, visitantes: null, total: null };
    const membros = [...ultima.values()].filter(ehMembro).length;
    return { membros, visitantes: ultima.size - membros, total: ultima.size };
  });
  const memA = unicosMes.map((u) => u.membros), visA = unicosMes.map((u) => u.visitantes), totA = unicosMes.map((u) => u.total);
  const maior = A.porEnc.reduce((m, e) => (!m || e.presentes > m.presentes ? e : m), null);

  rel.innerHTML = `
    ${tituloImpressao(`Ano de ${y}`)}
    <div class="numeros">
      ${numero('Média de presentes', virgula(A.media), `${A.porEnc.length} sextas · maior: ${maior.presentes} em ${fmtDiaMes(maior.data)}`)}
      ${numero('Membros por sexta', virgula(A.mediaMembros), B ? comparar(A.mediaMembros, B.mediaMembros) : 'Média do ano')}
      ${numero('Visitantes por sexta', virgula(A.mediaVisitantes), B ? comparar(A.mediaVisitantes, B.mediaVisitantes) : 'Média do ano')}
      ${numero('Frequentes no ano', A.frequentes(Math.ceil(A.porEnc.length / 4)), `Vieram em 1/4 das sextas ou mais · ${A.unicos} passaram pelo Hype ao menos 1 vez`)}
    </div>
    <section class="painel mt"><div class="painel-topo"><h2>Quem veio em cada mês</h2><span class="sub">Pessoas diferentes em ${y}: quem veio várias sextas conta uma vez</span></div><div class="painel-corpo">
      <div class="grafico"><canvas id="g-ano-tipo" role="img" aria-label="Pessoas diferentes que vieram em cada mês"></canvas></div>
      ${tabelaDados(MESES, [{ rotulo: 'Membros', dados: memA }, { rotulo: 'Visitantes', dados: visA }, { rotulo: 'Total', dados: totA }])}
    </div></section>
    <section class="painel mt"><div class="painel-topo"><h2>Média de presentes por mês</h2><span class="sub">${B ? `${y} comparado com ${y - 1}` : y}</span></div><div class="painel-corpo">
      <div class="grafico"><canvas id="g-ano" role="img" aria-label="Média de presentes por mês"></canvas></div>
      ${tabelaDados(MESES, [{ rotulo: String(y), dados: mA }, ...(B ? [{ rotulo: String(y - 1), dados: mB }] : [])])}
    </div></section>`;
  graficos.push(barras($('#g-ano-tipo'), {
    rotulos: MESES, empilhado: true,
    series: [{ rotulo: 'Membros', dados: memA, cor: COR.s1 }, { rotulo: 'Visitantes', dados: visA, cor: COR.s2 }],
  }));
  graficos.push(linhas($('#g-ano'), { rotulos: MESES, series: [{ rotulo: String(y), dados: mA, cor: COR.s1 }, ...(B ? [{ rotulo: String(y - 1), dados: mB, cor: COR.s2, tracejado: true }] : [])] }));
  return { nome: `ano-${y}`, abas: [
    { nome: 'Gráfico', linhas: [['Mês', 'Membros', 'Visitantes', 'Total'], ...MESES.map((m, i) => [m, memA[i] ?? '', visA[i] ?? '', totA[i] ?? ''])],
      grafico: { titulo: `Quem veio em cada mês de ${y} (pessoas diferentes)`, tipo: 'barra', empilhado: true, categoria: 0, series: [1, 2], rotulos: true } },
    { nome: 'Média por sexta', linhas: [['Mês', String(y), ...(B ? [String(y - 1)] : [])], ...MESES.map((m, i) => [m, mA[i] ?? '', ...(B ? [mB[i] ?? ''] : [])])],
      grafico: { titulo: 'Média de presentes por sexta', tipo: 'linha', categoria: 0, series: B ? [1, 2] : [1] } },
    { nome: `Por mês ${y}`, linhas: [['Mês', 'Membros que vieram', 'Visitantes que vieram', 'Total de pessoas', `Média por sexta ${y}`, ...(B ? [`Média por sexta ${y - 1}`] : [])],
      ...MESES.map((m, i) => [m, memA[i] ?? '', visA[i] ?? '', totA[i] ?? '', mA[i] ?? '', ...(B ? [mB[i] ?? ''] : [])])] },
    { nome: 'Por sexta', linhas: [['Data', 'Tema', 'Membros', 'Visitantes', 'Total de presentes', 'Ausentes'], ...A.porEnc.map((e) => [e.data, e.tema, e.membros, e.visitantes, e.presentes, e.ausentes])] },
  ] };
}

