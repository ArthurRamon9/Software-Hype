// Azure Function única que atende todas as rotas /api/*
// © Arthur Ramon da Silva — Todos os direitos reservados.
const { app } = require('@azure/functions');
const { atender } = require('../http');

app.http('api', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: '{*caminho}',
  handler: async (request) => {
    const url = new URL(request.url);
    const cabecalhos = Object.fromEntries([...request.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
    const r = await atender({
      metodo: request.method,
      caminho: '/' + (request.params.caminho || ''),
      query: Object.fromEntries(request.query.entries()),
      texto: request.method === 'GET' ? '' : await request.text(),
      cabecalhos,
      origemPadrao: `${url.protocol}//${url.host}/`,
    });
    return { status: r.status, headers: r.cabecalhos, body: r.corpo };
  },
});
