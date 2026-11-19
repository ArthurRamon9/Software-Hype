// Acompanhamento de pessoas: Pastoral (quem está faltando) e Integração (visitantes que chegaram)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, pode, sessao } from '../api.js';
import {
  esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, foto, tagTipo, fmtData, haQuanto, linkWhats, semAcento,
  estaNoHype, ultimaVez, filtrarPorNome, sextasDesde, fmtTel, maiuscula,
} from '../ui.js';
import { atualizarContadores, parametrosHash } from '../app.js';

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

// ---------- Como terminou (concluir) ----------
let desfechosCache = null;
const desfechos = async () => (desfechosCache = desfechosCache || await api('GET', '/acompanhamentos/desfechos'));
const rotuloDesfecho = (area, d) => (desfechosCache?.[area]?.[d]) || '';

// Concluir um ou vários: a pessoa escolhe como terminou (e pode deixar uma observação)
async function concluir(area, casos, depois) {
  const opcoes = (await desfechos())[area];
  const um = casos.length === 1;
  janela({
    titulo: um ? `Concluir: ${casos[0].pessoa_nome}` : `Concluir ${casos.length} acompanhamentos`,
    corpo: `<form id="fz" style="display:grid;gap:14px">
      <p class="muted">Concluído, ${um ? 'o acompanhamento sai' : 'os acompanhamentos saem'} da lista do responsável e fica${um ? '' : 'm'} guardado${um ? '' : 's'} para quem cuida da área. Se a pessoa voltar a faltar, entra de novo na lista, com todo o histórico.</p>
      <div class="field"><span class="label">Como terminou? *</span>
        <div class="lista-escolha curta">${Object.entries(opcoes).map(([k, v]) => `<label><input type="radio" name="desf" value="${k}"><span><b>${esc(v)}</b></span></label>`).join('')}</div></div>
      <div class="field"><label for="zn">Observação (opcional)</label><textarea class="input" id="zn" placeholder="O que aconteceu, como foi a conversa..."></textarea></div>
      <div class="janela-acoes rodape-acoes"><span></span><div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Concluir</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#fz').addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = j.querySelector('input[name=desf]:checked');
        if (!d) return aviso('Escolha como terminou.', 'erro');
        await ocupado(e.submitter, async () => {
          try {
            const r = await api('POST', `/${area}/casos/concluir`, { ids: casos.map((c) => c.id), desfecho: d.value, nota: j.querySelector('#zn').value });
            aviso(r.concluidos === 1 ? 'Acompanhamento concluído.' : `${r.concluidos} acompanhamentos concluídos.`);
            fechar(); atualizarContadores(); depois?.();
          } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

// ---------- Ver um acompanhamento ----------
const registrosHtml = (lista) => (lista.length ? lista.map((r) => `<div class="${r.autor_nome === 'Sistema' ? 'auto' : ''}"><small>${fmtData(r.dt_criacao)}${r.autor_nome && r.autor_nome !== 'Sistema' ? ` · ${esc(r.autor_nome)}` : ''}</small>${esc(r.texto).replace(/\n/g, '<br>')}</div>`).join('') : '<p class="muted">Nenhum registro.</p>');

async function verCaso(area, id, depois) {
  const [{ caso: c, registros, anteriores = [], poder = {} }] = await Promise.all([api('GET', `/${area}/casos/${id}`), desfechos()]);
  const whats = linkWhats(c.pessoa_telefone, AREAS[area].msg(c.pessoa_nome.split(' ')[0]));
  const aberto = c.status !== 'concluido';
  const cuida = poder.cuida && aberto;
  const naoEnviar = poder.designar && aberto ? motivoNaoEnviar([c]) : null;
  const semResp = !c.responsavel_pessoa_id;
  janela({
    titulo: c.pessoa_nome,
    larga: true,
    corpo: `
      <div class="caso-topo">${tagTipo(c.pessoa_tipo)}
        <span class="muted small">${ultimaVez({ ultima_presenca: c.ultima_presenca })}${c.hypes_sem_vir ? ` · ${c.hypes_sem_vir} Hype${c.hypes_sem_vir === 1 ? '' : 's'} sem vir` : ''}</span>
        <span class="caso-acoes">${whats ? `<a class="btn-icone zap" href="${whats}" target="_blank" rel="noopener" title="Conversar no WhatsApp" aria-label="Conversar no WhatsApp">${icon('zap')}</a>` : ''}<a class="btn sm" href="#/pessoas/${c.pessoa_id}">Ver ficha</a></span></div>
      ${c.pessoa_referencia ? `<p class="muted" style="margin-bottom:8px">${esc(c.pessoa_referencia)}</p>` : ''}
      <div class="caixa-resp">
        <div><span class="label">${ROTULO_RESP[area]}</span><b>${semResp ? 'Ainda sem ninguém' : esc(c.responsavel_nome)}</b>
          ${c.dt_enviado && aberto ? `<small>Enviado pelo WhatsApp ${haQuanto(c.dt_enviado)}${c.sem_retorno ? ' · <b class="txt-alerta">Sem retorno há mais de 7 dias</b>' : ''}</small>` : ''}</div>
        ${poder.designar && aberto ? `<div class="acoes-resp">
          <button type="button" class="btn sm" id="trocar-resp">${semResp ? 'Designar' : 'Trocar'}</button>
          ${semResp ? '' : `<button type="button" class="btn sm primary" id="enviar-resp" ${naoEnviar ? `disabled title="${esc(naoEnviar)}"` : ''}>${icon('zap')} Enviar para ${esc(c.responsavel_nome.split(' ')[0])}</button>`}
        </div>${naoEnviar && !semResp ? `<small class="hint">${esc(naoEnviar)}</small>` : ''}` : ''}
      </div>
      <div class="caso-info">
        <span>Aberto em <b>${fmtData(c.dt_abertura)}</b></span>
        ${c.motivo ? `<span>Motivo: <b>${esc(c.motivo)}</b></span>` : ''}
        <span>Situação: <span class="status-dot st-${c.status}"></span><b>${aberto ? (c.contatos ? 'Em andamento' : 'Aguardando o primeiro contato') : `Concluído em ${fmtData(c.dt_conclusao)}`}</b>${!aberto && c.desfecho ? ` · ${esc(rotuloDesfecho(area, c.desfecho))}` : ''}</span>
      </div>
      ${cuida ? `<form id="fr" class="registrar">
        <label class="label" for="txt">Registrar contato</label>
        <textarea class="input" id="txt" placeholder="Mensagem, ligação, visita, oração... Como foi?"></textarea>
        <div class="registrar-acoes"><button class="btn primary sm">Adicionar ao histórico</button><button type="button" class="btn sm" id="concluir">${icon('check')} Concluir acompanhamento</button></div>
      </form>` : ''}
      ${!aberto && poder.cuidaDaArea ? '<p style="margin:12px 0"><button type="button" class="btn sm" id="reabrir">Reabrir acompanhamento</button></p>' : ''}
      <h3 class="hist-titulo">Histórico <span class="muted small">(${c.contatos} contato${c.contatos === 1 ? '' : 's'})</span></h3>
      <div class="registros">${registrosHtml(registros)}</div>
      ${anteriores.length ? `<h3 class="hist-titulo">Acompanhamentos anteriores <span class="muted small">(${anteriores.length})</span></h3>
        ${anteriores.map((a) => `<details class="anterior"><summary><b>${fmtData(a.dt_abertura)}${a.dt_conclusao ? ` a ${fmtData(a.dt_conclusao)}` : ''}</b> · ${esc(a.responsavel_nome || 'Sem responsável')}${a.desfecho ? ` · ${esc(rotuloDesfecho(area, a.desfecho))}` : a.status !== 'concluido' ? ' · Em aberto' : ''}</summary>
          ${a.motivo ? `<p class="muted small" style="margin:6px 0">Motivo: ${esc(a.motivo)}</p>` : ''}<div class="registros">${registrosHtml(a.registros)}</div></details>`).join('')}` : ''}
      ${pode('pastoral.excluir') ? '<hr><button class="link-btn danger small" id="apagar">Apagar este acompanhamento</button>' : ''}`,
    aoAbrir: (j, fechar) => {
      const reabrirJanela = () => verCaso(area, id, depois).catch(avisoErro);
      j.querySelector('#trocar-resp')?.addEventListener('click', async () => {
        fechar();
        const equipe = await api('GET', `/${area}/equipe`).catch(() => []);
        const pid = await escolherResponsavel(area, `${ROTULO_RESP[area]}: ${c.pessoa_nome}`, equipe, c.responsavel_pessoa_id);
        if (pid) { try { await api('PUT', `/${area}/casos/${id}`, { responsavel_pessoa_id: pid }); aviso('Responsável salvo.'); atualizarContadores(); depois?.(); } catch (e) { avisoErro(e); } }
        reabrirJanela();
      });
      j.querySelector('#enviar-resp')?.addEventListener('click', () => { fechar(); enviarAoResponsavel(area, [c], () => { depois?.(); reabrirJanela(); }); });
      j.querySelector('#concluir')?.addEventListener('click', () => { fechar(); concluir(area, [c], depois); });
      j.querySelector('#reabrir')?.addEventListener('click', async () => {
        try { await api('PUT', `/${area}/casos/${id}`, { status: 'aberto' }); aviso('Acompanhamento reaberto.'); fechar(); atualizarContadores(); depois?.(); reabrirJanela(); } catch (e) { avisoErro(e); }
      });
      j.querySelector('#fr')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const texto = j.querySelector('#txt').value.trim(); if (!texto) return;
        await ocupado(e.submitter, async () => {
          try { await api('POST', `/${area}/casos/${id}/registros`, { texto }); fechar(); depois?.(); reabrirJanela(); } catch (err) { avisoErro(err); }
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
// Quem cuida da área vê: Acompanhamentos (com responsável) em cima, Sem acompanhamento embaixo, e os Concluídos.
// O responsável vê só os que estão com ele (abertos).
const filtroStatus = { pastoral: 'ativos', integracao: 'ativos' };
const ordem = { pastoral: { col: null, dir: 1 }, integracao: { col: null, dir: 1 } };
const ordemEspera = { pastoral: { col: 'faltas', dir: 1 }, integracao: { col: 'chegada', dir: 1 } };
const comparaTexto = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
const COLUNAS = {
  pessoa: (a, b) => comparaTexto(a.pessoa_nome, b.pessoa_nome),
  situacao: (a, b) => (a.contatos ? 1 : 0) - (b.contatos ? 1 : 0),
  faltas: (a, b) => (a.hypes_sem_vir ?? 0) - (b.hypes_sem_vir ?? 0),
  responsavel: (a, b) => comparaTexto(a.responsavel_nome, b.responsavel_nome),
  motivo: (a, b) => comparaTexto(a.motivo, b.motivo),
  contatos: (a, b) => (a.contatos || 0) - (b.contatos || 0),
  ultimo_contato: (a, b) => String(a.ultimo_registro || '').localeCompare(String(b.ultimo_registro || '')),
  aberto: (a, b) => String(a.dt_abertura || '').localeCompare(String(b.dt_abertura || '')),
  desfecho: (a, b) => comparaTexto(a.desfecho, b.desfecho),
  conclusao: (a, b) => String(a.dt_conclusao || '').localeCompare(String(b.dt_conclusao || '')),
};
const ESPERA = {
  pessoa: (a, b) => comparaTexto(a.nome, b.nome),
  faltas: (a, b) => (a.faltas ?? 99) - (b.faltas ?? 99),
  ultima: (a, b) => String(b.ultima || '').localeCompare(String(a.ultima || '')),
  chegada: (a, b) => String(b.chegada || '').localeCompare(String(a.chegada || '')),
  visitas: (a, b) => (a.visitas || 0) - (b.visitas || 0),
};
const th = (col, rotulo, classe = '', attr = 'data-ord') => `<th class="${classe}" ${attr}="${col}"><button type="button" class="ord">${rotulo}<span class="seta" aria-hidden="true"></span></button></th>`;
const marcarOrdem = (raiz, attr, o) => raiz.querySelectorAll(`th[${attr}]`).forEach((h) => {
  const ativa = h.getAttribute(attr) === o.col;
  h.classList.toggle('ordenada', ativa);
  h.setAttribute('aria-sort', ativa ? (o.dir === 1 ? 'ascending' : 'descending') : 'none');
  h.querySelector('.seta').innerHTML = ativa ? icon(o.dir === 1 ? 'setaBaixo' : 'setaCima') : '';
});

function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso.slice(0, 10) + 'T12:00:00').getTime()) / 86400000);
}

const LIMITE_ESPERA = 10;
const esperaAberta = { pastoral: false, integracao: false };
const novoFiltro = () => ({ busca: '', freq: '', resp: '', contato: '' });
const filtroLista = { pastoral: novoFiltro(), integracao: novoFiltro() };
const QUINZE_DIAS = 14 * 86400000;
const dentro5 = (iso) => { const n = sextasDesde(iso); return n !== null && n <= 6; };
const FREQ = { '5sim': dentro5, '5nao': (iso) => !dentro5(iso), nao: (iso) => !estaNoHype({ ultima_presenca: iso }) };
const zap = (link, titulo = 'Conversar no WhatsApp') => (link ? `<a class="btn-icone zap" href="${link}" target="_blank" rel="noopener" title="${titulo}" aria-label="${titulo}" data-nao-abrir>${icon('zap')}</a>` : '');

async function renderArea(conteudo, area) {
  const cfg = AREAS[area];
  const [{ alertas, casos: todos, equipe = [], poder = {} }] = await Promise.all([api('GET', `/${area}`), desfechos()]);
  const recarregar = () => renderArea(conteudo, area).catch(avisoErro);
  const casoUrl = parametrosHash().get('caso');
  const podeEditar = pode(`${area}.editar`), podeExcluir = pode('pastoral.excluir');
  const gestor = poder.verTodos;
  const f = filtroLista[area];
  if (!gestor) { f.resp = ''; filtroStatus[area] = 'ativos'; }
  const selecionados = new Set();
  const esperaSel = new Set();

  if (!gestor && !poder.vinculado) {
    conteudo.innerHTML = `<div class="cabecalho"><div><h1>${cfg.titulo}</h1><p class="sub">${cfg.subMeus}</p></div></div>
      <div class="painel vazio"><b>Sua conta ainda não está ligada ao seu cadastro</b>Para ver os acompanhamentos que estão com você, peça a um administrador para ligar a sua conta à sua ficha em Acessos.</div>`;
    return;
  }

  // Só está "em acompanhamento" quem tem responsável. Os abertos sem ninguém voltam para a lista de espera.
  const semResp = todos.filter((c) => c.status !== 'concluido' && !c.responsavel_pessoa_id);
  const casos = todos.filter((c) => c.status === 'concluido' || c.responsavel_pessoa_id);
  const espera = poder.designar ? [
    ...alertas.map((a) => (area === 'pastoral'
      ? { chave: `p${a.pessoa.id}`, pessoa: a.pessoa, nome: a.pessoa.nome, faltas: a.faltas, ultima: a.ultimaPresenca, lider: a.lider, motivo: `${a.faltas} faltas seguidas` }
      : { chave: `p${a.pessoa.id}`, pessoa: a.pessoa, nome: a.pessoa.nome, chegada: a.primeiraVisita, visitas: a.visitas, motivo: 'Boas-vindas ao visitante' })),
    ...semResp.map((c) => ({ chave: `c${c.id}`, caso: c, pessoa: { id: c.pessoa_id, nome: c.pessoa_nome, referencia: c.pessoa_referencia, telefone: c.pessoa_telefone, foto_v: c.foto_v },
      nome: c.pessoa_nome, faltas: c.hypes_sem_vir, ultima: c.ultima_presenca, chegada: null, visitas: null, motivo: c.motivo || 'Aberto sem responsável' })),
  ] : [];

  // ----- Sem acompanhamento / Esperando contato (tabela que ordena pelo título) -----
  const oe = ordemEspera[area];
  const esperaOrdenada = () => [...espera].sort((a, b) => (oe.col ? oe.dir * ESPERA[oe.col](a, b) || comparaTexto(a.nome, b.nome) : 0));
  const linhaEspera = (e) => {
    const n = e.nome.split(' ')[0];
    const det = area === 'pastoral'
      ? `${e.faltas != null ? `<b class="num">${e.faltas}</b>` : '—'}`
      : e.caso ? `<span class="muted small">Aberto em ${fmtData(e.caso.dt_abertura)}</span>`
        : (() => { const d = diasDesde(e.chegada); return e.chegada ? `${d === 0 ? 'Hoje' : d === 1 ? 'Ontem' : `Há ${d} dias`}${d !== null && d <= 2 ? ' <b class="urgente">48h</b>' : ''}` : 'Sem presença'; })();
    return `<tr class="${esperaSel.has(e.chave) ? 'selecionada' : ''}">
      <td class="sel"><input type="checkbox" data-esp="${e.chave}" ${esperaSel.has(e.chave) ? 'checked' : ''} aria-label="Selecionar ${esc(n)}"></td>
      <td><div class="pessoa-cel">${foto(e.nome, urlFoto(e.pessoa.id, e.pessoa.foto_v))}<div class="nome-ref"><a href="#/pessoas/${e.pessoa.id}"><b>${esc(e.nome)}</b></a>${e.pessoa.referencia ? `<span>${esc(e.pessoa.referencia)}</span>` : ''}</div></div></td>
      <td class="${area === 'pastoral' ? 'dir' : ''}" style="white-space:nowrap">${det}${e.lider ? ' <span class="tag">Líder de equipe</span>' : ''}</td>
      <td class="small" style="white-space:nowrap">${area === 'pastoral' ? (e.ultima ? fmtData(e.ultima) : '—') : (e.visitas != null ? `${e.visitas} ${e.visitas === 1 ? 'visita' : 'visitas'}` : '—')}</td>
      <td class="muted small motivo">${esc(e.motivo)}</td>
      <td class="dir acoes-linha">${zap(linkWhats(e.pessoa.telefone, cfg.msg(n)), `Conversar com ${esc(n)} no WhatsApp`)}${podeEditar ? `<button class="btn sm primary" data-designar="${e.chave}">Designar</button>` : ''}</td></tr>`;
  };
  const blocoEspera = poder.designar ? `
    <section class="painel mt">
      <div class="painel-topo"><h2>${cfg.alertaTitulo} <span class="contador">${espera.length}</span></h2><span class="sub">${cfg.alertaSub}</span></div>
      ${espera.length ? `<div class="barra-massa hidden" id="massa-espera"><b id="massa-espera-n"></b><button class="btn sm primary" id="designar-varios">Designar para…</button>${podeEditar && semResp.length ? `<button class="btn sm hidden" id="concluir-espera">${icon('check')} Concluir</button>` : ''}<button class="link-btn small" id="limpar-espera">Cancelar seleção</button></div>
      <div class="tabela-wrap"><table class="tabela com-sel tabela-espera"><thead><tr><th class="sel"><input type="checkbox" id="esp-todos" aria-label="Selecionar todos"></th>
        ${th('pessoa', 'Pessoa', '', 'data-ord-esp')}${area === 'pastoral' ? th('faltas', 'Hypes sem vir', 'dir', 'data-ord-esp') + th('ultima', 'Última vez', '', 'data-ord-esp') : th('chegada', 'Chegou', '', 'data-ord-esp') + th('visitas', 'Visitas', '', 'data-ord-esp')}
        <th>Motivo</th><th class="dir">Ações</th></tr></thead><tbody id="lista-espera"></tbody></table></div>
      ${espera.length > LIMITE_ESPERA ? `<div class="filtros" style="border-top:1px solid var(--line);border-bottom:0"><button class="btn sm" id="mais-espera">${esperaAberta[area] ? 'Mostrar menos' : `Mostrar todos (${espera.length})`}</button></div>` : ''}`
      : `<div class="painel-corpo"><div class="vazio" style="padding:18px 0"><b>${cfg.vazio[0]}</b>${cfg.vazio[1]}</div></div>`}
    </section>` : '';

  const concluidos = filtroStatus[area] === 'concluidos';
  const temSel = podeExcluir || podeEditar;
  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>${cfg.titulo}</h1><p class="sub">${gestor ? cfg.sub : cfg.subMeus}</p></div></div>
    <section class="painel">
      <div class="filtros" style="justify-content:space-between">
        <h2>${gestor ? 'Acompanhamentos' : 'Seus acompanhamentos'}</h2>
        ${gestor ? `<div class="abas" id="abas-casos"><button data-f="ativos" class="${!concluidos ? 'ativo' : ''}">Em andamento (${casos.filter((c) => c.status !== 'concluido').length})</button>
          <button data-f="concluidos" class="${concluidos ? 'ativo' : ''}">Concluídos (${casos.filter((c) => c.status === 'concluido').length})</button></div>` : `<span class="muted small">${casos.length} com você</span>`}
      </div>
      <div class="filtros" id="linha-filtros">
        <input class="input busca" id="busca-caso" type="search" placeholder="Buscar nome" value="${esc(f.busca)}">
        <button class="btn so-mobile" id="mostrar-filtros" type="button">Filtros</button>
        <div class="filtros-extra" id="filtros-extra">
          ${gestor ? `<select class="input" id="f-resp" aria-label="${ROTULO_RESP[area]}">
            <option value="">${ROTULO_RESP[area]}: todos</option>
            ${equipe.map((u) => `<option value="${u.pessoa_id}" ${f.resp === String(u.pessoa_id) ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}
          </select>` : ''}
          ${concluidos ? '' : `<select class="input" id="f-contato" aria-label="Contato">
            <option value="">Contato: todos</option>
            <option value="nenhum" ${f.contato === 'nenhum' ? 'selected' : ''}>Ainda sem contato</option>
            <option value="parado" ${f.contato === 'parado' ? 'selected' : ''}>Parado há 2+ semanas</option>
            <option value="semretorno" ${f.contato === 'semretorno' ? 'selected' : ''}>Enviados sem retorno (7+ dias)</option>
          </select>`}
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
        ${poder.designar && !concluidos ? `<button class="btn sm" id="massa-resp">Trocar ${ROTULO_RESP[area].toLowerCase()}</button><button class="btn sm" id="massa-enviar">${icon('zap')} Enviar ao responsável</button>` : ''}
        ${podeEditar && !concluidos ? `<button class="btn sm" id="massa-concluir">${icon('check')} Concluir</button>` : ''}
        ${podeExcluir ? `<button class="btn sm danger" id="massa-excluir">${icon('lixeira')} Excluir</button>` : ''}
        <button class="link-btn small" id="massa-limpar">Cancelar seleção</button>
      </div>
      <div class="tabela-wrap rolagem so-computador"><table class="tabela tabela-larga${temSel ? ' com-sel' : ''}">
        <thead><tr>
          ${temSel ? '<th class="sel"><input type="checkbox" id="sel-todos" aria-label="Selecionar todos"></th>' : ''}
          ${th('pessoa', 'Pessoa', 'fixa')}${concluidos ? th('desfecho', 'Como terminou') : th('situacao', 'Situação')}${th('faltas', 'Hypes sem vir', 'dir')}${gestor ? th('responsavel', ROTULO_RESP[area]) : ''}${th('motivo', 'Motivo')}
          ${th('contatos', 'Contatos', 'dir')}${concluidos ? th('conclusao', 'Concluído em') : th('ultimo_contato', 'Último contato')}${th('aberto', 'Aberto em')}<th class="dir">Ações</th></tr></thead>
        <tbody id="casos"></tbody>
      </table></div>
      <div class="cartoes-casos so-mobile" id="cartoes"></div>
      <div class="filtros" style="border-top:1px solid var(--line);border-bottom:0"><span class="muted small" id="total-casos"></span></div>
    </section>
    ${blocoEspera}`;

  const doResponsavel = (c) => !f.resp || String(c.responsavel_pessoa_id) === f.resp;
  const doContato = (c) => concluidos || !f.contato || (f.contato === 'nenhum' ? !c.contatos
    : f.contato === 'semretorno' ? c.sem_retorno
      : c.contatos > 0 && Date.now() - new Date(c.ultimo_registro).getTime() > QUINZE_DIAS);
  const filtrosAtivos = () => !!(f.busca || f.resp || f.contato || f.freq);
  const o = ordem[area];
  const visiveis = () => {
    const l = casos.filter((c) => (concluidos ? c.status === 'concluido' : c.status !== 'concluido')
      && doResponsavel(c) && doContato(c) && (!f.freq || FREQ[f.freq](c.ultima_presenca)));
    return filtrarPorNome(l, f.busca, (c) => c.pessoa_nome)
      .sort((a, b) => (o.col ? o.dir * COLUNAS[o.col](a, b) || comparaTexto(a.pessoa_nome, b.pessoa_nome) : 0));
  };
  const situacao = (c) => (c.status === 'concluido' ? `<span class="status-dot st-concluido"></span>${esc(rotuloDesfecho(area, c.desfecho) || 'Concluído')}`
    : c.contatos ? '<span class="status-dot st-em_andamento"></span>Em andamento' : '<span class="status-dot st-aberto"></span>Aguardando contato');
  const resp = (c) => `<span class="nowrap">${esc(c.responsavel_nome || '')}</span>
    ${c.sem_retorno ? '<span class="tag alerta" title="Enviado há mais de 7 dias e ninguém registrou contato depois">Sem retorno</span>' : c.dt_enviado && c.status !== 'concluido' ? `<span class="tag ok" title="Enviado pelo WhatsApp ${esc(haQuanto(c.dt_enviado))}">Enviado</span>` : ''}`;
  const botoesLinha = (c) => {
    const naoEnviar = poder.designar && c.status !== 'concluido' ? motivoNaoEnviar([c]) : 'x';
    return zap(linkWhats(c.pessoa_telefone, cfg.msg(c.pessoa_nome.split(' ')[0])))
      + `${poder.designar && c.status !== 'concluido' ? `<button class="btn-icone" data-enviar="${c.id}" title="${esc(naoEnviar || `Enviar para ${c.responsavel_nome.split(' ')[0]} pelo WhatsApp`)}" ${naoEnviar ? 'disabled' : ''}>${icon('enviar')}</button>` : ''}`
      + `${podeExcluir ? `<button class="btn-icone perigo" data-excluir="${c.id}" title="Excluir">${icon('lixeira')}</button>` : ''}`;
  };

  const pintar = () => {
    const l = visiveis();
    marcarOrdem(conteudo, 'data-ord', o);
    for (const id of [...selecionados]) if (!l.some((c) => c.id === id)) selecionados.delete(id);
    $('#total-casos').textContent = `${l.length} acompanhamento${l.length === 1 ? '' : 's'}`;
    $('#casos').innerHTML = l.length ? l.map((c) => `<tr class="clicavel ${selecionados.has(c.id) ? 'selecionada' : ''} ${c.sem_retorno ? 'sem-retorno' : ''}" data-caso="${c.id}">
        ${temSel ? `<td class="sel"><input type="checkbox" data-sel="${c.id}" ${selecionados.has(c.id) ? 'checked' : ''} aria-label="Selecionar"></td>` : ''}
        <td class="fixa"><div class="pessoa-cel">${foto(c.pessoa_nome, urlFoto(c.pessoa_id, c.foto_v))}<div class="nome-ref"><b>${esc(c.pessoa_nome)}</b>${c.pessoa_referencia ? `<span>${esc(c.pessoa_referencia)}</span>` : ''}</div></div></td>
        <td style="white-space:nowrap">${situacao(c)}</td>
        <td class="dir num">${c.hypes_sem_vir ?? '—'}</td>
        ${gestor ? `<td class="resp-cel">${resp(c)}</td>` : ''}
        <td class="muted small motivo">${esc(c.motivo || '')}</td>
        <td class="dir num">${c.contatos}</td>
        <td class="muted small" style="white-space:nowrap">${concluidos ? fmtData(c.dt_conclusao) : c.ultimo_registro ? maiuscula(haQuanto(c.ultimo_registro)) : '—'}</td>
        <td class="muted small" style="white-space:nowrap">${fmtData(c.dt_abertura)}</td>
        <td class="dir acoes-linha">${botoesLinha(c)}</td>
      </tr>`).join('') : `<tr><td colspan="10" class="vazio">${concluidos ? 'Nenhum acompanhamento concluído.' : gestor ? 'Ninguém em acompanhamento. Designe alguém da lista abaixo.' : 'Nenhum acompanhamento com você agora.'}</td></tr>`;
    $('#cartoes').innerHTML = l.length ? l.map((c) => `<div class="cartao-caso ${c.sem_retorno ? 'sem-retorno' : ''}" data-caso="${c.id}">
        <div class="topo-cartao">${foto(c.pessoa_nome, urlFoto(c.pessoa_id, c.foto_v))}<div class="cresce"><b>${esc(c.pessoa_nome)}</b>${c.pessoa_referencia ? `<span>${esc(c.pessoa_referencia)}</span>` : ''}</div>
          <span class="small">${situacao(c)}</span></div>
        <div class="info-cartao">${ultimaVez({ ultima_presenca: c.ultima_presenca })}${gestor ? `<span>${ROTULO_RESP[area]}: ${resp(c)}</span>` : ''}<span>${c.contatos} contato${c.contatos === 1 ? '' : 's'}${c.ultimo_registro ? ` · último ${haQuanto(c.ultimo_registro)}` : ''}</span></div>
        <div class="acoes-cartao">${botoesLinha(c)}<button class="btn sm primary" data-abrir="${c.id}">${podeEditar && c.status !== 'concluido' ? 'Registrar contato' : 'Abrir'}</button></div>
      </div>`).join('') : '<div class="vazio">Nada por aqui.</div>';
    const n = selecionados.size;
    const linha = $('#linha-filtros');
    if (n > 0 && !linha.classList.contains('hidden')) $('#massa').style.minHeight = `${Math.min(linha.offsetHeight, 72)}px`;
    $('#massa').classList.toggle('hidden', n === 0);
    linha.classList.toggle('hidden', n > 0);
    $('#limpar-filtros').classList.toggle('hidden', !filtrosAtivos());
    const nf = [f.resp, f.contato, f.freq].filter(Boolean).length;
    $('#mostrar-filtros').textContent = `Filtros${nf ? ` (${nf})` : ''}`;
    $('#massa-n').textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
    const env = $('#massa-enviar');
    if (env) { const m = motivoNaoEnviar(casos.filter((c) => selecionados.has(c.id))); env.disabled = !!m; env.title = m || 'Abre o WhatsApp do responsável com a mensagem pronta'; }
    const tds = $('#sel-todos'); if (tds) { tds.checked = n > 0 && n === l.length; tds.indeterminate = n > 0 && n < l.length; }
  };
  pintar();

  const pintarEspera = () => {
    const box = $('#lista-espera'); if (!box) return;
    marcarOrdem(conteudo, 'data-ord-esp', oe);
    const l = esperaOrdenada();
    box.innerHTML = (esperaAberta[area] ? l : l.slice(0, LIMITE_ESPERA)).map(linhaEspera).join('');
    const n = esperaSel.size;
    $('#massa-espera').classList.toggle('hidden', n === 0);
    $('#massa-espera-n').textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
    // Concluir só vale para quem já tem acompanhamento aberto (os antigos, sem responsável)
    const ce = $('#concluir-espera'); if (ce) ce.classList.toggle('hidden', !espera.some((x) => esperaSel.has(x.chave) && x.caso));
    const t = $('#esp-todos'); t.checked = n > 0 && n === espera.length; t.indeterminate = n > 0 && n < espera.length;
  };
  pintarEspera();

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
    try { await api('POST', `/${area}/casos/responsavel`, { ids, responsavel_pessoa_id: pid }); aviso(`${ids.length === 1 ? 'Acompanhamento passado' : `${ids.length} acompanhamentos passados`} para ${nome}.`); recarregar(); } catch (err) { avisoErro(err); }
  });
  $('#massa-concluir')?.addEventListener('click', () => concluir(area, casos.filter((c) => selecionados.has(c.id)), recarregar));
  conteudo.querySelectorAll('th[data-ord]').forEach((h) => h.querySelector('.ord').addEventListener('click', () => {
    const col = h.dataset.ord;
    if (o.col !== col) { o.col = col; o.dir = 1; } else if (o.dir === 1) o.dir = -1; else o.col = null;
    pintar();
  }));
  conteudo.querySelectorAll('th[data-ord-esp]').forEach((h) => h.querySelector('.ord').addEventListener('click', () => {
    const col = h.getAttribute('data-ord-esp');
    if (oe.col !== col) { oe.col = col; oe.dir = 1; } else oe.dir *= -1;
    pintarEspera();
  }));
  $('#busca-caso').addEventListener('input', (e) => { f.busca = e.target.value; pintar(); });
  $('#freq-caso').addEventListener('change', (e) => { f.freq = e.target.value; pintar(); });
  $('#f-resp')?.addEventListener('change', (e) => { f.resp = e.target.value; pintar(); });
  $('#f-contato')?.addEventListener('change', (e) => { f.contato = e.target.value; pintar(); });
  $('#limpar-filtros').addEventListener('click', () => { Object.assign(f, novoFiltro()); recarregar(); });
  $('#mostrar-filtros').addEventListener('click', () => $('#filtros-extra').classList.toggle('aberto'));

  // ----- Designar quem está esperando (um ou vários) -----
  const designar = async (itens) => {
    const pid = await escolherResponsavel(area, itens.length === 1 ? `Designar: ${itens[0].nome}` : `Designar ${itens.length} pessoas`, equipe);
    if (!pid) return;
    const nome = equipe.find((u) => u.pessoa_id === pid)?.nome || '';
    try {
      const novos = itens.filter((e) => !e.caso), antigos = itens.filter((e) => e.caso);
      let n = 0;
      if (novos.length) n += (await api('POST', `/${area}/casos/varios`, { responsavel_pessoa_id: pid, pessoas: novos.map((e) => ({ pessoa_id: e.pessoa.id, motivo: e.motivo })) })).abertos;
      if (antigos.length) n += (await api('POST', `/${area}/casos/responsavel`, { ids: antigos.map((e) => e.caso.id), responsavel_pessoa_id: pid })).n;
      aviso(`${n === 1 ? '1 pessoa designada' : `${n} pessoas designadas`} para ${nome}.`);
      atualizarContadores(); recarregar();
    } catch (err) { avisoErro(err); }
  };
  $('#lista-espera')?.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-esp]'); if (!cb) return;
    if (cb.checked) esperaSel.add(cb.dataset.esp); else esperaSel.delete(cb.dataset.esp);
    pintarEspera();
  });
  $('#lista-espera')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-designar]'); if (!b) return;
    designar(espera.filter((x) => x.chave === b.dataset.designar));
  });
  $('#esp-todos')?.addEventListener('change', (e) => { espera.forEach((x) => (e.target.checked ? esperaSel.add(x.chave) : esperaSel.delete(x.chave))); pintarEspera(); });
  $('#limpar-espera')?.addEventListener('click', () => { esperaSel.clear(); pintarEspera(); });
  $('#designar-varios')?.addEventListener('click', () => designar(espera.filter((x) => esperaSel.has(x.chave))));
  $('#concluir-espera')?.addEventListener('click', () => concluir(area, espera.filter((x) => esperaSel.has(x.chave) && x.caso).map((x) => x.caso), recarregar));
  $('#mais-espera')?.addEventListener('click', (e) => { esperaAberta[area] = !esperaAberta[area]; e.target.textContent = esperaAberta[area] ? 'Mostrar menos' : `Mostrar todos (${espera.length})`; pintarEspera(); });
  conteudo.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filtroStatus[area] = b.dataset.f; recarregar(); }));
  if (casoUrl) { history.replaceState(null, '', location.pathname + `#/${area}`); verCaso(area, Number(casoUrl), recarregar).catch(avisoErro); }
}

export const render = (conteudo) => renderArea(conteudo, 'pastoral');
export const renderIntegracao = (conteudo) => renderArea(conteudo, 'integracao');
export { verCaso };
