// Fotos das listas: em vez de uma ida ao servidor por foto, o site pede as que aparecem na tela de uma vez só
// e recebe miniaturas leves. As miniaturas ficam guardadas no aparelho: na próxima visita aparecem na hora.
// Enquanto a foto não chega, aparecem as iniciais da pessoa.
// © Arthur Ramon da Silva — Todos os direitos reservados.

const LADO = 128;                    // tamanho da miniatura (as fotos das listas aparecem com até 52 px)
const memoria = new Map();           // `${id}|${versao}` -> data URL
let banco = null;

function abrirBanco() {
  if (!banco) {
    banco = new Promise((ok) => {
      try {
        const r = indexedDB.open('hype-fotos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('mini');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ok(null);
      } catch { ok(null); }
    });
  }
  return banco;
}
async function lerGuardadas(chaves) {
  const db = await abrirBanco();
  if (!db) return {};
  return new Promise((ok) => {
    const achou = {};
    try {
      const t = db.transaction('mini');
      const st = t.objectStore('mini');
      chaves.forEach((k) => { const r = st.get(k); r.onsuccess = () => { if (r.result) achou[k] = r.result; }; });
      t.oncomplete = () => ok(achou);
      t.onerror = () => ok(achou);
    } catch { ok(achou); }
  });
}
async function guardar(k, url) {
  memoria.set(k, url);
  const db = await abrirBanco();
  try { db?.transaction('mini', 'readwrite').objectStore('mini').put(url, k); } catch { /* sem espaço: fica só na memória */ }
}

// Só quem pode trocar fotos (pessoas.editar) devolve ao servidor a miniatura de uma foto antiga; os outros guardam só no aparelho
let enviaMini = false;
export const podeEnviarMini = (sim) => { enviaMini = !!sim; };

// Miniatura já em mãos (a tela já desenha a foto direto, sem esperar)
export const miniPronta = (id, v) => memoria.get(`${id}|${v}`) || null;

// Reduz uma foto (qualquer tamanho) para um quadrado pequeno, cortando no centro
export function reduzir(src, lado = LADO) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = lado;
      const menor = Math.min(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, (img.naturalWidth - menor) / 2, (img.naturalHeight - menor) / 2, menor, menor, 0, 0, lado, lado);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = erro;
    img.src = src;
  });
}

function pintar(id, url) {
  document.querySelectorAll(`img[data-foto="${id}"]`).forEach((img) => { if (img.getAttribute('src') !== url) img.src = url; });
}

// Fila: junta as fotos que apareceram na tela e pede todas juntas
const fila = new Map();              // id -> versão
let espera = null;
function pedir(img) {
  fila.set(img.dataset.foto, img.dataset.v);
  clearTimeout(espera);
  espera = setTimeout(buscar, 25);
}
async function buscar() {
  const pedidos = [...fila.entries()];
  fila.clear();
  const guardadas = await lerGuardadas(pedidos.map(([id, v]) => `${id}|${v}`));
  const faltam = [];
  pedidos.forEach(([id, v]) => {
    const url = guardadas[`${id}|${v}`];
    if (url) { memoria.set(`${id}|${v}`, url); pintar(id, url); } else faltam.push([id, v]);
  });
  for (let i = 0; i < faltam.length; i += 24) {   // de 24 em 24: fotos antigas ainda vêm inteiras
    const parte = faltam.slice(i, i + 24);
    let r;
    try {
      const resp = await fetch(`api/fotos/lote?ids=${parte.map(([id]) => id).join(',')}`, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error();
      r = await resp.json();
    } catch {
      // Sem o lote: cada foto do jeito antigo
      parte.forEach(([id, v]) => pintar(id, `api/fotos/${id}?v=${encodeURIComponent(v)}`));
      continue;
    }
    r.fotos.forEach((f) => {
      const k = `${f.id}|${f.v}`;
      if (f.mini) {
        const url = `data:image/jpeg;base64,${f.mini}`;
        pintar(f.id, url); guardar(k, url);
      } else if (f.foto) {
        // Foto antiga, ainda sem miniatura: mostra a inteira, faz a miniatura e manda de volta para a próxima vez
        pintar(f.id, `data:image/jpeg;base64,${f.foto}`);
        reduzir(`data:image/jpeg;base64,${f.foto}`).then((mini) => {
          guardar(k, mini);
          if (enviaMini) fetch(`api/fotos/${f.id}/mini`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Hype': '1' }, body: JSON.stringify({ v: f.v, mini }) }).catch(() => {});
        }).catch(() => {});
      }
    });
  }
}

// Fica de olho nas telas: toda foto nova que chega perto da área visível entra na fila
export function ligarFotos() {
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((itens) => itens.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); pedir(e.target); } }), { rootMargin: '500px 0px' })
    : null;
  const olhar = (raiz) => raiz.querySelectorAll?.('img[data-foto]:not([src])').forEach((img) => (io ? io.observe(img) : pedir(img)));
  new MutationObserver((mudas) => mudas.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches('img[data-foto]:not([src])')) (io ? io.observe(n) : pedir(n));
    else olhar(n);
  }))).observe(document.body, { childList: true, subtree: true });
  olhar(document.body);
}

// Ao sair da conta: as fotos guardadas neste aparelho são apagadas (computador compartilhado)
export function esquecerFotos() {
  memoria.clear();
  try { indexedDB.deleteDatabase('hype-fotos'); } catch { /* nada a apagar */ }
  banco = null;
}
