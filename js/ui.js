// Utilidades de interface
// © Arthur Ramon da Silva — Todos os direitos reservados.

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkSquare: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
  bars: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-10 6L2 7"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="3"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  cake: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M21 5h-4"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
};

export const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Toasts ----------
export function toast(msg, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `${icon(tipo === 'ok' ? 'check' : tipo === 'bad' ? 'alert' : 'info')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}
export const toastErro = (e) => { console.error(e); toast(e?.message || String(e), 'bad'); };

// ---------- Modal ----------
export function modal({ titulo, corpo, wide = false, onOpen, onClose }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${esc(titulo)}</h2><button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Fechar">${icon('x')}</button></div>
    <div class="modal-body">${corpo}</div></div>`;
  const fechar = () => { bg.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') fechar(); };
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) fechar(); });
  bg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', fechar));
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  onOpen?.(bg.querySelector('.modal'), fechar);
  return fechar;
}

export function confirmar(msg, { titulo = 'Confirmar', ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolve) => {
    let resp = false;
    modal({
      titulo,
      corpo: `<p style="margin:0;color:var(--text-2)">${esc(msg)}</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button>
        <button class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button></div>`,
      onOpen: (m, close) => {
        m.querySelector('[data-ok]').addEventListener('click', () => { resp = true; close(); });
      },
      onClose: () => resolve(resp),
    });
  });
}

// Coloca botão em estado "carregando" enquanto executa fn
export async function carregando(btn, fn) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner sm" style="border-top-color:currentColor"></span>';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
}

// ---------- Datas ----------
export const hojeISO = () => isoLocal(new Date());
export function isoLocal(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export function fmtData(s, opts = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!s) return '—';
  const d = s.length === 10 ? parseISO(s) : new Date(s);
  return d.toLocaleDateString('pt-BR', opts);
}
export const fmtDataCurta = (s) => fmtData(s, { day: '2-digit', month: 'short' }).replace('.', '');
export function idade(nasc) {
  if (!nasc) return null;
  const n = parseISO(nasc), h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
  return a;
}
// Sexta-feira mais recente (hoje, se for sexta)
export function ultimaSexta(base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const diff = (d.getDay() - 5 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
export function tempoRelativo(iso) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const m = Math.floor(dias / 30);
  return m === 1 ? 'há 1 mês' : `há ${m} meses`;
}

// ---------- Avatar ----------
const CORES = ['#5b3df5', '#2a78d6', '#1b9e6e', '#d4572a', '#c2417a', '#7c4ddb', '#0e7c86', '#b7791f'];
export function iniciais(nome = '') {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}
export function corNome(nome = '') {
  let h = 0; for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}
export function avatar(nome, url, cls = '') {
  return `<div class="avatar ${cls}" style="background:${corNome(nome)}">${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : esc(iniciais(nome))}</div>`;
}

export const TIPOS = { membro: 'Membro', visitante: 'Visitante', frequentador: 'Frequentador' };
export const badgeTipo = (t) => `<span class="badge ${t}">${TIPOS[t] || t}</span>`;

// ---------- Imagem: redimensiona antes de enviar (economiza espaço grátis) ----------
export function comprimirImagem(file, max = 600, qualidade = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const lado = Math.min(img.width, img.height);
      const sx = (img.width - lado) / 2, sy = (img.height - lado) / 2;
      const tam = Math.min(max, lado);
      const c = document.createElement('canvas');
      c.width = c.height = tam;
      c.getContext('2d').drawImage(img, sx, sy, lado, lado, 0, 0, tam, tam);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem.'))), 'image/jpeg', qualidade);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
    img.src = URL.createObjectURL(file);
  });
}

// ---------- CSV ----------
export function baixarCSV(nomeArquivo, linhas) {
  const csv = linhas.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export const copyright = () => `© ${new Date().getFullYear()} Gestão do Hype · Todos os direitos reservados a <b>Arthur Ramon da Silva</b>.`;
