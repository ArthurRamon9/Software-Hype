// Conexão com o SQL Server (MonsterASP.NET ou qualquer SQL Server)
// © Arthur Ramon da Silva — Todos os direitos reservados.
const sql = require('mssql');
const net = require('net');

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const cs = process.env.SQL_CONNECTION_STRING;
    if (!cs) throw new HttpError(500, 'Banco não configurado (SQL_CONNECTION_STRING).');
    const pool = new sql.ConnectionPool(cs);
    const o = pool.config.options || {};
    // Respeita o TrustServerCertificate que vier na connection string do painel
    pool.config.options = { ...o, useUTC: true, encrypt: true, trustServerCertificate: process.env.SQL_TRUST_CERT === '1' || o.trustServerCertificate === true };
    // Uma conexão fica aberta e parada até 5 min: abrir outra com o banco na Europa custa várias idas (criptografia + login)
    pool.config.pool = { max: 5, min: 1, idleTimeoutMillis: 300000 };
    // O Netlify encerra a função em ~10 s: a conexão precisa desistir antes disso
    pool.config.connectionTimeout = 6000;
    pool.config.requestTimeout = 8000;
    poolPromise = pool.connect().catch(async (e) => {
      poolPromise = null;
      const err = erroDeConexao(e);
      // O resultado do teste vai só para o log do Netlify (não mostra o endereço do banco na tela)
      if (err.status === 504) console.error('[banco]', await testarPorta(pool.config.server, pool.config.port || 1433));
      throw err;
    });
  }
  return poolPromise;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Diagnóstico: a porta do servidor responde? (separa "bloqueado" de "lento")
function testarPorta(host, port) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const sock = net.connect({ host, port });
    const fim = (msg) => { sock.destroy(); resolve(msg); };
    sock.setTimeout(2500, () => fim(`[Teste: ${host}:${port} não respondeu em 2,5 s — conexão bloqueada ou servidor fora do ar.]`));
    sock.on('connect', () => fim(`[Teste: ${host}:${port} respondeu em ${Date.now() - inicio} ms — a porta está aberta; o problema é no login/criptografia.]`));
    sock.on('error', (er) => fim(`[Teste: ${host}:${port} erro ${er.code}.]`));
  });
}

// Traduz falhas de conexão em mensagens que dizem o que conferir
function erroDeConexao(e) {
  const num = e?.number ?? e?.originalError?.number ?? e?.originalError?.info?.number;
  console.error('[banco] falha ao conectar:', e?.code, num, e?.message);
  if (num === 18456 || e?.code === 'ELOGIN') {
    return new HttpError(502, 'O banco recusou a conexão. Confira User Id, Password e Database no SQL_CONNECTION_STRING do Netlify.');
  }
  if (num === 4060) return new HttpError(502, 'Banco não encontrado. Confira o "Database=" no SQL_CONNECTION_STRING.');
  if (['ETIMEOUT', 'ESOCKET', 'ECONNRESET', 'ECONNCLOSED', 'EINSTLOOKUP', 'ENOTFOUND'].includes(e?.code)) {
    return new HttpError(504, `O servidor do banco não respondeu a tempo (${e.code}). Tente de novo; se continuar, veja o log da função no Netlify.`);
  }
  return new HttpError(502, `Falha ao conectar no banco (${e?.code || 'erro'}). Veja o log da função no Netlify.`);
}

// Colunas DATE voltam como texto 'AAAA-MM-DD'
const COLUNAS_DATA = new Set(['data', 'data_nascimento', 'data_cadastro', 'ultima_presenca']);
function normalizar(rows) {
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      const v = r[k];
      if (v instanceof Date) r[k] = COLUNAS_DATA.has(k) ? v.toISOString().slice(0, 10) : v.toISOString();
    }
  }
  return rows;
}

// Erros de banco "dormindo" (auto-pause do plano grátis) ou passageiros
const TRANSITORIOS = new Set([40613, 40197, 40501, 49918, 49919, 49920, 4221, 10928, 10929]);
const ehTransitorio = (e) => TRANSITORIOS.has(e?.number) || TRANSITORIOS.has(e?.originalError?.info?.number)
  || ['ETIMEOUT', 'ESOCKET', 'ECONNCLOSED', 'ECONNRESET'].includes(e?.code);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function bind(req, params) {
  for (const [k, v] of Object.entries(params || {})) {
    if (Buffer.isBuffer(v)) req.input(k, sql.VarBinary(sql.MAX), v);
    else if (typeof v === 'boolean') req.input(k, sql.Bit, v);
    else if (typeof v === 'number' && Number.isInteger(v)) req.input(k, sql.Int, v);
    else if (v === null || v === undefined) req.input(k, sql.NVarChar, null);
    else req.input(k, sql.NVarChar(sql.MAX), String(v));
  }
  return req;
}

// Executa uma consulta. Retorna as linhas do primeiro resultado
// (ou todos os resultados, se { todos: true }).
// Só no teste local: SQL_LATENCIA_MS imita a distância até o banco (ele fica na Europa) e SQL_CONTAR mostra quantas idas cada chamada faz
const LATENCIA = Number(process.env.MODO_LOCAL === '1' && process.env.SQL_LATENCIA_MS) || 0;
let contador = 0;
const idasAoBanco = () => { const n = contador; contador = 0; return n; };
async function query(texto, params = {}, { todos = false } = {}) {
  const inicio = Date.now();
  contador++;
  if (LATENCIA) await esperar(LATENCIA);
  for (let tentativa = 1; ; tentativa++) {
    try {
      const pool = await getPool();
      const r = await bind(pool.request(), params).query(texto);
      r.recordsets.forEach(normalizar);
      return todos ? r.recordsets : (r.recordset || []);
    } catch (e) {
      if (e instanceof HttpError) throw e;   // falha de conexão já explicada
      if (ehTransitorio(e) && Date.now() - inicio < 6000) {
        poolPromise = null;
        await esperar(1500);
        continue;
      }
      if (ehTransitorio(e)) throw new HttpError(503, 'O banco está iniciando. Tente de novo em alguns segundos.');
      throw e;
    }
  }
}

const umaLinha = async (texto, params) => (await query(texto, params))[0] || null;

module.exports = { query, umaLinha, HttpError, sql, idasAoBanco };
