// Foto de perfil: depois de escolher, a pessoa arrasta e dá zoom para enquadrar o rosto no círculo
// (mouse, roda do mouse, dedo e pinça no celular). Sai um JPEG quadrado de até 600px, feito no navegador.
// Também abre a foto grande quando clicam nela.
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { janela, esc, icon } from './ui.js';

const SAIDA = 600;
const ZOOM_MAX = 5;

function abrirImagem(arquivo) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('Não consegui abrir essa imagem. Tente uma foto JPG ou PNG.'));
    img.src = URL.createObjectURL(arquivo);
  });
}

// Abre a janela de ajuste. Devolve a foto pronta (data URL JPEG) ou null se a pessoa desistir.
export async function ajustarFoto(arquivo) {
  const img = await abrirImagem(arquivo);
  return new Promise((resolver) => {
    let resultado = null;
    janela({
      titulo: 'Ajustar a foto',
      avisarAoSair: false,
      aoFechar: () => { URL.revokeObjectURL(img.src); resolver(resultado); },
      corpo: `<div class="ajuste-foto">
        <div class="af-palco" id="af-palco" tabindex="0" aria-label="Arraste para posicionar a foto">
          <img id="af-img" src="${esc(img.src)}" alt="" draggable="false">
          <div class="af-mascara" aria-hidden="true"></div>
        </div>
        <div class="af-controles">
          <span class="af-ic" aria-hidden="true">−</span>
          <input type="range" id="af-zoom" min="1" max="${ZOOM_MAX}" step="0.01" value="1" aria-label="Zoom">
          <span class="af-ic" aria-hidden="true">+</span>
          <button type="button" class="btn sm" id="af-girar" title="Girar 90 graus">${icon('girar')}Girar</button>
        </div>
        <p class="hint">Arraste a foto para enquadrar o rosto no círculo. Use o controle${matchMedia('(pointer: coarse)').matches ? ' ou dois dedos' : ' ou a roda do mouse'} para o zoom.</p>
        <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" id="af-ok">Usar esta foto</button></div>
      </div>`,
      aoAbrir: (j, fechar) => {
        const palco = j.querySelector('#af-palco'), el = j.querySelector('#af-img'), barra = j.querySelector('#af-zoom');
        let giro = 0, zoom = 1, ox = 0, oy = 0;
        const lado = () => palco.clientWidth;
        // Tamanho da imagem já girada
        const dims = () => (giro % 180 ? [img.naturalHeight, img.naturalWidth] : [img.naturalWidth, img.naturalHeight]);
        const escala = () => { const [w, h] = dims(); return (lado() / Math.min(w, h)) * zoom; };
        // Não deixa aparecer fundo vazio dentro do quadrado
        const prender = () => {
          const [w, h] = dims(), k = escala(), S = lado();
          const mx = Math.max(0, (w * k - S) / 2), my = Math.max(0, (h * k - S) / 2);
          ox = Math.min(mx, Math.max(-mx, ox)); oy = Math.min(my, Math.max(-my, oy));
        };
        const pintar = () => {
          prender();
          el.style.width = `${img.naturalWidth}px`;
          el.style.transform = `translate(-50%, -50%) translate(${ox}px, ${oy}px) rotate(${giro}deg) scale(${escala()})`;
          barra.value = zoom;
        };
        const mudarZoom = (novo) => {
          const z = Math.min(ZOOM_MAX, Math.max(1, novo));
          // zoom pelo centro: a posição acompanha
          ox *= z / zoom; oy *= z / zoom; zoom = z; pintar();
        };

        // Arrastar (mouse e dedo) e pinça com dois dedos
        const toques = new Map();
        let pinca = null;
        palco.addEventListener('pointerdown', (e) => {
          palco.setPointerCapture(e.pointerId);
          toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (toques.size === 2) { const [a, b] = [...toques.values()]; pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; }
          palco.classList.add('arrastando');
        });
        palco.addEventListener('pointermove', (e) => {
          const antes = toques.get(e.pointerId); if (!antes) return;
          const agora = { x: e.clientX, y: e.clientY };
          toques.set(e.pointerId, agora);
          if (toques.size === 2 && pinca) {
            const [a, b] = [...toques.values()];
            mudarZoom(pinca.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinca.d));
            ox += (agora.x - antes.x) / 2; oy += (agora.y - antes.y) / 2; pintar();
          } else if (toques.size === 1) { ox += agora.x - antes.x; oy += agora.y - antes.y; pintar(); }
        });
        const soltar = (e) => { toques.delete(e.pointerId); if (toques.size < 2) pinca = null; if (!toques.size) palco.classList.remove('arrastando'); };
        palco.addEventListener('pointerup', soltar);
        palco.addEventListener('pointercancel', soltar);
        palco.addEventListener('wheel', (e) => { e.preventDefault(); mudarZoom(zoom * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
        // Teclado: setas movem, + e − dão zoom
        palco.addEventListener('keydown', (e) => {
          const passo = e.shiftKey ? 30 : 8;
          const mov = { ArrowLeft: [passo, 0], ArrowRight: [-passo, 0], ArrowUp: [0, passo], ArrowDown: [0, -passo] }[e.key];
          if (mov) { e.preventDefault(); ox += mov[0]; oy += mov[1]; pintar(); }
          else if (e.key === '+' || e.key === '=') mudarZoom(zoom * 1.1);
          else if (e.key === '-') mudarZoom(zoom / 1.1);
        });
        barra.addEventListener('input', () => mudarZoom(Number(barra.value)));
        j.querySelector('#af-girar').addEventListener('click', () => { giro = (giro + 90) % 360; [ox, oy] = [-oy, ox]; pintar(); });

        j.querySelector('#af-ok').addEventListener('click', () => {
          // Mesma conta da tela, numa tela de 600x600
          const S = lado(), k = escala(), [w, h] = dims();
          const out = Math.min(SAIDA, Math.round(Math.min(w, h) / zoom) || SAIDA);
          const c = document.createElement('canvas');
          c.width = c.height = out;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out, out);
          ctx.imageSmoothingQuality = 'high';
          ctx.translate(out / 2, out / 2);
          ctx.scale(out / S, out / S);
          ctx.translate(ox, oy);
          ctx.rotate((giro * Math.PI) / 180);
          ctx.scale(k, k);
          ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          resultado = c.toDataURL('image/jpeg', 0.85);
          fechar();
        });
        // A janela pode mudar de tamanho (celular girando): refaz a conta
        new ResizeObserver(() => pintar()).observe(palco);
        pintar();
        palco.focus({ preventScroll: true });
      },
    });
  });
}

// Ver a foto grande
export function verFoto(url, nome = '') {
  if (!url) return;
  janela({
    titulo: nome || 'Foto',
    avisarAoSair: false,
    corpo: `<div class="ver-foto"><img src="${esc(url)}" alt="${esc(nome ? `Foto de ${nome}` : 'Foto')}"></div>`,
  });
}
