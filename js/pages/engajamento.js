// Engajamento de sexta: o líder marca como cada um da escala serviu e conta como foi a sexta.
// Relatório: pessoas x sextas, gráfico das respostas, quem precisa de conversa e as observações dos líderes.
// Quem vê: líder de ministério (só os seus) e administradores (todos). A regra está na API.
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao, pode } from '../api.js';
import { esc, $, icon, aviso, avisoErro, ocupado, confirmar, isoLocal, semAcento } from '../ui.js';
import { baixarXLSX } from '../xlsx.js';
import { parametrosHash, atualizarContadores } from '../app.js';

export const ENG = {
  serviu: { rot: 'Compareceu e serviu', curto: 'Serviu' },
  parcial: { rot: 'Serviu parcialmente', curto: 'Parcial' },
  nao_serviu: { rot: 'Compareceu e não serviu', curto: 'Não serviu' },
  ausente: { rot: 'Ausente no dia', curto: 'Ausente' },
  trocou: { rot: 'Trocou de escala', curto: 'Trocou' },
};
const CHAVES = Object.keys(ENG);
// Administradores e líderes de ministérios que usam escala (quem lidera só a Integração, por exemplo, não vê a aba)
export const veEngajamento = () => pode('acessos.gerenciar') || (sessao.usuario?.ministerios || []).some((m) => m.lider && m.tem_escala !== false);

let aba = 'avaliar';
let minSel = null, dataSel = null;
let relMes = null, relMin = 'todos';

const maiusc = (t) => t.replace(/^./, (c) => c.toUpperCase());
const nomeMes = (m) => maiusc(new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
const somaMes = (m, n) => { const d = new Date(`${m}-15T12:00:00`); d.setMonth(d.getMonth() + n); return isoLocal(d).slice(0, 7); };
const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fimDoMes = (m) => { const d = new Date(`${m}-15T12:00:00`); d.setMonth(d.getMonth() + 1, 0); return isoLocal(d); };
const plural = (n, um, varios = `${um}s`) => `${n} ${n === 1 ? um : varios}`;
const pctTxt = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const chip = (e, extra = '') => (e ? `<span class="eng-chip e-${e}" title="${esc(ENG[e].rot)}${extra ? ` · ${esc(extra)}` : ''}">${ENG[e].curto}</span>` : '<span class="eng-chip vazio" title="Sem marcar">—</span>');

export async function render(conteudo) {
  const p = parametrosHash();
  if (p.get('ver') === 'relatorio') aba = 'relatorio';
  else if (p.get('min') || p.get('data')) aba = 'avaliar';
  if (p.get('min')) minSel = Number(p.get('min'));
  if (p.get('data')) dataSel = p.get('data');
  if (p.has('ver') || p.has('min') || p.has('data')) history.replaceState(null, '', '#/engajamento');

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Engajamento</h1><p class="sub">Como a equipe serviu em cada sexta.</p></div></div>
    <div class="abas" id="eng-aba"><button data-a="avaliar">Avaliar a sexta</button><button data-a="relatorio">Relatório</button></div>
    <div id="eng-corpo" style="margin-top:14px"><div class="boot"><span class="spin"></span></div></div>`;
  const corpo = $('#eng-corpo');
  const trocar = async () => {
    conteudo.querySelectorAll('#eng-aba button').forEach((b) => b.classList.toggle('ativo', b.dataset.a === aba));
    corpo.innerHTML = '<div class="boot"><span class="spin"></span></div>';
    try { await (aba === 'avaliar' ? avaliar(corpo) : relatorio(corpo)); } catch (e) { corpo.innerHTML = `<div class="painel vazio">${esc(e.message)}</div>`; }
  };
  $('#eng-aba').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b || b.dataset.a === aba) return;
    if (corpo.dataset.alterou === '1' && !(await confirmar('Sair sem salvar o que marcou?', { botao: 'Sair sem salvar', perigo: true }))) return;
    aba = b.dataset.a; trocar();
  });
  await trocar();
}

// ------------------------------------------------------------ Avaliar a sexta
async function avaliar(corpo) {
  const q = new URLSearchParams();
  if (minSel) q.set('ministerio', minSel);
  if (dataSel) q.set('data', dataSel);
  const d = await api('GET', `/engajamento?${q}`);
  corpo.dataset.alterou = '0'; corpo.dataset.obsMudou = '0';
  if (!d.ministerios.length) {
    corpo.innerHTML = '<div class="painel vazio"><b>Nenhum ministério</b>Quando você liderar um ministério com escala, ele aparece aqui.</div>';
    return;
  }
  minSel = d.ministerio; dataSel = d.data;
  const m = d.ministerios.find((x) => x.id === d.ministerio);
  const recarregar = () => avaliar(corpo).catch(avisoErro);
  const pendente = (x) => x.sextas[0] && x.sextas[0].marcados < x.sextas[0].escalados;
  const chipsMin = d.ministerios.length > 1 ? `<div class="chips" id="eng-min">${d.ministerios.map((x) => `<button data-min="${x.id}" class="${x.id === m.id ? 'ativo' : ''}" style="--c:${esc(x.cor)}"><i></i>${esc(x.nome)}${pendente(x) ? '<b class="eng-falta" title="Falta marcar a última sexta">•</b>' : ''}</button>`).join('')}</div>` : '';
  if (!d.data) {
    corpo.innerHTML = `${chipsMin}<div class="painel vazio"><b>Nenhuma sexta para avaliar agora</b>Quando passar uma sexta com escala da ${esc(m.nome)}, ela aparece aqui. As dos meses anteriores ficam no <a href="#/engajamento?ver=relatorio">Relatório</a>.</div>`;
    ligarMinisterios(corpo, recarregar);
    return;
  }

  // Estado da tela (o que ainda não foi salvo)
  const marcas = new Map(d.itens.map((i) => [i.id, { engajamento: i.engajamento, substituto_id: i.substituto_id }]));
  // Como estava ao abrir: ao salvar vai só o que mudou (se outro líder marcou alguém ao mesmo tempo, não é apagado)
  const original = new Map(d.itens.map((i) => [i.id, `${i.engajamento || ''}|${i.substituto_id || ''}`]));
  // Chamada feita e a pessoa não foi marcada presente: já vem como "Ausente no dia" (o líder confere)
  const pelaChamada = new Set();
  d.itens.forEach((i) => { if (!i.engajamento && i.presente === false) { marcas.get(i.id).engajamento = 'ausente'; pelaChamada.add(i.id); } });
  const aval = { o_que: d.avaliacao?.o_que || '', acoes: d.avaliacao?.acoes || '', avancar: new Set(d.avaliacao?.avancar || []), avancar_outro: d.avaliacao?.avancar_outro || '' };
  const temObs = !!(aval.o_que || aval.acoes || aval.avancar.size || aval.avancar_outro);
  // Botão Salvar: vira "Salvo" quando não tem nada para gravar
  const pintarBotao = () => {
    const b = $('#eng-ok', corpo); if (!b || b.disabled && b.querySelector('.spin')) return;
    const salvo = corpo.dataset.alterou !== '1' && d.itens.some((i) => marcas.get(i.id).engajamento);
    b.classList.toggle('salvo', salvo);
    b.innerHTML = salvo ? `${icon('check')} Salvo` : 'Salvar';
  };
  const alterou = () => { const antes = corpo.dataset.alterou; corpo.dataset.alterou = '1'; if (antes !== '1') pintarBotao(); };
  if (pelaChamada.size) alterou();

  const funcoes = [...new Set(d.itens.map((i) => i.funcao || ''))];
  // Sextas para avaliar: as deste mês e as anteriores que ainda faltam marcar (as antigas ficam no Relatório)
  const inicioMes = `${isoLocal(new Date()).slice(0, 7)}-01`;
  const sextas = m.sextas.filter((s) => s.data === d.data || s.data >= inicioMes || s.marcados < s.escalados).slice(0, 8);
  const linha = (i) => {
    const v = marcas.get(i.id);
    const outros = d.membros.filter((x) => x.id !== i.pessoa_id);
    return `<div class="eng-linha ${v.engajamento ? `marcada e-${v.engajamento}` : ''}" data-i="${i.id}">
      <div class="eng-pessoa"><b>${esc(i.nome)}</b>${pelaChamada.has(i.id) && v.engajamento === 'ausente' ? '<small class="eng-dica">Não estava na chamada</small>' : i.presente === false && v.engajamento && v.engajamento !== 'ausente' && v.engajamento !== 'trocou' ? '<small class="eng-dica">Não estava na chamada</small>' : ''}</div>
      <span class="eng-sel"><select class="input" data-sel="${i.id}" aria-label="Como ${esc(i.nome)} serviu"><option value="">Marcar</option>${CHAVES.map((k) => `<option value="${k}" ${v.engajamento === k ? 'selected' : ''}>${ENG[k].curto}</option>`).join('')}</select></span>
      ${CHAVES.map((k) => `<button type="button" class="eng-op e-${k} ${v.engajamento === k ? 'ativo' : ''}" data-v="${k}" aria-pressed="${v.engajamento === k}" title="${esc(ENG[k].rot)}"><i aria-hidden="true"></i><span>${ENG[k].curto}</span></button>`).join('')}
      ${v.engajamento === 'trocou' ? `<div class="eng-troca"><label for="sub-${i.id}">Quem serviu no lugar</label>
        <select class="input" id="sub-${i.id}" data-sub="${i.id}"><option value="">Ninguém da equipe / não sei</option>${outros.map((x) => `<option value="${x.id}" ${v.substituto_id === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>` : ''}
    </div>`;
  };
  const contagem = () => { const n = [...marcas.values()].filter((x) => x.engajamento).length; return `${n} de ${d.itens.length} marcados`; };

  corpo.innerHTML = `${chipsMin}
    <div class="eng-sextas" id="eng-sextas" role="tablist" aria-label="Sextas">${sextas.map((s) => `<button type="button" data-d="${s.data}" class="${s.data === d.data ? 'ativo' : ''}">
      <b>Sexta ${diaMes(s.data)}</b><small class="${s.marcados >= s.escalados ? 'ok' : ''}">${s.marcados >= s.escalados ? `${icon('check')}Feita` : s.marcados ? `${s.marcados} de ${s.escalados}` : 'Falta marcar'}</small></button>`).join('')}</div>
    <section class="painel eng-quadro" style="--c:${esc(m.cor)}">
      <div class="eng-topo"><div><h2><i class="bolinha-min" style="background:${esc(m.cor)}"></i>${esc(m.nome)} · Sexta ${diaMes(d.data)}</h2>
        <span class="muted small" id="eng-conta">${contagem()}</span></div>
        <button type="button" class="btn sm" id="eng-todos" title="Marca como Compareceu e serviu quem ainda está sem marcar">Os outros serviram</button></div>
      ${pelaChamada.size ? `<p class="eng-aviso">${icon('alerta')}<span>${pelaChamada.size === 1 ? '1 pessoa não estava' : `${pelaChamada.size} pessoas não estavam`} na chamada desta sexta e já ${pelaChamada.size === 1 ? 'vem marcada' : 'vêm marcadas'} como <b>Ausente no dia</b>. Confira antes de salvar.</span></p>` : !d.chamada_feita ? '<p class="hint eng-hint">A chamada desta sexta ainda não foi feita: quando for, quem faltou já aparece como Ausente.</p>' : ''}
      <div class="eng-tabela" id="eng-lista">
        <div class="eng-cab"><span>Pessoa</span>${CHAVES.map((k) => `<span class="e-${k}"><i></i>${ENG[k].rot}</span>`).join('')}</div>
        ${funcoes.map((f) => `${funcoes.length > 1 || f ? `<div class="eng-funcao">${esc(f || 'Sem função')}</div>` : ''}${d.itens.filter((i) => (i.funcao || '') === f).map(linha).join('')}`).join('')}
      </div>
    </section>
    <section class="painel eng-obs ${temObs ? 'aberta' : ''}">
      <button type="button" class="eng-obs-tog" id="ob-tog" aria-expanded="${temObs}" aria-controls="ob-corpo">${icon('chevron')}
        <span><b>Teve algum problema?</b><small id="ob-resumo"></small></span><span id="ob-estado"></span></button>
      <div class="eng-obs-corpo" id="ob-corpo" ${temObs ? '' : 'hidden'}>
        <label class="campo"><span class="label">O que aconteceu de errado ou defasado?</span><textarea class="input" id="ob-oque" rows="3" maxlength="2000" placeholder="Ex.: faltou gente na saída, chegaram atrasados">${esc(aval.o_que)}</textarea></label>
        <label class="campo"><span class="label">Que ações foram tomadas?</span><textarea class="input" id="ob-acoes" rows="3" maxlength="2000" placeholder="Ex.: remanejei a Entrada para a Saída">${esc(aval.acoes)}</textarea></label>
        <div class="campo"><span class="label">Precisamos avançar de outra forma?</span>
          <div class="eng-avancar" id="ob-avancar">${d.opcoes_avancar.map((o) => `<label><input type="checkbox" value="${esc(o)}" ${aval.avancar.has(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>
          <input class="input" id="ob-outro" maxlength="400" placeholder="Outro (escreva)" value="${esc(aval.avancar_outro)}" style="margin-top:8px"></div>
      </div>
    </section>
    <div class="eng-salvar"><span class="muted small" id="eng-conta2">${contagem()}</span><button type="button" class="btn primary" id="eng-ok">Salvar</button></div>`;
  pintarBotao();
  // Cabeçalho do "Teve algum problema?": sempre de acordo com o que está salvo e com o que está escrito agora
  let obsSalva = temObs;
  const obsNaTela = () => !!($('#ob-oque', corpo).value.trim() || $('#ob-acoes', corpo).value.trim() || $('#ob-outro', corpo).value.trim()
    || corpo.querySelector('#ob-avancar input:checked'));
  const pintarObs = () => {
    const agora = obsNaTela(), mudou = corpo.dataset.obsMudou === '1';
    $('#ob-resumo', corpo).textContent = mudou
      ? (agora ? 'Ainda não salvo' : obsSalva ? 'Respostas apagadas: salve para confirmar' : 'Se algo deu errado, conte aqui o que houve e o que fazer')
      : obsSalva ? 'Você contou como foi esta sexta' : 'Se algo deu errado, conte aqui o que houve e o que fazer';
    $('#ob-estado', corpo).innerHTML = mudou && (agora || obsSalva) ? '<span class="eng-obs-tag pend">Não salvo</span>' : obsSalva ? `<span class="eng-obs-tag ok">${icon('check')}Respondido</span>` : '';
  };
  pintarObs();
  corpo.querySelector('#ob-corpo').addEventListener('input', () => { corpo.dataset.obsMudou = '1'; pintarObs(); });
  corpo.querySelector('#ob-corpo').addEventListener('change', () => { corpo.dataset.obsMudou = '1'; pintarObs(); });
  corpo.querySelector('.eng-obs').addEventListener('eng:salvo', () => { obsSalva = obsNaTela(); corpo.dataset.obsMudou = '0'; pintarObs(); });
  $('#ob-tog', corpo).addEventListener('click', (e) => {
    const sec = corpo.querySelector('.eng-obs'), aberta = !sec.classList.contains('aberta');
    sec.classList.toggle('aberta', aberta); e.currentTarget.setAttribute('aria-expanded', aberta);
    $('#ob-corpo', corpo).hidden = !aberta;
    if (aberta) $('#ob-oque', corpo).focus({ preventScroll: true });
  });

  ligarMinisterios(corpo, recarregar);
  const lista = $('#eng-lista', corpo);
  const repintar = (id) => {
    const i = d.itens.find((x) => x.id === id);
    const velho = lista.querySelector(`.eng-linha[data-i="${id}"]`);
    velho.outerHTML = linha(i);
    $('#eng-conta', corpo).textContent = contagem(); $('#eng-conta2', corpo).textContent = contagem();
  };
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('.eng-op'); if (!b) return;
    const id = Number(b.closest('.eng-linha').dataset.i), v = marcas.get(id);
    v.engajamento = v.engajamento === b.dataset.v ? null : b.dataset.v;
    if (v.engajamento !== 'trocou') v.substituto_id = null;
    pelaChamada.delete(id);
    alterou(); repintar(id);
    if (v.engajamento === 'trocou') lista.querySelector(`[data-sub="${id}"]`)?.focus();
  });
  lista.addEventListener('change', (e) => {
    const c = e.target.closest('[data-sel]');
    if (c) {
      const id = Number(c.dataset.sel), v = marcas.get(id);
      v.engajamento = c.value || null;
      if (v.engajamento !== 'trocou') v.substituto_id = null;
      pelaChamada.delete(id);
      alterou(); repintar(id);
      return;
    }
    const s = e.target.closest('[data-sub]'); if (!s) return;
    marcas.get(Number(s.dataset.sub)).substituto_id = s.value === '' ? null : Number(s.value);
    alterou();
  });
  $('#eng-todos', corpo).addEventListener('click', () => {
    let n = 0;
    d.itens.forEach((i) => { const v = marcas.get(i.id); if (!v.engajamento) { v.engajamento = 'serviu'; n++; repintar(i.id); } });
    if (n) alterou(); else aviso('Todos já estão marcados.');
  });
  corpo.querySelector('.eng-obs').addEventListener('input', alterou);
  $('#eng-sextas', corpo).addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-d]'); if (!b || b.dataset.d === d.data) return;
    if (corpo.dataset.alterou === '1' && !(await confirmar('Trocar de sexta sem salvar o que marcou?', { botao: 'Trocar sem salvar', perigo: true }))) return;
    dataSel = b.dataset.d; recarregar();
  });
  $('#eng-ok', corpo).addEventListener('click', (e) => {
    if (corpo.dataset.alterou !== '1' && e.currentTarget.classList.contains('salvo')) return aviso('Já está salvo.');
    ocupado(e.currentTarget, async () => {
    const avancar = [...corpo.querySelectorAll('#ob-avancar input:checked')].map((c) => c.value);
    try {
      const mudaram = d.itens.filter((i) => original.get(i.id) !== `${marcas.get(i.id).engajamento || ''}|${marcas.get(i.id).substituto_id || ''}`);
      await api('PUT', `/engajamento/${m.id}/${d.data}`, {
        marcas: mudaram.map((i) => ({ id: i.id, engajamento: marcas.get(i.id).engajamento, substituto_id: marcas.get(i.id).substituto_id || null })),
        ...(corpo.dataset.obsMudou === '1' ? { avaliacao: { o_que: $('#ob-oque', corpo).value, acoes: $('#ob-acoes', corpo).value, avancar, avancar_outro: $('#ob-outro', corpo).value } } : {}),
      });
      mudaram.forEach((i) => original.set(i.id, `${marcas.get(i.id).engajamento || ''}|${marcas.get(i.id).substituto_id || ''}`));
      corpo.dataset.alterou = '0';
      const faltam = d.itens.filter((i) => !marcas.get(i.id).engajamento).length;
      aviso(faltam ? `Salvo. Ainda falta marcar ${faltam}.` : 'Engajamento salvo.');
      // Atualiza a tela aqui mesmo (sem buscar tudo de novo): a sexta, o ministério e o "Não estava na chamada"
      d.itens.forEach((i) => { i.engajamento = marcas.get(i.id).engajamento; });
      pelaChamada.clear();
      const sx = m.sextas.find((x) => x.data === d.data);
      if (sx) {
        sx.marcados = d.itens.length - faltam;
        const chip = corpo.querySelector(`#eng-sextas button[data-d="${d.data}"] small`);
        if (chip) { chip.className = faltam ? '' : 'ok'; chip.innerHTML = faltam ? (sx.marcados ? `${sx.marcados} de ${sx.escalados}` : 'Falta marcar') : `${icon('check')}Feita`; }
      }
      corpo.querySelector('.eng-aviso')?.remove();
      corpo.querySelector(`#eng-min button[data-min="${m.id}"] .eng-falta`)?.toggleAttribute('hidden', !faltam);
      corpo.querySelector('.eng-obs')?.dispatchEvent(new Event('eng:salvo'));
      atualizarContadores();
    } catch (err) { avisoErro(err); }
    }).then(pintarBotao);
  });
}
function ligarMinisterios(corpo, recarregar) {
  corpo.querySelector('#eng-min')?.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-min]'); if (!b || Number(b.dataset.min) === minSel) return;
    if (corpo.dataset.alterou === '1' && !(await confirmar('Trocar de ministério sem salvar o que marcou?', { botao: 'Trocar sem salvar', perigo: true }))) return;
    minSel = Number(b.dataset.min); dataSel = null; recarregar();
  });
}

// ------------------------------------------------------------ Relatório
async function relatorio(corpo) {
  relMes = relMes || isoLocal(new Date()).slice(0, 7);
  const { itens, avaliacoes } = await api('GET', `/engajamento/relatorio?ini=${relMes}-01&fim=${fimDoMes(relMes)}`);
  corpo.dataset.alterou = '0';
  const recarregar = () => relatorio(corpo).catch(avisoErro);
  const mins = [...new Map(itens.map((i) => [i.ministerio_id, { id: i.ministerio_id, nome: i.ministerio, cor: i.cor }])).values()];
  if (relMin !== 'todos' && !mins.some((x) => x.id === relMin)) relMin = 'todos';
  const sel = relMin === 'todos' ? itens : itens.filter((i) => i.ministerio_id === relMin);
  const avs = relMin === 'todos' ? avaliacoes : avaliacoes.filter((a) => a.ministerio_id === relMin);

  const conta = (l) => { const c = Object.fromEntries([...CHAVES, 'sem'].map((k) => [k, 0])); l.forEach((i) => { c[i.engajamento || 'sem']++; }); return c; };
  const tot = conta(sel);
  const marcados = sel.length - tot.sem;
  const barra = (c, total) => `<div class="eng-barra" role="img" aria-label="${CHAVES.map((k) => `${ENG[k].rot}: ${c[k]}`).join(', ')}">${CHAVES.map((k) => (c[k] ? `<i class="e-${k}" style="flex:${c[k]}" title="${esc(ENG[k].rot)}: ${c[k]} (${pctTxt(c[k], total)})"></i>` : '')).join('')}${c.sem ? `<i class="sem" style="flex:${c.sem}" title="Sem marcar: ${c.sem}"></i>` : ''}</div>`;

  // Precisa de conversa: 2 ou mais "não serviu" ou "ausente" no mês
  const porPessoa = new Map();
  sel.forEach((i) => {
    const k = `${i.ministerio_id}|${i.pessoa_id}`;
    if (!porPessoa.has(k)) porPessoa.set(k, { nome: i.nome, ministerio: i.ministerio, ministerio_id: i.ministerio_id, pessoa_id: i.pessoa_id, itens: [] });
    porPessoa.get(k).itens.push(i);
  });
  const conversa = [...porPessoa.values()].map((x) => ({ ...x, ruins: x.itens.filter((i) => i.engajamento === 'nao_serviu' || i.engajamento === 'ausente') }))
    .filter((x) => x.ruins.length >= 2).sort((a, b) => b.ruins.length - a.ruins.length || a.nome.localeCompare(b.nome));

  const navMes = `<div class="nav-mes"><button class="btn sm icone" id="rel-ant" aria-label="Mês anterior">‹</button><b>${nomeMes(relMes)}</b><button class="btn sm icone" id="rel-prox" aria-label="Próximo mês">›</button></div>`;
  const filtro = mins.length > 1 ? `<div class="chips" id="rel-min"><button data-min="todos" class="${relMin === 'todos' ? 'ativo' : ''}">Todos</button>${mins.map((x) => `<button data-min="${x.id}" class="${x.id === relMin ? 'ativo' : ''}" style="--c:${esc(x.cor)}"><i></i>${esc(x.nome)}</button>`).join('')}</div>` : '';
  const topo = `<div class="eng-rel-topo">${navMes}${sel.length ? '<button class="btn sm" id="rel-xlsx">Baixar planilha</button>' : ''}</div>${filtro}`;
  if (!sel.length) {
    corpo.innerHTML = `${topo}<div class="painel vazio"><b>Nada neste mês</b>Quando houver escalas de sextas que já passaram, o relatório aparece aqui.</div>`;
    ligarRelatorio(corpo, recarregar, null);
    return;
  }

  const nPessoas = new Set(sel.map((i) => i.pessoa_id)).size;
  const nSextas = new Set(sel.map((i) => `${i.ministerio_id}|${i.data}`)).size;
  const minsVer = relMin === 'todos' ? mins : mins.filter((x) => x.id === relMin);
  const tabelaMin = (mm) => {
    const l = sel.filter((i) => i.ministerio_id === mm.id);
    const datas = [...new Set(l.map((i) => i.data))].sort();
    const pessoas = [...new Map(l.map((i) => [i.pessoa_id, i.nome])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const c = conta(l);
    return `<section class="painel eng-min-rel" style="margin-top:14px">
      <div class="painel-topo"><h2><i class="bolinha-min" style="background:${esc(mm.cor)}"></i>${esc(mm.nome)}</h2><span class="sub">${datas.length} sexta${datas.length === 1 ? '' : 's'} · ${c.sem ? `${c.sem} sem marcar` : 'Tudo marcado'}</span></div>
      <div style="padding:12px 18px 0">${barra(c, l.length)}</div>
      <div class="tabela-wrap"><table class="tabela eng-matriz"><thead><tr><th>Pessoa</th>${datas.map((s) => `<th class="centro">${diaMes(s)}</th>`).join('')}<th class="dir num" title="Quanto serviu nas vezes em que estava na escala (serviu em parte conta metade)">Serviu</th></tr></thead>
      <tbody>${pessoas.map(([pid, nome]) => {
        const dele = l.filter((i) => i.pessoa_id === pid);
        const cc = conta(dele), mk = dele.length - cc.sem;
        const ap = mk ? (cc.serviu + cc.parcial * 0.5) / mk : null;
        return `<tr><td>${esc(nome)}</td>${datas.map((s) => { const it = dele.filter((i) => i.data === s); return `<td class="centro">${it.length ? it.map((i) => `${it.length > 1 && i.funcao ? `<small class="eng-fn">${esc(i.funcao)}</small>` : ''}${chip(i.engajamento, [i.funcao, i.substituto ? `${i.substituto} serviu no lugar` : ''].filter(Boolean).join(' · '))}`).join(' ') : '<span class="muted">·</span>'}</td>`; }).join('')}
          <td class="dir num"><b class="${ap !== null && ap < 0.5 ? 'txt-ruim' : ''}">${ap === null ? '—' : `${Math.round(ap * 100)}%`}</b></td></tr>`;
      }).join('')}</tbody></table></div></section>`;
  };

  corpo.innerHTML = `${topo}
    <section class="painel"><div class="numeros eng-numeros">
      <div><div class="rot">Pessoas na escala</div><div class="val">${nPessoas}</div><div class="det">${plural(nSextas, 'sexta')} · ${plural(sel.length, 'lugar', 'lugares')} na escala</div></div>
      <div><div class="rot">Serviram</div><div class="val">${pctTxt(tot.serviu + tot.parcial, marcados)}</div><div class="det">${tot.serviu} por inteiro, ${tot.parcial} em parte</div></div>
      <div><div class="rot">Faltaram ou não serviram</div><div class="val">${tot.nao_serviu + tot.ausente}</div><div class="det">${plural(tot.ausente, 'ausente')}, ${tot.nao_serviu === 1 ? '1 foi e não serviu' : `${tot.nao_serviu} foram e não serviram`}</div></div>
      <div><div class="rot">Trocaram de escala</div><div class="val">${tot.trocou}</div><div class="det">${tot.sem ? `${tot.sem} ainda sem marcar` : 'Tudo marcado'}</div></div>
    </div></section>
    <section class="painel" style="margin-top:14px">
      <div class="painel-topo"><h2>Como serviram</h2><span class="sub">${marcados} de ${sel.length} marcados</span></div>
      <div class="eng-grafico">${[...CHAVES, 'sem'].map((k) => `<div class="eng-g-linha"><span class="eng-g-rot">${k === 'sem' ? 'Sem marcar' : ENG[k].rot}</span>
        <span class="eng-g-trilho"><i class="${k === 'sem' ? 'sem' : `e-${k}`}" style="width:${sel.length ? (tot[k] / sel.length) * 100 : 0}%"></i></span>
        <span class="eng-g-num"><b>${tot[k]}</b> ${pctTxt(tot[k], sel.length)}</span></div>`).join('')}</div>
      ${minsVer.length > 1 ? `<div class="eng-por-min">${minsVer.map((mm) => { const l = sel.filter((i) => i.ministerio_id === mm.id); return `<div class="eng-pm"><span><i class="bolinha-min" style="background:${esc(mm.cor)}"></i>${esc(mm.nome)}</span>${barra(conta(l), l.length)}</div>`; }).join('')}</div>` : ''}
    </section>
    <section class="painel" style="margin-top:14px">
      <div class="painel-topo"><h2>Precisa de conversa</h2><span class="sub">Duas vezes ou mais sem servir ou ausente no mês</span></div>
      ${conversa.length ? `<ul class="eng-conversa">${conversa.map((x) => `<li><span><b>${esc(x.nome)}</b><small>${esc(x.ministerio)}</small></span>
        <span class="eng-conv-datas">${x.ruins.map((i) => `${chip(i.engajamento)}<small>${diaMes(i.data)}</small>`).join('')}</span></li>`).join('')}</ul>`
        : '<p class="muted" style="padding:12px 18px 16px;margin:0">Ninguém neste mês. Bom sinal.</p>'}
    </section>
    ${minsVer.map(tabelaMin).join('')}
    <section class="painel" style="margin-top:14px">
      <div class="painel-topo"><h2>Observações dos líderes</h2><span class="sub">${avs.length ? `${avs.length} sexta${avs.length === 1 ? '' : 's'} com observações` : ''}</span></div>
      ${avs.length ? `<div class="eng-obs-lista">${avs.map((a) => `<article><h3>${esc(a.ministerio)} · Sexta ${diaMes(a.data)}</h3>
        ${a.o_que ? `<p><span>O que deu errado</span>${esc(a.o_que)}</p>` : ''}
        ${a.acoes ? `<p><span>Ações tomadas</span>${esc(a.acoes)}</p>` : ''}
        ${a.avancar.length || a.avancar_outro ? `<p><span>Próximos passos</span>${[...a.avancar, a.avancar_outro].filter(Boolean).map((t) => `<em class="tag">${esc(t)}</em>`).join(' ')}</p>` : ''}</article>`).join('')}</div>`
        : '<p class="muted" style="padding:12px 18px 16px;margin:0">Nenhuma observação neste mês.</p>'}
    </section>`;

  ligarRelatorio(corpo, recarregar, () => baixarXLSX(`engajamento-${relMin === 'todos' ? 'todos' : semAcento(mins.find((x) => x.id === relMin).nome).replace(/\s+/g, '-')}-${relMes}`, [
    { nome: 'Por sexta', linhas: [['Ministério', 'Data', 'Função', 'Pessoa', 'Engajamento', 'Serviu no lugar'],
      ...sel.map((i) => [i.ministerio, i.data, i.funcao || '', i.nome, i.engajamento ? ENG[i.engajamento].rot : 'Sem marcar', i.substituto || ''])] },
    { nome: 'Por pessoa', linhas: [['Ministério', 'Pessoa', 'Escalado', ...CHAVES.map((k) => ENG[k].rot), 'Sem marcar'],
      ...[...porPessoa.values()].map((x) => { const c = conta(x.itens); return [x.ministerio, x.nome, x.itens.length, ...CHAVES.map((k) => c[k]), c.sem]; })] },
    { nome: 'Observações', linhas: [['Ministério', 'Data', 'O que deu errado', 'Ações tomadas', 'Próximos passos'],
      ...avs.map((a) => [a.ministerio, a.data, a.o_que || '', a.acoes || '', [...a.avancar, a.avancar_outro].filter(Boolean).join('; ')])] },
  ]));
}
function ligarRelatorio(corpo, recarregar, baixar) {
  $('#rel-ant', corpo).addEventListener('click', () => { relMes = somaMes(relMes, -1); recarregar(); });
  $('#rel-prox', corpo).addEventListener('click', () => { relMes = somaMes(relMes, 1); recarregar(); });
  corpo.querySelector('#rel-min')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-min]'); if (!b) return;
    relMin = b.dataset.min === 'todos' ? 'todos' : Number(b.dataset.min); recarregar();
  });
  if (baixar) $('#rel-xlsx', corpo)?.addEventListener('click', baixar);
}
