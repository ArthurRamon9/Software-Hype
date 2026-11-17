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

O site nunca fala direto com o banco. Quem fala é a API, que confere o login, as permissões e guarda as senhas criptografadas (bcrypt).

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
4. Conecte pelo SSMS ou Azure Data Studio (servidor `hype-sql.database.windows.net`, login SQL) e rode **`sql/01_estrutura.sql`**.
5. Em **Cadeias de conexão** → **ADO.NET**, copie a string (troque `{your_password}` pela senha).

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
| `SQL_CONNECTION_STRING` | a string do passo 1.5 |
| `JWT_SECRET` | uma frase longa e aleatória (mín. 24 caracteres) |
| `SMTP_USER` | o Gmail |
| `SMTP_PASS` | a senha de app |
| `SITE_URL` | o endereço do site, ex. `https://xxxx.azurestaticapps.net/` |

### 4. Primeiro acesso
Abra o site e clique em **Criar conta**. **A primeira conta vira administrador automaticamente.** As próximas ficam aguardando liberação em **Acessos**, e os administradores recebem um e-mail avisando.

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
