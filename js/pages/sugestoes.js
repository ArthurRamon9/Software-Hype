// Sugestões: qualquer pessoa com acesso manda ideias e melhorias para o site.
// Quem cuida do site (sugestoes.gerenciar) aceita (vai para o backlog) ou recusa. O trabalho anda em sprints
// de 15 dias: puxa do backlog, a fazer -> fazendo -> feita; ao fechar a sprint (na segunda em que publica),
// a nota vira as Novidades, que todo mundo vê.
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api } from '../api.js';
import { esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, haQuanto, semAcento, fmtDiaMes, fmtData, parseISO, isoLocal } from '../ui.js';
import { baixarXLSX } from '../xlsx.js';
import { atualizarContadores, parametrosHash, marcarNovidadeVista } from '../app.js';

const TIPOS = { melhoria: 'Melhoria', ideia: 'Ideia nova', problema: 'Algo com erro' };
const STATUS = { nova: 'Aguardando resposta', aceita: 'A fazer', fazendo: 'Fazendo', feita: 'Feita', recusada: 'Recusada' };
const CLASSE = { nova: '', aceita: 'warn', fazendo: 'warn', feita: 'ok', recusada: 'bad' };
const DIA = 86400000;
const maisDias = (iso, n) => isoLocal(new Date(parseISO(iso).getTime() + n * DIA + 2 * 3600000));

let aba = null;
let busca = '';
let soMinhas = false;

// Em que aba cada sugestão aparece
function abaDe(i, aberta) {
  if (i.status === 'nova' || i.status === 'recusada') return i.status;
  if (aberta && i.sprint_id === aberta.id) return 'sprint';
  if (i.status === 'feita') return i.sprint_id ? 'novidades' : 'sprint';   // pronta fora de sprint: entra na próxima nota
  return 'backlog';
}

export async function render(conteudo) {
  const { itens, gerencia, sprints, hoje } = await api('GET', '/sugestoes');
  // Depois de mexer: redesenha e atualiza o número de novas no menu
  const recarregar = () => { if (gerencia) atualizarContadores(); return render(conteudo).catch(avisoErro); };
  const aberta = sprints.find((x) => x.status === 'aberta') || null;
  const fechadas = sprints.filter((x) => x.status === 'fechada');
  itens.forEach((i) => { i.aba = abaDe(i, aberta); });
  const conta = (a) => itens.filter((i) => i.aba === a).length;
  const ver = parametrosHash().get('ver');
  if (ver === 'novidades') aba = 'novidades';
  // Abre onde faz sentido: quem gerencia nas novas; os outros na sprint em andamento (ou nas Novidades)
  if (!aba) aba = (gerencia && conta('nova') ? 'nova' : null) || (aberta || conta('sprint') ? 'sprint' : null) || (fechadas.length ? 'novidades' : 'nova');
  const ABAS = [['nova', 'Novas', conta('nova')], ...(gerencia
    ? [['backlog', 'Backlog', conta('backlog')], ['sprint', 'Sprint', conta('sprint')]]
    : [['sprint', 'Em andamento', conta('sprint')], ['backlog', 'Na fila', conta('backlog')]]),
  ['novidades', 'Novidades', null], ...(conta('recusada') ? [['recusada', 'Recusadas', conta('recusada')]] : [])];
  if (!ABAS.some(([k]) => k === aba)) aba = 'nova';

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Sugestões</h1><p class="sub">${gerencia
      ? 'Aceite o que faz sentido (vai para o backlog), puxe para a sprint de 15 dias e, ao publicar, feche a sprint: a nota vira as Novidades.'
      : 'Tem uma ideia ou viu algo que pode melhorar no site? Mande aqui. Nem tudo entra, mas tudo é lido, e a resposta aparece na própria sugestão.'}</p></div>
      <div class="acoes">
        ${gerencia ? '<button class="btn" id="sug-planilha">Baixar planilha</button>' : ''}
        <button class="btn primary" id="sug-nova">${icon('plus')} Nova sugestão</button>
      </div></div>
    <section class="painel">
      <div class="filtros" style="justify-content:space-between">
        <div class="abas" id="sug-abas">${ABAS.map(([k, r, n]) => `<button data-a="${k}" class="${aba === k ? 'ativo' : ''}">${r}${n !== null ? `<span class="sug-n">${n}</span>` : ''}</button>`).join('')}</div>
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
  const pintar = () => {
    $('#sug-filtros').hidden = aba === 'novidades';
    if (aba === 'novidades') return pintarNovidades();
    if (aba === 'sprint') return pintarSprint();
    const l = filtrar(itens.filter((i) => i.aba === aba));
    if (aba === 'backlog') l.sort((x, y) => String(x.dt_status || '').localeCompare(String(y.dt_status || '')));
    const vazio = {
      nova: gerencia ? '<b>Nenhuma sugestão esperando resposta</b>Quando alguém mandar uma, ela aparece aqui e no número do menu.' : '<b>Nenhuma sugestão nova</b>Use "Nova sugestão" para mandar a sua.',
      backlog: gerencia ? '<b>Backlog vazio</b>O que você aceitar em "Novas" fica aqui até entrar numa sprint.' : '<b>Nada na fila</b>As sugestões aceitas esperam aqui até entrar numa sprint.',
      recusada: '<b>Nenhuma sugestão recusada</b>',
    };
    $('#sug-lista').innerHTML = l.length ? l.map((i) => cartao(i, gerencia, aberta)).join('')
      : `<div class="vazio">${itens.some((i) => i.aba === aba) ? 'Nada com esse filtro.' : vazio[aba]}</div>`;
  };

  // ---- Sprint em andamento
  const pintarSprint = () => {
    const dela = filtrar(itens.filter((i) => i.aba === 'sprint'));
    const todas = itens.filter((i) => i.aba === 'sprint');
    const prontas = todas.filter((i) => i.status === 'feita').length;
    let topo;
    if (aberta) {
      const faltam = Math.round((parseISO(aberta.fim) - parseISO(hoje)) / DIA);
      const quando = faltam > 1 ? `faltam ${faltam} dias` : faltam === 1 ? 'termina amanhã' : faltam === 0 ? 'termina hoje'
        : `<b class="atrasada">terminou em ${fmtDiaMes(aberta.fim)}${gerencia ? ': feche ao publicar' : ''}</b>`;
      topo = `<div class="sprint-topo"><div style="flex:1;min-width:220px">
          <h2>Sprint ${aberta.numero}${aberta.titulo ? `<small>${esc(aberta.titulo)}</small>` : ''}</h2>
          <div class="datas">${fmtDiaMes(aberta.inicio)} a ${fmtDiaMes(aberta.fim)} · ${quando}</div>
          ${todas.length ? `<div class="datas">${prontas} de ${todas.length} pronta${todas.length === 1 ? '' : 's'}</div><div class="sprint-barra"><i style="width:${Math.round(prontas / todas.length * 100)}%"></i></div>` : ''}
        </div>
        ${gerencia ? `<div class="acoes" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn sm" id="sp-puxar" ${conta('backlog') ? '' : 'disabled title="O backlog está vazio"'}>Puxar do backlog</button>
          <button class="btn sm" id="sp-editar">Editar</button>
          <button class="btn sm ${faltam <= 0 ? 'primary' : ''}" id="sp-fechar">Fechar sprint</button></div>` : ''}</div>`;
    } else {
      topo = `<div class="sprint-topo"><div><h2>Nenhuma sprint em andamento</h2>
        <div class="datas">${gerencia ? 'Abra uma sprint de 15 dias e puxe do backlog o que vai ser feito nela.' : 'Quando começar a próxima, o que vai ser feito aparece aqui.'}</div></div>
        ${gerencia ? '<button class="btn sm primary" id="sp-abrir">Abrir sprint</button>' : ''}</div>`;
    }
    const grupo = (st, rot) => {
      const l = dela.filter((i) => i.status === st);
      return l.length ? `<div class="sprint-grupo">${rot} · ${l.length}</div>${l.map((i) => cartao(i, gerencia, aberta)).join('')}` : '';
    };
    const corpo = grupo('fazendo', 'Fazendo') + grupo('aceita', 'A fazer') + grupo('feita', aberta ? 'Pronto' : 'Pronto (entra na próxima nota)');
    $('#sug-lista').innerHTML = topo + (corpo || `<div class="vazio">${todas.length ? 'Nada com esse filtro.'
      : aberta ? (gerencia ? '<b>Sprint vazia</b>Use "Puxar do backlog" para escolher o que vai ser feito.' : '<b>Ainda nada nesta sprint</b>') : ''}</div>`);
    $('#sp-abrir')?.addEventListener('click', () => abrirSprint(hoje, recarregar));
    $('#sp-editar')?.addEventListener('click', () => editarSprint(aberta, recarregar));
    $('#sp-puxar')?.addEventListener('click', () => puxar(aberta, itens.filter((i) => i.aba === 'backlog'), recarregar));
    $('#sp-fechar')?.addEventListener('click', () => fecharSprint(aberta, todas, hoje, recarregar));
  };

  // ---- Novidades: a nota de cada sprint fechada
  const pintarNovidades = () => {
    if (fechadas[0]) marcarNovidadeVista(fechadas[0].id);
    $('#sug-lista').innerHTML = fechadas.length ? `<div class="novidades">${fechadas.map((sp) => {
      const ideias = itens.filter((i) => i.sprint_id === sp.id && i.status === 'feita');
      return `<article class="novidade">
        <div class="novidade-cab"><h3>${sp.titulo ? esc(sp.titulo) : `Sprint ${sp.numero}`}${sp.titulo ? `<small>Sprint ${sp.numero}</small>` : ''}</h3>
          <span class="quando">${sp.dt_fechada ? `Publicada em ${fmtData(String(sp.dt_fechada).slice(0, 10))}` : ''}${gerencia ? ` · <button class="link-btn small" data-nota="${sp.id}">Corrigir a nota</button>` : ''}</span></div>
        ${notaHtml(sp.notas)}
        ${ideias.length ? `<div class="ideias"><b>Ideias de vocês nesta versão</b><ul>${ideias.map((i) => `<li>${esc(i.titulo)} <span>· ${i.minha ? 'você' : esc(i.autor || 'conta apagada')}</span></li>`).join('')}</ul></div>` : ''}
      </article>`;
    }).join('')}</div>` : '<div class="vazio"><b>Nenhuma novidade ainda</b>Quando uma sprint for fechada, o que mudou no site aparece aqui.</div>';
    conteudo.querySelectorAll('[data-nota]').forEach((b) => b.addEventListener('click', () => editarSprint(fechadas.find((x) => x.id === Number(b.dataset.nota)), recarregar)));
  };
  pintar();

  conteudo.querySelectorAll('#sug-abas [data-a]').forEach((b) => b.addEventListener('click', () => {
    aba = b.dataset.a;
    conteudo.querySelectorAll('#sug-abas [data-a]').forEach((x) => x.classList.toggle('ativo', x === b));
    if (ver && aba !== 'novidades') history.replaceState(null, '', '#/sugestoes');
    pintar();
  }));
  $('#sug-busca').addEventListener('input', (e) => { busca = e.target.value; pintar(); });
  $('#sug-minhas').addEventListener('change', (e) => { soMinhas = e.target.checked; pintar(); });
  $('#sug-nova').addEventListener('click', () => editar(null, gerencia, recarregar));
  $('#sug-planilha')?.addEventListener('click', () => baixarXLSX('sugestoes-hype', [
    { nome: 'Sugestões', linhas: [['Sugestão', 'Detalhes', 'Tipo', 'Situação', 'Sprint', 'Quem sugeriu', 'Enviada em', 'Resposta'],
      ...itens.map((i) => [i.titulo, i.detalhe || '', TIPOS[i.tipo], STATUS[i.status], i.sprint_id ? (sprints.find((x) => x.id === i.sprint_id)?.numero ?? '') : '',
        i.autor || '', String(i.dt_criacao).slice(0, 10), i.resposta || ''])] },
  ]));

  $('#sug-lista').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-id]'); if (!card) return;
    const i = itens.find((x) => x.id === Number(card.dataset.id));
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (!acao) { if (gerencia || (i.minha && i.status === 'nova')) editar(i, gerencia, recarregar); return; }
    if (acao === 'recusar') return recusar(i, recarregar);
    const btn = e.target.closest('[data-acao]');
    const corpo = { naSprint: { sprint_id: aberta?.id }, tirar: { sprint_id: null, status: 'aceita' } }[acao] || { status: acao };
    const msg = { aceita: 'Foi para o backlog.', fazendo: 'Marcada como "Fazendo".', feita: 'Pronta. Entra na nota quando a sprint fechar.', nova: 'Voltou para as novas.',
      naSprint: `Entrou na Sprint ${aberta?.numero}.`, tirar: 'Voltou para o backlog.' };
    await ocupado(btn, async () => {
      try { await api('PUT', `/sugestoes/${i.id}`, corpo); aviso(msg[acao] || 'Pronto.'); recarregar(); } catch (err) { avisoErro(err); }
    });
  });
}

// A nota: cada linha que começa com "-" vira um item da lista; as outras, parágrafo
function notaHtml(notas) {
  const linhas = String(notas || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) return '';
  let html = '', lista = [];
  const fecha = () => { if (lista.length) html += `<ul>${lista.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`; lista = []; };
  linhas.forEach((l) => { const m = l.match(/^[-•*]\s*(.+)/); if (m) lista.push(m[1]); else { fecha(); html += `<p>${esc(l)}</p>`; } });
  fecha();
  return html;
}

function cartao(i, gerencia, aberta) {
  const naSprint = aberta && i.sprint_id === aberta.id;
  const botoes = !gerencia ? '' : {
    nova: `<button class="btn sm primary" data-acao="aceita">${icon('check')} Aceitar</button><button class="btn sm" data-acao="recusar">Recusar</button>`,
    aceita: naSprint ? '<button class="btn sm" data-acao="fazendo">Começar</button><button class="btn sm" data-acao="tirar" title="Volta para o backlog">Tirar</button>'
      : aberta ? `<button class="btn sm" data-acao="naSprint">Pôr na sprint</button>` : '',
    fazendo: naSprint ? `<button class="btn sm primary" data-acao="feita">${icon('check')} Pronta</button>` : aberta ? '<button class="btn sm" data-acao="naSprint">Pôr na sprint</button>' : '',
    feita: '',
    recusada: '<button class="btn sm" data-acao="nova">Reabrir</button>',
  }[i.status];
  const clicavel = gerencia || (i.minha && i.status === 'nova');
  return `<article class="sug ${clicavel ? 'clicavel' : ''}" data-id="${i.id}">
    <div class="sug-corpo">
      <div class="sug-topo"><b>${esc(i.titulo)}</b></div>
      ${i.detalhe ? `<p class="sug-detalhe">${esc(i.detalhe)}</p>` : ''}
      <div class="sug-pe"><span class="tag sug-tipo t-${i.tipo}">${TIPOS[i.tipo]}</span>
        <span class="tag ${CLASSE[i.status]}">${STATUS[i.status]}</span>
        <span class="muted small">${i.minha ? 'Você' : esc(i.autor || 'Conta apagada')} · ${haQuanto(i.dt_criacao)}</span></div>
      ${i.resposta ? `<div class="sug-resposta"><b>Resposta</b>${esc(i.resposta)}</div>` : ''}
    </div>
    ${botoes ? `<div class="sug-acoes">${botoes}</div>` : ''}
  </article>`;
}

// ---------- Sprints ----------
const camposDatas = (inicio, fim, pref = 'sp') => `<div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
  <div class="field"><label for="${pref}-ini">Começa</label><input class="input" type="date" id="${pref}-ini" required value="${inicio}"></div>
  <div class="field"><label for="${pref}-fim">Termina</label><input class="input" type="date" id="${pref}-fim" required value="${fim}"></div></div>`;
// Fim padrão: 13 dias depois do começo (segunda a domingo da outra semana; publica na segunda seguinte)
const fimPadrao = (ini) => maisDias(ini, 13);
function ligarDatas(j, pref = 'sp') {
  const ini = j.querySelector(`#${pref}-ini`), fim = j.querySelector(`#${pref}-fim`);
  ini?.addEventListener('change', () => { if (ini.value) { fim.value = fimPadrao(ini.value); fim.dispatchEvent(new Event('change')); } });
}

function abrirSprint(hoje, depois) {
  janela({
    titulo: 'Abrir sprint',
    corpo: `<form id="spf" style="display:grid;gap:14px">
      ${camposDatas(hoje, fimPadrao(hoje))}
      <div class="field"><label for="sp-tit">Nome da versão</label><input class="input" id="sp-tit" maxlength="80" placeholder="Opcional. Ex.: Versão 11"></div>
      <p class="hint">O combinado: 15 dias, começando numa segunda. Na segunda em que publicar, feche a sprint e abra a próxima.</p>
      <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Abrir sprint</button></div></form>`,
    aoAbrir: (j, fechar) => {
      ligarDatas(j);
      j.querySelector('#spf').addEventListener('submit', async (e) => {
        e.preventDefault();
        await ocupado(e.submitter, async () => {
          try {
            const r = await api('POST', '/sprints', { inicio: j.querySelector('#sp-ini').value, fim: j.querySelector('#sp-fim').value, titulo: j.querySelector('#sp-tit').value });
            aviso(`Sprint ${r.numero} aberta.`); aba = 'sprint'; fechar(); depois();
          } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

// Editar a sprint aberta (datas, nome e rascunho da nota) ou corrigir a nota de uma fechada
function editarSprint(sp, depois) {
  const aberta = sp.status === 'aberta';
  janela({
    titulo: aberta ? `Sprint ${sp.numero}` : `Corrigir a nota da Sprint ${sp.numero}`,
    larga: true,
    corpo: `<form id="spe" style="display:grid;gap:14px">
      ${aberta ? camposDatas(sp.inicio, sp.fim) : ''}
      <div class="field"><label for="sp-tit">Nome da versão</label><input class="input" id="sp-tit" maxlength="80" value="${esc(sp.titulo || '')}" placeholder="Opcional. Ex.: Versão 11"></div>
      <div class="field"><label for="sp-notas">${aberta ? 'Rascunho da nota (Novidades)' : 'Nota (Novidades)'}</label>
        <textarea class="input" id="sp-notas" rows="9" maxlength="4000" placeholder="- Uma novidade por linha, começando com tracinho">${esc(sp.notas || '')}</textarea>
        <span class="hint">${aberta ? 'Só você vê enquanto a sprint está aberta. Aparece para todos quando fechar.' : 'Todo mundo vê esta nota em Novidades.'}</span></div>
      <div class="janela-acoes rodape-acoes">
        ${aberta ? `<button type="button" class="link-btn danger com-icone" id="sp-apagar">${icon('lixeira')}Apagar sprint</button>` : '<span></span>'}
        <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#spe').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = { titulo: j.querySelector('#sp-tit').value, notas: j.querySelector('#sp-notas').value };
        if (aberta) Object.assign(corpo, { inicio: j.querySelector('#sp-ini').value, fim: j.querySelector('#sp-fim').value });
        await ocupado(e.submitter, async () => {
          try { await api('PUT', `/sprints/${sp.id}`, corpo); aviso('Sprint salva.'); fechar(); depois(); } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#sp-apagar')?.addEventListener('click', async () => {
        if (!(await confirmar(`Apagar a Sprint ${sp.numero}? O que estava nela volta para o backlog.`, { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/sprints/${sp.id}`); aviso('Sprint apagada.'); fechar(); depois(); } catch (err) { avisoErro(err); }
      });
    },
  });
}

function puxar(sp, backlog, depois) {
  janela({
    titulo: `Puxar para a Sprint ${sp.numero}`,
    corpo: `<form id="spp" style="display:grid;gap:14px">
      <p class="hint" style="margin:0">Escolha o que vai ser feito nesta sprint.</p>
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
          try { await api('POST', `/sprints/${sp.id}/puxar`, { ids }); aviso(`${ids.length} na Sprint ${sp.numero}.`); fechar(); depois(); } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

// Fechar: a nota (já sugerida a partir do que ficou pronto), o que fazer com o que não ficou e a próxima sprint
function fecharSprint(sp, daSprint, hoje, depois) {
  const prontas = daSprint.filter((i) => i.status === 'feita');
  const pendentes = daSprint.filter((i) => i.status !== 'feita');
  // As sugestões prontas já aparecem embaixo da nota (com o nome de quem sugeriu): a nota fica para o resto
  const sugerida = sp.notas || '';
  const proxIni = hoje > sp.fim ? hoje : maisDias(sp.fim, 1);
  janela({
    titulo: `Fechar a Sprint ${sp.numero}`,
    larga: true,
    corpo: `<form id="spc" style="display:grid;gap:14px">
      <p class="hint" style="margin:0">Feche na segunda em que publicar: a nota aparece em Novidades para todo mundo, e o Início avisa quem ainda não viu.</p>
      <div class="field"><label for="sp-tit">Nome da versão</label><input class="input" id="sp-tit" maxlength="80" value="${esc(sp.titulo || '')}" placeholder="Opcional. Ex.: Versão 11"></div>
      <div class="field"><label for="sp-notas">O que mudou (Novidades)</label>
        <textarea class="input" id="sp-notas" rows="10" maxlength="4000" placeholder="- Uma novidade por linha, começando com tracinho">${esc(sugerida)}</textarea>
        <span class="hint">Uma novidade por linha, começando com tracinho. Escreva para quem usa o site. ${prontas.length ? `As ${prontas.length} sugestões prontas aparecem embaixo da nota com o nome de quem sugeriu.` : ''}</span></div>
      ${pendentes.length ? `<div class="field"><span class="label">${pendentes.length} não ficaram prontas</span>
        <label class="check"><input type="radio" name="pend" value="proxima" checked> Passar para a próxima sprint</label>
        <label class="check"><input type="radio" name="pend" value="backlog"> Voltar para o backlog</label></div>` : ''}
      <label class="check"><input type="checkbox" id="sp-abrir" checked> Já abrir a próxima sprint</label>
      <div id="sp-prox">${camposDatas(proxIni, fimPadrao(proxIni), 'px')}</div>
      <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Fechar e publicar a nota</button></div></form>`,
    aoAbrir: (j, fechar) => {
      ligarDatas(j, 'px');
      const abrir = j.querySelector('#sp-abrir');
      abrir.addEventListener('change', () => { j.querySelector('#sp-prox').hidden = !abrir.checked; });
      j.querySelector('#spc').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = { titulo: j.querySelector('#sp-tit').value, notas: j.querySelector('#sp-notas').value,
          pendentes: j.querySelector('input[name=pend]:checked')?.value || 'proxima',
          proxima: abrir.checked ? { inicio: j.querySelector('#px-ini').value, fim: j.querySelector('#px-fim').value } : null };
        await ocupado(e.submitter, async () => {
          try {
            await api('POST', `/sprints/${sp.id}/fechar`, corpo);
            aviso(`Sprint ${sp.numero} fechada. A nota já está em Novidades.`); aba = 'novidades'; fechar(); atualizarContadores(); depois();
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

// ---------- Nova / corrigir sugestão ----------
// Quem gerencia também escolhe a situação e escreve a resposta
function editar(i, gerencia, depois) {
  const nova = !i;
  const podeApagar = !nova && (gerencia || (i.minha && i.status === 'nova'));
  janela({
    titulo: nova ? 'Nova sugestão' : 'Sugestão',
    corpo: `<form id="sf" style="display:grid;gap:14px">
      <div class="field"><span class="label">É sobre</span>
        <div class="abas" id="sf-tipo">${Object.entries(TIPOS).map(([k, r]) => `<button type="button" data-t="${k}" class="${(i?.tipo || 'melhoria') === k ? 'ativo' : ''}">${r}</button>`).join('')}</div></div>
      <div class="field"><label for="sf-titulo">Sugestão *</label>
        <input class="input" id="sf-titulo" maxlength="150" required value="${esc(i?.titulo || '')}" placeholder="Ex.: Avisar no WhatsApp quando eu for escalado"></div>
      <div class="field"><label for="sf-detalhe">Detalhes</label>
        <textarea class="input" id="sf-detalhe" rows="4" maxlength="2000" placeholder="Conte como seria, em que tela, e por que ajudaria.">${esc(i?.detalhe || '')}</textarea></div>
      ${gerencia && !nova ? `
      <div class="field"><label for="sf-status">Situação</label>
        <select class="input" id="sf-status">${Object.entries(STATUS).map(([k, r]) => `<option value="${k}" ${i.status === k ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="field"><label for="sf-resp">Resposta para quem sugeriu</label>
        <textarea class="input" id="sf-resp" rows="2" maxlength="500" placeholder="Aparece na sugestão. Ex.: Vai na próxima atualização.">${esc(i.resposta || '')}</textarea></div>
      <p class="hint">Sugerida por ${esc(i.minha ? 'você' : (i.autor || 'conta apagada'))} ${haQuanto(i.dt_criacao)}.</p>` : ''}
      ${nova && !gerencia ? '<p class="hint">Quem cuida do site lê todas. Enquanto ninguém responder, você pode corrigir ou apagar a sua.</p>' : ''}
      <div class="janela-acoes rodape-acoes">
        ${podeApagar ? `<button type="button" class="link-btn danger com-icone" id="sf-apagar">${icon('lixeira')}Apagar</button>` : '<span></span>'}
        <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">${nova ? 'Enviar' : 'Salvar'}</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      let tipo = i?.tipo || 'melhoria';
      j.querySelector('#sf-tipo').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]'); if (!b) return;
        tipo = b.dataset.t; j.alterou = true;
        j.querySelectorAll('#sf-tipo [data-t]').forEach((x) => x.classList.toggle('ativo', x === b));
      });
      j.querySelector('#sf-titulo').focus();
      j.querySelector('#sf').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = { tipo, titulo: j.querySelector('#sf-titulo').value, detalhe: j.querySelector('#sf-detalhe').value };
        if (gerencia && !nova) Object.assign(corpo, { status: j.querySelector('#sf-status').value, resposta: j.querySelector('#sf-resp').value });
        await ocupado(e.submitter, async () => {
          try {
            await api(nova ? 'POST' : 'PUT', nova ? '/sugestoes' : `/sugestoes/${i.id}`, corpo);
            aviso(nova ? 'Sugestão enviada. Obrigado!' : 'Sugestão salva.');
            if (nova) aba = 'nova';
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
