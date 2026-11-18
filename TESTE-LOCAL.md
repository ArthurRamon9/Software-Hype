# Testar o Gestão do Hype no seu computador

Roda o site inteiro no seu PC pelo VS Code. Não usa o Netlify e não gasta crédito.

## Jeito combinado: apontando para o banco oficial (MonsterASP)
O site de teste usa **o mesmo banco do site oficial**: tudo o que for feito no teste vale de verdade.

### Antes de testar uma versão nova: atualizar o banco
No SSMS, conectado ao banco oficial, rode o **`sql/01_estrutura.sql`** que veio no zip.
Ele só acrescenta tabelas e colunas: o site que está no ar continua funcionando normalmente
(isso foi testado antes de mandar o zip). Pode rodar de novo quantas vezes quiser.

### Preparar (uma vez)
1. Instale o **Node.js 20 ou mais novo** (LTS) em https://nodejs.org (no terminal, `node -v` mostra a versão).
2. Abra a pasta **Software-Hype** no VS Code.
3. Abra `api/local.settings.json` e troque `COLE_AQUI_A_SENHA` pela senha do usuário `db80753_hypesite`
   (a mesma que está no Netlify em `SQL_CONNECTION_STRING`). É a única coisa a preencher.
4. Terminal do VS Code (**Ctrl + '**):
   ```
   npm install
   npm run dev
   ```
5. Abra **http://localhost:4280** e entre com a sua conta de sempre.

### Cuidados (o teste mexe nos dados reais)
- **Antes de cada rodada de teste, faça backup:** no SSMS, botão direito no banco → Tarefas →
  Gerar Scripts → Avançado → "Tipos de dados para script": **Esquema e dados**.
- Pessoas de teste com nome começando com **Zz Teste** (ex.: "Zz Teste Visitante").
- Chamada de teste sempre na data **03/01/2020**, nunca numa sexta de verdade.
- Contas de teste com e-mail terminando em **@teste.com** (ex.: `bia@teste.com`). Libere em Acessos.
- Não exclua em massa nem conclua acompanhamentos reais só para testar.
- **Terminou?** Rode `sql/99_limpar_testes.sql` no SSMS: primeiro como está (só mostra o que vai
  apagar); conferiu, troque `@apagar` para 1 e rode de novo.
- Versão nova do site: rode o `sql/01_estrutura.sql` que vier com ela (só acrescenta, não quebra o site no ar).

**E-mails:** no teste o Gmail não está ligado. O "Esqueci minha senha" mostra o link no **terminal do
VS Code** (linha `[email] Link do e-mail: ...`).

---

## Outro jeito: banco de teste no seu PC (SQL Server Express)
Use se um dia quiser testar sem tocar nos dados reais. Precisa do SQL Server 2022 Express instalado.

### Preparar (banco no seu PC)

#### 1. Programas
- **Node.js 20 ou mais novo** (LTS): https://nodejs.org (no terminal, `node -v` mostra a versão).
- **VS Code** e **SSMS**, que você já usa.
- **SQL Server no seu PC** (o que você já tiver: Express, Developer...).

#### 2. Liberar o SQL Server para o site conectar (só se ainda não estiver assim)
O site entra com usuário e senha do SQL Server (não com o login do Windows) e pela rede (TCP).
1. No SSMS: clique com o botão direito no servidor → **Properties → Security** →
   marque **SQL Server and Windows Authentication mode** → OK.
2. Abra o **SQL Server Configuration Manager** → *SQL Server Network Configuration* →
   *Protocols for SQLEXPRESS* (ou MSSQLSERVER) → **TCP/IP: Enabled**.
   Em TCP/IP → *IP Addresses* → lá embaixo em **IPAll**: apague *TCP Dynamic Ports* e coloque
   **TCP Port = 1433**.
3. Em *SQL Server Services*, reinicie o **SQL Server**.

#### 3. Criar o banco de teste
No SSMS, conectado ao SQL Server **do seu PC**:
1. Rode `sql/00_banco_de_teste.sql` (cria o banco `hype_teste` e o login `hype_teste`).
2. Selecione o banco **hype_teste** e rode `sql/01_estrutura.sql`.
3. Para ter dados, peça ao Claude o script com os dados da planilha (não vem no zip).

#### 4. Abrir no VS Code
1. Abra a pasta **Software-Hype** no VS Code.
2. Em `api/local.settings.json`, troque a `SQL_CONNECTION_STRING` por
   `Server=localhost,1433;Initial Catalog=hype_teste;User ID=hype_teste;Password=Teste#Hype2026;Encrypt=True;TrustServerCertificate=True;`
   (a senha tem que ser a mesma do arquivo 00).
3. Abra o terminal (**Ctrl + '**) e rode:
   ```
   npm install
   npm run dev
   ```
4. Abra **http://localhost:4280** no navegador.

#### 5. Primeiro acesso
Clique em **Criar conta** com o seu e-mail (o mesmo do `ADMIN_EMAIL`): entra como administrador.
Para testar outros grupos, crie contas com e-mails inventados (ex.: `bia@teste.com`) e libere em
Acessos. Use uma janela anônima para cada usuário ao mesmo tempo.

**E-mails:** no teste o Gmail não está ligado. O "Esqueci minha senha" e os convites mostram o link
no **terminal do VS Code** (linha `[email] Link do e-mail: ...`).

## Testar no celular
1. Celular e PC no **mesmo Wi-Fi**.
2. No PC, abra o terminal e rode `ipconfig`. Anote o **IPv4** (ex.: `192.168.0.15`).
3. No celular, abra `http://192.168.0.15:4280` (com o seu número).
4. Se o Windows perguntar sobre o firewall do Node.js, clique em **Permitir** (rede privada).

## Quando chegar uma versão nova
1. Feche o site no terminal (**Ctrl + C**).
2. Substitua a pasta pela do zip novo, **mas guarde o seu `api/local.settings.json`** e coloque de volta.
3. Rode `sql/01_estrutura.sql` de novo no hype_teste (ele só acrescenta o que falta).
4. `npm install` e `npm run dev`.

Quer recomeçar do zero? No fim do arquivo 00 tem o comando que apaga só o banco de teste.

## Se der erro
| Mensagem no terminal ou na tela | O que fazer |
|---|---|
| `node` não é reconhecido | Instale o Node.js e abra o VS Code de novo. |
| `Login failed for user 'hype_teste'` | Senha diferente entre o arquivo 00 e o `local.settings.json`, ou o passo 2.1 (modo de autenticação) não foi feito. |
| `Failed to connect to localhost:1433` / `ECONNREFUSED` | Passo 2.2 e 2.3 (TCP/IP na porta 1433 e reiniciar o SQL Server). |
| `EADDRINUSE` | O site já está rodando em outro terminal. Feche o outro ou use `set PORT=4281` antes do `npm run dev`. |
| Celular não abre | Mesmo Wi-Fi? Firewall liberado? Use o IPv4 do `ipconfig`, com `:4280` no fim. |
