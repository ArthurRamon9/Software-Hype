/* =====================================================================
   GESTÃO DO HYPE — Banco de TESTE no seu computador
   © Arthur Ramon da Silva — Todos os direitos reservados.

   Rode no SSMS conectado ao SQL Server do seu computador (NÃO no MonsterASP).
   Cria o banco hype_teste e um login só para ele.

   Antes de rodar: troque a senha abaixo (aparece 1 vez) e use a MESMA senha
   no arquivo api/local.settings.json (SQL_CONNECTION_STRING).

   Depois, nesta ordem, com o banco hype_teste selecionado:
     1) sql/01_estrutura.sql
     2) o script com os dados da planilha (peça ao Claude; não fica no repositório)
   ===================================================================== */
USE master;
GO

IF DB_ID('hype_teste') IS NULL
    CREATE DATABASE hype_teste COLLATE SQL_Latin1_General_CP1_CI_AS;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'hype_teste')
    CREATE LOGIN hype_teste WITH PASSWORD = 'Teste#Hype2026', CHECK_POLICY = OFF, DEFAULT_DATABASE = hype_teste;
GO

USE hype_teste;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'hype_teste')
    CREATE USER hype_teste FOR LOGIN hype_teste;
ALTER ROLE db_owner ADD MEMBER hype_teste;
GO

/* Para recomeçar do zero (apaga só o banco de teste):
   USE master; ALTER DATABASE hype_teste SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE hype_teste;
   e rode este arquivo de novo. */
