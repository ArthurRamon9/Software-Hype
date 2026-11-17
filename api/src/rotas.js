// Rotas da API da Gestão do Hype
// © Arthur Ramon da Silva — Todos os direitos reservados.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, umaLinha, HttpError } = require('./db');
const { emailRedefinirSenha, emailNovoCadastro } = require('./email');

const FALTAS_ALERTA = Number(process.env.FALTAS_ALERTA || 2);
const segredo = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) throw new HttpError(500, 'JWT_SECRET não configurado.');
  return process.env.JWT_SECRET;
};

// ------------------------------------------------------------------ util
const rotas = [];
const rota = (metodo, caminho, fn, acesso = 'aprovado') => {
  const nomes = [];
  const re = new RegExp('^' + caminho.replace(/:(\w+)/g, (_, n) => { nomes.push(n); return '([^/]+)'; }) + '/?$');
  rotas.push({ metodo, re, nomes, fn, acesso });
};
const txt = (v, max = 500) => { if (v === undefined || v === null) return null; const s = String(v).trim(); return s ? s.slice(0, max) : null; };
const int = (v) => { const n = Number(v); if (!Number.isInteger(n)) throw new HttpError(400, 'Identificador inválido.'); return n; };
const dataISO = (v) => { if (!v) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, 'Data inválida.'); return v; };
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const publicoUsuario = (u) => u && ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, cd_status: u.cd_status });
const emitirToken = (u) => jwt.sign({ sub: u.id }, segredo(), { expiresIn: '30d' });

async function usuarioDoToken(token) {
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, segredo());
    return await umaLinha('SELECT id, nome, email, papel, cd_status FROM dbo.usuarios WHERE id = @id', { id: sub });
  } catch (e) {
    if (e instanceof HttpError || e.status) throw e;
    return null;
  }
}

// ------------------------------------------------------------------ AUTENTICAÇÃO
rota('POST', '/auth/login', async ({ body }) => {
  const email = txt(body.email, 200)?.toLowerCase();
  const u = email && await umaLinha('SELECT * FROM dbo.usuarios WHERE email = @email', { email });
  if (!u || !(await bcrypt.compare(String(body.senha || ''), u.senha_hash))) {
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  await query('UPDATE dbo.usuarios SET dt_ultimo_login = SYSUTCDATETIME() WHERE id = @id', { id: u.id });
  return { token: emitirToken(u), usuario: publicoUsuario(u) };
}, 'publico');

rota('POST', '/auth/cadastro', async ({ body, origem }) => {
  const nome = txt(body.nome, 120), email = txt(body.email, 200)?.toLowerCase(), senha = String(body.senha || '');
  if (!nome || nome.length < 3) throw new HttpError(400, 'Informe seu nome completo.');
  if (!emailValido(email)) throw new HttpError(400, 'Informe um e-mail válido.');
  if (senha.length < 8) throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
  if (await umaLinha('SELECT id FROM dbo.usuarios WHERE email = @email', { email })) throw new HttpError(409, 'Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.');
  const hash = await bcrypt.hash(senha, 10);
  // O primeiro usuário vira administrador já liberado
  const u = await umaLinha(`
    DECLARE @primeiro BIT = CASE WHEN EXISTS (SELECT 1 FROM dbo.usuarios) THEN 0 ELSE 1 END;
    INSERT INTO dbo.usuarios (nome, email, senha_hash, papel, cd_status)
    OUTPUT inserted.id, inserted.nome, inserted.email, inserted.papel, inserted.cd_status
    VALUES (@nome, @email, @hash, CASE WHEN @primeiro = 1 THEN 'admin' ELSE 'servo' END, @primeiro);`, { nome, email, hash });
  if (!u.cd_status) {
    const admins = await query("SELECT email FROM dbo.usuarios WHERE papel = 'admin' AND cd_status = 1");
    await Promise.all(admins.map((a) => emailNovoCadastro(a.email, nome, email, `${origem}#/usuarios`).catch((e) => console.error(e))));
  }
  return { token: emitirToken(u), usuario: publicoUsuario(u) };
}, 'publico');

rota('POST', '/auth/esqueci', async ({ body, origem }) => {
  const email = txt(body.email, 200)?.toLowerCase();
  if (!emailValido(email)) throw new HttpError(400, 'Informe um e-mail válido.');
  const u = await umaLinha('SELECT id, nome, email FROM dbo.usuarios WHERE email = @email', { email });
  if (u) {
    const recente = await umaLinha('SELECT TOP 1 id FROM dbo.usuarios_reset_senha WHERE usuario_id = @id AND dt_criacao > DATEADD(SECOND, -60, SYSUTCDATETIME())', { id: u.id });
    if (!recente) {
      const token = crypto.randomBytes(32).toString('hex');
      await query(`INSERT INTO dbo.usuarios_reset_senha (usuario_id, token_hash, dt_expira)
                   VALUES (@id, @hash, DATEADD(HOUR, 1, SYSUTCDATETIME()))`, { id: u.id, hash: sha256(token) });
      await emailRedefinirSenha(u.email, u.nome, `${origem}#/nova-senha?token=${token}`);
    }
  }
  // Resposta igual exista ou não o e-mail (não revela quem tem conta)
  return { ok: true };
}, 'publico');

rota('POST', '/auth/redefinir', async ({ body }) => {
  const token = String(body.token || ''), senha = String(body.senha || '');
  if (senha.length < 8) throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
  const r = await umaLinha(`SELECT r.id, r.usuario_id FROM dbo.usuarios_reset_senha r
    WHERE r.token_hash = @hash AND r.dt_uso IS NULL AND r.dt_expira > SYSUTCDATETIME()`, { hash: sha256(token) });
  if (!r) throw new HttpError(400, 'Este link expirou ou já foi usado. Peça um novo.');
  const hash = await bcrypt.hash(senha, 10);
  const u = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
      UPDATE dbo.usuarios SET senha_hash = @hash WHERE id = @uid;
      UPDATE dbo.usuarios_reset_senha SET dt_uso = SYSUTCDATETIME() WHERE usuario_id = @uid AND dt_uso IS NULL;
    COMMIT;
    SELECT id, nome, email, papel, cd_status FROM dbo.usuarios WHERE id = @uid;`, { hash, uid: r.usuario_id });
  return { token: emitirToken(u), usuario: publicoUsuario(u) };
}, 'publico');

rota('GET', '/auth/eu', async ({ usuario }) => ({ usuario: publicoUsuario(usuario) }), 'logado');

rota('PUT', '/auth/eu', async ({ usuario, body }) => {
  const nome = txt(body.nome, 120);
  if (!nome || nome.length < 3) throw new HttpError(400, 'Informe seu nome.');
  await query('UPDATE dbo.usuarios SET nome = @nome WHERE id = @id', { nome, id: usuario.id });
  return { ok: true };
}, 'logado');

rota('PUT', '/auth/senha', async ({ usuario, body }) => {
  const u = await umaLinha('SELECT senha_hash FROM dbo.usuarios WHERE id = @id', { id: usuario.id });
  if (!(await bcrypt.compare(String(body.atual || ''), u.senha_hash))) throw new HttpError(400, 'A senha atual está incorreta.');
  if (String(body.nova || '').length < 8) throw new HttpError(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
  await query('UPDATE dbo.usuarios SET senha_hash = @h WHERE id = @id', { h: await bcrypt.hash(String(body.nova), 10), id: usuario.id });
  return { ok: true };
}, 'logado');

// ------------------------------------------------------------------ USUÁRIOS (admin)
rota('GET', '/usuarios', async () => query(
  'SELECT id, nome, email, papel, cd_status, dt_criacao, dt_ultimo_login FROM dbo.usuarios ORDER BY cd_status, nome'), 'admin');

rota('PUT', '/usuarios/:id', async ({ params, body, usuario }) => {
  const id = int(params.id);
  if (id === usuario.id) throw new HttpError(400, 'Você não pode alterar o próprio acesso.');
  const papel = ['admin', 'lider', 'servo'].includes(body.papel) ? body.papel : null;
  const status = [0, 1].includes(body.cd_status) ? body.cd_status : null;
  await query('UPDATE dbo.usuarios SET papel = COALESCE(@papel, papel), cd_status = COALESCE(@status, cd_status) WHERE id = @id', { id, papel, status });
  return { ok: true };
}, 'admin');

rota('DELETE', '/usuarios/:id', async ({ params, usuario }) => {
  const id = int(params.id);
  if (id === usuario.id) throw new HttpError(400, 'Você não pode excluir a própria conta.');
  await query('DELETE FROM dbo.usuarios WHERE id = @id', { id });
  return { ok: true };
}, 'admin');

rota('GET', '/responsaveis', async () => query('SELECT id, nome FROM dbo.usuarios WHERE cd_status = 1 ORDER BY nome'));

rota('GET', '/contadores', async ({ usuario }) => umaLinha(`
  SELECT (SELECT COUNT(*) FROM dbo.pastoral_casos WHERE status <> 'concluido') AS pastoral,
         CASE WHEN @admin = 1 THEN (SELECT COUNT(*) FROM dbo.usuarios WHERE cd_status = 0) ELSE 0 END AS pendentes`,
{ admin: usuario.papel === 'admin' ? 1 : 0 }));

// ------------------------------------------------------------------ MINISTÉRIOS
rota('GET', '/ministerios', async () => query(`
  SELECT m.id, m.nome, m.descricao, m.cor, m.cd_status,
         (SELECT COUNT(*) FROM dbo.pessoa_ministerio pm JOIN dbo.pessoas p ON p.id = pm.pessoa_id
           WHERE pm.ministerio_id = m.id AND p.cd_status = 1) AS pessoas
  FROM dbo.ministerios m ORDER BY m.nome`));

function dadosMinisterio(b) {
  const nome = txt(b.nome, 80);
  if (!nome) throw new HttpError(400, 'Informe o nome.');
  return { nome, descricao: txt(b.descricao, 300), cor: /^#[0-9a-f]{6}$/i.test(b.cor || '') ? b.cor : '#1d5c4f', status: b.cd_status === 0 ? 0 : 1 };
}
rota('POST', '/ministerios', async ({ body }) => {
  const d = dadosMinisterio(body);
  try { await query('INSERT INTO dbo.ministerios (nome, descricao, cor) VALUES (@nome, @descricao, @cor)', d); }
  catch (e) { if (e.number === 2627) throw new HttpError(409, 'Já existe um ministério com esse nome.'); throw e; }
  return { ok: true };
});
rota('PUT', '/ministerios/:id', async ({ params, body }) => {
  await query('UPDATE dbo.ministerios SET nome=@nome, descricao=@descricao, cor=@cor, cd_status=@status WHERE id=@id', { ...dadosMinisterio(body), id: int(params.id) });
  return { ok: true };
});
rota('DELETE', '/ministerios/:id', async ({ params }) => { await query('DELETE FROM dbo.ministerios WHERE id=@id', { id: int(params.id) }); return { ok: true }; }, 'admin');

// ------------------------------------------------------------------ PESSOAS
const ids = (s) => (s ? String(s).split(',').map(Number) : []);

rota('GET', '/pessoas', async () => {
  const rows = await query(`
    SELECT p.id, p.nome, p.tipo, p.data_nascimento, p.telefone, p.email, p.batizado, p.data_cadastro, p.cd_status,
           CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           (SELECT STRING_AGG(CAST(pm.ministerio_id AS VARCHAR(10)), ',') FROM dbo.pessoa_ministerio pm WHERE pm.pessoa_id = p.id) AS ministerios
    FROM dbo.pessoas p LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id
    ORDER BY p.nome`);
  rows.forEach((r) => { r.ministerios = ids(r.ministerios); });
  return rows;
});

rota('GET', '/pessoas/:id', async ({ params }) => {
  const id = int(params.id);
  const [pessoa, historico, casos] = await query(`
    SELECT p.*, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           (SELECT STRING_AGG(CAST(pm.ministerio_id AS VARCHAR(10)), ',') FROM dbo.pessoa_ministerio pm WHERE pm.pessoa_id = p.id) AS ministerios
    FROM dbo.pessoas p LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id WHERE p.id = @id;
    SELECT e.data, pr.presente, pr.justificativa FROM dbo.presencas pr JOIN dbo.encontros e ON e.id = pr.encontro_id
     WHERE pr.pessoa_id = @id ORDER BY e.data DESC;
    SELECT id, responsavel_nome, motivo, status, dt_abertura, dt_conclusao FROM dbo.pastoral_casos WHERE pessoa_id = @id ORDER BY dt_abertura DESC;`,
  { id }, { todos: true });
  if (!pessoa[0]) throw new HttpError(404, 'Pessoa não encontrada.');
  pessoa[0].ministerios = ids(pessoa[0].ministerios);
  return { pessoa: pessoa[0], historico, casos };
});

function dadosPessoa(b) {
  const nome = txt(b.nome, 150);
  if (!nome || nome.length < 2) throw new HttpError(400, 'Informe o nome.');
  return {
    nome,
    data_nascimento: dataISO(b.data_nascimento),
    sexo: ['M', 'F'].includes(b.sexo) ? b.sexo : null,
    telefone: txt(b.telefone, 30), email: txt(b.email, 200), instagram: txt(b.instagram, 60), endereco: txt(b.endereco, 250),
    tipo: ['membro', 'visitante', 'frequentador'].includes(b.tipo) ? b.tipo : 'visitante',
    batizado: !!b.batizado,
    como_conheceu: txt(b.como_conheceu, 150), observacoes: txt(b.observacoes, 4000),
    data_cadastro: dataISO(b.data_cadastro) || new Date().toISOString().slice(0, 10),
    cd_status: b.cd_status === 0 ? 0 : 1,
    ministerios: JSON.stringify((Array.isArray(b.ministerios) ? b.ministerios : []).map(Number).filter(Number.isInteger)),
  };
}
const SQL_MINISTERIOS = `
  DELETE FROM dbo.pessoa_ministerio WHERE pessoa_id = @pid;
  INSERT INTO dbo.pessoa_ministerio (pessoa_id, ministerio_id)
  SELECT DISTINCT @pid, j.value FROM OPENJSON(@ministerios) j JOIN dbo.ministerios m ON m.id = j.value;`;

rota('POST', '/pessoas', async ({ body, usuario }) => {
  const d = dadosPessoa(body);
  const r = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    INSERT INTO dbo.pessoas (nome, data_nascimento, sexo, telefone, email, instagram, endereco, tipo, batizado, como_conheceu, observacoes, data_cadastro, cd_status, criado_por)
    VALUES (@nome, @data_nascimento, @sexo, @telefone, @email, @instagram, @endereco, @tipo, @batizado, @como_conheceu, @observacoes, @data_cadastro, @cd_status, @uid);
    DECLARE @pid INT = SCOPE_IDENTITY();
    ${SQL_MINISTERIOS}
    COMMIT;
    SELECT @pid AS id;`, { ...d, uid: usuario.id });
  return { id: r.id };
});

rota('PUT', '/pessoas/:id', async ({ params, body }) => {
  const d = dadosPessoa(body);
  await query(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DECLARE @pid INT = @id;
    UPDATE dbo.pessoas SET nome=@nome, data_nascimento=@data_nascimento, sexo=@sexo, telefone=@telefone, email=@email,
      instagram=@instagram, endereco=@endereco, tipo=@tipo, batizado=@batizado, como_conheceu=@como_conheceu,
      observacoes=@observacoes, data_cadastro=@data_cadastro, cd_status=@cd_status, dt_atualizacao=SYSUTCDATETIME()
    WHERE id = @pid;
    ${SQL_MINISTERIOS}
    COMMIT;`, { ...d, id: int(params.id) });
  return { id: int(params.id) };
});

rota('DELETE', '/pessoas/:id', async ({ params }) => { await query('DELETE FROM dbo.pessoas WHERE id = @id', { id: int(params.id) }); return { ok: true }; }, 'admin');

rota('PUT', '/pessoas/:id/foto', async ({ params, body }) => {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(body.imagem || '');
  if (!m) throw new HttpError(400, 'Imagem inválida.');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 1.5 * 1024 * 1024) throw new HttpError(400, 'Imagem muito grande.');
  await query(`
    MERGE dbo.pessoas_foto AS t USING (SELECT @id AS pessoa_id) s ON t.pessoa_id = s.pessoa_id
    WHEN MATCHED THEN UPDATE SET foto = @foto, content_type = @ct, dt_atualizacao = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (pessoa_id, foto, content_type) VALUES (@id, @foto, @ct);`, { id: int(params.id), foto: buf, ct: m[1] });
  return { ok: true };
});
rota('DELETE', '/pessoas/:id/foto', async ({ params }) => { await query('DELETE FROM dbo.pessoas_foto WHERE pessoa_id = @id', { id: int(params.id) }); return { ok: true }; });

rota('GET', '/fotos/:id', async ({ params }) => {
  const f = await umaLinha('SELECT foto, content_type FROM dbo.pessoas_foto WHERE pessoa_id = @id', { id: int(params.id) });
  if (!f) throw new HttpError(404, 'Sem foto.');
  return { $binario: f.foto, $tipo: f.content_type };
});

// ------------------------------------------------------------------ PRESENÇA
rota('GET', '/presenca', async ({ query: q }) => {
  const data = dataISO(q.data);
  if (!data) throw new HttpError(400, 'Informe a data.');
  const [enc, pessoas, registros] = await query(`
    DECLARE @eid INT = (SELECT id FROM dbo.encontros WHERE data = @data);
    SELECT id, data, tema FROM dbo.encontros WHERE id = @eid;
    SELECT p.id, p.nome, p.tipo, p.cd_status, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v
      FROM dbo.pessoas p LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id
     WHERE p.cd_status = 1 OR EXISTS (SELECT 1 FROM dbo.presencas x WHERE x.encontro_id = @eid AND x.pessoa_id = p.id)
     ORDER BY p.nome;
    SELECT pessoa_id, presente, justificativa FROM dbo.presencas WHERE encontro_id = @eid;`, { data }, { todos: true });
  return { encontro: enc[0] || null, pessoas, registros };
});

rota('POST', '/presenca', async ({ body, usuario }) => {
  const data = dataISO(body.data);
  if (!data) throw new HttpError(400, 'Informe a data.');
  const regs = (Array.isArray(body.registros) ? body.registros : []).map((r) => ({
    pessoa_id: int(r.pessoa_id), presente: !!r.presente, justificativa: r.presente ? null : txt(r.justificativa, 200),
  }));
  if (!regs.length) throw new HttpError(400, 'Marque pelo menos uma pessoa.');
  const r = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DECLARE @eid INT = (SELECT id FROM dbo.encontros WITH (UPDLOCK, HOLDLOCK) WHERE data = @data);
    IF @eid IS NULL BEGIN
      INSERT INTO dbo.encontros (data, tema, criado_por) VALUES (@data, @tema, @uid);
      SET @eid = SCOPE_IDENTITY();
    END ELSE UPDATE dbo.encontros SET tema = @tema WHERE id = @eid;
    DELETE FROM dbo.presencas WHERE encontro_id = @eid;
    INSERT INTO dbo.presencas (encontro_id, pessoa_id, presente, justificativa, marcado_por)
    SELECT @eid, j.pessoa_id, j.presente, j.justificativa, @uid
      FROM OPENJSON(@json) WITH (pessoa_id INT, presente BIT, justificativa NVARCHAR(200)) j
      JOIN dbo.pessoas p ON p.id = j.pessoa_id;
    COMMIT;
    SELECT @eid AS id;`, { data, tema: txt(body.tema, 200), uid: usuario.id, json: JSON.stringify(regs) });
  return { encontro_id: r.id, alertas: await calcularAlertas() };
});

rota('GET', '/encontros', async () => query(`
  SELECT e.id, e.data, e.tema, COUNT(CASE WHEN pr.presente = 1 THEN 1 END) AS presentes
  FROM dbo.encontros e LEFT JOIN dbo.presencas pr ON pr.encontro_id = e.id
  GROUP BY e.id, e.data, e.tema ORDER BY e.data DESC`));

rota('DELETE', '/encontros/:id', async ({ params }) => { await query('DELETE FROM dbo.encontros WHERE id = @id', { id: int(params.id) }); return { ok: true }; }, 'admin');

// ------------------------------------------------------------------ PASTORAL
// Jovens ativos com N+ faltas seguidas nos encontros mais recentes, sem caso aberto
async function calcularAlertas() {
  const rows = await query(`
    WITH ult AS (SELECT TOP 10 id, data FROM dbo.encontros ORDER BY data DESC)
    SELECT p.id, p.nome, p.tipo, p.telefone, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           u.data, pr.presente
      FROM dbo.pessoas p
      JOIN dbo.presencas pr ON pr.pessoa_id = p.id
      JOIN ult u ON u.id = pr.encontro_id
      LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id
     WHERE p.cd_status = 1
       AND NOT EXISTS (SELECT 1 FROM dbo.pastoral_casos c WHERE c.pessoa_id = p.id AND c.status <> 'concluido')
     ORDER BY p.id, u.data DESC`);
  const porPessoa = new Map();
  for (const r of rows) {
    let a = porPessoa.get(r.id);
    if (!a) { a = { pessoa: { id: r.id, nome: r.nome, tipo: r.tipo, telefone: r.telefone, foto_v: r.foto_v }, faltas: 0, ultimaPresenca: null, fim: false }; porPessoa.set(r.id, a); }
    if (a.fim) continue;
    if (r.presente) { a.ultimaPresenca = r.data; a.fim = true; } else a.faltas++;
  }
  return [...porPessoa.values()].filter((a) => a.faltas >= FALTAS_ALERTA)
    .map(({ fim, ...a }) => a).sort((x, y) => y.faltas - x.faltas || x.pessoa.nome.localeCompare(y.pessoa.nome));
}

rota('GET', '/pastoral', async () => {
  const [alertas, casos] = await Promise.all([calcularAlertas(), query(`
    SELECT TOP 300 c.id, c.pessoa_id, c.responsavel_nome, c.motivo, c.status, c.dt_abertura, c.dt_conclusao,
           p.nome AS pessoa_nome, p.tipo AS pessoa_tipo, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           (SELECT MAX(r.dt_criacao) FROM dbo.pastoral_registros r WHERE r.caso_id = c.id) AS ultimo_registro
    FROM dbo.pastoral_casos c JOIN dbo.pessoas p ON p.id = c.pessoa_id LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id
    ORDER BY CASE c.status WHEN 'aberto' THEN 0 WHEN 'em_andamento' THEN 1 ELSE 2 END, c.dt_abertura DESC`)]);
  return { alertas, casos };
});

rota('GET', '/pastoral/casos/:id', async ({ params }) => {
  const [caso, registros] = await query(`
    SELECT c.*, p.nome AS pessoa_nome, p.tipo AS pessoa_tipo, p.telefone AS pessoa_telefone, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v
      FROM dbo.pastoral_casos c JOIN dbo.pessoas p ON p.id = c.pessoa_id LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id WHERE c.id = @id;
    SELECT id, texto, autor_nome, dt_criacao FROM dbo.pastoral_registros WHERE caso_id = @id ORDER BY dt_criacao DESC;`, { id: int(params.id) }, { todos: true });
  if (!caso[0]) throw new HttpError(404, 'Caso não encontrado.');
  return { caso: caso[0], registros };
});

rota('POST', '/pastoral/casos', async ({ body, usuario }) => {
  const responsavel = txt(body.responsavel_nome, 120);
  if (!responsavel) throw new HttpError(400, 'Informe o responsável.');
  await query(`
    SET XACT_ABORT ON; BEGIN TRAN;
    INSERT INTO dbo.pastoral_casos (pessoa_id, responsavel_nome, responsavel_id, motivo, criado_por)
    VALUES (@pid, @resp, (SELECT TOP 1 id FROM dbo.usuarios WHERE nome = @resp AND cd_status = 1), @motivo, @uid);
    DECLARE @cid INT = SCOPE_IDENTITY();
    IF @nota IS NOT NULL INSERT INTO dbo.pastoral_registros (caso_id, texto, autor_nome, autor_id) VALUES (@cid, @nota, @autor, @uid);
    COMMIT;`, { pid: int(body.pessoa_id), resp: responsavel, motivo: txt(body.motivo, 200), nota: txt(body.nota, 4000), uid: usuario.id, autor: usuario.nome });
  return { ok: true };
});

rota('PUT', '/pastoral/casos/:id', async ({ params, body }) => {
  if (!['aberto', 'em_andamento', 'concluido'].includes(body.status)) throw new HttpError(400, 'Status inválido.');
  await query(`UPDATE dbo.pastoral_casos SET status = @st,
    dt_conclusao = CASE WHEN @st = 'concluido' THEN SYSUTCDATETIME() ELSE NULL END WHERE id = @id`, { st: body.status, id: int(params.id) });
  return { ok: true };
});

rota('POST', '/pastoral/casos/:id/registros', async ({ params, body, usuario }) => {
  const texto = txt(body.texto, 4000);
  if (!texto) throw new HttpError(400, 'Escreva o registro.');
  await query(`INSERT INTO dbo.pastoral_registros (caso_id, texto, autor_nome, autor_id) VALUES (@id, @texto, @autor, @uid);
    UPDATE dbo.pastoral_casos SET status = 'em_andamento' WHERE id = @id AND status = 'aberto';`,
  { id: int(params.id), texto, autor: usuario.nome, uid: usuario.id });
  return { ok: true };
});

rota('DELETE', '/pastoral/casos/:id', async ({ params }) => { await query('DELETE FROM dbo.pastoral_casos WHERE id = @id', { id: int(params.id) }); return { ok: true }; }, 'admin');

// ------------------------------------------------------------------ PAINEL E RELATÓRIOS
rota('GET', '/painel', async () => {
  const [[pessoas, encontros, casos], alertas] = await Promise.all([query(`
    SELECT p.id, p.nome, p.tipo, p.data_nascimento, p.data_cadastro, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v
      FROM dbo.pessoas p LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id WHERE p.cd_status = 1;
    SELECT TOP 12 encontro_id AS id, data, tema, presentes AS total, membros_presentes AS membros
      FROM dbo.vw_resumo_encontros ORDER BY data DESC;
    SELECT COUNT(*) AS abertos FROM dbo.pastoral_casos WHERE status <> 'concluido';`, {}, { todos: true }), calcularAlertas()]);
  return { pessoas, encontros, casosAbertos: casos[0].abertos, alertas };
});

rota('GET', '/relatorios', async ({ query: q }) => {
  const ini = dataISO(q.ini), fim = dataISO(q.fim);
  if (!ini || !fim) throw new HttpError(400, 'Informe o período.');
  const [encontros, presencas] = await query(`
    SELECT id, data, tema FROM dbo.encontros WHERE data BETWEEN @ini AND @fim ORDER BY data;
    SELECT pr.encontro_id, pr.pessoa_id, pr.presente, pr.justificativa, p.nome, p.tipo, p.data_cadastro
      FROM dbo.presencas pr JOIN dbo.encontros e ON e.id = pr.encontro_id JOIN dbo.pessoas p ON p.id = pr.pessoa_id
     WHERE e.data BETWEEN @ini AND @fim;`, { ini, fim }, { todos: true });
  return { encontros, presencas };
});

// ------------------------------------------------------------------ DESPACHO
async function despachar({ metodo, caminho, query: q = {}, body = {}, token, origem }) {
  for (const r of rotas) {
    if (r.metodo !== metodo) continue;
    const m = r.re.exec(caminho);
    if (!m) continue;
    const params = Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    let usuario = null;
    if (r.acesso !== 'publico') {
      usuario = await usuarioDoToken(token);
      if (!usuario) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
      if (r.acesso !== 'logado' && usuario.cd_status !== 1) throw new HttpError(403, 'Seu acesso ainda não foi liberado.');
      if (r.acesso === 'admin' && usuario.papel !== 'admin') throw new HttpError(403, 'Apenas administradores podem fazer isso.');
    }
    return r.fn({ params, query: q, body: body || {}, usuario, origem });
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

// Converte erro em resposta amigável
function respostaErro(e) {
  if (e instanceof HttpError || e.status) return { status: e.status, body: { erro: e.message } };
  if (e.number === 2627 || e.number === 2601) return { status: 409, body: { erro: 'Esse registro já existe.' } };
  if (e.number === 547) return { status: 409, body: { erro: 'Não é possível concluir: há registros ligados a este item.' } };
  console.error(e);
  return { status: 500, body: { erro: 'Erro interno. Tente novamente.' } };
}

module.exports = { despachar, respostaErro };
