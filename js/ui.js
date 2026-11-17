// Utilidades de interface
// © Arthur Ramon da Silva — Todos os direitos reservados.

const P = {
  inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  presenca: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 15l2 2 4-4"/>',
  pastoral: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
  relatorios: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
  integracao: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  ministerios: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  acessos: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  conta: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
export const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- Aviso rápido ----------
export function aviso(msg, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `aviso ${tipo === 'erro' ? 'erro' : ''}`;
  el.textContent = msg;
  $('#avisos').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 5000 : 3000);
}
export const avisoErro = (e) => { console.error(e); aviso(e?.message || String(e), 'erro'); };

// ---------- Janela ----------
export function janela({ titulo, corpo, larga = false, aoAbrir, aoFechar }) {
  const fundo = document.createElement('div');
  fundo.className = 'fundo';
  fundo.innerHTML = `<div class="janela ${larga ? 'larga' : ''}" role="dialog" aria-modal="true">
    <div class="janela-topo"><h2>${esc(titulo)}</h2><button type="button" data-fechar aria-label="Fechar">×</button></div>
    <div class="janela-corpo">${corpo}</div></div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); aoFechar?.(); };
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  $$('[data-fechar]', fundo).forEach((b) => b.addEventListener('click', fechar));
  document.addEventListener('keydown', tecla);
  document.body.appendChild(fundo);
  aoAbrir?.(fundo.querySelector('.janela'), fechar);
  return fechar;
}

export function confirmar(msg, { botao = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolve) => {
    let sim = false;
    janela({
      titulo: 'Confirmar',
      corpo: `<p>${esc(msg)}</p><div class="janela-acoes"><button class="btn" data-fechar>Cancelar</button>
        <button class="btn ${perigo ? 'danger' : 'primary'}" data-sim>${esc(botao)}</button></div>`,
      aoAbrir: (j, fechar) => { j.querySelector('[data-sim]').onclick = () => { sim = true; fechar(); }; },
      aoFechar: () => resolve(sim),
    });
  });
}

export async function ocupado(btn, fn) {
  const texto = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = texto; }
}

// ---------- Datas ----------
export function isoLocal(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const hojeISO = () => isoLocal(new Date());
export const parseISO = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export function fmtData(s) {
  if (!s) return '—';
  const d = s.length === 10 ? parseISO(s) : new Date(s);
  return d.toLocaleDateString('pt-BR');
}
export const fmtDiaMes = (s) => parseISO(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
export function idade(nasc) {
  if (!nasc) return null;
  const n = parseISO(nasc), h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
  return a;
}
export function ultimaSexta(base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() - ((d.getDay() - 5 + 7) % 7));
  return d;
}
export function haQuanto(iso) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 45) return `há ${dias} dias`;
  return `em ${fmtData(iso)}`;
}

// ---------- Pessoas ----------
export function iniciais(nome = '') {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}
// Cada pessoa ganha sempre a mesma cor (calculada pelo nome)
const CORES_FOTO = ['#f0561d', '#2a78d6', '#1f8a57', '#c2417a', '#7a5af0', '#0e8a8a', '#b8860b', '#d14d72', '#3f6fb5', '#5a8f29'];
export function corDoNome(nome = '') {
  let h = 0; for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_FOTO[h % CORES_FOTO.length];
}
export const foto = (nome, url, classe = '') => `<span class="foto ${classe}" style="--cor:${corDoNome(nome)}">${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : esc(iniciais(nome))}</span>`;
// As 6 situações (a "jornada") usadas pelo Hype, na ordem do caminho de cada pessoa
export const SITUACOES = [
  { id: 'novo_visitante', nome: 'Novo visitante', cor: '#f0561d' },
  { id: 'visitante_regular', nome: 'Visitante regular', cor: '#d98a00' },
  { id: 'novo_membro', nome: 'Novo membro', cor: '#2a9d8f' },
  { id: 'membro', nome: 'Membro', cor: '#2a78d6' },
  { id: 'membro_ativo', nome: 'Membro ativo', cor: '#5b4bd6' },
  { id: 'ex_visitante', nome: 'Ex-visitante', cor: '#8a8679' },
];
export const TIPOS = Object.fromEntries(SITUACOES.map((x) => [x.id, x.nome]));
export const corSituacao = (t) => SITUACOES.find((x) => x.id === t)?.cor || '#8a8679';
export const ehMembro = (t) => ['novo_membro', 'membro', 'membro_ativo'].includes(t);
export const tagTipo = (t) => `<span class="tag situ" style="--c:${corSituacao(t)}">${esc(TIPOS[t] || t)}</span>`;
export const nomeComRef = (p) => `${esc(p.nome)}${p.referencia ? ` <span class="ref">${esc(p.referencia)}</span>` : ''}`;
export const linkWhats = (tel, mensagem = '') => {
  const n = String(tel || '').replace(/\D/g, '');
  if (n.length < 10) return null;
  return `https://wa.me/${n.length <= 11 ? '55' + n : n}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
};

// Reduz a foto antes de enviar (quadrada, até 600px, JPEG)
export function prepararFoto(arquivo, max = 600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const lado = Math.min(img.width, img.height);
      const tam = Math.min(max, lado);
      const c = document.createElement('canvas');
      c.width = c.height = tam;
      c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, tam, tam);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('Não consegui abrir essa imagem.'));
    img.src = URL.createObjectURL(arquivo);
  });
}


export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const direitos = () => `© ${new Date().getFullYear()} Gestão do Hype. Todos os direitos reservados a Arthur Ramon da Silva.`;

export function saudacao() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
