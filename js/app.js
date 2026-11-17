// Gestão do Hype — inicialização, rotas e layout
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { sb, store, configurado, carregarPerfil, isAdmin } from './supabase.js';
import { icon, esc, avatar, copyright, $ } from './ui.js';
import * as auth from './pages/auth.js';
import * as dashboard from './pages/dashboard.js';
import * as pessoas from './pages/pessoas.js';
import * as presenca from './pages/presenca.js';
import * as pastoral from './pages/pastoral.js';
import * as relatorios from './pages/relatorios.js';
import * as ministerios from './pages/ministerios.js';
import * as usuarios from './pages/usuarios.js';

const app = document.getElementById('app');

// ---------- Rotas ----------
const PUBLICAS = {
  '/login': auth.login,
  '/cadastro': auth.cadastro,
  '/esqueci-senha': auth.esqueci,
};
const PRIVADAS = [
  ['/', dashboard.render],
  ['/pessoas', pessoas.lista],
  ['/pessoas/nova', pessoas.form],
  ['/pessoas/:id', pessoas.perfil],
  ['/pessoas/:id/editar', pessoas.form],
  ['/presenca', presenca.render],
  ['/pastoral', pastoral.render],
  ['/relatorios', relatorios.render],
  ['/ministerios', ministerios.render],
  ['/usuarios', usuarios.render, 'admin'],
  ['/minha-conta', auth.minhaConta],
];

const MENU = [
  { href: '/', label: 'Início', ic: 'home', mobile: true },
  { href: '/pessoas', label: 'Pessoas', ic: 'users', mobile: true },
  { href: '/presenca', label: 'Presença', ic: 'checkSquare', mobile: true },
  { href: '/pastoral', label: 'Pastoral', ic: 'heart', mobile: true, badge: 'pastoral' },
  { href: '/relatorios', label: 'Relatórios', ic: 'chart', mobile: true },
  { sep: 'Configurações' },
  { href: '/ministerios', label: 'Ministérios', ic: 'layers' },
  { href: '/usuarios', label: 'Acessos', ic: 'shield', admin: true, badge: 'pendentes' },
  { href: '/minha-conta', label: 'Minha conta', ic: 'user' },
];

const badges = { pastoral: 0, pendentes: 0 };

function match(path) {
  for (const [pattern, fn, req] of PRIVADAS) {
    const a = pattern.split('/'), b = path.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = decodeURIComponent(b[i])), true) : seg === b[i]))) {
      return { fn, params, req };
    }
  }
  return null;
}

export const navegar = (path) => { location.hash = '#' + path; };
const caminhoAtual = () => (location.hash.replace(/^#/, '').split('?')[0] || '/');

let limpezaAnterior = null;
let modoRecuperacao = false;

async function rota() {
  if (typeof limpezaAnterior === 'function') { try { limpezaAnterior(); } catch {} }
  limpezaAnterior = null;
  document.querySelectorAll('.modal-bg').forEach((m) => m.remove());

  if (!configurado) return auth.naoConfigurado(app);

  const path = caminhoAtual();

  if (modoRecuperacao) return auth.novaSenha(app, () => { modoRecuperacao = false; navegar('/'); });

  if (!store.session) {
    const pub = PUBLICAS[path];
    if (pub) return pub(app);
    return navegar('/login');
  }

  if (PUBLICAS[path]) return navegar('/');

  if (!store.profile || store.profile.cd_status !== 1) return auth.aguardando(app);

  const m = match(path);
  if (!m || (m.req === 'admin' && !isAdmin())) return navegar('/');

  montarLayout(path);
  const content = $('#content');
  content.innerHTML = '<div class="boot" style="min-height:40vh"><div class="spinner"></div></div>';
  window.scrollTo(0, 0);
  try {
    limpezaAnterior = await m.fn(content, m.params);
  } catch (e) {
    console.error(e);
    content.innerHTML = `<div class="card empty">${icon('alert')}<h2>Ops! Não foi possível carregar.</h2><p>${esc(e.message)}</p>
      <button class="btn btn-primary" onclick="location.reload()">Tentar novamente</button></div>`;
  }
}

function linkMenu(item, path, mobile = false) {
  const ativo = item.href === '/' ? path === '/' : path.startsWith(item.href);
  const n = item.badge ? badges[item.badge] : 0;
  const b = n ? `<span class="badge count">${n}</span>` : '';
  if (mobile) return `<a href="#${item.href}" class="${ativo ? 'active' : ''}">${icon(item.ic)}${b}<span>${item.label}</span></a>`;
  return `<a href="#${item.href}" class="${ativo ? 'active' : ''}">${icon(item.ic)}<span>${item.label}</span>${b}</a>`;
}

function montarLayout(path) {
  const p = store.profile;
  const itens = MENU.filter((i) => !i.admin || isAdmin());
  const nav = itens.map((i) => (i.sep ? `<div class="nav-label">${i.sep}</div>` : linkMenu(i, path))).join('');
  const navMobile = itens.filter((i) => i.mobile).map((i) => linkMenu(i, path, true)).join('');

  if (!$('#content')) {
    app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><img src="assets/img/logo.svg" alt=""><div>Gestão do Hype<small>Ministério de Jovens</small></div></div>
        <nav class="nav" id="nav"></nav>
        <div class="me" id="me"></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="brand"><img src="assets/img/logo.svg" alt="">Gestão do Hype</div>
          <a href="#/minha-conta" id="me-mobile" aria-label="Minha conta"></a>
        </header>
        <main class="content" id="content"></main>
        <footer class="footer">${copyright()}</footer>
      </div>
      <nav class="bottom-nav" id="bottom-nav"></nav>
    </div>`;
  }
  $('#nav').innerHTML = nav;
  $('#bottom-nav').innerHTML = navMobile;
  $('#me').innerHTML = `${avatar(p.nome, null, 'sm')}<div class="who"><b>${esc(p.nome)}</b><span>${esc(p.papel)}</span></div>
    <button class="btn btn-ghost btn-icon btn-sm" id="sair" title="Sair">${icon('logout')}</button>`;
  $('#me-mobile').innerHTML = avatar(p.nome, null, 'sm');
  $('#sair').onclick = sair;
}

export async function sair() {
  await sb.auth.signOut();
  store.session = null; store.profile = null;
  app.innerHTML = '';
  navegar('/login');
}

// Atualiza contadores do menu (casos pastorais abertos / acessos pendentes)
export async function atualizarBadges() {
  if (!store.profile || store.profile.cd_status !== 1) return;
  const [c, u] = await Promise.all([
    sb.from('pastoral_casos').select('id', { count: 'exact', head: true }).neq('status', 'concluido'),
    isAdmin() ? sb.from('profiles').select('id', { count: 'exact', head: true }).eq('cd_status', 0) : Promise.resolve({ count: 0 }),
  ]);
  badges.pastoral = c.count || 0;
  badges.pendentes = u.count || 0;
  if ($('#nav')) montarLayout(caminhoAtual());
}

// ---------- Inicialização ----------
async function iniciar() {
  if (!configurado) return rota();

  // Links que chegam do e-mail (recuperação de senha / confirmação) vêm no #hash
  const hashInicial = location.hash;
  if (hashInicial.includes('type=recovery')) modoRecuperacao = true;
  const erroLink = hashInicial.includes('error_description')
    ? decodeURIComponent((hashInicial.match(/error_description=([^&]+)/) || [])[1] || '').replace(/\+/g, ' ')
    : null;

  sb.auth.onAuthStateChange(async (evento, session) => {
    if (evento === 'PASSWORD_RECOVERY') { modoRecuperacao = true; }
    if (evento === 'SIGNED_OUT') { store.session = null; store.profile = null; }
    if (evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') store.session = session;
  });

  const { data } = await sb.auth.getSession();
  store.session = data.session;
  if (store.session) await carregarPerfil();

  window.addEventListener('hashchange', rota);

  // Limpa os tokens da URL e decide para onde ir
  if (hashInicial.includes('access_token') || erroLink) {
    history.replaceState(null, '', location.pathname + (modoRecuperacao ? '#/nova-senha' : '#/'));
    if (erroLink) sessionStorage.setItem('hype_aviso', /expired|invalid/i.test(erroLink)
      ? 'Este link expirou ou já foi usado. Peça um novo.' : erroLink);
  }
  await rota();
  atualizarBadges();
}

// Recarrega o perfil após login (chamado pelas telas de auth)
export async function aposLogin(session) {
  store.session = session;
  await carregarPerfil();
  app.innerHTML = '';
  if (caminhoAtual() === '/') await rota(); else navegar('/');
  atualizarBadges();
}

iniciar();
