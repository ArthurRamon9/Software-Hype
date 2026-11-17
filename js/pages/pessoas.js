// Pessoas: lista, cadastro/edição e perfil
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { sb, ok, urlsFotos, limparCacheFoto, isAdmin } from '../supabase.js';
import {
  icon, esc, $, $$, toast, toastErro, carregando, confirmar, avatar, badgeTipo, TIPOS,
  idade, fmtData, hojeISO, comprimirImagem, baixarCSV, pct, tempoRelativo,
} from '../ui.js';
import { navegar, atualizarBadges } from '../app.js';
import { abrirCaso } from './pastoral.js';

export async function carregarMinisterios(soAtivos = true) {
  let q = sb.from('ministerios').select('*').order('nome');
  if (soAtivos) q = q.eq('cd_status', 1);
  return ok(await q);
}

// ======================= LISTA =======================
const filtros = { busca: '', tipo: '', status: '1', ministerio: '' };

export async function lista(content) {
  const [pessoas, ministerios] = await Promise.all([
    ok(await sb.from('pessoas').select('id,nome,data_nascimento,telefone,email,tipo,foto_path,cd_status,data_cadastro,batizado,pessoa_ministerio(ministerio_id)').order('nome')),
    carregarMinisterios(false),
  ]);
  const minMap = Object.fromEntries(ministerios.map((m) => [m.id, m]));
  const fotos = await urlsFotos(pessoas.map((p) => p.foto_path));

  content.innerHTML = `
    <div class="page-head">
      <div><h1>Pessoas</h1><p>Todos os jovens cadastrados no Hype.</p></div>
      <div class="actions">
        <button class="btn btn-ghost" id="csv">${icon('download')} Exportar</button>
        <a class="btn btn-primary" href="#/pessoas/nova">${icon('userPlus')} Nova pessoa</a>
      </div>
    </div>
    <div class="toolbar">
      <div class="input-wrap grow">${icon('search')}<input class="input" id="busca" placeholder="Buscar por nome, telefone ou e-mail..." value="${esc(filtros.busca)}"></div>
      <select class="input" id="f-tipo" style="width:auto">
        <option value="">Todos os tipos</option>
        ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${filtros.tipo === k ? 'selected' : ''}>${v}s</option>`).join('')}
      </select>
      <select class="input" id="f-min" style="width:auto">
        <option value="">Todos os ministérios</option>
        ${ministerios.map((m) => `<option value="${m.id}" ${String(filtros.ministerio) === String(m.id) ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
      </select>
      <div class="seg" id="f-status">
        <button data-v="1" class="${filtros.status === '1' ? 'active' : ''}">Ativos</button>
        <button data-v="0" class="${filtros.status === '0' ? 'active' : ''}">Inativos</button>
        <button data-v="" class="${filtros.status === '' ? 'active' : ''}">Todos</button>
      </div>
    </div>
    <p class="muted small" id="contagem" style="margin:-4px 0 12px"></p>
    <div class="people" id="grid"></div>`;

  const filtrar = () => {
    const b = filtros.busca.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return pessoas.filter((p) => {
      if (filtros.status !== '' && String(p.cd_status) !== filtros.status) return false;
      if (filtros.tipo && p.tipo !== filtros.tipo) return false;
      if (filtros.ministerio && !p.pessoa_ministerio.some((x) => String(x.ministerio_id) === String(filtros.ministerio))) return false;
      if (b) {
        const alvo = `${p.nome} ${p.telefone || ''} ${p.email || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (!alvo.includes(b)) return false;
      }
      return true;
    });
  };

  const desenhar = () => {
    const lista = filtrar();
    $('#contagem').textContent = `${lista.length} ${lista.length === 1 ? 'pessoa' : 'pessoas'}`;
    $('#grid').innerHTML = lista.length ? lista.map((p) => {
      const i = idade(p.data_nascimento);
      const mins = p.pessoa_ministerio.map((x) => minMap[x.ministerio_id]?.nome).filter(Boolean);
      return `<a class="person ${p.cd_status ? '' : 'inativo'}" href="#/pessoas/${p.id}">
        ${avatar(p.nome, fotos[p.foto_path])}
        <div class="info"><b>${esc(p.nome)}</b>
          <div class="meta">${badgeTipo(p.tipo)}${i !== null ? `<span>${i} anos</span>` : ''}${p.cd_status ? '' : '<span class="badge bad">Inativo</span>'}</div>
          ${mins.length ? `<div class="meta">${mins.map(esc).join(' · ')}</div>` : ''}
        </div></a>`;
    }).join('') : `<div class="card empty" style="grid-column:1/-1">${icon('users')}<p>Nenhuma pessoa encontrada.</p>
      <a class="btn btn-primary" href="#/pessoas/nova">${icon('plus')} Cadastrar pessoa</a></div>`;
  };
  desenhar();

  $('#busca').addEventListener('input', (e) => { filtros.busca = e.target.value; desenhar(); });
  $('#f-tipo').addEventListener('change', (e) => { filtros.tipo = e.target.value; desenhar(); });
  $('#f-min').addEventListener('change', (e) => { filtros.ministerio = e.target.value; desenhar(); });
  $$('#f-status button').forEach((b) => b.addEventListener('click', () => {
    filtros.status = b.dataset.v;
    $$('#f-status button').forEach((x) => x.classList.toggle('active', x === b));
    desenhar();
  }));
  $('#csv').addEventListener('click', () => {
    const linhas = [['Nome', 'Tipo', 'Idade', 'Nascimento', 'Telefone', 'E-mail', 'Batizado', 'Ministérios', 'Status', 'Cadastro']];
    filtrar().forEach((p) => linhas.push([
      p.nome, TIPOS[p.tipo], idade(p.data_nascimento) ?? '', fmtData(p.data_nascimento), p.telefone, p.email,
      p.batizado ? 'Sim' : 'Não', p.pessoa_ministerio.map((x) => minMap[x.ministerio_id]?.nome).join(', '),
      p.cd_status ? 'Ativo' : 'Inativo', fmtData(p.data_cadastro),
    ]));
    baixarCSV(`pessoas-hype-${hojeISO()}.csv`, linhas);
  });
}

// ======================= FORMULÁRIO =======================
export async function form(content, { id } = {}) {
  const editando = !!id;
  const [ministerios, pessoa] = await Promise.all([
    carregarMinisterios(),
    editando ? ok(await sb.from('pessoas').select('*, pessoa_ministerio(ministerio_id)').eq('id', id).single()) : null,
  ]);
  const p = pessoa || { tipo: 'visitante', cd_status: 1, data_cadastro: hojeISO(), pessoa_ministerio: [] };
  const meusMin = new Set(p.pessoa_ministerio.map((x) => x.ministerio_id));
  const fotoAtual = p.foto_path ? (await urlsFotos([p.foto_path]))[p.foto_path] : null;
  let novaFoto = null, removerFoto = false;

  const v = (k) => esc(p[k] ?? '');
  content.innerHTML = `
    <div class="page-head">
      <div><a href="#/pessoas${editando ? '/' + id : ''}" class="small" style="display:inline-flex;gap:6px;align-items:center">${icon('arrowLeft')} Voltar</a>
      <h1 style="margin-top:6px">${editando ? 'Editar cadastro' : 'Nova pessoa'}</h1></div>
    </div>
    <form id="f" class="card" novalidate>
      <div class="photo-pick" style="margin-bottom:22px">
        <div id="prev">${avatar(p.nome || '?', fotoAtual, 'lg')}</div>
        <div style="display:grid;gap:8px">
          <label class="btn btn-ghost btn-sm" for="foto">${icon('camera')} ${fotoAtual ? 'Trocar foto' : 'Adicionar foto'}</label>
          <input type="file" id="foto" accept="image/*">
          <button type="button" class="btn btn-ghost btn-sm ${fotoAtual ? '' : 'hidden'}" id="rm-foto">${icon('trash')} Remover foto</button>
          <span class="muted small">Opcional · JPG ou PNG</span>
        </div>
      </div>

      <div class="form-grid">
        <div class="field full"><label for="nome">Nome completo *</label><input class="input" id="nome" required value="${v('nome')}" placeholder="Nome e sobrenome"></div>

        <div class="field full"><label>Tipo *</label>
          <div class="seg">${Object.entries(TIPOS).map(([k, t]) => `<label><input type="radio" name="tipo" value="${k}" ${p.tipo === k ? 'checked' : ''}>${t}</label>`).join('')}</div>
        </div>

        <div class="field"><label for="nasc">Data de nascimento</label><input class="input" type="date" id="nasc" value="${v('data_nascimento')}" max="${hojeISO()}"></div>
        <div class="field"><label for="sexo">Sexo</label>
          <select class="input" id="sexo"><option value="">—</option>
            <option value="M" ${p.sexo === 'M' ? 'selected' : ''}>Masculino</option>
            <option value="F" ${p.sexo === 'F' ? 'selected' : ''}>Feminino</option></select></div>

        <div class="field"><label for="tel">Telefone / WhatsApp</label><input class="input" id="tel" type="tel" inputmode="tel" value="${v('telefone')}" placeholder="(00) 00000-0000"></div>
        <div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" value="${v('email')}" placeholder="opcional"></div>

        <div class="field"><label for="insta">Instagram</label><input class="input" id="insta" value="${v('instagram')}" placeholder="@usuario"></div>
        <div class="field"><label for="cad">Data de cadastro</label><input class="input" type="date" id="cad" value="${v('data_cadastro')}"></div>

        <div class="field full"><label for="end">Endereço / bairro</label><input class="input" id="end" value="${v('endereco')}"></div>

        <div class="field full"><label>Ministérios em que serve</label>
          <div class="chips-select">${ministerios.length ? ministerios.map((m) => `<label><input type="checkbox" name="min" value="${m.id}" ${meusMin.has(m.id) ? 'checked' : ''}><span class="dot" style="background:${esc(m.cor)}"></span>${esc(m.nome)}</label>`).join('') : '<span class="muted small">Nenhum ministério cadastrado.</span>'}</div>
        </div>

        <div class="field"><label for="conheceu">Como conheceu o Hype?</label><input class="input" id="conheceu" value="${v('como_conheceu')}" placeholder="Ex.: convite de amigo"></div>
        <div class="field" style="justify-content:flex-end;gap:12px">
          <label class="check"><input type="checkbox" id="batizado" ${p.batizado ? 'checked' : ''}> É batizado(a)</label>
          ${editando ? `<label class="check"><input type="checkbox" id="ativo" ${p.cd_status ? 'checked' : ''}> Cadastro ativo</label>` : ''}
        </div>

        <div class="field full"><label for="obs">Observações</label><textarea class="input" id="obs" placeholder="Pedidos de oração, informações importantes...">${v('observacoes')}</textarea></div>
      </div>

      <div class="modal-actions" style="margin-top:24px">
        <a class="btn btn-ghost" href="#/pessoas${editando ? '/' + id : ''}">Cancelar</a>
        <button class="btn btn-primary" type="submit">${icon('check')} ${editando ? 'Salvar alterações' : 'Cadastrar'}</button>
      </div>
    </form>`;

  const atualizarPreview = (url) => { $('#prev').innerHTML = avatar($('#nome').value || '?', url, 'lg'); };
  $('#nome').addEventListener('input', () => { if (!novaFoto && (removerFoto || !fotoAtual)) atualizarPreview(null); });
  $('#foto').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      novaFoto = await comprimirImagem(file);
      removerFoto = false;
      atualizarPreview(URL.createObjectURL(novaFoto));
      $('#rm-foto').classList.remove('hidden');
    } catch (err) { toastErro(err); }
  });
  $('#rm-foto').addEventListener('click', () => {
    novaFoto = null; removerFoto = true; $('#foto').value = '';
    atualizarPreview(null); $('#rm-foto').classList.add('hidden');
  });

  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#nome').value.trim();
    if (nome.length < 2) { toast('Informe o nome.', 'bad'); $('#nome').focus(); return; }
    const dados = {
      nome,
      tipo: $('input[name=tipo]:checked')?.value || 'visitante',
      data_nascimento: $('#nasc').value || null,
      sexo: $('#sexo').value || null,
      telefone: $('#tel').value.trim() || null,
      email: $('#email').value.trim() || null,
      instagram: $('#insta').value.trim() || null,
      endereco: $('#end').value.trim() || null,
      data_cadastro: $('#cad').value || hojeISO(),
      como_conheceu: $('#conheceu').value.trim() || null,
      batizado: $('#batizado').checked,
      observacoes: $('#obs').value.trim() || null,
    };
    if (editando) dados.cd_status = $('#ativo').checked ? 1 : 0;
    const mins = $$('input[name=min]:checked').map((c) => Number(c.value));

    await carregando($('#f button[type=submit]'), async () => {
      try {
        let pid = id;
        if (editando) ok(await sb.from('pessoas').update(dados).eq('id', id));
        else pid = ok(await sb.from('pessoas').insert(dados).select('id').single()).id;

        // Foto
        if (novaFoto) {
          const caminho = `pessoas/${pid}-${Date.now()}.jpg`;
          const up = await sb.storage.from('fotos').upload(caminho, novaFoto, { contentType: 'image/jpeg', upsert: true });
          if (up.error) throw new Error('Cadastro salvo, mas a foto não foi enviada: ' + up.error.message);
          ok(await sb.from('pessoas').update({ foto_path: caminho }).eq('id', pid));
          if (p.foto_path) { await sb.storage.from('fotos').remove([p.foto_path]); limparCacheFoto(p.foto_path); }
        } else if (removerFoto && p.foto_path) {
          await sb.storage.from('fotos').remove([p.foto_path]);
          limparCacheFoto(p.foto_path);
          ok(await sb.from('pessoas').update({ foto_path: null }).eq('id', pid));
        }

        // Ministérios
        ok(await sb.from('pessoa_ministerio').delete().eq('pessoa_id', pid));
        if (mins.length) ok(await sb.from('pessoa_ministerio').insert(mins.map((m) => ({ pessoa_id: pid, ministerio_id: m }))));

        toast(editando ? 'Cadastro atualizado!' : `${nome.split(' ')[0]} cadastrado(a) com sucesso!`);
        navegar(`/pessoas/${pid}`);
      } catch (err) { toastErro(err); }
    });
  });
}

// ======================= PERFIL =======================
export async function perfil(content, { id }) {
  const [p, presencas, casos, ministerios] = await Promise.all([
    ok(await sb.from('pessoas').select('*, pessoa_ministerio(ministerio_id)').eq('id', id).single()),
    ok(await sb.from('presencas').select('presente, justificativa, encontros(id,data,tema)').eq('pessoa_id', id)),
    ok(await sb.from('pastoral_casos').select('*').eq('pessoa_id', id).order('aberto_em', { ascending: false })),
    carregarMinisterios(false),
  ]);
  const foto = p.foto_path ? (await urlsFotos([p.foto_path]))[p.foto_path] : null;
  const minMap = Object.fromEntries(ministerios.map((m) => [m.id, m]));
  const hist = presencas.filter((x) => x.encontros).sort((a, b) => b.encontros.data.localeCompare(a.encontros.data));
  const ult = hist.slice(0, 16);
  const presentes = hist.filter((x) => x.presente).length;
  const ultimaPresenca = hist.find((x) => x.presente)?.encontros.data;
  let seguidas = 0; for (const h of hist) { if (h.presente) break; seguidas++; }
  const i = idade(p.data_nascimento);
  const tel = (p.telefone || '').replace(/\D/g, '');
  const info = (l, val) => `<div><span>${l}</span><b>${val || '—'}</b></div>`;

  content.innerHTML = `
    <div class="page-head">
      <div><a href="#/pessoas" class="small" style="display:inline-flex;gap:6px;align-items:center">${icon('arrowLeft')} Pessoas</a></div>
      <div class="actions">
        ${tel ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/${tel.length <= 11 ? '55' + tel : tel}">${icon('message')} WhatsApp</a>` : ''}
        <button class="btn btn-ghost" id="pastoral">${icon('heart')} Pastoral</button>
        <a class="btn btn-primary" href="#/pessoas/${id}/editar">${icon('edit')} Editar</a>
      </div>
    </div>

    <div class="card">
      <div class="profile-head">
        ${avatar(p.nome, foto, 'lg')}
        <div class="info">
          <h1>${esc(p.nome)}</h1>
          <div class="tags">${badgeTipo(p.tipo)}
            ${p.cd_status ? '<span class="badge ok">Ativo</span>' : '<span class="badge bad">Inativo</span>'}
            ${p.batizado ? '<span class="badge">Batizado(a)</span>' : ''}
            ${seguidas >= 2 ? `<span class="badge warn">${icon('alert')} ${seguidas} faltas seguidas</span>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-2-1 mt">
      <div class="card">
        <h2 style="margin-bottom:16px">Informações</h2>
        <div class="dl">
          ${info('Idade', i !== null ? `${i} anos` : '')}
          ${info('Nascimento', p.data_nascimento ? fmtData(p.data_nascimento) : '')}
          ${info('Telefone', esc(p.telefone))}
          ${info('E-mail', esc(p.email))}
          ${info('Instagram', esc(p.instagram))}
          ${info('Sexo', p.sexo === 'M' ? 'Masculino' : p.sexo === 'F' ? 'Feminino' : '')}
          ${info('Endereço', esc(p.endereco))}
          ${info('Como conheceu', esc(p.como_conheceu))}
          ${info('Cadastrado em', fmtData(p.data_cadastro))}
          ${info('Ministérios', p.pessoa_ministerio.map((x) => esc(minMap[x.ministerio_id]?.nome)).join(', '))}
        </div>
        ${p.observacoes ? `<div style="margin-top:18px"><span class="muted small" style="font-weight:600">OBSERVAÇÕES</span><p style="margin:4px 0 0;white-space:pre-wrap">${esc(p.observacoes)}</p></div>` : ''}
      </div>

      <div class="grid" style="align-content:start">
        <div class="card stat">
          <div class="label"><span class="ic">${icon('checkSquare')}</span>Frequência geral</div>
          <div class="value">${hist.length ? pct(presentes, hist.length) + '%' : '—'}</div>
          <div class="foot">${presentes} presenças em ${hist.length} encontros${ultimaPresenca ? ` · última em ${fmtData(ultimaPresenca)}` : ''}</div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:10px">Últimos encontros</h3>
          ${ult.length ? `<div class="hist">${ult.slice().reverse().map((h) => `<i class="${h.presente ? 'p' : 'f'}" title="${fmtData(h.encontros.data)} — ${h.presente ? 'Presente' : 'Falta'}${h.justificativa ? ': ' + esc(h.justificativa) : ''}">${h.presente ? 'P' : 'F'}</i>`).join('')}</div>
            <p class="muted small" style="margin:8px 0 0">Mais antigo → mais recente. P = presente, F = falta.</p>` : '<p class="muted small">Sem registros de presença ainda.</p>'}
        </div>
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h2>Acompanhamento pastoral</h2></div>
      ${casos.length ? `<div class="list">${casos.map((c) => `
        <div class="list-item"><span class="dot" style="background:${c.status === 'concluido' ? 'var(--ok)' : c.status === 'em_andamento' ? 'var(--warn)' : 'var(--bad)'}"></span>
          <div class="grow"><b>${esc(c.motivo || 'Acompanhamento')}</b><span>Responsável: ${esc(c.responsavel_nome)} · aberto ${tempoRelativo(c.aberto_em)}</span></div>
          <span class="badge">${{ aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído' }[c.status]}</span></div>`).join('')}</div>`
        : '<p class="muted small" style="margin:0">Nenhum acompanhamento registrado.</p>'}
    </div>

    ${isAdmin() ? `<div class="card mt" style="border-color:#f4c6c6">
      <div class="card-head" style="margin:0"><div><h3>Zona de cuidado</h3><p>Prefira inativar. Excluir apaga também o histórico de presença.</p></div>
      <button class="btn btn-danger btn-sm" id="excluir">${icon('trash')} Excluir</button></div></div>` : ''}`;

  $('#pastoral').addEventListener('click', () => abrirCaso({ pessoa: p, motivo: seguidas >= 2 ? `${seguidas} faltas seguidas` : '', aoSalvar: () => { atualizarBadges(); perfil(content, { id }); } }));
  $('#excluir')?.addEventListener('click', async () => {
    if (!(await confirmar(`Excluir definitivamente ${p.nome}? Essa ação não pode ser desfeita.`, { ok: 'Excluir', perigo: true }))) return;
    try {
      if (p.foto_path) await sb.storage.from('fotos').remove([p.foto_path]);
      ok(await sb.from('pessoas').delete().eq('id', id));
      toast('Cadastro excluído.');
      navegar('/pessoas');
    } catch (e) { toastErro(e); }
  });
}
