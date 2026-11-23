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
- Agenda/Escalas: rotas 'aprovado' com checagem interna: só o líder do ministério (pessoa_ministerio.lider) ou administrador altera. Escalas: todos veem as de todos, mas a aba só aparece com alguém escalado no mês (ou para quem monta); a lista da equipe só vai para quem monta. Agenda: líder de qualquer ministério vê as reuniões de todos (só altera as do seu); os outros veem as dos seus ministérios e as que são convidados.
- Grupos (v5/v10): Administradores (tudo), Administração (cadastro, chamada, ministérios, relatórios, baixar/importar planilhas), Financeiro (v10: financeiro.ver/editar/excluir; saiu da Administração), Cadastro e chamada (cadastra e faz a chamada; não apaga nem baixa), Pastoral, Integração, Líderes de equipe (pessoas e relatórios), Equipe dos ministérios (só relatórios). Toda conta liberada vê Início, Escalas, Agenda, Documentos, Ministérios (só olhar) e Sugestões. Apagar ministério, pessoa ou chamada: só administrador.
- Pastoral/Integração (LGPD): histórico só para o líder do ministério da área, administradores e o responsável de um acompanhamento aberto da pessoa (que vê os anteriores dela). "Em acompanhamento" = tem responsável; sem responsável volta para a lista de espera. Concluir exige desfecho (DESFECHOS em rotas.js); concluído some da lista do responsável e da ficha.
- Líder de ministério entra sozinho no ministério "Líderes de equipe" (e sai quando não lidera mais nada).
- Velocidade: o banco fica na Europa (cada ida custa). Sessão lembrada 20 s no servidor (limpa a cada gravação); respostas grandes em gzip; no navegador `api()` guarda as consultas GET (exceto /presenca e /auth) e confere por trás, avisando a tela com o evento `hype:atualizou`; o menu pré-carrega a tela (BUSCA_DA_TELA em app.js). Página nova: incluir em `<link rel="modulepreload">` no index.html.
- Janelas: `janela()` pergunta "Sair sem salvar?" se algo mudou (marque `j.alterou = true` para mudanças que não são campos). Abas `.abas` têm a marcação deslizando (js/abas.js).
- Líder (`pessoa_ministerio.lider`): o cadastro da pessoa (PUT /pessoas) só mexe nos ministérios que mudaram, para não apagar a marca de líder. Nunca voltar ao "apaga tudo e regrava".
- Troca de tela: `api()` ignora a resposta GET de uma tela que já foi trocada (`novaTela()` em app.js), para a tela velha não se desenhar por cima da nova.
- Documentos: os arquivos ficam no Google Drive; o site guarda só links (ministerios.drive_url, configuracoes 'drive_pasta_geral', tabela documentos). Nada de arquivo passa pelo Netlify. Vê: geral todos; do ministério, quem é dele, líderes, documentos.gerenciar e admin. Mexe: líder do ministério, documentos.gerenciar (Administração) e admin; apagar: líder ou admin. Nunca commitar links reais do Drive (repositório público).
- Financeiro: tabela fin_lancamentos (verba/despesa/entrada, com quantidade/unidade v10); permissões financeiro.ver/editar/excluir. Estoque: fin_itens + fin_estoque (movimento + entra/− sai; o da compra tem lancamento_id e muda/sai junto). Nota fiscal: fin_notas (JPEG reduzido no navegador ou PDF, até 1 MB, confere a assinatura do arquivo) — exceção à regra do Drive, como as fotos das pessoas. Excluir item do estoque (financeiro.excluir) leva o histórico dele; os lançamentos ficam. Listas de opções: `autocompletar()` em ui.js (não usar <datalist>).
- Escalas (v10): escala_itens.participou (2/1/0/null), só o líder e admin veem; salvar uma sexta só mexe no que mudou (não perde a participação). Relatório em Relatórios → Escalas (`GET /escalas/relatorio`).
- Pessoas arquivadas = cd_status 0: saem das listas e da chamada; aparecem na busca da chamada e voltam sozinhas ao serem marcadas presentes. Presença de quem tem acompanhamento com responsável: registro do Sistema + e-mail ao responsável.
- WhatsApp sem número (grupo): `js/whats.js` (celular: wa.me; computador: WhatsApp Web).
- Sugestões (v9): tabela sugestoes (nova/aceita/fazendo/feita/recusada). Todos sugerem e veem as dos outros (recusada só o autor); autor corrige/apaga enquanto 'nova'; `sugestoes.gerenciar` (administradores) aceita, recusa e move na Sprint. Regra na API.
- Sprints (v10): tabela sprints (aberta/fechada; várias abertas podem existir, mas os dias nunca se sobrepõem: dá para planejar a próxima) + sugestoes.sprint_id. Backlog e sprints são só de quem tem sugestoes.gerenciar; os outros veem a aba Sugestões (status simples) e Novidades. Status para quem gerencia: Aguardando análise, Pronto para codificação, Em codificação, Codificado, Recusada. Aceita sem sprint = backlog. Fechar grava a nota (Novidades, todos veem; rascunho da aberta só quem gerencia), leva o pendente para a próxima ou backlog e pode abrir a próxima. `/contadores` devolve `novidade` (última fechada em 21 dias); o "visto" fica no localStorage (`hype_novidade_vista`). Ritmo combinado: sprint de 15 dias e publicação na segunda (nunca na sexta).
- Foto de perfil: `js/foto-ajuste.js` (ajustar com arrastar/zoom/girar antes de salvar, JPEG 600px; `verFoto()` abre grande ao clicar).
- Campos: `js/campos.js` enfeita select/date/time/month em todo o site (não usar o visual nativo do navegador). Carregando = `.boot .spin` (o H oficial, 20px, com as sombras abrindo e fechando).
- Mudanças no `01_estrutura.sql` precisam ser só aditivas: o Arthur roda o 01 antes de publicar, e o site antigo tem que continuar funcionando com o banco novo (testar a versão do `main` contra o banco atualizado).
- **Economia de créditos do Netlify (plano grátis, 300/mês; cada publicação no `main` = 15 créditos; se acabar, o site fica pausado até o ciclo seguinte):** trabalhar no ramo `desenvolvimento` e só levar para o `main` (que publica) quando o Arthur pedir ou ao fechar um conjunto de mudanças. Nunca publicar a cada ajuste pequeno.
