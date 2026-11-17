// Acessos ao sistema (só administradores)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao } from '../api.js';
import { esc, aviso, avisoErro, fmtData, confirmar } from '../ui.js';
import { atualizarContadores } from '../app.js';

const PAPEIS = { admin: 'Administrador', lider: 'Líder', servo: 'Servo' };

export async function render(conteudo) {
  const usuarios = await api('GET', '/usuarios');
  const ativos = usuarios.filter((u) => u.cd_status);
  const bloqueados = usuarios.filter((u) => !u.cd_status);

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Acessos</h1><p class="sub">Quem pode entrar no sistema.</p></div></div>
    ${bloqueados.length ? `<section class="painel" style="margin-bottom:16px"><div class="painel-topo"><h2>Aguardando liberação</h2></div><div class="painel-corpo">
      <div class="lista">${bloqueados.map((u) => `<div><div class="cresce">${esc(u.nome)}<span>${esc(u.email)} · conta criada em ${fmtData(u.dt_criacao)}</span></div>
        <button class="link-btn danger small" data-recusar="${u.id}">Recusar</button><button class="btn sm primary" data-liberar="${u.id}">Liberar</button></div>`).join('')}</div>
    </div></section>` : ''}
    <section class="painel"><div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nome</th><th>Papel</th><th class="some-mobile">Último acesso</th><th></th></tr></thead>
      <tbody>${ativos.map((u) => `<tr>
        <td>${esc(u.nome)}<div class="muted small">${esc(u.email)}</div></td>
        <td>${u.id === sessao.usuario.id ? PAPEIS[u.papel] : `<select class="input" data-papel="${u.id}" style="width:auto;height:30px">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${u.papel === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`}</td>
        <td class="some-mobile muted">${u.dt_ultimo_login ? fmtData(u.dt_ultimo_login) : 'nunca'}</td>
        <td class="dir">${u.id === sessao.usuario.id ? '<span class="muted small">você</span>' : `<button class="link-btn danger small" data-bloquear="${u.id}">Bloquear</button>`}</td></tr>`).join('')}</tbody>
    </table></div></section>
    <p class="hint" style="margin-top:12px">Administrador pode tudo, inclusive liberar acessos e excluir registros. Líder e Servo cadastram, fazem chamada e usam a Pastoral.</p>`;

  const alterar = async (id, corpo, msg) => {
    try { await api('PUT', `/usuarios/${id}`, corpo); aviso(msg); atualizarContadores(); render(conteudo); } catch (e) { avisoErro(e); }
  };
  conteudo.querySelectorAll('[data-liberar]').forEach((b) => b.addEventListener('click', () => alterar(b.dataset.liberar, { cd_status: 1 }, 'Acesso liberado.')));
  conteudo.querySelectorAll('[data-papel]').forEach((s) => s.addEventListener('change', () => alterar(s.dataset.papel, { papel: s.value }, 'Papel alterado.')));
  conteudo.querySelectorAll('[data-bloquear]').forEach((b) => b.addEventListener('click', async () => {
    if (await confirmar('Bloquear o acesso desta pessoa? Ela volta para a lista de aguardando liberação.', { botao: 'Bloquear', perigo: true })) alterar(b.dataset.bloquear, { cd_status: 0 }, 'Acesso bloqueado.');
  }));
  conteudo.querySelectorAll('[data-recusar]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('Recusar e apagar esta conta?', { botao: 'Recusar', perigo: true }))) return;
    try { await api('DELETE', `/usuarios/${b.dataset.recusar}`); aviso('Conta apagada.'); atualizarContadores(); render(conteudo); } catch (e) { avisoErro(e); }
  }));
}
