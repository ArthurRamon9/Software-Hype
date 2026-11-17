// Servidor local para testar o sistema no seu computador: node dev-server.js
// Lê as configurações de local.settings.json e serve o site + API em http://localhost:4280
// © Arthur Ramon da Silva — Todos os direitos reservados.
const http = require('http');
const fs = require('fs');
const path = require('path');

const cfg = path.join(__dirname, 'local.settings.json');
if (fs.existsSync(cfg)) Object.assign(process.env, JSON.parse(fs.readFileSync(cfg, 'utf8')).Values, { ...process.env });
const { despachar, respostaErro } = require('./src/rotas');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const PORTA = Number(process.env.PORT || 4280);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    let dados = '';
    for await (const c of req) dados += c;
    try {
      const q = Object.fromEntries(url.searchParams);
      const r = await despachar({
        metodo: req.method, caminho: url.pathname.slice(4), query: q, body: dados ? JSON.parse(dados) : {},
        token: req.headers['x-hype-token'] || q.t, origem: process.env.SITE_URL || `http://${req.headers.host}/`,
      });
      if (r && r.$binario) { res.writeHead(200, { 'Content-Type': r.$tipo }); return res.end(r.$binario); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r ?? { ok: true }));
    } catch (e) {
      const { status, body } = respostaErro(e);
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
    }
    return;
  }
  let arq = path.normalize(path.join(RAIZ, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!arq.startsWith(RAIZ) || arq.includes(`${path.sep}api${path.sep}`) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) arq = path.join(RAIZ, 'index.html');
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
  fs.createReadStream(arq).pipe(res);
}).listen(PORTA, () => console.log(`Gestão do Hype rodando em http://localhost:${PORTA}`));
