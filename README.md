# Gestão do Hype

Sistema interno do grupo de jovens **Hype**: cadastro de pessoas com foto, chamada das sextas, ministérios, acompanhamento pastoral de quem está faltando e relatórios por semana, mês e ano.

© Arthur Ramon da Silva. Todos os direitos reservados. Responsável pelo sistema e pelos dados: **Arthur Ramon da Silva**.

---

## Como é montado (tudo no plano gratuito)

| Parte | Serviço |
|---|---|
| Banco de dados | **Azure SQL Database** (SQL Server), oferta gratuita: 32 GB e 100.000 segundos de vCore por mês, sem prazo |
| Site + API | **Azure Static Web Apps**, plano Free (o site e as funções da pasta `api/`) |
| E-mail de "esqueci a senha" | Gmail com senha de app |

```
navegador  →  site (HTML/CSS/JS)  →  /api (Node.js)  →  SQL Server
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
| Pastoral | ver pessoas, ver e registrar acompanhamentos, ver relatórios |
| Presença | ver pessoas, fazer a chamada (e cadastrar visitante novo nela) |
| Cadastro | ver, cadastrar e editar pessoas |

Permissões existentes: `pessoas.ver`, `pessoas.editar`, `pessoas.excluir`, `presenca.marcar`, `presenca.excluir`, `pastoral.ver`, `pastoral.editar`, `pastoral.excluir`, `relatorios.ver`, `ministerios.editar`, `acessos.gerenciar`. A tabela de qual rota exige qual permissão fica no topo de `api/src/rotas.js`.

---

## Instalação

### 1. Criar o banco (Azure SQL Database grátis)
1. Crie uma conta em <https://azure.microsoft.com/free>. A Microsoft pede um cartão só para confirmar identidade.
2. No portal (<https://portal.azure.com>), procure **Azure SQL Database** → **Criar**. Na tela aparece a faixa **"Aplicar oferta gratuita"**: clique nela.
   - Grupo de recursos: `hype`
   - Nome do banco: `hype`
   - Servidor: **Criar novo** → nome ex. `hype-sql` · região **Brazil South** · autenticação **SQL** · crie um login (ex. `hypeadmin`) e senha. **Guarde.**
   - **Comportamento ao atingir o limite grátis: "Pausar o banco até o próximo mês"**. Assim nunca há cobrança.
3. Depois de criado: **Rede** (Networking) do servidor → marque **"Permitir que serviços e recursos do Azure acessem este servidor"** e **"Adicionar seu IP atual"** → Salvar.
4. Conecte pelo SSMS (servidor `hype-sql.database.windows.net`, login SQL), **escolha o banco `hype`** e rode **`sql/01_estrutura.sql`**.
5. Ainda no banco `hype`, abra **`sql/03_usuario_da_aplicacao.sql`**, troque a senha de exemplo por uma forte e rode. Esse é o usuário restrito que o site vai usar.
6. Em **Cadeias de conexão** → **ADO.NET**, copie a string e troque o `User ID` por `hype_app` e a senha pela do passo 5. **O site nunca usa o login de administrador do servidor.**

### 2. Senha de app do Gmail
1. Use um Gmail do ministério (ex.: `gestaohype@gmail.com`) e ative a **verificação em duas etapas**.
2. Crie uma senha de app em <https://myaccount.google.com/apppasswords> e copie as 16 letras.

### 3. Publicar o site (Azure Static Web Apps)
1. No portal: **Static Web Apps** → **Criar** → plano **Free** → origem **GitHub** → repositório `Software-Hype`, branch `main`.
2. Detalhes do build: predefinição **Custom** · App location `/` · Api location `api` · Output location *(vazio)*.
3. Ao criar, o Azure adiciona sozinho um arquivo em `.github/workflows/` e publica. Cada `git push` publica de novo.
4. No Static Web App → **Configurações de ambiente** (Environment variables), adicione:

| Nome | Valor |
|---|---|
| `SQL_CONNECTION_STRING` | a string do passo 1.6 (com o usuário `hype_app`) |
| `JWT_SECRET` | 96 caracteres aleatórios (veja abaixo) |
| `ADMIN_EMAIL` | **o seu e-mail**: só ele pode virar o primeiro administrador |
| `SMTP_USER` | o Gmail |
| `SMTP_PASS` | a senha de app |
| `SITE_URL` | o endereço do site, ex. `https://xxxx.azurestaticapps.net/` |

Para gerar o `JWT_SECRET` (a "chave" que assina as sessões), rode no terminal: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Ou me peça um.

### 4. Primeiro acesso
Abra o site e clique em **Criar conta** usando **o mesmo e-mail do `ADMIN_EMAIL`**: essa conta já entra como administrador. Qualquer outra conta fica aguardando liberação em **Acessos**, onde você escolhe os grupos dela. Os administradores recebem um e-mail a cada pedido novo.

---

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
cd api
npm install
copy local.settings.example.json local.settings.json   (e preencha)
node dev-server.js
```
Abra <http://localhost:4280>.

## Cuidados
- **Banco "dormindo":** no plano grátis o banco pausa após 1 hora sem uso. O primeiro acesso depois disso leva até ~1 minuto. O site avisa "Conectando ao banco" e tenta de novo sozinho.
- **Limite mensal:** 100.000 segundos de vCore por mês. O uso de um grupo de jovens fica bem abaixo disso. Deixar o SSMS aberto e conectado o dia todo impede a pausa e gasta o limite, então feche quando terminar.
- **LGPD:** são dados pessoais de jovens, alguns menores. Cadastre só o necessário e libere acesso só a quem serve.

---

© Arthur Ramon da Silva. Todos os direitos reservados. Proibida a cópia, distribuição ou uso sem autorização do autor. Veja [LICENSE](LICENSE).
