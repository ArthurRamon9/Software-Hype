// Pessoas: lista, cadastro/edição e ficha
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, pode } from '../api.js';
import {
  esc, $, $$, aviso, avisoErro, ocupado, confirmar, foto, tagTipo, TIPOS, SITUACOES, corSituacao, idade, fmtData,
  hojeISO, prepararFoto, pct, semAcento, linkWhats, janela, estaNoHype, ultimaVez, textoUltimaVez, minuscula, fmtTel, formatarAoSair,
} from '../ui.js';
import { navegar, atualizarContadores } from '../app.js';
import { abrirAcompanhamento } from './pastoral.js';
import { lerPlanilha, CAMPOS, mapearAutomatico, montarPessoa } from '../importar.js';
import { baixarXLSX } from '../xlsx.js';

const filtro = { busca: '', tipo: '', status: 'nohype', ministerio: '' };
const simNao = (v) => (v === true || v === 1 ? 'Sim' : v === false || v === 0 ? 'Não' : '');

// ======================= LISTA =======================
export async function lista(conteudo) {
  const [pessoas, ministerios] = await Promise.all([api('GET', '/pessoas'), api('GET', '/ministerios')]);
  const nomeMin = Object.fromEntries(ministerios.map((m) => [m.id, m.nome]));
  const vindoDeMinisterio = sessionStorage.getItem('hype_filtro_min');
  if (vindoDeMinisterio) { Object.assign(filtro, { ministerio: vindoDeMinisterio, busca: '', tipo: '', status: 'nohype' }); sessionStorage.removeItem('hype_filtro_min'); }
  const vindoDeSituacao = sessionStorage.getItem('hype_filtro_tipo');
  if (vindoDeSituacao) { Object.assign(filtro, { tipo: vindoDeSituacao, busca: '', ministerio: '', status: 'nohype' }); sessionStorage.removeItem('hype_filtro_tipo'); }

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Pessoas</h1><p class="sub">${pessoas.filter((p) => p.cd_status && estaNoHype(p)).length} no Hype agora (vieram nos últimos 3 meses) · ${pessoas.length} no cadastro</p></div>
      <div class="acoes">
        <button class="btn" id="exportar">Baixar planilha</button>
        ${pode('pessoas.editar') ? '<button class="btn" id="importar">Importar planilha</button><a class="btn primary" href="#/pessoas/nova">Cadastrar pessoa</a>' : ''}
      </div></div>
    <div class="chips" id="chips"></div>
    <div class="painel">
      <div class="filtros">
        <input class="input busca" id="busca" type="search" placeholder="Buscar por nome, referência ou telefone" value="${esc(filtro.busca)}">
        <select class="input" id="min"><option value="">Todos os ministérios</option>${ministerios.map((m) => `<option value="${m.id}" ${String(filtro.ministerio) === String(m.id) ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select>
        <select class="input" id="status">
          <option value="nohype" ${filtro.status === 'nohype' ? 'selected' : ''}>No Hype (últimos 3 meses)</option>
          <option value="afastados" ${filtro.status === 'afastados' ? 'selected' : ''}>Afastados (3+ meses sem vir)</option>
          <option value="todos" ${filtro.status === 'todos' ? 'selected' : ''}>Todo o cadastro</option>
          <option value="inativos" ${filtro.status === 'inativos' ? 'selected' : ''}>Cadastro desativado</option>
        </select>
      </div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Nome</th><th>Situação</th><th>Última vez</th><th class="some-mobile">WhatsApp</th><th class="some-mobile">Ministérios</th></tr></thead>
        <tbody id="linhas"></tbody>
      </table></div>
      <div class="filtros" style="border-top:1px solid var(--line);border-bottom:0"><span class="muted small" id="total"></span></div>
    </div>`;

  const porStatus = (p) => ({
    nohype: p.cd_status && estaNoHype(p), afastados: p.cd_status && !estaNoHype(p), todos: p.cd_status, inativos: !p.cd_status,
  })[filtro.status];
  // A busca procura em todo o cadastro (para achar quem está afastado também)
  const base = () => pessoas.filter((p) => (filtro.busca ? true : porStatus(p)) && (!filtro.ministerio || p.ministerios.includes(Number(filtro.ministerio))));
  const filtradas = () => {
    const b = semAcento(filtro.busca), bNum = filtro.busca.replace(/\D/g, '');
    return base().filter((p) => (!filtro.tipo || p.tipo === filtro.tipo)
      && (!b || semAcento(`${p.nome} ${p.referencia || ''}`).includes(b) || (bNum.length >= 3 && (p.telefone || '').replace(/\D/g, '').includes(bNum))));
  };
  const chips = () => {
    const b = base();
    $('#chips').innerHTML = `<button data-t="" class="${filtro.tipo === '' ? 'ativo' : ''}">Todas <b>${b.length}</b></button>${SITUACOES.map((s) => {
      const n = b.filter((p) => p.tipo === s.id).length;
      return `<button data-t="${s.id}" class="${filtro.tipo === s.id ? 'ativo' : ''}" style="--c:${s.cor}"><i></i>${s.nome} <b>${n}</b></button>`;
    }).join('')}`;
  };
  const desenhar = () => {
    chips();
    const l = filtradas();
    $('#total').textContent = `${l.length} ${l.length === 1 ? 'pessoa' : 'pessoas'}`;
    $('#linhas').innerHTML = l.length ? l.map((p) => `
      <tr class="clicavel ${p.cd_status ? '' : 'inativo'}" data-id="${p.id}">
        <td><div class="pessoa-cel">${foto(p.nome, urlFoto(p.id, p.foto_v))}<div class="nome-ref"><b>${esc(p.nome)}</b>${p.referencia ? `<span>${esc(p.referencia)}</span>` : ''}</div></div></td>
        <td>${tagTipo(p.tipo)}</td>
        <td class="small">${ultimaVez(p)}</td>
        <td class="some-mobile num small">${esc(fmtTel(p.telefone))}</td>
        <td class="some-mobile muted small">${p.ministerios.map((m) => esc(nomeMin[m])).join(', ')}</td>
      </tr>`).join('') : `<tr><td colspan="5" class="vazio">${pessoas.length ? 'Ninguém encontrado com esses filtros.' : '<b>Nenhuma pessoa cadastrada ainda</b>Comece cadastrando uma pessoa ou importando a planilha que vocês já usam.'}</td></tr>`;
  };
  desenhar();

  $('#chips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; filtro.tipo = b.dataset.t; desenhar(); });
  $('#linhas').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) navegar(`/pessoas/${tr.dataset.id}`); });
  $('#busca').addEventListener('input', (e) => { filtro.busca = e.target.value; desenhar(); });
  $('#min').addEventListener('change', (e) => { filtro.ministerio = e.target.value; desenhar(); });
  $('#status').addEventListener('change', (e) => { filtro.status = e.target.value; desenhar(); });
  $('#importar')?.addEventListener('click', () => abrirImportacao(() => lista(conteudo)));
  $('#exportar').addEventListener('click', () => baixarXLSX(`pessoas-hype-${hojeISO()}`, [{
    nome: 'Pessoas',
    linhas: [['Nome', 'Referência', 'Situação', 'WhatsApp', 'Instagram', 'E-mail', 'Nascimento', 'Idade', 'Bairro / endereço', 'Ministérios',
      'Grupo cultivo', 'Batizado', 'Quem integrou', 'Como conheceu', 'Presenças', 'Última presença', 'Frequência', 'Cadastro', 'Cadastro ativo'],
    ...filtradas().map((p) => [p.nome, p.referencia, TIPOS[p.tipo], fmtTel(p.telefone), p.instagram, p.email, p.data_nascimento, idade(p.data_nascimento),
      p.endereco, p.ministerios.map((m) => nomeMin[m]).join(', '), p.grupo_cultivo, simNao(p.batizado), p.integrado_por, p.como_conheceu,
      p.presencas, p.ultima_presenca, estaNoHype(p) ? 'No Hype' : 'Afastado', p.data_cadastro, p.cd_status ? 'Sim' : 'Não'])],
  }]));
}

// ======================= FORMULÁRIO =======================
export async function formulario(conteudo, { id } = {}) {
  const editando = !!id;
  const [ministerios, dados] = await Promise.all([api('GET', '/ministerios'), editando ? api('GET', `/pessoas/${id}`) : null]);
  const p = dados?.pessoa || { tipo: 'novo_visitante', cd_status: 1, data_cadastro: hojeISO(), ministerios: [], batizado: null };
  const fotoAtual = editando ? urlFoto(p.id, p.foto_v) : null;
  let novaFoto = null, removerFoto = false;
  const v = (k) => esc(p[k] ?? '');
  const voltar = editando ? `#/pessoas/${id}` : '#/pessoas';

  conteudo.innerHTML = `
    <a class="voltar" href="${voltar}">← ${editando ? esc(p.nome) : 'Pessoas'}</a>
    <div class="cabecalho"><h1>${editando ? 'Editar cadastro' : 'Cadastrar pessoa'}</h1></div>
    <form class="painel" id="f" novalidate><div class="painel-corpo">
      <div class="form">
        <div class="full" style="display:flex;gap:16px;align-items:center">
          <span id="prev">${foto(p.nome || '', fotoAtual, 'g')}</span>
          <div style="display:grid;gap:4px">
            <label class="link-btn" for="arquivo" style="cursor:pointer">${fotoAtual ? 'Trocar foto' : 'Adicionar foto'}</label>
            <input type="file" id="arquivo" accept="image/*" hidden>
            <button type="button" class="link-btn danger ${fotoAtual ? '' : 'hidden'}" id="tirar" style="text-align:left">Remover foto</button>
            <span class="hint">Opcional</span>
          </div>
        </div>

        <div class="field"><label for="nome">Nome *</label><input class="input" id="nome" value="${v('nome')}" required></div>
        <div class="field"><label for="ref">Referência</label><input class="input" id="ref" value="${v('referencia')}" placeholder="Ex.: namorada do Paulo, amigo do Lucas"></div>
        <div class="field full"><span class="label">Situação</span>
          <div class="situacoes">${SITUACOES.map((s) => `<label style="--c:${s.cor}"><input type="radio" name="tipo" value="${s.id}" ${p.tipo === s.id ? 'checked' : ''}>${s.nome}</label>`).join('')}</div></div>
        <div class="field"><label for="nasc">Data de nascimento</label><input class="input" type="date" id="nasc" value="${v('data_nascimento')}" max="${hojeISO()}"></div>
        <div class="field"><label for="sexo">Sexo</label><select class="input" id="sexo"><option value=""></option>
          <option value="M" ${p.sexo === 'M' ? 'selected' : ''}>Masculino</option><option value="F" ${p.sexo === 'F' ? 'selected' : ''}>Feminino</option></select></div>

        <div class="form-section">Contato</div>
        <div class="field"><label for="tel">WhatsApp</label><input class="input" id="tel" type="tel" inputmode="tel" value="${esc(fmtTel(p.telefone))}" placeholder="(51) 99999-9999"></div>
        <div class="field"><label for="insta">Instagram</label><input class="input" id="insta" value="${v('instagram')}" placeholder="@usuario"></div>
        <div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" value="${v('email')}"></div>
        <div class="field"><label for="end">Bairro / endereço</label><input class="input" id="end" value="${v('endereco')}"></div>

        <div class="form-section">Caminhada no Hype</div>
        <div class="field full"><span class="label">Ministérios em que serve</span>
          <div class="tags-check">${ministerios.filter((m) => m.cd_status || p.ministerios.includes(m.id)).map((m) => `<label><input type="checkbox" name="min" value="${m.id}" ${p.ministerios.includes(m.id) ? 'checked' : ''}>${esc(m.nome)}</label>`).join('') || '<span class="hint">Nenhum ministério cadastrado.</span>'}</div></div>
        <div class="field"><label for="cultivo">Participa de grupo cultivo?</label><input class="input" id="cultivo" value="${v('grupo_cultivo')}" placeholder="Qual grupo, ou Não"></div>
        <div class="field"><label for="disc">É discipulado ou evangelizado? Por quem?</label><input class="input" id="disc" value="${v('discipulado_por')}"></div>
        <div class="field"><label for="batizado">É batizado(a)?</label><select class="input" id="batizado">
          <option value="" ${p.batizado === null || p.batizado === undefined ? 'selected' : ''}>Não informado</option>
          <option value="sim" ${p.batizado === true || p.batizado === 1 ? 'selected' : ''}>Sim</option>
          <option value="nao" ${p.batizado === false || p.batizado === 0 ? 'selected' : ''}>Não</option></select></div>
        <div class="field"><label for="batdet">Detalhe do batismo</label><input class="input" id="batdet" value="${v('batismo_detalhe')}" placeholder="Ex.: na Assembleia, quando criança"></div>
        <div class="field"><label for="integrou">Quem integrou</label><input class="input" id="integrou" value="${v('integrado_por')}"></div>
        <div class="field"><label for="cad">Data do cadastro</label><input class="input" type="date" id="cad" value="${v('data_cadastro')}"></div>
        <div class="field full"><label for="conheceu">Como conheceu a igreja?</label><textarea class="input" id="conheceu" style="min-height:60px">${v('como_conheceu')}</textarea></div>
        ${editando ? `<div class="field full"><label class="check"><input type="checkbox" id="ativo" ${p.cd_status ? 'checked' : ''}>Cadastro ativo <span class="hint">(desmarque para tirar das listas sem apagar o histórico)</span></label></div>` : ''}

        <div class="form-section">Observações</div>
        <div class="field full"><textarea class="input" id="obs" style="min-height:120px" placeholder="Como foi a conversa, pedidos de oração, informações importantes...">${v('observacoes')}</textarea></div>
      </div>
    </div>
    <div class="barra-salvar">
      ${editando && pode('pessoas.excluir') ? '<button type="button" class="link-btn danger" id="excluir">Excluir cadastro</button>' : '<span></span>'}
      <div style="display:flex;gap:8px"><a class="btn" href="${voltar}">Cancelar</a><button class="btn primary" type="submit">Salvar</button></div>
    </div></form>`;

  const mostrar = (url) => { $('#prev').innerHTML = foto($('#nome').value || '', url, 'g'); };
  $('#arquivo').addEventListener('change', async (e) => {
    const arq = e.target.files[0]; if (!arq) return;
    try { novaFoto = await prepararFoto(arq); removerFoto = false; mostrar(novaFoto); $('#tirar').classList.remove('hidden'); } catch (err) { avisoErro(err); }
  });
  $('#tirar').addEventListener('click', () => { novaFoto = null; removerFoto = true; $('#arquivo').value = ''; mostrar(null); $('#tirar').classList.add('hidden'); });
  $('#excluir')?.addEventListener('click', async () => {
    if (!(await confirmar(`Excluir ${p.nome}? O histórico de presença dessa pessoa também será apagado. Se a pessoa só parou de vir, prefira mudar a situação para Ex-visitante ou desmarcar "Cadastro ativo".`, { botao: 'Excluir', perigo: true }))) return;
    try { await api('DELETE', `/pessoas/${id}`); aviso('Cadastro excluído.'); navegar('/pessoas'); } catch (err) { avisoErro(err); }
  });

  formatarAoSair($('#tel'));
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#nome').value.trim();
    if (nome.length < 2) { aviso('Informe o nome.', 'erro'); $('#nome').focus(); return; }
    const corpo = {
      nome, referencia: $('#ref').value, tipo: $('input[name=tipo]:checked')?.value,
      data_nascimento: $('#nasc').value || null, sexo: $('#sexo').value || null,
      telefone: $('#tel').value, email: $('#email').value, instagram: $('#insta').value, endereco: $('#end').value,
      grupo_cultivo: $('#cultivo').value, discipulado_por: $('#disc').value, batizado: $('#batizado').value || null,
      batismo_detalhe: $('#batdet').value, integrado_por: $('#integrou').value,
      como_conheceu: $('#conheceu').value, data_cadastro: $('#cad').value || hojeISO(), observacoes: $('#obs').value,
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
const JORNADA = ['novo_visitante', 'visitante_regular', 'novo_membro', 'membro', 'membro_ativo'];
const AREA = { pastoral: 'Pastoral', integracao: 'Integração' };
const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído' };

export async function perfil(conteudo, { id }) {
  const [{ pessoa: p, historico, casos, areas }, ministerios] = await Promise.all([api('GET', `/pessoas/${id}`), api('GET', '/ministerios')]);
  const nomeMin = Object.fromEntries(ministerios.map((m) => [m.id, m.nome]));
  const presencas = historico.filter((h) => h.presente).length;
  let seguidas = 0; for (const h of historico) { if (h.presente) break; seguidas++; }
  let sequencia = 0; for (const h of historico) { if (!h.presente) break; sequencia++; }
  const ultimaVezData = historico.find((h) => h.presente)?.data;
  const afastado = !estaNoHype({ ultima_presenca: ultimaVezData, data_cadastro: p.data_cadastro });
  const primeiro = p.nome.split(' ')[0];
  const msg = seguidas >= 2 ? `Oi, ${primeiro}! Tudo bem? Aqui é do Hype. Sentimos sua falta nas últimas sextas, está tudo certo por aí?`
    : `Oi, ${primeiro}! Tudo bem? Aqui é do Hype.`;
  const whats = linkWhats(p.telefone, msg);
  const insta = p.instagram ? `https://instagram.com/${encodeURIComponent(p.instagram.replace(/^@/, '').trim())}` : null;
  const i = idade(p.data_nascimento);
  const campo = (rot, val) => `<div><dt>${rot}</dt><dd>${val || '<span class="muted">—</span>'}</dd></div>`;
  const passo = JORNADA.indexOf(p.tipo);
  const casosAbertos = (casos || []).filter((c) => c.status !== 'concluido');

  conteudo.innerHTML = `
    <a class="voltar" href="#/pessoas">← Pessoas</a>
    <div class="painel ficha-topo" style="--c:${corSituacao(p.tipo)}">
      <div class="perfil-topo">
        ${foto(p.nome, urlFoto(p.id, p.foto_v), 'g')}
        <div style="flex:1;min-width:0">
          <h1>${esc(p.nome)}</h1>
          ${p.referencia ? `<p class="muted" style="margin-top:2px">${esc(p.referencia)}</p>` : ''}
          <div class="tags">${tagTipo(p.tipo)}${p.cd_status ? '' : '<span class="tag bad">Inativo</span>'}${afastado ? `<span class="tag">Afastado: ${minuscula(textoUltimaVez(ultimaVezData))} sem vir</span>` : seguidas >= 2 ? `<span class="tag warn">${seguidas} faltas seguidas</span>` : ''}${sequencia >= 3 ? `<span class="tag ok">${sequencia} sextas seguidas</span>` : ''}</div>
        </div>
        <div class="acoes-ficha">
          ${whats ? `<a class="btn" href="${whats}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${insta ? `<a class="btn" href="${insta}" target="_blank" rel="noopener">Instagram</a>` : ''}
          ${pode('pessoas.editar') ? `<a class="btn primary" href="#/pessoas/${id}/editar">Editar</a>` : ''}
        </div>
      </div>
      <div class="jornada">
        ${JORNADA.map((t, k) => `<div class="${k < passo ? 'feito' : k === passo ? 'atual' : ''}"><i></i><span>${TIPOS[t]}</span></div>`).join('')}
      </div>
      ${p.tipo === 'ex_visitante' ? '<p class="muted small" style="padding:0 20px 16px">Marcado como ex-visitante: parou de vir. Se voltar, é só mudar a situação.</p>' : ''}
    </div>

    <div class="colunas c21 mt">
      <section class="painel"><div class="painel-topo"><h2>Sobre</h2></div><div class="painel-corpo">
        <dl class="campos" style="margin:0">
          ${campo('WhatsApp', esc(fmtTel(p.telefone)))}
          ${campo('Idade', i !== null ? `${i} anos (${fmtData(p.data_nascimento)})` : '')}
          ${campo('Instagram', esc(p.instagram))}
          ${campo('E-mail', esc(p.email))}
          ${campo('Bairro / endereço', esc(p.endereco))}
          ${campo('Ministérios', p.ministerios.map((m) => esc(nomeMin[m])).join(', '))}
          ${campo('Grupo cultivo', esc(p.grupo_cultivo))}
          ${campo('Discipulado / evangelizado por', esc(p.discipulado_por))}
          ${campo('Batizado(a)', [simNao(p.batizado), esc(p.batismo_detalhe)].filter(Boolean).join(' · '))}
          ${campo('Quem integrou', esc(p.integrado_por))}
          ${campo('Cadastrado em', fmtData(p.data_cadastro))}
          ${campo('Sexo', { M: 'Masculino', F: 'Feminino' }[p.sexo])}
        </dl>
        ${p.como_conheceu ? `<hr><dt class="muted small">Como conheceu a igreja</dt><p class="texto-longo">${esc(p.como_conheceu)}</p>` : ''}
        ${p.observacoes ? `<hr><dt class="muted small">Observações</dt><p class="texto-longo">${esc(p.observacoes)}</p>` : ''}
      </div></section>

      <section class="painel"><div class="painel-topo"><h2>Presença</h2></div><div class="painel-corpo">
        ${historico.length ? `
          <p><span class="grande num">${pct(presencas, historico.length)}%</span>
          <span class="muted"> · veio ${presencas} de ${historico.length} sexta${historico.length === 1 ? '' : 's'}</span></p>
          <p class="small muted" style="margin:2px 0 14px">${ultimaVezData ? `Última vez: ${fmtData(ultimaVezData)} (${minuscula(textoUltimaVez(ultimaVezData))})` : 'Ainda não veio a nenhum encontro marcado'}</p>
          <div class="historico">${historico.slice(0, 24).reverse().map((h) => `<i class="${h.presente ? 'p' : 'f'}" title="${fmtData(h.data)}: ${h.presente ? 'veio' : 'faltou'}${h.justificativa ? ' (' + esc(h.justificativa) + ')' : ''}"></i>`).join('')}</div>
          <p class="hint" style="margin-top:8px">${historico.length === 1 ? 'Primeira sexta registrada.' : `Últimas ${Math.min(24, historico.length)} sextas, da mais antiga para a mais recente.`}</p>`
        : '<p class="muted">Sem chamadas registradas ainda.</p>'}
      </div></section>
    </div>

    ${casos ? `<section class="painel mt"><div class="painel-topo"><h2>Acompanhamento</h2>
      <div style="display:flex;gap:14px">${areas.filter((a) => pode(`${a}.editar`) && !casosAbertos.some((c) => c.area === a)).map((a) => `<button class="link-btn" data-novo="${a}">Abrir na ${AREA[a]}</button>`).join('')}</div></div>
      <div class="painel-corpo">
        ${casos.length ? `<table class="tabela"><tbody>${casos.map((c) => `<tr class="clicavel" data-caso="${c.id}" data-area="${c.area}">
          <td><span class="tag">${AREA[c.area]}</span></td>
          <td style="white-space:nowrap"><span class="status-dot st-${c.status}"></span>${STATUS[c.status]}</td><td class="some-mobile">${esc(c.motivo || '')}</td>
          <td class="some-mobile">${esc(c.responsavel_nome)}</td><td class="dir muted small">${c.contatos} contato${c.contatos === 1 ? '' : 's'}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">Nenhum acompanhamento ainda.</p>'}
      </div></section>` : ''}`;

  conteudo.querySelectorAll('[data-novo]').forEach((b) => b.addEventListener('click', () => abrirAcompanhamento({
    area: b.dataset.novo, pessoa: p,
    motivo: b.dataset.novo === 'pastoral' && seguidas >= 2 ? `${seguidas} faltas seguidas` : '',
    depois: () => { atualizarContadores(); perfil(conteudo, { id }); },
  })));
  conteudo.querySelectorAll('[data-caso]').forEach((tr) => tr.addEventListener('click', () => navegar(`/${tr.dataset.area}?caso=${tr.dataset.caso}`)));
}

// ======================= IMPORTAR PLANILHA =======================
function abrirImportacao(depois) {
  let dados = null, mapa = {};
  janela({
    titulo: 'Importar planilha',
    larga: true,
    corpo: `<div id="imp">
      <label class="arquivo" for="imp-arq"><b>Escolha a planilha</b>Excel (.xlsx) ou .csv. A primeira linha precisa ter os títulos das colunas (Nome, Telefone, Nascimento...).</label>
      <input type="file" id="imp-arq" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
      <p class="hint" style="margin-top:12px">Nada é gravado antes de você conferir a prévia e clicar em Importar.</p>
    </div>`,
    aoAbrir: (j, fechar) => {
      const area = j.querySelector('#imp');
      j.querySelector('#imp-arq').addEventListener('change', async (e) => {
        const arq = e.target.files[0]; if (!arq) return;
        area.innerHTML = '<div class="boot" style="min-height:120px"><span class="spin"></span></div>';
        try { dados = await lerPlanilha(arq); mapa = mapearAutomatico(dados.titulos); mostrarMapa(arq.name); }
        catch (err) { area.innerHTML = `<div class="msg erro">${esc(err.message)}</div>`; }
      });

      const mostrarMapa = (nomeArquivo) => {
        area.innerHTML = `
          <p style="margin-bottom:14px"><b>${esc(nomeArquivo)}</b> · ${dados.linhas.length} linha${dados.linhas.length === 1 ? '' : 's'} encontrada${dados.linhas.length === 1 ? '' : 's'}.
          Confira de qual coluna vem cada informação:</p>
          <div class="mapa">${CAMPOS.map((c) => `<div class="field"><label>${c.rotulo}</label>
            <select class="input" data-campo="${c.campo}"><option value="-1">— não importar —</option>
            ${dados.titulos.map((t, i) => `<option value="${i}" ${mapa[c.campo] === i ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`).join('')}
            <div class="field"><label>Quem não tiver tipo informado entra como</label>
              <select class="input" id="imp-tipo">${SITUACOES.map((s) => `<option value="${s.id}">${s.nome}</option>`).join('')}</select></div>
          </div>
          <label class="check" style="margin-top:14px"><input type="checkbox" id="imp-pular" checked>Pular quem já está cadastrado (mesmo nome)</label>
          <h3 style="margin:18px 0 8px">Prévia</h3>
          <div id="imp-previa"></div>
          <div class="janela-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn primary" id="imp-ok">Importar</button></div>`;
        area.querySelectorAll('select[data-campo]').forEach((sel) => sel.addEventListener('change', () => { mapa[sel.dataset.campo] = Number(sel.value); previa(); }));
        area.querySelector('#imp-tipo').addEventListener('change', previa);
        area.querySelector('[data-fechar]').addEventListener('click', fechar);
        area.querySelector('#imp-ok').addEventListener('click', importar);
        previa();
      };

      const montarTodas = () => {
        const tipoPadrao = area.querySelector('#imp-tipo').value;
        const vistos = new Set();
        const pessoas = [];
        let semNome = 0, repetidasNoArquivo = 0, datasRuins = 0;
        for (const l of dados.linhas) {
          const p = montarPessoa(l, mapa, { tipoPadrao });
          if (p.nome.length < 2) { semNome++; continue; }
          const k = semAcento(p.nome);
          if (vistos.has(k)) { repetidasNoArquivo++; continue; }
          vistos.add(k);
          if (p._dataOriginal && !p.data_nascimento) datasRuins++;
          pessoas.push(p);
        }
        return { pessoas, semNome, repetidasNoArquivo, datasRuins };
      };

      const previa = () => {
        if (!(mapa.nome >= 0)) { area.querySelector('#imp-previa').innerHTML = '<div class="msg erro">Escolha a coluna do Nome para continuar.</div>'; area.querySelector('#imp-ok').disabled = true; return; }
        area.querySelector('#imp-ok').disabled = false;
        const { pessoas, semNome, repetidasNoArquivo, datasRuins } = montarTodas();
        const avisos = [
          semNome && `${semNome} linha${semNome > 1 ? 's' : ''} sem nome ser${semNome > 1 ? 'ão' : 'á'} ignorada${semNome > 1 ? 's' : ''}`,
          repetidasNoArquivo && `${repetidasNoArquivo} nome${repetidasNoArquivo > 1 ? 's aparecem' : ' aparece'} repetido na planilha (entra só uma vez)`,
          datasRuins && `${datasRuins} data${datasRuins > 1 ? 's' : ''} de nascimento não ${datasRuins > 1 ? 'foram entendidas' : 'foi entendida'} e ficar${datasRuins > 1 ? 'ão' : 'á'} em branco`,
        ].filter(Boolean);
        area.querySelector('#imp-previa').innerHTML = `
          ${avisos.length ? `<div class="msg aviso" style="margin-bottom:10px">${avisos.join('<br>')}</div>` : ''}
          <div class="previa"><table class="tabela"><thead><tr><th>Nome</th><th>Tipo</th><th>Nascimento</th><th>Telefone</th><th>Ministérios</th></tr></thead><tbody>
          ${pessoas.slice(0, 8).map((p) => `<tr><td>${esc(p.nome)}</td><td>${tagTipo(p.tipo)}</td>
            <td>${p.data_nascimento ? fmtData(p.data_nascimento) : (p._dataOriginal ? `<span class="tag warn">${esc(p._dataOriginal)}?</span>` : '')}</td>
            <td>${esc(fmtTel(p.telefone))}</td><td>${esc(p.ministerios_nomes)}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="hint" style="margin-top:6px">${pessoas.length} pessoa${pessoas.length === 1 ? '' : 's'} pronta${pessoas.length === 1 ? '' : 's'} para importar${pessoas.length > 8 ? ' (mostrando as 8 primeiras)' : ''}.</p>`;
      };

      const importar = async (e) => {
        const { pessoas } = montarTodas();
        if (!pessoas.length) return aviso('Nenhuma pessoa com nome para importar.', 'erro');
        const pular = area.querySelector('#imp-pular').checked;
        await ocupado(e.currentTarget, async () => {
          const total = { importadas: 0, repetidas: 0, invalidas: 0, ministerios: new Set() };
          try {
            for (let i = 0; i < pessoas.length; i += 300) {
              const r = await api('POST', '/pessoas/importar', { pessoas: pessoas.slice(i, i + 300).map(({ _dataOriginal, ...p }) => p), pularRepetidos: pular });
              total.importadas += r.importadas; total.repetidas += r.repetidas; total.invalidas += r.invalidas;
              r.ministeriosNaoEncontrados.forEach((m) => total.ministerios.add(m));
            }
            area.innerHTML = `<div class="msg ok"><b>${total.importadas} pessoa${total.importadas === 1 ? '' : 's'} importada${total.importadas === 1 ? '' : 's'}.</b>
              ${total.repetidas ? `<br>${total.repetidas} já estava${total.repetidas === 1 ? '' : 'm'} cadastrada${total.repetidas === 1 ? '' : 's'} e ${total.repetidas === 1 ? 'foi pulada' : 'foram puladas'}.` : ''}</div>
              ${total.ministerios.size ? `<div class="msg aviso" style="margin-top:10px">Estes ministérios da planilha não existem no sistema e foram ignorados: ${[...total.ministerios].map(esc).join(', ')}. Cadastre-os em Ministérios se quiser e ajuste as pessoas depois.</div>` : ''}
              <div class="janela-acoes"><button class="btn primary" data-fechar>Ver pessoas</button></div>`;
            area.querySelector('[data-fechar]').addEventListener('click', () => { fechar(); depois?.(); });
          } catch (err) { avisoErro(err); }
        });
      };
    },
  });
}
