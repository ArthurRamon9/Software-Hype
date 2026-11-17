// Pastoral: acompanhamento de quem está faltando
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, pode } from '../api.js';
import { esc, aviso, avisoErro, ocupado, janela, confirmar, foto, TIPOS, fmtData, haQuanto, linkWhats } from '../ui.js';
import { atualizarContadores, parametrosHash } from '../app.js';

const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído' };
let filtroStatus = 'ativos';

export async function abrirAcompanhamento({ pessoa, motivo = '', depois }) {
  const responsaveis = await api('GET', '/responsaveis');
  janela({
    titulo: `Acompanhamento: ${pessoa.nome}`,
    corpo: `<form id="fc" style="display:grid;gap:12px">
      <div class="field"><label for="resp">Quem vai cuidar *</label>
        <input class="input" id="resp" list="lista-resp" required placeholder="Nome do pastor ou líder">
        <datalist id="lista-resp">${responsaveis.map((r) => `<option value="${esc(r.nome)}">`).join('')}</datalist></div>
      <div class="field"><label for="mot">Motivo</label><input class="input" id="mot" value="${esc(motivo)}"></div>
      <div class="field"><label for="nota">Anotação inicial</label><textarea class="input" id="nota"></textarea></div>
      <div class="janela-acoes" style="margin-top:4px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#resp').focus();
      j.querySelector('#fc').addEventListener('submit', async (e) => {
        e.preventDefault();
        await ocupado(e.submitter, async () => {
          try {
            await api('POST', '/pastoral/casos', { pessoa_id: pessoa.id, responsavel_nome: j.querySelector('#resp').value, motivo: j.querySelector('#mot').value, nota: j.querySelector('#nota').value });
            aviso('Acompanhamento aberto.'); fechar(); depois?.();
          } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

async function verCaso(id, depois) {
  const { caso: c, registros } = await api('GET', `/pastoral/casos/${id}`);
  const whats = linkWhats(c.pessoa_telefone);
  janela({
    titulo: c.pessoa_nome,
    larga: true,
    corpo: `
      <p class="muted" style="margin-bottom:12px">${TIPOS[c.pessoa_tipo]} · aberto em ${fmtData(c.dt_abertura)} · responsável: <b style="color:var(--ink)">${esc(c.responsavel_nome)}</b>
        ${whats ? ` · <a href="${whats}" target="_blank" rel="noopener">WhatsApp</a>` : ''} · <a href="#/pessoas/${c.pessoa_id}">ficha</a></p>
      ${c.motivo ? `<p style="margin-bottom:12px">Motivo: ${esc(c.motivo)}</p>` : ''}
      ${pode('pastoral.editar') ? `<div class="field" style="margin-bottom:16px"><span class="label">Situação</span>
        <div class="abas" id="st">${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-v="${k}" class="${c.status === k ? 'ativo' : ''}">${v}</button>`).join('')}</div></div>
      <form id="fr" style="display:grid;gap:8px">
        <label class="label" for="txt">Registrar contato</label>
        <textarea class="input" id="txt" placeholder="Conversa, visita, oração, retorno..."></textarea>
        <div><button class="btn primary sm">Adicionar</button></div>
      </form>
      <hr>` : `<p style="margin-bottom:12px">Situação: <span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</p>`}
      <div class="registros">${registros.length ? registros.map((r) => `<div><small>${fmtData(r.dt_criacao)} · ${esc(r.autor_nome || '')}</small>${esc(r.texto).replace(/\n/g, '<br>')}</div>`).join('') : '<p class="muted">Nenhum registro ainda.</p>'}</div>
      ${pode('pastoral.excluir') ? '<hr><button class="link-btn danger small" id="apagar">Apagar este acompanhamento</button>' : ''}`,
    aoAbrir: (j, fechar) => {
      j.querySelectorAll('#st button').forEach((b) => b.addEventListener('click', async () => {
        try {
          await api('PUT', `/pastoral/casos/${id}`, { status: b.dataset.v });
          j.querySelectorAll('#st button').forEach((x) => x.classList.toggle('ativo', x === b));
          depois?.(); atualizarContadores();
        } catch (e) { avisoErro(e); }
      }));
      j.querySelector('#fr')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const texto = j.querySelector('#txt').value.trim(); if (!texto) return;
        await ocupado(e.submitter, async () => {
          try { await api('POST', `/pastoral/casos/${id}/registros`, { texto }); fechar(); depois?.(); verCaso(id, depois); } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#apagar')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar('Apagar este acompanhamento e todos os registros?', { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/pastoral/casos/${id}`); aviso('Acompanhamento apagado.'); depois?.(); atualizarContadores(); } catch (err) { avisoErro(err); }
      });
    },
  });
}

export async function render(conteudo) {
  const { alertas, casos } = await api('GET', '/pastoral');
  const recarregar = () => render(conteudo);
  const casoUrl = parametrosHash().get('caso');

  const filtrados = casos.filter((c) => (filtroStatus === 'ativos' ? c.status !== 'concluido' : c.status === 'concluido'));

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Pastoral</h1><p class="sub">Quem está faltando e quem está cuidando de cada um.</p></div></div>

    <section class="painel">
      <div class="painel-topo"><h2>Sem acompanhamento</h2><span class="sub">ativos com 2 ou mais faltas seguidas</span></div>
      <div class="painel-corpo">
        ${alertas.length ? `<div class="lista">${alertas.map((a) => `<div>${foto(a.pessoa.nome, urlFoto(a.pessoa.id, a.pessoa.foto_v))}
            <div class="cresce"><a href="#/pessoas/${a.pessoa.id}">${esc(a.pessoa.nome)}</a><span>${a.faltas} faltas seguidas${a.ultimaPresenca ? ` · última vez em ${fmtData(a.ultimaPresenca)}` : ''}</span></div>
            ${pode('pastoral.editar') ? `<button class="btn sm" data-pessoa="${a.pessoa.id}">Designar</button>` : ''}</div>`).join('')}</div>`
        : '<p class="muted">Ninguém nessa situação agora.</p>'}
      </div>
    </section>

    <section class="painel mt">
      <div class="filtros" style="justify-content:space-between">
        <h2>Acompanhamentos</h2>
        <div class="abas"><button data-f="ativos" class="${filtroStatus === 'ativos' ? 'ativo' : ''}">Em aberto (${casos.filter((c) => c.status !== 'concluido').length})</button>
          <button data-f="concluidos" class="${filtroStatus === 'concluidos' ? 'ativo' : ''}">Concluídos</button></div>
      </div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Pessoa</th><th>Situação</th><th class="some-mobile">Responsável</th><th class="some-mobile">Motivo</th><th class="dir">Último contato</th></tr></thead>
        <tbody>${filtrados.length ? filtrados.map((c) => `<tr class="clicavel" data-caso="${c.id}">
          <td><div class="pessoa-cel">${foto(c.pessoa_nome, urlFoto(c.pessoa_id, c.foto_v))}${esc(c.pessoa_nome)}</div></td>
          <td style="white-space:nowrap"><span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</td>
          <td class="some-mobile">${esc(c.responsavel_nome)}</td>
          <td class="some-mobile muted">${esc(c.motivo || '')}</td>
          <td class="dir muted" style="white-space:nowrap">${c.ultimo_registro ? haQuanto(c.ultimo_registro) : 'nenhum'}</td></tr>`).join('')
        : '<tr><td colspan="5" class="vazio">Nada por aqui.</td></tr>'}</tbody>
      </table></div>
    </section>`;

  conteudo.querySelectorAll('[data-pessoa]').forEach((b) => b.addEventListener('click', () => {
    const a = alertas.find((x) => String(x.pessoa.id) === b.dataset.pessoa);
    abrirAcompanhamento({ pessoa: a.pessoa, motivo: `${a.faltas} faltas seguidas`, depois: () => { atualizarContadores(); recarregar(); } });
  }));
  conteudo.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filtroStatus = b.dataset.f; recarregar(); }));
  conteudo.querySelectorAll('[data-caso]').forEach((tr) => tr.addEventListener('click', () => verCaso(Number(tr.dataset.caso), recarregar).catch(avisoErro)));
  if (casoUrl) { history.replaceState(null, '', location.pathname + '#/pastoral'); verCaso(Number(casoUrl), recarregar).catch(avisoErro); }
}
