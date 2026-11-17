// Segurança: senhas, sessão, permissões, limite de tentativas e auditoria
// © Arthur Ramon da Silva — Todos os direitos reservados.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, umaLinha, HttpError } = require('./db');

const CUSTO_BCRYPT = 12;
const DURACAO_SESSAO_S = 7 * 24 * 3600;
const LIMITE_POR_EMAIL = 5;   // falhas em 15 min
const LIMITE_POR_IP = 20;     // falhas em 15 min
const HASH_FALSO = bcrypt.hashSync('senha-que-nao-existe', CUSTO_BCRYPT);

// ---------------- Senhas ----------------
const COMUNS = new Set(['12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', 'senha123', 'senha1234',
  'password', 'password1', 'qwerty123', 'abc12345', 'abcd1234', 'admin123', 'admin1234', 'hype1234', 'hype2024', 'hype2025',
  'hype2026', 'jesus123', 'jesus1234', 'deusefiel', 'iloveyou', 'mudar123', 'trocar123']);

function validarSenha(senha, email = '', nome = '') {
  const s = String(senha || '');
  if (s.length < 8) throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
  if (s.length > 128) throw new HttpError(400, 'Senha longa demais.');
  if (!/[A-Za-zÀ-ÿ]/.test(s) || !/\d/.test(s)) throw new HttpError(400, 'A senha precisa ter letras e números.');
  const baixa = s.toLowerCase();
  if (COMUNS.has(baixa) || /^(.)\1+$/.test(s)) throw new HttpError(400, 'Essa senha é muito comum. Escolha outra.');
  const user = String(email).split('@')[0].toLowerCase();
  const primeiro = String(nome).split(' ')[0].toLowerCase();
  if ((user.length >= 4 && baixa.includes(user)) || (primeiro.length >= 4 && baixa.includes(primeiro))) {
    throw new HttpError(400, 'A senha não pode conter seu nome ou e-mail.');
  }
}
const gerarHash = (senha) => bcrypt.hash(String(senha), CUSTO_BCRYPT);
const conferirSenha = (senha, hash) => bcrypt.compare(String(senha || ''), hash || HASH_FALSO);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------------- Sessão (cookie HttpOnly) ----------------
const segredo = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new HttpError(500, 'JWT_SECRET não configurado (mínimo 32 caracteres).');
  return s;
};
const modoLocal = () => process.env.MODO_LOCAL === '1';
const NOME_COOKIE = () => (modoLocal() ? 'hype_sessao' : '__Host-hype_sessao');

function cookieSessao(usuario) {
  const token = jwt.sign({ sub: usuario.id, v: usuario.versao_sessao }, segredo(), { expiresIn: DURACAO_SESSAO_S, algorithm: 'HS256' });
  return `${NOME_COOKIE()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DURACAO_SESSAO_S}${modoLocal() ? '' : '; Secure'}`;
}
const cookieSair = () => `${NOME_COOKIE()}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${modoLocal() ? '' : '; Secure'}`;

function lerCookie(cabecalho) {
  const nome = NOME_COOKIE();
  for (const parte of String(cabecalho || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return null;
}

async function usuarioDaSessao(cabecalhoCookie) {
  const token = lerCookie(cabecalhoCookie);
  if (!token) return null;
  let dados;
  try { dados = jwt.verify(token, segredo(), { algorithms: ['HS256'] }); } catch { return null; }
  const [linhas, perms] = await query(`
    SELECT id, nome, email, cd_status, versao_sessao FROM dbo.usuarios WHERE id = @id;
    SELECT DISTINCT gp.permissao FROM dbo.usuario_grupo ug JOIN dbo.grupo_permissao gp ON gp.grupo_id = ug.grupo_id WHERE ug.usuario_id = @id;`,
  { id: dados.sub }, { todos: true });
  const u = linhas[0];
  if (!u || u.versao_sessao !== dados.v) return null;   // senha trocada / bloqueado = sessão inválida
  u.permissoes = u.cd_status === 1 ? perms.map((p) => p.permissao) : [];
  return u;
}

const publico = (u) => u && ({ id: u.id, nome: u.nome, email: u.email, cd_status: u.cd_status, permissoes: u.permissoes || [] });

// ---------------- Limite de tentativas ----------------
async function conferirLimite(email, ip) {
  const r = await umaLinha(`
    SELECT SUM(CASE WHEN email = @email THEN 1 ELSE 0 END) AS por_email,
           SUM(CASE WHEN ip = @ip THEN 1 ELSE 0 END) AS por_ip
    FROM dbo.auditoria WITH (NOLOCK)
    WHERE acao IN ('login_falhou', 'esqueci_senha') AND dt > DATEADD(MINUTE, -15, SYSUTCDATETIME())
      AND (email = @email OR ip = @ip)`, { email, ip });
  if ((r?.por_email || 0) >= LIMITE_POR_EMAIL || (r?.por_ip || 0) >= LIMITE_POR_IP) {
    throw new HttpError(429, 'Muitas tentativas. Por segurança, aguarde 15 minutos e tente de novo.');
  }
}

// ---------------- Auditoria ----------------
async function registrar(acao, { usuario = null, detalhe = null, email = null, ip = null } = {}) {
  try {
    await query(`INSERT INTO dbo.auditoria (usuario_id, usuario_nome, acao, detalhe, email, ip) VALUES (@uid, @nome, @acao, @detalhe, @email, @ip)`,
      { uid: usuario?.id ?? null, nome: usuario?.nome ?? null, acao, detalhe: detalhe ? String(detalhe).slice(0, 400) : null, email, ip });
  } catch (e) { console.error('auditoria', e); }
}

// ---------------- Foto: só JPEG de verdade ----------------
function validarJpeg(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, 'Envie uma imagem JPEG.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf.length > 1024 * 1024) throw new HttpError(400, 'Imagem inválida ou maior que 1 MB.');
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
    throw new HttpError(400, 'O arquivo enviado não é uma imagem JPEG válida.');
  }
  return buf;
}

module.exports = {
  validarSenha, gerarHash, conferirSenha, sha256, cookieSessao, cookieSair, usuarioDaSessao, publico,
  conferirLimite, registrar, validarJpeg,
};
