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
Cada usuário pode estar em um ou mais grupos e tem a soma das permissões deles. Grupos que já vêm criados (dá para mudar ou criar outros em **Acessos → Grupos**):

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

## Pastoral e Integração
As duas áreas usam a mesma estrutura (`pastoral_casos` + `pastoral_registros`), separadas pela coluna `area`.
- **Pastoral** alerta quem já faz parte (visitante regular e membros), veio em alguma das últimas 6 sextas e está com 2 ou mais faltas seguidas.
- A lista de acompanhamentos mostra só pessoas ativas, tem lixeira em cada linha e permite marcar várias para concluir ou excluir de uma vez.
- **Integração** lista os visitantes que chegaram nos últimos 60 dias e ainda não tiveram contato, destacando quem chegou há menos de 48 horas.

## Consultas no banco

Além das tabelas, o banco tem views prontas para relatórios próprios:

| View | O que mostra |
|---|---|
| `vw_pessoas` | pessoas com idade calculada e ministérios |
| `vw_presencas` | cada presença/falta com data, nome e tipo |
| `vw_resumo_encontros` | totais por sexta |
| `vw_frequencia_pessoa` | presenças, faltas, % e última presença por pessoa |

Exemplos em [`sql/02_consultas_exemplo.sql`](sql/02_consultas_exemplo.sql). Convenção: `cd_status` 1 = ativo, 0 = inativo. As fotos ficam em `pessoas_foto` (separadas, para o `SELECT *` em `pessoas` continuar leve).

## Rodar no computador (opcional)
```
npm install
copy api\local.settings.example.json api\local.settings.json   (e preencha)
npm run dev
```
Abra <http://localhost:4280>.

## Cuidados
- **Backup:** o plano grátis não garante backup. De vez em quando, faça um backup pelo painel do MonsterASP ou baixe a planilha (.xlsx) pela tela Pessoas.
- **Limites grátis:** 1 GB de banco (as fotos são reduzidas para ~60 KB, então cabem milhares) e a cota mensal do Netlify, muito acima do uso de um grupo de jovens.
- **LGPD:** são dados pessoais de jovens, alguns menores. Cadastre só o necessário e libere acesso só a quem serve.

---

© Arthur Ramon da Silva. Todos os direitos reservados. Proibida a cópia, distribuição ou uso sem autorização do autor. Veja [LICENSE](LICENSE).
