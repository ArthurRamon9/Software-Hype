// Rotas da API da Gestão do Hype
// © Arthur Ramon da Silva — Todos os direitos reservados.
//
// Cada rota declara quem pode usá-la:
//   'publico'  -> qualquer um (login, criar conta, esqueci a senha)
//   'logado'   -> qualquer pessoa com sessão válida (mesmo aguardando liberação)
//   'aprovado' -> sessão válida e conta liberada
//   'x.y' ou ['x.y','z.w'] -> precisa ter ao menos uma dessas permissões (vindas dos grupos)
const crypto = require('crypto');
const { query, umaLinha, HttpError } = require('./db');
const { emailRedefinirSenha, emailNovoCadastro } = require('./email');
const seg = require('./seguranca');

const FALTAS_ALERTA = Number(process.env.FALTAS_ALERTA || 2);

// ------------------------------------------------------------------ QUEM PODE O QUÊ
// Tabela única de permissões das rotas de dados (as de login/acessos declaram na própria rota).
const PERMISSAO_DA_ROTA = {
  'GET /ministerios':                 'aprovado',
  'POST /ministerios':                'ministerios.editar',
  'PUT /ministerios/:id':             'ministerios.editar',
  'DELETE /ministerios/:id':          'ministerios.editar',
  'GET /pessoas':                     'pessoas.ver',
  'GET /pessoas/:id':                 'pessoas.ver',
  'POST /pessoas':                    ['pessoas.editar', 'presenca.marcar'],  // quem faz chamada cadastra visitante novo
  'POST /pessoas/importar':           'pessoas.editar',
  'PUT /pessoas/:id':                 'pessoas.editar',
  'DELETE /pessoas/:id':              'pessoas.excluir',
  'PUT /pessoas/:id/foto':            'pessoas.editar',
  'DELETE /pessoas/:id/foto':         'pessoas.editar',
  'GET /fotos/:id':                   ['pessoas.ver', 'presenca.marcar', 'pastoral.ver'],
  'GET /presenca':                    'presenca.marcar',
  'POST /presenca':                   'presenca.marcar',
  'GET /encontros':                   'relatorios.ver',
  'DELETE /encontros/:id':            'presenca.excluir',
  'GET /pastoral':                    'pastoral.ver',
  'GET /pastoral/casos/:id':          'pastoral.ver',
  'POST /pastoral/casos':             'pastoral.editar',
  'PUT /pastoral/casos/:id':          'pastoral.editar',
  'POST /pastoral/casos/:id/registros': 'pastoral.editar',
  'DELETE /pastoral/casos/:id':       'pastoral.excluir',
  'GET /painel':                      'aprovado',
  'GET /contadores':                  'aprovado',
  'GET /relatorios':                  'relatorios.ver',
};

// ------------------------------------------------------------------ util
const rotas = [];
const rota = (metodo, caminho, fn, acesso) => {
  acesso = acesso || PERMISSAO_DA_ROTA[`${metodo} ${caminho}`];
  if (!acesso) throw new Error(`Rota sem permissão definida: ${metodo} ${caminho}`);
  const nomes = [];
  const re = new RegExp('^' + caminho.replace(/:(\w+)/g, (_, n) => { nomes.push(n); return '([^/]+)'; }) + '/?$');
  rotas.push({ metodo, re, nomes, fn, acesso });
};
const txt = (v, max = 500) => { if (v === undefined || v === null) return null; const s = String(v).trim(); return s ? s.slice(0, max) : null; };
const int = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador inválido.'); return n; };
const dataISO = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCDate() !== +m[3] || +m[1] < 1900 || +m[1] > 2100) throw new HttpError(400, 'Data inválida.');
  return v;
};
const hojeUTC = () => new Date().toISOString().slice(0, 10);
const emailValido = (e) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e || '');
const pode = (u, p) => u?.permissoes?.includes(p);
const emailAdmin = () => String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

// ------------------------------------------------------------------ AUTENTICAÇÃO
rota('POST', '/auth/login', async ({ body, ip, definirCookie }) => {
  const email = txt(body.email, 200)?.toLowerCase() || '';
  await seg.conferirLimite(email, ip);
  const u = emailValido(email) ? await umaLinha('SELECT id, nome, email, senha_hash, cd_status, versao_sessao FROM dbo.usuarios WHERE email = @email', { email }) : null;
  const confere = await seg.conferirSenha(body.senha, u?.senha_hash);   // sempre roda o bcrypt (mesmo tempo com ou sem usuário)
  if (!u || !confere) {
    await seg.registrar('login_falhou', { email, ip, usuario: u ? { id: u.id, nome: u.nome } : null });
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  await query('UPDATE dbo.usuarios SET dt_ultimo_login = SYSUTCDATETIME() WHERE id = @id', { id: u.id });
  await seg.registrar('login', { usuario: u, email, ip });
  definirCookie(seg.cookieSessao(u));
  return { ok: true };
}, 'publico');

rota('POST', '/auth/sair', async ({ definirCookie }) => { definirCookie(seg.cookieSair()); return { ok: true }; }, 'publico');

rota('POST', '/auth/cadastro', async ({ body, origem, ip, definirCookie }) => {
  const nome = txt(body.nome, 120), email = txt(body.email, 200)?.toLowerCase(), senha = String(body.senha || '');
  if (!nome || nome.length < 3) throw new HttpError(400, 'Informe seu nome completo.');
  if (!emailValido(email)) throw new HttpError(400, 'Informe um e-mail válido.');
  seg.validarSenha(senha, email, nome);
  await seg.conferirLimite(email, ip);
  if (await umaLinha('SELECT id FROM dbo.usuarios WHERE email = @email', { email })) throw new HttpError(409, 'Já existe uma conta com este e-mail. Tente entrar ou use "Esqueci minha senha".');
  const hash = await seg.gerarHash(senha);

  // Só o e-mail definido em ADMIN_EMAIL (configuração do servidor) vira administrador,
  // e apenas enquanto ainda não existir nenhum administrador ativo.
  const ehDono = email === emailAdmin();
  const u = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DECLARE @semAdmin BIT = CASE WHEN EXISTS (
      SELECT 1 FROM dbo.usuarios x JOIN dbo.usuario_grupo ug ON ug.usuario_id = x.id JOIN dbo.grupos g ON g.id = ug.grupo_id
      WHERE g.sistema = 1 AND x.cd_status = 1) THEN 0 ELSE 1 END;
    DECLARE @admin BIT = CASE WHEN @ehDono = 1 AND @semAdmin = 1 THEN 1 ELSE 0 END;
    INSERT INTO dbo.usuarios (nome, email, senha_hash, cd_status) VALUES (@nome, @email, @hash, @admin);
    DECLARE @id INT = SCOPE_IDENTITY();
    IF @admin = 1 INSERT INTO dbo.usuario_grupo (usuario_id, grupo_id) SELECT @id, id FROM dbo.grupos WHERE sistema = 1;
    COMMIT;
    SELECT id, nome, email, cd_status, versao_sessao FROM dbo.usuarios WHERE id = @id;`, { nome, email, hash, ehDono: ehDono ? 1 : 0 });
  await seg.registrar('conta_criada', { usuario: u, email, ip, detalhe: u.cd_status ? 'administrador inicial' : 'aguardando liberação' });
  if (!u.cd_status) {
    const admins = await query(`SELECT DISTINCT u.email FROM dbo.usuarios u JOIN dbo.usuario_grupo ug ON ug.usuario_id = u.id
      JOIN dbo.grupo_permissao gp ON gp.grupo_id = ug.grupo_id WHERE gp.permissao = 'acessos.gerenciar' AND u.cd_status = 1`);
    await Promise.all(admins.map((a) => emailNovoCadastro(a.email, nome, email, `${origem}#/acessos`).catch((e) => console.error(e))));
  }
  definirCookie(seg.cookieSessao(u));
  return { ok: true };
}, 'publico');

rota('POST', '/auth/esqueci', async ({ body, origem, ip }) => {
  const email = txt(body.email, 200)?.toLowerCase();
  if (!emailValido(email)) throw new HttpError(400, 'Informe um e-mail válido.');
  await seg.conferirLimite(email, ip);
  await seg.registrar('esqueci_senha', { email, ip });
  const u = await umaLinha('SELECT id, nome, email FROM dbo.usuarios WHERE email = @email', { email });
  if (u) {
    const recente = await umaLinha('SELECT TOP 1 id FROM dbo.usuarios_reset_senha WHERE usuario_id = @id AND dt_criacao > DATEADD(SECOND, -60, SYSUTCDATETIME())', { id: u.id });
    if (!recente) {
      const token = crypto.randomBytes(32).toString('hex');
      await query(`UPDATE dbo.usuarios_reset_senha SET dt_uso = SYSUTCDATETIME() WHERE usuario_id = @id AND dt_uso IS NULL;
        INSERT INTO dbo.usuarios_reset_senha (usuario_id, token_hash, dt_expira) VALUES (@id, @hash, DATEADD(HOUR, 1, SYSUTCDATETIME()))`,
      { id: u.id, hash: seg.sha256(token) });
      await emailRedefinirSenha(u.email, u.nome, `${origem}#/nova-senha?token=${token}`);
    }
  }
  return { ok: true };   // mesma resposta exista ou não a conta
}, 'publico');

rota('POST', '/auth/redefinir', async ({ body, ip, definirCookie }) => {
  const token = String(body.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400, 'Link inválido. Peça um novo.');
  const r = await umaLinha(`SELECT r.usuario_id, u.email, u.nome FROM dbo.usuarios_reset_senha r JOIN dbo.usuarios u ON u.id = r.usuario_id
    WHERE r.token_hash = @hash AND r.dt_uso IS NULL AND r.dt_expira > SYSUTCDATETIME()`, { hash: seg.sha256(token) });
  if (!r) throw new HttpError(400, 'Este link expirou ou já foi usado. Peça um novo.');
  seg.validarSenha(body.senha, r.email, r.nome);
  const hash = await seg.gerarHash(body.senha);
  const u = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
      UPDATE dbo.usuarios SET senha_hash = @hash, versao_sessao = versao_sessao + 1, dt_troca_senha = SYSUTCDATETIME() WHERE id = @uid;
      UPDATE dbo.usuarios_reset_senha SET dt_uso = SYSUTCDATETIME() WHERE usuario_id = @uid AND dt_uso IS NULL;
    COMMIT;
    SELECT id, nome, email, cd_status, versao_sessao FROM dbo.usuarios WHERE id = @uid;`, { hash, uid: r.usuario_id });
  await seg.registrar('senha_redefinida', { usuario: u, ip, detalhe: 'pelo link do e-mail; outras sessões encerradas' });
  definirCookie(seg.cookieSessao(u));
  return { ok: true };
}, 'publico');

rota('GET', '/auth/eu', async ({ usuario }) => ({ usuario: seg.publico(usuario) }), 'logado');

rota('PUT', '/auth/eu', async ({ usuario, body }) => {
  const nome = txt(body.nome, 120);
  if (!nome || nome.length < 3) throw new HttpError(400, 'Informe seu nome.');
  await query('UPDATE dbo.usuarios SET nome = @nome WHERE id = @id', { nome, id: usuario.id });
  return { ok: true };
}, 'logado');

rota('PUT', '/auth/senha', async ({ usuario, body, ip, definirCookie }) => {
  const atual = await umaLinha('SELECT senha_hash FROM dbo.usuarios WHERE id = @id', { id: usuario.id });
  if (!(await seg.conferirSenha(body.atual, atual.senha_hash))) {
    await seg.registrar('login_falhou', { usuario, email: usuario.email, ip, detalhe: 'senha atual errada ao trocar senha' });
    throw new HttpError(400, 'A senha atual está incorreta.');
  }
  seg.validarSenha(body.nova, usuario.email, usuario.nome);
  const u = await umaLinha(`UPDATE dbo.usuarios SET senha_hash = @h, versao_sessao = versao_sessao + 1, dt_troca_senha = SYSUTCDATETIME()
    OUTPUT inserted.id, inserted.versao_sessao WHERE id = @id`, { h: await seg.gerarHash(body.nova), id: usuario.id });
  await seg.registrar('senha_trocada', { usuario, ip, detalhe: 'outras sessões encerradas' });
  definirCookie(seg.cookieSessao(u));   // continua logado neste aparelho
  return { ok: true };
}, 'logado');

// ------------------------------------------------------------------ ACESSOS: usuários, grupos, atividades
const SQL_ADMINS_ATIVOS = `SELECT COUNT(DISTINCT u.id) FROM dbo.usuarios u JOIN dbo.usuario_grupo ug ON ug.usuario_id = u.id
  JOIN dbo.grupos g ON g.id = ug.grupo_id WHERE g.sistema = 1 AND u.cd_status = 1`;

rota('GET', '/acessos', async () => {
  const [usuarios, vinculos, grupos, gperms, permissoes] = await query(`
    SELECT id, nome, email, cd_status, dt_criacao, dt_ultimo_login FROM dbo.usuarios ORDER BY nome;
    SELECT usuario_id, grupo_id FROM dbo.usuario_grupo;
    SELECT id, nome, descricao, sistema FROM dbo.grupos ORDER BY sistema DESC, nome;
    SELECT grupo_id, permissao FROM dbo.grupo_permissao;
    SELECT codigo, descricao FROM dbo.permissoes ORDER BY ordem;`, {}, { todos: true });
  usuarios.forEach((u) => { u.grupos = vinculos.filter((v) => v.usuario_id === u.id).map((v) => v.grupo_id); });
  grupos.forEach((g) => { g.permissoes = gperms.filter((p) => p.grupo_id === g.id).map((p) => p.permissao); g.membros = vinculos.filter((v) => v.grupo_id === g.id).length; });
  return { usuarios, grupos, permissoes };
}, 'acessos.gerenciar');

// Liberar/bloquear e definir grupos de um usuário
rota('PUT', '/acessos/usuarios/:id', async ({ params, body, usuario, ip }) => {
  const id = int(params.id);
  const status = body.cd_status === 1 ? 1 : 0;
  const grupos = (Array.isArray(body.grupos) ? body.grupos : []).map(Number).filter(Number.isInteger);
  const alvo = await umaLinha('SELECT id, nome, cd_status FROM dbo.usuarios WHERE id = @id', { id });
  if (!alvo) throw new HttpError(404, 'Usuário não encontrado.');
  const r = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DELETE FROM dbo.usuario_grupo WHERE usuario_id = @id;
    INSERT INTO dbo.usuario_grupo (usuario_id, grupo_id) SELECT DISTINCT @id, g.id FROM OPENJSON(@grupos) j JOIN dbo.grupos g ON g.id = j.value;
    UPDATE dbo.usuarios SET cd_status = @status,
      versao_sessao = CASE WHEN @status = 0 AND cd_status = 1 THEN versao_sessao + 1 ELSE versao_sessao END
    WHERE id = @id;
    DECLARE @admins INT = (${SQL_ADMINS_ATIVOS});
    DECLARE @euAdmin BIT = CASE WHEN EXISTS (SELECT 1 FROM dbo.usuario_grupo ug JOIN dbo.grupo_permissao gp ON gp.grupo_id = ug.grupo_id
                                WHERE ug.usuario_id = @eu AND gp.permissao = 'acessos.gerenciar') THEN 1 ELSE 0 END;
    IF @admins = 0 OR (@id = @eu AND (@euAdmin = 0 OR @status = 0)) BEGIN ROLLBACK; SELECT 0 AS ok; RETURN; END
    COMMIT; SELECT 1 AS ok;`, { id, status, grupos: JSON.stringify(grupos), eu: usuario.id });
  if (!r.ok) throw new HttpError(400, id === usuario.id ? 'Você não pode tirar o próprio acesso de administrador.' : 'O sistema precisa ter pelo menos um administrador ativo.');
  const nomes = grupos.length ? (await query(`SELECT nome FROM dbo.grupos WHERE id IN (SELECT value FROM OPENJSON(@g))`, { g: JSON.stringify(grupos) })).map((g) => g.nome).join(', ') : 'nenhum grupo';
  await seg.registrar(status ? (alvo.cd_status ? 'grupos_alterados' : 'usuario_liberado') : 'usuario_bloqueado', { usuario, ip, detalhe: `${alvo.nome}: ${status ? nomes : 'bloqueado'}` });
  return { ok: true };
}, 'acessos.gerenciar');

rota('DELETE', '/acessos/usuarios/:id', async ({ params, usuario, ip }) => {
  const id = int(params.id);
  if (id === usuario.id) throw new HttpError(400, 'Você não pode excluir a própria conta.');
  const alvo = await umaLinha('SELECT nome, cd_status FROM dbo.usuarios WHERE id = @id', { id });
  if (!alvo) return { ok: true };
  if (alvo.cd_status) throw new HttpError(400, 'Bloqueie o acesso antes de excluir a conta.');
  await query('DELETE FROM dbo.usuarios WHERE id = @id', { id });
  await seg.registrar('usuario_excluido', { usuario, ip, detalhe: alvo.nome });
  return { ok: true };
}, 'acessos.gerenciar');

rota('POST', '/acessos/grupos', async ({ body, usuario, ip }) => {
  const nome = txt(body.nome, 60);
  if (!nome) throw new HttpError(400, 'Informe o nome do grupo.');
  const g = await umaLinha('INSERT INTO dbo.grupos (nome, descricao) OUTPUT inserted.id VALUES (@nome, @d)', { nome, d: txt(body.descricao, 200) });
  await salvarPermissoesGrupo(g.id, body.permissoes);
  await seg.registrar('grupo_criado', { usuario, ip, detalhe: nome });
  return { id: g.id };
}, 'acessos.gerenciar');

async function salvarPermissoesGrupo(id, perms) {
  await query(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DELETE FROM dbo.grupo_permissao WHERE grupo_id = @id;
    INSERT INTO dbo.grupo_permissao (grupo_id, permissao) SELECT DISTINCT @id, p.codigo FROM OPENJSON(@p) j JOIN dbo.permissoes p ON p.codigo = j.value;
    COMMIT;`, { id, p: JSON.stringify(Array.isArray(perms) ? perms.map(String) : []) });
}

rota('PUT', '/acessos/grupos/:id', async ({ params, body, usuario, ip }) => {
  const id = int(params.id);
  const g = await umaLinha('SELECT nome, sistema FROM dbo.grupos WHERE id = @id', { id });
  if (!g) throw new HttpError(404, 'Grupo não encontrado.');
  if (g.sistema) throw new HttpError(400, 'O grupo Administradores sempre tem todas as permissões.');
  const nome = txt(body.nome, 60);
  if (!nome) throw new HttpError(400, 'Informe o nome do grupo.');
  await query('UPDATE dbo.grupos SET nome = @nome, descricao = @d WHERE id = @id', { id, nome, d: txt(body.descricao, 200) });
  await salvarPermissoesGrupo(id, body.permissoes);
  await seg.registrar('grupo_alterado', { usuario, ip, detalhe: `${nome}: ${(body.permissoes || []).join(', ') || 'sem permissões'}` });
  return { ok: true };
}, 'acessos.gerenciar');

rota('DELETE', '/acessos/grupos/:id', async ({ params, usuario, ip }) => {
  const id = int(params.id);
  const g = await umaLinha('SELECT nome, sistema FROM dbo.grupos WHERE id = @id', { id });
  if (!g) return { ok: true };
  if (g.sistema) throw new HttpError(400, 'O grupo Administradores não pode ser excluído.');
  await query('DELETE FROM dbo.grupos WHERE id = @id', { id });
  await seg.registrar('grupo_excluido', { usuario, ip, detalhe: g.nome });
  return { ok: true };
}, 'acessos.gerenciar');

rota('GET', '/acessos/atividades', async () => query(`
  SELECT TOP 200 dt, usuario_nome, acao, detalhe, email, ip FROM dbo.auditoria ORDER BY id DESC`), 'acessos.gerenciar');

rota('GET', '/responsaveis', async () => query('SELECT id, nome FROM dbo.usuarios WHERE cd_status = 1 ORDER BY nome'), 'pastoral.editar');

rota('GET', '/contadores', async ({ usuario }) => umaLinha(`
  SELECT CASE WHEN @past = 1 THEN (SELECT COUNT(*) FROM dbo.pastoral_casos WHERE status <> 'concluido') ELSE 0 END AS pastoral,
         CASE WHEN @adm = 1 THEN (SELECT COUNT(*) FROM dbo.usuarios WHERE cd_status = 0) ELSE 0 END AS pendentes`,
{ past: pode(usuario, 'pastoral.ver') ? 1 : 0, adm: pode(usuario, 'acessos.gerenciar') ? 1 : 0 }));

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
rota('DELETE', '/ministerios/:id', async ({ params }) => { await query('DELETE FROM dbo.ministerios WHERE id=@id', { id: int(params.id) }); return { ok: true }; });

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

rota('GET', '/pessoas/:id', async ({ params, usuario }) => {
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
  return { pessoa: pessoa[0], historico, casos: pode(usuario, 'pastoral.ver') ? casos : null };
});

function dadosPessoa(b) {
  const nome = txt(b.nome, 150);
  if (!nome || nome.length < 2) throw new HttpError(400, 'Informe o nome.');
  return {
    nome,
    data_nascimento: (() => { const d = dataISO(b.data_nascimento); if (d && d > hojeUTC()) throw new HttpError(400, 'A data de nascimento não pode ser no futuro.'); return d; })(),
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

rota('POST', '/pessoas', async ({ body, usuario, ip }) => {
  const d = dadosPessoa(body);
  const r = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    INSERT INTO dbo.pessoas (nome, data_nascimento, sexo, telefone, email, instagram, endereco, tipo, batizado, como_conheceu, observacoes, data_cadastro, cd_status, criado_por)
    VALUES (@nome, @data_nascimento, @sexo, @telefone, @email, @instagram, @endereco, @tipo, @batizado, @como_conheceu, @observacoes, @data_cadastro, @cd_status, @uid);
    DECLARE @pid INT = SCOPE_IDENTITY();
    ${SQL_MINISTERIOS}
    COMMIT;
    SELECT @pid AS id;`, { ...d, uid: usuario.id });
  await seg.registrar('pessoa_criada', { usuario, ip, detalhe: `${d.nome} (id ${r.id})` });
  return { id: r.id };
});

// Importação em lote (planilha). Recebe até 500 linhas por vez.
rota('POST', '/pessoas/importar', async ({ body, usuario, ip }) => {
  const linhas = Array.isArray(body.pessoas) ? body.pessoas : [];
  if (!linhas.length) throw new HttpError(400, 'Nenhuma linha para importar.');
  if (linhas.length > 500) throw new HttpError(400, 'Envie no máximo 500 linhas por vez.');
  const ministerios = await query('SELECT id, nome FROM dbo.ministerios');
  const chave = (t) => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const porNome = new Map(ministerios.map((m) => [chave(m.nome), m.id]));
  const ignorados = new Set();
  const validas = [];
  linhas.forEach((l, idx) => {
    try {
      // Data ruim não impede a importação: a pessoa entra com a data em branco
      const limpa = { ...l, ministerios: [] };
      for (const campo of ['data_nascimento', 'data_cadastro']) {
        try { if (dataISO(limpa[campo]) > hojeUTC()) limpa[campo] = null; } catch { limpa[campo] = null; }
      }
      const d = dadosPessoa(limpa);
      const mins = String(l.ministerios_nomes || '').split(/[,;/]+/).map((n) => n.trim()).filter(Boolean)
        .map((n) => { const id = porNome.get(chave(n)); if (!id) ignorados.add(n); return id; }).filter(Boolean);
      delete d.ministerios;
      validas.push({ ...d, batizado: d.batizado ? 1 : 0, idx, ministerios: [...new Set(mins)] });
    } catch { /* linha sem nome válido: ignora */ }
  });
  if (!validas.length) throw new HttpError(400, 'Nenhuma linha tem nome válido.');
  const r = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DECLARE @novos TABLE (id INT, idx INT);
    MERGE dbo.pessoas AS t
    USING (
      SELECT j.* FROM OPENJSON(@json) WITH (
        idx INT, nome NVARCHAR(150), data_nascimento DATE, sexo CHAR(1), telefone VARCHAR(30), email NVARCHAR(200),
        instagram NVARCHAR(60), endereco NVARCHAR(250), tipo VARCHAR(15), batizado BIT, como_conheceu NVARCHAR(150),
        observacoes NVARCHAR(MAX), data_cadastro DATE, cd_status TINYINT) j
      WHERE @pular = 0 OR NOT EXISTS (SELECT 1 FROM dbo.pessoas p WHERE p.nome = j.nome)
    ) AS s ON 1 = 0
    WHEN NOT MATCHED THEN INSERT (nome, data_nascimento, sexo, telefone, email, instagram, endereco, tipo, batizado, como_conheceu, observacoes, data_cadastro, cd_status, criado_por)
      VALUES (s.nome, s.data_nascimento, s.sexo, s.telefone, s.email, s.instagram, s.endereco, s.tipo, s.batizado, s.como_conheceu, s.observacoes, s.data_cadastro, s.cd_status, @uid)
    OUTPUT inserted.id, s.idx INTO @novos;
    INSERT INTO dbo.pessoa_ministerio (pessoa_id, ministerio_id)
    SELECT DISTINCT n.id, m.value
      FROM @novos n
      JOIN OPENJSON(@json) WITH (idx INT, ministerios NVARCHAR(MAX) AS JSON) j ON j.idx = n.idx
      CROSS APPLY OPENJSON(j.ministerios) m
      JOIN dbo.ministerios mi ON mi.id = m.value;
    COMMIT;
    SELECT COUNT(*) AS importadas FROM @novos;`, { json: JSON.stringify(validas), pular: body.pularRepetidos === false ? 0 : 1, uid: usuario.id });
  const resultado = { importadas: r.importadas, repetidas: validas.length - r.importadas, invalidas: linhas.length - validas.length, ministeriosNaoEncontrados: [...ignorados] };
  await seg.registrar('pessoas_importadas', { usuario, ip, detalhe: `${resultado.importadas} importadas, ${resultado.repetidas} já existiam, ${resultado.invalidas} sem nome` });
  return resultado;
});

rota('PUT', '/pessoas/:id', async ({ params, body, usuario, ip }) => {
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
  await seg.registrar('pessoa_editada', { usuario, ip, detalhe: `${d.nome} (id ${params.id})` });
  return { id: int(params.id) };
});

rota('DELETE', '/pessoas/:id', async ({ params, usuario, ip }) => {
  const p = await umaLinha('DELETE FROM dbo.pessoas OUTPUT deleted.nome WHERE id = @id', { id: int(params.id) });
  if (p) await seg.registrar('pessoa_excluida', { usuario, ip, detalhe: `${p.nome} (id ${params.id})` });
  return { ok: true };
});

rota('PUT', '/pessoas/:id/foto', async ({ params, body }) => {
  const buf = seg.validarJpeg(body.imagem);   // só aceita JPEG real (confere a assinatura do arquivo)
  await query(`
    MERGE dbo.pessoas_foto AS t USING (SELECT @id AS pessoa_id) s ON t.pessoa_id = s.pessoa_id
    WHEN MATCHED THEN UPDATE SET foto = @foto, content_type = 'image/jpeg', dt_atualizacao = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (pessoa_id, foto, content_type) VALUES (@id, @foto, 'image/jpeg');`, { id: int(params.id), foto: buf });
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

rota('POST', '/presenca', async ({ body, usuario, ip }) => {
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
  await seg.registrar('chamada_salva', { usuario, ip, detalhe: `${data}: ${regs.filter((x) => x.presente).length} presentes, ${regs.filter((x) => !x.presente).length} ausentes` });
  return { encontro_id: r.id, alertas: pode(usuario, 'pastoral.ver') ? await calcularAlertas() : [] };
});

rota('GET', '/encontros', async () => query(`
  SELECT e.id, e.data, e.tema, COUNT(CASE WHEN pr.presente = 1 THEN 1 END) AS presentes
  FROM dbo.encontros e LEFT JOIN dbo.presencas pr ON pr.encontro_id = e.id
  GROUP BY e.id, e.data, e.tema ORDER BY e.data DESC`));

rota('DELETE', '/encontros/:id', async ({ params, usuario, ip }) => {
  const e = await umaLinha('DELETE FROM dbo.encontros OUTPUT CONVERT(CHAR(10), deleted.data, 103) AS d WHERE id = @id', { id: int(params.id) });
  if (e) await seg.registrar('chamada_excluida', { usuario, ip, detalhe: e.d });
  return { ok: true };
});

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

rota('DELETE', '/pastoral/casos/:id', async ({ params, usuario, ip }) => {
  const c = await umaLinha(`DELETE c OUTPUT deleted.pessoa_id FROM dbo.pastoral_casos c WHERE c.id = @id`, { id: int(params.id) });
  if (c) await seg.registrar('caso_excluido', { usuario, ip, detalhe: `acompanhamento ${params.id} (pessoa ${c.pessoa_id})` });
  return { ok: true };
});

// ------------------------------------------------------------------ PAINEL E RELATÓRIOS
rota('GET', '/painel', async ({ usuario }) => {
  // Cada bloco do Início só vem se a pessoa tiver permissão para ele
  const verPessoas = pode(usuario, 'pessoas.ver');
  const verPresenca = pode(usuario, 'relatorios.ver') || pode(usuario, 'presenca.marcar');
  const verPastoral = pode(usuario, 'pastoral.ver');
  const [[pessoas, encontros, casos], alertas] = await Promise.all([query(`
    SELECT p.id, p.nome, p.tipo, p.data_nascimento, p.data_cadastro, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v
      FROM dbo.pessoas p LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id WHERE p.cd_status = 1 AND @vp = 1;
    SELECT TOP 12 encontro_id AS id, data, tema, presentes AS total, membros_presentes AS membros, visitantes_presentes AS visitantes
      FROM dbo.vw_resumo_encontros WHERE @ve = 1 ORDER BY data DESC;
    SELECT COUNT(*) AS abertos FROM dbo.pastoral_casos WHERE status <> 'concluido' AND @vc = 1;`,
  { vp: verPessoas ? 1 : 0, ve: verPresenca ? 1 : 0, vc: verPastoral ? 1 : 0 }, { todos: true }), verPastoral ? calcularAlertas() : []]);
  return {
    pessoas: verPessoas ? pessoas : null,
    encontros: verPresenca ? encontros : null,
    casosAbertos: verPastoral ? casos[0].abertos : null,
    alertas: verPastoral ? alertas : null,
  };
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
async function despachar({ metodo, caminho, query: q = {}, body = {}, cookie, csrf, ip, origem }) {
  for (const r of rotas) {
    if (r.metodo !== metodo) continue;
    const m = r.re.exec(caminho);
    if (!m) continue;
    // Proteção contra CSRF: toda escrita precisa do cabeçalho X-Hype (outro site não consegue enviá-lo)
    if (metodo !== 'GET' && csrf !== '1') throw new HttpError(403, 'Requisição recusada.');
    const params = Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    let usuario = null;
    if (r.acesso !== 'publico') {
      usuario = await seg.usuarioDaSessao(cookie);
      if (!usuario) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
      if (r.acesso !== 'logado') {
        if (usuario.cd_status !== 1) throw new HttpError(403, 'Seu acesso ainda não foi liberado.');
        const exigidas = r.acesso === 'aprovado' ? [] : [].concat(r.acesso);
        if (exigidas.length && !exigidas.some((p) => pode(usuario, p))) throw new HttpError(403, 'Você não tem permissão para isso.');
      }
    }
    let cookieResposta = null;
    const corpo = await r.fn({ params, query: q, body: body || {}, usuario, origem, ip, definirCookie: (c) => { cookieResposta = c; } });
    return { corpo, cookie: cookieResposta };
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

function respostaErro(e) {
  if (e instanceof HttpError || e.status) return { status: e.status, body: { erro: e.message } };
  if (e.number === 2627 || e.number === 2601) return { status: 409, body: { erro: 'Esse registro já existe.' } };
  if (e.number === 547) return { status: 409, body: { erro: 'Não é possível concluir: há registros ligados a este item.' } };
  console.error(e);
  return { status: 500, body: { erro: 'Erro interno. Tente novamente.' } };
}

// Cabeçalhos de segurança em todas as respostas da API
const CABECALHOS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};

module.exports = { despachar, respostaErro, CABECALHOS };
