// Acessos: usuários, grupos de permissão e registro de atividades
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao, urlFoto } from '../api.js';
import { esc, aviso, avisoErro, ocupado, janela, confirmar, fmtData, foto, semAcento, filtrarPorNome, icon } from '../ui.js';
import { atualizarContadores } from '../app.js';

// "8 pessoas · Damaris, Érika, Leo e mais 5": com 20+ contas a lista inteira ficaria enorme (a completa fica no Editar)
function quemEsta(lista) {
  if (!lista.length) return '<span class="muted">Ninguém ainda</span>';
  const p1 = (u) => u.nome.trim().split(/\s+/)[0];
  const repetido = (u) => lista.filter((x) => p1(x) === p1(u)).length > 1;
  const nomes = lista.map((u) => (repetido(u) ? u.nome.trim().split(/\s+/).slice(0, 2).join(' ') : p1(u)));
  const mostra = nomes.slice(0, 3).join(', ') + (nomes.length > 3 ? ` e mais ${nomes.length - 3}` : '');
  return `<span title="${esc(lista.map((u) => u.nome).join(', '))}"><b>${lista.length} pessoa${lista.length === 1 ? '' : 's'}</b><span class="muted"> · ${esc(mostra)}</span></span>`;
}
let aba = sessionStorage.getItem('hype_acessos_aba') || 'usuarios';   // lembra a aba se a página recarregar

const ACOES = {
  login: 'Entrou', login_falhou: 'Tentativa de login falhou', conta_criada: 'Conta criada', esqueci_senha: 'Pediu nova senha',
  senha_redefinida: 'Redefiniu a senha', senha_trocada: 'Trocou a senha', usuario_liberado: 'Liberou acesso', usuario_bloqueado: 'Bloqueou acesso',
  usuario_excluido: 'Excluiu conta', grupos_alterados: 'Alterou grupos', grupo_criado: 'Criou grupo', grupo_alterado: 'Alterou grupo',
  grupo_excluido: 'Excluiu grupo', ministerio_salvo: 'Alterou ministério', ministerio_excluido: 'Excluiu ministério', pessoa_criada: 'Cadastrou pessoa', pessoa_editada: 'Editou pessoa', pessoa_excluida: 'Excluiu pessoa',
  chamada_salva: 'Salvou chamada', pessoas_importadas: 'Importou planilha', casos_concluidos: 'Concluiu acompanhamentos', casos_designados: 'Designou acompanhamentos',
  casos_enviados: 'Enviou ao responsável', chamada_excluida: 'Apagou chamada', caso_excluido: 'Apagou acompanhamento', ver_como: 'Ver como',
  reuniao_salva: 'Salvou reunião', reuniao_cancelada: 'Cancelou reunião', escala_salva: 'Salvou escala',
  sugestao_enviada: 'Enviou sugestão', sugestao_alterada: 'Alterou sugestão', sugestao_apagada: 'Apagou sugestão',
};
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

// Lista do cadastro para ligar a conta a uma pessoa (carrega uma vez)
let cachePessoas = null;
async function escolherPessoa(u) {
  cachePessoas = cachePessoas || await api('GET', '/acessos/pessoas');
  return new Promise((ok) => {
    let valor;
    janela({
      titulo: `Quem é ${u.nome.split(' ')[0]} no cadastro?`,
      corpo: `<div style="display:grid;gap:10px">
        <input class="input busca" id="ep-busca" type="search" placeholder="Digite o nome" autocomplete="off">
        <div class="lista-escolha" id="ep-lista"></div>
        <p class="hint">Uma pessoa do cadastro só pode estar ligada a uma conta.</p>
        <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button></div></div>`,
      aoAbrir: (j, fechar) => {
        const busca = j.querySelector('#ep-busca');
        const pintar = () => {
          const termo = busca.value.trim();
          const l = termo ? filtrarPorNome(cachePessoas, termo).slice(0, 30) : [];
          j.querySelector('#ep-lista').innerHTML = termo ? (l.map((p) => `<label><input type="radio" name="ep" value="${p.id}" ${p.ligada_a && p.ligada_a !== u.nome ? 'disabled' : ''}>
            <span><b>${esc(p.nome)}</b><small>${[p.referencia, p.email, p.ligada_a && p.ligada_a !== u.nome ? `Já ligada à conta de ${p.ligada_a}` : ''].filter(Boolean).map(esc).join(' · ') || '—'}</small></span></label>`).join('') || '<p class="muted">Ninguém com esse nome.</p>') : '';
        };
        busca.addEventListener('input', pintar);
        j.querySelector('#ep-lista').addEventListener('change', (e) => { valor = Number(e.target.value); fechar(); });
        busca.focus();
      },
      aoFechar: () => ok(valor),
    });
  });
}

export async function render(conteudo) {
  const dados = await api('GET', '/acessos');
  const { usuarios, grupos, permissoes } = dados;
  const nomeGrupo = Object.fromEntries(grupos.map((g) => [g.id, g.nome]));
  const grupoAdmin = grupos.find((g) => g.sistema);
  const pendentes = () => usuarios.filter((u) => !u.cd_status);
  const ativos = () => usuarios.filter((u) => u.cd_status);
  const ehAdmin = (u) => grupoAdmin && u.grupos.includes(grupoAdmin.id);
  // Atualiza a tela na hora com o que acabou de ser salvo; depois confere com o servidor em segundo plano
  const recarregar = () => {
    atualizarContadores();
    desenharAbas(); mostrar();
    render(conteudo).catch(() => aviso('Não consegui atualizar a lista. Saia e entre de novo nesta tela.', 'erro'));
  };

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Acessos</h1><p class="sub">Quem entra no sistema e o que cada um pode fazer.</p></div></div>
    <div class="abas" id="abas" style="margin-bottom:14px"></div>
    <div id="corpo-aba"></div>`;
  const desenharAbas = () => {
    const n = pendentes().length;
    conteudo.querySelector('#abas').innerHTML = `<button data-aba="usuarios">Usuários${n ? ` (${n} aguardando)` : ''}</button><button data-aba="grupos">Grupos</button><button data-aba="atividades">Atividades</button>`;
    conteudo.querySelectorAll('#abas button').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; sessionStorage.setItem('hype_acessos_aba', aba); mostrar(); }));
  };
  desenharAbas();

  // Janela: liberar/editar um usuário (grupos e vínculo com o cadastro)
  const editarUsuario = (u) => {
    let pessoa = u.pessoa_id ? { id: u.pessoa_id, nome: u.pessoa_nome } : null;
    let pessoaMudou = false;
    const textoPessoa = () => (pessoa ? `Ligada a <b>${esc(pessoa.nome)}</b> do cadastro.`
      : u.sugestao_id ? `Esta conta parece ser de <b>${esc(u.sugestao_nome)}</b> do cadastro (mesmo e-mail).`
        : 'Ainda não ligada ao cadastro.');
    janela({
      titulo: u.nome,
      corpo: `<form id="fu" style="display:grid;gap:16px">
        <p class="muted">${esc(u.email)}${u.dt_ultimo_login ? ` · Último acesso em ${fmtData(u.dt_ultimo_login)}` : ''}</p>
        <div class="field"><span class="label">Pessoa no cadastro</span>
          <div class="caixa-resp"><span id="up-txt">${textoPessoa()}</span>
            <div class="acoes-resp" id="up-acoes"></div></div>
          <span class="hint">Ligar a conta à ficha da pessoa mostra a foto dela e os acompanhamentos que estão com ela.</span></div>
        <div class="field"><span class="label">Grupos</span>
          <div class="lista-check grupos-check">${grupos.map((g) => `<label class="check opcao"><input type="checkbox" name="g" value="${g.id}" ${u.grupos.includes(g.id) ? 'checked' : ''} ${g.sistema ? 'data-admin' : ''}>
            <span><b>${esc(g.nome)}</b><small>${esc(g.descricao || '')}</small></span></label>`).join('')}</div>
          <span class="hint" id="nota-admin" hidden>Administradores já pode tudo: os outros grupos não fazem diferença.</span></div>
        ${u.cd_status && u.id !== sessao.usuario.id && !ehAdmin(u) ? `<button type="button" class="acao-ver-como" id="ver-como">${icon('olho')}<span><b>Ver o sistema como esta pessoa</b><small>Abre o site do jeito que ${esc(u.nome.split(' ')[0])} enxerga, para conferir os acessos. Fica registrado e nada é alterado por ela.</small></span></button>` : ''}
        <div class="janela-acoes rodape-acoes">
          ${u.id === sessao.usuario.id ? '<span></span>' : u.cd_status ? `<button type="button" class="link-btn danger com-icone" id="bloquear">${icon('bloquear')}Bloquear acesso</button>` : `<button type="button" class="link-btn danger com-icone" id="recusar">${icon('lixeira')}Recusar e apagar conta</button>`}
          <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">${u.cd_status ? 'Salvar' : 'Liberar acesso'}</button></div>
        </div></form>`,
      aoAbrir: (j, fechar) => {
        const marcados = () => [...j.querySelectorAll('input[name=g]:checked')].map((c) => Number(c.value));
        // Administradores marcado: os outros ficam apagados (não fazem diferença)
        const conferirAdmin = () => {
          const admin = j.querySelector('input[data-admin]')?.checked;
          j.querySelectorAll('input[name=g]:not([data-admin])').forEach((c) => { c.disabled = !!admin; c.closest('label').classList.toggle('apagado', !!admin); });
          j.querySelector('#nota-admin').hidden = !admin;
        };
        j.querySelector('input[data-admin]')?.addEventListener('change', conferirAdmin);
        conferirAdmin();
        const acoesPessoa = () => {
          const ac = j.querySelector('#up-acoes');
          ac.innerHTML = pessoa ? '<button type="button" class="btn sm" data-p="trocar">Trocar</button><button type="button" class="link-btn small" data-p="desligar">Desligar</button>'
            : u.sugestao_id && !pessoaMudou ? '<button type="button" class="btn sm primary" data-p="sugestao">Ligar</button><button type="button" class="btn sm" data-p="trocar">Escolher outra</button>'
              : '<button type="button" class="btn sm" data-p="trocar">Escolher pessoa</button>';
          j.querySelector('#up-txt').innerHTML = textoPessoa();
        };
        acoesPessoa();
        j.querySelector('#up-acoes').addEventListener('click', async (e) => {
          const b = e.target.closest('[data-p]'); if (!b) return;
          if (b.dataset.p === 'sugestao') { pessoa = { id: u.sugestao_id, nome: u.sugestao_nome }; pessoaMudou = true; }
          if (b.dataset.p === 'desligar') { pessoa = null; pessoaMudou = true; }
          if (b.dataset.p === 'trocar') {
            try {
              const id = await escolherPessoa(u);
              if (id) { pessoa = { id, nome: cachePessoas.find((p) => p.id === id).nome }; pessoaMudou = true; }
            } catch (err) { avisoErro(err); }
          }
          acoesPessoa();
        });
        j.querySelector('#fu').addEventListener('submit', async (e) => {
          e.preventDefault();
          const admin = j.querySelector('input[data-admin]')?.checked;
          const gs = admin ? [grupoAdmin.id] : marcados();
          if (!gs.length && !(await confirmar('Liberar sem nenhum grupo? A pessoa vai entrar mas não vai ver nada.', { botao: 'Continuar' }))) return;
          await ocupado(e.submitter, async () => {
            try {
              await api('PUT', `/acessos/usuarios/${u.id}`, { cd_status: 1, grupos: gs, ...(pessoaMudou ? { pessoa_id: pessoa ? pessoa.id : null } : {}) });
              aviso(u.cd_status ? 'Usuário atualizado.' : 'Acesso liberado.');
              Object.assign(u, { cd_status: 1, grupos: gs }, pessoaMudou ? { pessoa_id: pessoa?.id || null, pessoa_nome: pessoa?.nome || null, sugestao_id: null } : {});
              fechar();
              if (u.id === sessao.usuario.id) location.reload(); else recarregar();
            } catch (err) { avisoErro(err); }
          });
        });
        j.querySelector('#ver-como')?.addEventListener('click', async () => {
          try { await api('POST', `/acessos/ver-como/${u.id}`); location.hash = '#/'; location.reload(); } catch (err) { avisoErro(err); }
        });
        j.querySelector('#bloquear')?.addEventListener('click', async () => {
          fechar();
          if (!(await confirmar(`Bloquear o acesso de ${u.nome}? Se estiver logado em algum aparelho, sai na hora.`, { botao: 'Bloquear', perigo: true }))) return;
          try { await api('PUT', `/acessos/usuarios/${u.id}`, { cd_status: 0, grupos: u.grupos }); u.cd_status = 0; aviso('Acesso bloqueado.'); recarregar(); } catch (err) { avisoErro(err); }
        });
        j.querySelector('#recusar')?.addEventListener('click', async () => {
          fechar();
          if (!(await confirmar(`Apagar a conta de ${u.nome}?`, { botao: 'Apagar', perigo: true }))) return;
          try { await api('DELETE', `/acessos/usuarios/${u.id}`); usuarios.splice(usuarios.indexOf(u), 1); aviso('Conta apagada.'); recarregar(); } catch (err) { avisoErro(err); }
        });
      },
    });
  };

  // Janela: criar/editar grupo, suas permissões e quem está nele
  const editarGrupo = (g = { nome: '', descricao: '', permissoes: [], sistema: false }) => janela({
    titulo: g.id ? g.nome : 'Novo grupo',
    larga: true,
    corpo: `<form id="fg" style="display:grid;gap:16px">
      ${g.sistema ? '<p class="msg aviso">O grupo Administradores sempre tem todas as permissões. Aqui você só escolhe quem faz parte dele.</p>' : `
      <div class="field"><label for="gn">Nome *</label><input class="input" id="gn" value="${esc(g.nome)}" required></div>
      <div class="field"><label for="gd">Descrição</label><input class="input" id="gd" value="${esc(g.descricao || '')}"></div>`}
      <div class="field"><span class="label">Quem está no grupo <span class="muted small" id="gm-conta"></span></span>
        ${ativos().length > 8 ? '<input class="input busca" id="gm-busca" type="search" placeholder="Buscar pelo nome" autocomplete="off" style="margin-bottom:8px">' : ''}
        ${ativos().length ? `<div class="lista-check" id="gm-lista">${ativos().map((u) => `<label class="check opcao" data-nome="${esc(u.nome)}"><input type="checkbox" name="m" value="${u.id}" ${g.id && u.grupos.includes(g.id) ? 'checked' : ''}>
          <span><b>${esc(u.nome)}${u.id === sessao.usuario.id ? ' <span class="muted small">(você)</span>' : ''}</b><small>${esc(u.email)}</small></span></label>`).join('')}</div>` : '<p class="hint">Nenhuma conta ativa ainda.</p>'}
        <span class="hint">Para alguém aparecer aqui, a pessoa cria a conta no site (botão "Criar conta" na tela de entrada) e você libera na aba Usuários.</span></div>
      ${g.sistema ? '' : `<div class="field"><span class="label">O que o grupo pode fazer</span>
        <div class="lista-check sem-limite">${permissoes.map((p) => `<label class="check opcao"><input type="checkbox" name="p" value="${p.codigo}" ${g.permissoes.includes(p.codigo) ? 'checked' : ''}><span>${esc(p.descricao)}</span></label>`).join('')}</div></div>`}
      <div class="janela-acoes" style="justify-content:space-between">
        ${g.id && !g.sistema ? '<button type="button" class="link-btn danger" id="excluir">Excluir grupo</button>' : '<span></span>'}
        <div style="display:flex;gap:8px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div>
      </div></form>`,
    aoAbrir: (j, fechar) => {
      const gmConta = () => { const c = j.querySelectorAll('#gm-lista input:checked').length; j.querySelector('#gm-conta').textContent = c ? `· ${c} marcada${c === 1 ? '' : 's'}` : ''; };
      gmConta(); j.querySelector('#gm-lista')?.addEventListener('change', gmConta);
      const gmBusca = j.querySelector('#gm-busca');
      gmBusca?.addEventListener('input', () => { const b = semAcento(gmBusca.value); j.querySelectorAll('#gm-lista label').forEach((l) => { l.hidden = !!b && !semAcento(l.dataset.nome).includes(b); }); });
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
            const eraMeu = g.id ? ativos().find((u) => u.id === sessao.usuario.id)?.grupos.includes(g.id) : false;
            if (membros.includes(sessao.usuario.id) !== !!eraMeu) { location.reload(); return; }   // mudou o meu acesso: recarrega o menu
            ativos().forEach((u) => { const tem = u.grupos.includes(id); const deve = membros.includes(u.id); if (tem && !deve) u.grupos = u.grupos.filter((x) => x !== id); if (!tem && deve) u.grupos = [...u.grupos, id]; });
            recarregar();
          } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#excluir')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar(`Excluir o grupo ${g.nome}? ${g.membros} pessoa(s) perdem as permissões dele.`, { botao: 'Excluir', perigo: true }))) return;
        try { await api('DELETE', `/acessos/grupos/${g.id}`); aviso('Grupo excluído.'); render(conteudo).catch(avisoErro); } catch (err) { avisoErro(err); }
      });
    },
  });

  // Etiquetas de grupos: quem é Administrador mostra só "Administradores" (+N)
  const etiquetas = (u) => {
    if (!u.grupos.length) return '<span class="tag warn">Nenhum grupo</span>';
    if (ehAdmin(u)) return `<span class="tag">Administradores</span>${u.grupos.length > 1 ? ` <span class="muted small" title="${esc(u.grupos.filter((g) => g !== grupoAdmin.id).map((g) => nomeGrupo[g]).join(', '))}">+${u.grupos.length - 1}</span>` : ''}`;
    return u.grupos.map((g) => `<span class="tag">${esc(nomeGrupo[g])}</span>`).join(' ');
  };

  const mostrar = async () => {
    conteudo.querySelectorAll('#abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === aba));
    const corpo = conteudo.querySelector('#corpo-aba');

    if (aba === 'usuarios') {
      const pend = pendentes();
      corpo.innerHTML = `
        ${pend.length ? `<section class="painel" style="margin-bottom:16px"><div class="painel-topo"><h2>Aguardando liberação</h2><span class="sub">Contas novas e contas bloqueadas</span></div><div class="painel-corpo">
          <div class="lista">${pend.map((u) => `<div><div class="cresce">${esc(u.nome)}<span>${esc(u.email)} · Conta criada em ${fmtData(u.dt_criacao)}${u.sugestao_nome ? ` · No cadastro: ${esc(u.sugestao_nome)}` : ''}</span></div>
            <button class="btn sm" data-usuario="${u.id}">Analisar</button></div>`).join('')}</div></div></section>` : ''}
        <section class="painel"><div class="filtros"><span class="muted small">Clique em uma pessoa para escolher os grupos e ligar a conta ao cadastro. Quem ainda não tem conta cria pelo botão "Criar conta" na tela de entrada e aparece aqui para você liberar.</span></div>
          <div class="tabela-wrap"><table class="tabela">
          <thead><tr><th>Nome</th><th>Grupos</th><th class="some-mobile">No cadastro</th><th class="some-mobile">Último acesso</th><th></th></tr></thead>
          <tbody>${ativos().map((u) => `<tr class="clicavel" data-usuario="${u.id}">
            <td><div class="pessoa-cel">${foto(u.nome, u.pessoa_id && u.foto_v ? urlFoto(u.pessoa_id, u.foto_v) : null)}<div class="nome-ref"><b>${esc(u.nome)}${u.id === sessao.usuario.id ? ' <span class="muted small">(você)</span>' : ''}</b><span>${esc(u.email)}</span></div></div></td>
            <td>${etiquetas(u)}</td>
            <td class="some-mobile small">${u.pessoa_nome ? esc(u.pessoa_nome) : u.sugestao_nome ? `<span class="tag warn" title="Mesmo e-mail no cadastro">Ligar a ${esc(u.sugestao_nome)}?</span>` : '<span class="muted">Não ligada</span>'}</td>
            <td class="some-mobile muted">${u.dt_ultimo_login ? fmtData(u.dt_ultimo_login) : 'Nunca'}</td>
            <td class="dir"><button class="link-btn">Editar</button></td></tr>`).join('')}</tbody>
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
            <td class="small">${g.sistema ? 'Todas' : permissoes.filter((p) => g.permissoes.includes(p.codigo)).map((p) => esc(p.descricao)).join('<br>') || '<span class="muted">Nenhuma</span>'}</td>
            <td class="small quem-esta">${quemEsta(ativos().filter((u) => u.grupos.includes(g.id)))}</td>
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

  await mostrar();
}
