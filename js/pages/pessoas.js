// Pessoas: lista, cadastro/edição e ficha
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, isAdmin } from '../api.js';
import {
  esc, $, $$, aviso, avisoErro, ocupado, confirmar, foto, tagTipo, TIPOS, idade, fmtData, hojeISO,
  prepararFoto, baixarCSV, pct, semAcento, linkWhats,
} from '../ui.js';
import { navegar, atualizarContadores } from '../app.js';
import { abrirAcompanhamento } from './pastoral.js';

const filtro = { busca: '', tipo: '', status: '1', ministerio: '' };

// ======================= LISTA =======================
export async function lista(conteudo) {
  const [pessoas, ministerios] = await Promise.all([api('GET', '/pessoas'), api('GET', '/ministerios')]);
  const nomeMin = Object.fromEntries(ministerios.map((m) => [m.id, m.nome]));
  const vindoDeMinisterio = sessionStorage.getItem('hype_filtro_min');
  if (vindoDeMinisterio) { Object.assign(filtro, { ministerio: vindoDeMinisterio, busca: '', tipo: '', status: '1' }); sessionStorage.removeItem('hype_filtro_min'); }

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Pessoas</h1></div>
      <div class="acoes"><a class="btn primary" href="#/pessoas/nova">Cadastrar pessoa</a></div></div>
    <div class="painel">
      <div class="filtros">
        <input class="input busca" id="busca" type="search" placeholder="Buscar por nome ou telefone" value="${esc(filtro.busca)}">
        <select class="input" id="tipo"><option value="">Todos os tipos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${filtro.tipo === k ? 'selected' : ''}>${v}s</option>`).join('')}</select>
        <select class="input" id="min"><option value="">Todos os ministérios</option>${ministerios.map((m) => `<option value="${m.id}" ${String(filtro.ministerio) === String(m.id) ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select>
        <select class="input" id="status">
          <option value="1" ${filtro.status === '1' ? 'selected' : ''}>Ativos</option>
          <option value="0" ${filtro.status === '0' ? 'selected' : ''}>Inativos</option>
          <option value="" ${filtro.status === '' ? 'selected' : ''}>Ativos e inativos</option>
        </select>
      </div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Nome</th><th>Tipo</th><th class="dir">Idade</th><th class="some-mobile">Telefone</th><th class="some-mobile">Ministérios</th></tr></thead>
        <tbody id="linhas"></tbody>
      </table></div>
      <div class="filtros" style="border-top:1px solid var(--line);border-bottom:0;justify-content:space-between">
        <span class="muted small" id="total"></span><button class="link-btn small" id="csv">Baixar planilha (CSV)</button>
      </div>
    </div>`;

  const filtradas = () => {
    const b = semAcento(filtro.busca), bNum = filtro.busca.replace(/\D/g, '');
    return pessoas.filter((p) => (filtro.status === '' || String(p.cd_status) === filtro.status)
      && (!filtro.tipo || p.tipo === filtro.tipo)
      && (!filtro.ministerio || p.ministerios.includes(Number(filtro.ministerio)))
      && (!b || semAcento(p.nome).includes(b) || (bNum.length >= 3 && (p.telefone || '').replace(/\D/g, '').includes(bNum))));
  };
  const desenhar = () => {
    const l = filtradas();
    $('#total').textContent = `${l.length} ${l.length === 1 ? 'pessoa' : 'pessoas'}`;
    $('#linhas').innerHTML = l.length ? l.map((p) => `
      <tr class="clicavel ${p.cd_status ? '' : 'inativo'}" data-id="${p.id}">
        <td><div class="pessoa-cel">${foto(p.nome, urlFoto(p.id, p.foto_v))}<b>${esc(p.nome)}</b></div></td>
        <td>${tagTipo(p.tipo)}</td>
        <td class="dir num">${idade(p.data_nascimento) ?? ''}</td>
        <td class="some-mobile num">${esc(p.telefone || '')}</td>
        <td class="some-mobile muted">${p.ministerios.map((m) => esc(nomeMin[m])).join(', ')}</td>
      </tr>`).join('') : `<tr><td colspan="5" class="vazio">Nenhuma pessoa encontrada.</td></tr>`;
  };
  desenhar();

  $('#linhas').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) navegar(`/pessoas/${tr.dataset.id}`); });
  $('#busca').addEventListener('input', (e) => { filtro.busca = e.target.value; desenhar(); });
  $('#tipo').addEventListener('change', (e) => { filtro.tipo = e.target.value; desenhar(); });
  $('#min').addEventListener('change', (e) => { filtro.ministerio = e.target.value; desenhar(); });
  $('#status').addEventListener('change', (e) => { filtro.status = e.target.value; desenhar(); });
  $('#csv').addEventListener('click', () => baixarCSV(`pessoas-hype-${hojeISO()}.csv`, [
    ['Nome', 'Tipo', 'Idade', 'Nascimento', 'Telefone', 'E-mail', 'Batizado', 'Ministérios', 'Situação', 'Cadastro'],
    ...filtradas().map((p) => [p.nome, TIPOS[p.tipo], idade(p.data_nascimento) ?? '', fmtData(p.data_nascimento), p.telefone, p.email,
      p.batizado ? 'Sim' : 'Não', p.ministerios.map((m) => nomeMin[m]).join(', '), p.cd_status ? 'Ativo' : 'Inativo', fmtData(p.data_cadastro)]),
  ]));
}

// ======================= FORMULÁRIO =======================
export async function formulario(conteudo, { id } = {}) {
  const editando = !!id;
  const [ministerios, dados] = await Promise.all([
    api('GET', '/ministerios'),
    editando ? api('GET', `/pessoas/${id}`) : null,
  ]);
  const p = dados?.pessoa || { tipo: 'visitante', cd_status: 1, data_cadastro: hojeISO(), ministerios: [] };
  const fotoAtual = editando ? urlFoto(p.id, p.foto_v) : null;
  let novaFoto = null, removerFoto = false;
  const v = (k) => esc(p[k] ?? '');
  const voltar = editando ? `#/pessoas/${id}` : '#/pessoas';

  conteudo.innerHTML = `
    <a class="voltar" href="${voltar}">← ${editando ? esc(p.nome) : 'Pessoas'}</a>
    <div class="cabecalho"><h1>${editando ? 'Editar cadastro' : 'Cadastrar pessoa'}</h1></div>
    <form class="painel" id="f" novalidate><div class="painel-corpo">
      <div class="form">
        <div class="full" style="display:flex;gap:14px;align-items:center">
          <span id="prev">${foto(p.nome || '', fotoAtual, 'g')}</span>
          <div style="display:grid;gap:4px">
            <label class="link-btn" for="arquivo" style="cursor:pointer">${fotoAtual ? 'Trocar foto' : 'Adicionar foto'}</label>
            <input type="file" id="arquivo" accept="image/*" hidden>
            <button type="button" class="link-btn danger ${fotoAtual ? '' : 'hidden'}" id="tirar" style="text-align:left">Remover foto</button>
            <span class="hint">Opcional</span>
          </div>
        </div>

        <div class="field full"><label for="nome">Nome completo *</label><input class="input" id="nome" value="${v('nome')}" required></div>
        <div class="field full"><span class="label">Tipo</span>
          <div class="radios">${Object.entries(TIPOS).map(([k, t]) => `<label class="check"><input type="radio" name="tipo" value="${k}" ${p.tipo === k ? 'checked' : ''}>${t}</label>`).join('')}</div></div>
        <div class="field"><label for="nasc">Data de nascimento</label><input class="input" type="date" id="nasc" value="${v('data_nascimento')}" max="${hojeISO()}"></div>
        <div class="field"><label for="sexo">Sexo</label><select class="input" id="sexo"><option value=""></option>
          <option value="M" ${p.sexo === 'M' ? 'selected' : ''}>Masculino</option><option value="F" ${p.sexo === 'F' ? 'selected' : ''}>Feminino</option></select></div>
        <div class="field"><label for="tel">Telefone (WhatsApp)</label><input class="input" id="tel" type="tel" inputmode="tel" value="${v('telefone')}"></div>
        <div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" value="${v('email')}"></div>
        <div class="field"><label for="insta">Instagram</label><input class="input" id="insta" value="${v('instagram')}"></div>
        <div class="field"><label for="end">Bairro / endereço</label><input class="input" id="end" value="${v('endereco')}"></div>

        <div class="form-section">Igreja</div>
        <div class="field full"><span class="label">Ministérios em que serve</span>
          <div class="tags-check">${ministerios.filter((m) => m.cd_status || p.ministerios.includes(m.id)).map((m) => `<label><input type="checkbox" name="min" value="${m.id}" ${p.ministerios.includes(m.id) ? 'checked' : ''}>${esc(m.nome)}</label>`).join('') || '<span class="hint">Nenhum ministério cadastrado.</span>'}</div></div>
        <div class="field"><label for="conheceu">Como conheceu o Hype</label><input class="input" id="conheceu" value="${v('como_conheceu')}"></div>
        <div class="field"><label for="cad">Data do cadastro</label><input class="input" type="date" id="cad" value="${v('data_cadastro')}"></div>
        <div class="field full" style="flex-direction:row;gap:20px">
          <label class="check"><input type="checkbox" id="batizado" ${p.batizado ? 'checked' : ''}>Batizado(a)</label>
          ${editando ? `<label class="check"><input type="checkbox" id="ativo" ${p.cd_status ? 'checked' : ''}>Cadastro ativo</label>` : ''}
        </div>
        <div class="field full"><label for="obs">Observações</label><textarea class="input" id="obs">${v('observacoes')}</textarea></div>
      </div>
    </div>
    <div class="barra-salvar">
      ${editando && isAdmin() ? '<button type="button" class="link-btn danger" id="excluir">Excluir cadastro</button>' : '<span></span>'}
      <div style="display:flex;gap:8px"><a class="btn" href="${voltar}">Cancelar</a><button class="btn primary" type="submit">Salvar</button></div>
    </div></form>`;

  const mostrar = (url) => { $('#prev').innerHTML = foto($('#nome').value || '', url, 'g'); };
  $('#arquivo').addEventListener('change', async (e) => {
    const arq = e.target.files[0]; if (!arq) return;
    try { novaFoto = await prepararFoto(arq); removerFoto = false; mostrar(novaFoto); $('#tirar').classList.remove('hidden'); }
    catch (err) { avisoErro(err); }
  });
  $('#tirar').addEventListener('click', () => { novaFoto = null; removerFoto = true; $('#arquivo').value = ''; mostrar(null); $('#tirar').classList.add('hidden'); });

  $('#excluir')?.addEventListener('click', async () => {
    if (!(await confirmar(`Excluir ${p.nome}? O histórico de presença dessa pessoa também será apagado. Se a pessoa só parou de vir, prefira desmarcar "Cadastro ativo".`, { botao: 'Excluir', perigo: true }))) return;
    try { await api('DELETE', `/pessoas/${id}`); aviso('Cadastro excluído.'); navegar('/pessoas'); } catch (err) { avisoErro(err); }
  });

  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#nome').value.trim();
    if (nome.length < 2) { aviso('Informe o nome.', 'erro'); $('#nome').focus(); return; }
    const corpo = {
      nome, tipo: $('input[name=tipo]:checked')?.value,
      data_nascimento: $('#nasc').value || null, sexo: $('#sexo').value || null,
      telefone: $('#tel').value, email: $('#email').value, instagram: $('#insta').value, endereco: $('#end').value,
      como_conheceu: $('#conheceu').value, data_cadastro: $('#cad').value || hojeISO(),
      batizado: $('#batizado').checked, observacoes: $('#obs').value,
      cd_status: editando ? ($('#ativo').checked ? 1 : 0) : 1,
      ministerios: $$('input[name=min]:checked').map((c) => Number(c.value)),
    };
    await ocupado($('#f button[type=submit]'), async () => {
      try {
        const r = await api(editando ? 'PUT' : 'POST', editando ? `/pessoas/${id}` : '/pessoas', corpo);
        if (novaFoto) await api('PUT', `/pessoas/${r.id}/foto`, { imagem: novaFoto });
        else if (removerFoto) await api('DELETE', `/pessoas/${r.id}/foto`);
        aviso(editando ? 'Alterações salvas.' : 'Pessoa cadastrada.');
        navegar(`/pessoas/${r.id}`);
      } catch (err) { avisoErro(err); }
    });
  });
}

// ======================= FICHA =======================
export async function perfil(conteudo, { id }) {
  const [{ pessoa: p, historico, casos }, ministerios] = await Promise.all([api('GET', `/pessoas/${id}`), api('GET', '/ministerios')]);
  const nomeMin = Object.fromEntries(ministerios.map((m) => [m.id, m.nome]));
  const presencas = historico.filter((h) => h.presente).length;
  let seguidas = 0; for (const h of historico) { if (h.presente) break; seguidas++; }
  const ultimaVez = historico.find((h) => h.presente)?.data;
  const whats = linkWhats(p.telefone);
  const i = idade(p.data_nascimento);
  const campo = (rot, val) => `<div><dt>${rot}</dt><dd>${val || '<span class="muted">—</span>'}</dd></div>`;
  const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído' };
  const casoAberto = casos.some((c) => c.status !== 'concluido');

  conteudo.innerHTML = `
    <a class="voltar" href="#/pessoas">← Pessoas</a>
    <div class="painel">
      <div class="perfil-topo">
        ${foto(p.nome, urlFoto(p.id, p.foto_v), 'g')}
        <div style="flex:1;min-width:0">
          <h1>${esc(p.nome)}</h1>
          <div class="tags">${tagTipo(p.tipo)}${p.cd_status ? '' : '<span class="tag bad">Inativo</span>'}${seguidas >= 2 ? `<span class="tag warn">${seguidas} faltas seguidas</span>` : ''}</div>
        </div>
        <a class="btn" href="#/pessoas/${id}/editar">Editar</a>
      </div>
    </div>

    <div class="colunas c21 mt">
      <section class="painel"><div class="painel-topo"><h2>Dados</h2></div><div class="painel-corpo">
        <dl class="campos" style="margin:0">
          ${campo('Telefone', p.telefone ? `${esc(p.telefone)}${whats ? ` · <a href="${whats}" target="_blank" rel="noopener">WhatsApp</a>` : ''}` : '')}
          ${campo('Idade', i !== null ? `${i} anos (${fmtData(p.data_nascimento)})` : '')}
          ${campo('E-mail', esc(p.email))}
          ${campo('Instagram', esc(p.instagram))}
          ${campo('Bairro / endereço', esc(p.endereco))}
          ${campo('Sexo', { M: 'Masculino', F: 'Feminino' }[p.sexo])}
          ${campo('Ministérios', p.ministerios.map((m) => esc(nomeMin[m])).join(', '))}
          ${campo('Batizado(a)', p.batizado ? 'Sim' : 'Não')}
          ${campo('Como conheceu', esc(p.como_conheceu))}
          ${campo('Cadastrado em', fmtData(p.data_cadastro))}
        </dl>
        ${p.observacoes ? `<hr><dt class="muted small">Observações</dt><p style="white-space:pre-wrap;margin-top:2px">${esc(p.observacoes)}</p>` : ''}
      </div></section>

      <section class="painel"><div class="painel-topo"><h2>Presença</h2></div><div class="painel-corpo">
        ${historico.length ? `
          <p><span style="font-size:24px;font-weight:600" class="num">${pct(presencas, historico.length)}%</span>
          <span class="muted"> · ${presencas} de ${historico.length} encontros</span></p>
          <p class="small muted" style="margin:2px 0 12px">${ultimaVez ? `Veio por último em ${fmtData(ultimaVez)}` : 'Ainda não veio a nenhum encontro marcado'}</p>
          <div class="historico">${historico.slice(0, 20).reverse().map((h) => `<i class="${h.presente ? 'p' : 'f'}" title="${fmtData(h.data)}: ${h.presente ? 'presente' : 'faltou'}${h.justificativa ? ' (' + esc(h.justificativa) + ')' : ''}"></i>`).join('')}</div>
          <p class="hint" style="margin-top:6px">Últimas ${Math.min(20, historico.length)} sextas, da mais antiga para a mais recente. Verde = presente.</p>`
        : '<p class="muted">Sem chamadas registradas ainda.</p>'}
      </div></section>
    </div>

    <section class="painel mt"><div class="painel-topo"><h2>Pastoral</h2>
      ${casoAberto ? '' : '<button class="link-btn" id="acompanhar">Abrir acompanhamento</button>'}</div>
      <div class="painel-corpo">
        ${casos.length ? `<table class="tabela"><tbody>${casos.map((c) => `<tr class="clicavel" data-caso="${c.id}">
          <td><span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</td><td>${esc(c.motivo || '')}</td>
          <td class="some-mobile">${esc(c.responsavel_nome)}</td><td class="dir muted">${fmtData(c.dt_abertura)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">Nenhum acompanhamento.</p>'}
      </div></section>`;

  $('#acompanhar')?.addEventListener('click', () => abrirAcompanhamento({
    pessoa: p, motivo: seguidas >= 2 ? `${seguidas} faltas seguidas` : '',
    depois: () => { atualizarContadores(); perfil(conteudo, { id }); },
  }));
  conteudo.querySelectorAll('[data-caso]').forEach((tr) => tr.addEventListener('click', () => navegar(`/pastoral?caso=${tr.dataset.caso}`)));
}
