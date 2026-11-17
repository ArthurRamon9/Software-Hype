// Telas de acesso: login, cadastro, esqueci a senha, nova senha, minha conta
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { sb, store, traduzErro, carregarPerfil } from '../supabase.js';
import { icon, esc, $, toast, carregando, copyright, avatar } from '../ui.js';
import { aposLogin, sair, navegar } from '../app.js';

const urlRetorno = () => location.origin + location.pathname;

function shell(app, html) {
  app.innerHTML = `
  <div class="auth">
    <section class="auth-side">
      <div class="brand"><img src="assets/img/logo.svg" alt="">Gestão do Hype</div>
      <div>
        <h2>Cuidar de cada jovem, sem perder ninguém de vista.</h2>
        <p>Cadastro, presença das sextas, ministérios e pastoral — tudo em um só lugar, no computador ou no celular.</p>
        <ul>
          <li>${icon('users')} Cadastro completo dos jovens, com foto</li>
          <li>${icon('checkSquare')} Presença semanal em poucos toques</li>
          <li>${icon('heart')} Alertas de faltas para a Pastoral</li>
          <li>${icon('chart')} Relatórios semanais, mensais e anuais</li>
        </ul>
      </div>
      <small style="opacity:.7">${copyright()}</small>
    </section>
    <section class="auth-main">
      <div class="auth-card">
        <img class="logo-mobile" src="assets/img/logo.svg" alt="">
        ${html}
      </div>
      <div class="auth-foot">${copyright()}</div>
    </section>
  </div>`;
  // Mostrar/ocultar senha
  app.querySelectorAll('.toggle-pass').forEach((b) => b.addEventListener('click', () => {
    const inp = b.parentElement.querySelector('input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    b.innerHTML = icon(inp.type === 'password' ? 'eye' : 'eyeOff');
  }));
}

const campoEmail = (id = 'email', valor = '') => `
  <div class="field"><label for="${id}">E-mail</label>
    <div class="input-wrap">${icon('mail')}<input class="input" id="${id}" type="email" autocomplete="email" required value="${esc(valor)}" placeholder="seuemail@exemplo.com"></div></div>`;
const campoSenha = (id, label, auto = 'current-password') => `
  <div class="field"><label for="${id}">${label}</label>
    <div class="input-wrap">${icon('lock')}<input class="input" id="${id}" type="password" autocomplete="${auto}" required minlength="8" placeholder="••••••••">
    <button type="button" class="toggle-pass" aria-label="Mostrar senha">${icon('eye')}</button></div></div>`;

function aviso(el, tipo, msg) {
  el.className = `notice ${tipo}`;
  el.innerHTML = `${icon(tipo === 'ok' ? 'check' : tipo === 'bad' ? 'alert' : 'info')}<span>${msg}</span>`;
  el.classList.remove('hidden');
}

function medidorSenha(input, barra) {
  input.addEventListener('input', () => {
    const v = input.value;
    let s = 0;
    if (v.length >= 8) s++;
    if (v.length >= 12) s++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    const cores = ['#e34948', '#e34948', '#eda100', '#eda100', '#1baf7a', '#138a4b'];
    barra.style.width = `${(s / 5) * 100}%`;
    barra.style.background = cores[s];
  });
}

// ---------------- LOGIN ----------------
export function login(app) {
  shell(app, `
    <h1>Bem-vindo de volta 👋</h1>
    <p class="sub">Entre com sua conta para acessar a Gestão do Hype.</p>
    <form id="f" novalidate>
      <div id="msg" class="hidden"></div>
      ${campoEmail()}
      ${campoSenha('senha', 'Senha')}
      <div class="row-between">
        <label class="check"><input type="checkbox" checked disabled> Manter conectado</label>
        <a href="#/esqueci-senha">Esqueceu a senha?</a>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Entrar</button>
    </form>
    <p class="alt">Ainda não tem acesso? <a href="#/cadastro">Criar conta</a></p>`);

  const msg = $('#msg');
  const avisoPendente = sessionStorage.getItem('hype_aviso');
  if (avisoPendente) { aviso(msg, 'warn', esc(avisoPendente)); sessionStorage.removeItem('hype_aviso'); }

  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim(), password = $('#senha').value;
    if (!email || !password) return aviso(msg, 'bad', 'Preencha e-mail e senha.');
    await carregando(e.submitter || $('#f button[type=submit]'), async () => {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return aviso(msg, 'bad', esc(traduzErro(error.message)));
      await aposLogin(data.session);
    });
  });
}

// ---------------- CADASTRO ----------------
export function cadastro(app) {
  shell(app, `
    <h1>Criar conta</h1>
    <p class="sub">Para quem serve no Hype. Depois de criar, um administrador libera seu acesso.</p>
    <form id="f" novalidate>
      <div id="msg" class="hidden"></div>
      <div class="field"><label for="nome">Nome completo</label>
        <div class="input-wrap">${icon('user')}<input class="input" id="nome" autocomplete="name" required placeholder="Seu nome"></div></div>
      ${campoEmail()}
      ${campoSenha('senha', 'Senha (mín. 8 caracteres)', 'new-password')}
      <div class="pass-meter"><span id="meter"></span></div>
      ${campoSenha('senha2', 'Confirme a senha', 'new-password')}
      <button class="btn btn-primary btn-block" type="submit">Criar conta</button>
    </form>
    <p class="alt">Já tem conta? <a href="#/login">Entrar</a></p>`);

  medidorSenha($('#senha'), $('#meter'));
  const msg = $('#msg');
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#nome').value.trim(), email = $('#email').value.trim();
    const s1 = $('#senha').value, s2 = $('#senha2').value;
    if (nome.length < 3) return aviso(msg, 'bad', 'Informe seu nome completo.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return aviso(msg, 'bad', 'Informe um e-mail válido.');
    if (s1.length < 8) return aviso(msg, 'bad', 'A senha precisa ter pelo menos 8 caracteres.');
    if (s1 !== s2) return aviso(msg, 'bad', 'As senhas não conferem.');
    await carregando($('#f button[type=submit]'), async () => {
      const { data, error } = await sb.auth.signUp({
        email, password: s1, options: { data: { nome }, emailRedirectTo: urlRetorno() },
      });
      if (error) return aviso(msg, 'bad', esc(traduzErro(error.message)));
      if (data.session) return aposLogin(data.session);
      $('#f').innerHTML = `<div class="notice ok">${icon('mail')}<span><b>Quase lá!</b> Enviamos um link de confirmação para <b>${esc(email)}</b>.
        Abra seu e-mail (confira também o spam) e clique no link para ativar sua conta.</span></div>
        <a class="btn btn-ghost btn-block" href="#/login">Voltar para o login</a>`;
    });
  });
}

// ---------------- ESQUECI A SENHA ----------------
export function esqueci(app) {
  shell(app, `
    <a href="#/login" class="small" style="display:inline-flex;gap:6px;align-items:center;margin-bottom:18px">${icon('arrowLeft')} Voltar</a>
    <h1>Esqueceu a senha?</h1>
    <p class="sub">Sem problema! Informe seu e-mail cadastrado e enviaremos um link para você criar uma nova senha.</p>
    <form id="f" novalidate>
      <div id="msg" class="hidden"></div>
      ${campoEmail()}
      <button class="btn btn-primary btn-block" type="submit">Enviar link de recuperação</button>
    </form>`);

  const msg = $('#msg');
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return aviso(msg, 'bad', 'Informe um e-mail válido.');
    await carregando($('#f button[type=submit]'), async () => {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: urlRetorno() });
      if (error && /rate|security/i.test(error.message)) return aviso(msg, 'bad', esc(traduzErro(error.message)));
      // Mensagem neutra: não revela se o e-mail existe ou não (segurança)
      $('#f').innerHTML = `<div class="notice ok">${icon('mail')}<span>Se <b>${esc(email)}</b> estiver cadastrado, você vai receber um e-mail
        com o link para redefinir a senha em instantes. Confira também a caixa de spam.</span></div>
        <a class="btn btn-ghost btn-block" href="#/login">Voltar para o login</a>`;
    });
  });
}

// ---------------- NOVA SENHA (vindo do link do e-mail) ----------------
export function novaSenha(app, concluir) {
  shell(app, `
    <h1>Criar nova senha</h1>
    <p class="sub">Escolha uma senha nova para sua conta.</p>
    <form id="f" novalidate>
      <div id="msg" class="hidden"></div>
      ${campoSenha('senha', 'Nova senha (mín. 8 caracteres)', 'new-password')}
      <div class="pass-meter"><span id="meter"></span></div>
      ${campoSenha('senha2', 'Confirme a nova senha', 'new-password')}
      <button class="btn btn-primary btn-block" type="submit">Salvar nova senha</button>
    </form>`);
  medidorSenha($('#senha'), $('#meter'));
  const msg = $('#msg');
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s1 = $('#senha').value, s2 = $('#senha2').value;
    if (s1.length < 8) return aviso(msg, 'bad', 'A senha precisa ter pelo menos 8 caracteres.');
    if (s1 !== s2) return aviso(msg, 'bad', 'As senhas não conferem.');
    await carregando($('#f button[type=submit]'), async () => {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) return aviso(msg, 'bad', 'Link expirado. <a href="#/esqueci-senha" onclick="location.reload()">Peça um novo</a>.');
      const { error } = await sb.auth.updateUser({ password: s1 });
      if (error) return aviso(msg, 'bad', esc(traduzErro(error.message)));
      toast('Senha alterada com sucesso!');
      store.session = s.session;
      await carregarPerfil();
      app.innerHTML = '';
      concluir();
    });
  });
}

// ---------------- AGUARDANDO APROVAÇÃO ----------------
export function aguardando(app) {
  const p = store.profile;
  shell(app, `
    <div class="notice warn" style="margin-bottom:20px">${icon('info')}<span>Conta criada, mas ainda <b>aguardando liberação</b>.</span></div>
    <h1>Olá${p ? ', ' + esc(p.nome.split(' ')[0]) : ''}!</h1>
    <p class="sub">Por segurança, os dados dos jovens só ficam visíveis depois que um administrador do Hype aprova seu acesso.
    Avise um líder que você já criou sua conta. Assim que liberarem, é só recarregar esta página.</p>
    <div style="display:grid;gap:10px">
      <button class="btn btn-primary btn-block" id="recarregar">Já fui liberado — recarregar</button>
      <button class="btn btn-ghost btn-block" id="sair">Sair</button>
    </div>`);
  $('#recarregar').onclick = () => location.reload();
  $('#sair').onclick = sair;
}

// ---------------- SITE AINDA NÃO CONFIGURADO ----------------
export function naoConfigurado(app) {
  shell(app, `
    <h1>Quase pronto ⚙️</h1>
    <p class="sub">O site ainda não está ligado ao banco de dados.</p>
    <div class="notice info">${icon('info')}<span>Abra o arquivo <b>js/config.js</b> e cole a <b>Project URL</b> e a <b>anon key</b> do Supabase.
    O passo a passo completo está no <b>README.md</b> do projeto.</span></div>`);
}

// ---------------- MINHA CONTA ----------------
export function minhaConta(content) {
  const p = store.profile;
  content.innerHTML = `
    <div class="page-head"><div><h1>Minha conta</h1><p>Seus dados de acesso.</p></div></div>
    <div class="grid grid-2">
      <div class="card">
        <div class="profile-head" style="margin-bottom:18px">${avatar(p.nome, null, 'lg')}
          <div class="info"><h2>${esc(p.nome)}</h2><div class="muted">${esc(p.email)}</div>
          <div class="tags"><span class="badge ok" style="text-transform:capitalize">${esc(p.papel)}</span></div></div></div>
        <form id="fn" class="grid" style="gap:14px">
          <div class="field"><label for="nome">Nome</label><input class="input" id="nome" value="${esc(p.nome)}" required></div>
          <button class="btn btn-primary">Salvar nome</button>
        </form>
      </div>
      <div class="card">
        <h2 style="margin-bottom:14px">Alterar senha</h2>
        <form id="fs" class="grid" style="gap:14px">
          ${campoSenha('senha', 'Nova senha', 'new-password')}
          ${campoSenha('senha2', 'Confirme a nova senha', 'new-password')}
          <button class="btn btn-primary">Alterar senha</button>
        </form>
        <hr style="border:0;border-top:1px solid var(--border);margin:22px 0">
        <button class="btn btn-ghost btn-block" id="sair2">${icon('logout')} Sair da conta</button>
      </div>
    </div>`;
  content.querySelectorAll('.toggle-pass').forEach((b) => b.addEventListener('click', () => {
    const inp = b.parentElement.querySelector('input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }));
  $('#sair2').onclick = sair;
  $('#fn').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#nome').value.trim();
    if (nome.length < 3) return toast('Informe seu nome.', 'bad');
    await carregando(e.submitter, async () => {
      const { error } = await sb.from('profiles').update({ nome }).eq('id', p.id);
      if (error) return toast(traduzErro(error.message), 'bad');
      await carregarPerfil();
      toast('Nome atualizado!');
      navegar('/minha-conta');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
  $('#fs').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s1 = $('#senha').value, s2 = $('#senha2').value;
    if (s1.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', 'bad');
    if (s1 !== s2) return toast('As senhas não conferem.', 'bad');
    await carregando(e.submitter, async () => {
      const { error } = await sb.auth.updateUser({ password: s1 });
      if (error) return toast(traduzErro(error.message), 'bad');
      e.target.reset();
      toast('Senha alterada!');
    });
  });
}
