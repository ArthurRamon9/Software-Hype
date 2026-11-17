// Conexão com o SQL Server (MonsterASP.NET ou qualquer SQL Server)
// © Arthur Ramon da Silva — Todos os direitos reservados.
const sql = require('mssql');

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const cs = process.env.SQL_CONNECTION_STRING;
    if (!cs) throw new HttpError(500, 'Banco não configurado (SQL_CONNECTION_STRING).');
    const pool = new sql.ConnectionPool(cs);
    pool.config.options = { ...(pool.config.options || {}), useUTC: true, encrypt: true, trustServerCertificate: process.env.SQL_TRUST_CERT === '1' };
    pool.config.pool = { max: 5, min: 0, idleTimeoutMillis: 30000 };
    pool.config.connectionTimeout = 30000;
    pool.config.requestTimeout = 30000;
    poolPromise = pool.connect().catch((e) => { poolPromise = null; throw e; });
  }
  return poolPromise;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
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
async function query(texto, params = {}, { todos = false } = {}) {
  const inicio = Date.now();
  for (let tentativa = 1; ; tentativa++) {
    try {
      const pool = await getPool();
      const r = await bind(pool.request(), params).query(texto);
      r.recordsets.forEach(normalizar);
      return todos ? r.recordsets : (r.recordset || []);
    } catch (e) {
      if (ehTransitorio(e) && Date.now() - inicio < 32000) {
        poolPromise = null;
        await esperar(Math.min(2000 * tentativa, 8000));
        continue;
      }
      if (ehTransitorio(e)) throw new HttpError(503, 'O banco está iniciando. Tente de novo em alguns segundos.');
      throw e;
    }
  }
}

const umaLinha = async (texto, params) => (await query(texto, params))[0] || null;

module.exports = { query, umaLinha, HttpError, sql };
