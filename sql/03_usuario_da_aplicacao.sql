/* =====================================================================
   GESTÃO DO HYPE — Usuário do banco usado pelo site (privilégio mínimo)
   © Arthur Ramon da Silva — Todos os direitos reservados.

   Rode conectado no banco do sistema, com o usuário principal.
   Troque a senha abaixo por uma forte.
   Se a hospedagem não permitir criar usuários (dá erro de permissão),
   pode pular este script: o site funciona com o usuário principal.

   O site usa este usuário: ele só lê e grava dados. Não consegue
   apagar tabelas, mudar a estrutura nem criar usuários. Mesmo que
   alguém roubasse a string de conexão do site, não destruiria o banco.
   ===================================================================== */
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'hype_app')
    CREATE USER hype_app WITH PASSWORD = 'TROQUE-por-uma-senha-forte-123!';

ALTER ROLE db_datareader ADD MEMBER hype_app;
ALTER ROLE db_datawriter ADD MEMBER hype_app;
DENY ALTER ON SCHEMA::dbo TO hype_app;
DENY DELETE ON dbo.auditoria TO hype_app;   -- o registro de atividades não pode ser apagado pelo site
DENY UPDATE ON dbo.auditoria TO hype_app;
GO
