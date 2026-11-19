/* =====================================================================
   GESTÃO DO HYPE — Estrutura do banco (SQL Server)
   © Arthur Ramon da Silva — Todos os direitos reservados.

   Pode rodar mais de uma vez: só cria o que ainda não existe.
   Convenção: cd_status 1 = ativo, 0 = inativo
   ===================================================================== */
SET NOCOUNT ON;

/* ---------- Usuários do sistema (quem serve e faz login) ---------- */
IF OBJECT_ID('dbo.usuarios') IS NULL
CREATE TABLE dbo.usuarios (
    id                 INT IDENTITY(1,1) CONSTRAINT pk_usuarios PRIMARY KEY,
    nome               NVARCHAR(120) NOT NULL,
    email              NVARCHAR(200) NOT NULL CONSTRAINT uq_usuarios_email UNIQUE,
    senha_hash         VARCHAR(100)  NOT NULL,   -- bcrypt: impossível recuperar a senha original
    cd_status          TINYINT       NOT NULL CONSTRAINT df_usuarios_status DEFAULT 0
                       CONSTRAINT ck_usuarios_status CHECK (cd_status IN (0,1)),  -- 0 = aguardando/bloqueado
    versao_sessao      INT           NOT NULL CONSTRAINT df_usuarios_versao DEFAULT 1, -- muda = derruba todas as sessões
    dt_criacao         DATETIME2(0)  NOT NULL CONSTRAINT df_usuarios_criacao DEFAULT SYSUTCDATETIME(),
    dt_ultimo_login    DATETIME2(0)  NULL,
    dt_troca_senha     DATETIME2(0)  NULL
);

/* Pedidos de "esqueci a senha" (guarda só o hash do token) */
IF OBJECT_ID('dbo.usuarios_reset_senha') IS NULL
CREATE TABLE dbo.usuarios_reset_senha (
    id          INT IDENTITY(1,1) CONSTRAINT pk_usuarios_reset PRIMARY KEY,
    usuario_id  INT NOT NULL CONSTRAINT fk_reset_usuario REFERENCES dbo.usuarios(id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL,
    dt_expira   DATETIME2(0) NOT NULL,
    dt_uso      DATETIME2(0) NULL,
    dt_criacao  DATETIME2(0) NOT NULL CONSTRAINT df_reset_criacao DEFAULT SYSUTCDATETIME()
);

/* ---------- Ministérios ---------- */
IF OBJECT_ID('dbo.ministerios') IS NULL
CREATE TABLE dbo.ministerios (
    id          INT IDENTITY(1,1) CONSTRAINT pk_ministerios PRIMARY KEY,
    nome        NVARCHAR(80)  NOT NULL CONSTRAINT uq_ministerios_nome UNIQUE,
    descricao   NVARCHAR(300) NULL,
    cor         VARCHAR(7)    NOT NULL CONSTRAINT df_ministerios_cor DEFAULT '#1d5c4f',
    cd_status   TINYINT       NOT NULL CONSTRAINT df_ministerios_status DEFAULT 1
                CONSTRAINT ck_ministerios_status CHECK (cd_status IN (0,1)),
    dt_criacao  DATETIME2(0)  NOT NULL CONSTRAINT df_ministerios_criacao DEFAULT SYSUTCDATETIME()
);

/* ---------- Pessoas (jovens do Hype) ---------- */
IF OBJECT_ID('dbo.pessoas') IS NULL
CREATE TABLE dbo.pessoas (
    id               INT IDENTITY(1,1) CONSTRAINT pk_pessoas PRIMARY KEY,
    nome             NVARCHAR(150) NOT NULL,
    data_nascimento  DATE          NULL,
    sexo             CHAR(1)       NULL CONSTRAINT ck_pessoas_sexo CHECK (sexo IN ('M','F')),
    telefone         VARCHAR(30)   NULL,
    email            NVARCHAR(200) NULL,
    instagram        NVARCHAR(60)  NULL,
    endereco         NVARCHAR(250) NULL,
    tipo             VARCHAR(20)   NOT NULL CONSTRAINT df_pessoas_tipo DEFAULT 'novo_visitante',
    batizado         BIT           NULL,    -- NULL = não informado
    como_conheceu    NVARCHAR(150) NULL,
    observacoes      NVARCHAR(MAX) NULL,
    data_cadastro    DATE          NOT NULL CONSTRAINT df_pessoas_cadastro DEFAULT CAST(GETDATE() AS DATE),
    cd_status        TINYINT       NOT NULL CONSTRAINT df_pessoas_status DEFAULT 1
                     CONSTRAINT ck_pessoas_status CHECK (cd_status IN (0,1)),
    criado_por       INT           NULL,   -- id do usuário (sem FK de propósito: histórico)
    dt_criacao       DATETIME2(0)  NOT NULL CONSTRAINT df_pessoas_criacao DEFAULT SYSUTCDATETIME(),
    dt_atualizacao   DATETIME2(0)  NOT NULL CONSTRAINT df_pessoas_atualizacao DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_pessoas_nome')
    CREATE INDEX ix_pessoas_nome ON dbo.pessoas (nome);

/* Foto fica numa tabela separada para o SELECT * em pessoas continuar leve */
IF OBJECT_ID('dbo.pessoas_foto') IS NULL
CREATE TABLE dbo.pessoas_foto (
    pessoa_id      INT NOT NULL CONSTRAINT pk_pessoas_foto PRIMARY KEY
                   CONSTRAINT fk_foto_pessoa REFERENCES dbo.pessoas(id) ON DELETE CASCADE,
    foto           VARBINARY(MAX) NOT NULL,
    content_type   VARCHAR(30)    NOT NULL CONSTRAINT df_foto_tipo DEFAULT 'image/jpeg',
    dt_atualizacao DATETIME2(0)   NOT NULL CONSTRAINT df_foto_atualizacao DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.pessoa_ministerio') IS NULL
CREATE TABLE dbo.pessoa_ministerio (
    pessoa_id      INT NOT NULL CONSTRAINT fk_pm_pessoa REFERENCES dbo.pessoas(id) ON DELETE CASCADE,
    ministerio_id  INT NOT NULL CONSTRAINT fk_pm_ministerio REFERENCES dbo.ministerios(id) ON DELETE CASCADE,
    CONSTRAINT pk_pessoa_ministerio PRIMARY KEY (pessoa_id, ministerio_id)
);

/* ---------- Encontros de sexta e presenças ---------- */
IF OBJECT_ID('dbo.encontros') IS NULL
CREATE TABLE dbo.encontros (
    id           INT IDENTITY(1,1) CONSTRAINT pk_encontros PRIMARY KEY,
    data         DATE NOT NULL CONSTRAINT uq_encontros_data UNIQUE,
    tema         NVARCHAR(200) NULL,
    observacoes  NVARCHAR(MAX) NULL,
    criado_por   INT NULL,
    dt_criacao   DATETIME2(0) NOT NULL CONSTRAINT df_encontros_criacao DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.presencas') IS NULL
CREATE TABLE dbo.presencas (
    encontro_id    INT NOT NULL CONSTRAINT fk_presencas_encontro REFERENCES dbo.encontros(id) ON DELETE CASCADE,
    pessoa_id      INT NOT NULL CONSTRAINT fk_presencas_pessoa REFERENCES dbo.pessoas(id) ON DELETE CASCADE,
    presente       BIT NOT NULL,
    justificativa  NVARCHAR(200) NULL,
    marcado_por    INT NULL,
    dt_marcacao    DATETIME2(0) NOT NULL CONSTRAINT df_presencas_marcacao DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_presencas PRIMARY KEY (encontro_id, pessoa_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_presencas_pessoa')
    CREATE INDEX ix_presencas_pessoa ON dbo.presencas (pessoa_id) INCLUDE (presente);

/* ---------- Pastoral ---------- */
IF OBJECT_ID('dbo.pastoral_casos') IS NULL
CREATE TABLE dbo.pastoral_casos (
    id                INT IDENTITY(1,1) CONSTRAINT pk_pastoral_casos PRIMARY KEY,
    pessoa_id         INT NOT NULL CONSTRAINT fk_casos_pessoa REFERENCES dbo.pessoas(id) ON DELETE CASCADE,
    responsavel_nome  NVARCHAR(120) NOT NULL,
    responsavel_id    INT NULL,
    motivo            NVARCHAR(200) NULL,
    status            VARCHAR(15) NOT NULL CONSTRAINT df_casos_status DEFAULT 'aberto'
                      CONSTRAINT ck_casos_status CHECK (status IN ('aberto','em_andamento','concluido')),
    dt_abertura       DATETIME2(0) NOT NULL CONSTRAINT df_casos_abertura DEFAULT SYSUTCDATETIME(),
    dt_conclusao      DATETIME2(0) NULL,
    criado_por        INT NULL
);

IF OBJECT_ID('dbo.pastoral_registros') IS NULL
CREATE TABLE dbo.pastoral_registros (
    id          INT IDENTITY(1,1) CONSTRAINT pk_pastoral_registros PRIMARY KEY,
    caso_id     INT NOT NULL CONSTRAINT fk_registros_caso REFERENCES dbo.pastoral_casos(id) ON DELETE CASCADE,
    texto       NVARCHAR(MAX) NOT NULL,
    autor_nome  NVARCHAR(120) NULL,
    autor_id    INT NULL,
    dt_criacao  DATETIME2(0) NOT NULL CONSTRAINT df_registros_criacao DEFAULT SYSUTCDATETIME()
);
GO

/* =====================================================================
   ATUALIZAÇÃO v3 — campos que vieram da planilha do Hype
   (seguro rodar em banco novo ou já existente)
   ===================================================================== */
-- Situação da pessoa: as 6 etapas usadas pelo Hype
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_pessoas_tipo' AND definition LIKE '%frequentador%')
    ALTER TABLE dbo.pessoas DROP CONSTRAINT ck_pessoas_tipo;
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'df_pessoas_tipo' AND definition LIKE '%''visitante''%')
    ALTER TABLE dbo.pessoas DROP CONSTRAINT df_pessoas_tipo;
IF COL_LENGTH('dbo.pessoas', 'tipo') < 20 ALTER TABLE dbo.pessoas ALTER COLUMN tipo VARCHAR(20) NOT NULL;
GO
UPDATE dbo.pessoas SET tipo = 'novo_visitante' WHERE tipo = 'visitante';
UPDATE dbo.pessoas SET tipo = 'visitante_regular' WHERE tipo = 'frequentador';
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'df_pessoas_tipo')
    ALTER TABLE dbo.pessoas ADD CONSTRAINT df_pessoas_tipo DEFAULT 'novo_visitante' FOR tipo;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_pessoas_tipo')
    ALTER TABLE dbo.pessoas ADD CONSTRAINT ck_pessoas_tipo
        CHECK (tipo IN ('novo_visitante','visitante_regular','ex_visitante','novo_membro','membro','membro_ativo'));

-- Batizado passa a aceitar "não informado" (NULL)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pessoas') AND name = 'batizado' AND is_nullable = 0)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'df_pessoas_batizado') ALTER TABLE dbo.pessoas DROP CONSTRAINT df_pessoas_batizado;
    ALTER TABLE dbo.pessoas ALTER COLUMN batizado BIT NULL;
END

-- Campos novos
IF COL_LENGTH('dbo.pessoas', 'referencia') IS NULL      ALTER TABLE dbo.pessoas ADD referencia NVARCHAR(150) NULL;       -- ex.: "namorada do Paulo"
IF COL_LENGTH('dbo.pessoas', 'grupo_cultivo') IS NULL   ALTER TABLE dbo.pessoas ADD grupo_cultivo NVARCHAR(300) NULL;
IF COL_LENGTH('dbo.pessoas', 'discipulado_por') IS NULL ALTER TABLE dbo.pessoas ADD discipulado_por NVARCHAR(300) NULL;
IF COL_LENGTH('dbo.pessoas', 'batismo_detalhe') IS NULL ALTER TABLE dbo.pessoas ADD batismo_detalhe NVARCHAR(200) NULL;
IF COL_LENGTH('dbo.pessoas', 'integrado_por') IS NULL   ALTER TABLE dbo.pessoas ADD integrado_por NVARCHAR(120) NULL;
IF COL_LENGTH('dbo.pessoas', 'como_conheceu') < 2000  ALTER TABLE dbo.pessoas ALTER COLUMN como_conheceu NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.pessoas', 'id_planilha') IS NULL     ALTER TABLE dbo.pessoas ADD id_planilha INT NULL;               -- ID da antiga planilha

-- Situação da pessoa no dia de cada encontro (para os números históricos de membros x visitantes)
IF COL_LENGTH('dbo.presencas', 'tipo_na_data') IS NULL ALTER TABLE dbo.presencas ADD tipo_na_data VARCHAR(20) NULL;

-- Acompanhamentos servem para Pastoral e para Integração
IF COL_LENGTH('dbo.pastoral_casos', 'area') IS NULL
    ALTER TABLE dbo.pastoral_casos ADD area VARCHAR(12) NOT NULL CONSTRAINT df_casos_area DEFAULT 'pastoral'
        CONSTRAINT ck_casos_area CHECK (area IN ('pastoral','integracao'));
GO

/* =====================================================================
   PERMISSÕES POR GRUPO
   usuário  ->  grupos  ->  permissões
   ===================================================================== */
IF OBJECT_ID('dbo.permissoes') IS NULL
CREATE TABLE dbo.permissoes (
    codigo     VARCHAR(40)   NOT NULL CONSTRAINT pk_permissoes PRIMARY KEY,
    descricao  NVARCHAR(150) NOT NULL,
    ordem      INT           NOT NULL
);

IF OBJECT_ID('dbo.grupos') IS NULL
CREATE TABLE dbo.grupos (
    id          INT IDENTITY(1,1) CONSTRAINT pk_grupos PRIMARY KEY,
    nome        NVARCHAR(60)  NOT NULL CONSTRAINT uq_grupos_nome UNIQUE,
    descricao   NVARCHAR(200) NULL,
    sistema     BIT           NOT NULL CONSTRAINT df_grupos_sistema DEFAULT 0,  -- 1 = Administradores (não pode ser apagado)
    dt_criacao  DATETIME2(0)  NOT NULL CONSTRAINT df_grupos_criacao DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.grupo_permissao') IS NULL
CREATE TABLE dbo.grupo_permissao (
    grupo_id   INT         NOT NULL CONSTRAINT fk_gp_grupo REFERENCES dbo.grupos(id) ON DELETE CASCADE,
    permissao  VARCHAR(40) NOT NULL CONSTRAINT fk_gp_permissao REFERENCES dbo.permissoes(codigo) ON DELETE CASCADE,
    CONSTRAINT pk_grupo_permissao PRIMARY KEY (grupo_id, permissao)
);

IF OBJECT_ID('dbo.usuario_grupo') IS NULL
CREATE TABLE dbo.usuario_grupo (
    usuario_id INT NOT NULL CONSTRAINT fk_ug_usuario REFERENCES dbo.usuarios(id) ON DELETE CASCADE,
    grupo_id   INT NOT NULL CONSTRAINT fk_ug_grupo REFERENCES dbo.grupos(id) ON DELETE CASCADE,
    CONSTRAINT pk_usuario_grupo PRIMARY KEY (usuario_id, grupo_id)
);

/* Registro de atividades (auditoria): logins, falhas, alterações e exclusões */
IF OBJECT_ID('dbo.auditoria') IS NULL
CREATE TABLE dbo.auditoria (
    id            BIGINT IDENTITY(1,1) CONSTRAINT pk_auditoria PRIMARY KEY,
    dt            DATETIME2(0)  NOT NULL CONSTRAINT df_auditoria_dt DEFAULT SYSUTCDATETIME(),
    usuario_id    INT           NULL,
    usuario_nome  NVARCHAR(120) NULL,
    acao          VARCHAR(40)   NOT NULL,
    detalhe       NVARCHAR(400) NULL,
    email         NVARCHAR(200) NULL,
    ip            VARCHAR(45)   NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_auditoria_acao_dt')
    CREATE INDEX ix_auditoria_acao_dt ON dbo.auditoria (acao, dt) INCLUDE (ip, email);
GO

/* Permissões existentes no sistema */
MERGE dbo.permissoes AS t
USING (VALUES
    ('pessoas.ver',        N'Ver cadastro e ficha das pessoas', 10),
    ('pessoas.editar',     N'Cadastrar e editar pessoas', 11),
    ('pessoas.excluir',    N'Excluir pessoas', 12),
    ('presenca.marcar',    N'Fazer e corrigir a chamada', 20),
    ('presenca.excluir',   N'Apagar uma chamada inteira', 21),
    ('pastoral.ver',       N'Ver acompanhamentos pastorais', 30),
    ('pastoral.editar',    N'Abrir acompanhamentos e registrar contatos', 31),
    ('pastoral.excluir',   N'Apagar acompanhamentos (Pastoral e Integração)', 32),
    ('relatorios.ver',     N'Ver relatórios e gráficos', 40),
    ('ministerios.editar', N'Cadastrar e editar ministérios', 50),
    ('integracao.ver',     N'Ver o acompanhamento de visitantes (Integração)', 35),
    ('integracao.editar',  N'Registrar contatos com visitantes (Integração)', 36),
    ('pastoral.ver_todos', N'Pastoral: ver os acompanhamentos de todos (sem isso, só os atribuídos a você)', 33),
    ('pastoral.designar',  N'Pastoral: designar e trocar responsáveis', 34),
    ('integracao.ver_todos', N'Integração: ver os acompanhamentos de todos (sem isso, só os atribuídos a você)', 37),
    ('integracao.designar',  N'Integração: designar e trocar quem integra', 38),
    ('relatorios.exportar', N'Baixar e importar planilhas e imprimir relatórios', 41),
    ('financeiro.ver',     N'Ver o financeiro (verba, despesas e entradas)', 70),
    ('financeiro.editar',  N'Lançar e corrigir verba, despesas e entradas', 71),
    ('documentos.gerenciar', N'Documentos: adicionar e corrigir links do Drive de todos os ministérios', 80),
    ('acessos.gerenciar',  N'Liberar usuários, gerenciar grupos e ver o registro de atividades', 60)
) AS s (codigo, descricao, ordem) ON t.codigo = s.codigo
WHEN MATCHED THEN UPDATE SET descricao = s.descricao, ordem = s.ordem
WHEN NOT MATCHED THEN INSERT (codigo, descricao, ordem) VALUES (s.codigo, s.descricao, s.ordem);

/* Sementes: o que o sistema cria uma vez só. Se você apagar um grupo ou ministério inicial, ele não volta. */
IF OBJECT_ID('dbo.sementes') IS NULL
CREATE TABLE dbo.sementes (chave NVARCHAR(100) NOT NULL CONSTRAINT pk_sementes PRIMARY KEY, dt DATETIME2(0) NOT NULL CONSTRAINT df_sementes_dt DEFAULT SYSUTCDATETIME());

/* Grupos iniciais */
DECLARE @grupos TABLE (nome NVARCHAR(60), descricao NVARCHAR(200), sistema BIT);
INSERT INTO @grupos VALUES
    (N'Administradores', N'Acesso total ao sistema', 1),
    (N'Pastoral',        N'Cuida dos jovens faltantes: vê e registra os acompanhamentos atribuídos a cada um', 0),
    (N'Integração',      N'Acolhe os visitantes: vê e registra os acompanhamentos atribuídos a cada um', 0),
    (N'Administração',   N'Cadastra pessoas, faz a chamada, cuida dos ministérios e vê relatórios', 0),
    (N'Líderes de equipe', N'Vê pessoas, relatórios e todos os acompanhamentos da Pastoral e da Integração, sem alterar nem apagar', 0);
-- Banco que já existia: os grupos que já estão lá contam como "já criados"
INSERT INTO dbo.sementes (chave) SELECT N'grupo:' + g.nome FROM @grupos g
WHERE EXISTS (SELECT 1 FROM dbo.grupos x WHERE x.nome = g.nome) AND NOT EXISTS (SELECT 1 FROM dbo.sementes s WHERE s.chave = N'grupo:' + g.nome);
-- Cria só os que nunca foram criados
DECLARE @novos TABLE (id INT, nome NVARCHAR(60));
INSERT INTO dbo.grupos (nome, descricao, sistema)
OUTPUT inserted.id, inserted.nome INTO @novos
SELECT g.nome, g.descricao, g.sistema FROM @grupos g
WHERE NOT EXISTS (SELECT 1 FROM dbo.sementes s WHERE s.chave = N'grupo:' + g.nome)
  AND NOT EXISTS (SELECT 1 FROM dbo.grupos x WHERE x.nome = g.nome);
INSERT INTO dbo.sementes (chave) SELECT N'grupo:' + nome FROM @novos;

-- Permissões padrão apenas dos grupos que acabaram de ser criados
INSERT INTO dbo.grupo_permissao (grupo_id, permissao)
SELECT n.id, v.permissao FROM (VALUES
    (N'Pastoral', 'pessoas.ver'), (N'Pastoral', 'pastoral.ver'), (N'Pastoral', 'pastoral.editar'), (N'Pastoral', 'relatorios.ver'),
    (N'Integração', 'pessoas.ver'), (N'Integração', 'pessoas.editar'), (N'Integração', 'integracao.ver'), (N'Integração', 'integracao.editar'),
    (N'Administração', 'pessoas.ver'), (N'Administração', 'pessoas.editar'), (N'Administração', 'presenca.marcar'),
    (N'Administração', 'relatorios.ver'), (N'Administração', 'ministerios.editar'),
    (N'Líderes de equipe', 'pessoas.ver'), (N'Líderes de equipe', 'relatorios.ver'), (N'Líderes de equipe', 'pastoral.ver'), (N'Líderes de equipe', 'integracao.ver'),
    (N'Líderes de equipe', 'pastoral.ver_todos'), (N'Líderes de equipe', 'integracao.ver_todos')
) v(grupo, permissao)
JOIN @novos n ON n.nome = v.grupo;

-- v4 (uma vez só): Líderes de equipe que já existiam passam a ver todos os acompanhamentos
IF NOT EXISTS (SELECT 1 FROM dbo.sementes WHERE chave = N'v4:lideres_ver_todos')
BEGIN
    INSERT INTO dbo.grupo_permissao (grupo_id, permissao)
    SELECT g.id, p.permissao FROM dbo.grupos g CROSS JOIN (VALUES ('pastoral.ver_todos'), ('integracao.ver_todos')) p(permissao)
    WHERE g.nome = N'Líderes de equipe' AND NOT EXISTS (SELECT 1 FROM dbo.grupo_permissao x WHERE x.grupo_id = g.id AND x.permissao = p.permissao);
    UPDATE dbo.grupos SET descricao = N'Vê pessoas, relatórios e todos os acompanhamentos da Pastoral e da Integração, sem alterar nem apagar'
    WHERE nome = N'Líderes de equipe' AND descricao LIKE N'Vê tudo (pessoas, chamada%';
    INSERT INTO dbo.sementes (chave) VALUES (N'v4:lideres_ver_todos');
END

-- Administradores sempre têm todas as permissões (inclusive as novas)
INSERT INTO dbo.grupo_permissao (grupo_id, permissao)
SELECT g.id, p.codigo FROM dbo.grupos g CROSS JOIN dbo.permissoes p
WHERE g.sistema = 1 AND NOT EXISTS (SELECT 1 FROM dbo.grupo_permissao x WHERE x.grupo_id = g.id AND x.permissao = p.codigo);
GO

/* =====================================================================
   VIEWS — para consultas e relatórios feitos direto no banco
   ===================================================================== */
CREATE OR ALTER VIEW dbo.vw_pessoas AS
SELECT p.id, p.nome, p.referencia, p.tipo,
       CASE WHEN p.tipo IN ('novo_membro','membro','membro_ativo') THEN 'membro' ELSE 'visitante' END AS grupo_tipo,
       p.data_nascimento,
       CASE WHEN p.data_nascimento IS NULL THEN NULL
            ELSE DATEDIFF(YEAR, p.data_nascimento, GETDATE())
                 - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, p.data_nascimento, GETDATE()), p.data_nascimento) > CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END
       END AS idade,
       p.sexo, p.telefone, p.email, p.instagram, p.batizado, p.batismo_detalhe, p.grupo_cultivo, p.discipulado_por,
       p.integrado_por, p.como_conheceu, p.data_cadastro, p.cd_status, p.id_planilha,
       (SELECT STRING_AGG(m.nome, ', ') WITHIN GROUP (ORDER BY m.nome)
          FROM dbo.pessoa_ministerio pm JOIN dbo.ministerios m ON m.id = pm.ministerio_id
         WHERE pm.pessoa_id = p.id) AS ministerios,
       CAST(CASE WHEN f.pessoa_id IS NULL THEN 0 ELSE 1 END AS BIT) AS tem_foto
FROM dbo.pessoas p
LEFT JOIN dbo.pessoas_foto f ON f.pessoa_id = p.id;
GO

CREATE OR ALTER VIEW dbo.vw_presencas AS
SELECT e.id AS encontro_id, e.data, e.tema,
       p.id AS pessoa_id, p.nome, p.referencia, p.tipo AS tipo_atual,
       COALESCE(pr.tipo_na_data, p.tipo) AS tipo_na_data,
       pr.presente, pr.justificativa,
       YEAR(e.data) AS ano, MONTH(e.data) AS mes
FROM dbo.presencas pr
JOIN dbo.encontros e ON e.id = pr.encontro_id
JOIN dbo.pessoas   p ON p.id = pr.pessoa_id;
GO

CREATE OR ALTER VIEW dbo.vw_resumo_encontros AS
SELECT e.id AS encontro_id, e.data, e.tema,
       SUM(CASE WHEN pr.presente = 1 THEN 1 ELSE 0 END)                       AS presentes,
       SUM(CASE WHEN pr.presente = 0 THEN 1 ELSE 0 END)                       AS faltas,
       SUM(CASE WHEN pr.presente = 1 AND COALESCE(pr.tipo_na_data, p.tipo) IN ('novo_membro','membro','membro_ativo') THEN 1 ELSE 0 END) AS membros_presentes,
       SUM(CASE WHEN pr.presente = 1 AND COALESCE(pr.tipo_na_data, p.tipo) NOT IN ('novo_membro','membro','membro_ativo') THEN 1 ELSE 0 END) AS visitantes_presentes,
       SUM(CASE WHEN pr.presente = 1 AND COALESCE(pr.tipo_na_data, p.tipo) = 'novo_visitante' THEN 1 ELSE 0 END) AS novos_visitantes_presentes
FROM dbo.encontros e
LEFT JOIN dbo.presencas pr ON pr.encontro_id = e.id
LEFT JOIN dbo.pessoas   p  ON p.id = pr.pessoa_id
GROUP BY e.id, e.data, e.tema;
GO

CREATE OR ALTER VIEW dbo.vw_frequencia_pessoa AS
SELECT p.id AS pessoa_id, p.nome, p.tipo, p.cd_status,
       COUNT(pr.pessoa_id)                                    AS encontros_marcados,
       SUM(CASE WHEN pr.presente = 1 THEN 1 ELSE 0 END)       AS presencas,
       SUM(CASE WHEN pr.presente = 0 THEN 1 ELSE 0 END)       AS faltas,
       CAST(100.0 * SUM(CASE WHEN pr.presente = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(pr.pessoa_id), 0) AS DECIMAL(5,1)) AS percentual,
       MAX(CASE WHEN pr.presente = 1 THEN e.data END)         AS ultima_presenca
FROM dbo.pessoas p
LEFT JOIN dbo.presencas pr ON pr.pessoa_id = p.id
LEFT JOIN dbo.encontros e  ON e.id = pr.encontro_id
GROUP BY p.id, p.nome, p.tipo, p.cd_status;
GO

CREATE OR ALTER VIEW dbo.vw_permissoes_usuario AS
SELECT u.id AS usuario_id, u.nome, u.email, u.cd_status, g.nome AS grupo, gp.permissao
FROM dbo.usuarios u
JOIN dbo.usuario_grupo ug ON ug.usuario_id = u.id
JOIN dbo.grupos g ON g.id = ug.grupo_id
JOIN dbo.grupo_permissao gp ON gp.grupo_id = g.id;
GO

/* ---------- Telefones no padrão (51) 99999-9999 ----------
   O site já salva assim. Este bloco arruma os números antigos (ex.: 5191726412 -> (51) 9172-6412).
   Pode rodar quantas vezes quiser: o que já está no padrão, ou não parece telefone, fica como está. */
WITH letra AS (
    SELECT p.id, n.n, SUBSTRING(p.telefone, n.n, 1) AS ch
    FROM dbo.pessoas p
    CROSS APPLY (SELECT TOP (LEN(p.telefone)) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects) n
    WHERE p.telefone IS NOT NULL
), d AS (
    SELECT id, STRING_AGG(ch, '') WITHIN GROUP (ORDER BY n) AS dig FROM letra WHERE ch LIKE '[0-9]' GROUP BY id
), sem55 AS (
    SELECT id, CASE WHEN LEN(dig) IN (12, 13) AND LEFT(dig, 2) = '55' THEN STUFF(dig, 1, 2, '') ELSE dig END AS dig FROM d
), sem0 AS (
    SELECT id, CASE WHEN LEN(dig) IN (11, 12) AND LEFT(dig, 1) = '0' THEN STUFF(dig, 1, 1, '') ELSE dig END AS dig FROM sem55
), f AS (
    SELECT id, CASE LEN(dig)
             WHEN 11 THEN '(' + LEFT(dig, 2) + ') ' + SUBSTRING(dig, 3, 5) + '-' + RIGHT(dig, 4)
             WHEN 10 THEN '(' + LEFT(dig, 2) + ') ' + SUBSTRING(dig, 3, 4) + '-' + RIGHT(dig, 4)
             WHEN 9  THEN LEFT(dig, 5) + '-' + RIGHT(dig, 4)
             WHEN 8  THEN LEFT(dig, 4) + '-' + RIGHT(dig, 4)
           END AS novo
    FROM sem0
)
UPDATE p SET telefone = f.novo
FROM dbo.pessoas p JOIN f ON f.id = p.id
WHERE f.novo IS NOT NULL AND f.novo <> p.telefone;
GO

/* ---------- Ministérios iniciais (criados uma vez só; edite pelo sistema depois) ---------- */
DECLARE @mins TABLE (nome NVARCHAR(80), cor VARCHAR(7));
INSERT INTO @mins VALUES
    (N'Pastoral', '#c2417a'), (N'Integração', '#f0561d'), (N'Administração', '#2a78d6'),
    (N'Comunicação', '#5b4bd6'), (N'Cozinha', '#e0a020'), (N'Mídias', '#2a9d8f'), (N'Decoração', '#b03a2e'),
    (N'Diaconato', '#1f8a57'), (N'Líderes de equipe', '#4b4852');
INSERT INTO dbo.sementes (chave) SELECT N'ministerio:' + m.nome FROM @mins m
WHERE EXISTS (SELECT 1 FROM dbo.ministerios x WHERE x.nome = m.nome) AND NOT EXISTS (SELECT 1 FROM dbo.sementes s WHERE s.chave = N'ministerio:' + m.nome);
DECLARE @mnovos TABLE (nome NVARCHAR(80));
INSERT INTO dbo.ministerios (nome, cor) OUTPUT inserted.nome INTO @mnovos
SELECT m.nome, m.cor FROM @mins m
WHERE NOT EXISTS (SELECT 1 FROM dbo.sementes s WHERE s.chave = N'ministerio:' + m.nome)
  AND NOT EXISTS (SELECT 1 FROM dbo.ministerios x WHERE x.nome = m.nome);
INSERT INTO dbo.sementes (chave) SELECT N'ministerio:' + nome FROM @mnovos;
GO

/* =====================================================================
   ATUALIZAÇÃO v4 — vínculo login ↔ cadastro, responsáveis, líderes, Agenda e Escalas
   Só acrescenta: o site da versão anterior continua funcionando com o banco atualizado.
   ===================================================================== */
-- Login ligado à pessoa do cadastro (o administrador confirma em Acessos)
IF COL_LENGTH('dbo.usuarios', 'pessoa_id') IS NULL
    ALTER TABLE dbo.usuarios ADD pessoa_id INT NULL CONSTRAINT fk_usuarios_pessoa REFERENCES dbo.pessoas(id) ON DELETE SET NULL;
GO
-- (Uma pessoa do cadastro só pode estar ligada a uma conta: o site confere isso ao ligar.
--  Sem índice filtrado de propósito: ele exigiria configurações especiais em toda gravação de usuários.)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_usuarios_pessoa') DROP INDEX ux_usuarios_pessoa ON dbo.usuarios;

-- Responsável do acompanhamento = pessoa do cadastro (sem FK: o histórico fica mesmo se a pessoa sair)
IF COL_LENGTH('dbo.pastoral_casos', 'responsavel_pessoa_id') IS NULL ALTER TABLE dbo.pastoral_casos ADD responsavel_pessoa_id INT NULL;
-- Quando o caso foi enviado ao responsável pelo WhatsApp
IF COL_LENGTH('dbo.pastoral_casos', 'dt_enviado') IS NULL ALTER TABLE dbo.pastoral_casos ADD dt_enviado DATETIME2(0) NULL;
GO
-- Casos antigos: liga ao cadastro quando o nome do responsável bate com uma pessoa só
UPDATE c SET responsavel_pessoa_id = p.id
FROM dbo.pastoral_casos c
CROSS APPLY (SELECT MIN(x.id) AS id, COUNT(*) AS n FROM dbo.pessoas x WHERE x.nome = c.responsavel_nome AND x.cd_status = 1) p
WHERE c.responsavel_pessoa_id IS NULL AND p.n = 1;

-- Líder do ministério (pode haver mais de um)
IF COL_LENGTH('dbo.pessoa_ministerio', 'lider') IS NULL
    ALTER TABLE dbo.pessoa_ministerio ADD lider BIT NOT NULL CONSTRAINT df_pm_lider DEFAULT 0;
GO

/* ---------- Agenda: reuniões dos ministérios ---------- */
IF OBJECT_ID('dbo.reunioes') IS NULL
CREATE TABLE dbo.reunioes (
    id             INT IDENTITY(1,1) CONSTRAINT pk_reunioes PRIMARY KEY,
    ministerio_id  INT NOT NULL CONSTRAINT fk_reunioes_ministerio REFERENCES dbo.ministerios(id) ON DELETE CASCADE,
    titulo         NVARCHAR(150) NOT NULL,
    inicio         DATETIME2(0) NOT NULL,     -- horário de Brasília
    fim            DATETIME2(0) NOT NULL,
    local          NVARCHAR(250) NULL,
    descricao      NVARCHAR(1000) NULL,
    cancelada      BIT NOT NULL CONSTRAINT df_reunioes_cancelada DEFAULT 0,
    sequencia      INT NOT NULL CONSTRAINT df_reunioes_seq DEFAULT 0,   -- muda a cada alteração (convite de agenda)
    criado_por     INT NULL,
    dt_criacao     DATETIME2(0) NOT NULL CONSTRAINT df_reunioes_criacao DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.reuniao_pessoa') IS NULL
CREATE TABLE dbo.reuniao_pessoa (
    reuniao_id   INT NOT NULL CONSTRAINT fk_rp_reuniao REFERENCES dbo.reunioes(id) ON DELETE CASCADE,
    pessoa_id    INT NOT NULL CONSTRAINT fk_rp_pessoa REFERENCES dbo.pessoas(id) ON DELETE CASCADE,
    dt_convite   DATETIME2(0) NULL,          -- último convite enviado por e-mail
    CONSTRAINT pk_reuniao_pessoa PRIMARY KEY (reuniao_id, pessoa_id)
);

/* ---------- Escalas das sextas ---------- */
IF OBJECT_ID('dbo.escala_funcoes') IS NULL
CREATE TABLE dbo.escala_funcoes (
    id             INT IDENTITY(1,1) CONSTRAINT pk_escala_funcoes PRIMARY KEY,
    ministerio_id  INT NOT NULL CONSTRAINT fk_ef_ministerio REFERENCES dbo.ministerios(id) ON DELETE CASCADE,
    nome           NVARCHAR(60) NOT NULL,
    ordem          INT NOT NULL CONSTRAINT df_ef_ordem DEFAULT 0
);
IF OBJECT_ID('dbo.escala_itens') IS NULL
CREATE TABLE dbo.escala_itens (
    id             INT IDENTITY(1,1) CONSTRAINT pk_escala_itens PRIMARY KEY,
    ministerio_id  INT NOT NULL CONSTRAINT fk_ei_ministerio REFERENCES dbo.ministerios(id) ON DELETE CASCADE,
    data           DATE NOT NULL,
    funcao         NVARCHAR(60) NULL,        -- texto: a escala antiga não muda se a função for apagada
    pessoa_id      INT NOT NULL CONSTRAINT fk_ei_pessoa REFERENCES dbo.pessoas(id) ON DELETE CASCADE,
    criado_por     INT NULL,
    dt_criacao     DATETIME2(0) NOT NULL CONSTRAINT df_ei_criacao DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_escala_itens_data')
    CREATE INDEX ix_escala_itens_data ON dbo.escala_itens (data, ministerio_id) INCLUDE (pessoa_id, funcao);
GO

/* =====================================================================
   v5 (tudo só acrescenta; cada ajuste de grupo roda uma vez só)
   ===================================================================== */
/* Escalas: quantas pessoas cada função precisa (ex.: Entrada 3, Saída 5). Vazio = sem número fixo */
IF COL_LENGTH('dbo.escala_funcoes', 'vagas') IS NULL
    ALTER TABLE dbo.escala_funcoes ADD vagas INT NULL;
GO
/* Pastoral/Integração: como o acompanhamento terminou */
IF COL_LENGTH('dbo.pastoral_casos', 'desfecho') IS NULL
    ALTER TABLE dbo.pastoral_casos ADD desfecho NVARCHAR(40) NULL;
GO
/* Financeiro: verba do ano, despesas e entradas (ofertas, doações) */
IF OBJECT_ID('dbo.fin_lancamentos') IS NULL
CREATE TABLE dbo.fin_lancamentos (
    id          INT IDENTITY(1,1) CONSTRAINT pk_fin_lancamentos PRIMARY KEY,
    ano         INT NOT NULL,
    tipo        VARCHAR(10) NOT NULL CONSTRAINT ck_fin_tipo CHECK (tipo IN ('verba', 'despesa', 'entrada')),
    data        DATE NOT NULL,
    descricao   NVARCHAR(200) NOT NULL,
    categoria   NVARCHAR(60) NULL,
    valor       DECIMAL(12, 2) NOT NULL CONSTRAINT ck_fin_valor CHECK (valor > 0),
    criado_por  INT NULL,
    dt_criacao  DATETIME2(0) NOT NULL CONSTRAINT df_fin_criacao DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_fin_ano')
    CREATE INDEX ix_fin_ano ON dbo.fin_lancamentos (ano, data);
GO

/* Grupo Administração: baixa relatórios e cuida do financeiro (continua sem apagar nada) */
IF NOT EXISTS (SELECT 1 FROM dbo.sementes WHERE chave = N'v5:administracao')
BEGIN
    INSERT INTO dbo.grupo_permissao (grupo_id, permissao)
    SELECT g.id, p.permissao FROM dbo.grupos g CROSS JOIN (VALUES ('relatorios.exportar'), ('financeiro.ver'), ('financeiro.editar')) p(permissao)
    WHERE g.nome = N'Administração' AND NOT EXISTS (SELECT 1 FROM dbo.grupo_permissao x WHERE x.grupo_id = g.id AND x.permissao = p.permissao);
    UPDATE dbo.grupos SET descricao = N'Cadastra pessoas, faz a chamada, cuida dos ministérios, vê e baixa relatórios e cuida do financeiro. Não apaga nada'
    WHERE nome = N'Administração';
    INSERT INTO dbo.sementes (chave) VALUES (N'v5:administracao');
END
GO

/* "Cadastro" e "Presença" viram um grupo só: quem faz a chamada também cadastra o visitante */
IF NOT EXISTS (SELECT 1 FROM dbo.sementes WHERE chave = N'v5:cadastro_chamada')
BEGIN
    SET XACT_ABORT ON; BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM dbo.grupos WHERE nome = N'Cadastro e chamada')
        INSERT INTO dbo.grupos (nome, descricao, sistema) VALUES (N'Cadastro e chamada', N'Cadastra e atualiza pessoas e faz a chamada das sextas. Não apaga nem baixa nada', 0);
    DECLARE @cc INT = (SELECT id FROM dbo.grupos WHERE nome = N'Cadastro e chamada');
    INSERT INTO dbo.grupo_permissao (grupo_id, permissao)
    SELECT @cc, p.permissao FROM (VALUES ('pessoas.ver'), ('pessoas.editar'), ('presenca.marcar')) p(permissao)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.grupo_permissao x WHERE x.grupo_id = @cc AND x.permissao = p.permissao);
    -- quem estava em Cadastro ou Presença passa para o grupo novo
    INSERT INTO dbo.usuario_grupo (usuario_id, grupo_id)
    SELECT DISTINCT ug.usuario_id, @cc FROM dbo.usuario_grupo ug JOIN dbo.grupos g ON g.id = ug.grupo_id
    WHERE g.nome IN (N'Cadastro', N'Presença') AND g.sistema = 0
      AND NOT EXISTS (SELECT 1 FROM dbo.usuario_grupo x WHERE x.usuario_id = ug.usuario_id AND x.grupo_id = @cc);
    DELETE FROM dbo.grupos WHERE nome IN (N'Cadastro', N'Presença') AND sistema = 0;   -- leva junto as permissões e os vínculos antigos
    INSERT INTO dbo.sementes (chave) VALUES (N'v5:cadastro_chamada');
    COMMIT;
END
GO

/* Quem só serve num ministério (Cozinha, Mídias, Decoração...): vê Início, escalas, agenda e relatórios */
IF NOT EXISTS (SELECT 1 FROM dbo.sementes WHERE chave = N'v5:equipe')
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.grupos WHERE nome = N'Equipe dos ministérios')
        INSERT INTO dbo.grupos (nome, descricao, sistema) VALUES (N'Equipe dos ministérios', N'Quem serve nos ministérios: vê o Início, as escalas, a agenda e os relatórios', 0);
    INSERT INTO dbo.grupo_permissao (grupo_id, permissao)
    SELECT g.id, 'relatorios.ver' FROM dbo.grupos g WHERE g.nome = N'Equipe dos ministérios'
      AND NOT EXISTS (SELECT 1 FROM dbo.grupo_permissao x WHERE x.grupo_id = g.id AND x.permissao = 'relatorios.ver');
    INSERT INTO dbo.sementes (chave) VALUES (N'v5:equipe');
END
GO

/* Privacidade (LGPD): os detalhes da Pastoral e da Integração ficam só com o líder do ministério,
   os administradores e o responsável. Líderes de equipe deixam de ver os acompanhamentos de todos. */
IF NOT EXISTS (SELECT 1 FROM dbo.sementes WHERE chave = N'v5:lideres_privacidade')
BEGIN
    DELETE gp FROM dbo.grupo_permissao gp JOIN dbo.grupos g ON g.id = gp.grupo_id
    WHERE g.nome = N'Líderes de equipe' AND gp.permissao IN ('pastoral.ver_todos', 'integracao.ver_todos');
    UPDATE dbo.grupos SET descricao = N'Vê pessoas e relatórios. Os acompanhamentos da Pastoral e da Integração ficam com o líder de cada um e com os responsáveis'
    WHERE nome = N'Líderes de equipe';
    INSERT INTO dbo.sementes (chave) VALUES (N'v5:lideres_privacidade');
END
GO

/* Líder de ministério = líder de equipe: quem já está marcado como líder entra no ministério "Líderes de equipe" */
DECLARE @le INT = (SELECT id FROM dbo.ministerios WHERE nome = N'Líderes de equipe');
IF @le IS NOT NULL
    INSERT INTO dbo.pessoa_ministerio (pessoa_id, ministerio_id, lider)
    SELECT DISTINCT pm.pessoa_id, @le, 0 FROM dbo.pessoa_ministerio pm
    WHERE pm.lider = 1 AND pm.ministerio_id <> @le
      AND NOT EXISTS (SELECT 1 FROM dbo.pessoa_ministerio x WHERE x.pessoa_id = pm.pessoa_id AND x.ministerio_id = @le);
GO

/* Documentos: os arquivos ficam no Google Drive; o site guarda só os links (não pesa no banco) */
IF COL_LENGTH('dbo.ministerios', 'drive_url') IS NULL
    ALTER TABLE dbo.ministerios ADD drive_url NVARCHAR(500) NULL;   -- pasta do ministério no Drive
GO
IF OBJECT_ID('dbo.configuracoes') IS NULL
CREATE TABLE dbo.configuracoes (
    chave  VARCHAR(60) NOT NULL CONSTRAINT pk_configuracoes PRIMARY KEY,
    valor  NVARCHAR(1000) NULL
);
IF OBJECT_ID('dbo.documentos') IS NULL
CREATE TABLE dbo.documentos (
    id             INT IDENTITY(1,1) CONSTRAINT pk_documentos PRIMARY KEY,
    ministerio_id  INT NULL CONSTRAINT fk_doc_ministerio REFERENCES dbo.ministerios(id) ON DELETE SET NULL,   -- vazio = geral
    titulo         NVARCHAR(200) NOT NULL,
    assunto        NVARCHAR(500) NULL,       -- temas e assuntos (ex.: pauta da reunião)
    data           DATE NULL,
    url            NVARCHAR(500) NOT NULL,
    criado_por     INT NULL,
    dt_criacao     DATETIME2(0) NOT NULL CONSTRAINT df_doc_criacao DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.sementes WHERE chave = N'v6:documentos')
BEGIN
    INSERT INTO dbo.grupo_permissao (grupo_id, permissao)
    SELECT g.id, 'documentos.gerenciar' FROM dbo.grupos g WHERE g.nome = N'Administração'
      AND NOT EXISTS (SELECT 1 FROM dbo.grupo_permissao x WHERE x.grupo_id = g.id AND x.permissao = 'documentos.gerenciar');
    INSERT INTO dbo.sementes (chave) VALUES (N'v6:documentos');
END
GO
