// Cliente Supabase + estado da sessão
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configurado = !SUPABASE_URL.startsWith('COLE_AQUI');

export const sb = configurado
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : null;

export const store = {
  session: null,
  profile: null,
};

export async function carregarPerfil() {
  if (!store.session) { store.profile = null; return null; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', store.session.user.id).maybeSingle();
  if (error) console.error(error);
  store.profile = data || null;
  return store.profile;
}

export const isAdmin = () => store.profile?.papel === 'admin' && store.profile?.cd_status === 1;

// Lança erro amigável se a resposta do Supabase falhar
export function ok({ data, error }) {
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

export function traduzErro(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Você ainda não confirmou seu e-mail. Verifique sua caixa de entrada (e o spam).';
  if (m.includes('user already registered')) return 'Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.';
  if (m.includes('password should be at least')) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
  if (m.includes('same as the old') || m.includes('should be different')) return 'A nova senha precisa ser diferente da anterior.';
  if (m.includes('duplicate key') && m.includes('encontros')) return 'Já existe um encontro nesta data.';
  if (m.includes('duplicate key')) return 'Esse registro já existe.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Você não tem permissão para fazer isso.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique sua internet.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'E-mail inválido.';
  return msg || 'Algo deu errado. Tente novamente.';
}

// ---------- Fotos (bucket privado com links assinados) ----------
const cacheFotos = new Map();
export async function urlsFotos(paths) {
  const faltando = [...new Set(paths.filter((p) => p && !cacheFotos.has(p)))];
  if (faltando.length) {
    const { data } = await sb.storage.from('fotos').createSignedUrls(faltando, 60 * 60 * 6);
    (data || []).forEach((d) => d.signedUrl && cacheFotos.set(d.path, d.signedUrl));
  }
  const out = {};
  paths.forEach((p) => { if (p && cacheFotos.has(p)) out[p] = cacheFotos.get(p); });
  return out;
}
export const limparCacheFoto = (p) => cacheFotos.delete(p);
