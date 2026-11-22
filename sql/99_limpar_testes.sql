/* =====================================================================
   GESTÃO DO HYPE — Limpar o que foi criado nos testes
   © Arthur Ramon da Silva — Todos os direitos reservados.

   Para quando o teste no VS Code aponta para o banco OFICIAL.
   Combinado para os testes:
     - pessoas de teste com nome começando com "Zz Teste"
     - chamadas de teste na data 03/01/2020
     - contas de teste com e-mail terminando em @teste.com
     - reuniões de teste com título começando com "Zz Teste"
     - lançamentos do financeiro, itens do estoque, funções de escala, documentos e sugestões começando com "Zz Teste"

   Rode primeiro como está (só MOSTRA o que seria apagado).
   Conferiu? Troque @apagar para 1 e rode de novo.
   ===================================================================== */
DECLARE @apagar BIT = 0;
DECLARE @data_teste DATE = '2020-01-03';

SELECT 'pessoa' AS o_que, CAST(id AS VARCHAR(20)) AS id, nome AS detalhe FROM dbo.pessoas WHERE nome LIKE N'Zz Teste%'
UNION ALL
SELECT 'chamada', CAST(id AS VARCHAR(20)), CONVERT(CHAR(10), data, 103) FROM dbo.encontros WHERE data = @data_teste
UNION ALL
SELECT 'conta', CAST(id AS VARCHAR(20)), email FROM dbo.usuarios WHERE email LIKE N'%@teste.com'
UNION ALL
SELECT 'reunião', CAST(id AS VARCHAR(20)), titulo FROM dbo.reunioes WHERE titulo LIKE N'Zz Teste%'
UNION ALL
SELECT 'financeiro', CAST(id AS VARCHAR(20)), descricao FROM dbo.fin_lancamentos WHERE descricao LIKE N'Zz Teste%'
UNION ALL
SELECT 'função de escala', CAST(id AS VARCHAR(20)), nome FROM dbo.escala_funcoes WHERE nome LIKE N'Zz Teste%'
UNION ALL
SELECT 'documento', CAST(id AS VARCHAR(20)), titulo FROM dbo.documentos WHERE titulo LIKE N'Zz Teste%';
IF OBJECT_ID('dbo.fin_itens') IS NOT NULL
    SELECT 'item do estoque' AS o_que, CAST(id AS VARCHAR(20)) AS id, nome AS detalhe FROM dbo.fin_itens WHERE nome LIKE N'Zz Teste%';
IF OBJECT_ID('dbo.sugestoes') IS NOT NULL
    SELECT 'sugestão' AS o_que, CAST(id AS VARCHAR(20)) AS id, titulo AS detalhe FROM dbo.sugestoes WHERE titulo LIKE N'Zz Teste%';

IF @apagar = 1
BEGIN
    SET XACT_ABORT ON;
    BEGIN TRAN;
        DELETE FROM dbo.encontros WHERE data = @data_teste;          -- leva junto as presenças dessa data
        DELETE FROM dbo.pessoas   WHERE nome LIKE N'Zz Teste%';      -- leva junto presenças, acompanhamentos, foto e ministérios
        DELETE FROM dbo.usuarios  WHERE email LIKE N'%@teste.com';   -- leva junto os grupos da conta
        DELETE FROM dbo.reunioes  WHERE titulo LIKE N'Zz Teste%';    -- leva junto os convidados
        DELETE FROM dbo.fin_lancamentos WHERE descricao LIKE N'Zz Teste%';
        DELETE FROM dbo.escala_funcoes  WHERE nome LIKE N'Zz Teste%';
        DELETE FROM dbo.documentos      WHERE titulo LIKE N'Zz Teste%';
        IF OBJECT_ID('dbo.sugestoes') IS NOT NULL DELETE FROM dbo.sugestoes WHERE titulo LIKE N'Zz Teste%';
        IF OBJECT_ID('dbo.fin_itens') IS NOT NULL DELETE FROM dbo.fin_itens WHERE nome LIKE N'Zz Teste%';   -- leva junto os movimentos
    COMMIT;
    PRINT 'Testes apagados.';
END
