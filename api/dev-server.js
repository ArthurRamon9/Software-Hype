// Servidor local para testar o sistema no seu computador: npm run dev
// Lê as configurações de local.settings.json e serve o site + API em http://localhost:4280
// © Arthur Ramon da Silva — Todos os direitos reservados.
const http = require('http');
const fs = require('fs');
const path = require('path');

const cfg = path.join(__dirname, 'local.settings.json');
if (fs.existsSync(cfg)) Object.assign(process.env, JSON.parse(fs.readFileSync(cfg, 'utf8')).Values, { ...process.env });
process.env.MODO_LOCAL = '1';
const { atender } = require('./src/http');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const PORTA = Number(process.env.PORT || 4280);
// Mesmos cabeçalhos de segurança do site publicado (arquivo _headers do Netlify)
const CABECALHOS_SITE = Object.fromEntries(fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8').split('\n')
  .filter((l) => /^\s+\S+:/.test(l)).map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  // O "guardar por 1 ano" do _headers vale só para fontes e bibliotecas no Netlify. No teste local o navegador
  // confere sempre se o arquivo mudou: assim nunca aparece uma versão antiga depois de trocar o código.
  .filter(([k]) => k.toLowerCase() !== 'cache-control'));
CABECALHOS_SITE['Cache-Control'] = 'no-cache';

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    let texto = '';
    for await (const c of req) { texto += c; if (texto.length > 2e6) break; }
    const t0 = Date.now();
    const r = await atender({
      metodo: req.method, caminho: url.pathname.slice(4), query: Object.fromEntries(url.searchParams), texto,
      cabecalhos: { ...req.headers, 'x-ip-local': req.socket.remoteAddress }, origemPadrao: `http://${req.headers.host}/`,
    });
    if (process.env.SQL_CONTAR === '1') console.log(`[api] ${req.method} ${url.pathname.slice(4)}${url.search} ${r.status} ${Date.now() - t0}ms idas=${require('./src/db').idasAoBanco()} ${Buffer.byteLength(r.corpo || '')}B`);
    res.writeHead(r.status, r.cabecalhos);
    return res.end(r.corpo);
  }
  let arq = path.normalize(path.join(RAIZ, decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname)));
  const proibido = /[\\/](api|sql|netlify|\.git|node_modules)([\\/]|$)|\.md$|\.toml$|LICENSE$|package(-lock)?\.json$/.test(arq.slice(RAIZ.length));
  if (!arq.startsWith(RAIZ + path.sep) || proibido || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) arq = path.join(RAIZ, 'index.html');
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', ...CABECALHOS_SITE });
  fs.createReadStream(arq).pipe(res);
}).listen(PORTA, () => console.log(`Gestão do Hype rodando em http://localhost:${PORTA}`));
