// Netlify Function única que atende todas as rotas /api/*
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { atender } = require('../../api/src/http.js');

export default async (req, context) => {
  const url = new URL(req.url);
  const cabecalhos = Object.fromEntries([...req.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
  const r = await atender({
    metodo: req.method,
    caminho: url.pathname.replace(/^\/api/, '') || '/',
    query: Object.fromEntries(url.searchParams),
    texto: req.method === 'GET' ? '' : await req.text(),
    cabecalhos,
    origemPadrao: `${url.protocol}//${url.host}/`,
    // O registro de atividade termina depois da resposta (o Netlify espera por ele sem a pessoa esperar)
    depoisDaResposta: typeof context?.waitUntil === 'function' ? (p) => context.waitUntil(p) : null,
  });
  return new Response(r.corpo, { status: r.status, headers: r.cabecalhos });
};

export const config = { path: '/api/*' };
