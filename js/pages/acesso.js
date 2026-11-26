// Entrar, criar conta, esqueci a senha, nova senha, minha conta
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao, urlFoto, pode } from '../api.js';
import { esc, $, aviso, ocupado, direitos, icon, foto, temaAtual, aplicarTema } from '../ui.js';
import { entrou, sair, parametrosHash, navegar, menuPermitido, itensCelular } from '../app.js';

// "GESTÃO DO / HYPE" no estilo do Instagram do Hype
const marcaHype = (classe = '') => `<div class="marca-hype ${classe}"><span>Gestão do</span><b><img class="claro-some" src="assets/img/hype-marca.svg" alt="Hype"><img class="escuro-some" src="assets/img/hype-marca-preto.svg" alt=""></b></div>`;

function tela(app, html) {
  app.innerHTML = `<div class="acesso">
    <aside class="acesso-lado">
      <div></div>
      <div>
        ${marcaHype()}
        <p class="frase">Cadastro, chamada das sextas e cuidado pastoral do ministério de jovens.</p>
      </div>
      <div class="rod">${direitos()}</div>
    </aside>
    <main class="acesso-main"><div class="acesso-box">
      ${marcaHype('marca-mobile')}
      ${html}
    </div><footer class="so-mobile">${direitos()}</footer></main></div>`;
  ligarMostrarSenha(app);
}

// Olhinho para ver a senha
const OLHO = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OLHO_FECHADO = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function ligarMostrarSenha(raiz) {
  raiz.querySelectorAll('.senha-wrap button').forEach((b) => b.addEventListener('click', () => {
    const inp = b.previousElementSibling;
    const mostrar = inp.type === 'password';
    inp.type = mostrar ? 'text' : 'password';
    b.innerHTML = mostrar ? OLHO_FECHADO : OLHO;
    b.setAttribute('aria-label', mostrar ? 'Esconder a senha' : 'Ver a senha');
    b.title = b.getAttribute('aria-label');
    inp.focus();
  }));
}

const campoSenha = (id, rotulo, auto = 'current-password') => `<div class="field"><label for="${id}">${rotulo}</label>
  <div class="senha-wrap"><input class="input" id="${id}" type="password" autocomplete="${auto}" required><button type="button" aria-label="Ver a senha" title="Ver a senha">${OLHO}</button></div></div>`;

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
    <p class="rodape-form duas-pontas"><a href="#/esqueci-senha">Esqueci minha senha</a><span>Ainda não tem conta? <a href="#/criar-conta">Criar conta</a></span></p>`);
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

// ---------------- Aguardando liberação: boas-vindas "Você está no Hype" ----------------
// A liberação pode demorar: a tela confere sozinha de vez em quando e entra direto quando a conta for liberada.
let vigiaLiberacao = null;
export function aguardando(app) {
  document.body.dataset.tela = 'acesso';
  const nome = esc(sessao.usuario.nome.split(' ')[0]);
  app.innerHTML = `<div class="boas-vindas">
    <main>
      <div class="bv-arte" id="bv-arte" role="img" aria-label="Você está no Hype"></div>
      <h1>Olá, ${nome}!</h1>
      <p>Sua conta foi criada. Agora um administrador precisa liberar o seu acesso e colocar você nos grupos certos. Os administradores já foram avisados.</p>
      <p class="bv-calma">Pode levar um tempinho. Esta tela confere sozinha de vez em quando: quando o acesso for liberado, você entra direto.</p>
      <div class="bv-acoes"><button class="btn primary" id="verificar">Verificar agora</button><button class="link-btn" id="sair">Sair</button></div>
      <p class="bv-msg" id="bv-msg" aria-live="polite"></p>
    </main>
    <footer>${direitos()}</footer></div>`;
  fetch('assets/img/voce-esta-no-hype.svg').then((r) => r.text()).then((t) => { const el = $('#bv-arte'); if (el && t.trim().startsWith('<svg')) el.innerHTML = t; }).catch(() => {});

  const conferir = async (manual) => {
    try {
      const { usuario } = await api('GET', '/auth/eu');
      if (usuario.cd_status === 1) { clearInterval(vigiaLiberacao); vigiaLiberacao = null; await entrou(); return; }
      if (manual) $('#bv-msg').textContent = 'Ainda não foi liberado. Assim que for, esta tela entra sozinha.';
    } catch { if (manual) $('#bv-msg').textContent = 'Não deu para conferir agora. Tente de novo em instantes.'; }
  };
  clearInterval(vigiaLiberacao);
  vigiaLiberacao = setInterval(() => { if (!document.querySelector('.boas-vindas')) { clearInterval(vigiaLiberacao); vigiaLiberacao = null; return; } if (!document.hidden) conferir(false); }, 45000);
  $('#verificar').onclick = (e) => ocupado(e.currentTarget, () => conferir(true));
  $('#sair').onclick = () => { clearInterval(vigiaLiberacao); vigiaLiberacao = null; sair(); };
}

// ---------------- Minha conta ----------------
export function minhaConta(conteudo) {
  const u = sessao.usuario;
  const minhaFoto = u.pessoa_id && u.foto_v ? urlFoto(u.pessoa_id, u.foto_v) : null;
  // No celular a barra de baixo não cabe tudo: aqui ficam as outras telas
  const navCelular = new Set(itensCelular().filter((i) => !i.mais).map((i) => i.href));   // o que já está na barra de baixo
  const outras = menuPermitido().filter((i) => !navCelular.has(i.href) && i.href !== '/');
  const tema = temaAtual();
  conteudo.innerHTML = `
    <div class="cabecalho"><div class="perfil-conta">${foto(u.nome, minhaFoto, 'g')}<div><h1>Minha conta</h1><p class="sub">${esc(u.email)}${u.pessoa_id && pode('pessoas.ver') ? ' · <a href="#/pessoas/' + u.pessoa_id + '">Ver minha ficha</a>' : ''}</p></div></div>
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
