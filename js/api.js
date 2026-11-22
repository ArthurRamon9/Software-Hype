// Comunicação com a API (que fala com o SQL Server)
// © Arthur Ramon da Silva — Todos os direitos reservados.
//
// A sessão fica num cookie HttpOnly: o JavaScript da página não consegue lê-lo,
// então nem um script malicioso consegue roubar o login.
import { aviso } from './ui.js';

export const sessao = { usuario: null };

export const pode = (permissao) => !!sessao.usuario?.permissoes?.includes(permissao);
export const podeAlgum = (...ps) => ps.some(pode);

let avisouAcordando = false;

// ---------- Memória das consultas (deixa o site rápido) ----------
// Uma tela já aberta aparece na hora com o que já veio; por trás, o site confere no servidor e,
// se algo mudou (outra pessoa mexeu), avisa a tela para se redesenhar. Qualquer gravação limpa a memória.
// A chamada (/presenca) e o login nunca usam a memória: precisam estar sempre fresquinhos.
const memoria = new Map();            // caminho -> { dados, texto, quando }
const buscando = new Map();           // caminho -> promessa em andamento (não pede duas vezes a mesma coisa)
const VALIDADE_MS = 5 * 60 * 1000;
export const usadosNaTela = new Set();
const podeGuardar = (caminho) => !/^\/(auth|presenca|fotos)/.test(caminho);
let geracao = 0;                      // muda a cada gravação: resposta antiga que chegar atrasada é descartada
export const esquecerTudo = () => { memoria.clear(); buscando.clear(); geracao++; };

async function buscarFresco(caminho) {
  if (buscando.has(caminho)) return buscando.get(caminho);
  const minha = geracao;
  const p = chamar('GET', caminho).then((dados) => {
    if (minha !== geracao) return dados;
    const texto = JSON.stringify(dados);
    const antes = memoria.get(caminho);
    memoria.set(caminho, { dados, texto, quando: Date.now() });
    if (antes && antes.texto !== texto) window.dispatchEvent(new CustomEvent('hype:atualizou', { detail: caminho }));
    return dados;
  }).finally(() => { if (buscando.get(caminho) === p) buscando.delete(caminho); });
  buscando.set(caminho, p);
  return p;
}
// Copia para a tela poder mexer à vontade sem estragar a memória
const copia = (d) => (typeof structuredClone === 'function' ? structuredClone(d) : JSON.parse(JSON.stringify(d)));

// Esquenta a memória antes de a pessoa abrir a tela (ao passar o mouse ou tocar no menu)
export function preaquecer(caminho) {
  if (!podeGuardar(caminho)) return;
  const m = memoria.get(caminho);
  if (m && Date.now() - m.quando < 15000) return;
  buscarFresco(caminho).catch(() => {});
}

// Tela atual: cada troca de tela ganha um número. Uma consulta pedida por uma tela que já foi
// trocada (a pessoa clicou rápido em outro módulo) nunca responde, para a tela velha não se
// desenhar por cima da nova. Gravações (POST/PUT/DELETE) sempre respondem.
let telaAtual = 0;
export const novaTela = () => ++telaAtual;
novaTela.atual = () => telaAtual;
const nunca = () => new Promise(() => {});

export async function api(metodo, caminho, corpo, { sempre = false } = {}) {
  if (metodo !== 'GET' || sempre || caminho.startsWith('/auth/')) return pedir(metodo, caminho, corpo);
  const minha = telaAtual;
  let r;
  try { r = await pedir(metodo, caminho, corpo); } catch (e) { if (minha !== telaAtual) return nunca(); throw e; }
  return minha !== telaAtual ? nunca() : r;
}

async function pedir(metodo, caminho, corpo) {
  if (metodo === 'GET' && podeGuardar(caminho)) {
    usadosNaTela.add(caminho);
    const m = memoria.get(caminho);
    if (m && Date.now() - m.quando < VALIDADE_MS) {
      buscarFresco(caminho).catch(() => {});   // confere por trás
      return copia(m.dados);
    }
    return copia(await buscarFresco(caminho));
  }
  if (metodo !== 'GET') esquecerTudo();
  try { return await chamar(metodo, caminho, corpo); } finally { if (metodo !== 'GET') esquecerTudo(); }
}

async function chamar(metodo, caminho, corpo, tentativa = 1) {
  let r;
  try {
    r = await fetch('api' + caminho, {
      method: metodo,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Hype': '1' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new Error('Sem conexão. Verifique a internet e tente de novo.');
  }
  // Banco do plano grátis "acordando" depois de um tempo parado
  if (r.status === 503 && tentativa < 4) {
    if (!avisouAcordando) { aviso('Conectando ao banco, só um instante...'); avisouAcordando = true; }
    await new Promise((ok) => setTimeout(ok, 3000));
    return chamar(metodo, caminho, corpo, tentativa + 1);
  }
  avisouAcordando = false;
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && sessao.usuario && !caminho.startsWith('/auth/')) {
    sessao.usuario = null;
    location.hash = '#/entrar';
    location.reload();
  }
  if (!r.ok) throw new Error(dados.erro || `Algo deu errado (código ${r.status}). Tente de novo.`);
  return dados;
}

export const urlFoto = (id, versao) => (versao ? `api/fotos/${id}?v=${encodeURIComponent(versao)}` : null);
