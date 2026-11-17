// Azure Function única que atende todas as rotas /api/*
// © Arthur Ramon da Silva — Todos os direitos reservados.
const { app } = require('@azure/functions');
const { despachar, respostaErro } = require('../rotas');

app.http('api', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: '{*caminho}',
  handler: async (request) => {
    try {
      const q = Object.fromEntries(request.query.entries());
      let body = {};
      if (request.method !== 'GET') { const t = await request.text(); body = t ? JSON.parse(t) : {}; }
      const url = new URL(request.url);
      const origem = process.env.SITE_URL || request.headers.get('origin') || `${url.protocol}//${url.host}/`;
      const r = await despachar({
        metodo: request.method,
        caminho: '/' + (request.params.caminho || ''),
        query: q, body,
        token: request.headers.get('x-hype-token') || q.t,
        origem: origem.endsWith('/') ? origem : origem + '/',
      });
      if (r && r.$binario) {
        return { status: 200, body: r.$binario, headers: { 'Content-Type': r.$tipo, 'Cache-Control': 'private, max-age=604800' } };
      }
      return { status: 200, jsonBody: r ?? { ok: true }, headers: { 'Cache-Control': 'no-store' } };
    } catch (e) {
      const { status, body } = respostaErro(e);
      return { status, jsonBody: body };
    }
  },
});
