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

// "Ver como": o administrador continua com a própria sessão (sub/v dele) e o token diz quem ele está vendo (como)
function cookieSessao(usuario, como = null) {
  const token = jwt.sign({ sub: usuario.id, v: usuario.versao_sessao, ...(como ? { como } : {}) }, segredo(), { expiresIn: DURACAO_SESSAO_S, algorithm: 'HS256' });
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

const SQL_USUARIO = `
    SELECT u.id, u.nome, u.email, u.cd_status, u.versao_sessao, u.pessoa_id,
           CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v
      FROM dbo.usuarios u LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = u.pessoa_id WHERE u.id = @id;
    SELECT DISTINCT gp.permissao FROM dbo.usuario_grupo ug JOIN dbo.grupo_permissao gp ON gp.grupo_id = ug.grupo_id WHERE ug.usuario_id = @id;
    SELECT m.id, m.nome, pm.lider FROM dbo.usuarios u
      JOIN dbo.pessoa_ministerio pm ON pm.pessoa_id = u.pessoa_id JOIN dbo.ministerios m ON m.id = pm.ministerio_id
     WHERE u.id = @id AND m.cd_status = 1;`;

async function carregarUsuario(id) {
  const [linhas, perms, mins] = await query(SQL_USUARIO, { id }, { todos: true });
  const u = linhas[0];
  if (!u) return null;
  u.permissoes = u.cd_status === 1 ? perms.map((p) => p.permissao) : [];
  u.ministerios = mins.map((m) => ({ id: m.id, nome: m.nome, lider: !!m.lider }));
  return u;
}

// Quem está logado fica guardado por alguns segundos: cada tela deixa de ir ao banco só para isso
// (o banco fica longe, cada ida custa tempo). Qualquer gravação limpa a lembrança na hora.
const LEMBRAR_MS = 20000;
const lembrados = new Map();
let geracaoSessoes = 0;   // muda a cada gravação: uma busca que começou antes dela não é guardada
const esquecerSessoes = () => { lembrados.clear(); geracaoSessoes++; };
// fresco = true: confere no banco agora (toda gravação faz isso, para valer na hora um bloqueio ou grupo tirado)
async function usuarioDaSessao(cabecalhoCookie, { fresco = false } = {}) {
  const token = lerCookie(cabecalhoCookie);
  if (!token) return null;
  const lembrado = lembrados.get(token);
  if (!fresco && lembrado && lembrado.ate > Date.now()) return lembrado.u;
  const geracao = geracaoSessoes;
  const u = await usuarioDaSessaoNoBanco(token);
  if (u && geracao === geracaoSessoes) {
    if (lembrados.size > 500) lembrados.clear();
    lembrados.set(token, { u, ate: Date.now() + LEMBRAR_MS });
  }
  return u;
}
async function usuarioDaSessaoNoBanco(token) {
  let dados;
  try { dados = jwt.verify(token, segredo(), { algorithms: ['HS256'] }); } catch { return null; }
  const u = await carregarUsuario(dados.sub);
  if (!u || u.versao_sessao !== dados.v) return null;   // senha trocada / bloqueado = sessão inválida
  if (!dados.como) return u;
  // Ver como: só vale enquanto quem está vendo continuar administrador ativo, e nunca como outro administrador
  if (u.cd_status !== 1 || !u.permissoes.includes('acessos.gerenciar')) return u;
  const alvo = await carregarUsuario(dados.como);
  if (!alvo || alvo.cd_status !== 1 || alvo.permissoes.includes('acessos.gerenciar')) return u;
  alvo.verComoPor = { id: u.id, nome: u.nome, versao_sessao: u.versao_sessao };
  return alvo;
}

const publico = (u) => u && ({
  id: u.id, nome: u.nome, email: u.email, cd_status: u.cd_status, permissoes: u.permissoes || [],
  pessoa_id: u.pessoa_id || null, foto_v: u.foto_v || null, ministerios: u.ministerios || [],
  verComoPor: u.verComoPor ? { nome: u.verComoPor.nome } : null,
});

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
// Registro de atividade. Fora o que conta para o limite de tentativas (login e senha), ele não segura a resposta:
// grava logo depois de responder (o banco fica longe e cada ida custa). Ver depoisDaResposta em http.js.
const { AsyncLocalStorage } = require('async_hooks');
const pedidoAtual = new AsyncLocalStorage();
const ESPERA = /^(login|esqueci|senha|conta_criada)/;
function registrar(acao, dados = {}) {
  const p = gravarRegistro(acao, dados);
  const pedido = pedidoAtual.getStore();
  if (pedido && !ESPERA.test(acao)) { pedido.depois.push(p); return Promise.resolve(); }
  return p;
}
async function gravarRegistro(acao, { usuario = null, detalhe = null, email = null, ip = null } = {}) {
  try {
    await query(`INSERT INTO dbo.auditoria (usuario_id, usuario_nome, acao, detalhe, email, ip) VALUES (@uid, @nome, @acao, @detalhe, @email, @ip)`,
      { uid: usuario?.verComoPor?.id ?? usuario?.id ?? null,
        nome: usuario?.verComoPor ? `${usuario.verComoPor.nome} (como ${usuario.nome})` : usuario?.nome ?? null, acao, detalhe: detalhe ? String(detalhe).slice(0, 400) : null, email, ip });
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
  validarSenha, gerarHash, conferirSenha, sha256, cookieSessao, cookieSair, usuarioDaSessao, carregarUsuario, publico,
  conferirLimite, registrar, validarJpeg, esquecerSessoes, pedidoAtual,
};
