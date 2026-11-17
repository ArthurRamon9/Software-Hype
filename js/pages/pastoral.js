// Acompanhamento de pessoas: Pastoral (quem está faltando) e Integração (visitantes que chegaram)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, pode } from '../api.js';
import { esc, aviso, avisoErro, ocupado, janela, confirmar, foto, tagTipo, fmtData, haQuanto, linkWhats } from '../ui.js';
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

async function renderArea(conteudo, area) {
  const cfg = AREAS[area];
  const { alertas, casos } = await api('GET', `/${area}`);
  const recarregar = () => renderArea(conteudo, area);
  const casoUrl = parametrosHash().get('caso');
  const filtrados = casos.filter((c) => (filtroStatus[area] === 'ativos' ? c.status !== 'concluido' : c.status === 'concluido'));
  const podeEditar = pode(`${area}.editar`);

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
      ${whats ? `<a class="btn sm" href="${whats}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      ${podeEditar ? `<button class="btn sm primary" data-pessoa="${a.pessoa.id}">${area === 'pastoral' ? 'Designar' : 'Registrar contato'}</button>` : ''}</div>`;
  };

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>${cfg.titulo}</h1><p class="sub">${cfg.sub}</p></div></div>

    <section class="painel">
      <div class="painel-topo"><h2>${cfg.alertaTitulo} <span class="contador">${alertas.length}</span></h2><span class="sub">${cfg.alertaSub}</span></div>
      <div class="painel-corpo">
        ${alertas.length ? `<div class="lista">${alertas.map(linhaAlerta).join('')}</div>`
        : `<div class="vazio" style="padding:18px 0"><b>${cfg.vazio[0]}</b>${cfg.vazio[1]}</div>`}
      </div>
    </section>

    <section class="painel mt">
      <div class="filtros" style="justify-content:space-between">
        <h2>Acompanhamentos</h2>
        <div class="abas"><button data-f="ativos" class="${filtroStatus[area] === 'ativos' ? 'ativo' : ''}">Em aberto (${casos.filter((c) => c.status !== 'concluido').length})</button>
          <button data-f="concluidos" class="${filtroStatus[area] === 'concluidos' ? 'ativo' : ''}">Concluídos (${casos.filter((c) => c.status === 'concluido').length})</button></div>
      </div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Pessoa</th><th>Situação</th><th class="some-mobile">Responsável</th><th class="some-mobile">Motivo</th><th class="dir">Contatos</th><th class="dir some-mobile">Último</th></tr></thead>
        <tbody>${filtrados.length ? filtrados.map((c) => `<tr class="clicavel" data-caso="${c.id}">
          <td><div class="pessoa-cel">${foto(c.pessoa_nome, urlFoto(c.pessoa_id, c.foto_v))}<div class="nome-ref"><b>${esc(c.pessoa_nome)}</b>${c.pessoa_referencia ? `<span>${esc(c.pessoa_referencia)}</span>` : ''}</div></div></td>
          <td style="white-space:nowrap"><span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</td>
          <td class="some-mobile">${esc(c.responsavel_nome)}</td>
          <td class="some-mobile muted small">${esc(c.motivo || '')}</td>
          <td class="dir num">${c.contatos}</td>
          <td class="dir muted small some-mobile" style="white-space:nowrap">${c.ultimo_registro ? haQuanto(c.ultimo_registro) : '—'}</td></tr>`).join('')
        : '<tr><td colspan="6" class="vazio">Nada por aqui.</td></tr>'}</tbody>
      </table></div>
    </section>`;

  conteudo.querySelectorAll('[data-pessoa]').forEach((b) => b.addEventListener('click', () => {
    const a = alertas.find((x) => String(x.pessoa.id) === b.dataset.pessoa);
    abrirAcompanhamento({ area, pessoa: a.pessoa, motivo: area === 'pastoral' ? `${a.faltas} faltas seguidas` : 'Boas-vindas ao visitante', depois: () => { atualizarContadores(); recarregar(); } });
  }));
  conteudo.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filtroStatus[area] = b.dataset.f; recarregar(); }));
  conteudo.querySelectorAll('[data-caso]').forEach((tr) => tr.addEventListener('click', () => verCaso(area, Number(tr.dataset.caso), recarregar).catch(avisoErro)));
  if (casoUrl) { history.replaceState(null, '', location.pathname + `#/${area}`); verCaso(area, Number(casoUrl), recarregar).catch(avisoErro); }
}

export const render = (conteudo) => renderArea(conteudo, 'pastoral');
export const renderIntegracao = (conteudo) => renderArea(conteudo, 'integracao');
