// Entrar, criar conta, esqueci a senha, nova senha, minha conta
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao, urlFoto } from '../api.js';
import { esc, $, aviso, ocupado, direitos, icon, foto, temaAtual, aplicarTema } from '../ui.js';
import { entrou, sair, parametrosHash, navegar, menuPermitido } from '../app.js';

function tela(app, html) {
  app.innerHTML = `<div class="acesso">
    <aside class="acesso-lado">
      <div class="marca"><img src="assets/img/logo.svg" alt="">Gestão do Hype</div>
      <div>
        <div class="palavra">hype</div>
        <p class="frase">Ninguém fica de fora.<span>Cadastro, chamada das sextas e cuidado pastoral do ministério de jovens.</span></p>
      </div>
      <div class="rod">${direitos()}</div>
    </aside>
    <main class="acesso-main"><div class="acesso-box">
      <div class="marca-mobile"><img src="assets/img/logo.svg" alt="">Gestão do Hype</div>
      ${html}
    </div><footer class="so-mobile">${direitos()}</footer></main></div>`;
  ligarMostrarSenha(app);
}

function ligarMostrarSenha(raiz) {
  raiz.querySelectorAll('.senha-wrap button').forEach((b) => b.addEventListener('click', () => {
    const inp = b.previousElementSibling;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    b.textContent = inp.type === 'password' ? 'mostrar' : 'ocultar';
  }));
}

const campoSenha = (id, rotulo, auto = 'current-password') => `<div class="field"><label for="${id}">${rotulo}</label>
  <div class="senha-wrap"><input class="input" id="${id}" type="password" autocomplete="${auto}" required><button type="button">mostrar</button></div></div>`;

const mensagem = (el, tipo, texto) => { el.className = `msg ${tipo}`; el.innerHTML = texto; };

// ---------------- Entrar ----------------
export function entrar(app) {
  tela(app, `
    <h1>Entrar</h1>
    <p class="sub">Use o e-mail e a senha da sua conta.</p>
    <form id="f" novalidate>
      <div id="msg" class="hidden"></div>
      <div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" autocomplete="email" required></div>
      ${campoSenha('senha', 'Senha')}
      <button class="btn primary block" type="submit">Entrar</button>
    </form>
    <p class="rodape-form"><a href="#/esqueci-senha">Esqueci minha senha</a><br><br>Ainda não tem conta? <a href="#/criar-conta">Criar conta</a></p>`);
  $('#email').focus();
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim(), senha = $('#senha').value;
    if (!email || !senha) return mensagem($('#msg'), 'erro', 'Preencha e-mail e senha.');
    await ocupado($('#f button[type=submit]'), async () => {
      try { await api('POST', '/auth/login', { email, senha }); await entrou(); }
      catch (err) { mensagem($('#msg'), 'erro', esc(err.message)); }
    });
  });
}

// ---------------- Criar conta ----------------
export function criarConta(app) {
  tela(app, `
    <h1>Criar conta</h1>
    <p class="sub">Para quem serve no Hype. Depois de criar, um administrador precisa liberar seu acesso.</p>
    <form id="f" novalidate>
      <div id="msg" class="hidden"></div>
      <div class="field"><label for="nome">Nome completo</label><input class="input" id="nome" autocomplete="name" required></div>
      <div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" autocomplete="email" required></div>
      ${campoSenha('senha', 'Senha', 'new-password')}
      <p class="hint" style="margin-top:-8px">Mínimo de 8 caracteres, com letras e números.</p>
      ${campoSenha('senha2', 'Repita a senha', 'new-password')}
      <button class="btn primary block" type="submit">Criar conta</button>
    </form>
    <p class="rodape-form">Já tem conta? <a href="#/entrar">Entrar</a></p>`);
  $('#nome').focus();
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#nome').value.trim(), email = $('#email').value.trim(), senha = $('#senha').value;
    if (nome.length < 3) return mensagem($('#msg'), 'erro', 'Informe seu nome completo.');
    if (senha.length < 8 || !/\d/.test(senha) || !/[a-zA-Z]/.test(senha)) return mensagem($('#msg'), 'erro', 'A senha precisa ter pelo menos 8 caracteres, com letras e números.');
    if (senha !== $('#senha2').value) return mensagem($('#msg'), 'erro', 'As senhas não são iguais.');
    await ocupado($('#f button[type=submit]'), async () => {
      try { await api('POST', '/auth/cadastro', { nome, email, senha }); await entrou(); }
      catch (err) { mensagem($('#msg'), 'erro', esc(err.message)); }
    });
  });
}

// ---------------- Esqueci a senha ----------------
export function esqueci(app) {
  tela(app, `
    <h1>Esqueci minha senha</h1>
    <p class="sub">Informe o e-mail da sua conta. Vamos mandar um link para você escolher uma senha nova.</p>
    <form id="f" novalidate>
      <div id="msg" class="hidden"></div>
      <div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" autocomplete="email" required></div>
      <button class="btn primary block" type="submit">Enviar link</button>
    </form>
    <p class="rodape-form"><a href="#/entrar">Voltar para o login</a></p>`);
  $('#email').focus();
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    await ocupado($('#f button[type=submit]'), async () => {
      try {
        await api('POST', '/auth/esqueci', { email });
        $('#f').innerHTML = `<div class="msg ok">Se existir uma conta com <b>${esc(email)}</b>, o e-mail chega em alguns minutos. Confira também a caixa de spam.</div>`;
      } catch (err) { mensagem($('#msg'), 'erro', esc(err.message)); }
    });
  });
}

// ---------------- Nova senha (link do e-mail) ----------------
export function novaSenha(app) {
  const token = parametrosHash().get('token');
  if (!token) return navegar('/entrar');
  tela(app, `
    <h1>Nova senha</h1>
    <p class="sub">Escolha uma senha nova para sua conta.</p>
    <form id="f" novalidate>
      <div id="msg" class="hidden"></div>
      ${campoSenha('senha', 'Nova senha', 'new-password')}
      <p class="hint" style="margin-top:-8px">Mínimo de 8 caracteres, com letras e números.</p>
      ${campoSenha('senha2', 'Repita a nova senha', 'new-password')}
      <button class="btn primary block" type="submit">Salvar e entrar</button>
    </form>`);
  $('#senha').focus();
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const senha = $('#senha').value;
    if (senha.length < 8) return mensagem($('#msg'), 'erro', 'A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== $('#senha2').value) return mensagem($('#msg'), 'erro', 'As senhas não são iguais.');
    await ocupado($('#f button[type=submit]'), async () => {
      try {
        await api('POST', '/auth/redefinir', { token, senha });
        aviso('Senha alterada. Por segurança, as outras sessões abertas foram encerradas.');
        history.replaceState(null, '', location.pathname + '#/');
        await entrou();
      } catch (err) { mensagem($('#msg'), 'erro', `${esc(err.message)} <a href="#/esqueci-senha">Pedir outro link</a>`); }
    });
  });
}

// ---------------- Aguardando liberação ----------------
export function aguardando(app) {
  tela(app, `
    <h1>Acesso em análise</h1>
    <p class="sub" style="margin-bottom:16px">Olá, ${esc(sessao.usuario.nome.split(' ')[0])}. Sua conta existe, mas ainda não está liberada.
    Um administrador precisa liberar o acesso e colocar você nos grupos certos. Os administradores já foram avisados por e-mail.</p>
    <p><button class="btn primary" id="recarregar">Recarregar</button> &nbsp; <button class="link-btn" id="sair">Sair</button></p>`);
  $('#recarregar').onclick = () => location.reload();
  $('#sair').onclick = sair;
}

// ---------------- Minha conta ----------------
export function minhaConta(conteudo) {
  const u = sessao.usuario;
  const minhaFoto = u.pessoa_id && u.foto_v ? urlFoto(u.pessoa_id, u.foto_v) : null;
  // No celular a barra de baixo não cabe tudo: aqui ficam as outras telas
  const navCelular = new Set(menuPermitido().filter((i) => i.mob).slice(0, menuPermitido().filter((i) => i.mob).length <= 5 ? 5 : 4).map((i) => i.href));
  const outras = menuPermitido().filter((i) => !navCelular.has(i.href) && i.href !== '/');
  const tema = temaAtual();
  conteudo.innerHTML = `
    <div class="cabecalho"><div class="perfil-conta">${foto(u.nome, minhaFoto, 'g')}<div><h1>Minha conta</h1><p class="sub">${esc(u.email)}${u.pessoa_id ? ' · <a href="#/pessoas/' + u.pessoa_id + '">Ver minha ficha</a>' : ''}</p></div></div>
      <div class="acoes"><button class="btn" id="sair">Sair</button></div></div>
    ${!u.pessoa_id ? '<p class="msg aviso" style="margin-bottom:16px">Sua conta ainda não está ligada ao seu cadastro do Hype. Peça a um administrador para ligar: assim aparecem a sua foto, as suas escalas, a sua agenda e os acompanhamentos que estão com você.</p>' : ''}
    ${outras.length ? `<nav class="painel so-mobile mais-telas" style="margin-bottom:16px">
      ${outras.map((i) => `<a href="#${i.href}">${icon(i.ic)}${i.rotulo}</a>`).join('')}
    </nav>` : ''}
    <section class="painel" style="margin-bottom:16px"><div class="painel-topo"><h2>Aparência</h2></div><div class="painel-corpo">
      <div class="abas" id="tema">${[['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, r]) => `<button type="button" data-escolha="${v}" class="${tema === v ? 'ativo' : ''}">${r}</button>`).join('')}</div>
      <p class="hint" style="margin-top:8px">Automático segue o modo do seu celular ou computador. A escolha fica guardada neste aparelho.</p>
    </div></section>
    <div class="colunas c2">
      <form class="painel" id="fn"><div class="painel-topo"><h2>Nome</h2></div><div class="painel-corpo" style="display:grid;gap:12px">
        <div class="field"><label for="nome">Como aparece no sistema</label><input class="input" id="nome" value="${esc(u.nome)}"></div>
        <div><button class="btn primary">Salvar</button></div></div></form>
      <form class="painel" id="fs"><div class="painel-topo"><h2>Trocar senha</h2></div><div class="painel-corpo" style="display:grid;gap:12px">
        ${campoSenha('atual', 'Senha atual')}
        ${campoSenha('nova', 'Nova senha', 'new-password')}
        <p class="hint" style="margin-top:-6px">Mínimo de 8 caracteres, com letras e números. As outras sessões abertas serão encerradas.</p>
        <div><button class="btn primary">Trocar senha</button></div></div></form>
    </div>`;
  conteudo.querySelectorAll('[data-escolha]').forEach((b) => b.addEventListener('click', () => {
    aplicarTema(b.dataset.escolha);
    conteudo.querySelectorAll('[data-escolha]').forEach((x) => x.classList.toggle('ativo', x === b));
  }));
  ligarMostrarSenha(conteudo);
  $('#sair').onclick = sair;
  $('#fn').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#nome').value.trim();
    await ocupado(e.submitter, async () => {
      try { await api('PUT', '/auth/eu', { nome }); u.nome = nome; aviso('Nome atualizado.'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
      catch (err) { aviso(err.message, 'erro'); }
    });
  });
  $('#fs').addEventListener('submit', async (e) => {
    e.preventDefault();
    await ocupado(e.submitter, async () => {
      try { await api('PUT', '/auth/senha', { atual: $('#atual').value, nova: $('#nova').value }); e.target.reset(); aviso('Senha trocada.'); }
      catch (err) { aviso(err.message, 'erro'); }
    });
  });
}
