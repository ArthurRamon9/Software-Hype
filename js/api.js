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

export async function api(metodo, caminho, corpo, tentativa = 1) {
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
    return api(metodo, caminho, corpo, tentativa + 1);
  }
  avisouAcordando = false;
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && sessao.usuario && !caminho.startsWith('/auth/')) {
    sessao.usuario = null;
    location.hash = '#/entrar';
    location.reload();
  }
  if (!r.ok) throw new Error(dados.erro || 'Algo deu errado. Tente de novo.');
  return dados;
}

export const urlFoto = (id, versao) => (versao ? `api/fotos/${id}?v=${encodeURIComponent(versao)}` : null);
