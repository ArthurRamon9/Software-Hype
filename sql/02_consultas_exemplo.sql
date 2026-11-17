/* =====================================================================
   GESTÃO DO HYPE — Consultas de exemplo para relatórios no banco
   © Arthur Ramon da Silva — Todos os direitos reservados.
   ===================================================================== */

-- Pessoas ativas com idade e ministérios
SELECT nome, tipo, idade, telefone, ministerios FROM dbo.vw_pessoas WHERE cd_status = 1 ORDER BY nome;

-- Resumo das últimas 10 sextas
SELECT TOP 10 data, tema, presentes, faltas, membros_presentes, visitantes_presentes
FROM dbo.vw_resumo_encontros ORDER BY data DESC;

-- Média de presentes por mês no ano atual x ano anterior
SELECT MONTH(data) AS mes,
       AVG(CASE WHEN YEAR(data) = YEAR(GETDATE())     THEN presentes * 1.0 END) AS media_ano_atual,
       AVG(CASE WHEN YEAR(data) = YEAR(GETDATE()) - 1 THEN presentes * 1.0 END) AS media_ano_anterior
FROM dbo.vw_resumo_encontros
WHERE YEAR(data) >= YEAR(GETDATE()) - 1
GROUP BY MONTH(data) ORDER BY mes;

-- Frequência de cada pessoa (quem menos vem primeiro)
SELECT nome, tipo, presencas, encontros_marcados, percentual, ultima_presenca
FROM dbo.vw_frequencia_pessoa WHERE cd_status = 1 ORDER BY percentual, nome;

-- Quem faltou nas 3 últimas sextas seguidas
WITH ult AS (SELECT TOP 3 id FROM dbo.encontros ORDER BY data DESC)
SELECT p.nome, p.telefone
FROM dbo.pessoas p
WHERE p.cd_status = 1
  AND (SELECT COUNT(*) FROM dbo.presencas pr JOIN ult ON ult.id = pr.encontro_id
       WHERE pr.pessoa_id = p.id AND pr.presente = 0) = 3;

-- Visitantes que vieram pela primeira vez em cada sexta
SELECT e.data, p.nome, p.telefone, p.como_conheceu
FROM dbo.presencas pr
JOIN dbo.encontros e ON e.id = pr.encontro_id
JOIN dbo.pessoas p   ON p.id = pr.pessoa_id
WHERE pr.presente = 1 AND p.data_cadastro = e.data
ORDER BY e.data DESC;

-- Acompanhamentos pastorais em aberto
SELECT c.id, p.nome, c.responsavel_nome, c.motivo, c.status, c.dt_abertura,
       (SELECT MAX(r.dt_criacao) FROM dbo.pastoral_registros r WHERE r.caso_id = c.id) AS ultimo_contato
FROM dbo.pastoral_casos c JOIN dbo.pessoas p ON p.id = c.pessoa_id
WHERE c.status <> 'concluido' ORDER BY c.dt_abertura;

-- Liberar um usuário manualmente (se precisar)
-- UPDATE dbo.usuarios SET cd_status = 1 WHERE email = 'pessoa@exemplo.com';
