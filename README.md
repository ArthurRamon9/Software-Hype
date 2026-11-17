# Gestão do Hype

Sistema interno de gestão do grupo de jovens **Hype**: cadastro de pessoas (com foto), presença dos encontros de sexta, ministérios, acompanhamento pastoral de faltantes, dashboard e relatórios semanais, mensais e anuais.

> © Arthur Ramon da Silva. Todos os direitos reservados.
> Responsável pelo sistema e pelos dados: **Arthur Ramon da Silva**.

---

## Tecnologias (todas gratuitas)

| Parte | Serviço | Plano grátis |
|---|---|---|
| Site (hospedagem) | GitHub Pages | Grátis para repositório público |
| Banco de dados | Supabase (PostgreSQL) | 500 MB |
| Login, cadastro, "esqueci a senha" | Supabase Auth | 50 mil usuários/mês |
| Fotos | Supabase Storage (privado) | 1 GB (as fotos são reduzidas para ~60 KB cada) |
| Envio de e-mails | Gmail SMTP (senha de app) | ~500 e-mails/dia |
| Gráficos | Chart.js (já incluso no projeto) | Open source |

Não tem etapa de build: são só HTML, CSS e JavaScript. Basta publicar a pasta.

---

## Passo a passo da instalação

### 1. Criar o banco no Supabase
1. Crie uma conta em <https://supabase.com> (pode entrar com o GitHub).
2. Clique em **New project**:
   - Nome: `gestao-hype`
   - Região: **South America (São Paulo)**
   - Database password: gere uma e **guarde num lugar seguro**.
3. Quando o projeto terminar de criar, abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Deve aparecer "Success".

### 2. Ligar o site ao banco
1. No Supabase, vá em **Project Settings → API** (ou **Data API**).
2. Copie a **Project URL** e a chave **anon public**.
3. Cole as duas em [`js/config.js`](js/config.js).

> A chave *anon* é pública por natureza; quem protege os dados são as regras de segurança (RLS) do `schema.sql`. **Nunca** coloque a chave `service_role` no site.

### 3. Configurar os e-mails ("esqueci a senha" e confirmação de cadastro)
O e-mail padrão do Supabase só envia para a equipe do projeto. Por isso vamos usar um Gmail, de graça:

1. Use (ou crie) um Gmail do ministério, ex.: `gestaohype@gmail.com`.
2. Ative a **Verificação em duas etapas** em <https://myaccount.google.com/security>.
3. Crie uma **Senha de app** em <https://myaccount.google.com/apppasswords> (nome: "Supabase"). Copie a senha de 16 letras.
4. No Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email: o Gmail
   - Sender name: `Gestão do Hype`
   - Host: `smtp.gmail.com` · Port: `465`
   - Username: o Gmail · Password: a senha de app
5. Em **Authentication → Emails → Templates**, cole os modelos em português:
   - **Reset Password** → assunto `Redefinir sua senha — Gestão do Hype`, corpo: [`supabase/email-templates/redefinir-senha.html`](supabase/email-templates/redefinir-senha.html)
   - **Confirm signup** → assunto `Confirme seu e-mail — Gestão do Hype`, corpo: [`supabase/email-templates/confirmar-cadastro.html`](supabase/email-templates/confirmar-cadastro.html)
6. Em **Authentication → Rate Limits**, aumente "emails sent per hour" para uns `30`.

### 4. Endereço do site (para os links do e-mail voltarem certo)
Em **Authentication → URL Configuration**:
- **Site URL**: `https://arthurramon9.github.io/Software-Hype/`
- **Redirect URLs**: adicione `https://arthurramon9.github.io/Software-Hype/**`

### 5. Publicar no GitHub Pages
No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
Em 1–2 minutos o site fica em `https://arthurramon9.github.io/Software-Hype/`.

### 6. Primeiro acesso
1. Abra o site e clique em **Criar conta**. **A primeira conta criada vira administrador automaticamente.**
2. As próximas contas ficam "aguardando aprovação" até um administrador liberar em **Acessos**.

---

## Como funciona

- **Pessoas**: cadastro completo (foto opcional, idade calculada pela data de nascimento, tipo membro/visitante/frequentador, ministérios, batismo, observações). `cd_status`: 1 = ativo, 0 = inativo.
- **Presença**: escolha a sexta, marque Presente/Falta (com justificativa), cadastre visitante novo na hora. Botões "Todos presentes" e "Não marcados = falta" agilizam.
- **Pastoral**: quem tem **2 ou mais faltas seguidas** (ajuste em `FALTAS_ALERTA` no `config.js`) aparece em alerta. Designe um pastor/líder responsável e registre cada contato (Aberto → Em andamento → Concluído).
- **Relatórios**: semanal (presentes e faltantes do encontro), mensal (frequência de cada pessoa, comparação com o mês anterior) e anual (média mensal comparada com o ano anterior). Exporta CSV (abre no Excel) e imprime/salva em PDF.
- **Acessos** (admin): aprovar, bloquear e definir papel (Administrador, Líder, Servo).

## Cuidados

- **Plano grátis do Supabase pausa o projeto após 7 dias sem uso.** O uso semanal já evita isso, e o workflow [`.github/workflows/manter-ativo.yml`](.github/workflows/manter-ativo.yml) faz uma consulta automática a cada 3 dias.
- O plano grátis **não tem backup automático**: exporte as pessoas em CSV de vez em quando.
- **LGPD**: o sistema guarda dados pessoais de jovens (alguns menores de idade). Cadastre apenas o necessário, com ciência da pessoa/responsável, e libere acesso só a quem serve no ministério.

## Estrutura

```
index.html                 página única (SPA)
assets/css/style.css       visual (responsivo)
assets/vendor/             Chart.js
js/config.js               configuração (URL e chave do Supabase)
js/app.js                  rotas, menu e layout
js/pages/*.js              telas
supabase/schema.sql        tabelas, segurança e fotos
supabase/email-templates/  e-mails em português
```

---

© Arthur Ramon da Silva. Todos os direitos reservados. É proibida a cópia, distribuição ou uso deste sistema sem autorização do autor. Veja [LICENSE](LICENSE).
