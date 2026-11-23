// Sugestões: qualquer pessoa com acesso manda ideias e melhorias para o site e acompanha o que saiu (Novidades).
// Quem cuida do site (sugestoes.gerenciar) usa como painel: Novas (analisar) → Backlog → Sprints de 15 dias
// (pronto para codificação → em codificação → codificado). Ao fechar a sprint, a nota vira as Novidades.
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api } from '../api.js';
import { esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, haQuanto, semAcento, fmtDiaMes, fmtData, parseISO, isoLocal } from '../ui.js';
import { baixarXLSX } from '../xlsx.js';
import { atualizarContadores, parametrosHash, marcarNovidadeVista } from '../app.js';

const TIPOS = { melhoria: 'Melhoria', ideia: 'Nova funcionalidade', problema: 'Algo com erro' };
// Quem cuida do site vê as etapas de trabalho; quem sugeriu vê em palavras simples
const STATUS_ADM = { nova: 'Aguardando análise', aceita: 'Pronto para codificação', fazendo: 'Em codificação', feita: 'Codificado', recusada: 'Recusada' };
const STATUS_PUB = { nova: 'Aguardando resposta', aceita: 'Aceita', fazendo: 'Em andamento', feita: 'Feita', recusada: 'Recusada' };
const ICONE_TIPO = { melhoria: 'sugestoes', ideia: 'plus', problema: 'alerta' };
const DIA = 86400000;
const maisDias = (iso, n) => isoLocal(new Date(parseISO(iso).getTime() + n * DIA + 2 * 3600000));

let aba = null;
let busca = '';
let soMinhas = false;
const abertas = new Set();   // sprints abertas na lista (como pastas)

const nomeSprint = (sp) => `Sprint ${sp.numero}${sp.titulo ? ` · ${sp.titulo}` : ''}`;
const periodo = (sp) => `${fmtDiaMes(sp.inicio)} a ${fmtDiaMes(sp.fim)}`;

export async function render(conteudo) {
  const { itens, gerencia, sprints, hoje } = await api('GET', '/sugestoes');
  const recarregar = () => { if (gerencia) atualizarContadores(); return render(conteudo).catch(avisoErro); };
  const STATUS = gerencia ? STATUS_ADM : STATUS_PUB;
  const ativas = sprints.filter((x) => x.status === 'aberta').sort((a, b) => a.inicio.localeCompare(b.inicio));
  const fechadas = sprints.filter((x) => x.status === 'fechada');   // já vêm da mais nova para a mais antiga
  // A sprint "de agora": a que tem o dia de hoje; senão a primeira em aberto
  const atual = ativas.find((x) => x.inicio <= hoje && hoje <= x.fim) || ativas[0] || null;
  if (!abertas.size && atual) abertas.add(atual.id);
  const daSprint = (sp) => itens.filter((i) => i.sprint_id === sp.id && i.status !== 'nova' && i.status !== 'recusada');
  const noBacklog = itens.filter((i) => ['aceita', 'fazendo', 'feita'].includes(i.status) && (!i.sprint_id || !sprints.some((x) => x.id === i.sprint_id)));
  const novas = itens.filter((i) => i.status === 'nova'), recusadas = itens.filter((i) => i.status === 'recusada');

  if (parametrosHash().get('ver') === 'novidades') aba = 'novidades';
  const ABAS = gerencia
    ? [['nova', 'Novas', novas.length], ['backlog', 'Backlog', noBacklog.length], ['sprints', 'Sprints', null], ['novidades', 'Novidades', null], ...(recusadas.length ? [['recusada', 'Recusadas', recusadas.length]] : [])]
    : [['todas', 'Sugestões', itens.length], ['novidades', 'Novidades', null]];
  if (!aba || !ABAS.some(([k]) => k === aba)) aba = gerencia ? (novas.length ? 'nova' : 'sprints') : 'todas';

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Sugestões</h1><p class="sub">${gerencia
      ? 'Analise as novas, guarde no backlog o que faz sentido e organize em sprints de 15 dias. Ao publicar, feche a sprint: a nota vira as Novidades para todos.'
      : 'Tem uma ideia ou viu algo que pode melhorar no site? Mande aqui. Tudo é lido; o que entrar no site aparece em Novidades.'}</p></div>
      <div class="acoes">
        ${gerencia ? '<button class="btn" id="sug-planilha">Baixar planilha</button>' : ''}
        <button class="btn primary" id="sug-nova">${icon('plus')} Nova sugestão</button>
      </div></div>
    <section class="painel">
      <div class="filtros" style="justify-content:space-between">
        <div class="abas" id="sug-abas">${ABAS.map(([k, r, n]) => `<button data-a="${k}" class="${aba === k ? 'ativo' : ''}">${r}${n !== null ? `<span class="sug-n">${n}</span>` : ''}</button>`).join('')}</div>
        ${gerencia ? '<button class="btn sm" id="sp-nova">' + icon('plus') + ' Nova sprint</button>' : ''}
      </div>
      <div class="filtros" id="sug-filtros">
        <input class="input busca" id="sug-busca" type="search" placeholder="Buscar sugestão" value="${esc(busca)}">
        <label class="check small"><input type="checkbox" id="sug-minhas" ${soMinhas ? 'checked' : ''}> Só as minhas</label>
      </div>
      <div id="sug-lista" class="sug-lista"></div>
    </section>`;

  const filtrar = (l) => {
    const b = semAcento(busca);
    return l.filter((i) => (!soMinhas || i.minha) && (!b || semAcento(`${i.titulo} ${i.detalhe || ''} ${i.autor || ''}`).includes(b)));
  };

  // ---- Cartão de uma sugestão (na sprint, com recuo de "filho")
  const cartao = (i, { filho = false } = {}) => {
    const naSprint = !!i.sprint_id && ativas.some((x) => x.id === i.sprint_id);
    const botoes = !gerencia ? '' : {
      nova: `<button class="btn sm primary" data-acao="aceita">${icon('check')} Aceitar</button><button class="btn sm" data-acao="recusar">Recusar</button>`,
      aceita: naSprint ? '<button class="btn sm" data-acao="fazendo">Iniciar</button>' : atual ? '<button class="btn sm" data-acao="naSprint">Pôr na sprint</button>' : '',
      fazendo: naSprint ? `<button class="btn sm primary" data-acao="feita">${icon('check')} Codificado</button>` : '',
      feita: '', recusada: '<button class="btn sm" data-acao="nova">Reabrir</button>',
    }[i.status];
    const clicavel = gerencia || (i.minha && i.status === 'nova');
    return `<article class="sug ${filho ? 'filho' : ''} ${clicavel ? 'clicavel' : ''}" data-id="${i.id}">
      <div class="sug-corpo">
        <div class="sug-topo"><span class="sug-tipo t-${i.tipo}">${icon(ICONE_TIPO[i.tipo])}${TIPOS[i.tipo]}</span>
          <span class="sug-status s-${i.status}">${i.status === 'feita' ? icon('check') : '<i></i>'}${STATUS[i.status]}</span></div>
        <h3 class="sug-tit">${esc(i.titulo)}</h3>
        ${i.detalhe && !filho ? `<p class="sug-detalhe">${esc(i.detalhe)}</p>` : ''}
        <div class="sug-pe">${i.minha ? 'Você' : esc(i.autor || 'Conta apagada')} · ${haQuanto(i.dt_criacao)}</div>
        ${i.resposta && !filho ? `<div class="sug-resposta"><b>Recado de quem cuida do site</b>${esc(i.resposta)}</div>` : ''}
      </div>
      ${botoes ? `<div class="sug-acoes">${botoes}</div>` : ''}
    </article>`;
  };

  const lista = (l, vazio) => (l.length ? filtrar(l).map((i) => cartao(i)).join('') || '<div class="vazio">Nada com esse filtro.</div>' : `<div class="vazio">${vazio}</div>`);

  // ---- Sprints como pastas: a de agora aberta; as outras fechadas até clicar
  const pastaSprint = (sp) => {
    const filhos = daSprint(sp);
    const prontas = filhos.filter((i) => i.status === 'feita').length;
    const ativa = sp.status === 'aberta';
    const faltam = Math.round((parseISO(sp.fim) - parseISO(hoje)) / DIA);
    const estado = !ativa ? `<span class="tag ok">Publicada${sp.dt_fechada ? ` em ${fmtDiaMes(String(sp.dt_fechada).slice(0, 10))}` : ''}</span>`
      : sp.inicio > hoje ? '<span class="tag">Planejada</span>'
      : faltam < 0 ? '<span class="tag warn">Terminou: feche ao publicar</span>'
      : `<span class="tag warn">Em andamento · ${faltam === 0 ? 'termina hoje' : faltam === 1 ? 'falta 1 dia' : `faltam ${faltam} dias`}</span>`;
    const aberta = abertas.has(sp.id);
    const ordem = { fazendo: 0, aceita: 1, feita: 2 };
    return `<div class="sprp ${aberta ? 'aberta' : ''}" data-sprint="${sp.id}">
      <div class="sprp-cab">
        <button type="button" class="sprp-tog" data-tog="${sp.id}" aria-expanded="${aberta}">${icon('chevron')}
          <span class="sprp-tit"><b>${esc(nomeSprint(sp))}</b><span class="muted small">${periodo(sp)}</span></span></button>
        ${estado}
        <span class="sprp-prog" title="${prontas} de ${filhos.length} codificadas"><span class="small">${prontas} de ${filhos.length}</span><span class="sprint-barra"><i style="width:${filhos.length ? Math.round(prontas / filhos.length * 100) : 0}%"></i></span></span>
        <span class="sprp-acoes">${ativa
          ? `<button class="btn sm" data-add="${sp.id}" ${noBacklog.length ? '' : 'disabled title="O backlog está vazio"'}>${icon('plus')} Do backlog</button><button class="btn sm" data-editar="${sp.id}">Editar</button>${sp.inicio <= hoje ? `<button class="btn sm ${faltam < 0 ? 'primary' : ''}" data-fechar-sp="${sp.id}">Fechar sprint</button>` : ''}`
          : `<button class="btn sm" data-editar="${sp.id}">Nota</button>`}</span>
      </div>
      <div class="sprp-corpo" ${aberta ? '' : 'hidden'}>${filhos.length
        ? filhos.sort((a, b) => ordem[a.status] - ordem[b.status]).map((i) => cartao(i, { filho: true })).join('')
        : `<div class="vazio small">${ativa ? 'Nada nesta sprint ainda. Use "Do backlog" para trazer o que vai ser feito.' : 'Nenhuma sugestão nesta sprint.'}</div>`}</div>
    </div>`;
  };

  const pintarNovidades = () => {
    if (fechadas[0]) marcarNovidadeVista(fechadas[0].id);
    // A mais nova aberta em cima; as anteriores descem, fechadas (clique para ver)
    $('#sug-lista').innerHTML = fechadas.length ? `<div class="novidades">${fechadas.map((sp, k) => {
      const ideias = itens.filter((i) => i.sprint_id === sp.id && i.status === 'feita');
      return `<details class="novidade" ${k === 0 ? 'open' : ''}>
        <summary class="novidade-cab"><h3>${sp.titulo ? esc(sp.titulo) : `Sprint ${sp.numero}`}${sp.titulo ? `<small>Sprint ${sp.numero}</small>` : ''}${k === 0 ? ' <span class="tag ok">Mais recente</span>' : ''}</h3>
          <span class="quando">${sp.dt_fechada ? `Publicada em ${fmtData(String(sp.dt_fechada).slice(0, 10))}` : ''}</span></summary>
        ${notaHtml(sp.notas)}
        ${ideias.length ? `<div class="ideias"><b>Sugestões de vocês que entraram</b><ul>${ideias.map((i) => `<li>${esc(i.titulo)} <span>· ${i.minha ? 'você' : esc(i.autor || 'conta apagada')}</span></li>`).join('')}</ul></div>` : ''}
      </details>`;
    }).join('')}</div>` : '<div class="vazio"><b>Nenhuma novidade ainda</b>Quando sair uma versão nova do site, o que mudou aparece aqui.</div>';
  };

  const pintar = () => {
    $('#sug-filtros').hidden = aba === 'novidades' || aba === 'sprints';
    $('#sp-nova') && ($('#sp-nova').hidden = aba !== 'sprints');
    if (aba === 'novidades') return pintarNovidades();
    if (aba === 'sprints') {
      const todas = [...ativas, ...fechadas];
      $('#sug-lista').innerHTML = todas.length ? `<div class="sprps">${todas.map(pastaSprint).join('')}</div>`
        : '<div class="vazio"><b>Nenhuma sprint ainda</b>Use "Nova sprint" para começar uma de 15 dias.</div>';
      return;
    }
    if (aba === 'nova') return void ($('#sug-lista').innerHTML = lista(novas, '<b>Nenhuma sugestão esperando análise</b>Quando alguém mandar uma, ela aparece aqui e no número do menu.'));
    if (aba === 'backlog') return void ($('#sug-lista').innerHTML = lista(noBacklog.sort((x, y) => String(x.dt_status || '').localeCompare(String(y.dt_status || ''))), '<b>Backlog vazio</b>O que você aceitar em "Novas" (ou criar em "Nova sugestão") fica aqui até entrar numa sprint.'));
    if (aba === 'recusada') return void ($('#sug-lista').innerHTML = lista(recusadas, '<b>Nenhuma sugestão recusada</b>'));
    $('#sug-lista').innerHTML = lista(itens, '<b>Nenhuma sugestão ainda</b>Use "Nova sugestão" para mandar a sua.');
  };
  pintar();

  conteudo.querySelectorAll('#sug-abas [data-a]').forEach((b) => b.addEventListener('click', () => {
    aba = b.dataset.a;
    conteudo.querySelectorAll('#sug-abas [data-a]').forEach((x) => x.classList.toggle('ativo', x === b));
    if (parametrosHash().get('ver') && aba !== 'novidades') history.replaceState(null, '', '#/sugestoes');
    pintar();
  }));
  $('#sug-busca').addEventListener('input', (e) => { busca = e.target.value; pintar(); });
  $('#sug-minhas').addEventListener('change', (e) => { soMinhas = e.target.checked; pintar(); });
  $('#sug-nova').addEventListener('click', () => editar(null, { gerencia, ativas, atual }, recarregar));
  $('#sp-nova')?.addEventListener('click', () => abrirSprint(sprints, hoje, recarregar));
  $('#sug-planilha')?.addEventListener('click', () => baixarXLSX('sugestoes-hype', [
    { nome: 'Sugestões', linhas: [['Sugestão', 'Detalhes', 'Tipo', 'Situação', 'Sprint', 'Quem sugeriu', 'Enviada em', 'Recado'],
      ...itens.map((i) => [i.titulo, i.detalhe || '', TIPOS[i.tipo], STATUS_ADM[i.status], i.sprint_id ? (sprints.find((x) => x.id === i.sprint_id)?.numero ?? '') : '',
        i.autor || '', String(i.dt_criacao).slice(0, 10), i.resposta || ''])] },
  ]));

  $('#sug-lista').addEventListener('click', async (e) => {
    // Pastas das sprints
    const tog = e.target.closest('[data-tog]');
    if (tog) { const id = Number(tog.dataset.tog); if (abertas.has(id)) abertas.delete(id); else abertas.add(id); return pintar(); }
    const sp = (attr) => sprints.find((x) => x.id === Number(e.target.closest(`[${attr}]`).getAttribute(attr)));
    if (e.target.closest('[data-add]')) return puxar(sp('data-add'), noBacklog, recarregar);
    if (e.target.closest('[data-editar]')) return editarSprint(sp('data-editar'), sprints, recarregar);
    if (e.target.closest('[data-fechar-sp]')) { const s = sp('data-fechar-sp'); return fecharSprint(s, daSprint(s), ativas.filter((x) => x.id !== s.id), sprints, hoje, recarregar); }
    // Sugestões
    const card = e.target.closest('[data-id]'); if (!card) return;
    const i = itens.find((x) => x.id === Number(card.dataset.id));
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (!acao) { if (gerencia || (i.minha && i.status === 'nova')) editar(i, { gerencia, ativas, atual }, recarregar); return; }
    if (acao === 'recusar') return recusar(i, recarregar);
    const btn = e.target.closest('[data-acao]');
    const corpo = acao === 'naSprint' ? { sprint_id: atual?.id } : { status: acao };
    const msg = { aceita: 'Foi para o backlog.', fazendo: 'Em codificação.', feita: 'Codificado. Entra na nota quando a sprint fechar.', nova: 'Voltou para as novas.', naSprint: `Entrou na ${atual ? nomeSprint(atual) : 'sprint'}.` };
    await ocupado(btn, async () => {
      try { await api('PUT', `/sugestoes/${i.id}`, corpo); aviso(msg[acao] || 'Pronto.'); recarregar(); } catch (err) { avisoErro(err); }
    });
  });
}

// A nota: cada linha que começa com "-" vira um item da lista; as outras, parágrafo
function notaHtml(notas) {
  const linhas = String(notas || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) return '';
  let html = '', itensLista = [];
  const fecha = () => { if (itensLista.length) html += `<ul>${itensLista.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`; itensLista = []; };
  linhas.forEach((l) => { const m = l.match(/^[-•*]\s*(.+)/); if (m) itensLista.push(m[1]); else { fecha(); html += `<p>${esc(l)}</p>`; } });
  fecha();
  return html;
}

// ---------- Sprints ----------
const camposDatas = (inicio, fim, pref = 'sp') => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
  <div class="field"><label for="${pref}-ini">Começa</label><input class="input" type="date" id="${pref}-ini" required value="${inicio}"></div>
  <div class="field"><label for="${pref}-fim">Termina</label><input class="input" type="date" id="${pref}-fim" required value="${fim}"></div></div>`;
// Fim padrão: 13 dias depois do começo (segunda a domingo da outra semana; publica na segunda seguinte)
const fimPadrao = (ini) => maisDias(ini, 13);
function ligarDatas(j, pref = 'sp') {
  const ini = j.querySelector(`#${pref}-ini`), fim = j.querySelector(`#${pref}-fim`);
  ini?.addEventListener('change', () => { if (ini.value) { fim.value = fimPadrao(ini.value); fim.dispatchEvent(new Event('change')); } });
}
// Próximo começo livre: o dia seguinte à última sprint (ou hoje)
const proximoLivre = (sprints, hoje) => {
  const ult = sprints.map((x) => x.fim).sort().pop();
  return ult && ult >= hoje ? maisDias(ult, 1) : hoje;
};

function abrirSprint(sprints, hoje, depois) {
  const ini = proximoLivre(sprints, hoje);
  janela({
    titulo: 'Nova sprint',
    corpo: `<form id="spf" style="display:grid;gap:14px">
      ${camposDatas(ini, fimPadrao(ini))}
      <div class="field"><label for="sp-tit">Nome da versão</label><input class="input" id="sp-tit" maxlength="80" placeholder="Opcional. Ex.: Versão 11"></div>
      <p class="hint" style="margin:0">O combinado: 15 dias, de segunda a domingo da outra semana, publicando na segunda seguinte. Dá para planejar a próxima, desde que os dias não encavalem com outra sprint.</p>
      <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Criar sprint</button></div></form>`,
    aoAbrir: (j, fechar) => {
      ligarDatas(j);
      j.querySelector('#spf').addEventListener('submit', async (e) => {
        e.preventDefault();
        await ocupado(e.submitter, async () => {
          try {
            const r = await api('POST', '/sprints', { inicio: j.querySelector('#sp-ini').value, fim: j.querySelector('#sp-fim').value, titulo: j.querySelector('#sp-tit').value });
            aviso(`Sprint ${r.numero} criada.`); aba = 'sprints'; abertas.add(r.id); fechar(); depois();
          } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

// Editar a sprint (datas, nome e rascunho da nota) ou corrigir a nota de uma já publicada
function editarSprint(sp, sprints, depois) {
  const ativa = sp.status === 'aberta';
  janela({
    titulo: ativa ? nomeSprint(sp) : `Nota da ${nomeSprint(sp)}`,
    larga: true,
    corpo: `<form id="spe" style="display:grid;gap:14px">
      ${ativa ? camposDatas(sp.inicio, sp.fim) : ''}
      <div class="field"><label for="sp-tit">Nome da versão</label><input class="input" id="sp-tit" maxlength="80" value="${esc(sp.titulo || '')}" placeholder="Opcional. Ex.: Versão 11"></div>
      <div class="field"><label for="sp-notas">${ativa ? 'Rascunho da nota (Novidades)' : 'Nota (Novidades)'}</label>
        <textarea class="input" id="sp-notas" rows="9" maxlength="4000" placeholder="- Uma novidade por linha, começando com tracinho">${esc(sp.notas || '')}</textarea>
        <span class="hint">${ativa ? 'Só você vê enquanto a sprint não for fechada. As sugestões codificadas aparecem embaixo da nota sozinhas.' : 'Todo mundo vê esta nota em Novidades.'}</span></div>
      <div class="janela-acoes rodape-acoes">
        ${ativa ? `<button type="button" class="link-btn danger com-icone" id="sp-apagar">${icon('lixeira')}Apagar sprint</button>` : '<span></span>'}
        <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      ligarDatas(j);
      j.querySelector('#spe').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = { titulo: j.querySelector('#sp-tit').value, notas: j.querySelector('#sp-notas').value };
        if (ativa) Object.assign(corpo, { inicio: j.querySelector('#sp-ini').value, fim: j.querySelector('#sp-fim').value });
        await ocupado(e.submitter, async () => {
          try { await api('PUT', `/sprints/${sp.id}`, corpo); aviso('Sprint salva.'); fechar(); depois(); } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#sp-apagar')?.addEventListener('click', async () => {
        if (!(await confirmar(`Apagar a ${nomeSprint(sp)}? O que estava nela volta para o backlog.`, { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/sprints/${sp.id}`); aviso('Sprint apagada.'); abertas.delete(sp.id); fechar(); depois(); } catch (err) { avisoErro(err); }
      });
    },
  });
}

// Trazer do backlog para a sprint
function puxar(sp, backlog, depois) {
  janela({
    titulo: `Trazer do backlog para a ${nomeSprint(sp)}`,
    corpo: `<form id="spp" style="display:grid;gap:14px">
      <p class="hint" style="margin:0">Marque o que vai ser feito nesta sprint.</p>
      <div class="puxar-lista">${backlog.map((i) => `<label><input type="checkbox" value="${i.id}"><span><b>${esc(i.titulo)}</b>
        <small>${TIPOS[i.tipo]} · ${i.minha ? 'Você' : esc(i.autor || 'Conta apagada')} · ${haQuanto(i.dt_criacao)}</small></span></label>`).join('')}</div>
      <div class="janela-acoes"><button type="button" class="btn" id="spp-todos">Marcar todos</button><span style="flex:1"></span><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Pôr na sprint</button></div></form>`,
    aoAbrir: (j, fechar) => {
      const caixas = () => [...j.querySelectorAll('.puxar-lista input')];
      j.querySelector('#spp-todos').addEventListener('click', () => { const todas = caixas().every((c) => c.checked); caixas().forEach((c) => { c.checked = !todas; }); j.alterou = true; });
      j.querySelector('#spp').addEventListener('submit', async (e) => {
        e.preventDefault();
        const ids = caixas().filter((c) => c.checked).map((c) => Number(c.value));
        if (!ids.length) return aviso('Marque pelo menos uma.', 'erro');
        await ocupado(e.submitter, async () => {
          try { await api('POST', `/sprints/${sp.id}/puxar`, { ids }); aviso(`${ids.length} na ${nomeSprint(sp)}.`); abertas.add(sp.id); fechar(); depois(); } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

// Fechar: a nota, o que fazer com o que não ficou pronto e a próxima sprint
function fecharSprint(sp, filhos, outrasAtivas, sprints, hoje, depois) {
  const prontas = filhos.filter((i) => i.status === 'feita');
  const pendentes = filhos.filter((i) => i.status !== 'feita');
  const proxPlanejada = outrasAtivas[0] || null;
  const proxIni = proximoLivre(sprints, hoje);
  janela({
    titulo: `Fechar a ${nomeSprint(sp)}`,
    larga: true,
    corpo: `<form id="spc" style="display:grid;gap:14px">
      <p class="hint" style="margin:0">Feche na segunda em que publicar: a nota aparece em Novidades para todo mundo, e o Início avisa quem ainda não viu.</p>
      <div class="field"><label for="sp-tit">Nome da versão</label><input class="input" id="sp-tit" maxlength="80" value="${esc(sp.titulo || '')}" placeholder="Opcional. Ex.: Versão 11"></div>
      <div class="field"><label for="sp-notas">O que mudou (Novidades)</label>
        <textarea class="input" id="sp-notas" rows="10" maxlength="4000" placeholder="- Uma novidade por linha, começando com tracinho">${esc(sp.notas || '')}</textarea>
        <span class="hint">Escreva para quem usa o site.${prontas.length ? ` As ${prontas.length} sugestões codificadas aparecem embaixo da nota com o nome de quem sugeriu.` : ''}</span></div>
      ${pendentes.length ? `<div class="field"><span class="label">${pendentes.length} não ficaram prontas</span>
        <label class="check"><input type="radio" name="pend" value="proxima" checked> Passar para a próxima sprint</label>
        <label class="check"><input type="radio" name="pend" value="backlog"> Voltar para o backlog</label></div>` : ''}
      ${proxPlanejada ? `<p class="hint" style="margin:0">A próxima já está planejada: ${esc(nomeSprint(proxPlanejada))} (${periodo(proxPlanejada)}).</p>`
        : `<label class="check"><input type="checkbox" id="sp-abrir" checked> Já criar a próxima sprint</label><div id="sp-prox">${camposDatas(proxIni, fimPadrao(proxIni), 'px')}</div>`}
      <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Fechar e publicar a nota</button></div></form>`,
    aoAbrir: (j, fechar) => {
      ligarDatas(j, 'px');
      const abrir = j.querySelector('#sp-abrir');
      abrir?.addEventListener('change', () => { j.querySelector('#sp-prox').hidden = !abrir.checked; });
      j.querySelector('#spc').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = { titulo: j.querySelector('#sp-tit').value, notas: j.querySelector('#sp-notas').value,
          pendentes: j.querySelector('input[name=pend]:checked')?.value || 'proxima',
          proxima: abrir?.checked ? { inicio: j.querySelector('#px-ini').value, fim: j.querySelector('#px-fim').value } : null };
        await ocupado(e.submitter, async () => {
          try {
            const r = await api('POST', `/sprints/${sp.id}/fechar`, corpo);
            aviso(`${nomeSprint(sp)} fechada. A nota já está em Novidades.`);
            abertas.delete(sp.id); if (r.nova) abertas.add(r.nova); else if (proxPlanejada) abertas.add(proxPlanejada.id);
            fechar(); atualizarContadores(); depois();
          } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

// Recusar pede um recado opcional (quem sugeriu vê o motivo)
function recusar(i, depois) {
  janela({
    titulo: 'Recusar sugestão',
    corpo: `<form id="sr" style="display:grid;gap:14px">
      <p><b>${esc(i.titulo)}</b></p>
      <div class="field"><label for="sr-resp">Recado para quem sugeriu</label>
        <textarea class="input" id="sr-resp" rows="3" maxlength="500" placeholder="Ex.: Já dá para fazer isso em Relatórios → Baixar planilha.">${esc(i.resposta || '')}</textarea>
        <span class="hint">Opcional, mas ajuda a pessoa a entender.</span></div>
      <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn danger">Recusar</button></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#sr-resp').focus();
      j.querySelector('#sr').addEventListener('submit', async (e) => {
        e.preventDefault();
        await ocupado(e.submitter, async () => {
          try { await api('PUT', `/sugestoes/${i.id}`, { status: 'recusada', resposta: j.querySelector('#sr-resp').value }); aviso('Sugestão recusada.'); fechar(); depois(); } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}


// ---------- Nova / abrir sugestão ----------
// Quem gerencia vê tudo numa janela: tipo, quem pediu, detalhes, etapa, onde está (backlog ou sprint) e o recado
function editar(i, { gerencia, ativas, atual }, depois) {
  const nova = !i;
  const podeApagar = !nova && (gerencia || (i.minha && i.status === 'nova'));
  const ondeInicial = nova ? '' : (i.sprint_id && ativas.some((x) => x.id === i.sprint_id) ? String(i.sprint_id) : '');
  const opcoesOnde = `<option value="">Backlog</option>${ativas.map((x) => `<option value="${x.id}" ${ondeInicial === String(x.id) ? 'selected' : ''}>${esc(nomeSprint(x))} (${periodo(x)})</option>`).join('')}`;
  janela({
    titulo: nova ? 'Nova sugestão' : 'Sugestão',
    larga: gerencia && !nova,
    corpo: `<form id="sf" style="display:grid;gap:14px">
      <div style="display:grid;grid-template-columns:${gerencia && !nova ? '1fr 1fr' : '1fr'};gap:12px">
        <div class="field"><label for="sf-tipo">Tipo</label>
          <select class="input" id="sf-tipo">${Object.entries(TIPOS).map(([k, r]) => `<option value="${k}" ${(i?.tipo || 'melhoria') === k ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        ${gerencia && !nova ? `<div class="field"><span class="label">Solicitante</span><div class="sf-quem"><b>${esc(i.minha ? 'Você' : (i.autor || 'Conta apagada'))}</b><span class="muted small">Enviada ${haQuanto(i.dt_criacao)}</span></div></div>` : ''}
      </div>
      <div class="field"><label for="sf-titulo">Sugestão *</label>
        <input class="input" id="sf-titulo" maxlength="150" required value="${esc(i?.titulo || '')}" placeholder="Ex.: Avisar no WhatsApp quando eu for escalado"></div>
      <div class="field"><label for="sf-detalhe">Detalhes</label>
        <textarea class="input" id="sf-detalhe" rows="4" maxlength="2000" placeholder="Conte como seria, em que tela, e por que ajudaria.">${esc(i?.detalhe || '')}</textarea></div>
      ${gerencia ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${nova ? '' : `<div class="field"><label for="sf-status">Status</label>
          <select class="input" id="sf-status">${Object.entries(STATUS_ADM).map(([k, r]) => `<option value="${k}" ${i.status === k ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`}
        <div class="field"><label for="sf-onde">Onde está</label><select class="input" id="sf-onde">${opcoesOnde}</select></div></div>` : ''}
      ${gerencia && !nova ? `<div class="field"><label for="sf-resp">Recado para quem sugeriu</label>
        <textarea class="input" id="sf-resp" rows="2" maxlength="500" placeholder="Ex.: Boa ideia! Deve sair na próxima versão.">${esc(i.resposta || '')}</textarea>
        <span class="hint">Opcional. Aparece na sugestão para a pessoa ver (ex.: por que foi recusada ou quando deve sair).</span></div>` : ''}
      ${nova && !gerencia ? '<p class="hint" style="margin:0">Quem cuida do site lê todas. Enquanto ninguém responder, você pode corrigir ou apagar a sua.</p>' : ''}
      ${nova && gerencia ? '<p class="hint" style="margin:0">Sua sugestão não precisa de análise: vai direto para o backlog (ou para a sprint escolhida).</p>' : ''}
      <div class="janela-acoes rodape-acoes">
        ${podeApagar ? `<button type="button" class="link-btn danger com-icone" id="sf-apagar">${icon('lixeira')}Apagar</button>` : '<span></span>'}
        <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">${nova ? 'Enviar' : 'Salvar'}</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      const st = j.querySelector('#sf-status'), onde = j.querySelector('#sf-onde');
      // Aguardando análise ou recusada não ficam em sprint
      const verOnde = () => { if (st && onde) { const fora = ['nova', 'recusada'].includes(st.value); onde.disabled = fora; if (fora) onde.value = ''; } };
      st?.addEventListener('change', verOnde); verOnde();
      if (nova && atual && onde) onde.value = '';
      j.querySelector('#sf-titulo').focus();
      j.querySelector('#sf').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = { tipo: j.querySelector('#sf-tipo').value, titulo: j.querySelector('#sf-titulo').value, detalhe: j.querySelector('#sf-detalhe').value };
        if (gerencia) {
          corpo.sprint_id = onde.value ? Number(onde.value) : null;
          if (!nova) Object.assign(corpo, { status: st.value, resposta: j.querySelector('#sf-resp').value });
        }
        await ocupado(e.submitter, async () => {
          try {
            await api(nova ? 'POST' : 'PUT', nova ? '/sugestoes' : `/sugestoes/${i.id}`, corpo);
            aviso(nova ? (gerencia ? (corpo.sprint_id ? 'Sugestão criada na sprint.' : 'Sugestão criada no backlog.') : 'Sugestão enviada. Obrigado!') : 'Sugestão salva.');
            if (corpo.sprint_id) abertas.add(corpo.sprint_id);
            fechar(); depois();
          } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#sf-apagar')?.addEventListener('click', async () => {
        if (!(await confirmar(`Apagar a sugestão "${i.titulo}"?`, { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/sugestoes/${i.id}`); aviso('Sugestão apagada.'); fechar(); depois(); } catch (err) { avisoErro(err); }
      });
    },
  });
}
