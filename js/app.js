// Gestão do Hype — rotas, menu e layout
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao, podeAlgum, urlFoto } from './api.js';
import { icon, esc, direitos, $, foto } from './ui.js';
import './campos.js';
import * as acesso from './pages/acesso.js';
import * as inicio from './pages/inicio.js';
import * as pessoas from './pages/pessoas.js';
import * as presenca from './pages/presenca.js';
import * as pastoral from './pages/pastoral.js';
import * as relatorios from './pages/relatorios.js';
import * as ministerios from './pages/ministerios.js';
import * as usuarios from './pages/usuarios.js';
import * as agenda from './pages/agenda.js';
import * as escalas from './pages/escalas.js';

const app = document.getElementById('app');

const PUBLICAS = {
  '/entrar': acesso.entrar,
  '/criar-conta': acesso.criarConta,
  '/esqueci-senha': acesso.esqueci,
  '/nova-senha': acesso.novaSenha,
};
// [caminho, tela, permissões (precisa de pelo menos uma)]
// Esconder a tela é só conforto: quem barra de verdade é a API, que confere a permissão em cada pedido.
const PRIVADAS = [
  ['/', inicio.render],
  ['/pessoas', pessoas.lista, ['pessoas.ver']],
  ['/pessoas/nova', pessoas.formulario, ['pessoas.editar']],
  ['/pessoas/:id', pessoas.perfil, ['pessoas.ver']],
  ['/pessoas/:id/editar', pessoas.formulario, ['pessoas.editar']],
  ['/presenca', presenca.render, ['presenca.marcar']],
  ['/pastoral', pastoral.render, ['pastoral.ver']],
  ['/integracao', pastoral.renderIntegracao, ['integracao.ver']],
  ['/relatorios', relatorios.render, ['relatorios.ver']],
  ['/ministerios', ministerios.render, ['pessoas.ver', 'ministerios.editar']],
  ['/acessos', usuarios.render, ['acessos.gerenciar']],
  ['/agenda', agenda.render],
  ['/escalas', escalas.render],
  ['/conta', acesso.minhaConta],
];

const MENU = [
  { href: '/', rotulo: 'Início', ic: 'inicio', mob: true },
  { href: '/pessoas', rotulo: 'Pessoas', ic: 'pessoas', mob: true, perm: ['pessoas.ver'] },
  { href: '/presenca', rotulo: 'Presença', ic: 'presenca', mob: true, perm: ['presenca.marcar'] },
  { href: '/integracao', rotulo: 'Integração', ic: 'integracao', mob: true, cont: 'integracao', perm: ['integracao.ver'] },
  { href: '/pastoral', rotulo: 'Pastoral', ic: 'pastoral', mob: true, cont: 'pastoral', perm: ['pastoral.ver'] },
  { href: '/relatorios', rotulo: 'Relatórios', ic: 'relatorios', mob: true, perm: ['relatorios.ver'] },
  { href: '/escalas', rotulo: 'Escalas', ic: 'escalas', mob: true },
  { href: '/agenda', rotulo: 'Agenda', ic: 'agenda', mob: true },
  { grupo: 'Cadastros', perm: ['pessoas.ver', 'ministerios.editar', 'acessos.gerenciar'] },
  { href: '/ministerios', rotulo: 'Ministérios', ic: 'ministerios', perm: ['pessoas.ver', 'ministerios.editar'] },
  { href: '/acessos', rotulo: 'Acessos', ic: 'acessos', cont: 'pendentes', perm: ['acessos.gerenciar'] },
];
const permitido = (perms) => !perms || podeAlgum(...perms);
const contadores = { pastoral: 0, pendentes: 0, integracao: 0 };

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
  if (!m) return navegar('/');
  montarLayout(caminho);
  const conteudo = $('#conteudo');
  if (!permitido(m.req)) {
    conteudo.innerHTML = `<div class="painel vazio"><b>Você não tem acesso a esta tela</b>Se precisar, peça a um administrador para incluir você no grupo certo.<br><a class="btn" href="#/" style="margin-top:14px">Ir para o Início</a></div>`;
    return;
  }
  conteudo.innerHTML = '<div class="boot"><span class="spin"></span></div>';
  window.scrollTo(0, 0);
  try {
    limpar = await m.fn(conteudo, m.params);
  } catch (e) {
    console.error(e);
    conteudo.innerHTML = `<div class="painel vazio"><p>Não foi possível carregar esta página.</p><p class="small" style="margin:6px 0 14px">${esc(e.message)}</p>
      <button class="btn" id="recarregar">Tentar de novo</button></div>`;
    $('#recarregar').addEventListener('click', () => location.reload());
  }
}

function itemMenu(item, caminho, mobile) {
  const ativo = item.href === '/' ? caminho === '/' : caminho.startsWith(item.href);
  const n = item.cont ? contadores[item.cont] : 0;
  return `<a href="#${item.href}" class="${ativo ? 'ativo' : ''}">${icon(item.ic)}<span>${item.rotulo}</span>${n ? `<span class="n">${n}</span>` : ''}</a>`;
}

// Itens do menu que a pessoa pode ver (o celular mostra até 5; se passar, o 5º vira "Mais")
export const menuPermitido = () => MENU.filter((i) => !i.grupo && permitido(i.perm));
function itensCelular() {
  const l = menuPermitido().filter((i) => i.mob);
  return l.length <= 5 ? l : [...l.slice(0, 4), { href: '/conta', rotulo: 'Mais', ic: 'mais', mais: true }];
}

function montarLayout(caminho) {
  const u = sessao.usuario;
  const itens = MENU.filter((i) => permitido(i.perm));
  if (!$('#conteudo')) {
    document.body.dataset.tela = 'app';
    app.innerHTML = `
    <div class="app">
      <aside class="lateral">
        <a class="marca" href="#/" title="Ir para o Início"><img src="assets/img/h-hype.svg" alt="">Gestão do Hype</a>
        <nav class="menu" id="menu"></nav>
        <a class="conta" id="conta" href="#/conta"></a>
      </aside>
      <div class="principal">
        <div class="faixa-ver-como" id="faixa-ver-como" hidden></div>
        <header class="topo-mobile"><a class="marca" href="#/" title="Ir para o Início"><img src="assets/img/h-hype.svg" alt="">Gestão do Hype</a><a href="#/conta" id="conta-mobile"></a></header>
        <main class="conteudo" id="conteudo"></main>
        <footer class="rodape">${direitos()}</footer>
      </div>
      <nav class="nav-mobile" id="nav-mobile"></nav>
    </div>`;
  }
  $('#menu').innerHTML = itens.map((i) => (i.grupo ? `<div class="grupo">${i.grupo}</div>` : itemMenu(i, caminho))).join('');
  const cel = itensCelular();
  $('#nav-mobile').innerHTML = cel.map((i) => (i.mais
    ? `<a href="#/conta" class="${caminho === '/conta' ? 'ativo' : ''}">${icon('mais')}<span>Mais</span></a>` : itemMenu(i, caminho, true))).join('');
  const minhaFoto = u.pessoa_id && u.foto_v ? urlFoto(u.pessoa_id, u.foto_v) : null;
  $('#conta').innerHTML = `${foto(u.nome, minhaFoto)}<div><b>${esc(u.nome)}</b><span>Minha conta</span></div>`;
  $('#conta-mobile').innerHTML = foto(u.nome, minhaFoto);
  // Ver como: faixa fixa avisando de quem é a tela e como voltar
  const faixa = $('#faixa-ver-como');
  if (u.verComoPor) {
    faixa.hidden = false;
    faixa.innerHTML = `<span>Você está vendo o sistema como <b>${esc(u.nome)}</b>. O que fizer aqui fica registrado no seu nome.</span><button class="btn sm" id="voltar-conta">Voltar para a minha conta</button>`;
    $('#voltar-conta').onclick = async () => { try { await api('POST', '/auth/voltar'); } catch {} location.hash = '#/acessos'; location.reload(); };
  } else faixa.hidden = true;
}

export async function atualizarContadores() {
  if (sessao.usuario?.cd_status !== 1) return;
  try {
    Object.assign(contadores, await api('GET', '/contadores'));
    if ($('#menu')) montarLayout(caminhoAtual());
  } catch {}
}

export async function sair() {
  try { await api('POST', '/auth/sair'); } catch {}
  sessao.usuario = null;
  app.innerHTML = '';
  navegar('/entrar');
}

// Depois de entrar/criar conta/trocar senha: busca quem é e quais permissões tem
export async function entrou() {
  sessao.usuario = (await api('GET', '/auth/eu')).usuario;
  app.innerHTML = '';
  if (caminhoAtual() === '/') await rota(); else navegar('/');
  atualizarContadores();
}

async function iniciar() {
  try { sessao.usuario = (await api('GET', '/auth/eu')).usuario; }
  catch (e) {
    if (!/sessão/i.test(e.message)) {
      app.innerHTML = `<div class="acesso"><div class="acesso-box"><p>${esc(e.message)}</p><p style="margin-top:12px"><button class="btn" id="recarregar">Tentar de novo</button></p></div></div>`;
      $('#recarregar').addEventListener('click', () => location.reload());
      return;
    }
  }
  window.addEventListener('hashchange', rota);
  window.addEventListener('hype:tema', () => { if (sessao.usuario && caminhoAtual() !== '/conta') rota(); });   // gráficos trocam de cor
  await rota();
  atualizarContadores();
}

iniciar();
