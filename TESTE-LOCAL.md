# Testar o Gestão do Hype no seu computador

Roda o site inteiro no seu PC, ligado a um banco **de teste**. Não usa o Netlify, não gasta crédito
e não mexe nos dados reais. Pode testar e estragar à vontade.

## Uma vez só: preparar

### 1. Programas
- **Node.js 20 ou mais novo** (LTS): https://nodejs.org (no terminal, `node -v` mostra a versão).
- **VS Code** e **SSMS**, que você já usa.
- **SQL Server no seu PC** (o que você já tiver: Express, Developer...).

### 2. Liberar o SQL Server para o site conectar (só se ainda não estiver assim)
O site entra com usuário e senha do SQL Server (não com o login do Windows) e pela rede (TCP).
1. No SSMS: clique com o botão direito no servidor → **Properties → Security** →
   marque **SQL Server and Windows Authentication mode** → OK.
2. Abra o **SQL Server Configuration Manager** → *SQL Server Network Configuration* →
   *Protocols for SQLEXPRESS* (ou MSSQLSERVER) → **TCP/IP: Enabled**.
   Em TCP/IP → *IP Addresses* → lá embaixo em **IPAll**: apague *TCP Dynamic Ports* e coloque
   **TCP Port = 1433**.
3. Em *SQL Server Services*, reinicie o **SQL Server**.

### 3. Criar o banco de teste
No SSMS, conectado ao SQL Server **do seu PC**:
1. Rode `sql/00_banco_de_teste.sql` (cria o banco `hype_teste` e o login `hype_teste`).
2. Selecione o banco **hype_teste** e rode `sql/01_estrutura.sql`.
3. Ainda no hype_teste, rode `dados-teste/02_migracao_planilha_hype.sql` (os dados da planilha).
   Ele termina mostrando 332 pessoas, 41 encontros, 5881 presenças.

### 4. Abrir no VS Code
1. Abra a pasta **Software-Hype** no VS Code.
2. Confira `api/local.settings.json`: a senha em `SQL_CONNECTION_STRING` tem que ser a mesma do
   arquivo 00 (`Teste#Hype2026`, se você não trocou).
3. Abra o terminal (**Ctrl + '**) e rode:
   ```
   npm install
   npm run dev
   ```
4. Abra **http://localhost:4280** no navegador.

### 5. Primeiro acesso
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
