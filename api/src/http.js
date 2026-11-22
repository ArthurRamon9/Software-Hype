// Tradução comum entre HTTP e as rotas (usada pela função do Netlify e pelo servidor local)
// © Arthur Ramon da Silva — Todos os direitos reservados.
const zlib = require('zlib');
const { despachar, respostaErro, CABECALHOS } = require('./rotas');

const LIMITE_CORPO = 1.5 * 1024 * 1024;

function ipDe(cabecalhos) {
  let ip = String(cabecalhos['x-nf-client-connection-ip'] || cabecalhos['x-forwarded-for'] || cabecalhos['x-client-ip'] || cabecalhos['x-ip-local'] || '').split(',')[0].trim();
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);   // remove a porta (ex.: 1.2.3.4:5678)
  if (v4) ip = v4[1];
  ip = ip.replace(/^\[/, '').replace(/\](:\d+)?$/, '');
  return ip.slice(0, 45) || null;
}

// entrada: { metodo, caminho, query, texto, cabecalhos (minúsculos), origemPadrao }
// saída:   { status, cabecalhos, corpo (Buffer|string) }
async function atender({ metodo, caminho, query, texto, cabecalhos, origemPadrao }) {
  const resp = (status, corpo, extra = {}) => ({ status, cabecalhos: { ...CABECALHOS, ...extra }, corpo });
  try {
    if (texto && texto.length > LIMITE_CORPO) return resp(413, JSON.stringify({ erro: 'Envio grande demais.' }), { 'Content-Type': 'application/json' });
    let body = {};
    if (texto) { try { body = JSON.parse(texto); } catch { return resp(400, JSON.stringify({ erro: 'Formato inválido.' }), { 'Content-Type': 'application/json' }); } }
    let origem = process.env.SITE_URL || origemPadrao;
    if (!origem.endsWith('/')) origem += '/';
    const r = await despachar({
      metodo, caminho, query, body,
      cookie: cabecalhos.cookie, csrf: cabecalhos['x-hype'], ip: ipDe(cabecalhos), origem,
    });
    const extra = r.cookie ? { 'Set-Cookie': r.cookie } : {};
    if (r.corpo && r.corpo.$binario) {
      const tipo = ['image/jpeg', 'application/pdf'].includes(r.corpo.$tipo) ? r.corpo.$tipo : 'image/jpeg';
      const baixar = r.corpo.$baixar ? `attachment; filename="${String(r.corpo.$baixar).replace(/[^\w .()-]/g, '_')}"` : 'inline';
      return resp(200, r.corpo.$binario, { ...extra, 'Content-Type': tipo, 'Content-Disposition': baixar, 'Cache-Control': 'private, max-age=604800' });
    }
    const json = JSON.stringify(r.corpo ?? { ok: true });
    // Respostas grandes vão compactadas (a lista de pessoas cai de ~120 KB para ~15 KB): chega bem mais rápido no celular
    if (json.length > 1400 && /\bgzip\b/.test(cabecalhos['accept-encoding'] || '')) {
      return resp(200, zlib.gzipSync(json, { level: 6 }), { ...extra, 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    }
    return resp(200, json, { ...extra, 'Content-Type': 'application/json; charset=utf-8' });
  } catch (e) {
    const { status, body } = respostaErro(e);
    return resp(status, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8' });
  }
}

module.exports = { atender };
