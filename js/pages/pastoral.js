// Acompanhamento de pessoas: Pastoral (quem está faltando) e Integração (visitantes que chegaram)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, pode, sessao } from '../api.js';
import {
  esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, foto, tagTipo, fmtData, haQuanto, linkWhats, semAcento,
  estaNoHype, ultimaVez, filtrarPorNome, sextasDesde, fmtTel, maiuscula,
} from '../ui.js';
import { atualizarContadores, parametrosHash } from '../app.js';

const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído' };
const AREAS = {
  pastoral: {
    titulo: 'Pastoral', ministerio: 'Pastoral', sub: 'Quem está faltando e quem está cuidando de cada um.', subMeus: 'Os acompanhamentos que estão com você.',
    alertaTitulo: 'Sem acompanhamento', alertaSub: 'Membros e visitantes com 2 faltas seguidas (líderes de equipe: 3), até 5 semanas sem vir',
    vazio: ['Todo mundo por perto', 'Ninguém com faltas seguidas sem acompanhamento.'],
    msg: (n) => `Oi, ${n}! Tudo bem? Aqui é do Hype. Sentimos sua falta nas últimas sextas. Está tudo certo por aí?`,
  },
  integracao: {
    titulo: 'Integração', ministerio: 'Integração', sub: 'Acolher quem chegou: o ideal é falar com cada visitante em até 48 horas.', subMeus: 'Os visitantes que estão com você.',
    alertaTitulo: 'Esperando contato', alertaSub: 'Visitantes dos últimos 60 dias sem contato registrado',
    vazio: ['Nenhum visitante esperando', 'Todo mundo que chegou já recebeu contato.'],
    msg: (n) => `Oi, ${n}! Aqui é do Hype. Que bom que você veio! Queria saber o que achou e te convidar para sexta de novo.`,
  },
};
const ROTULO_RESP = { pastoral: 'Responsável', integracao: 'Quem integra' };

// Quem distribui: permissão "<area>.designar" ou ser líder do ministério da área (a API confere de novo)
const chave = (t) => semAcento(t).trim();
export const distribui = (area) => pode(`${area}.designar`)
  || (sessao.usuario?.ministerios || []).some((m) => m.lider && chave(m.nome) === area);

// ---------- Mensagem para o responsável ----------
// "Não vem há": em Hypes (sextas que faltou) até 2 meses; depois em meses
function naoVemHa(iso) {
  const n = sextasDesde(iso);
  if (n === null) return 'Ainda não veio a nenhum Hype';
  if (n <= 1) return 'Veio no último Hype';
  if (n <= 9) return `${n - 1} Hype${n - 1 === 1 ? '' : 's'}`;
  const meses = Math.floor((Date.now() - new Date(String(iso).slice(0, 10) + 'T12:00:00').getTime()) / (30 * 86400000));
  return meses >= 12 ? 'Mais de um ano' : `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}
const instagram = (t) => (t ? `@${String(t).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}` : '');
const bloco = (c) => [
  `Nome: ${c.pessoa_nome}`,
  c.pessoa_telefone ? `Telefone: ${fmtTel(c.pessoa_telefone)}` : null,
  c.pessoa_instagram ? `Instagram: ${instagram(c.pessoa_instagram)}` : null,
  `Não vem há: ${naoVemHa(c.ultima_presenca)}`,
].filter(Boolean).join('\n');
function mensagemResponsavel(casos) {
  const primeiro = casos[0].responsavel_nome.split(' ')[0];
  const intro = casos.length === 1 ? 'temos uma pessoa precisando da sua atenção:' : `temos ${casos.length} pessoas precisando da sua atenção:`;
  return `Olá, ${primeiro}! ${intro.charAt(0).toUpperCase() + intro.slice(1)}\n\n${casos.map(bloco).join('\n\n')}\n\nConto contigo para isso!`;
}
// Por que não dá para enviar (ou null se dá)
function motivoNaoEnviar(casos) {
  if (!casos.length) return 'Selecione pelo menos um acompanhamento.';
  if (casos.some((c) => !c.responsavel_pessoa_id)) return 'Defina o responsável antes de enviar.';
  if (new Set(casos.map((c) => c.responsavel_pessoa_id)).size > 1) return 'Selecione acompanhamentos do mesmo responsável para enviar numa mensagem só.';
  if (!casos[0].responsavel_telefone) return `${casos[0].responsavel_nome.split(' ')[0]} não tem telefone no cadastro.`;
  const sem = casos.find((c) => !c.pessoa_telefone && !c.pessoa_instagram);
  if (sem) return `${sem.pessoa_nome.split(' ')[0]} não tem telefone nem Instagram no cadastro: o responsável não teria como falar com ela.`;
  return null;
}
// Abre o WhatsApp do responsável (na hora do clique, senão o navegador bloqueia) e registra o envio
function enviarAoResponsavel(area, casos, depois) {
  const motivo = motivoNaoEnviar(casos);
  if (motivo) return aviso(motivo, 'erro');
  const link = linkWhats(casos[0].responsavel_telefone, mensagemResponsavel(casos));
  if (!link) return aviso(`O telefone de ${casos[0].responsavel_nome.split(' ')[0]} no cadastro parece inválido.`, 'erro');
  window.open(link, '_blank', 'noopener');
  api('POST', `/${area}/casos/enviados`, { ids: casos.map((c) => c.id) })
    .then(() => { aviso(`Registrado: enviado para ${casos[0].responsavel_nome.split(' ')[0]}.`); atualizarContadores(); depois?.(); })
    .catch(avisoErro);
}

// ---------- Escolher o responsável (lista do ministério; não se digita nome) ----------
function escolherResponsavel(area, titulo, equipe, atual = null) {
  return new Promise((ok) => {
    let valor = null;
    const cfg = AREAS[area];
    janela({
      titulo,
      corpo: equipe.length ? `<form id="fp" style="display:grid;gap:12px">
        ${equipe.length > 8 ? '<input class="input busca" id="pr-busca" type="search" placeholder="Buscar nome" autocomplete="off">' : ''}
        <div class="lista-escolha" id="pr-lista">${equipe.map((u) => `<label data-nome="${esc(u.nome)}"><input type="radio" name="resp" value="${u.pessoa_id}" ${u.pessoa_id === atual ? 'checked' : ''}>
          <span><b>${esc(u.nome)}</b>${u.lider ? ' <span class="tag">Líder</span>' : ''}<small>${u.telefone ? esc(fmtTel(u.telefone)) : 'Sem telefone no cadastro'}</small></span></label>`).join('')}</div>
        <p class="hint">Aparecem as pessoas do ministério ${cfg.ministerio}. Para incluir alguém, vá em Ministérios → ${cfg.ministerio}.</p>
        <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></form>`
        : `<p>Ninguém no ministério ${cfg.ministerio} ainda.</p><p class="hint" style="margin-top:8px">Coloque a equipe em <a href="#/ministerios">Ministérios → ${cfg.ministerio}</a> e volte aqui.</p>
        <div class="janela-acoes"><button type="button" class="btn" data-fechar>Fechar</button></div>`,
      aoAbrir: (j, fechar) => {
        const busca = j.querySelector('#pr-busca');
        busca?.addEventListener('input', () => { const b = semAcento(busca.value); j.querySelectorAll('#pr-lista label').forEach((l) => { l.hidden = b && !semAcento(l.dataset.nome).includes(b); }); });
        busca?.focus();
        j.querySelector('#fp')?.addEventListener('submit', (e) => {
          e.preventDefault();
          const r = j.querySelector('input[name=resp]:checked');
          if (!r) return aviso('Escolha quem vai acompanhar.', 'erro');
          valor = Number(r.value); fechar();
        });
      },
      aoFechar: () => ok(valor),
    });
  });
}

// ---------- Abrir um acompanhamento (da lista, da ficha da pessoa ou do Início) ----------
export async function abrirAcompanhamento({ area = 'pastoral', pessoa, motivo = '', depois }) {
  const quemDistribui = distribui(area);
  const equipe = quemDistribui ? await api('GET', `/${area}/equipe`).catch(() => []) : [];
  if (!quemDistribui && !sessao.usuario.pessoa_id) {
    return aviso('Sua conta ainda não está ligada ao seu cadastro. Peça a um administrador para ligar em Acessos.', 'erro');
  }
  janela({
    titulo: `${AREAS[area].titulo}: ${pessoa.nome}`,
    corpo: `<form id="fc" style="display:grid;gap:12px">
      ${quemDistribui ? `<div class="field"><span class="label">Quem vai cuidar *</span>
        ${equipe.length ? `<div class="lista-escolha curta">${equipe.map((u) => `<label><input type="radio" name="resp" value="${u.pessoa_id}">
          <span><b>${esc(u.nome)}</b>${u.lider ? ' <span class="tag">Líder</span>' : ''}<small>${u.telefone ? esc(fmtTel(u.telefone)) : 'Sem telefone no cadastro'}</small></span></label>`).join('')}</div>`
        : `<p class="hint">Ninguém no ministério ${AREAS[area].ministerio} ainda. Coloque a equipe em <a href="#/ministerios">Ministérios</a>.</p>`}</div>`
      : '<p class="muted">Você vai acompanhar esta pessoa.</p>'}
      <div class="field"><label for="mot">Motivo</label><input class="input" id="mot" value="${esc(motivo)}"></div>
      <div class="field"><label for="nota">Primeiro registro (opcional)</label><textarea class="input" id="nota" placeholder="Se já conversou, conte como foi"></textarea></div>
      <div class="janela-acoes" style="margin-top:4px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#fc').addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = j.querySelector('input[name=resp]:checked');
        if (quemDistribui && !r) return aviso('Escolha quem vai cuidar.', 'erro');
        await ocupado(e.submitter, async () => {
          try {
            await api('POST', `/${area}/casos`, { pessoa_id: pessoa.id, responsavel_pessoa_id: r ? Number(r.value) : undefined, motivo: j.querySelector('#mot').value, nota: j.querySelector('#nota').value });
            aviso('Acompanhamento aberto.'); fechar(); atualizarContadores(); depois?.();
          } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

// ---------- Ver um acompanhamento ----------
async function verCaso(area, id, depois) {
  const { caso: c, registros, poder = {} } = await api('GET', `/${area}/casos/${id}`);
  const whats = linkWhats(c.pessoa_telefone, AREAS[area].msg(c.pessoa_nome.split(' ')[0]));
  const podeEditar = pode(`${area}.editar`);
  const naoEnviar = poder.designar ? motivoNaoEnviar([c]) : null;
  const semResp = !c.responsavel_pessoa_id;
  janela({
    titulo: c.pessoa_nome,
    larga: true,
    corpo: `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">${tagTipo(c.pessoa_tipo)}
        <span class="muted small">Aberto em ${fmtData(c.dt_abertura)} · ${ultimaVez({ ultima_presenca: c.ultima_presenca })}</span>
        <span style="margin-left:auto;display:flex;gap:8px">${whats ? `<a class="btn sm" href="${whats}" target="_blank" rel="noopener">${icon('whats')} WhatsApp</a>` : ''}<a class="btn sm" href="#/pessoas/${c.pessoa_id}">Ver ficha</a></span></div>
      ${c.pessoa_referencia ? `<p class="muted" style="margin-bottom:8px">${esc(c.pessoa_referencia)}</p>` : ''}
      <div class="caixa-resp">
        <div><span class="label">${ROTULO_RESP[area]}</span><b>${semResp ? 'Ainda sem ninguém' : esc(c.responsavel_nome)}</b>
          ${c.dt_enviado ? `<small>Enviado pelo WhatsApp ${haQuanto(c.dt_enviado)}${c.sem_retorno ? ' · <b class="txt-alerta">Sem retorno há mais de 7 dias</b>' : ''}</small>` : ''}</div>
        ${poder.designar ? `<div class="acoes-resp">
          <button type="button" class="btn sm" id="trocar-resp">${semResp ? 'Definir' : 'Trocar'}</button>
          <button type="button" class="btn sm primary" id="enviar-resp" ${naoEnviar ? `disabled title="${esc(naoEnviar)}"` : ''}>${icon('whats')} Enviar para ${semResp ? 'o responsável' : esc(c.responsavel_nome.split(' ')[0])}</button>
        </div>${naoEnviar && !semResp ? `<small class="hint">${esc(naoEnviar)}</small>` : ''}` : ''}
      </div>
      ${c.motivo ? `<p style="margin:12px 0">Motivo: <b>${esc(c.motivo)}</b></p>` : ''}
      ${podeEditar ? `<div class="field" style="margin:12px 0 16px"><span class="label">Situação</span>
        <div class="abas" id="st">${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-v="${k}" class="${c.status === k ? 'ativo' : ''}">${v}</button>`).join('')}</div></div>
      <form id="fr" style="display:grid;gap:8px">
        <label class="label" for="txt">Registrar contato</label>
        <textarea class="input" id="txt" placeholder="Mensagem, ligação, visita, oração... Como foi?"></textarea>
        <div><button class="btn primary sm">Adicionar</button></div>
      </form>
      <hr>` : `<p style="margin:12px 0">Situação: <span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</p>`}
      <h3 style="margin-bottom:10px">Histórico <span class="muted small">(${c.contatos} contato${c.contatos === 1 ? '' : 's'})</span></h3>
      <div class="registros">${registros.length ? registros.map((r) => `<div class="${r.autor_nome === 'Sistema' ? 'auto' : ''}"><small>${fmtData(r.dt_criacao)}${r.autor_nome && r.autor_nome !== 'Sistema' ? ` · ${esc(r.autor_nome)}` : ''}</small>${esc(r.texto).replace(/\n/g, '<br>')}</div>`).join('') : '<p class="muted">Nenhum registro ainda.</p>'}</div>
      ${pode('pastoral.excluir') ? '<hr><button class="link-btn danger small" id="apagar">Apagar este acompanhamento</button>' : ''}`,
    aoAbrir: (j, fechar) => {
      const reabrir = () => verCaso(area, id, depois).catch(avisoErro);
      j.querySelector('#trocar-resp')?.addEventListener('click', async () => {
        fechar();
        const equipe = await api('GET', `/${area}/equipe`).catch(() => []);
        const pid = await escolherResponsavel(area, `${ROTULO_RESP[area]}: ${c.pessoa_nome}`, equipe, c.responsavel_pessoa_id);
        if (pid) { try { await api('PUT', `/${area}/casos/${id}`, { responsavel_pessoa_id: pid }); aviso('Responsável salvo.'); depois?.(); } catch (e) { avisoErro(e); } }
        reabrir();
      });
      j.querySelector('#enviar-resp')?.addEventListener('click', () => { fechar(); enviarAoResponsavel(area, [c], () => { depois?.(); reabrir(); }); });
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
          try { await api('POST', `/${area}/casos/${id}/registros`, { texto }); fechar(); depois?.(); reabrir(); } catch (err) { avisoErro(err); }
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

// ---------- Lista ----------
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

function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso.slice(0, 10) + 'T12:00:00').getTime()) / 86400000);
}

const LIMITE_ALERTAS = 8;
const alertasAbertos = { pastoral: false, integracao: false };
const novoFiltro = () => ({ busca: '', freq: '', resp: '', contato: '' });
const filtroLista = { pastoral: novoFiltro(), integracao: novoFiltro() };
const QUINZE_DIAS = 14 * 86400000;
// "Até 5 semanas sem vir" = veio em alguma das últimas 6 sextas (a mesma regra da pendência da Pastoral)
const dentro5 = (iso) => { const n = sextasDesde(iso); return n !== null && n <= 6; };
const FREQ = { '5sim': dentro5, '5nao': (iso) => !dentro5(iso), nao: (iso) => !estaNoHype({ ultima_presenca: iso }) };

async function renderArea(conteudo, area) {
  const cfg = AREAS[area];
  const { alertas, casos, equipe = [], poder = {} } = await api('GET', `/${area}`);
  const recarregar = () => renderArea(conteudo, area).catch(avisoErro);
  const casoUrl = parametrosHash().get('caso');
  const podeEditar = pode(`${area}.editar`), podeExcluir = pode('pastoral.excluir');
  const f = filtroLista[area];
  if (!poder.verTodos) f.resp = '';
  const selecionados = new Set();
  const alertaSel = new Set();

  if (!poder.verTodos && !poder.vinculado) {
    conteudo.innerHTML = `<div class="cabecalho"><div><h1>${cfg.titulo}</h1><p class="sub">${cfg.subMeus}</p></div></div>
      <div class="painel vazio"><b>Sua conta ainda não está ligada ao seu cadastro</b>Para ver os acompanhamentos que estão com você, peça a um administrador para ligar a sua conta à sua ficha em Acessos.</div>`;
    return;
  }

  const linhaAlerta = (a) => {
    const n = a.pessoa.nome.split(' ')[0];
    const whats = linkWhats(a.pessoa.telefone, cfg.msg(n));
    let det, urgente = false;
    if (area === 'pastoral') det = `${a.lider ? '<b>Líder de equipe</b> · ' : ''}${a.faltas} faltas seguidas${a.ultimaPresenca ? ` · Última vez em ${fmtData(a.ultimaPresenca)}` : ''}`;
    else {
      const d = diasDesde(a.primeiraVisita);
      urgente = d !== null && d <= 2;
      det = a.primeiraVisita ? `${d === 0 ? 'Veio hoje' : d === 1 ? 'Veio ontem' : `Primeira vez há ${d} dias`} · ${a.visitas} ${a.visitas === 1 ? 'visita' : 'visitas'}` : 'Cadastrado, ainda sem presença';
    }
    return `<div class="${alertaSel.has(a.pessoa.id) ? 'selecionada' : ''}"><input type="checkbox" class="sel-alerta" data-alerta="${a.pessoa.id}" aria-label="Selecionar ${esc(n)}" ${alertaSel.has(a.pessoa.id) ? 'checked' : ''}>
      ${foto(a.pessoa.nome, urlFoto(a.pessoa.id, a.pessoa.foto_v))}
      <div class="cresce"><a href="#/pessoas/${a.pessoa.id}">${esc(a.pessoa.nome)}</a>${a.pessoa.referencia ? ` <span class="ref">${esc(a.pessoa.referencia)}</span>` : ''}
        <span>${urgente ? '<b class="urgente">48h</b> ' : ''}${det}</span></div>
      ${whats ? `<a class="btn sm icone" href="${whats}" target="_blank" rel="noopener" title="WhatsApp da pessoa">${icon('whats')}</a>` : ''}
      ${podeEditar ? `<button class="btn sm primary" data-pessoa="${a.pessoa.id}">Designar</button>` : ''}</div>`;
  };
  const motivoAlerta = (a) => (area === 'pastoral' ? `${a.faltas} faltas seguidas` : 'Boas-vindas ao visitante');

  const blocoAlertas = poder.designar ? `
    <section class="painel">
      <div class="painel-topo"><h2>${cfg.alertaTitulo} <span class="contador">${alertas.length}</span></h2><span class="sub">${cfg.alertaSub}</span></div>
      ${alertas.length ? `<div class="barra-massa hidden" id="massa-alertas"><b id="massa-alertas-n"></b><button class="btn sm primary" id="designar-varios">Designar para…</button><button class="link-btn small" id="limpar-alertas">Cancelar seleção</button></div>` : ''}
      <div class="painel-corpo">
        ${alertas.length ? `<div class="lista lista-alertas" id="lista-alertas">${(alertasAbertos[area] ? alertas : alertas.slice(0, LIMITE_ALERTAS)).map(linhaAlerta).join('')}</div>
          ${alertas.length > LIMITE_ALERTAS ? `<button class="btn sm" id="mais-alertas" style="margin-top:10px">${alertasAbertos[area] ? 'Mostrar menos' : `Mostrar os outros ${alertas.length - LIMITE_ALERTAS}`}</button>` : ''}`
        : `<div class="vazio" style="padding:18px 0"><b>${cfg.vazio[0]}</b>${cfg.vazio[1]}</div>`}
      </div>
    </section>` : '';

  const temSel = podeExcluir || podeEditar;
  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>${cfg.titulo}</h1><p class="sub">${poder.verTodos ? cfg.sub : cfg.subMeus}</p></div></div>
    ${blocoAlertas}
    <section class="painel ${blocoAlertas ? 'mt' : ''}">
      <div class="filtros" style="justify-content:space-between">
        <h2>${poder.verTodos ? 'Acompanhamentos' : 'Seus acompanhamentos'}</h2>
        <div class="abas"><button data-f="ativos" class="${filtroStatus[area] === 'ativos' ? 'ativo' : ''}">Em aberto (${casos.filter((c) => c.status !== 'concluido').length})</button>
          <button data-f="concluidos" class="${filtroStatus[area] === 'concluidos' ? 'ativo' : ''}">Concluídos (${casos.filter((c) => c.status === 'concluido').length})</button></div>
      </div>
      <div class="filtros" id="linha-filtros">
        <input class="input busca" id="busca-caso" type="search" placeholder="Buscar nome" value="${esc(f.busca)}">
        <button class="btn so-mobile" id="mostrar-filtros" type="button">Filtros</button>
        <div class="filtros-extra" id="filtros-extra">
          ${poder.verTodos ? `<select class="input" id="f-resp" aria-label="${ROTULO_RESP[area]}">
            <option value="">${ROTULO_RESP[area]}: todos</option>
            <option value="sem" ${f.resp === 'sem' ? 'selected' : ''}>Sem responsável</option>
            ${equipe.map((u) => `<option value="${u.pessoa_id}" ${f.resp === String(u.pessoa_id) ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}
          </select>` : ''}
          <select class="input" id="f-contato" aria-label="Contato">
            <option value="">Contato: todos</option>
            <option value="nenhum" ${f.contato === 'nenhum' ? 'selected' : ''}>Ainda sem contato</option>
            <option value="parado" ${f.contato === 'parado' ? 'selected' : ''}>Parado há 2+ semanas</option>
            <option value="semretorno" ${f.contato === 'semretorno' ? 'selected' : ''}>Enviados sem retorno (7+ dias)</option>
          </select>
          <select class="input" id="freq-caso" aria-label="Frequência">
            <option value="">Frequência: todos</option>
            <option value="5sim" ${f.freq === '5sim' ? 'selected' : ''}>Vieram nas últimas 5 semanas</option>
            <option value="5nao" ${f.freq === '5nao' ? 'selected' : ''}>Sem vir há mais de 5 semanas</option>
            <option value="nao" ${f.freq === 'nao' ? 'selected' : ''}>Afastados (3+ meses)</option>
          </select>
          <button class="link-btn small hidden" id="limpar-filtros">Limpar filtros</button>
        </div>
      </div>
      <div class="barra-massa hidden" id="massa">
        <b id="massa-n"></b>
        ${poder.designar && filtroStatus[area] === 'ativos' ? `<button class="btn sm" id="massa-resp">Definir ${ROTULO_RESP[area].toLowerCase()}</button><button class="btn sm" id="massa-enviar">${icon('whats')} Enviar ao responsável</button>` : ''}
        ${podeEditar && filtroStatus[area] === 'ativos' ? `<button class="btn sm" id="massa-concluir">${icon('check')} Concluir</button>` : ''}
        ${podeExcluir ? `<button class="btn sm danger" id="massa-excluir">${icon('lixeira')} Excluir</button>` : ''}
        <button class="link-btn small" id="massa-limpar">Cancelar seleção</button>
      </div>
      <div class="tabela-wrap rolagem so-computador"><table class="tabela tabela-larga${temSel ? ' com-sel' : ''}">
        <thead><tr>
          ${temSel ? '<th class="sel"><input type="checkbox" id="sel-todos" aria-label="Selecionar todos"></th>' : ''}
          ${th('pessoa', 'Pessoa', 'fixa')}${th('situacao', 'Situação')}${th('ultima', 'Última vez que veio')}${poder.verTodos ? th('responsavel', ROTULO_RESP[area]) : ''}${th('motivo', 'Motivo')}
          ${th('contatos', 'Contatos', 'dir')}${th('ultimo_contato', 'Último contato')}${th('aberto', 'Aberto em')}<th class="dir">Ações</th></tr></thead>
        <tbody id="casos"></tbody>
      </table></div>
      <div class="cartoes-casos so-mobile" id="cartoes"></div>
      <div class="filtros" style="border-top:1px solid var(--line);border-bottom:0"><span class="muted small" id="total-casos"></span></div>
    </section>`;

  const doResponsavel = (c) => !f.resp || (f.resp === 'sem' ? !c.responsavel_pessoa_id : String(c.responsavel_pessoa_id) === f.resp);
  const doContato = (c) => !f.contato || (f.contato === 'nenhum' ? !c.contatos
    : f.contato === 'semretorno' ? c.sem_retorno
      : c.contatos > 0 && Date.now() - new Date(c.ultimo_registro).getTime() > QUINZE_DIAS);
  const filtrosAtivos = () => !!(f.busca || f.resp || f.contato || f.freq);
  const o = ordem[area];
  const visiveis = () => {
    const l = casos.filter((c) => (filtroStatus[area] === 'ativos' ? c.status !== 'concluido' : c.status === 'concluido')
      && doResponsavel(c) && doContato(c) && (!f.freq || FREQ[f.freq](c.ultima_presenca)));
    return filtrarPorNome(l, f.busca, (c) => c.pessoa_nome)
      .sort((a, b) => (o.col ? o.dir * COLUNAS[o.col](a, b) || comparaTexto(a.pessoa_nome, b.pessoa_nome) : 0));
  };
  const resp = (c) => `${c.responsavel_pessoa_id ? esc(c.responsavel_nome) : `<span class="muted">${c.responsavel_nome && semAcento(c.responsavel_nome) !== 'a definir' ? esc(c.responsavel_nome) : 'Ainda sem ninguém'}</span>`}
    ${c.sem_retorno ? '<span class="tag alerta" title="Enviado há mais de 7 dias e ninguém registrou contato depois">Sem retorno</span>' : c.dt_enviado && c.status !== 'concluido' ? `<span class="tag ok" title="Enviado pelo WhatsApp ${esc(haQuanto(c.dt_enviado))}">Enviado</span>` : ''}`;
  const botoesLinha = (c) => {
    const whats = linkWhats(c.pessoa_telefone, cfg.msg(c.pessoa_nome.split(' ')[0]));
    const naoEnviar = poder.designar && c.status !== 'concluido' ? motivoNaoEnviar([c]) : 'x';
    return `${whats ? `<a class="btn sm icone" href="${whats}" target="_blank" rel="noopener" title="WhatsApp da pessoa" data-nao-abrir>${icon('whats')}</a>` : ''}`
      + `${poder.designar && c.status !== 'concluido' ? `<button class="btn sm icone" data-enviar="${c.id}" title="${esc(naoEnviar || `Enviar para ${c.responsavel_nome.split(' ')[0]} pelo WhatsApp`)}" ${naoEnviar ? 'disabled' : ''}>${icon('enviar')}</button>` : ''}`
      + `${podeExcluir ? `<button class="btn sm icone danger" data-excluir="${c.id}" title="Excluir">${icon('lixeira')}</button>` : ''}`;
  };

  const pintar = () => {
    const l = visiveis();
    conteudo.querySelectorAll('th[data-ord]').forEach((h) => {
      const ativa = h.dataset.ord === o.col;
      h.classList.toggle('ordenada', ativa);
      h.setAttribute('aria-sort', ativa ? (o.dir === 1 ? 'ascending' : 'descending') : 'none');
      h.querySelector('.seta').innerHTML = ativa ? icon(o.dir === 1 ? 'setaBaixo' : 'setaCima') : '';
      h.querySelector('.ord').title = ativa ? (o.dir === 1 ? 'Ordem crescente. Clique para decrescente' : 'Ordem decrescente. Clique para tirar a ordenação') : 'Clique para ordenar';
    });
    for (const id of [...selecionados]) if (!l.some((c) => c.id === id)) selecionados.delete(id);
    $('#total-casos').textContent = `${l.length} acompanhamento${l.length === 1 ? '' : 's'}`;
    $('#casos').innerHTML = l.length ? l.map((c) => `<tr class="clicavel ${selecionados.has(c.id) ? 'selecionada' : ''} ${c.sem_retorno ? 'sem-retorno' : ''}" data-caso="${c.id}">
        ${temSel ? `<td class="sel"><input type="checkbox" data-sel="${c.id}" ${selecionados.has(c.id) ? 'checked' : ''} aria-label="Selecionar"></td>` : ''}
        <td class="fixa"><div class="pessoa-cel">${foto(c.pessoa_nome, urlFoto(c.pessoa_id, c.foto_v))}<div class="nome-ref"><b>${esc(c.pessoa_nome)}</b>${c.pessoa_referencia ? `<span>${esc(c.pessoa_referencia)}</span>` : ''}</div></div></td>
        <td style="white-space:nowrap"><span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</td>
        <td class="small" style="white-space:nowrap">${ultimaVez({ ultima_presenca: c.ultima_presenca })}</td>
        ${poder.verTodos ? `<td class="resp-cel">${resp(c)}</td>` : ''}
        <td class="muted small motivo">${esc(c.motivo || '')}</td>
        <td class="dir num">${c.contatos}</td>
        <td class="muted small" style="white-space:nowrap">${c.ultimo_registro ? maiuscula(haQuanto(c.ultimo_registro)) : '—'}</td>
        <td class="muted small" style="white-space:nowrap">${fmtData(c.dt_abertura)}</td>
        <td class="dir acoes-linha">${botoesLinha(c)}</td>
      </tr>`).join('') : '<tr><td colspan="10" class="vazio">Nada por aqui.</td></tr>';
    // No celular: cartões simples em vez da tabela larga
    $('#cartoes').innerHTML = l.length ? l.map((c) => `<div class="cartao-caso ${c.sem_retorno ? 'sem-retorno' : ''}" data-caso="${c.id}">
        <div class="topo-cartao">${foto(c.pessoa_nome, urlFoto(c.pessoa_id, c.foto_v))}<div class="cresce"><b>${esc(c.pessoa_nome)}</b>${c.pessoa_referencia ? `<span>${esc(c.pessoa_referencia)}</span>` : ''}</div>
          <span class="small"><span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</span></div>
        <div class="info-cartao">${ultimaVez({ ultima_presenca: c.ultima_presenca })}${poder.verTodos ? `<span>${ROTULO_RESP[area]}: ${resp(c)}</span>` : ''}<span>${c.contatos} contato${c.contatos === 1 ? '' : 's'}${c.ultimo_registro ? ` · último ${haQuanto(c.ultimo_registro)}` : ''}</span></div>
        <div class="acoes-cartao">${botoesLinha(c)}<button class="btn sm primary" data-abrir="${c.id}">${podeEditar && c.status !== 'concluido' ? 'Registrar contato' : 'Abrir'}</button></div>
      </div>`).join('') : '<div class="vazio">Nada por aqui.</div>';
    const n = selecionados.size;
    // Com algo selecionado, a barra de ações ocupa o lugar dos filtros (mesma altura, nada pula na tela)
    const linha = $('#linha-filtros');
    if (n > 0 && !linha.classList.contains('hidden')) $('#massa').style.minHeight = `${Math.min(linha.offsetHeight, 72)}px`;
    $('#massa').classList.toggle('hidden', n === 0);
    linha.classList.toggle('hidden', n > 0);
    $('#limpar-filtros').classList.toggle('hidden', !filtrosAtivos());
    $('#mostrar-filtros').textContent = `Filtros${[f.resp, f.contato, f.freq].filter(Boolean).length ? ` (${[f.resp, f.contato, f.freq].filter(Boolean).length})` : ''}`;
    $('#massa-n').textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
    const env = $('#massa-enviar');
    if (env) { const m = motivoNaoEnviar(casos.filter((c) => selecionados.has(c.id))); env.disabled = !!m; env.title = m || 'Abre o WhatsApp do responsável com a mensagem pronta'; }
    const todos = $('#sel-todos'); if (todos) { todos.checked = n > 0 && n === l.length; todos.indeterminate = n > 0 && n < l.length; }
  };
  pintar();

  const pintarAlertas = () => {
    const n = alertaSel.size, barra = $('#massa-alertas');
    if (!barra) return;
    barra.classList.toggle('hidden', n === 0);
    $('#massa-alertas-n').textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
    conteudo.querySelectorAll('[data-alerta]').forEach((cb) => cb.closest('div').classList.toggle('selecionada', cb.checked));
  };

  const excluir = async (ids) => {
    const nomes = casos.filter((c) => ids.includes(c.id)).map((c) => c.pessoa_nome);
    const msg = ids.length === 1 ? `Excluir o acompanhamento de ${nomes[0]}? O histórico de contatos também é apagado.` : `Excluir ${ids.length} acompanhamentos? O histórico de contatos também é apagado.`;
    if (!(await confirmar(msg, { botao: 'Excluir', perigo: true }))) return;
    try { await api('POST', `/${area}/casos/excluir`, { ids }); aviso(ids.length === 1 ? 'Acompanhamento excluído.' : `${ids.length} acompanhamentos excluídos.`); atualizarContadores(); recarregar(); } catch (e) { avisoErro(e); }
  };
  const cliqueCaso = (e) => {
    const sel = e.target.closest('[data-sel]');
    if (sel) { const id = Number(sel.dataset.sel); if (sel.checked) selecionados.add(id); else selecionados.delete(id); pintar(); return; }
    if (e.target.closest('.sel') || e.target.closest('[data-nao-abrir]')) return;
    const ex = e.target.closest('[data-excluir]'); if (ex) { excluir([Number(ex.dataset.excluir)]); return; }
    const en = e.target.closest('[data-enviar]');
    if (en) { if (!en.disabled) enviarAoResponsavel(area, casos.filter((c) => c.id === Number(en.dataset.enviar)), recarregar); return; }
    const ab = e.target.closest('[data-abrir]') || e.target.closest('tr[data-caso]') || e.target.closest('.cartao-caso .topo-cartao');
    const id = ab?.dataset.abrir || ab?.dataset.caso || ab?.closest('[data-caso]')?.dataset.caso;
    if (id) verCaso(area, Number(id), recarregar).catch(avisoErro);
  };
  $('#casos').addEventListener('click', cliqueCaso);
  $('#cartoes').addEventListener('click', cliqueCaso);
  $('#sel-todos')?.addEventListener('change', (e) => { visiveis().forEach((c) => (e.target.checked ? selecionados.add(c.id) : selecionados.delete(c.id))); pintar(); });
  $('#massa-limpar').addEventListener('click', () => { selecionados.clear(); pintar(); });
  $('#massa-excluir')?.addEventListener('click', () => excluir([...selecionados]));
  $('#massa-enviar')?.addEventListener('click', () => enviarAoResponsavel(area, casos.filter((c) => selecionados.has(c.id)), recarregar));
  $('#massa-resp')?.addEventListener('click', async () => {
    const ids = [...selecionados];
    const pid = await escolherResponsavel(area, `${ROTULO_RESP[area]} de ${ids.length} acompanhamento${ids.length === 1 ? '' : 's'}`, equipe);
    if (!pid) return;
    const nome = equipe.find((u) => u.pessoa_id === pid)?.nome || '';
    try { await api('POST', `/${area}/casos/responsavel`, { ids, responsavel_pessoa_id: pid }); aviso(`${ids.length === 1 ? 'Acompanhamento designado' : `${ids.length} acompanhamentos designados`} para ${nome}.`); recarregar(); } catch (err) { avisoErro(err); }
  });
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
  $('#f-resp')?.addEventListener('change', (e) => { f.resp = e.target.value; pintar(); });
  $('#f-contato').addEventListener('change', (e) => { f.contato = e.target.value; pintar(); });
  $('#limpar-filtros').addEventListener('click', () => { Object.assign(f, novoFiltro()); recarregar(); });
  $('#mostrar-filtros').addEventListener('click', () => $('#filtros-extra').classList.toggle('aberto'));

  // Lista "Sem acompanhamento" / "Esperando contato": designar um ou vários
  conteudo.querySelector('#lista-alertas')?.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-alerta]'); if (!cb) return;
    if (cb.checked) alertaSel.add(Number(cb.dataset.alerta)); else alertaSel.delete(Number(cb.dataset.alerta));
    pintarAlertas();
  });
  $('#limpar-alertas')?.addEventListener('click', () => { alertaSel.clear(); conteudo.querySelectorAll('[data-alerta]').forEach((c) => { c.checked = false; }); pintarAlertas(); });
  $('#designar-varios')?.addEventListener('click', async () => {
    const escolhidos = alertas.filter((a) => alertaSel.has(a.pessoa.id));
    const pid = await escolherResponsavel(area, `Designar ${escolhidos.length} pessoa${escolhidos.length === 1 ? '' : 's'}`, equipe);
    if (!pid) return;
    try {
      const r = await api('POST', `/${area}/casos/varios`, { responsavel_pessoa_id: pid, pessoas: escolhidos.map((a) => ({ pessoa_id: a.pessoa.id, motivo: motivoAlerta(a) })) });
      aviso(`${r.abertos} acompanhamento${r.abertos === 1 ? '' : 's'} aberto${r.abertos === 1 ? '' : 's'} para ${equipe.find((u) => u.pessoa_id === pid)?.nome || ''}.`);
      atualizarContadores(); recarregar();
    } catch (err) { avisoErro(err); }
  });
  conteudo.querySelectorAll('[data-pessoa]').forEach((b) => b.addEventListener('click', () => {
    const a = alertas.find((x) => String(x.pessoa.id) === b.dataset.pessoa);
    abrirAcompanhamento({ area, pessoa: a.pessoa, motivo: motivoAlerta(a), depois: recarregar });
  }));
  conteudo.querySelector('#mais-alertas')?.addEventListener('click', () => { alertasAbertos[area] = !alertasAbertos[area]; recarregar(); });
  conteudo.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filtroStatus[area] = b.dataset.f; recarregar(); }));
  if (casoUrl) { history.replaceState(null, '', location.pathname + `#/${area}`); verCaso(area, Number(casoUrl), recarregar).catch(avisoErro); }
}

export const render = (conteudo) => renderArea(conteudo, 'pastoral');
export const renderIntegracao = (conteudo) => renderArea(conteudo, 'integracao');
export { verCaso };
