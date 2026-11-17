// Servidor local para testar o sistema no seu computador: node dev-server.js
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
const CABECALHOS_SITE = JSON.parse(fs.readFileSync(path.join(RAIZ, 'staticwebapp.config.json'), 'utf8')).globalHeaders;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    let texto = '';
    for await (const c of req) { texto += c; if (texto.length > 2e6) break; }
    const r = await atender({
      metodo: req.method, caminho: url.pathname.slice(4), query: Object.fromEntries(url.searchParams), texto,
      cabecalhos: { ...req.headers, 'x-ip-local': req.socket.remoteAddress }, origemPadrao: `http://${req.headers.host}/`,
    });
    res.writeHead(r.status, r.cabecalhos);
    return res.end(r.corpo);
  }
  let arq = path.normalize(path.join(RAIZ, decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname)));
  const proibido = /[\\/](api|sql|\.git|\.github|node_modules)([\\/]|$)|\.md$|LICENSE$/.test(arq.slice(RAIZ.length));
  if (!arq.startsWith(RAIZ + path.sep) || proibido || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) arq = path.join(RAIZ, 'index.html');
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', ...CABECALHOS_SITE });
  fs.createReadStream(arq).pipe(res);
}).listen(PORTA, () => console.log(`Gestão do Hype rodando em http://localhost:${PORTA}`));
