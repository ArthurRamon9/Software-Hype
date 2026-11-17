# Regras do projeto — Gestão do Hype

## Direitos e responsabilidade (obrigatório em TODOS os sites do Arthur)
- Todo site/sistema deve informar que os direitos são reservados a **Arthur Ramon da Silva**, responsável pelo site.
- Rodapé padrão: `© <ano> <Nome do site>. Todos os direitos reservados a Arthur Ramon da Silva.`
- Incluir `<meta name="author">` e `<meta name="copyright">`, arquivo `LICENSE` (todos os direitos reservados) e o aviso no fim do README.
- Neste projeto o texto vem de `direitos()` em `js/ui.js` e também aparece nos e-mails (`api/src/email.js`).

## Preferências do Arthur
- Português do Brasil em tudo.
- Custo zero: priorizar serviços gratuitos.
- Banco preferido: **SQL Server** (ele trabalha com SQL Server e faz consultas/relatórios direto no banco).
- Responsivo, simples e com cara de produto feito à mão. Evitar vícios de "site feito por IA": gradiente roxo/azul, emojis na interface, cartões com ícone em quadradinho colorido, botões repetidos fazendo a mesma coisa, textos de marketing genéricos, sombras e cantos exagerados.

## Técnica
- Front-end sem build: HTML + CSS + JavaScript (ES modules), rotas por hash.
- API: Azure Functions (Node 20, modelo v4) em `api/`, uma função que despacha as rotas de `api/src/rotas.js`.
- Banco: Azure SQL Database. Mudanças de estrutura vão em `sql/01_estrutura.sql` (idempotente).
- `cd_status`: 1 = ativo, 0 = inativo.
- Teste local: `node api/dev-server.js` (site + API em http://localhost:4280).
