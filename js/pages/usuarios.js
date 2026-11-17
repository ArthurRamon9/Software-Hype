// Gestão de acessos (somente administradores)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { sb, ok, store } from '../supabase.js';
import { icon, esc, toast, toastErro, avatar, fmtData, confirmar } from '../ui.js';
import { atualizarBadges } from '../app.js';

const PAPEIS = { admin: 'Administrador', lider: 'Líder', servo: 'Servo' };

export async function render(content) {
  const users = ok(await sb.from('profiles').select('*').order('cd_status').order('nome'));
  const pend = users.filter((u) => u.cd_status === 0);

  content.innerHTML = `
    <div class="page-head"><div><h1>Acessos</h1><p>Quem pode entrar no sistema. Novas contas precisam ser aprovadas aqui.</p></div></div>
    <div class="notice info" style="margin-bottom:16px">${icon('info')}<span><b>Administrador</b>: tudo, inclusive aprovar acessos e excluir registros.
      <b>Líder</b> e <b>Servo</b>: cadastram, marcam presença e usam a pastoral (a diferença serve para organização).</span></div>
    ${pend.length ? `<div class="card" style="margin-bottom:16px;border-color:#f5d48f">
      <div class="card-head"><h2>Aguardando aprovação (${pend.length})</h2></div>
      <div class="list">${pend.map((u) => `<div class="list-item">${avatar(u.nome, null, 'sm')}<div class="grow"><b>${esc(u.nome)}</b><span>${esc(u.email)} · pediu em ${fmtData(u.created_at)}</span></div>
        <button class="btn btn-ghost btn-sm" data-recusar="${u.id}">Recusar</button><button class="btn btn-primary btn-sm" data-aprovar="${u.id}">${icon('check')} Aprovar</button></div>`).join('')}</div></div>` : ''}
    <div class="card">
      <div class="card-head"><h2>Usuários</h2></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Papel</th><th>Status</th><th></th></tr></thead><tbody>
      ${users.filter((u) => u.cd_status === 1 || !pend.includes(u)).map((u) => `<tr>
        <td><div style="display:flex;gap:10px;align-items:center">${avatar(u.nome, null, 'sm')}<div><b>${esc(u.nome)}</b><div class="muted small">${esc(u.email)}</div></div></div></td>
        <td><select class="input" data-papel="${u.id}" style="height:36px;width:auto" ${u.id === store.profile.id ? 'disabled' : ''}>
          ${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${u.papel === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td>${u.cd_status ? '<span class="badge ok">Ativo</span>' : '<span class="badge bad">Bloqueado</span>'}</td>
        <td class="num">${u.id === store.profile.id ? '<span class="muted small">você</span>' : `<button class="btn btn-ghost btn-sm" data-status="${u.id}" data-v="${u.cd_status ? 0 : 1}">${u.cd_status ? 'Bloquear' : 'Reativar'}</button>`}</td>
      </tr>`).join('')}
      </tbody></table></div>
    </div>`;

  const atualizar = async (id, dados, msg) => {
    try { ok(await sb.from('profiles').update(dados).eq('id', id)); toast(msg); atualizarBadges(); render(content); } catch (e) { toastErro(e); }
  };
  content.querySelectorAll('[data-aprovar]').forEach((b) => b.addEventListener('click', () => atualizar(b.dataset.aprovar, { cd_status: 1 }, 'Acesso aprovado!')));
  content.querySelectorAll('[data-recusar]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('Recusar e remover este pedido de acesso?', { ok: 'Recusar', perigo: true }))) return;
    try { ok(await sb.from('profiles').delete().eq('id', b.dataset.recusar)); toast('Pedido removido.'); atualizarBadges(); render(content); } catch (e) { toastErro(e); }
  }));
  content.querySelectorAll('[data-papel]').forEach((s) => s.addEventListener('change', () => atualizar(s.dataset.papel, { papel: s.value }, 'Papel atualizado.')));
  content.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
    const v = Number(b.dataset.v);
    if (!v && !(await confirmar('Bloquear o acesso deste usuário?', { ok: 'Bloquear', perigo: true }))) return;
    atualizar(b.dataset.status, { cd_status: v }, v ? 'Acesso reativado.' : 'Acesso bloqueado.');
  }));
}
