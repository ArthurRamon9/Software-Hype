// Comunicação com a API (que fala com o SQL Server)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { aviso } from './ui.js';

const CHAVE = 'hype_token';
export const sessao = {
  token: localStorage.getItem(CHAVE),
  usuario: null,
};

export function guardarSessao(token, usuario) {
  sessao.token = token; sessao.usuario = usuario;
  if (token) localStorage.setItem(CHAVE, token); else localStorage.removeItem(CHAVE);
}

export const isAdmin = () => sessao.usuario?.papel === 'admin' && sessao.usuario?.cd_status === 1;

let avisouAcordando = false;

// api('GET', '/pessoas')  |  api('POST', '/pessoas', {...})
export async function api(metodo, caminho, corpo, tentativa = 1) {
  let r;
  try {
    r = await fetch('api' + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(sessao.token ? { 'X-Hype-Token': sessao.token } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new Error('Sem conexão. Verifique a internet e tente de novo.');
  }
  // Banco do plano grátis "acordando" depois de um tempo parado
  if (r.status === 503 && tentativa < 4) {
    if (!avisouAcordando) { aviso('Conectando ao banco, só um instante...'); avisouAcordando = true; }
    await new Promise((ok) => setTimeout(ok, 3000));
    return api(metodo, caminho, corpo, tentativa + 1);
  }
  avisouAcordando = false;
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && sessao.token && !caminho.startsWith('/auth/')) {
    guardarSessao(null, null);
    location.hash = '#/entrar';
    location.reload();
  }
  if (!r.ok) throw new Error(dados.erro || 'Algo deu errado. Tente de novo.');
  return dados;
}

export const urlFoto = (id, versao) => (versao ? `api/fotos/${id}?t=${encodeURIComponent(sessao.token)}&v=${encodeURIComponent(versao)}` : null);
