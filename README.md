# Gestão do Hype

Sistema interno do grupo de jovens **Hype**: cadastro de pessoas com foto, chamada das sextas, ministérios, acompanhamento pastoral de quem está faltando e relatórios por semana, mês e ano.

© Arthur Ramon da Silva. Todos os direitos reservados. Responsável pelo sistema e pelos dados: **Arthur Ramon da Silva**.

---

## Como é montado (tudo grátis e sem cartão de crédito)

| Parte | Serviço |
|---|---|
| Banco de dados | **SQL Server** no **MonsterASP.NET** (plano Free: 1 GB, acesso pelo SSMS) |
| Site + API | **Netlify** (plano Free: o site e a função em `netlify/functions/api.mjs`) |
| E-mail de "esqueci a senha" | Gmail com senha de app |

```
navegador  →  site (HTML/CSS/JS)  →  /api (Node.js no Netlify)  →  SQL Server (MonsterASP)
                                              └→ Gmail (e-mails)
```

O site nunca fala direto com o banco. Quem fala é a API, que confere o login e as permissões em **cada** pedido.

## Segurança

| Ameaça | Proteção |
|---|---|
| Alguém ver a senha dos outros | Senhas guardadas só como hash **bcrypt** (custo 12). Não existe como recuperar a senha original, nem pelo banco. Os links de "esqueci a senha" também são guardados só como hash, valem 1 hora e funcionam uma única vez. |
| "Entrar como admin/admin" | **Não existe usuário padrão.** Só vira administrador quem se cadastrar com o e-mail definido em `ADMIN_EMAIL` (configuração do servidor), e só enquanto não houver outro administrador. Todo o resto entra bloqueado até alguém liberar. |
| Senha fraca | Mínimo de 8 caracteres com letras e números; senhas comuns (12345678, admin123, senha123...) e senhas com o próprio nome/e-mail são recusadas. |
| Ficar chutando senha | Após 5 erros no mesmo e-mail (ou 20 do mesmo IP) em 15 minutos, bloqueia por 15 minutos. |
| Roubo de sessão | A sessão fica num cookie `HttpOnly`, `Secure` e `SameSite=Strict`: o JavaScript da página não consegue lê-lo. Trocar a senha ou ser bloqueado derruba na hora todas as sessões abertas. |
| Ver o que não pode | Permissões por **grupo** conferidas pela API em todo pedido (esconder o botão na tela é só conforto). Quem não tem permissão nem recebe o dado. |
| SQL injection | Todas as consultas usam parâmetros; nada digitado vira comando SQL. |
| Script malicioso (XSS) | Todo texto é escapado antes de aparecer na tela, e o site envia `Content-Security-Policy` que proíbe scripts de fora ou embutidos. |
| Ataque vindo de outro site (CSRF) | Cookie `SameSite=Strict` + toda escrita exige um cabeçalho que outro site não consegue enviar. |
| Arquivo malicioso na foto | A foto é redesenhada no navegador e a API só aceita JPEG verdadeiro (confere a assinatura do arquivo), até 1 MB. |
| Estrago no banco | O site usa o usuário `hype_app`, que só lê e grava dados: não apaga tabelas, não muda estrutura e não consegue apagar o registro de atividades. |
| Saber quem fez o quê | Registro de atividades (tabela `auditoria`, tela Acessos → Atividades): logins, tentativas falhas, liberações, bloqueios, cadastros, exclusões, chamadas salvas. |

### Grupos e permissões
Cada usuário pode estar em um ou mais grupos e tem a soma das permissões deles.

**Dar acesso a alguém:** a pessoa clica em **Criar conta** na tela de entrada; ela aparece em **Acessos → Usuários** aguardando liberação. Para escolher os grupos, clique na pessoa (aba Usuários) ou abra o grupo (aba Grupos) e marque quem está nele. No celular, Acessos e Ministérios ficam em **Minha conta** (toque no seu avatar no topo). Grupos que já vêm criados (dá para mudar ou criar outros em **Acessos → Grupos**):

| Grupo | Pode |
|---|---|
| Administradores | tudo (não pode ser alterado nem ficar vazio) |
| Pastoral | ver pessoas, ver e registrar acompanhamentos pastorais, ver relatórios |
| Integração | ver e cadastrar pessoas, acompanhar e registrar contato com visitantes |
| Presença | ver pessoas, fazer a chamada (e cadastrar visitante novo nela) |
| Cadastro | ver, cadastrar e editar pessoas |

Permissões existentes: `pessoas.ver`, `pessoas.editar`, `pessoas.excluir`, `presenca.marcar`, `presenca.excluir`, `pastoral.ver`, `pastoral.editar`, `pastoral.excluir`, `integracao.ver`, `integracao.editar`, `relatorios.ver`, `ministerios.editar`, `acessos.gerenciar`. A tabela de qual rota exige qual permissão fica no topo de `api/src/rotas.js`.

---

## Instalação

### 1. Gmail para enviar os e-mails
1. No Gmail do ministério, ative a **verificação em duas etapas** (myaccount.google.com/security).
2. Crie uma **senha de app** em myaccount.google.com/apppasswords e anote as 16 letras.

### 2. Banco (MonsterASP.NET)
1. Crie a conta grátis em monsterasp.net (sem cartão).
2. No painel, crie um **banco MSSQL**. Anote servidor, nome do banco, usuário e senha.
3. No banco, em **Users and remote**, clique em **Enabled** para liberar o acesso remoto.
4. Conecte pelo SSMS com esses dados e rode **`sql/01_estrutura.sql`** dentro do banco.
5. Rode **`sql/03_usuario_da_aplicacao.sql`** (troque a senha de exemplo). Se a hospedagem não permitir criar usuário, pule este passo e use o usuário principal.

### 3. Site (Netlify)
1. Crie a conta grátis em netlify.com entrando com o GitHub.
2. **Add new project → Import an existing project → GitHub → Software-Hype**. Deixe as opções como vierem (o `netlify.toml` já configura tudo) e publique.
3. Em **Project configuration → Environment variables**, adicione:

| Nome | Valor |
|---|---|
| `SQL_CONNECTION_STRING` | `Server=SERVIDOR,1433;Initial Catalog=BANCO;User ID=USUARIO;Password=SENHA;Encrypt=True;` |
| `JWT_SECRET` | 96 caracteres aleatórios |
| `ADMIN_EMAIL` | **o seu e-mail**: só ele pode virar o primeiro administrador |
| `SMTP_USER` | o Gmail |
| `SMTP_PASS` | a senha de app (sem espaços) |
| `SITE_URL` | o endereço do site, ex. `https://gestao-hype.netlify.app/` |

4. **Deploys → Trigger deploy** para aplicar as variáveis.

### 4. Primeiro acesso
Abra o site e clique em **Criar conta** usando **o mesmo e-mail do `ADMIN_EMAIL`**: essa conta já entra como administrador. Qualquer outra conta fica aguardando liberação em **Acessos**.

## Atualizar um banco que já existe
Quando sair uma versão nova, rode de novo o **`sql/01_estrutura.sql`** no SSMS. Ele só acrescenta o que falta (campos, permissões, grupos) e converte os dados antigos; não apaga nada.

## Situações (a jornada de cada pessoa)
`novo_visitante` → `visitante_regular` → `novo_membro` → `membro` → `membro_ativo`, e `ex_visitante` para quem parou de vir. Cada presença guarda também a situação da pessoa **naquele dia** (`presencas.tipo_na_data`), para os números históricos de membros × visitantes não mudarem quando alguém muda de situação.

## Quem está "no Hype"
O cadastro guarda todo mundo que já passou pelo Hype, mas o dia a dia só mostra quem está vindo:
- **No Hype**: veio nos últimos 3 meses (ou foi cadastrado nos últimos 30 dias). É quem aparece em Pessoas e na chamada.
- **Afastado**: não vem há mais de 3 meses. Sai das listas, mas nada é apagado: está no filtro "Afastados" de Pessoas, a busca encontra e a ficha guarda todo o histórico.
- **Frequentes** (número do Início): vieram em 2 ou mais das últimas 8 sextas.
- Bolinha da "Última vez": verde = veio nas últimas 3 semanas; amarela = sumindo (3 semanas a 3 meses); escura = afastado.

## Ministérios, líderes e quem vê o quê
- **Ministério** = onde o jovem serve (informação do cadastro). **Grupo** = o que cada conta pode fazer no sistema.
- Em cada ministério marque quem é **Líder**. O líder monta as escalas e marca as reuniões do seu ministério.
- **Ligue cada conta à pessoa do cadastro** (Acessos → abrir a conta). O sistema sugere pelo mesmo e-mail e o administrador confirma.
  Com a conta ligada aparecem a foto, as escalas, a agenda e os acompanhamentos da pessoa.
- **Ver como**: em Acessos, o administrador pode ver o sistema como outra conta (não-administradora) para testar e ajudar.
  Não usa senha de ninguém e tudo fica no registro como "Fulano (como Beltrano)".

## Pastoral e Integração
As duas áreas usam a mesma estrutura (`pastoral_casos` + `pastoral_registros`), separadas pela coluna `area`.
- **Pastoral** alerta membros (novo membro, membro, membro ativo) e visitantes com **2 faltas seguidas**. Quem está no ministério **Líderes de equipe** só entra com **3 faltas seguidas**. Só entra quem está até **5 semanas** sem vir (quem sumiu há mais tempo não vira pendência). Visitante que veio uma vez só fica com a Integração.
- O responsável pode ser trocado dentro do acompanhamento ou definido para vários de uma vez (marque e use "Definir responsável"). O filtro de responsável mostra quem está no grupo da área.
- **Quem cuida** é escolhido numa lista com as pessoas do ministério Pastoral (ou Integração) do cadastro.
- **Quem vê:** quem distribui (administradores, permissão "designar" ou líder do ministério da área) vê tudo e a lista de pendentes;
  os Líderes de equipe veem tudo sem alterar; o resto da equipe vê **só os casos que estão com ela** (inclusive no Início, em "Seus acompanhamentos").
- **Enviar para o responsável:** abre o WhatsApp do responsável com nome, telefone, Instagram e há quanto tempo a pessoa não vem.
  O envio fica no histórico, o caso vai para "Em andamento" e, se em 7 dias ninguém registrar contato, aparece "Sem retorno".
- A lista de acompanhamentos mostra só pessoas ativas, tem lixeira em cada linha e permite marcar várias para concluir ou excluir de uma vez.
- **Integração** lista os visitantes que chegaram nos últimos 60 dias e ainda não tiveram contato, destacando quem chegou há menos de 48 horas.
- **Veio ao Hype:** quando alguém que está em acompanhamento (com responsável) é marcado presente na chamada, fica anotado no acompanhamento e o responsável recebe um e-mail (uma vez por sexta; chamadas de mais de 7 dias atrás não avisam). O e-mail vai para a conta ligada ao cadastro do responsável ou, se não tiver, para o e-mail do cadastro.
- Quem estava **sem responsável** e voltou ao Hype sai da lista sozinho (concluído como "Voltou para o Hype").

## Chamada com várias pessoas
Várias pessoas podem fazer a chamada ao mesmo tempo, cada uma no seu celular: cada uma grava só o que marcou.
"Marcar quem falta como ausente" (botão embaixo da chamada) não apaga quem outra pessoa marcou como presente. Não dá para salvar chamada de data futura.

## Arquivar quem parou de vir
Em Pessoas, filtre **Afastados** e use "Arquivar estas N" (ou marque "Arquivada" no cadastro). Arquivada sai das listas e da chamada, mas o histórico fica.
Se voltar, é só procurar o nome na chamada: ao ser marcada presente, sai do arquivo sozinha. O filtro **Arquivados** mostra quem está guardado.

## Grupos de acesso (v5)
| Grupo | O que faz |
|---|---|
| Administradores | Tudo, inclusive apagar e "Ver como" |
| Administração | Cadastro, chamada, ministérios, relatórios e baixar/importar planilhas. Não apaga nada |
| Financeiro (v10) | Vê e cuida do financeiro: verba, despesas, entradas, estoque e notas fiscais (inclusive apagar lançamentos) |
| Cadastro e chamada | Cadastra/atualiza pessoas e faz a chamada (cadastra o visitante na hora). Não apaga nem baixa |
| Pastoral / Integração | Vê e registra os acompanhamentos que estão com a pessoa |
| Líderes de equipe | Vê pessoas e relatórios |
| Equipe dos ministérios | Hoje só acrescenta os Relatórios (pode apagar o grupo se não quiser isso) |

Toda conta liberada já vê, sem grupo nenhum: Início, Escalas, Agenda, Documentos, Ministérios (só olhar) e Sugestões.
O líder de cada ministério (marcado em Ministérios) distribui os acompanhamentos da sua área, monta escalas e marca reuniões.

## Documentos
Os arquivos (PDF, Word, Excel, apresentações) ficam no Google Drive, nas pastas que vocês já usam. O site guarda só os links: cada ministério tem a sua pasta (Ministérios → Editar → "Pasta no Google Drive"), há uma pasta geral e uma lista de documentos importantes com título, assunto e data, para buscar rápido. Abrir ou enviar arquivos é direto com o Google, nada passa pelo servidor do site.

## Financeiro
Verba do ano, despesas e entradas (ofertas, doações). O saldo é verba + entradas − despesas. Gastos por categoria e planilha com gráfico.
Só o grupo **Financeiro** (e administradores) vê (v10).
- **Quantidade:** o lançamento pode ter quantidade e unidade (ex.: 5 kg). Numa compra, marque "Entra no estoque" e diga o item: soma no estoque sozinho.
- **Estoque:** aba ao lado de "Dinheiro". Mostra quanto tem de cada item, o preço da última compra por unidade e avisa o que está acabando (abaixo do mínimo).
  "Usar" tira do estoque, "Entrou" soma o que chegou sem compra (doação), e "Contei e tem" acerta com o que tem de verdade. Corrigir ou apagar a compra corrige o estoque junto.
- **Nota fiscal (opcional):** anexe a foto ou o PDF da nota no lançamento. A foto é reduzida no próprio celular (até 1 MB) e fica no banco (`fin_notas`), como as fotos das pessoas.

## Sugestões
Qualquer pessoa com acesso manda ideias, melhorias ou avisa de algo com erro (menu **Sugestões**). Todos veem as sugestões dos outros, para não repetir e acompanhar o que vem por aí; a recusada só aparece para quem sugeriu. Quem tem `sugestoes.gerenciar` (administradores) aceita ou recusa com um recado. O que foi aceito vai para a **Sprint** (a fazer → fazendo → feita), e dá para baixar tudo em planilha. Quem sugeriu pode corrigir ou apagar a sua enquanto ninguém respondeu. O menu mostra quantas novas esperam resposta (v9 do `01_estrutura.sql`).

## Campos de data, hora e listas
`js/campos.js` troca a aparência dos campos do navegador (listas de escolha, data, hora e mês) pela do Hype, em todo o site e sozinho.
O campo original continua escondido guardando o valor, então o resto do código não muda. Para manter um campo do jeito do navegador: `data-nativo`.

## Agenda e Escalas
- **Agenda:** o líder marca a reunião do ministério e o convite chega no Google Agenda (ou iPhone/Outlook) de quem tem e-mail no cadastro,
  um e-mail por pessoa. Mudou o horário ou cancelou, a agenda deles atualiza sozinha. Cada um vê as reuniões dos seus ministérios;
  **líderes veem as de todos** (para não marcar no mesmo horário: o formulário avisa se já tem reunião naquela hora) e alteram só as do seu.
  Depois de criar, o botão **Avisar no WhatsApp** abre o WhatsApp com a mensagem pronta para escolher o grupo do ministério.
- **Escalas:** uma tabela por ministério, no jeito da planilha: colunas = sextas do mês, um bloco por função (Entrada, Saída...) com os nomes um embaixo do outro.
  Funções são criadas pelo próprio líder; sem funções, a escala é só a lista de quem serve.
  Todos veem as escalas de todos os ministérios que já têm alguém escalado no mês (só funções criadas não contam); só o líder (ou administrador) altera a do seu. O sistema avisa quando alguém está em dois ministérios na mesma sexta.
  No topo aparecem as próximas sextas em que a pessoa serve (a que passou some).
  **Enviar para o grupo:** no computador copia a imagem e abre o WhatsApp Web (é só escolher o grupo e Ctrl+V); no celular abre o compartilhar com a imagem.
  **Montar:** em cada sexta, uma janela com a equipe e as funções lado a lado para escolher todo mundo de uma vez.
  **Copiar ou limpar:** copia uma sexta para outras do mês, ou tira todo mundo das sextas escolhidas. Tirar uma função tira quem estava nela nas próximas sextas.
  **Participação:** depois da sexta, o líder marca quem participou, mais ou menos ou não participou (só o líder e os administradores veem).
  O **relatório do mês** fica em Relatórios → Escalas, para o líder (do seu ministério) e os administradores.

## Aparência
Cores do Hype (preto, branco e roxo; ciano e vermelho só no "H"), títulos na fonte Anton (OFL, em `assets/fonts`).
Tema claro, escuro ou automático em **Minha conta** (fica guardado no aparelho).

## Consultas no banco

Além das tabelas, o banco tem views prontas para relatórios próprios:

| View | O que mostra |
|---|---|
| `vw_pessoas` | pessoas com idade calculada e ministérios |
| `vw_presencas` | cada presença/falta com data, nome e tipo |
| `vw_resumo_encontros` | totais por sexta |
| `vw_frequencia_pessoa` | presenças, faltas, % e última presença por pessoa |

Tabelas da v4: `reunioes` e `reuniao_pessoa` (Agenda), `escala_funcoes` e `escala_itens` (Escalas), `sementes` (o que o sistema cria uma vez só).
Colunas novas: `usuarios.pessoa_id`, `pessoa_ministerio.lider`, `pastoral_casos.responsavel_pessoa_id` e `dt_enviado`.

Exemplos em [`sql/02_consultas_exemplo.sql`](sql/02_consultas_exemplo.sql). Convenção: `cd_status` 1 = ativo, 0 = inativo. As fotos ficam em `pessoas_foto` (separadas, para o `SELECT *` em `pessoas` continuar leve).

## Rodar no computador (opcional)
```
npm install
copy api\local.settings.example.json api\local.settings.json   (e preencha)
npm run dev
```
Abra <http://localhost:4280>.

## Cuidados
- **Créditos do Netlify (plano grátis: 300 por mês):** cada publicação do site gasta 15 créditos; o uso do dia a dia (acessos e a API) gasta pouco. Se acabar, o Netlify **pausa o site** até o próximo ciclo (não cobra nada). Por isso as mudanças são juntadas e publicadas de uma vez só (o trabalho fica no ramo `desenvolvimento` e só vai para o `main` quando for publicar).
- **Backup:** o plano grátis não garante backup. De vez em quando, faça um backup pelo painel do MonsterASP ou baixe a planilha (.xlsx) pela tela Pessoas.
- **Limites grátis:** 1 GB de banco (as fotos são reduzidas para ~60 KB, então cabem milhares) e a cota mensal do Netlify, muito acima do uso de um grupo de jovens.
- **LGPD:** são dados pessoais de jovens, alguns menores. Cadastre só o necessário e libere acesso só a quem serve.

---

© Arthur Ramon da Silva. Todos os direitos reservados. Proibida a cópia, distribuição ou uso sem autorização do autor. Veja [LICENSE](LICENSE).
