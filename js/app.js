// Gestão do Hype — rotas, menu e layout
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao, guardarSessao, isAdmin } from './api.js';
import { icon, esc, direitos, $ } from './ui.js';
import * as acesso from './pages/acesso.js';
import * as inicio from './pages/inicio.js';
import * as pessoas from './pages/pessoas.js';
import * as presenca from './pages/presenca.js';
import * as pastoral from './pages/pastoral.js';
import * as relatorios from './pages/relatorios.js';
import * as ministerios from './pages/ministerios.js';
import * as usuarios from './pages/usuarios.js';

const app = document.getElementById('app');

const PUBLICAS = {
  '/entrar': acesso.entrar,
  '/criar-conta': acesso.criarConta,
  '/esqueci-senha': acesso.esqueci,
  '/nova-senha': acesso.novaSenha,
};
const PRIVADAS = [
  ['/', inicio.render],
  ['/pessoas', pessoas.lista],
  ['/pessoas/nova', pessoas.formulario],
  ['/pessoas/:id', pessoas.perfil],
  ['/pessoas/:id/editar', pessoas.formulario],
  ['/presenca', presenca.render],
  ['/pastoral', pastoral.render],
  ['/relatorios', relatorios.render],
  ['/ministerios', ministerios.render],
  ['/acessos', usuarios.render, 'admin'],
  ['/conta', acesso.minhaConta],
];

const MENU = [
  { href: '/', rotulo: 'Início', ic: 'inicio', mob: true },
  { href: '/pessoas', rotulo: 'Pessoas', ic: 'pessoas', mob: true },
  { href: '/presenca', rotulo: 'Presença', ic: 'presenca', mob: true },
  { href: '/pastoral', rotulo: 'Pastoral', ic: 'pastoral', mob: true, cont: 'pastoral' },
  { href: '/relatorios', rotulo: 'Relatórios', ic: 'relatorios', mob: true },
  { grupo: 'Cadastros' },
  { href: '/ministerios', rotulo: 'Ministérios', ic: 'ministerios' },
  { href: '/acessos', rotulo: 'Acessos', ic: 'acessos', admin: true, cont: 'pendentes' },
];
const contadores = { pastoral: 0, pendentes: 0 };

export const navegar = (c) => { location.hash = '#' + c; };
export const caminhoAtual = () => location.hash.replace(/^#/, '').split('?')[0] || '/';
export const parametrosHash = () => new URLSearchParams(location.hash.split('?')[1] || '');

function casar(caminho) {
  for (const [padrao, fn, req] of PRIVADAS) {
    const a = padrao.split('/'), b = caminho.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = decodeURIComponent(b[i])), true) : s === b[i]))) return { fn, params, req };
  }
  return null;
}

let limpar = null;
async function rota() {
  if (typeof limpar === 'function') { try { limpar(); } catch {} }
  limpar = null;
  document.querySelectorAll('.fundo').forEach((m) => m.remove());
  const caminho = caminhoAtual();

  if (PUBLICAS[caminho] && (caminho === '/nova-senha' || !sessao.usuario)) { document.body.dataset.tela = 'acesso'; return PUBLICAS[caminho](app); }
  if (!sessao.usuario) return navegar('/entrar');
  if (PUBLICAS[caminho]) return navegar('/');
  if (sessao.usuario.cd_status !== 1) return acesso.aguardando(app);

  const m = casar(caminho);
  if (!m || (m.req === 'admin' && !isAdmin())) return navegar('/');

  montarLayout(caminho);
  const conteudo = $('#conteudo');
  conteudo.innerHTML = '<div class="boot"><span class="spin"></span></div>';
  window.scrollTo(0, 0);
  try {
    limpar = await m.fn(conteudo, m.params);
  } catch (e) {
    console.error(e);
    conteudo.innerHTML = `<div class="painel vazio"><p>Não foi possível carregar esta página.</p><p class="small" style="margin:6px 0 14px">${esc(e.message)}</p>
      <button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
  }
}

function itemMenu(item, caminho, mobile) {
  const ativo = item.href === '/' ? caminho === '/' : caminho.startsWith(item.href);
  const n = item.cont ? contadores[item.cont] : 0;
  return `<a href="#${item.href}" class="${ativo ? 'ativo' : ''}">${icon(item.ic)}<span>${item.rotulo}</span>${n ? `<span class="n">${n}</span>` : ''}</a>`;
}

function montarLayout(caminho) {
  const u = sessao.usuario;
  const itens = MENU.filter((i) => !i.admin || isAdmin());
  if (!$('#conteudo')) {
    document.body.dataset.tela = 'app';
    app.innerHTML = `
    <div class="app">
      <aside class="lateral">
        <div class="marca"><img src="assets/img/logo.svg" alt="">Gestão do Hype</div>
        <nav class="menu" id="menu"></nav>
        <div class="conta" id="conta"></div>
      </aside>
      <div class="principal">
        <header class="topo-mobile"><div class="marca"><img src="assets/img/logo.svg" alt="">Gestão do Hype</div><a href="#/conta" id="conta-mobile"></a></header>
        <main class="conteudo" id="conteudo"></main>
        <footer class="rodape">${direitos()}</footer>
      </div>
      <nav class="nav-mobile" id="nav-mobile"></nav>
    </div>`;
  }
  $('#menu').innerHTML = itens.map((i) => (i.grupo ? `<div class="grupo">${i.grupo}</div>` : itemMenu(i, caminho))).join('');
  $('#nav-mobile').innerHTML = itens.filter((i) => i.mob).map((i) => itemMenu(i, caminho, true)).join('');
  $('#conta').innerHTML = `<b>${esc(u.nome)}</b><a href="#/conta">Minha conta</a>`;
  $('#conta-mobile').textContent = u.nome.split(' ')[0];
}

export async function atualizarContadores() {
  if (sessao.usuario?.cd_status !== 1) return;
  try {
    Object.assign(contadores, await api('GET', '/contadores'));
    if ($('#menu')) montarLayout(caminhoAtual());
  } catch {}
}

export function sair() {
  guardarSessao(null, null);
  app.innerHTML = '';
  navegar('/entrar');
}

export async function entrouCom({ token, usuario }) {
  guardarSessao(token, usuario);
  app.innerHTML = '';
  if (caminhoAtual() === '/') await rota(); else navegar('/');
  atualizarContadores();
}

async function iniciar() {
  if (sessao.token) {
    try { sessao.usuario = (await api('GET', '/auth/eu')).usuario; }
    catch (e) { if (/sessão/i.test(e.message)) guardarSessao(null, null); else { app.innerHTML = `<div class="acesso"><div class="acesso-box"><p>${esc(e.message)}</p><p style="margin-top:12px"><button class="btn" onclick="location.reload()">Tentar de novo</button></p></div></div>`; return; } }
  }
  window.addEventListener('hashchange', rota);
  await rota();
  atualizarContadores();
}

iniciar();
