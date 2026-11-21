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
const { emailRedefinirSenha, emailNovoCadastro, emailConvites } = require('./email');
const seg = require('./seguranca');

const FALTAS_ALERTA = Number(process.env.FALTAS_ALERTA || 2);

// ------------------------------------------------------------------ QUEM PODE O QUÊ
// Tabela única de permissões das rotas de dados (as de login/acessos declaram na própria rota).
const PERMISSAO_DA_ROTA = {
  'GET /ministerios':                 'aprovado',
  'POST /ministerios':                'ministerios.editar',
  'PUT /ministerios/:id':             'ministerios.editar',
  'DELETE /ministerios/:id':          'acessos.gerenciar',   // apagar ministério: só administrador
  'GET /ministerios/:id/pessoas':     'ministerios.editar',
  'PUT /ministerios/:id/pessoas':     'ministerios.editar',
  'GET /pessoas':                     'pessoas.ver',
  'GET /pessoas/:id':                 'pessoas.ver',
  'POST /pessoas':                    ['pessoas.editar', 'presenca.marcar'],  // quem faz chamada cadastra visitante novo
  'POST /pessoas/importar':           'relatorios.exportar',   // importar em massa: só quem pode baixar/importar planilhas
  'PUT /pessoas/:id':                 'pessoas.editar',
  'DELETE /pessoas/:id':              'pessoas.excluir',
  'PUT /pessoas/:id/foto':            'pessoas.editar',
  'DELETE /pessoas/:id/foto':         'pessoas.editar',
  'GET /fotos/:id':                   'aprovado',   // confere dentro: permissões abaixo ou a própria foto
  'GET /presenca':                    'presenca.marcar',
  'POST /presenca':                   'presenca.marcar',
  'GET /encontros':                   'relatorios.ver',
  'DELETE /encontros/:id':            'presenca.excluir',
  'GET /painel':                      'aprovado',
  'GET /contadores':                  'aprovado',
  'GET /relatorios':                  'relatorios.ver',
  // Agenda e Escalas: qualquer conta liberada entra; dentro, cada um vê os seus ministérios e só o líder (ou administrador) altera
  'GET /agenda':                      'aprovado',
  'GET /agenda/membros/:id':          'aprovado',
  'POST /agenda':                     'aprovado',
  'PUT /agenda/:id':                  'aprovado',
  'POST /agenda/:id/cancelar':        'aprovado',
  'GET /financeiro':                  'financeiro.ver',
  'POST /financeiro':                 'financeiro.editar',
  'PUT /financeiro/categorias':      'financeiro.editar',
  'PUT /financeiro/:id':              'financeiro.editar',
  'DELETE /financeiro/:id':           ['financeiro.excluir', 'acessos.gerenciar'],   // apagar lançamento: quem tem a permissão (Administração) ou administrador
  'GET /documentos':                  'aprovado',   // cada um vê os dos seus ministérios (a regra está na rota)
  'POST /documentos':                 'aprovado',   // líder do ministério, quem tem documentos.gerenciar ou administrador
  'PUT /documentos/:id':              'aprovado',
  'DELETE /documentos/:id':           'aprovado',
  'PUT /documentos/pasta-geral':      'documentos.gerenciar',
  'GET /escalas':                     'aprovado',
  'GET /escalas/minhas':              'aprovado',
  'PUT /escalas/:ministerio/funcoes': 'aprovado',
  'PUT /escalas/:ministerio/:data':   'aprovado',
  'POST /escalas/:ministerio/funcoes': 'aprovado',
  'PUT /escalas/funcoes/:id':         'aprovado',
  'DELETE /escalas/funcoes/:id':      'aprovado',
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
// Telefone sempre no mesmo padrão: (51) 99172-6412 / (51) 9172-6412. O que não parecer telefone fica como foi digitado.
function telefoneBR(v) {
  const s = txt(v, 30); if (!s) return null;
  let d = s.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return s;
}
// Data de hoje no horário de Brasília (o servidor roda em UTC)
const hojeBrasil = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
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
  // Limite de tentativas e busca da conta ao mesmo tempo (o banco fica longe)
  const [, u] = await Promise.all([seg.conferirLimite(email, ip),
    emailValido(email) ? umaLinha('SELECT id, nome, email, senha_hash, cd_status, versao_sessao FROM dbo.usuarios WHERE email = @email', { email }) : null]);
  const confere = await seg.conferirSenha(body.senha, u?.senha_hash);   // sempre roda o bcrypt (mesmo tempo com ou sem usuário)
  if (!u || !confere) {
    await seg.registrar('login_falhou', { email, ip, usuario: u ? { id: u.id, nome: u.nome } : null });
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  await Promise.all([query('UPDATE dbo.usuarios SET dt_ultimo_login = SYSUTCDATETIME() WHERE id = @id', { id: u.id }), seg.registrar('login', { usuario: u, email, ip })]);
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
      try { await emailRedefinirSenha(u.email, u.nome, `${origem}#/nova-senha?token=${token}`); }
      catch (e) {
        console.error('[email] redefinir senha:', e.message);
        throw new HttpError(503, 'Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos ou peça a um administrador para trocar a sua senha.');
      }
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
    SELECT u.id, u.nome, u.email, u.cd_status, u.dt_criacao, u.dt_ultimo_login, u.pessoa_id, p.nome AS pessoa_nome,
           CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           sug.id AS sugestao_id, sug.nome AS sugestao_nome
      FROM dbo.usuarios u LEFT JOIN dbo.pessoas p ON p.id = u.pessoa_id LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = u.pessoa_id
      OUTER APPLY (SELECT TOP 1 x.id, x.nome FROM dbo.pessoas x
                    WHERE u.pessoa_id IS NULL AND x.cd_status = 1 AND LOWER(x.email) = LOWER(u.email)
                      AND NOT EXISTS (SELECT 1 FROM dbo.usuarios o WHERE o.pessoa_id = x.id)) sug
     ORDER BY u.nome;
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
  // Vínculo com o cadastro (opcional): número = ligar, null = desligar, ausente = não mexe
  if (body.pessoa_id !== undefined) {
    const pid = body.pessoa_id === null ? null : int(body.pessoa_id);
    if (pid) {
      const dono = await umaLinha('SELECT TOP 1 u.nome FROM dbo.usuarios u WHERE u.pessoa_id = @pid AND u.id <> @id', { pid, id });
      if (dono) throw new HttpError(409, `Essa pessoa do cadastro já está ligada à conta de ${dono.nome}.`);
      if (!(await umaLinha('SELECT id FROM dbo.pessoas WHERE id = @pid', { pid }))) throw new HttpError(400, 'Pessoa não encontrada.');
    }
    await query('UPDATE dbo.usuarios SET pessoa_id = @pid WHERE id = @id', { pid, id });
  }
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

// Lista do cadastro para ligar uma conta a uma pessoa
rota('GET', '/acessos/pessoas', async () => query(`
  SELECT p.id, p.nome, p.referencia, p.email, (SELECT TOP 1 u.nome FROM dbo.usuarios u WHERE u.pessoa_id = p.id) AS ligada_a
    FROM dbo.pessoas p WHERE p.cd_status = 1 ORDER BY p.nome`), 'acessos.gerenciar');

// Ver o sistema como outra pessoa (para testar e ajudar). Não usa senha de ninguém e fica no registro de atividades.
rota('POST', '/acessos/ver-como/:id', async ({ params, usuario, ip, definirCookie }) => {
  const id = int(params.id);
  if (id === usuario.id) throw new HttpError(400, 'Essa já é a sua conta.');
  const alvo = await seg.carregarUsuario(id);
  if (!alvo || alvo.cd_status !== 1) throw new HttpError(400, 'Só dá para ver como uma conta liberada.');
  if (alvo.permissoes.includes('acessos.gerenciar')) throw new HttpError(400, 'Não dá para ver como outro administrador.');
  definirCookie(seg.cookieSessao(usuario, alvo.id));
  await seg.registrar('ver_como', { usuario, ip, detalhe: `começou a ver como ${alvo.nome}` });
  return { ok: true };
}, 'acessos.gerenciar');

rota('POST', '/auth/voltar', async ({ usuario, ip, definirCookie }) => {
  if (!usuario.verComoPor) return { ok: true };
  definirCookie(seg.cookieSessao({ id: usuario.verComoPor.id, versao_sessao: usuario.verComoPor.versao_sessao }));
  await seg.registrar('ver_como', { usuario, ip, detalhe: 'voltou para a própria conta' });
  return { ok: true };
}, 'logado');

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

// Quem está no grupo (vale também para o grupo Administradores). Só mexe em contas ativas;
// contas bloqueadas mantêm os grupos que tinham.
rota('PUT', '/acessos/grupos/:id/membros', async ({ params, body, usuario, ip }) => {
  const id = int(params.id);
  const g = await umaLinha('SELECT nome, sistema FROM dbo.grupos WHERE id = @id', { id });
  if (!g) throw new HttpError(404, 'Grupo não encontrado.');
  const membros = (Array.isArray(body.membros) ? body.membros : []).map(Number).filter(Number.isInteger);
  const r = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DELETE ug FROM dbo.usuario_grupo ug JOIN dbo.usuarios u ON u.id = ug.usuario_id WHERE ug.grupo_id = @id AND u.cd_status = 1;
    INSERT INTO dbo.usuario_grupo (usuario_id, grupo_id)
      SELECT DISTINCT u.id, @id FROM OPENJSON(@m) j JOIN dbo.usuarios u ON u.id = j.value AND u.cd_status = 1;
    DECLARE @admins INT = (${SQL_ADMINS_ATIVOS});
    DECLARE @euAdmin BIT = CASE WHEN EXISTS (SELECT 1 FROM dbo.usuario_grupo ug JOIN dbo.grupo_permissao gp ON gp.grupo_id = ug.grupo_id
                                WHERE ug.usuario_id = @eu AND gp.permissao = 'acessos.gerenciar')
                                OR EXISTS (SELECT 1 FROM dbo.usuario_grupo ug JOIN dbo.grupos gg ON gg.id = ug.grupo_id WHERE ug.usuario_id = @eu AND gg.sistema = 1)
                           THEN 1 ELSE 0 END;
    IF @admins = 0 OR @euAdmin = 0 BEGIN ROLLBACK; SELECT 0 AS ok; RETURN; END
    COMMIT; SELECT 1 AS ok;`, { id, m: JSON.stringify(membros), eu: usuario.id });
  if (!r.ok) throw new HttpError(400, 'Assim ninguém mais conseguiria cuidar dos acessos: o sistema precisa de pelo menos um administrador e você não pode tirar o seu próprio acesso.');
  await seg.registrar('grupos_alterados', { usuario, ip, detalhe: `${g.nome}: ${membros.length} pessoa(s) no grupo` });
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


rota('GET', '/contadores', async ({ usuario }) => {
  // Pastoral: casos em aberto (de todos, ou só os seus). Integração: quem distribui vê os visitantes esperando contato; a equipe, os seus casos.
  const contas = umaLinha(`
    SELECT CASE WHEN @past = 1 THEN (SELECT COUNT(*) FROM dbo.pastoral_casos WHERE area = 'pastoral' AND status <> 'concluido' AND responsavel_pessoa_id = @eu) ELSE 0 END AS pastoral,
           CASE WHEN @integ = 1 THEN (SELECT COUNT(*) FROM dbo.pastoral_casos WHERE area = 'integracao' AND status <> 'concluido' AND responsavel_pessoa_id = @eu) ELSE 0 END AS integracao,
           CASE WHEN @adm = 1 THEN (SELECT COUNT(*) FROM dbo.usuarios WHERE cd_status = 0) ELSE 0 END AS pendentes`,
  { past: pode(usuario, 'pastoral.ver') ? 1 : 0, ptodos: veTodos(usuario, 'pastoral') ? 1 : 0, integ: pode(usuario, 'integracao.ver') ? 1 : 0,
    adm: pode(usuario, 'acessos.gerenciar') ? 1 : 0, eu: euPessoa(usuario) });
  // Quem distribui vê no menu quantos esperam alguém (sem acompanhamento); a equipe vê os que estão com ela
  const semResp = (area) => umaLinha(`SELECT COUNT(*) AS n FROM dbo.pastoral_casos c JOIN dbo.pessoas p ON p.id = c.pessoa_id
    WHERE c.area = @area AND c.status <> 'concluido' AND c.responsavel_pessoa_id IS NULL AND p.cd_status = 1`, { area }).then((x) => x.n);
  const [r, past, integ] = await Promise.all([contas,
    pode(usuario, 'pastoral.ver') && designa(usuario, 'pastoral') ? Promise.all([calcularAlertas(), semResp('pastoral')]).then(([a, n]) => a.length + n) : null,
    pode(usuario, 'integracao.ver') && designa(usuario, 'integracao') ? Promise.all([visitantesSemContato(), semResp('integracao')]).then(([a, n]) => a.length + n) : null]);
  if (past !== null) r.pastoral = past;
  if (integ !== null) r.integracao = integ;
  return r;
});

// ------------------------------------------------------------------ MINISTÉRIOS
rota('GET', '/ministerios', async () => query(`
  SELECT m.id, m.nome, m.descricao, m.cor, m.cd_status, m.drive_url,
         (SELECT COUNT(*) FROM dbo.pessoa_ministerio pm JOIN dbo.pessoas p ON p.id = pm.pessoa_id
           WHERE pm.ministerio_id = m.id AND p.cd_status = 1) AS pessoas,
         (SELECT STRING_AGG(p.nome, ', ') FROM dbo.pessoa_ministerio pm JOIN dbo.pessoas p ON p.id = pm.pessoa_id
           WHERE pm.ministerio_id = m.id AND p.cd_status = 1 AND pm.lider = 1) AS lideres
  FROM dbo.ministerios m ORDER BY m.nome`));

function dadosMinisterio(b) {
  const nome = txt(b.nome, 80);
  if (!nome) throw new HttpError(400, 'Informe o nome.');
  return { nome, descricao: txt(b.descricao, 300), cor: /^#[0-9a-f]{6}$/i.test(b.cor || '') ? b.cor : '#1d5c4f', status: b.cd_status === 0 ? 0 : 1 };
}
rota('POST', '/ministerios', async ({ body, usuario, ip }) => {
  const d = dadosMinisterio(body);
  let m;
  try { m = await umaLinha('INSERT INTO dbo.ministerios (nome, descricao, cor, drive_url) OUTPUT inserted.id VALUES (@nome, @descricao, @cor, @drive)', { ...d, drive: linkDrive(body.drive_url, true) }); }
  catch (e) { if (e.number === 2627) throw new HttpError(409, 'Já existe um ministério com esse nome.'); throw e; }
  await seg.registrar('ministerio_salvo', { usuario, ip, detalhe: `${d.nome} (novo)` });
  return { id: m.id };
});
rota('PUT', '/ministerios/:id', async ({ params, body, usuario, ip }) => {
  const d = dadosMinisterio(body);
  try { await query('UPDATE dbo.ministerios SET nome=@nome, descricao=@descricao, cor=@cor, cd_status=@status, drive_url = CASE WHEN @mudaDrive = 1 THEN @drive ELSE drive_url END WHERE id=@id', { ...d, id: int(params.id), mudaDrive: body.drive_url === undefined ? 0 : 1, drive: linkDrive(body.drive_url, true) }); }
  catch (e) { if (e.number === 2627) throw new HttpError(409, 'Já existe um ministério com esse nome.'); throw e; }
  await seg.registrar('ministerio_salvo', { usuario, ip, detalhe: d.nome });
  return { ok: true };
});
rota('DELETE', '/ministerios/:id', async ({ params, usuario, ip }) => {
  const m = await umaLinha('DELETE FROM dbo.ministerios OUTPUT deleted.nome WHERE id=@id', { id: int(params.id) });
  if (m) await seg.registrar('ministerio_excluido', { usuario, ip, detalhe: m.nome });
  return { ok: true };
});
// Pessoas do ministério: lista de pessoas ativas (para escolher) marcando quem já participa
rota('GET', '/ministerios/:id/pessoas', async ({ params }) => query(`
  SELECT p.id, p.nome, p.referencia, CASE WHEN pm.pessoa_id IS NULL THEN 0 ELSE 1 END AS membro, ISNULL(pm.lider, 0) AS lider
  FROM dbo.pessoas p LEFT JOIN dbo.pessoa_ministerio pm ON pm.pessoa_id = p.id AND pm.ministerio_id = @id
  WHERE p.cd_status = 1 ORDER BY p.nome`, { id: params.id === '0' ? 0 : int(params.id) }));   // 0 = ministério novo
rota('PUT', '/ministerios/:id/pessoas', async ({ params, body, usuario, ip }) => {
  const id = int(params.id);
  const pessoas = (Array.isArray(body.pessoas) ? body.pessoas : []).map(Number).filter(Number.isInteger).slice(0, 2000);
  const lideres = (Array.isArray(body.lideres) ? body.lideres : []).map(Number).filter((x) => pessoas.includes(x));
  // o ministério e quem liderava antes (para tirar de "Líderes de equipe" se não lidera mais nada), numa ida só
  const [[m], antes] = await query('SELECT nome FROM dbo.ministerios WHERE id = @id; SELECT pessoa_id FROM dbo.pessoa_ministerio WHERE ministerio_id = @id AND lider = 1;', { id }, { todos: true });
  if (!m) throw new HttpError(404, 'Ministério não encontrado.');
  const lideresAntes = antes.map((x) => x.pessoa_id).filter((x) => !lideres.includes(x));
  await query(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DELETE pm FROM dbo.pessoa_ministerio pm JOIN dbo.pessoas p ON p.id = pm.pessoa_id WHERE pm.ministerio_id = @id AND p.cd_status = 1;
    INSERT INTO dbo.pessoa_ministerio (pessoa_id, ministerio_id, lider)
      SELECT DISTINCT p.id, @id, CASE WHEN p.id IN (SELECT value FROM OPENJSON(@l)) THEN 1 ELSE 0 END
        FROM OPENJSON(@p) j JOIN dbo.pessoas p ON p.id = j.value AND p.cd_status = 1;
    -- Líder de ministério = líder de equipe: entra sozinho no ministério "Líderes de equipe";
    -- quem deixou de liderar e não lidera nenhum outro ministério sai de lá
    DECLARE @le INT = (SELECT id FROM dbo.ministerios WHERE nome = @nomeLideres);
    IF @le IS NOT NULL AND @le <> @id
    BEGIN
      INSERT INTO dbo.pessoa_ministerio (pessoa_id, ministerio_id, lider)
        SELECT DISTINCT pm.pessoa_id, @le, 0 FROM dbo.pessoa_ministerio pm
         WHERE pm.ministerio_id = @id AND pm.lider = 1 AND NOT EXISTS (SELECT 1 FROM dbo.pessoa_ministerio x WHERE x.pessoa_id = pm.pessoa_id AND x.ministerio_id = @le);
      DELETE x FROM dbo.pessoa_ministerio x
       WHERE x.ministerio_id = @le AND x.pessoa_id IN (SELECT value FROM OPENJSON(@antes))
         AND NOT EXISTS (SELECT 1 FROM dbo.pessoa_ministerio o WHERE o.pessoa_id = x.pessoa_id AND o.lider = 1 AND o.ministerio_id <> @le);
    END
    COMMIT;`, { id, p: JSON.stringify(pessoas), l: JSON.stringify(lideres), nomeLideres: MINISTERIO_LIDERES, antes: JSON.stringify(lideresAntes) });
  await seg.registrar('ministerio_salvo', { usuario, ip, detalhe: `${m.nome}: ${pessoas.length} pessoa(s)` });
  return { ok: true };
});

// ------------------------------------------------------------------ PESSOAS
const ids = (s) => (s ? String(s).split(',').map(Number) : []);

rota('GET', '/pessoas', async () => {
  // Presenças e ministérios somados de uma vez (e não pessoa por pessoa): bem mais leve para o banco
  const rows = await query(`
    WITH pres AS (SELECT pr.pessoa_id, MAX(e.data) AS ultima, COUNT(*) AS n
                    FROM dbo.presencas pr JOIN dbo.encontros e ON e.id = pr.encontro_id WHERE pr.presente = 1 GROUP BY pr.pessoa_id),
         mins AS (SELECT pessoa_id, STRING_AGG(CAST(ministerio_id AS VARCHAR(10)), ',') AS ministerios FROM dbo.pessoa_ministerio GROUP BY pessoa_id)
    SELECT p.id, p.nome, p.referencia, p.tipo, p.data_nascimento, p.telefone, p.email, p.instagram, p.batizado, p.data_cadastro, p.cd_status,
           p.endereco, p.como_conheceu, p.grupo_cultivo, p.integrado_por,
           CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           pres.ultima AS ultima_presenca, ISNULL(pres.n, 0) AS presencas, mins.ministerios
    FROM dbo.pessoas p LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id
      LEFT JOIN pres ON pres.pessoa_id = p.id LEFT JOIN mins ON mins.pessoa_id = p.id
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
    SELECT id, area, responsavel_nome, responsavel_pessoa_id, motivo, status, desfecho, dt_abertura, dt_conclusao,
           (SELECT COUNT(*) FROM dbo.pastoral_registros r WHERE r.caso_id = c.id AND ISNULL(r.autor_nome, '') <> N'Sistema') AS contatos
      FROM dbo.pastoral_casos c WHERE pessoa_id = @id ORDER BY dt_abertura DESC;`,
  { id }, { todos: true });
  if (!pessoa[0]) throw new HttpError(404, 'Pessoa não encontrada.');
  pessoa[0].ministerios = ids(pessoa[0].ministerios);
  // Privacidade (LGPD): o acompanhamento só aparece na ficha para quem cuida da área (líder do ministério,
  // administradores) ou para quem é o responsável por um acompanhamento aberto desta pessoa (aí vê o histórico todo dela)
  const areas = ['pastoral', 'integracao'].filter((a) => pode(usuario, `${a}.ver`));
  const ehResponsavel = (a) => !!usuario.pessoa_id && casos.some((c) => c.area === a && c.status !== 'concluido' && c.responsavel_pessoa_id === usuario.pessoa_id);
  const areasVistas = areas.filter((a) => veTodos(usuario, a) || ehResponsavel(a));
  return { pessoa: pessoa[0], historico, casos: areasVistas.length ? casos.filter((c) => areasVistas.includes(c.area)) : null, areas: areasVistas,
    podeAbrir: areas.filter((a) => pode(usuario, `${a}.editar`)) };
});

const SITUACOES = ['novo_visitante', 'visitante_regular', 'ex_visitante', 'novo_membro', 'membro', 'membro_ativo'];
function dadosPessoa(b) {
  const nome = txt(b.nome, 150);
  if (!nome || nome.length < 2) throw new HttpError(400, 'Informe o nome.');
  return {
    nome,
    data_nascimento: (() => { const d = dataISO(b.data_nascimento); if (d && d > hojeUTC()) throw new HttpError(400, 'A data de nascimento não pode ser no futuro.'); return d; })(),
    sexo: ['M', 'F'].includes(b.sexo) ? b.sexo : null,
    telefone: telefoneBR(b.telefone), email: txt(b.email, 200), instagram: txt(b.instagram, 60), endereco: txt(b.endereco, 250),
    tipo: SITUACOES.includes(b.tipo) ? b.tipo : 'novo_visitante',
    batizado: b.batizado === true || b.batizado === 1 || b.batizado === 'sim' ? 1 : (b.batizado === false || b.batizado === 0 || b.batizado === 'nao' ? 0 : null),
    referencia: txt(b.referencia, 150), grupo_cultivo: txt(b.grupo_cultivo, 300), discipulado_por: txt(b.discipulado_por, 300),
    batismo_detalhe: txt(b.batismo_detalhe, 200), integrado_por: txt(b.integrado_por, 120),
    como_conheceu: txt(b.como_conheceu, 1000), observacoes: txt(b.observacoes, 8000),
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
    INSERT INTO dbo.pessoas (nome, referencia, data_nascimento, sexo, telefone, email, instagram, endereco, tipo, batizado, batismo_detalhe,
      grupo_cultivo, discipulado_por, integrado_por, como_conheceu, observacoes, data_cadastro, cd_status, criado_por)
    VALUES (@nome, @referencia, @data_nascimento, @sexo, @telefone, @email, @instagram, @endereco, @tipo, @batizado, @batismo_detalhe,
      @grupo_cultivo, @discipulado_por, @integrado_por, @como_conheceu, @observacoes, @data_cadastro, @cd_status, @uid);
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
      validas.push({ ...d, idx, ministerios: [...new Set(mins)] });
    } catch { /* linha sem nome válido: ignora */ }
  });
  if (!validas.length) throw new HttpError(400, 'Nenhuma linha tem nome válido.');
  const r = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DECLARE @novos TABLE (id INT, idx INT);
    MERGE dbo.pessoas AS t
    USING (
      SELECT j.* FROM OPENJSON(@json) WITH (
        idx INT, nome NVARCHAR(150), referencia NVARCHAR(150), data_nascimento DATE, sexo CHAR(1), telefone VARCHAR(30), email NVARCHAR(200),
        instagram NVARCHAR(60), endereco NVARCHAR(250), tipo VARCHAR(20), batizado BIT, batismo_detalhe NVARCHAR(200), grupo_cultivo NVARCHAR(300),
        discipulado_por NVARCHAR(300), integrado_por NVARCHAR(120), como_conheceu NVARCHAR(1000),
        observacoes NVARCHAR(MAX), data_cadastro DATE, cd_status TINYINT) j
      WHERE @pular = 0 OR NOT EXISTS (SELECT 1 FROM dbo.pessoas p WHERE p.nome = j.nome)
    ) AS s ON 1 = 0
    WHEN NOT MATCHED THEN INSERT (nome, referencia, data_nascimento, sexo, telefone, email, instagram, endereco, tipo, batizado, batismo_detalhe,
        grupo_cultivo, discipulado_por, integrado_por, como_conheceu, observacoes, data_cadastro, cd_status, criado_por)
      VALUES (s.nome, s.referencia, s.data_nascimento, s.sexo, s.telefone, s.email, s.instagram, s.endereco, s.tipo, s.batizado, s.batismo_detalhe,
        s.grupo_cultivo, s.discipulado_por, s.integrado_por, s.como_conheceu, s.observacoes, s.data_cadastro, s.cd_status, @uid)
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
    UPDATE dbo.pessoas SET nome=@nome, referencia=@referencia, data_nascimento=@data_nascimento, sexo=@sexo, telefone=@telefone, email=@email,
      instagram=@instagram, endereco=@endereco, tipo=@tipo, batizado=@batizado, batismo_detalhe=@batismo_detalhe, grupo_cultivo=@grupo_cultivo,
      discipulado_por=@discipulado_por, integrado_por=@integrado_por, como_conheceu=@como_conheceu,
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

rota('GET', '/fotos/:id', async ({ params, usuario }) => {
  const id = int(params.id);
  const podeVer = ['pessoas.ver', 'presenca.marcar', 'pastoral.ver', 'integracao.ver'].some((p) => pode(usuario, p)) || id === usuario.pessoa_id;
  if (!podeVer) throw new HttpError(403, 'Você não tem permissão para isso.');
  const f = await umaLinha('SELECT foto, content_type FROM dbo.pessoas_foto WHERE pessoa_id = @id', { id });
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
    SELECT p.id, p.nome, p.referencia, p.tipo, p.cd_status, p.data_cadastro, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           (SELECT MAX(e.data) FROM dbo.presencas pr2 JOIN dbo.encontros e ON e.id = pr2.encontro_id WHERE pr2.pessoa_id = p.id AND pr2.presente = 1) AS ultima_presenca
      FROM dbo.pessoas p LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id
     WHERE p.cd_status = 1 OR EXISTS (SELECT 1 FROM dbo.presencas x WHERE x.encontro_id = @eid AND x.pessoa_id = p.id)
     ORDER BY p.nome;
    SELECT pessoa_id, presente, justificativa FROM dbo.presencas WHERE encontro_id = @eid;`, { data }, { todos: true });
  return { encontro: enc[0] || null, pessoas, registros };
});

// Salvar a chamada MESCLANDO: cada celular manda só o que ele marcou ou mudou.
// Várias pessoas podem fazer a chamada ao mesmo tempo sem apagar o que a outra marcou.
//  - marcacoes: [{ pessoa_id, presente, justificativa, auto }]  (auto = "restantes como falta":
//    só grava se ninguém tiver marcado essa pessoa ainda)
//  - remover:   [pessoa_id]  (quem foi desmarcado neste celular)
//  - tema:      só muda se vier no pedido (o tema que outra pessoa escreveu não some)
// Também aceita o formato antigo { registros: [...] } (mesclando, sem apagar os outros).
rota('POST', '/presenca', async ({ body, usuario, ip }) => {
  const data = dataISO(body.data);
  if (!data) throw new HttpError(400, 'Informe a data.');
  if (data > hojeBrasil()) throw new HttpError(400, 'Não dá para salvar a chamada de uma data que ainda não chegou.');
  const brutas = Array.isArray(body.marcacoes) ? body.marcacoes : (Array.isArray(body.registros) ? body.registros : []);
  if (brutas.length > 2000) throw new HttpError(400, 'Marcações demais de uma vez.');
  const regs = brutas.map((r) => ({
    pessoa_id: int(r.pessoa_id), presente: r.presente ? 1 : 0, auto: r.auto && !r.presente ? 1 : 0,
    justificativa: r.presente ? null : txt(r.justificativa, 200),
  }));
  const remover = (Array.isArray(body.remover) ? body.remover : []).slice(0, 2000).map(int);
  if (!regs.length && !remover.length && body.tema === undefined) throw new HttpError(400, 'Marque pelo menos uma pessoa.');
  const r = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DECLARE @eid INT = (SELECT id FROM dbo.encontros WITH (UPDLOCK, HOLDLOCK) WHERE data = @data);
    IF @eid IS NULL BEGIN
      INSERT INTO dbo.encontros (data, tema, criado_por) VALUES (@data, @tema, @uid);
      SET @eid = SCOPE_IDENTITY();
    END ELSE IF @mudaTema = 1 UPDATE dbo.encontros SET tema = @tema WHERE id = @eid;
    MERGE dbo.presencas AS t
    USING (SELECT j.pessoa_id, j.presente, j.justificativa, j.auto, p.tipo
             FROM OPENJSON(@json) WITH (pessoa_id INT, presente BIT, justificativa NVARCHAR(200), auto BIT) j
             JOIN dbo.pessoas p ON p.id = j.pessoa_id) AS s
       ON t.encontro_id = @eid AND t.pessoa_id = s.pessoa_id
    WHEN MATCHED AND s.auto = 0 THEN
      UPDATE SET presente = s.presente, justificativa = s.justificativa, marcado_por = @uid, dt_marcacao = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (encontro_id, pessoa_id, presente, justificativa, marcado_por, tipo_na_data)
      VALUES (@eid, s.pessoa_id, s.presente, s.justificativa, @uid, s.tipo);
    DELETE FROM dbo.presencas WHERE encontro_id = @eid AND pessoa_id IN (SELECT value FROM OPENJSON(@remover));
    COMMIT;
    SELECT @eid AS id,
      (SELECT COUNT(*) FROM dbo.presencas WHERE encontro_id = @eid AND presente = 1) AS presentes,
      (SELECT COUNT(*) FROM dbo.presencas WHERE encontro_id = @eid AND presente = 0) AS ausentes;`,
  { data, tema: txt(body.tema, 200), mudaTema: body.tema === undefined ? 0 : 1, uid: usuario.id, json: JSON.stringify(regs), remover: JSON.stringify(remover) });
  // Auditoria e alertas da Pastoral ao mesmo tempo (cada espera em fila é uma ida ao banco)
  const [, alertas] = await Promise.all([
    seg.registrar('chamada_salva', { usuario, ip, detalhe: `${data}: agora ${r.presentes} presentes, ${r.ausentes} ausentes (${regs.length} marcações neste envio)` }),
    pode(usuario, 'pastoral.ver') ? calcularAlertas() : []]);
  return { encontro_id: r.id, presentes: r.presentes, ausentes: r.ausentes, alertas };
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

// ------------------------------------------------------------------ PASTORAL E INTEGRAÇÃO
// As duas áreas usam a mesma estrutura de acompanhamento (casos + registros de contato),
// separadas pela coluna "area". Cada área tem suas próprias permissões.
const MEMBROS_SQL = "('novo_membro','membro','membro_ativo')";

// Pastoral: quem já faz parte (visitante regular e membros), veio em algum dos últimos 6 encontros
// e está com N+ faltas seguidas, sem acompanhamento pastoral aberto. Novos visitantes são da Integração.
// Pastoral: quem entra como pendência
//  - membros (novo membro, membro, membro ativo) e visitantes que faltaram 2 sextas seguidas;
//  - quem está no ministério "Líderes de equipe" só entra com 3 faltas seguidas;
//  - só conta quem veio em alguma das últimas 6 sextas (até 5 semanas sem vir). Quem sumiu há mais tempo não entra;
//  - visitante que veio uma vez só fica com a Integração (primeiro contato), não com a Pastoral.
const MINISTERIO_LIDERES = 'Líderes de equipe';
const MAX_FALTAS_PASTORAL = 5;
async function calcularAlertas() {
  const rows = await query(`
    WITH ult AS (SELECT TOP (@n) e.id, e.data FROM dbo.encontros e WHERE EXISTS (SELECT 1 FROM dbo.presencas x WHERE x.encontro_id = e.id) ORDER BY e.data DESC)
    SELECT p.id, p.nome, p.referencia, p.tipo, p.telefone, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           u.data, pr.presente,
           CASE WHEN EXISTS (SELECT 1 FROM dbo.pessoa_ministerio pm JOIN dbo.ministerios m ON m.id = pm.ministerio_id
                             WHERE pm.pessoa_id = p.id AND m.nome = @lideres) THEN 1 ELSE 0 END AS lider,
           (SELECT COUNT(*) FROM dbo.presencas t WHERE t.pessoa_id = p.id AND t.presente = 1) AS visitas
      FROM dbo.pessoas p
      JOIN dbo.presencas pr ON pr.pessoa_id = p.id
      JOIN ult u ON u.id = pr.encontro_id
      LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id
     WHERE p.cd_status = 1 AND p.tipo IN ('novo_visitante','visitante_regular','novo_membro','membro','membro_ativo')
       AND NOT EXISTS (SELECT 1 FROM dbo.pastoral_casos c WHERE c.pessoa_id = p.id AND c.area = 'pastoral' AND c.status <> 'concluido')
     ORDER BY p.id, u.data DESC`, { n: MAX_FALTAS_PASTORAL + 1, lideres: MINISTERIO_LIDERES });
  const porPessoa = new Map();
  for (const r of rows) {
    let a = porPessoa.get(r.id);
    if (!a) { a = { pessoa: { id: r.id, nome: r.nome, referencia: r.referencia, tipo: r.tipo, telefone: r.telefone, foto_v: r.foto_v }, lider: !!r.lider, visitas: r.visitas, faltas: 0, ultimaPresenca: null, fim: false }; porPessoa.set(r.id, a); }
    if (a.fim) continue;
    if (r.presente) { a.ultimaPresenca = r.data; a.fim = true; } else a.faltas++;
  }
  return [...porPessoa.values()]
    .filter((a) => a.ultimaPresenca && a.faltas >= (a.lider ? FALTAS_ALERTA + 1 : FALTAS_ALERTA)
      && !(a.pessoa.tipo === 'novo_visitante' && a.visitas <= 1))
    .map(({ fim, visitas, ...a }) => a).sort((x, y) => y.faltas - x.faltas || x.pessoa.nome.localeCompare(y.pessoa.nome));
}

// Integração: visitantes que chegaram nos últimos 60 dias e ainda não têm acompanhamento de integração
async function visitantesSemContato() {
  return (await query(`
    SELECT p.id, p.nome, p.referencia, p.tipo, p.telefone, p.como_conheceu, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           v.primeira, v.visitas
      FROM dbo.pessoas p
      LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id
      OUTER APPLY (SELECT MIN(e.data) AS primeira, COUNT(*) AS visitas FROM dbo.presencas pr JOIN dbo.encontros e ON e.id = pr.encontro_id
                    WHERE pr.pessoa_id = p.id AND pr.presente = 1) v
     WHERE p.cd_status = 1 AND p.tipo IN ('novo_visitante','visitante_regular')
       AND COALESCE(v.primeira, p.data_cadastro) >= DATEADD(DAY, -60, CAST(GETDATE() AS DATE))
       AND NOT EXISTS (SELECT 1 FROM dbo.pastoral_casos c WHERE c.pessoa_id = p.id AND c.area = 'integracao')
     ORDER BY COALESCE(v.primeira, p.data_cadastro) DESC, p.nome`)).map((r) => ({
    pessoa: { id: r.id, nome: r.nome, referencia: r.referencia, tipo: r.tipo, telefone: r.telefone, foto_v: r.foto_v, como_conheceu: r.como_conheceu },
    primeiraVisita: r.primeira, visitas: r.visitas || 0,
  }));
}

// ---------- Quem vê e quem distribui ----------
// Equipe da área = pessoas do CADASTRO no ministério com o mesmo nome da área (Pastoral / Integração).
// Não depende de login: o responsável é avisado pelo WhatsApp.
// Ver todos os casos: permissão "<area>.ver_todos" ou ser líder do ministério da área.
// Designar/trocar responsável: permissão "<area>.designar" ou ser líder do ministério da área.
// Sem isso, a pessoa (ligada ao cadastro) vê só os casos em que ela é a responsável.
const chaveNome = (t) => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const NOMES_MINISTERIO = { pastoral: ['Pastoral'], integracao: ['Integração', 'Integracao'] };
const lideraArea = (u, area) => (u.ministerios || []).some((m) => m.lider && chaveNome(m.nome) === area);
const veTodos = (u, area) => pode(u, `${area}.ver_todos`) || lideraArea(u, area) || pode(u, 'acessos.gerenciar');
const designa = (u, area) => pode(u, `${area}.designar`) || lideraArea(u, area);
const euPessoa = (u) => u.pessoa_id || -1;

const equipeDaArea = (area) => query(`
  SELECT p.id AS pessoa_id, p.nome, p.telefone, CAST(MAX(CAST(pm.lider AS INT)) AS BIT) AS lider,
         (SELECT TOP 1 u.id FROM dbo.usuarios u WHERE u.pessoa_id = p.id AND u.cd_status = 1) AS usuario_id
    FROM dbo.pessoa_ministerio pm JOIN dbo.ministerios m ON m.id = pm.ministerio_id JOIN dbo.pessoas p ON p.id = pm.pessoa_id
   WHERE p.cd_status = 1 AND m.nome IN (@n1, @n2)
   GROUP BY p.id, p.nome, p.telefone ORDER BY p.nome`, { n1: NOMES_MINISTERIO[area][0], n2: NOMES_MINISTERIO[area][1] || NOMES_MINISTERIO[area][0] });

async function responsavelDaEquipe(area, pessoaId) {
  const id = int(pessoaId);
  const r = (await equipeDaArea(area)).find((x) => x.pessoa_id === id);
  if (!r) throw new HttpError(400, `Escolha alguém do ministério ${area === 'pastoral' ? 'Pastoral' : 'Integração'}.`);
  return r;
}

// Colunas comuns dos casos. "Sistema" = registro automático (ex.: "Enviado para Mayck"), não conta como contato.
const SQL_CASO = `
  c.id, c.pessoa_id, c.area, c.responsavel_nome, c.responsavel_id, c.responsavel_pessoa_id, c.motivo, c.status,
  c.dt_abertura, c.dt_conclusao, c.dt_enviado, c.desfecho,
  p.nome AS pessoa_nome, p.referencia AS pessoa_referencia, p.tipo AS pessoa_tipo, p.telefone AS pessoa_telefone, p.instagram AS pessoa_instagram,
  rp.telefone AS responsavel_telefone,
  CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
  (SELECT MAX(e.data) FROM dbo.presencas pr2 JOIN dbo.encontros e ON e.id = pr2.encontro_id WHERE pr2.pessoa_id = p.id AND pr2.presente = 1) AS ultima_presenca,
  (SELECT COUNT(*) FROM dbo.encontros e2 WHERE EXISTS (SELECT 1 FROM dbo.presencas x WHERE x.encontro_id = e2.id)
      AND e2.data > ISNULL((SELECT MAX(e.data) FROM dbo.presencas pr3 JOIN dbo.encontros e ON e.id = pr3.encontro_id WHERE pr3.pessoa_id = p.id AND pr3.presente = 1), '19000101')
      AND e2.data <= CAST(GETDATE() AS DATE)) AS hypes_sem_vir,
  (SELECT MAX(r.dt_criacao) FROM dbo.pastoral_registros r WHERE r.caso_id = c.id AND ISNULL(r.autor_nome, '') <> N'Sistema') AS ultimo_registro,
  (SELECT COUNT(*) FROM dbo.pastoral_registros r WHERE r.caso_id = c.id AND ISNULL(r.autor_nome, '') <> N'Sistema') AS contatos,
  CAST(CASE WHEN c.status <> 'concluido' AND c.dt_enviado < DATEADD(DAY, -7, SYSUTCDATETIME())
             AND NOT EXISTS (SELECT 1 FROM dbo.pastoral_registros r WHERE r.caso_id = c.id AND r.dt_criacao > c.dt_enviado AND ISNULL(r.autor_nome, '') <> N'Sistema')
            THEN 1 ELSE 0 END AS BIT) AS sem_retorno`;
const SQL_CASO_FROM = `FROM dbo.pastoral_casos c JOIN dbo.pessoas p ON p.id = c.pessoa_id
  LEFT JOIN dbo.pessoas rp ON rp.id = c.responsavel_pessoa_id LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id`;

// Como um acompanhamento termina (fica no histórico; quem cuida da área vê nos concluídos)
const DESFECHOS = {
  pastoral: { voltou: 'Voltou para o Hype', sem_retorno: 'Não deu retorno', nao_quer: 'Não quer voltar agora', mudou: 'Mudou de igreja ou de cidade', outro: 'Outro motivo' },
  integracao: { integrado: 'Está vindo e se enturmando', sem_retorno: 'Não deu retorno', nao_voltou: 'Não voltou mais', outro: 'Outro motivo' },
};
rota('GET', '/acompanhamentos/desfechos', async () => DESFECHOS, 'aprovado');

function rotasDeAcompanhamento(area) {
  const ver = `${area}.ver`, editar = `${area}.editar`;
  const precisaDesignar = (u) => { if (!designa(u, area)) throw new HttpError(403, 'Só quem distribui os acompanhamentos pode fazer isso.'); };
  // Caso existe, é desta área e a pessoa pode vê-lo
  const casoVisivel = async (u, id) => {
    const c = await umaLinha(`SELECT c.id, c.pessoa_id, c.status, c.responsavel_pessoa_id, c.responsavel_nome FROM dbo.pastoral_casos c WHERE c.id = @id AND c.area = @area
      AND (@todos = 1 OR EXISTS (SELECT 1 FROM dbo.pastoral_casos x WHERE x.pessoa_id = c.pessoa_id AND x.area = @area AND x.status <> 'concluido' AND x.responsavel_pessoa_id = @eu))`,
    { id: int(id), area, todos: veTodos(u, area) ? 1 : 0, eu: euPessoa(u) });
    if (!c) throw new HttpError(404, 'Acompanhamento não encontrado.');
    c.cuida = veTodos(u, area) || (c.status !== 'concluido' && c.responsavel_pessoa_id === euPessoa(u));
    return c;
  };
  // Registrar, concluir: só quem cuida da área ou o responsável deste acompanhamento (aberto)
  const casoQueCuido = async (u, id) => {
    const c = await casoVisivel(u, id);
    if (!c.cuida) throw new HttpError(403, 'Só o responsável ou quem cuida da área pode mexer neste acompanhamento.');
    return c;
  };

  rota('GET', `/${area}/equipe`, async () => equipeDaArea(area), ver);

  rota('GET', `/${area}`, async ({ usuario }) => {
    const todos = veTodos(usuario, area), distribui = designa(usuario, area);
    const [alertas, casos, equipe] = await Promise.all([
      distribui ? (area === 'pastoral' ? calcularAlertas() : visitantesSemContato()) : [],
      query(`SELECT TOP 800 ${SQL_CASO} ${SQL_CASO_FROM}
        WHERE c.area = @area AND p.cd_status = 1 AND (@todos = 1 OR (c.responsavel_pessoa_id = @eu AND c.status <> 'concluido'))
        ORDER BY CASE c.status WHEN 'aberto' THEN 0 WHEN 'em_andamento' THEN 1 ELSE 2 END, c.dt_abertura DESC`,
      { area, todos: todos ? 1 : 0, eu: euPessoa(usuario) }),
      equipeDaArea(area)]);
    return { alertas, casos, equipe, poder: { verTodos: todos, designar: distribui, vinculado: !!usuario.pessoa_id } };
  }, ver);

  rota('GET', `/${area}/casos/:id`, async ({ params, usuario }) => {
    const v = await casoVisivel(usuario, params.id);
    const [caso, registros, anteriores, regAnt] = await query(`
      SELECT ${SQL_CASO} ${SQL_CASO_FROM} WHERE c.id = @id AND c.area = @area;
      SELECT r.id, r.texto, r.autor_nome, r.dt_criacao FROM dbo.pastoral_registros r JOIN dbo.pastoral_casos c ON c.id = r.caso_id
       WHERE r.caso_id = @id AND c.area = @area ORDER BY r.dt_criacao DESC;
      SELECT c.id, c.responsavel_nome, c.motivo, c.status, c.desfecho, c.dt_abertura, c.dt_conclusao FROM dbo.pastoral_casos c
       WHERE c.pessoa_id = @pid AND c.area = @area AND c.id <> @id ORDER BY c.dt_abertura DESC;
      SELECT r.caso_id, r.texto, r.autor_nome, r.dt_criacao FROM dbo.pastoral_registros r JOIN dbo.pastoral_casos c ON c.id = r.caso_id
       WHERE c.pessoa_id = @pid AND c.area = @area AND c.id <> @id ORDER BY r.dt_criacao DESC;`, { id: int(params.id), area, pid: v.pessoa_id }, { todos: true });
    anteriores.forEach((a) => { a.registros = regAnt.filter((r) => r.caso_id === a.id); });
    return { caso: caso[0], registros, anteriores, poder: { designar: designa(usuario, area), cuidaDaArea: veTodos(usuario, area), cuida: v.cuida } };
  }, ver);

  // Abrir acompanhamento. Quem distribui escolhe o responsável da equipe; os demais abrem para si mesmos.
  const abrirCaso = async (usuario, pessoaId, motivo, nota, respPessoaId) => {
    let resp;
    if (designa(usuario, area)) resp = await responsavelDaEquipe(area, respPessoaId);
    else {
      if (!usuario.pessoa_id) throw new HttpError(400, 'Sua conta ainda não está ligada ao seu cadastro. Peça a um administrador.');
      resp = await umaLinha('SELECT id AS pessoa_id, nome FROM dbo.pessoas WHERE id = @id', { id: usuario.pessoa_id });
    }
    return umaLinha(`
      SET XACT_ABORT ON; BEGIN TRAN;
      IF EXISTS (SELECT 1 FROM dbo.pastoral_casos WITH (UPDLOCK, HOLDLOCK) WHERE pessoa_id = @pid AND area = @area AND status <> 'concluido') BEGIN ROLLBACK; SELECT 0 AS id; RETURN; END
      INSERT INTO dbo.pastoral_casos (pessoa_id, area, responsavel_nome, responsavel_pessoa_id, responsavel_id, motivo, criado_por)
      VALUES (@pid, @area, @resp, @rp, (SELECT TOP 1 id FROM dbo.usuarios WHERE pessoa_id = @rp AND cd_status = 1), @motivo, @uid);
      DECLARE @cid INT = SCOPE_IDENTITY();
      IF @nota IS NOT NULL INSERT INTO dbo.pastoral_registros (caso_id, texto, autor_nome, autor_id) VALUES (@cid, @nota, @autor, @uid);
      IF @nota IS NOT NULL UPDATE dbo.pastoral_casos SET status = 'em_andamento' WHERE id = @cid;
      COMMIT; SELECT @cid AS id;`,
    { pid: int(pessoaId), area, resp: resp.nome, rp: resp.pessoa_id, motivo: txt(motivo, 200), nota: txt(nota, 4000), uid: usuario.id, autor: usuario.nome });
  };
  rota('POST', `/${area}/casos`, async ({ body, usuario }) => {
    const r = await abrirCaso(usuario, body.pessoa_id, body.motivo, body.nota, body.responsavel_pessoa_id);
    if (!r.id) throw new HttpError(409, 'Essa pessoa já tem um acompanhamento em aberto.');
    return { id: r.id };
  }, editar);
  // Designar vários de uma vez (lista "Sem acompanhamento")
  rota('POST', `/${area}/casos/varios`, async ({ body, usuario, ip }) => {
    precisaDesignar(usuario);
    const pessoas = (Array.isArray(body.pessoas) ? body.pessoas : []).slice(0, 300);
    if (!pessoas.length) throw new HttpError(400, 'Selecione pelo menos uma pessoa.');
    const resp = await responsavelDaEquipe(area, body.responsavel_pessoa_id);
    let n = 0;
    for (const x of pessoas) { const r = await abrirCaso(usuario, x.pessoa_id, x.motivo, null, resp.pessoa_id); if (r.id) n++; }
    await seg.registrar('casos_designados', { usuario, ip, detalhe: `${area}: ${n} novos para ${resp.nome}` });
    return { abertos: n };
  }, editar);

  // Muda só o que vier: situação (quem cuida do caso), responsável e motivo (quem distribui)
  rota('PUT', `/${area}/casos/:id`, async ({ params, body, usuario }) => {
    await casoVisivel(usuario, params.id);
    const st = body.status === undefined ? null : body.status;
    if (st !== null && !['aberto', 'em_andamento'].includes(st)) throw new HttpError(400, 'Para concluir, use "Concluir acompanhamento".');
    let resp = null;
    if (st !== null || body.responsavel_pessoa_id !== undefined || body.motivo !== undefined) precisaDesignar(usuario);
    if (body.responsavel_pessoa_id !== undefined) resp = await responsavelDaEquipe(area, body.responsavel_pessoa_id);
    await query(`UPDATE dbo.pastoral_casos SET
        status = COALESCE(@st, status),
        dt_conclusao = CASE WHEN @st IS NULL THEN dt_conclusao ELSE NULL END,
        desfecho = CASE WHEN @st IS NULL THEN desfecho ELSE NULL END,
        responsavel_nome = COALESCE(@resp, responsavel_nome),
        responsavel_pessoa_id = CASE WHEN @rp IS NULL THEN responsavel_pessoa_id ELSE @rp END,
        responsavel_id = CASE WHEN @rp IS NULL THEN responsavel_id ELSE (SELECT TOP 1 id FROM dbo.usuarios WHERE pessoa_id = @rp AND cd_status = 1) END,
        dt_enviado = CASE WHEN @rp IS NULL OR @rp = ISNULL(responsavel_pessoa_id, -1) THEN dt_enviado ELSE NULL END,
        motivo = CASE WHEN @mudaMotivo = 1 THEN @motivo ELSE motivo END
      WHERE id = @id AND area = @area`,
    { st, resp: resp?.nome ?? null, rp: resp?.pessoa_id ?? null, mudaMotivo: body.motivo === undefined ? 0 : 1, motivo: txt(body.motivo, 200), id: int(params.id), area });
    return { ok: true };
  }, editar);

  // Ações em massa
  const listaIds = (b) => {
    const v = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!v.length) throw new HttpError(400, 'Selecione pelo menos um acompanhamento.');
    if (v.length > 500) throw new HttpError(400, 'Selecione no máximo 500 de uma vez.');
    return JSON.stringify([...new Set(v)]);
  };
  // Mesmo responsável para vários
  rota('POST', `/${area}/casos/responsavel`, async ({ body, usuario, ip }) => {
    precisaDesignar(usuario);
    const resp = await responsavelDaEquipe(area, body.responsavel_pessoa_id);
    const r = await umaLinha(`UPDATE dbo.pastoral_casos SET responsavel_nome = @resp, responsavel_pessoa_id = @rp,
        responsavel_id = (SELECT TOP 1 id FROM dbo.usuarios WHERE pessoa_id = @rp AND cd_status = 1),
        dt_enviado = CASE WHEN ISNULL(responsavel_pessoa_id, -1) = @rp THEN dt_enviado ELSE NULL END
      WHERE area = @area AND id IN (SELECT value FROM OPENJSON(@ids)); SELECT @@ROWCOUNT AS n;`, { area, resp: resp.nome, rp: resp.pessoa_id, ids: listaIds(body) });
    await seg.registrar('casos_designados', { usuario, ip, detalhe: `${area}: ${r.n} para ${resp.nome}` });
    return { ok: true, n: r.n };
  }, editar);
  // Enviado ao responsável pelo WhatsApp: fica no histórico e o caso passa para "em andamento"
  rota('POST', `/${area}/casos/enviados`, async ({ body, usuario, ip }) => {
    precisaDesignar(usuario);
    const r = await umaLinha(`
      SET XACT_ABORT ON; BEGIN TRAN;
      DECLARE @c TABLE (id INT, resp NVARCHAR(120));
      UPDATE dbo.pastoral_casos SET dt_enviado = SYSUTCDATETIME(), status = CASE WHEN status = 'aberto' THEN 'em_andamento' ELSE status END
      OUTPUT inserted.id, inserted.responsavel_nome INTO @c
      WHERE area = @area AND status <> 'concluido' AND responsavel_pessoa_id IS NOT NULL AND id IN (SELECT value FROM OPENJSON(@ids));
      INSERT INTO dbo.pastoral_registros (caso_id, texto, autor_nome, autor_id)
      SELECT id, N'Enviado para ' + resp + N' pelo WhatsApp por ' + @quem + N'.', N'Sistema', @uid FROM @c;
      COMMIT; SELECT COUNT(*) AS n FROM @c;`, { area, ids: listaIds(body), quem: usuario.verComoPor?.nome || usuario.nome, uid: usuario.id });
    await seg.registrar('casos_enviados', { usuario, ip, detalhe: `${area}: ${r.n} enviados ao responsável` });
    return { enviados: r.n };
  }, editar);

  rota('POST', `/${area}/casos/:id/registros`, async ({ params, body, usuario }) => {
    const c = await casoQueCuido(usuario, params.id);
    if (c.status === 'concluido') throw new HttpError(400, 'Este acompanhamento já foi concluído. Para continuar, reabra.');
    const texto = txt(body.texto, 4000);
    if (!texto) throw new HttpError(400, 'Escreva o registro.');
    await query(`
      INSERT INTO dbo.pastoral_registros (caso_id, texto, autor_nome, autor_id) VALUES (@id, @texto, @autor, @uid);
      UPDATE dbo.pastoral_casos SET status = 'em_andamento' WHERE id = @id AND status = 'aberto';`,
    { id: int(params.id), texto, autor: usuario.verComoPor ? `${usuario.verComoPor.nome} (como ${usuario.nome})` : usuario.nome, uid: usuario.id });
    return { ok: true };
  }, editar);

  rota('POST', `/${area}/casos/concluir`, async ({ body, usuario, ip }) => {
    const desfecho = DESFECHOS[area][body.desfecho];
    if (!desfecho) throw new HttpError(400, 'Escolha como o acompanhamento terminou.');
    const nota = txt(body.nota, 4000);
    const r = await umaLinha(`
      SET XACT_ABORT ON; BEGIN TRAN;
      DECLARE @c TABLE (id INT);
      UPDATE dbo.pastoral_casos SET status = 'concluido', dt_conclusao = SYSUTCDATETIME(), desfecho = @desfecho
      OUTPUT inserted.id INTO @c
      WHERE area = @area AND status <> 'concluido' AND id IN (SELECT value FROM OPENJSON(@ids))
        AND (@todos = 1 OR responsavel_pessoa_id = @eu);
      IF @nota IS NOT NULL INSERT INTO dbo.pastoral_registros (caso_id, texto, autor_nome, autor_id) SELECT id, @nota, @autor, @uid FROM @c;
      INSERT INTO dbo.pastoral_registros (caso_id, texto, autor_nome, autor_id) SELECT id, N'Concluído: ' + @rotulo + N' (por ' + @quem + N').', N'Sistema', @uid FROM @c;
      COMMIT; SELECT COUNT(*) AS n FROM @c;`,
    { area, ids: listaIds(body), todos: veTodos(usuario, area) ? 1 : 0, eu: euPessoa(usuario), desfecho: body.desfecho, rotulo: desfecho, nota,
      autor: usuario.verComoPor ? `${usuario.verComoPor.nome} (como ${usuario.nome})` : usuario.nome, quem: usuario.verComoPor?.nome || usuario.nome, uid: usuario.id });
    await seg.registrar('casos_concluidos', { usuario, ip, detalhe: `${area}: ${r.n} concluídos em massa` });
    return { concluidos: r.n };
  }, editar);
  rota('POST', `/${area}/casos/excluir`, async ({ body, usuario, ip }) => {
    const r = await umaLinha(`DELETE FROM dbo.pastoral_casos WHERE area = @area AND id IN (SELECT value FROM OPENJSON(@ids)); SELECT @@ROWCOUNT AS n;`, { area, ids: listaIds(body) });
    await seg.registrar('caso_excluido', { usuario, ip, detalhe: `${area}: ${r.n} excluídos em massa` });
    return { excluidos: r.n };
  }, 'pastoral.excluir');

  rota('DELETE', `/${area}/casos/:id`, async ({ params, usuario, ip }) => {
    const c = await umaLinha(`DELETE c OUTPUT deleted.pessoa_id FROM dbo.pastoral_casos c WHERE c.id = @id AND c.area = @area`, { id: int(params.id), area });
    if (c) await seg.registrar('caso_excluido', { usuario, ip, detalhe: `${area}: acompanhamento ${params.id} (pessoa ${c.pessoa_id})` });
    return { ok: true };
  }, 'pastoral.excluir');
}
rotasDeAcompanhamento('pastoral');
rotasDeAcompanhamento('integracao');

// ------------------------------------------------------------------ AGENDA E ESCALAS
// Administrador (acessos.gerenciar) vê e altera tudo. Líder do ministério altera o seu.
// Todos os líderes (de qualquer ministério) e o ministério "Líderes de equipe" veem as escalas de todos.
const ehGestor = (u) => pode(u, 'acessos.gerenciar');
const meusMinisterios = (u) => (u.ministerios || []).map((m) => m.id);
const lideraMinisterio = (u, id) => ehGestor(u) || (u.ministerios || []).some((m) => m.id === id && m.lider);
const precisaLiderar = (u, id) => { if (!lideraMinisterio(u, id)) throw new HttpError(403, 'Só o líder deste ministério (ou um administrador) pode fazer isso.'); };
const horaValida = (h) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(h || '') ? h : null);

// ---------- Agenda ----------
rota('GET', '/agenda', async ({ query: q, usuario }) => {
  const anteriores = q.periodo === 'anteriores';
  const [reunioes, pessoas, minsGestor] = await query(`
    SELECT r.id, r.ministerio_id, m.nome AS ministerio, m.cor, r.titulo, CONVERT(VARCHAR(19), r.inicio, 126) AS inicio, CONVERT(VARCHAR(19), r.fim, 126) AS fim,
           r.local, r.descricao, r.cancelada, r.sequencia
      FROM dbo.reunioes r JOIN dbo.ministerios m ON m.id = r.ministerio_id
     WHERE (@todos = 1 OR r.ministerio_id IN (SELECT value FROM OPENJSON(@mins))
            OR EXISTS (SELECT 1 FROM dbo.reuniao_pessoa rp WHERE rp.reuniao_id = r.id AND rp.pessoa_id = @eu))
       AND ((@ant = 0 AND r.fim >= DATEADD(HOUR, -3, SYSUTCDATETIME())) OR (@ant = 1 AND r.fim < DATEADD(HOUR, -3, SYSUTCDATETIME())))
     ORDER BY CASE WHEN @ant = 1 THEN NULL ELSE r.inicio END, r.inicio DESC;
    SELECT rp.reuniao_id, p.id, p.nome, CASE WHEN p.email LIKE '%_@_%._%' THEN 1 ELSE 0 END AS tem_email, CONVERT(VARCHAR(19), rp.dt_convite, 126) AS dt_convite
      FROM dbo.reuniao_pessoa rp JOIN dbo.pessoas p ON p.id = rp.pessoa_id
     WHERE EXISTS (SELECT 1 FROM dbo.reunioes r2 WHERE r2.id = rp.reuniao_id
       AND ((@ant = 0 AND r2.fim >= DATEADD(HOUR, -3, SYSUTCDATETIME())) OR (@ant = 1 AND r2.fim < DATEADD(HOUR, -3, SYSUTCDATETIME()))));
    SELECT id, nome, cor FROM dbo.ministerios WHERE cd_status = 1 AND @todos = 1 ORDER BY nome;`,
  { todos: ehGestor(usuario) ? 1 : 0, mins: JSON.stringify(meusMinisterios(usuario)), eu: euPessoa(usuario), ant: anteriores ? 1 : 0 }, { todos: true });
  reunioes.forEach((r) => {
    r.pessoas = pessoas.filter((p) => p.reuniao_id === r.id).map(({ reuniao_id, ...p }) => p);
    r.pode_editar = lideraMinisterio(usuario, r.ministerio_id);
    r.eu_participo = r.pessoas.some((p) => p.id === usuario.pessoa_id);
  });
  const ministerios = ehGestor(usuario) ? minsGestor
    : (usuario.ministerios || []).filter((m) => m.lider);
  return { reunioes, posso_criar: ministerios.map((m) => ({ id: m.id, nome: m.nome })), email_ativo: !!(process.env.SMTP_USER && process.env.SMTP_PASS) };
});

rota('GET', '/agenda/membros/:id', async ({ params, usuario }) => {
  const id = int(params.id);
  precisaLiderar(usuario, id);
  return query(`SELECT p.id, p.nome, CASE WHEN p.email LIKE '%_@_%._%' THEN 1 ELSE 0 END AS tem_email, pm.lider
    FROM dbo.pessoa_ministerio pm JOIN dbo.pessoas p ON p.id = pm.pessoa_id WHERE pm.ministerio_id = @id AND p.cd_status = 1 ORDER BY p.nome`, { id });
});

function dadosReuniao(b) {
  const titulo = txt(b.titulo, 150);
  if (!titulo) throw new HttpError(400, 'Informe o título da reunião.');
  const data = dataISO(b.data), ini = horaValida(b.hora_inicio), fim = horaValida(b.hora_fim) || ini;
  if (!data || !ini) throw new HttpError(400, 'Informe a data e o horário.');
  if (fim < ini) throw new HttpError(400, 'O horário de término é antes do início.');
  return { titulo, inicio: `${data}T${ini}:00`, fim: `${data}T${fim === ini ? `${String(Math.min(23, Number(ini.slice(0, 2)) + 1)).padStart(2, '0')}${ini.slice(2)}` : fim}:00`,
    local: txt(b.local, 250), descricao: txt(b.descricao, 1000) };
}
async function enviarConvites(reuniaoId, { cancelar = false, soNovos = false } = {}) {
  const [r] = await query(`SELECT r.id, r.titulo, CONVERT(VARCHAR(19), r.inicio, 126) AS inicio, CONVERT(VARCHAR(19), r.fim, 126) AS fim, r.local, r.descricao, r.sequencia, m.nome AS ministerio
    FROM dbo.reunioes r JOIN dbo.ministerios m ON m.id = r.ministerio_id WHERE r.id = @id`, { id: reuniaoId });
  const convidados = await query(`SELECT p.id, p.nome, p.email FROM dbo.reuniao_pessoa rp JOIN dbo.pessoas p ON p.id = rp.pessoa_id
    WHERE rp.reuniao_id = @id AND p.email LIKE '%_@_%._%' AND (@so = 0 OR rp.dt_convite IS NULL)`, { id: reuniaoId, so: soNovos ? 1 : 0 });
  const enviados = convidados.length ? await emailConvites({ ...r, uid: `reuniao-${r.id}@gestao-hype` }, convidados.slice(0, 80), { cancelar }) : 0;
  if (enviados) await query(`UPDATE dbo.reuniao_pessoa SET dt_convite = SYSUTCDATETIME() WHERE reuniao_id = @id AND pessoa_id IN (SELECT value FROM OPENJSON(@ids))`,
    { id: reuniaoId, ids: JSON.stringify(convidados.map((c) => c.id)) });
  return enviados;
}
const listaPessoas = (b) => [...new Set((Array.isArray(b.pessoas) ? b.pessoas : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 300);

rota('POST', '/agenda', async ({ body, usuario, ip }) => {
  const mid = int(body.ministerio_id);
  precisaLiderar(usuario, mid);
  const d = dadosReuniao(body);
  const r = await umaLinha(`
    SET XACT_ABORT ON; BEGIN TRAN;
    INSERT INTO dbo.reunioes (ministerio_id, titulo, inicio, fim, local, descricao, criado_por) VALUES (@mid, @titulo, @inicio, @fim, @local, @descricao, @uid);
    DECLARE @id INT = SCOPE_IDENTITY();
    INSERT INTO dbo.reuniao_pessoa (reuniao_id, pessoa_id) SELECT @id, p.id FROM OPENJSON(@p) j JOIN dbo.pessoas p ON p.id = j.value AND p.cd_status = 1;
    COMMIT; SELECT @id AS id;`, { mid, ...d, uid: usuario.id, p: JSON.stringify(listaPessoas(body)) });
  const enviados = body.enviar ? await enviarConvites(r.id) : 0;
  await seg.registrar('reuniao_salva', { usuario, ip, detalhe: `${d.titulo} (${d.inicio.slice(0, 16).replace('T', ' ')}), ${enviados} convites` });
  return { id: r.id, enviados };
});

rota('PUT', '/agenda/:id', async ({ params, body, usuario, ip }) => {
  const id = int(params.id);
  const atual = await umaLinha('SELECT ministerio_id FROM dbo.reunioes WHERE id = @id', { id });
  if (!atual) throw new HttpError(404, 'Reunião não encontrada.');
  precisaLiderar(usuario, atual.ministerio_id);
  const d = dadosReuniao(body);
  await query(`
    SET XACT_ABORT ON; BEGIN TRAN;
    UPDATE dbo.reunioes SET titulo = @titulo, inicio = @inicio, fim = @fim, local = @local, descricao = @descricao, cancelada = 0, sequencia = sequencia + 1 WHERE id = @id;
    DELETE FROM dbo.reuniao_pessoa WHERE reuniao_id = @id AND pessoa_id NOT IN (SELECT value FROM OPENJSON(@p));
    INSERT INTO dbo.reuniao_pessoa (reuniao_id, pessoa_id) SELECT @id, p.id FROM OPENJSON(@p) j JOIN dbo.pessoas p ON p.id = j.value AND p.cd_status = 1
      WHERE NOT EXISTS (SELECT 1 FROM dbo.reuniao_pessoa x WHERE x.reuniao_id = @id AND x.pessoa_id = p.id);
    COMMIT;`, { id, ...d, p: JSON.stringify(listaPessoas(body)) });
  const enviados = body.enviar ? await enviarConvites(id) : 0;   // reenviar: a agenda de quem já tinha o convite atualiza sozinha
  await seg.registrar('reuniao_salva', { usuario, ip, detalhe: `${d.titulo} (alterada), ${enviados} convites` });
  return { ok: true, enviados };
});

rota('POST', '/agenda/:id/cancelar', async ({ params, usuario, ip }) => {
  const id = int(params.id);
  const atual = await umaLinha('SELECT ministerio_id, titulo FROM dbo.reunioes WHERE id = @id', { id });
  if (!atual) throw new HttpError(404, 'Reunião não encontrada.');
  precisaLiderar(usuario, atual.ministerio_id);
  await query('UPDATE dbo.reunioes SET cancelada = 1, sequencia = sequencia + 1 WHERE id = @id', { id });
  const avisados = await enviarConvites(id, { cancelar: true });
  await seg.registrar('reuniao_cancelada', { usuario, ip, detalhe: `${atual.titulo}, ${avisados} avisados` });
  return { avisados };
});

// ---------- Escalas ----------
rota('GET', '/escalas', async ({ query: q, usuario }) => {
  const mes = /^\d{4}-\d{2}$/.test(q.mes || '') ? q.mes : hojeBrasil().slice(0, 7);
  // Todo mundo com acesso vê as escalas de todos os ministérios (só o líder altera a do seu)
  const todos = true;
  const [ministerios, funcoes, itens, membros] = await query(`
    SELECT m.id, m.nome, m.cor FROM dbo.ministerios m WHERE m.cd_status = 1 AND (@todos = 1 OR m.id IN (SELECT value FROM OPENJSON(@mins))) ORDER BY m.nome;
    SELECT f.id, f.ministerio_id, f.nome, f.ordem, f.vagas FROM dbo.escala_funcoes f ORDER BY f.ministerio_id, f.ordem, f.nome;
    SELECT i.id, i.ministerio_id, CONVERT(CHAR(10), i.data, 126) AS data, i.funcao, i.pessoa_id, p.nome
      FROM dbo.escala_itens i JOIN dbo.pessoas p ON p.id = i.pessoa_id
     WHERE i.data >= DATEFROMPARTS(@ano, @mes, 1) AND i.data < DATEADD(MONTH, 1, DATEFROMPARTS(@ano, @mes, 1));
    SELECT pm.ministerio_id, p.id, p.nome, pm.lider FROM dbo.pessoa_ministerio pm JOIN dbo.pessoas p ON p.id = pm.pessoa_id WHERE p.cd_status = 1 ORDER BY p.nome;`,
  { todos: todos ? 1 : 0, mins: JSON.stringify(meusMinisterios(usuario)), ano: Number(mes.slice(0, 4)), mes: Number(mes.slice(5, 7)) }, { todos: true });
  const ids = new Set(ministerios.map((m) => m.id));
  return {
    mes, ve_todas: todos,
    ministerios: ministerios.map((m) => ({ ...m, pode_editar: lideraMinisterio(usuario, m.id),
      funcoes: funcoes.filter((f) => f.ministerio_id === m.id),
      // a lista da equipe só vai para quem monta a escala daquele ministério
      membros: lideraMinisterio(usuario, m.id) ? membros.filter((x) => x.ministerio_id === m.id).map(({ ministerio_id, ...x }) => x) : [] })),
    itens: itens.filter((i) => ids.has(i.ministerio_id)),
  };
});

rota('GET', '/escalas/minhas', async ({ usuario }) => {
  if (!usuario.pessoa_id) return { vinculado: false, itens: [] };
  const itens = await query(`SELECT CONVERT(CHAR(10), i.data, 126) AS data, i.funcao, i.ministerio_id, m.nome AS ministerio, m.cor
    FROM dbo.escala_itens i JOIN dbo.ministerios m ON m.id = i.ministerio_id
    WHERE i.pessoa_id = @eu AND i.data >= DATEADD(DAY, -1, CAST(DATEADD(HOUR, -3, SYSUTCDATETIME()) AS DATE)) ORDER BY i.data, m.nome`, { eu: usuario.pessoa_id });
  return { vinculado: true, itens };
});

// Salva todas as funções do ministério de uma vez (nome e quantas pessoas cada uma precisa).
// Função tirada da lista é apagada; a escala já montada continua mostrando o nome dela.
rota('PUT', '/escalas/:ministerio/funcoes', async ({ params, body, usuario, ip }) => {
  const mid = int(params.ministerio);
  precisaLiderar(usuario, mid);
  const lista = (Array.isArray(body.funcoes) ? body.funcoes : []).slice(0, 40).map((f, i) => ({
    id: Number.isInteger(f.id) ? f.id : null, nome: txt(f.nome, 60), ordem: i + 1,
    vagas: Number.isInteger(f.vagas) && f.vagas > 0 && f.vagas <= 99 ? f.vagas : null,
  })).filter((f) => f.nome);
  const vistos = new Set();
  for (const f of lista) { const k = f.nome.toLowerCase(); if (vistos.has(k)) throw new HttpError(400, `A função "${f.nome}" aparece duas vezes.`); vistos.add(k); }
  await query(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DECLARE @l TABLE (id INT NULL, nome NVARCHAR(60), ordem INT, vagas INT NULL);
    INSERT INTO @l SELECT id, nome, ordem, vagas FROM OPENJSON(@j) WITH (id INT, nome NVARCHAR(60), ordem INT, vagas INT);
    -- renomeou: a escala das próximas sextas acompanha o nome novo
    UPDATE i SET funcao = l.nome FROM dbo.escala_itens i
      JOIN dbo.escala_funcoes f ON f.ministerio_id = @mid AND i.ministerio_id = @mid AND i.funcao = f.nome
      JOIN @l l ON l.id = f.id AND l.nome <> f.nome
     WHERE i.data >= CAST(GETDATE() AS DATE);
    DELETE FROM dbo.escala_funcoes WHERE ministerio_id = @mid AND id NOT IN (SELECT id FROM @l WHERE id IS NOT NULL);
    UPDATE f SET nome = l.nome, ordem = l.ordem, vagas = l.vagas FROM dbo.escala_funcoes f JOIN @l l ON l.id = f.id WHERE f.ministerio_id = @mid;
    INSERT INTO dbo.escala_funcoes (ministerio_id, nome, ordem, vagas) SELECT @mid, nome, ordem, vagas FROM @l WHERE id IS NULL;
    COMMIT;`, { mid, j: JSON.stringify(lista) });
  await seg.registrar('escala_funcoes', { usuario, ip, detalhe: `ministério ${mid}: ${lista.map((f) => f.nome + (f.vagas ? ` (${f.vagas})` : '')).join(', ')}` });
  return { ok: true };
});

// Salva a escala de UM ministério em UMA data (troca tudo daquela célula de uma vez)
rota('PUT', '/escalas/:ministerio/:data', async ({ params, body, usuario, ip }) => {
  const mid = int(params.ministerio), data = dataISO(params.data);
  if (!data) throw new HttpError(400, 'Data inválida.');
  precisaLiderar(usuario, mid);
  const itens = (Array.isArray(body.itens) ? body.itens : []).slice(0, 200)
    .map((i) => ({ pessoa_id: int(i.pessoa_id), funcao: txt(i.funcao, 60) }));
  const funcao = body.funcao === undefined ? undefined : txt(body.funcao, 60);
  await query(`
    SET XACT_ABORT ON; BEGIN TRAN;
    -- Dois líderes salvando a mesma sexta do mesmo ministério ao mesmo tempo: um espera o outro (nada duplica)
    DECLARE @trava NVARCHAR(100) = CONCAT(N'escala:', @mid, N':', CONVERT(CHAR(10), @data, 126));
    EXEC sp_getapplock @Resource = @trava, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
    DELETE FROM dbo.escala_itens WHERE ministerio_id = @mid AND data = @data AND (@todas = 1 OR ISNULL(funcao, N'') = ISNULL(@funcao, N''));
    INSERT INTO dbo.escala_itens (ministerio_id, data, funcao, pessoa_id, criado_por)
      SELECT DISTINCT @mid, @data, j.funcao, p.id, @uid FROM OPENJSON(@itens) WITH (pessoa_id INT, funcao NVARCHAR(60)) j JOIN dbo.pessoas p ON p.id = j.pessoa_id AND p.cd_status = 1;
    COMMIT;`, { mid, data, todas: funcao === undefined ? 1 : 0, funcao: funcao ?? null, itens: JSON.stringify(funcao === undefined ? itens : itens.map((i) => ({ ...i, funcao }))), uid: usuario.id });
  await seg.registrar('escala_salva', { usuario, ip, detalhe: `ministério ${mid}, ${data}: ${itens.length} pessoa(s)${funcao ? ` em ${funcao}` : ''}` });
  return { ok: true };
});

rota('POST', '/escalas/:ministerio/funcoes', async ({ params, body, usuario }) => {
  const mid = int(params.ministerio);
  precisaLiderar(usuario, mid);
  const nome = txt(body.nome, 60);
  if (!nome) throw new HttpError(400, 'Informe o nome da função.');
  const r = await umaLinha(`INSERT INTO dbo.escala_funcoes (ministerio_id, nome, ordem) OUTPUT inserted.id
    VALUES (@mid, @nome, (SELECT ISNULL(MAX(ordem), 0) + 1 FROM dbo.escala_funcoes WHERE ministerio_id = @mid))`, { mid, nome });
  return { id: r.id };
});
rota('PUT', '/escalas/funcoes/:id', async ({ params, body, usuario }) => {
  const f = await umaLinha('SELECT ministerio_id, nome FROM dbo.escala_funcoes WHERE id = @id', { id: int(params.id) });
  if (!f) throw new HttpError(404, 'Função não encontrada.');
  precisaLiderar(usuario, f.ministerio_id);
  const nome = txt(body.nome, 60);
  if (!nome) throw new HttpError(400, 'Informe o nome da função.');
  // Renomear também atualiza a escala já montada com o nome antigo
  await query(`UPDATE dbo.escala_funcoes SET nome = @nome, ordem = COALESCE(@ordem, ordem) WHERE id = @id;
    UPDATE dbo.escala_itens SET funcao = @nome WHERE ministerio_id = @mid AND funcao = @antigo AND data >= CAST(GETDATE() AS DATE);`,
  { id: int(params.id), nome, ordem: Number.isInteger(body.ordem) ? body.ordem : null, mid: f.ministerio_id, antigo: f.nome });
  return { ok: true };
});
rota('DELETE', '/escalas/funcoes/:id', async ({ params, usuario }) => {
  const f = await umaLinha('SELECT ministerio_id FROM dbo.escala_funcoes WHERE id = @id', { id: int(params.id) });
  if (!f) return { ok: true };
  precisaLiderar(usuario, f.ministerio_id);
  await query('DELETE FROM dbo.escala_funcoes WHERE id = @id', { id: int(params.id) });   // a escala antiga continua mostrando o nome
  return { ok: true };
});

// ------------------------------------------------------------------ DOCUMENTOS (links do Google Drive)
// Os arquivos ficam no Drive (quem abre ou envia fala direto com o Google: nada passa pelo Netlify).
// O site guarda só o link, o título e o assunto, para achar rápido.
// Quem vê: o geral, todos; o de um ministério, quem é dele, os líderes, quem gerencia documentos e administradores.
// Quem mexe: líder do ministério, quem tem "documentos.gerenciar" e administradores. Apagar: líder ou administrador.
function linkDrive(v, opcional = false) {
  const t = txt(v, 500);
  if (!t) { if (opcional) return null; throw new HttpError(400, 'Cole o link do Google Drive.'); }
  let u;
  try { u = new URL(t); } catch { throw new HttpError(400, 'Esse link não parece válido. Copie pelo botão "Compartilhar" → "Copiar link" do Drive.'); }
  if (u.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(u.hostname)) throw new HttpError(400, 'Use um link do Google Drive (drive.google.com ou docs.google.com).');
  return u.toString();
}
const veTodosDocumentos = (u) => ehGestor(u) || pode(u, 'documentos.gerenciar') || (u.ministerios || []).some((m) => m.lider);
const mexeDocumento = (u, mid) => ehGestor(u) || pode(u, 'documentos.gerenciar') || (mid && lideraMinisterio(u, mid));
rota('GET', '/documentos', async ({ usuario }) => {
  const todos = veTodosDocumentos(usuario);
  const meus = (usuario.ministerios || []).map((m) => m.id);
  const [ministerios, documentos, geral] = await query(`
    SELECT m.id, m.nome, m.cor, m.drive_url FROM dbo.ministerios m WHERE m.cd_status = 1 AND (@todos = 1 OR m.id IN (SELECT value FROM OPENJSON(@meus))) ORDER BY m.nome;
    SELECT d.id, d.ministerio_id, d.titulo, d.assunto, CONVERT(CHAR(10), d.data, 126) AS data, d.url, u.nome AS criado_por_nome
      FROM dbo.documentos d LEFT JOIN dbo.usuarios u ON u.id = d.criado_por
     WHERE d.ministerio_id IS NULL OR @todos = 1 OR d.ministerio_id IN (SELECT value FROM OPENJSON(@meus))
     ORDER BY COALESCE(d.data, CAST(d.dt_criacao AS DATE)) DESC, d.id DESC;
    SELECT valor FROM dbo.configuracoes WHERE chave = 'drive_pasta_geral';`, { todos: todos ? 1 : 0, meus: JSON.stringify(meus) }, { todos: true });
  return {
    pasta_geral: geral[0]?.valor || null,
    ministerios: ministerios.map((m) => ({ ...m, pode_editar: !!mexeDocumento(usuario, m.id) })),
    documentos, pode_geral: !!mexeDocumento(usuario, null), pode_pasta_geral: ehGestor(usuario) || pode(usuario, 'documentos.gerenciar'),
  };
});
function dadosDocumento(b, usuario) {
  const titulo = txt(b.titulo, 200);
  if (!titulo) throw new HttpError(400, 'Dê um título (ex.: Reunião de novembro).');
  const mid = b.ministerio_id ? int(b.ministerio_id) : null;
  if (!mexeDocumento(usuario, mid)) throw new HttpError(403, mid ? 'Só o líder deste ministério (ou a administração) adiciona documentos nele.' : 'Só a administração adiciona documentos gerais.');
  return { titulo, assunto: txt(b.assunto, 500), data: dataISO(b.data), url: linkDrive(b.url), mid };
}
rota('POST', '/documentos', async ({ body, usuario, ip }) => {
  const d = dadosDocumento(body, usuario);
  const r = await umaLinha(`INSERT INTO dbo.documentos (ministerio_id, titulo, assunto, data, url, criado_por) OUTPUT inserted.id
    VALUES (@mid, @titulo, @assunto, @data, @url, @uid)`, { ...d, uid: usuario.id });
  await seg.registrar('documento_adicionado', { usuario, ip, detalhe: d.titulo });
  return { id: r.id };
});
rota('PUT', '/documentos/pasta-geral', async ({ body, usuario, ip }) => {
  const url = linkDrive(body.url, true);
  await query(`MERGE dbo.configuracoes AS t USING (SELECT 'drive_pasta_geral' AS chave) s ON t.chave = s.chave
    WHEN MATCHED THEN UPDATE SET valor = @url WHEN NOT MATCHED THEN INSERT (chave, valor) VALUES ('drive_pasta_geral', @url);`, { url });
  await seg.registrar('documentos_pasta_geral', { usuario, ip, detalhe: url || '(tirada)' });
  return { ok: true };
});
rota('PUT', '/documentos/:id', async ({ params, body, usuario, ip }) => {
  const atual = await umaLinha('SELECT ministerio_id FROM dbo.documentos WHERE id = @id', { id: int(params.id) });
  if (!atual) throw new HttpError(404, 'Documento não encontrado.');
  if (!mexeDocumento(usuario, atual.ministerio_id)) throw new HttpError(403, 'Você não pode alterar este documento.');
  const d = dadosDocumento(body, usuario);
  await query('UPDATE dbo.documentos SET ministerio_id = @mid, titulo = @titulo, assunto = @assunto, data = @data, url = @url WHERE id = @id', { ...d, id: int(params.id) });
  await seg.registrar('documento_alterado', { usuario, ip, detalhe: d.titulo });
  return { ok: true };
});
rota('DELETE', '/documentos/:id', async ({ params, usuario, ip }) => {
  const atual = await umaLinha('SELECT ministerio_id, titulo FROM dbo.documentos WHERE id = @id', { id: int(params.id) });
  if (!atual) return { ok: true };
  if (!(ehGestor(usuario) || (atual.ministerio_id && lideraMinisterio(usuario, atual.ministerio_id)))) throw new HttpError(403, 'Só o líder do ministério ou um administrador apaga documentos.');
  await query('DELETE FROM dbo.documentos WHERE id = @id', { id: int(params.id) });   // tira só o link do site: o arquivo continua no Drive
  await seg.registrar('documento_apagado', { usuario, ip, detalhe: atual.titulo });
  return { ok: true };
});

// ------------------------------------------------------------------ FINANCEIRO
// Verba do ano, despesas (gastos) e entradas (ofertas, doações...). Saldo = verba + entradas - despesas.
const TIPOS_FIN = ['verba', 'despesa', 'entrada'];
function dadosLancamento(b) {
  const tipo = TIPOS_FIN.includes(b.tipo) ? b.tipo : null;
  if (!tipo) throw new HttpError(400, 'Escolha se é despesa, entrada ou verba.');
  const data = dataISO(b.data);
  if (!data) throw new HttpError(400, 'Informe a data.');
  const descricao = txt(b.descricao, 200);
  if (!descricao) throw new HttpError(400, 'Informe a descrição (ex.: Lanche da sexta).');
  // Aceita 150 · 150.5 · "150,50" · "1.250,00" (com vírgula, o ponto é de milhar)
  const bruto = String(b.valor ?? '').trim();
  const valor = Math.round(Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto) * 100) / 100;
  if (!Number.isFinite(valor) || valor <= 0 || valor > 10000000) throw new HttpError(400, 'Informe um valor maior que zero.');
  return { tipo, data, ano: Number(data.slice(0, 4)), descricao, categoria: txt(b.categoria, 60), valor };
}
rota('GET', '/financeiro', async ({ query: q }) => {
  const ano = /^\d{4}$/.test(q.ano || '') ? Number(q.ano) : Number(hojeBrasil().slice(0, 4));
  const [lancamentos, anos, categorias] = await query(`
    SELECT f.id, f.tipo, CONVERT(CHAR(10), f.data, 126) AS data, f.descricao, f.categoria, CAST(f.valor AS FLOAT) AS valor, u.nome AS criado_por_nome
      FROM dbo.fin_lancamentos f LEFT JOIN dbo.usuarios u ON u.id = f.criado_por WHERE f.ano = @ano ORDER BY f.data DESC, f.id DESC;
    SELECT DISTINCT ano FROM dbo.fin_lancamentos ORDER BY ano DESC;
    -- Se o banco ainda não recebeu o 01_estrutura.sql da v7, o financeiro abre do mesmo jeito (só sem a lista de categorias)
    IF OBJECT_ID('dbo.fin_categorias') IS NOT NULL SELECT id, nome FROM dbo.fin_categorias ORDER BY ordem, nome;
    ELSE SELECT CAST(NULL AS INT) AS id, CAST(NULL AS NVARCHAR(60)) AS nome WHERE 1 = 0;`, { ano }, { todos: true });
  return { ano, lancamentos, anos: anos.map((a) => a.ano), categorias };
});
// Lista de categorias (como as funções da escala): grava tudo de uma vez.
// Renomear atualiza os lançamentos que usavam o nome antigo; tirar da lista não mexe nos lançamentos.
rota('PUT', '/financeiro/categorias', async ({ body, usuario, ip }) => {
  const lista = Array.isArray(body.categorias) ? body.categorias.slice(0, 60) : [];
  const vistos = new Set(); const cats = [];
  for (const c of lista) {
    const nome = txt(c?.nome, 60); if (!nome) continue;
    const k = nome.toLowerCase(); if (vistos.has(k)) throw new HttpError(400, `A categoria "${nome}" está repetida.`);
    vistos.add(k); cats.push({ id: Number.isInteger(c.id) ? c.id : null, nome, ordem: cats.length + 1 });
  }
  await query(`
    SET XACT_ABORT ON; BEGIN TRAN;
    DECLARE @n TABLE (id INT NULL, nome NVARCHAR(60), ordem INT);
    INSERT INTO @n SELECT id, nome, ordem FROM OPENJSON(@json) WITH (id INT, nome NVARCHAR(60), ordem INT);
    UPDATE f SET categoria = n.nome FROM dbo.fin_lancamentos f
      JOIN dbo.fin_categorias c ON c.nome = f.categoria JOIN @n n ON n.id = c.id WHERE c.nome <> n.nome;
    DELETE c FROM dbo.fin_categorias c WHERE NOT EXISTS (SELECT 1 FROM @n n WHERE n.id = c.id);
    UPDATE c SET nome = CONCAT(N'~', c.id) FROM dbo.fin_categorias c JOIN @n n ON n.id = c.id WHERE c.nome <> n.nome;
    UPDATE c SET nome = n.nome, ordem = n.ordem FROM dbo.fin_categorias c JOIN @n n ON n.id = c.id;
    INSERT INTO dbo.fin_categorias (nome, ordem) SELECT n.nome, n.ordem FROM @n n
      WHERE NOT EXISTS (SELECT 1 FROM dbo.fin_categorias c WHERE c.id = n.id);
    COMMIT;`, { json: JSON.stringify(cats) });
  await seg.registrar('financeiro_categorias', { usuario, ip, detalhe: cats.map((c) => c.nome).join(', ').slice(0, 400) });
  return { ok: true };
});
rota('POST', '/financeiro', async ({ body, usuario, ip }) => {
  const d = dadosLancamento(body);
  const r = await umaLinha(`INSERT INTO dbo.fin_lancamentos (ano, tipo, data, descricao, categoria, valor, criado_por) OUTPUT inserted.id
    VALUES (@ano, @tipo, @data, @descricao, @categoria, CAST(@valor AS DECIMAL(12,2)), @uid)`, { ...d, valor: String(d.valor), uid: usuario.id });
  await seg.registrar('financeiro_lancado', { usuario, ip, detalhe: `${d.tipo}: ${d.descricao} R$ ${d.valor.toFixed(2)}` });
  return { id: r.id };
});
rota('PUT', '/financeiro/:id', async ({ params, body, usuario, ip }) => {
  const d = dadosLancamento(body);
  const r = await umaLinha(`UPDATE dbo.fin_lancamentos SET ano = @ano, tipo = @tipo, data = @data, descricao = @descricao, categoria = @categoria, valor = CAST(@valor AS DECIMAL(12,2))
    WHERE id = @id; SELECT @@ROWCOUNT AS n;`, { ...d, valor: String(d.valor), id: int(params.id) });
  if (!r.n) throw new HttpError(404, 'Lançamento não encontrado.');
  await seg.registrar('financeiro_corrigido', { usuario, ip, detalhe: `${params.id}: ${d.tipo} ${d.descricao} R$ ${d.valor.toFixed(2)}` });
  return { ok: true };
});
rota('DELETE', '/financeiro/:id', async ({ params, usuario, ip }) => {
  const r = await umaLinha('DELETE FROM dbo.fin_lancamentos OUTPUT deleted.descricao, CAST(deleted.valor AS FLOAT) AS valor WHERE id = @id', { id: int(params.id) });
  if (r) await seg.registrar('financeiro_apagado', { usuario, ip, detalhe: `${params.id}: ${r.descricao} R$ ${r.valor}` });
  return { ok: true };
});

// ------------------------------------------------------------------ PAINEL E RELATÓRIOS
rota('GET', '/painel', async ({ usuario }) => {
  // Cada bloco do Início só vem se a pessoa tiver permissão para ele
  const verPessoas = pode(usuario, 'pessoas.ver');
  const verPresenca = pode(usuario, 'relatorios.ver') || pode(usuario, 'presenca.marcar');
  const verPastoral = pode(usuario, 'pastoral.ver');
  // Tudo ao mesmo tempo: o banco fica longe, e cada espera em fila custa uma ida
  const [[pessoas, encontros, casos, meus], alertas, semContato] = await Promise.all([query(`
    WITH ult8 AS (SELECT TOP 8 e.id FROM dbo.encontros e
                   WHERE EXISTS (SELECT 1 FROM dbo.presencas x WHERE x.encontro_id = e.id AND x.presente = 1) ORDER BY e.data DESC),
         pres AS (SELECT pr.pessoa_id, MAX(e.data) AS ultima, MIN(e.data) AS primeira, SUM(CASE WHEN u.id IS NULL THEN 0 ELSE 1 END) AS v8
                    FROM dbo.presencas pr JOIN dbo.encontros e ON e.id = pr.encontro_id LEFT JOIN ult8 u ON u.id = pr.encontro_id
                   WHERE pr.presente = 1 AND @vp = 1 GROUP BY pr.pessoa_id)
    SELECT p.id, p.nome, p.referencia, p.tipo, p.data_nascimento, p.data_cadastro, p.telefone, CONVERT(VARCHAR(30), f.dt_atualizacao, 126) AS foto_v,
           pres.ultima AS ultima_presenca, pres.primeira AS primeira_presenca, ISNULL(pres.v8, 0) AS vezes_ult8
      FROM dbo.pessoas p LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id LEFT JOIN pres ON pres.pessoa_id = p.id
     WHERE p.cd_status = 1 AND @vp = 1;
    SELECT TOP 12 encontro_id AS id, data, tema, presentes AS total, membros_presentes AS membros, visitantes_presentes AS visitantes
      FROM dbo.vw_resumo_encontros WHERE @ve = 1 AND presentes > 0 ORDER BY data DESC;
    SELECT COUNT(*) AS abertos FROM dbo.pastoral_casos WHERE area = 'pastoral' AND status <> 'concluido' AND @vc = 1 AND (@ptodos = 1 OR responsavel_pessoa_id = @eu);
    SELECT ${SQL_CASO} ${SQL_CASO_FROM}
     WHERE c.responsavel_pessoa_id = @eu AND c.status <> 'concluido' AND p.cd_status = 1
       AND ((c.area = 'pastoral' AND @vc = 1) OR (c.area = 'integracao' AND @vi = 1))
     ORDER BY c.dt_abertura DESC;`,
  { vp: verPessoas ? 1 : 0, ve: verPresenca ? 1 : 0, vc: verPastoral ? 1 : 0, vi: pode(usuario, 'integracao.ver') ? 1 : 0,
    ptodos: veTodos(usuario, 'pastoral') ? 1 : 0, eu: euPessoa(usuario) }, { todos: true }),
  verPastoral && designa(usuario, 'pastoral') ? calcularAlertas() : null,
  pode(usuario, 'integracao.ver') && designa(usuario, 'integracao') ? visitantesSemContato() : null]);
  return {
    integracao: semContato ? semContato.length : null,
    pessoas: verPessoas ? pessoas : null,
    encontros: verPresenca ? encontros : null,
    casosAbertos: verPastoral ? casos[0].abertos : null,
    alertas: verPastoral ? alertas : null,
    meusCasos: meus,
  };
});

rota('GET', '/relatorios', async ({ query: q }) => {
  const ini = dataISO(q.ini), fim = dataISO(q.fim);
  if (!ini || !fim) throw new HttpError(400, 'Informe o período.');
  // Formato enxuto: cada pessoa vem uma vez só e cada presença é uma linha curta
  // [encontro, pessoa, presente, situação, justificativa] (o ano inteiro cai de ~1 MB para ~100 KB)
  const [encontros, pessoas, presencas] = await query(`
    SELECT id, data, tema FROM dbo.encontros WHERE data BETWEEN @ini AND @fim ORDER BY data;
    SELECT p.id, p.nome, p.referencia, p.data_cadastro FROM dbo.pessoas p
     WHERE EXISTS (SELECT 1 FROM dbo.presencas pr JOIN dbo.encontros e ON e.id = pr.encontro_id WHERE pr.pessoa_id = p.id AND e.data BETWEEN @ini AND @fim);
    SELECT pr.encontro_id, pr.pessoa_id, CAST(pr.presente AS INT) AS presente, COALESCE(pr.tipo_na_data, p.tipo) AS tipo, pr.justificativa
      FROM dbo.presencas pr JOIN dbo.encontros e ON e.id = pr.encontro_id JOIN dbo.pessoas p ON p.id = pr.pessoa_id
     WHERE e.data BETWEEN @ini AND @fim;`, { ini, fim }, { todos: true });
  return { encontros, pessoas, presencas: presencas.map((x) => [x.encontro_id, x.pessoa_id, x.presente, x.tipo, x.justificativa]) };
});

// ------------------------------------------------------------------ DESPACHO
const MUDA_SESSAO = /^\/(auth|acessos|ministerios|pessoas)(\/|$)/;
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
      // Gravação confere a sessão no banco na hora (bloqueio ou grupo tirado valem já); consulta usa a lembrança de 20 s
      usuario = await seg.usuarioDaSessao(cookie, { fresco: metodo !== 'GET' });
      if (!usuario) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
      if (r.acesso !== 'logado') {
        if (usuario.cd_status !== 1) throw new HttpError(403, 'Seu acesso ainda não foi liberado.');
        const exigidas = r.acesso === 'aprovado' ? [] : [].concat(r.acesso);
        if (exigidas.length && !exigidas.some((p) => pode(usuario, p))) throw new HttpError(403, 'Você não tem permissão para isso.');
      }
    }
    if (usuario?.verComoPor && ((caminho === '/auth/senha') || (caminho === '/auth/eu' && metodo === 'PUT'))) {
      throw new HttpError(403, 'Você está vendo como outra pessoa. Volte para a sua conta para fazer isso.');
    }
    let cookieResposta = null;
    let corpo;
    try { corpo = await r.fn({ params, query: q, body: body || {}, usuario, origem, ip, definirCookie: (c) => { cookieResposta = c; } }); }
    // Gravação que pode mudar a sessão de alguém (senha, grupos, bloqueio, ministérios e líderes): esquece todas as lembranças.
    // As outras (chamada, escala, financeiro...) não mexem em quem pode o quê, e a próxima tela não precisa ir ao banco só por isso.
    finally { if (metodo !== 'GET' && MUDA_SESSAO.test(caminho)) seg.esquecerSessoes(); }
    return { corpo, cookie: cookieResposta };
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

function respostaErro(e) {
  if (e instanceof HttpError || e.status) return { status: e.status, body: { erro: e.message } };
  if (e.number === 2627 || e.number === 2601) return { status: 409, body: { erro: 'Esse registro já existe.' } };
  if (e.number === 547) return { status: 409, body: { erro: 'Não é possível concluir: há registros ligados a este item.' } };
  // Coluna ou tabela que não existe: o banco não recebeu o 01_estrutura.sql desta versão
  if (e.number === 207 || e.number === 208) { console.error(e.message); return { status: 500, body: { erro: 'O banco ainda não foi atualizado para esta versão do site. Rode o sql/01_estrutura.sql no SSMS e tente de novo.' } }; }
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
