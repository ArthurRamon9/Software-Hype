# Regras do projeto — Gestão do Hype

## Direitos e responsabilidade (obrigatório em TODOS os sites do Arthur)
- Todo site/sistema deve informar que os direitos são reservados a **Arthur Ramon da Silva**, responsável pelo site.
- Rodapé padrão: `© <ano> <Nome do site>. Todos os direitos reservados a Arthur Ramon da Silva.`
- Incluir `<meta name="author">` e `<meta name="copyright">`, arquivo `LICENSE` (todos os direitos reservados) e o aviso no fim do README.
- Neste projeto o texto vem de `direitos()` em `js/ui.js` e também aparece nos e-mails (`api/src/email.js`).

## Preferências do Arthur
- Português do Brasil em tudo.
- Custo zero e **sem cadastrar cartão de crédito**: priorizar serviços gratuitos que não pedem cartão.
- Banco preferido: **SQL Server** (ele trabalha com SQL Server e faz consultas/relatórios direto no banco).
- Responsivo, simples e com cara de produto feito à mão. Evitar vícios de "site feito por IA": gradiente roxo/azul, emojis na interface, cartões com ícone em quadradinho colorido, botões repetidos fazendo a mesma coisa, textos de marketing genéricos, sombras e cantos exagerados.

## Técnica
- Front-end sem build: HTML + CSS + JavaScript (ES modules), rotas por hash.
- API: Netlify Function (`netlify/functions/api.mjs`, rota `/api/*`) que chama `api/src/http.js` → `api/src/rotas.js`. Dependências no `package.json` da raiz.
- Banco: SQL Server no MonsterASP.NET (grátis, sem cartão). Mudanças de estrutura vão em `sql/01_estrutura.sql` (idempotente).
- `cd_status`: 1 = ativo, 0 = inativo.
- Segurança (não regredir): senhas só em bcrypt; sessão em cookie HttpOnly/SameSite=Strict; toda rota declara permissão (tabela no topo de `api/src/rotas.js`) e a API recusa rota sem permissão definida; escrita exige cabeçalho `X-Hype: 1`; CSP sem scripts inline (nada de `onclick=` no HTML); sempre usar `esc()` ao montar HTML com dados; consultas SQL só com parâmetros; o site usa o usuário de banco `hype_app` (sem DDL).
- Permissões por grupos: tabelas `grupos`, `permissoes`, `grupo_permissao`, `usuario_grupo`. Nova funcionalidade = nova permissão no MERGE de `sql/01_estrutura.sql` + entrada na tabela de rotas + checagem `pode()` na tela.
- Teste local: `npm run dev` (site + API em http://localhost:4280).
