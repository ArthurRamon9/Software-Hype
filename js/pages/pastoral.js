// Pastoral: cuidado com os jovens faltantes
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { sb, ok, store, urlsFotos, isAdmin } from '../supabase.js';
import { icon, esc, $, toast, toastErro, carregando, modal, confirmar, avatar, badgeTipo, fmtData, tempoRelativo } from '../ui.js';
import { FALTAS_ALERTA } from '../config.js';
import { atualizarBadges } from '../app.js';

const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído' };

// Jovens ativos com N+ faltas seguidas (nos encontros mais recentes) e sem caso aberto
export async function calcularAlertas() {
  const encontros = ok(await sb.from('encontros').select('id,data').order('data', { ascending: false }).limit(10));
  if (!encontros.length) return [];
  const ids = encontros.map((e) => e.id);
  const [pres, pessoas, casos] = await Promise.all([
    ok(await sb.from('presencas').select('encontro_id,pessoa_id,presente').in('encontro_id', ids)),
    ok(await sb.from('pessoas').select('id,nome,tipo,foto_path,telefone').eq('cd_status', 1)),
    ok(await sb.from('pastoral_casos').select('pessoa_id').neq('status', 'concluido')),
  ]);
  const comCaso = new Set(casos.map((c) => c.pessoa_id));
  const reg = new Map(pres.map((r) => [`${r.encontro_id}-${r.pessoa_id}`, r.presente]));
  const out = [];
  for (const p of pessoas) {
    if (comCaso.has(p.id)) continue;
    let faltas = 0, ultimaPresenca = null;
    for (const e of encontros) {
      const v = reg.get(`${e.id}-${p.id}`);
      if (v === undefined) continue;
      if (v) { ultimaPresenca = e.data; break; }
      faltas++;
    }
    if (faltas >= FALTAS_ALERTA) out.push({ pessoa: p, faltas, ultimaPresenca });
  }
  return out.sort((a, b) => b.faltas - a.faltas);
}

async function responsaveisSugeridos() {
  const { data } = await sb.from('profiles').select('id,nome').eq('cd_status', 1).order('nome');
  return data || [];
}

// Modal: abrir acompanhamento para uma pessoa
export async function abrirCaso({ pessoa, motivo = '', aoSalvar }) {
  const perfis = await responsaveisSugeridos();
  modal({
    titulo: 'Novo acompanhamento',
    corpo: `<form id="fc" class="grid" style="gap:14px">
      <div class="list-item" style="padding:0 0 8px">${avatar(pessoa.nome, null, 'sm')}<div class="grow"><b>${esc(pessoa.nome)}</b><span>${badgeTipo(pessoa.tipo)}</span></div></div>
      <div class="field"><label>Responsável (pastor/líder) *</label>
        <input class="input" id="resp" list="lresp" required placeholder="Digite ou escolha um nome">
        <datalist id="lresp">${perfis.map((p) => `<option value="${esc(p.nome)}">`).join('')}</datalist></div>
      <div class="field"><label>Motivo</label><input class="input" id="mot" value="${esc(motivo)}" placeholder="Ex.: 3 faltas seguidas, pedido de oração..."></div>
      <div class="field"><label>Primeira anotação (opcional)</label><textarea class="input" id="nota" placeholder="Contexto, combinados..."></textarea></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">${icon('heart')} Designar</button></div>
    </form>`,
    onOpen: (m, fechar) => {
      m.querySelector('#resp').focus();
      m.querySelector('#fc').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = m.querySelector('#resp').value.trim();
        if (!nome) return toast('Informe o responsável.', 'bad');
        await carregando(e.submitter, async () => {
          try {
            const perfil = perfis.find((p) => p.nome.toLowerCase() === nome.toLowerCase());
            const caso = ok(await sb.from('pastoral_casos').insert({
              pessoa_id: pessoa.id, responsavel_nome: nome, responsavel_id: perfil?.id || null,
              motivo: m.querySelector('#mot').value.trim() || null,
            }).select('id').single());
            const nota = m.querySelector('#nota').value.trim();
            if (nota) ok(await sb.from('pastoral_registros').insert({ caso_id: caso.id, texto: nota, autor_nome: store.profile.nome }));
            toast(`Acompanhamento designado para ${nome}.`);
            fechar(); aoSalvar?.();
          } catch (err) { toastErro(err); }
        });
      });
    },
  });
}

// Modal: detalhes do caso
async function verCaso(id, aoMudar) {
  const [c, regs] = await Promise.all([
    ok(await sb.from('pastoral_casos').select('*, pessoas(id,nome,tipo,telefone,foto_path)').eq('id', id).single()),
    ok(await sb.from('pastoral_registros').select('*').eq('caso_id', id).order('created_at', { ascending: false })),
  ]);
  const foto = c.pessoas.foto_path ? (await urlsFotos([c.pessoas.foto_path]))[c.pessoas.foto_path] : null;
  const tel = (c.pessoas.telefone || '').replace(/\D/g, '');
  modal({
    titulo: 'Acompanhamento',
    wide: true,
    corpo: `
      <div class="profile-head" style="margin-bottom:16px">${avatar(c.pessoas.nome, foto)}
        <div class="info"><h3>${esc(c.pessoas.nome)}</h3><span class="muted small">Responsável: <b>${esc(c.responsavel_nome)}</b> · aberto em ${fmtData(c.aberto_em)}</span></div>
        <div style="display:flex;gap:8px">
          ${tel ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/${tel.length <= 11 ? '55' + tel : tel}">${icon('message')} WhatsApp</a>` : ''}
          <a class="btn btn-ghost btn-sm" href="#/pessoas/${c.pessoas.id}">${icon('user')} Perfil</a>
        </div>
      </div>
      ${c.motivo ? `<div class="notice info" style="margin-bottom:14px">${icon('info')}<span>${esc(c.motivo)}</span></div>` : ''}
      <div class="field" style="margin-bottom:16px"><label>Status</label>
        <div class="seg" id="st">${Object.entries(STATUS).map(([k, v]) => `<button data-v="${k}" class="${c.status === k ? 'active' : ''}">${v}</button>`).join('')}</div></div>
      <form id="fr" class="grid" style="gap:10px">
        <textarea class="input" id="txt" placeholder="Registrar conversa, visita, oração, retorno..." required></textarea>
        <div style="display:flex;justify-content:space-between;gap:10px">
          ${isAdmin() ? `<button type="button" class="btn btn-danger btn-sm" id="del">${icon('trash')} Excluir caso</button>` : '<span></span>'}
          <button class="btn btn-primary btn-sm">${icon('plus')} Adicionar registro</button></div>
      </form>
      <h3 style="margin-top:20px">Histórico</h3>
      <div class="timeline">${regs.length ? regs.map((r) => `<div class="ev"><small>${fmtData(r.created_at)} · ${esc(r.autor_nome || '')}</small>${esc(r.texto).replace(/\n/g, '<br>')}</div>`).join('') : '<p class="muted small" style="margin:0">Nenhum registro ainda.</p>'}</div>`,
    onOpen: (m, fechar) => {
      m.querySelectorAll('#st button').forEach((b) => b.addEventListener('click', async () => {
        try {
          const status = b.dataset.v;
          ok(await sb.from('pastoral_casos').update({ status, concluido_em: status === 'concluido' ? new Date().toISOString() : null }).eq('id', id));
          m.querySelectorAll('#st button').forEach((x) => x.classList.toggle('active', x === b));
          toast(`Status: ${STATUS[status]}`); aoMudar?.(); atualizarBadges();
        } catch (e) { toastErro(e); }
      }));
      m.querySelector('#fr').addEventListener('submit', async (e) => {
        e.preventDefault();
        const texto = m.querySelector('#txt').value.trim(); if (!texto) return;
        await carregando(e.submitter, async () => {
          try {
            ok(await sb.from('pastoral_registros').insert({ caso_id: id, texto, autor_nome: store.profile.nome }));
            if (c.status === 'aberto') ok(await sb.from('pastoral_casos').update({ status: 'em_andamento' }).eq('id', id));
            fechar(); toast('Registro adicionado.'); aoMudar?.(); verCaso(id, aoMudar);
          } catch (err) { toastErro(err); }
        });
      });
      m.querySelector('#del')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar('Excluir este acompanhamento e todo o histórico?', { ok: 'Excluir', perigo: true }))) return;
        try { ok(await sb.from('pastoral_casos').delete().eq('id', id)); toast('Caso excluído.'); aoMudar?.(); atualizarBadges(); } catch (err) { toastErro(err); }
      });
    },
  });
}

export async function render(content) {
  const recarregar = () => render(content);
  const [alertas, casos] = await Promise.all([
    calcularAlertas(),
    ok(await sb.from('pastoral_casos').select('*, pessoas(id,nome,tipo,foto_path)').order('aberto_em', { ascending: false }).limit(200)),
  ]);
  const fotos = await urlsFotos([...alertas.map((a) => a.pessoa.foto_path), ...casos.map((c) => c.pessoas?.foto_path)]);
  const limite = Date.now() - 60 * 86400000;
  const col = (st) => casos.filter((c) => c.status === st && (st !== 'concluido' || new Date(c.concluido_em || c.aberto_em).getTime() > limite));

  const kcard = (c) => `<div class="kcard" data-caso="${c.id}">
    <div class="top">${avatar(c.pessoas?.nome || '?', fotos[c.pessoas?.foto_path], 'sm')}<b>${esc(c.pessoas?.nome)}</b></div>
    ${c.motivo ? `<p>${esc(c.motivo)}</p>` : ''}
    <div class="foot"><span>Resp.: ${esc(c.responsavel_nome)}</span><span>${tempoRelativo(c.aberto_em)}</span></div></div>`;

  content.innerHTML = `
    <div class="page-head"><div><h1>Pastoral</h1><p>Cuidado com quem está faltando. Designe um responsável e registre cada contato.</p></div></div>

    <div class="card" style="margin-bottom:18px">
      <div class="card-head"><div><h2>${icon('alert')} Precisam de atenção</h2><p>Ativos com ${FALTAS_ALERTA}+ faltas seguidas e sem acompanhamento aberto</p></div>
        <span class="badge ${alertas.length ? 'warn' : 'ok'}">${alertas.length}</span></div>
      ${alertas.length ? `<div class="list">${alertas.map((a) => `
        <div class="list-item">${avatar(a.pessoa.nome, fotos[a.pessoa.foto_path])}
          <div class="grow"><b>${esc(a.pessoa.nome)}</b><span>${a.faltas} faltas seguidas${a.ultimaPresenca ? ` · última presença em ${fmtData(a.ultimaPresenca)}` : ''}</span></div>
          <button class="btn btn-primary btn-sm" data-designar="${a.pessoa.id}">${icon('heart')} Designar</button></div>`).join('')}</div>`
        : `<div class="empty" style="padding:18px">${icon('heart')}<p style="margin:0">Ninguém em alerta no momento. Glória a Deus! 🙌</p></div>`}
    </div>

    <div class="kanban">
      ${['aberto', 'em_andamento', 'concluido'].map((st) => {
        const itens = col(st);
        const cor = st === 'aberto' ? 'var(--bad)' : st === 'em_andamento' ? 'var(--warn)' : 'var(--ok)';
        return `<div class="kcol"><h3><span class="dot" style="background:${cor}"></span>${STATUS[st]}<span class="badge" style="margin-left:auto">${itens.length}</span></h3>
          ${itens.map(kcard).join('') || '<p class="muted small" style="margin:0">Nenhum caso.</p>'}
          ${st === 'concluido' ? '<p class="muted small" style="margin:6px 0 0">Últimos 60 dias</p>' : ''}</div>`;
      }).join('')}
    </div>`;

  content.querySelectorAll('[data-designar]').forEach((b) => b.addEventListener('click', () => {
    const a = alertas.find((x) => String(x.pessoa.id) === b.dataset.designar);
    abrirCaso({ pessoa: a.pessoa, motivo: `${a.faltas} faltas seguidas`, aoSalvar: () => { atualizarBadges(); recarregar(); } });
  }));
  content.querySelectorAll('[data-caso]').forEach((k) => k.addEventListener('click', () => verCaso(Number(k.dataset.caso), recarregar)));
}
