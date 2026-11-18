// Acompanhamento de pessoas: Pastoral (quem está faltando) e Integração (visitantes que chegaram)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, pode } from '../api.js';
import { esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, foto, tagTipo, fmtData, haQuanto, linkWhats, semAcento, estaNoHype, ultimaVez } from '../ui.js';
import { atualizarContadores, parametrosHash } from '../app.js';

const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído' };
const AREAS = {
  pastoral: {
    titulo: 'Pastoral', sub: 'Quem está faltando e quem está cuidando de cada um.',
    alertaTitulo: 'Sem acompanhamento', alertaSub: 'regulares e membros que vieram nas últimas 6 sextas e faltaram as 2 últimas ou mais',
    vazio: ['Todo mundo por perto', 'Ninguém com faltas seguidas sem acompanhamento.'],
    msg: (n) => `Oi, ${n}! Tudo bem? Aqui é do Hype. Sentimos sua falta nas últimas sextas. Está tudo certo por aí?`,
  },
  integracao: {
    titulo: 'Integração', sub: 'Acolher quem chegou: o ideal é falar com cada visitante em até 48 horas.',
    alertaTitulo: 'Esperando contato', alertaSub: 'visitantes dos últimos 60 dias sem contato registrado',
    vazio: ['Nenhum visitante esperando', 'Todo mundo que chegou já recebeu contato.'],
    msg: (n) => `Oi, ${n}! Aqui é do Hype. Que bom que você veio! Queria saber o que achou e te convidar para sexta de novo.`,
  },
};
const filtroStatus = { pastoral: 'ativos', integracao: 'ativos' };
// Ordenação por coluna: 1º clique crescente, 2º decrescente, 3º volta ao normal
const ordem = { pastoral: { col: null, dir: 1 }, integracao: { col: null, dir: 1 } };
const ORDEM_STATUS = { aberto: 0, em_andamento: 1, concluido: 2 };
const comparaTexto = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
const COLUNAS = {
  pessoa: (a, b) => comparaTexto(a.pessoa_nome, b.pessoa_nome),
  situacao: (a, b) => ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status],
  ultima: (a, b) => String(a.ultima_presenca || '').localeCompare(String(b.ultima_presenca || '')),
  responsavel: (a, b) => comparaTexto(a.responsavel_nome, b.responsavel_nome),
  motivo: (a, b) => comparaTexto(a.motivo, b.motivo),
  contatos: (a, b) => (a.contatos || 0) - (b.contatos || 0),
  ultimo_contato: (a, b) => String(a.ultimo_registro || '').localeCompare(String(b.ultimo_registro || '')),
  aberto: (a, b) => String(a.dt_abertura || '').localeCompare(String(b.dt_abertura || '')),
};
const th = (col, rotulo, classe = '') => `<th class="${classe}" data-ord="${col}"><button type="button" class="ord">${rotulo}<span class="seta" aria-hidden="true"></span></button></th>`;

export async function abrirAcompanhamento({ area = 'pastoral', pessoa, motivo = '', depois }) {
  const responsaveis = await api('GET', '/responsaveis').catch(() => []);
  janela({
    titulo: `${AREAS[area].titulo}: ${pessoa.nome}`,
    corpo: `<form id="fc" style="display:grid;gap:12px">
      <div class="field"><label for="resp">Quem vai cuidar *</label>
        <input class="input" id="resp" list="lista-resp" required placeholder="Nome de quem vai acompanhar">
        <datalist id="lista-resp">${responsaveis.map((r) => `<option value="${esc(r.nome)}">`).join('')}</datalist></div>
      <div class="field"><label for="mot">Motivo</label><input class="input" id="mot" value="${esc(motivo)}"></div>
      <div class="field"><label for="nota">Primeiro registro (opcional)</label><textarea class="input" id="nota" placeholder="Se já conversou, conte como foi"></textarea></div>
      <div class="janela-acoes" style="margin-top:4px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#resp').focus();
      j.querySelector('#fc').addEventListener('submit', async (e) => {
        e.preventDefault();
        await ocupado(e.submitter, async () => {
          try {
            await api('POST', `/${area}/casos`, { pessoa_id: pessoa.id, responsavel_nome: j.querySelector('#resp').value, motivo: j.querySelector('#mot').value, nota: j.querySelector('#nota').value });
            aviso('Acompanhamento aberto.'); fechar(); depois?.();
          } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

async function verCaso(area, id, depois) {
  const { caso: c, registros } = await api('GET', `/${area}/casos/${id}`);
  const whats = linkWhats(c.pessoa_telefone, AREAS[area].msg(c.pessoa_nome.split(' ')[0]));
  const podeEditar = pode(`${area}.editar`);
  janela({
    titulo: c.pessoa_nome,
    larga: true,
    corpo: `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">${tagTipo(c.pessoa_tipo)}
        <span class="muted small">aberto em ${fmtData(c.dt_abertura)} · responsável: <b style="color:var(--ink)">${esc(c.responsavel_nome)}</b></span>
        <span style="margin-left:auto;display:flex;gap:8px">${whats ? `<a class="btn sm" href="${whats}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<a class="btn sm" href="#/pessoas/${c.pessoa_id}">Ver ficha</a></span></div>
      ${c.pessoa_referencia ? `<p class="muted" style="margin-bottom:8px">${esc(c.pessoa_referencia)}</p>` : ''}
      ${c.motivo ? `<p style="margin-bottom:14px">Motivo: <b>${esc(c.motivo)}</b></p>` : ''}
      ${podeEditar ? `<div class="field" style="margin-bottom:16px"><span class="label">Situação</span>
        <div class="abas" id="st">${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-v="${k}" class="${c.status === k ? 'ativo' : ''}">${v}</button>`).join('')}</div></div>
      <form id="fr" style="display:grid;gap:8px">
        <label class="label" for="txt">Registrar contato</label>
        <textarea class="input" id="txt" placeholder="Mensagem, ligação, visita, oração... como foi?"></textarea>
        <div><button class="btn primary sm">Adicionar</button></div>
      </form>
      <hr>` : `<p style="margin-bottom:12px">Situação: <span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</p>`}
      <h3 style="margin-bottom:10px">Histórico <span class="muted small">(${registros.length} contato${registros.length === 1 ? '' : 's'})</span></h3>
      <div class="registros">${registros.length ? registros.map((r) => `<div><small>${fmtData(r.dt_criacao)} · ${esc(r.autor_nome || '')}</small>${esc(r.texto).replace(/\n/g, '<br>')}</div>`).join('') : '<p class="muted">Nenhum registro ainda.</p>'}</div>
      ${pode('pastoral.excluir') ? '<hr><button class="link-btn danger small" id="apagar">Apagar este acompanhamento</button>' : ''}`,
    aoAbrir: (j, fechar) => {
      j.querySelectorAll('#st button').forEach((b) => b.addEventListener('click', async () => {
        try {
          await api('PUT', `/${area}/casos/${id}`, { status: b.dataset.v });
          j.querySelectorAll('#st button').forEach((x) => x.classList.toggle('ativo', x === b));
          depois?.(); atualizarContadores();
        } catch (e) { avisoErro(e); }
      }));
      j.querySelector('#fr')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const texto = j.querySelector('#txt').value.trim(); if (!texto) return;
        await ocupado(e.submitter, async () => {
          try { await api('POST', `/${area}/casos/${id}/registros`, { texto }); fechar(); depois?.(); verCaso(area, id, depois); } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#apagar')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar('Apagar este acompanhamento e todos os registros?', { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/${area}/casos/${id}`); aviso('Acompanhamento apagado.'); depois?.(); atualizarContadores(); } catch (err) { avisoErro(err); }
      });
    },
  });
}

function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso.slice(0, 10) + 'T12:00:00').getTime()) / 86400000);
}

const LIMITE_ALERTAS = 8;
const alertasAbertos = { pastoral: false, integracao: false };
const filtroLista = { pastoral: { busca: '', freq: '' }, integracao: { busca: '', freq: '' } };

async function renderArea(conteudo, area) {
  const cfg = AREAS[area];
  const { alertas, casos } = await api('GET', `/${area}`);
  const recarregar = () => renderArea(conteudo, area);
  const casoUrl = parametrosHash().get('caso');
  const podeEditar = pode(`${area}.editar`), podeExcluir = pode('pastoral.excluir');
  const f = filtroLista[area];
  const selecionados = new Set();

  const linhaAlerta = (a) => {
    const n = a.pessoa.nome.split(' ')[0];
    const whats = linkWhats(a.pessoa.telefone, cfg.msg(n));
    let det, urgente = false;
    if (area === 'pastoral') det = `${a.faltas} faltas seguidas${a.ultimaPresenca ? ` · última vez em ${fmtData(a.ultimaPresenca)}` : ''}`;
    else {
      const d = diasDesde(a.primeiraVisita);
      urgente = d !== null && d <= 2;
      det = a.primeiraVisita ? `${d === 0 ? 'veio hoje' : d === 1 ? 'veio ontem' : `primeira vez há ${d} dias`} · ${a.visitas} ${a.visitas === 1 ? 'visita' : 'visitas'}` : 'cadastrado, ainda sem presença';
    }
    return `<div>${foto(a.pessoa.nome, urlFoto(a.pessoa.id, a.pessoa.foto_v))}
      <div class="cresce"><a href="#/pessoas/${a.pessoa.id}">${esc(a.pessoa.nome)}</a>${a.pessoa.referencia ? ` <span class="ref">${esc(a.pessoa.referencia)}</span>` : ''}
        <span>${urgente ? '<b class="urgente">48h</b> ' : ''}${det}</span></div>
      ${whats ? `<a class="btn sm icone" href="${whats}" target="_blank" rel="noopener" title="WhatsApp">${icon('whats')}</a>` : ''}
      ${podeEditar ? `<button class="btn sm primary" data-pessoa="${a.pessoa.id}">${area === 'pastoral' ? 'Designar' : 'Registrar contato'}</button>` : ''}</div>`;
  };

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>${cfg.titulo}</h1><p class="sub">${cfg.sub}</p></div></div>

    <section class="painel">
      <div class="painel-topo"><h2>${cfg.alertaTitulo} <span class="contador">${alertas.length}</span></h2><span class="sub">${cfg.alertaSub}</span></div>
      <div class="painel-corpo">
        ${alertas.length ? `<div class="lista">${(alertasAbertos[area] ? alertas : alertas.slice(0, LIMITE_ALERTAS)).map(linhaAlerta).join('')}</div>
          ${alertas.length > LIMITE_ALERTAS ? `<button class="btn sm" id="mais-alertas" style="margin-top:10px">${alertasAbertos[area] ? 'Mostrar menos' : `Mostrar os outros ${alertas.length - LIMITE_ALERTAS}`}</button>` : ''}`
        : `<div class="vazio" style="padding:18px 0"><b>${cfg.vazio[0]}</b>${cfg.vazio[1]}</div>`}
      </div>
    </section>

    <section class="painel mt">
      <div class="filtros" style="justify-content:space-between">
        <h2>Acompanhamentos</h2>
        <div class="abas"><button data-f="ativos" class="${filtroStatus[area] === 'ativos' ? 'ativo' : ''}">Em aberto (${casos.filter((c) => c.status !== 'concluido').length})</button>
          <button data-f="concluidos" class="${filtroStatus[area] === 'concluidos' ? 'ativo' : ''}">Concluídos (${casos.filter((c) => c.status === 'concluido').length})</button></div>
      </div>
      <div class="filtros">
        <input class="input busca" id="busca-caso" type="search" placeholder="Buscar pessoa ou responsável" value="${esc(f.busca)}">
        <select class="input" id="freq-caso">
          <option value="" ${f.freq === '' ? 'selected' : ''}>Todos</option>
          <option value="sim" ${f.freq === 'sim' ? 'selected' : ''}>Ainda vêm (últimos 3 meses)</option>
          <option value="nao" ${f.freq === 'nao' ? 'selected' : ''}>Afastados (3+ meses sem vir)</option>
        </select>
      </div>
      <div class="barra-massa hidden" id="massa">
        <b id="massa-n"></b>
        ${podeEditar && filtroStatus[area] === 'ativos' ? '<button class="btn sm" id="massa-concluir">Concluir</button>' : ''}
        ${podeExcluir ? `<button class="btn sm danger" id="massa-excluir">${icon('lixeira')} Excluir</button>` : ''}
        <button class="link-btn small" id="massa-limpar">Limpar seleção</button>
      </div>
      <div class="tabela-wrap rolagem"><table class="tabela tabela-larga${podeExcluir || podeEditar ? ' com-sel' : ''}">
        <thead><tr>
          ${podeExcluir || podeEditar ? '<th class="sel"><input type="checkbox" id="sel-todos" aria-label="Selecionar todos"></th>' : ''}
          ${th('pessoa', 'Pessoa', 'fixa')}${th('situacao', 'Situação')}${th('ultima', 'Última vez que veio')}${th('responsavel', 'Responsável')}${th('motivo', 'Motivo')}
          ${th('contatos', 'Contatos', 'dir')}${th('ultimo_contato', 'Último contato')}${th('aberto', 'Aberto em')}<th class="dir">Ações</th></tr></thead>
        <tbody id="casos"></tbody>
      </table></div>
      <div class="filtros" style="border-top:1px solid var(--line);border-bottom:0"><span class="muted small" id="total-casos"></span></div>
    </section>`;

  const visiveis = () => {
    const b = semAcento(f.busca);
    return casos.filter((c) => (filtroStatus[area] === 'ativos' ? c.status !== 'concluido' : c.status === 'concluido')
      && (!b || semAcento(`${c.pessoa_nome} ${c.pessoa_referencia || ''} ${c.responsavel_nome}`).includes(b))
      && (!f.freq || (estaNoHype({ ultima_presenca: c.ultima_presenca }) ? 'sim' : 'nao') === f.freq))
      .sort((a, b) => (o.col ? o.dir * COLUNAS[o.col](a, b) || comparaTexto(a.pessoa_nome, b.pessoa_nome) : 0));
  };
  const o = ordem[area];
  const temSel = podeExcluir || podeEditar;
  const pintar = () => {
    const l = visiveis();
    conteudo.querySelectorAll('th[data-ord]').forEach((h) => {
      const ativa = h.dataset.ord === o.col;
      h.classList.toggle('ordenada', ativa);
      h.setAttribute('aria-sort', ativa ? (o.dir === 1 ? 'ascending' : 'descending') : 'none');
      h.querySelector('.seta').textContent = ativa ? (o.dir === 1 ? '↓' : '↑') : '';
      h.querySelector('.ord').title = ativa ? (o.dir === 1 ? 'Ordem crescente. Clique para decrescente' : 'Ordem decrescente. Clique para tirar a ordenação') : 'Clique para ordenar';
    });
    for (const id of [...selecionados]) if (!l.some((c) => c.id === id)) selecionados.delete(id);
    $('#total-casos').textContent = `${l.length} acompanhamento${l.length === 1 ? '' : 's'}`;
    $('#casos').innerHTML = l.length ? l.map((c) => {
      const whats = linkWhats(c.pessoa_telefone, cfg.msg(c.pessoa_nome.split(' ')[0]));
      return `<tr class="clicavel ${selecionados.has(c.id) ? 'selecionada' : ''}" data-caso="${c.id}">
        ${temSel ? `<td class="sel"><input type="checkbox" data-sel="${c.id}" ${selecionados.has(c.id) ? 'checked' : ''} aria-label="Selecionar"></td>` : ''}
        <td class="fixa"><div class="pessoa-cel">${foto(c.pessoa_nome, urlFoto(c.pessoa_id, c.foto_v))}<div class="nome-ref"><b>${esc(c.pessoa_nome)}</b>${c.pessoa_referencia ? `<span>${esc(c.pessoa_referencia)}</span>` : ''}</div></div></td>
        <td style="white-space:nowrap"><span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</td>
        <td class="small" style="white-space:nowrap">${ultimaVez({ ultima_presenca: c.ultima_presenca })}</td>
        <td>${esc(c.responsavel_nome)}</td>
        <td class="muted small motivo">${esc(c.motivo || '')}</td>
        <td class="dir num">${c.contatos}</td>
        <td class="muted small" style="white-space:nowrap">${c.ultimo_registro ? haQuanto(c.ultimo_registro) : '—'}</td>
        <td class="muted small" style="white-space:nowrap">${fmtData(c.dt_abertura)}</td>
        <td class="dir acoes-linha">${whats ? `<a class="btn sm icone" href="${whats}" target="_blank" rel="noopener" title="WhatsApp" data-nao-abrir>${icon('whats')}</a>` : ''}${podeExcluir ? `<button class="btn sm icone danger" data-excluir="${c.id}" title="Excluir">${icon('lixeira')}</button>` : ''}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="10" class="vazio">Nada por aqui.</td></tr>`;
    const n = selecionados.size;
    $('#massa').classList.toggle('hidden', n === 0);
    $('#massa-n').textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
    const todos = $('#sel-todos'); if (todos) { todos.checked = n > 0 && n === l.length; todos.indeterminate = n > 0 && n < l.length; }
  };
  pintar();

  const excluir = async (ids) => {
    const nomes = casos.filter((c) => ids.includes(c.id)).map((c) => c.pessoa_nome);
    const msg = ids.length === 1 ? `Excluir o acompanhamento de ${nomes[0]}? O histórico de contatos dele também é apagado.` : `Excluir ${ids.length} acompanhamentos? O histórico de contatos deles também é apagado.`;
    if (!(await confirmar(msg, { botao: 'Excluir', perigo: true }))) return;
    try { await api('POST', `/${area}/casos/excluir`, { ids }); aviso(ids.length === 1 ? 'Acompanhamento excluído.' : `${ids.length} acompanhamentos excluídos.`); atualizarContadores(); recarregar(); } catch (e) { avisoErro(e); }
  };

  $('#casos').addEventListener('click', (e) => {
    const sel = e.target.closest('[data-sel]');
    if (sel) { const id = Number(sel.dataset.sel); if (sel.checked) selecionados.add(id); else selecionados.delete(id); pintar(); return; }
    if (e.target.closest('.sel') || e.target.closest('[data-nao-abrir]')) return;
    const ex = e.target.closest('[data-excluir]');
    if (ex) { excluir([Number(ex.dataset.excluir)]); return; }
    const tr = e.target.closest('tr[data-caso]');
    if (tr) verCaso(area, Number(tr.dataset.caso), recarregar).catch(avisoErro);
  });
  $('#sel-todos')?.addEventListener('change', (e) => { visiveis().forEach((c) => (e.target.checked ? selecionados.add(c.id) : selecionados.delete(c.id))); pintar(); });
  $('#massa-limpar').addEventListener('click', () => { selecionados.clear(); pintar(); });
  $('#massa-excluir')?.addEventListener('click', () => excluir([...selecionados]));
  $('#massa-concluir')?.addEventListener('click', async () => {
    const ids = [...selecionados];
    if (!(await confirmar(`Marcar ${ids.length} acompanhamento${ids.length === 1 ? '' : 's'} como concluído${ids.length === 1 ? '' : 's'}?`, { botao: 'Concluir' }))) return;
    try { await api('POST', `/${area}/casos/concluir`, { ids }); aviso('Concluídos.'); atualizarContadores(); recarregar(); } catch (err) { avisoErro(err); }
  });
  conteudo.querySelectorAll('th[data-ord]').forEach((h) => h.querySelector('.ord').addEventListener('click', () => {
    const col = h.dataset.ord;
    if (o.col !== col) { o.col = col; o.dir = 1; } else if (o.dir === 1) o.dir = -1; else o.col = null;
    pintar();
  }));
  $('#busca-caso').addEventListener('input', (e) => { f.busca = e.target.value; pintar(); });
  $('#freq-caso').addEventListener('change', (e) => { f.freq = e.target.value; pintar(); });

  conteudo.querySelectorAll('[data-pessoa]').forEach((b) => b.addEventListener('click', () => {
    const a = alertas.find((x) => String(x.pessoa.id) === b.dataset.pessoa);
    abrirAcompanhamento({ area, pessoa: a.pessoa, motivo: area === 'pastoral' ? `${a.faltas} faltas seguidas` : 'Boas-vindas ao visitante', depois: () => { atualizarContadores(); recarregar(); } });
  }));
  conteudo.querySelector('#mais-alertas')?.addEventListener('click', () => { alertasAbertos[area] = !alertasAbertos[area]; recarregar(); });
  conteudo.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filtroStatus[area] = b.dataset.f; recarregar(); }));
  if (casoUrl) { history.replaceState(null, '', location.pathname + `#/${area}`); verCaso(area, Number(casoUrl), recarregar).catch(avisoErro); }
}

export const render = (conteudo) => renderArea(conteudo, 'pastoral');
export const renderIntegracao = (conteudo) => renderArea(conteudo, 'integracao');
