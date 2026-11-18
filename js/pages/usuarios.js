// Acessos: usuários, grupos de permissão e registro de atividades
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao } from '../api.js';
import { esc, aviso, avisoErro, ocupado, janela, confirmar, fmtData } from '../ui.js';
import { atualizarContadores } from '../app.js';

let aba = 'usuarios';

const ACOES = {
  login: 'Entrou', login_falhou: 'Tentativa de login falhou', conta_criada: 'Conta criada', esqueci_senha: 'Pediu nova senha',
  senha_redefinida: 'Redefiniu a senha', senha_trocada: 'Trocou a senha', usuario_liberado: 'Liberou acesso', usuario_bloqueado: 'Bloqueou acesso',
  usuario_excluido: 'Excluiu conta', grupos_alterados: 'Alterou grupos', grupo_criado: 'Criou grupo', grupo_alterado: 'Alterou grupo',
  grupo_excluido: 'Excluiu grupo', ministerio_salvo: 'Alterou ministério', ministerio_excluido: 'Excluiu ministério', pessoa_criada: 'Cadastrou pessoa', pessoa_editada: 'Editou pessoa', pessoa_excluida: 'Excluiu pessoa',
  chamada_salva: 'Salvou chamada', pessoas_importadas: 'Importou planilha', casos_concluidos: 'Concluiu acompanhamentos', casos_designados: 'Designou acompanhamentos', chamada_excluida: 'Apagou chamada', caso_excluido: 'Apagou acompanhamento',
};
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export async function render(conteudo) {
  const { usuarios, grupos, permissoes } = await api('GET', '/acessos');
  const nomeGrupo = Object.fromEntries(grupos.map((g) => [g.id, g.nome]));
  const pendentes = usuarios.filter((u) => !u.cd_status);
  const ativos = usuarios.filter((u) => u.cd_status);
  const recarregar = () => { atualizarContadores(); render(conteudo); };

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Acessos</h1><p class="sub">Quem entra no sistema e o que cada um pode fazer.</p></div></div>
    <div class="abas" id="abas" style="margin-bottom:14px">
      <button data-aba="usuarios">Usuários${pendentes.length ? ` (${pendentes.length} aguardando)` : ''}</button>
      <button data-aba="grupos">Grupos</button>
      <button data-aba="atividades">Atividades</button>
    </div>
    <div id="corpo-aba"></div>`;

  // Janela: liberar/editar os grupos de um usuário
  const editarUsuario = (u) => janela({
    titulo: u.nome,
    corpo: `<form id="fu" style="display:grid;gap:14px">
      <p class="muted">${esc(u.email)}${u.dt_ultimo_login ? ` · último acesso em ${fmtData(u.dt_ultimo_login)}` : ''}</p>
      <div class="field"><span class="label">Grupos</span>
        <div style="display:grid;gap:8px">${grupos.map((g) => `<label class="check"><input type="checkbox" name="g" value="${g.id}" ${u.grupos.includes(g.id) ? 'checked' : ''}>
          <span><b style="font-weight:500">${esc(g.nome)}</b> <span class="muted small">${esc(g.descricao || '')}</span></span></label>`).join('')}</div></div>
      <div class="janela-acoes" style="justify-content:space-between">
        ${u.id === sessao.usuario.id ? '<span></span>' : u.cd_status ? '<button type="button" class="link-btn danger" id="bloquear">Bloquear acesso</button>' : '<button type="button" class="link-btn danger" id="recusar">Recusar e apagar conta</button>'}
        <div style="display:flex;gap:8px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">${u.cd_status ? 'Salvar' : 'Liberar acesso'}</button></div>
      </div></form>`,
    aoAbrir: (j, fechar) => {
      const marcados = () => [...j.querySelectorAll('input[name=g]:checked')].map((c) => Number(c.value));
      j.querySelector('#fu').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!marcados().length && !(await confirmar('Liberar sem nenhum grupo? A pessoa vai entrar mas não vai ver nada.', { botao: 'Continuar' }))) return;
        await ocupado(e.submitter, async () => {
          try { await api('PUT', `/acessos/usuarios/${u.id}`, { cd_status: 1, grupos: marcados() }); aviso(u.cd_status ? 'Grupos atualizados.' : 'Acesso liberado.'); fechar(); recarregar(); } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#bloquear')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar(`Bloquear o acesso de ${u.nome}? Se estiver logado em algum aparelho, sai na hora.`, { botao: 'Bloquear', perigo: true }))) return;
        try { await api('PUT', `/acessos/usuarios/${u.id}`, { cd_status: 0, grupos: u.grupos }); aviso('Acesso bloqueado.'); recarregar(); } catch (err) { avisoErro(err); }
      });
      j.querySelector('#recusar')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar(`Apagar a conta de ${u.nome}?`, { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/acessos/usuarios/${u.id}`); aviso('Conta apagada.'); recarregar(); } catch (err) { avisoErro(err); }
      });
    },
  });

  // Janela: criar/editar grupo, suas permissões e quem está nele
  const editarGrupo = (g = { nome: '', descricao: '', permissoes: [], sistema: false }) => janela({
    titulo: g.id ? g.nome : 'Novo grupo',
    larga: true,
    corpo: `<form id="fg" style="display:grid;gap:16px">
      ${g.sistema ? '<p class="msg aviso">O grupo Administradores sempre tem todas as permissões. Aqui você só escolhe quem faz parte dele.</p>' : `
      <div class="field"><label for="gn">Nome *</label><input class="input" id="gn" value="${esc(g.nome)}" required></div>
      <div class="field"><label for="gd">Descrição</label><input class="input" id="gd" value="${esc(g.descricao || '')}"></div>`}
      <div class="field"><span class="label">Quem está no grupo</span>
        ${ativos.length ? `<div class="lista-check">${ativos.map((u) => `<label class="check"><input type="checkbox" name="m" value="${u.id}" ${g.id && u.grupos.includes(g.id) ? 'checked' : ''}>
          <span>${esc(u.nome)}${u.id === sessao.usuario.id ? ' <span class="muted small">(você)</span>' : ''} <span class="muted small">${esc(u.email)}</span></span></label>`).join('')}</div>` : '<p class="hint">Nenhuma conta ativa ainda.</p>'}
        <span class="hint">Para alguém aparecer aqui, a pessoa cria a conta no site (botão "Criar conta" na tela de entrada) e você libera na aba Usuários.</span></div>
      ${g.sistema ? '' : `<div class="field"><span class="label">O que o grupo pode fazer</span>
        <div style="display:grid;gap:8px">${permissoes.map((p) => `<label class="check"><input type="checkbox" name="p" value="${p.codigo}" ${g.permissoes.includes(p.codigo) ? 'checked' : ''}>${esc(p.descricao)}</label>`).join('')}</div></div>`}
      <div class="janela-acoes" style="justify-content:space-between">
        ${g.id && !g.sistema ? '<button type="button" class="link-btn danger" id="excluir">Excluir grupo</button>' : '<span></span>'}
        <div style="display:flex;gap:8px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div>
      </div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#fg').addEventListener('submit', async (e) => {
        e.preventDefault();
        const membros = [...j.querySelectorAll('input[name=m]:checked')].map((c) => Number(c.value));
        await ocupado(e.submitter, async () => {
          try {
            let id = g.id;
            if (!g.sistema) {
              const corpo = { nome: j.querySelector('#gn').value, descricao: j.querySelector('#gd').value, permissoes: [...j.querySelectorAll('input[name=p]:checked')].map((c) => c.value) };
              const r = await api(g.id ? 'PUT' : 'POST', g.id ? `/acessos/grupos/${g.id}` : '/acessos/grupos', corpo);
              id = id || r.id;
            }
            await api('PUT', `/acessos/grupos/${id}/membros`, { membros });
            aviso('Grupo salvo.'); fechar();
            if (membros.includes(sessao.usuario.id) !== (g.id ? ativos.find((u) => u.id === sessao.usuario.id)?.grupos.includes(g.id) : false)) location.reload();   // mudou o meu acesso: recarrega o menu
            else recarregar();
          } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#excluir')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar(`Excluir o grupo ${g.nome}? ${g.membros} pessoa(s) perdem as permissões dele.`, { botao: 'Excluir', perigo: true }))) return;
        try { await api('DELETE', `/acessos/grupos/${g.id}`); aviso('Grupo excluído.'); recarregar(); } catch (err) { avisoErro(err); }
      });
    },
  });

  const mostrar = async () => {
    conteudo.querySelectorAll('#abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === aba));
    const corpo = conteudo.querySelector('#corpo-aba');

    if (aba === 'usuarios') {
      corpo.innerHTML = `
        ${pendentes.length ? `<section class="painel" style="margin-bottom:16px"><div class="painel-topo"><h2>Aguardando liberação</h2><span class="sub">inclui contas bloqueadas</span></div><div class="painel-corpo">
          <div class="lista">${pendentes.map((u) => `<div><div class="cresce">${esc(u.nome)}<span>${esc(u.email)} · conta criada em ${fmtData(u.dt_criacao)}</span></div>
            <button class="btn sm" data-usuario="${u.id}">Analisar</button></div>`).join('')}</div></div></section>` : ''}
        <section class="painel"><div class="filtros"><span class="muted small">Clique em uma pessoa para escolher os grupos dela. Quem ainda não tem conta cria pelo botão "Criar conta" na tela de entrada e aparece aqui para você liberar.</span></div>
          <div class="tabela-wrap"><table class="tabela">
          <thead><tr><th>Nome</th><th>Grupos</th><th class="some-mobile">Último acesso</th><th></th></tr></thead>
          <tbody>${ativos.map((u) => `<tr class="clicavel" data-usuario="${u.id}">
            <td>${esc(u.nome)}${u.id === sessao.usuario.id ? ' <span class="muted small">(você)</span>' : ''}<div class="muted small">${esc(u.email)}</div></td>
            <td>${u.grupos.map((g) => `<span class="tag">${esc(nomeGrupo[g])}</span>`).join(' ') || '<span class="tag warn">nenhum</span>'}</td>
            <td class="some-mobile muted">${u.dt_ultimo_login ? fmtData(u.dt_ultimo_login) : 'nunca'}</td>
            <td class="dir"><button class="link-btn">Mudar grupos</button></td></tr>`).join('')}</tbody>
        </table></div></section>`;
      corpo.querySelectorAll('[data-usuario]').forEach((b) => b.addEventListener('click', () => editarUsuario(usuarios.find((u) => u.id === Number(b.dataset.usuario)))));
    }

    if (aba === 'grupos') {
      corpo.innerHTML = `
        <section class="painel"><div class="filtros" style="justify-content:space-between"><span class="muted small">A pessoa tem a soma das permissões de todos os grupos em que está.</span>
          <button class="btn sm" id="novo-grupo">Novo grupo</button></div>
          <div class="tabela-wrap"><table class="tabela">
          <thead><tr><th>Grupo</th><th>Permissões</th><th>Quem está</th><th></th></tr></thead>
          <tbody>${grupos.map((g) => `<tr class="clicavel" data-grupo="${g.id}">
            <td><b style="font-weight:500">${esc(g.nome)}</b><div class="muted small">${esc(g.descricao || '')}</div></td>
            <td class="small">${g.sistema ? 'Todas' : permissoes.filter((p) => g.permissoes.includes(p.codigo)).map((p) => esc(p.descricao)).join('<br>') || '<span class="muted">nenhuma</span>'}</td>
            <td class="small">${ativos.filter((u) => u.grupos.includes(g.id)).map((u) => esc(u.nome)).join('<br>') || '<span class="muted">ninguém ainda</span>'}</td>
            <td class="dir"><button class="link-btn">Editar</button></td></tr>`).join('')}</tbody>
        </table></div></section>`;
      corpo.querySelector('#novo-grupo').addEventListener('click', () => editarGrupo());
      corpo.querySelectorAll('[data-grupo]').forEach((b) => b.addEventListener('click', () => editarGrupo(grupos.find((g) => g.id === Number(b.dataset.grupo)))));
    }

    if (aba === 'atividades') {
      corpo.innerHTML = '<div class="boot"><span class="spin"></span></div>';
      try {
        const lista = await api('GET', '/acessos/atividades');
        corpo.innerHTML = `<section class="painel"><div class="filtros"><span class="muted small">Últimas 200 ações. Esse registro não pode ser apagado pelo sistema.</span></div>
          <div class="tabela-wrap"><table class="tabela">
          <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th class="some-mobile">Detalhe</th><th class="some-mobile">IP</th></tr></thead>
          <tbody>${lista.map((a) => `<tr>
            <td class="num" style="white-space:nowrap">${dataHora(a.dt)}</td>
            <td>${esc(a.usuario_nome || a.email || '—')}</td>
            <td>${a.acao === 'login_falhou' ? `<span class="tag bad">${ACOES[a.acao]}</span>` : esc(ACOES[a.acao] || a.acao)}</td>
            <td class="some-mobile muted small">${esc(a.detalhe || '')}</td>
            <td class="some-mobile muted small num">${esc(a.ip || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nada registrado ainda.</td></tr>'}</tbody>
          </table></div></section>`;
      } catch (e) { corpo.innerHTML = `<div class="painel vazio">${esc(e.message)}</div>`; }
    }
  };

  conteudo.querySelectorAll('#abas button').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; mostrar(); }));
  await mostrar();
}
