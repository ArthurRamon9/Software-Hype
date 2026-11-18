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
- Situações da pessoa (`pessoas.tipo`): novo_visitante, visitante_regular, novo_membro, membro, membro_ativo, ex_visitante. Membro = novo_membro/membro/membro_ativo (`ehMembro()` em `js/ui.js`).
- Exportações sempre em **.xlsx** (`js/xlsx.js`), nunca CSV: é o que o pessoal usa.
- A migração da planilha antiga (Hype_2026.xlsx) é feita por um script gerado fora do repositório, porque contém dados pessoais. Nunca commitar dados de pessoas.
- Segurança (não regredir): senhas só em bcrypt; sessão em cookie HttpOnly/SameSite=Strict; toda rota declara permissão (tabela no topo de `api/src/rotas.js`) e a API recusa rota sem permissão definida; escrita exige cabeçalho `X-Hype: 1`; CSP sem scripts inline (nada de `onclick=` no HTML); sempre usar `esc()` ao montar HTML com dados; consultas SQL só com parâmetros; o site usa o usuário de banco `hype_app` (sem DDL).
- Permissões por grupos: tabelas `grupos`, `permissoes`, `grupo_permissao`, `usuario_grupo`. Nova funcionalidade = nova permissão no MERGE de `sql/01_estrutura.sql` + entrada na tabela de rotas + checagem `pode()` na tela.
- Teste local: `npm run dev` (site + API em http://localhost:4280). Guia para o Arthur: `TESTE-LOCAL.md` (zip com o código; ele aponta para o banco oficial, com `sql/99_limpar_testes.sql` para limpar).
- Identidade: preto, branco e roxo (`--accent`), títulos em Anton itálico; tema claro/escuro por `data-tema` no `<html>` (js/tema.js). Toda cor nova precisa funcionar nos dois temas.
- Textos visíveis sempre começam com letra maiúscula (o Arthur faz questão).
- Pastoral/Integração: equipe = pessoas do ministério de mesmo nome (cadastro, não login). Ver todos = `<area>.ver_todos` ou líder do ministério; designar = `<area>.designar` ou líder. Regra aplicada na API.
- Agenda/Escalas: rotas 'aprovado' com checagem interna: só o líder do ministério (pessoa_ministerio.lider) ou administrador altera. Escalas: todos veem as de todos; a lista da equipe só vai para quem monta.
- Campos: `js/campos.js` enfeita select/date/time/month em todo o site (não usar o visual nativo do navegador). Carregando = `.boot .spin` (o H correndo).
- Mudanças no `01_estrutura.sql` precisam ser só aditivas: o Arthur roda o 01 antes de publicar, e o site antigo tem que continuar funcionando com o banco novo (testar a versão do `main` contra o banco atualizado).
- **Economia de créditos do Netlify (plano grátis, 300/mês; cada publicação no `main` = 15 créditos; se acabar, o site fica pausado até o ciclo seguinte):** trabalhar no ramo `desenvolvimento` e só levar para o `main` (que publica) quando o Arthur pedir ou ao fechar um conjunto de mudanças. Nunca publicar a cada ajuste pequeno.
