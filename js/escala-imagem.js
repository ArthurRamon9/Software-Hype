// Imagem da escala para mandar no grupo do WhatsApp.
// Desenhada no próprio navegador (canvas): nada passa pelo servidor.
// © Arthur Ramon da Silva — Todos os direitos reservados.

const W = 1080;
const PAD = 64;
const FUNDO = '#0f0f13';
const CARTAO = '#18181f';
const LINHA = 'rgba(255,255,255,.09)';
const TEXTO = '#f4f4f6';
const APAGADO = '#8d8d99';
const INCLINA = -0.18; // títulos inclinados, como no site

// Cor do ministério legível no fundo escuro: clareia as cores muito escuras
function corClara(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#b48cff';
  const n = parseInt(m[1], 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.45) { const k = (0.45 - lum) * 1.5 + 0.2; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

const fonte = (ctx, peso, tam, fam = 'Bricolage') => { ctx.font = `${peso} ${tam}px '${fam}', system-ui, sans-serif`; };

// Corta com "…" o que não couber na largura
function caber(ctx, t, max) {
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function retangulo(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Texto em Anton inclinado (o canvas não inclina sozinho)
function titulo(ctx, t, x, y, tam, cor, sombra) {
  ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, INCLINA, 1, 0, 0); fonte(ctx, 400, tam, 'Anton');
  if (sombra) { ctx.fillStyle = sombra; ctx.fillText(t, 4, 4); }
  ctx.fillStyle = cor; ctx.fillText(t, 0, 0); ctx.restore();
}

function carregarImagem(src) {
  return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
}

// Um cartão de sexta. Com desenhar = false só mede a altura.
function cartao(ctx, s, x, y, w, cor, grande, desenhar) {
  const tamNome = grande ? 40 : 31, alt = grande ? 54 : 43, pad = grande ? 34 : 28;
  let h = pad + (grande ? 62 : 52) + 14;
  const linhas = [];
  s.blocos.forEach((b, i) => {
    if (i) h += 14;
    if (b.rot) { linhas.push({ tipo: 'rot', t: b.rot.toUpperCase(), y: h }); h += grande ? 40 : 34; }
    const nomes = b.nomes.length ? b.nomes : [];
    nomes.forEach((n) => { linhas.push({ tipo: 'nome', t: n, y: h }); h += alt; });
    const faltam = Math.max(0, (b.vagas || 0) - nomes.length);
    if (faltam) { linhas.push({ tipo: 'vaga', t: faltam === 1 ? '1 vaga em aberto' : `${faltam} vagas em aberto`, y: h }); h += alt; }
    if (!nomes.length && !faltam) { linhas.push({ tipo: 'vaga', t: 'A definir', y: h }); h += alt; }
  });
  h += pad - 10;
  if (!desenhar) return h;

  retangulo(ctx, x, y, w, h, 22); ctx.fillStyle = CARTAO; ctx.fill();
  ctx.lineWidth = s.prox ? 3 : 2; ctx.strokeStyle = s.prox ? cor : LINHA; ctx.stroke();
  ctx.textBaseline = 'alphabetic';
  // Cabeça: "SEXTA 14/11" e o selo "Próxima"
  fonte(ctx, 700, grande ? 24 : 20); ctx.fillStyle = APAGADO;
  ctx.fillText('SEXTA', x + pad, y + pad + 20);
  const larguraSexta = ctx.measureText('SEXTA ').width;
  titulo(ctx, s.data, x + pad + larguraSexta + 4, y + pad + (grande ? 46 : 38), grande ? 60 : 50, TEXTO);
  if (s.prox) {
    fonte(ctx, 700, grande ? 20 : 17); const tw = ctx.measureText('PRÓXIMA').width, ph = grande ? 36 : 32;
    const px = x + w - pad - tw - 28, py = y + pad - 2;
    retangulo(ctx, px, py, tw + 28, ph, ph / 2); ctx.fillStyle = cor; ctx.fill();
    ctx.fillStyle = FUNDO; ctx.fillText('PRÓXIMA', px + 14, py + ph / 2 + (grande ? 7 : 6));
  }
  // Linha separando a cabeça
  ctx.fillStyle = LINHA; ctx.fillRect(x + pad, y + pad + (grande ? 62 : 52), w - pad * 2, 2);

  for (const l of linhas) {
    const ly = y + l.y;
    if (l.tipo === 'rot') {
      fonte(ctx, 800, grande ? 21 : 18); ctx.fillStyle = cor;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
      ctx.fillText(caber(ctx, l.t, w - pad * 2), x + pad, ly + (grande ? 28 : 24));
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    } else if (l.tipo === 'nome') {
      ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(x + pad + 6, ly + alt / 2 + 1, 5, 0, Math.PI * 2); ctx.fill();
      fonte(ctx, 600, tamNome); ctx.fillStyle = TEXTO;
      ctx.fillText(caber(ctx, l.t, w - pad * 2 - 26), x + pad + 24, ly + alt / 2 + tamNome * 0.36);
    } else {
      ctx.strokeStyle = APAGADO; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(x + pad + 6, ly + alt / 2 + 1, 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      fonte(ctx, 500, tamNome - 4); ctx.fillStyle = APAGADO;
      ctx.fillText(l.t, x + pad + 24, ly + alt / 2 + tamNome * 0.33);
    }
  }
  return h;
}

/**
 * escala = { ministerio, cor, subtitulo, sextas: [{ data: '14/11', prox, blocos: [{ rot, nomes: [], vagas }] }] }
 * Devolve o canvas pronto.
 */
export async function desenharEscala(escala) {
  await Promise.all([
    document.fonts.load("400 60px 'Anton'"), document.fonts.load("700 30px 'Bricolage'"), document.fonts.load("600 30px 'Bricolage'"),
  ]).catch(() => {});
  const logo = await carregarImagem('assets/img/h-hype.svg');
  const cor = corClara(escala.cor);
  const um = escala.sextas.length === 1;
  const cols = um ? 1 : 2, gap = 24;
  const cw = (W - PAD * 2 - gap * (cols - 1)) / cols;

  // Mede tudo antes, para saber a altura da imagem
  const medidor = document.createElement('canvas').getContext('2d');
  const alturas = escala.sextas.map((s) => cartao(medidor, s, 0, 0, cw, cor, um, false));
  const linhas = [];
  for (let i = 0; i < alturas.length; i += cols) linhas.push(Math.max(...alturas.slice(i, i + cols)));
  const topo = 300;
  const H = topo + linhas.reduce((t, h) => t + h, 0) + gap * (linhas.length - 1) + 120;

  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = FUNDO; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = escala.cor && /^#/.test(escala.cor) ? escala.cor : cor; ctx.fillRect(0, 0, 14, H);

  // Cabeçalho
  fonte(ctx, 700, 24); ctx.fillStyle = APAGADO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillText(um ? 'ESCALA DA SEXTA' : 'ESCALA DO MÊS', PAD, PAD + 22);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  let tam = 104; fonte(ctx, 400, tam, 'Anton');
  const nome = escala.ministerio.toUpperCase();
  const maxNome = W - PAD * 2 - (logo ? 130 : 0);
  while (tam > 56 && ctx.measureText(nome).width > maxNome) { tam -= 4; fonte(ctx, 400, tam, 'Anton'); }
  titulo(ctx, caber(ctx, nome, maxNome), PAD + 10, PAD + 40 + tam * 0.98, tam, TEXTO, cor);
  fonte(ctx, 600, 34); ctx.fillStyle = cor;
  ctx.fillText(escala.subtitulo, PAD, topo - 52);
  if (logo) { const lh = 120, lw = lh * (logo.width / logo.height || 0.75); ctx.drawImage(logo, W - PAD - lw, PAD - 4, lw, lh); }

  // Cartões das sextas
  let y = topo;
  linhas.forEach((lh, li) => {
    for (let c = 0; c < cols; c++) {
      const s = escala.sextas[li * cols + c]; if (!s) continue;
      cartao(ctx, s, PAD + c * (cw + gap), y, cw, cor, um, true);
    }
    y += lh + gap;
  });

  // Rodapé
  ctx.fillStyle = LINHA; ctx.fillRect(PAD, H - 92, W - PAD * 2, 2);
  fonte(ctx, 700, 24); ctx.fillStyle = TEXTO; ctx.fillText('Gestão do Hype', PAD, H - 46);
  fonte(ctx, 500, 22); ctx.fillStyle = APAGADO; ctx.textAlign = 'right';
  ctx.fillText(escala.rodape || '', W - PAD, H - 46); ctx.textAlign = 'left';
  return cv;
}
