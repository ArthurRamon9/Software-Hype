# Pendências para a próxima publicação

Combinado com o Arthur: **nada vai para o `main` (que publica no Netlify) até ele mandar a arte do Hype.**
Aí fazemos a repaginação do visual + tudo desta lista e publicamos **uma vez só** (15 créditos).
Enquanto isso, o trabalho fica no ramo `desenvolvimento`.

## Como vai ser a publicação (combinado)
- É a **última publicação deste ciclo** (até 16/12): tem que sair bonita e funcionando de primeira.
- Antes de publicar: mandar ao Arthur **prints de como vai ficar** (computador e celular, claro e escuro,
  telas principais) e esperar a aprovação. Só publicar depois do "pode".
- Testar tudo antes (fluxos, permissões, ataques, celular) e mandar junto o `01_estrutura.sql`, se mudou.
- Upgrades maiores ficam para os próximos meses, um pacote por vez.

## A fazer

### PRIORIDADE MÁXIMA — chamada com duas pessoas ao mesmo tempo apaga marcações
Simulado em 18/11: a Bia marcou 20 num celular, outra pessoa marcou 15 em outro; ficaram só 15.
Causa: `POST /presenca` faz `DELETE` de todas as presenças da data e grava só o que veio daquele celular.
- Salvar **mesclando**: gravar/atualizar só as pessoas que aquele celular marcou ou mudou; desmarcar
  (tirar a marcação) vai como remoção explícita daquela pessoa. Nunca apagar a chamada inteira ao salvar.
- "Restantes como falta" manda as faltas como automáticas: o servidor só grava a falta se ninguém tiver
  marcado aquela pessoa ainda (não sobrescreve um "veio" marcado em outro celular).
- Ao salvar, recarregar a chamada com o que está no servidor (marcações dos outros aparecem) e atualizar o
  texto do topo (hoje continua "Chamada ainda não feita nesta data" depois de salvar) e o botão de apagar.
- Tema só é alterado se veio preenchido/alterado (não apagar o tema que outra pessoa escreveu).
- Não deixar salvar chamada em data futura (hoje aceita, ex.: 27/11 salvo antes do dia).
- Teste obrigatório: duas sessões marcando pessoas diferentes + "restantes como falta" em uma delas.

### Chamada no celular (simulação da Bia, grupo Presença)
- Fluxo da porta: digitar 2–3 letras, tocar ✓, a busca limpa sozinha e o cursor volta para a busca.
  Hoje a busca fica preenchida e é preciso apagar à mão a cada pessoa.
- Topo mais compacto no celular para caber mais nomes (hoje só ~2 nomes aparecem acima da barra de
  salvar): data e contadores numa linha só, "Tema da noite" recolhido num botão "+ Tema da noite".
- Opção "Esconder quem já foi marcado" para ver só quem falta.

### Pastoral (simulação: Arthur distribuindo e Mayck da equipe)
- **Designar vários de uma vez** na lista "Sem acompanhamento" (hoje são 35 e é um por um): caixinhas
  + "Designar para…" escolhendo da lista do ministério (item 1).
- Para a equipe (junto com o item 5):
  - Início mostra "Seus acompanhamentos (N)" com a lista dos casos atribuídos a ele.
  - O número no menu "Pastoral" conta só os casos dele (hoje mostra 62, de todos).
  - Equipe **não designa nem troca responsável** (hoje o Mayck vê "Designar" e "trocar"): permissão nova
    `pastoral.designar` / `integracao.designar` só para quem distribui.
  - No celular, acompanhamentos em **cartões** (nome, há quanto tempo não vem, botões WhatsApp e
    "Registrar contato"), em vez da tabela larga com rolagem lateral; filtros recolhidos num botão.

### Acessos: depois de liberar, a lista não atualiza (relatado pelo Arthur com a 1ª usuária real)
- No site publicado, depois de "Liberar acesso" a pessoa continuou em "Aguardando liberação" com o botão
  "Analisar" até dar F5. Aqui no teste local atualiza; a recarga da lista acontece em silêncio (sem
  indicador) e, se demorar (banco grátis "acordando") ou falhar, a tela fica parada sem avisar.
- Corrigir: assim que o servidor confirmar, **atualizar a tela na hora** (tirar a pessoa de "Aguardando" e
  pôr na tabela com os grupos escolhidos) sem depender da segunda busca; depois recarregar em segundo plano
  com indicador; se a recarga falhar, mostrar aviso com "Tentar de novo". Vale para liberar, bloquear,
  recusar, mudar grupos e salvar grupo. Revisar o mesmo padrão nas outras telas que recarregam depois de
  salvar (Pastoral, Integração, Ministérios, Presença).

### Padrão de escrita: toda frase começa com letra maiúscula
- O Arthur não quer textos começando com minúscula (ex.: "inclui contas bloqueadas", "últimos 12
  encontros", "nenhum", "visitantes dos últimos 30 dias", "2+ faltas seguidas", "opcional · é salvo junto
  com a chamada", "nunca", "hoje", "definir/trocar"). Passar o site inteiro (subtítulos de painéis, dicas,
  etiquetas, mensagens, e-mails) e padronizar: primeira letra maiúscula, o resto normal.
- "Aguardando liberação · inclui contas bloqueadas": trocar por algo claro, ex.: subtítulo "Contas novas e
  contas bloqueadas" (a lista mostra as duas: quem acabou de criar conta e quem foi bloqueado).

### Teste por grupo (feito em 18/11) — ajustes
- Servidor: os 7 grupos conseguem exatamente o que as permissões dizem (matriz de 15 ações, sem divergência).
- Telas: nenhum erro e nenhum botão aparecendo para quem não pode usar.
- Ajustar:
  - Descrição do grupo **Líderes de equipe** diz "vê chamada", mas eles não abrem a tela de Presença (veem
    a presença pelos Relatórios). Ou corrigir a descrição, ou dar uma visão só de leitura da chamada.
  - Quem abre um endereço de tela sem permissão (ex.: link da Pastoral enviado para alguém da Presença)
    volta para o Início sem explicação: mostrar "Você não tem acesso a esta tela".
  - Ministérios aparece no menu de todos (só leitura para quem não edita). Ok manter, mas sem a palavra
    "Editar" no subtítulo para quem não pode editar.

### "Ver como" outro usuário (no lugar da senha padrão — aguardando OK do Arthur)
- O Arthur pediu uma senha padrão (salva no banco, alterável) para entrar na conta dos outros.
  Proposto em vez disso: em Acessos → Usuários, botão **"Ver o sistema como Fulano"** só para
  Administradores. Abre a sessão como aquela pessoa com uma faixa fixa "Você está vendo como Mayck ·
  Voltar para a minha conta". Tudo o que for feito fica no registro como "Arthur (como Mayck)".
  Não usa senha de ninguém. Não permite "ver como" outro administrador.

1. **Responsável escolhido numa lista, não digitado.** No lugar do campo de texto, uma lista para
   selecionar só quem está no **ministério Pastoral do cadastro** (na Integração, quem está no
   ministério Integração). Não depende de login: a equipe só é avisada, quem designa é o Arthur.
   O filtro de responsável usa a mesma lista. Vale para "Designar", "trocar" dentro do caso e
   "Definir responsável" em massa.
   - Guardar no caso o vínculo com a pessoa do cadastro (coluna nova, ex.: `responsavel_pessoa_id`,
     via `01_estrutura.sql`) para saber o telefone do responsável. Ao trocar, manter os casos antigos
     que só têm o nome (ligar pelo nome quando bater).
2. **Botão "Enviar para o responsável" (WhatsApp).** Ao selecionar um caso com responsável, abrir o
   WhatsApp do responsável (telefone dele no cadastro) com a mensagem pronta:

       Olá, {primeiro nome do responsável}! Temos uma pessoa precisando da sua atenção:

       Nome: {nome da pessoa}
       Telefone: {telefone, se tiver}
       Instagram: {@instagram, se tiver}
       Não vem há: {tempo da grade, ex.: 6 Hypes}

       Conto contigo para isso!

   - Linhas de telefone/Instagram só aparecem se existirem.
   - Botão só habilitado se a pessoa tiver telefone **ou** Instagram (senão o responsável não tem
     como falar com ela) e se o responsável tiver telefone no cadastro. Quando desabilitado, dizer
     o motivo (ex.: "Mayck não tem telefone no cadastro").
   - Disponível dentro do caso e na barra quando 1 caso estiver selecionado. Pensar também em
     vários casos do mesmo responsável numa mensagem só.
   - **Combinado com o Arthur:**
     - Ao clicar, registrar sozinho no histórico do caso "Enviado para {responsável} em {data}" e
       passar a situação de Aberto para Em andamento (evita mandar duas vezes).
     - A mensagem leva **só** nome, telefone, Instagram e há quanto tempo não vem. Nada das
       anotações/retornos da Pastoral (LGPD; WhatsApp é fácil de encaminhar).
     - Destacar na grade os casos enviados há mais de 7 dias sem nenhum contato registrado depois
       do envio ("cobrar o responsável").
3. **Clicar no logo leva para o Início.** Hoje o logo "Gestão do Hype" (barra lateral no computador e
   topo no celular) não faz nada; virar link para `#/`.
4. **Ligar o usuário (login) à pessoa do cadastro.** Coluna nova `usuarios.pessoa_id` (via `01_estrutura.sql`).
   - Ao liberar/abrir uma conta em Acessos → Usuários: se existir no cadastro uma pessoa com **o mesmo
     e-mail**, sugerir "Esta conta parece ser da X (mesmo e-mail). Ligar?" e o admin confirma.
     Se não houver, o admin escolhe a pessoa ali mesmo (busca por nome) ou deixa sem vínculo.
   - Nunca mostrar a lista do cadastro na tela pública de "Criar conta" (expõe dados de jovens) e
     nunca ligar sozinho: o site não verifica se o e-mail é da pessoa.
   - Depois de ligado: foto do cadastro no avatar (menu e topo do celular) e em **Minha conta**, e nome
     igual nos dois lugares.
5. **Cada um vê só os acompanhamentos atribuídos a ele (Pastoral e Integração).**
   - Permissões novas `pastoral.ver_todos` e `integracao.ver_todos` (Administradores e Líderes de equipe
     por padrão). Quem só tem `pastoral.ver`/`integracao.ver` vê **apenas os casos em que é o
     responsável** (responsável = pessoa ligada ao seu login, item 4 + item 1).
   - Regra aplicada **na API** (lista, abrir caso, registrar contato, ficha da pessoa, contador do menu),
     não só escondida na tela.
   - A lista "Sem acompanhamento"/"Esperando contato" (casos ainda sem responsável) só aparece para
     quem vê todos e pode designar (o Arthur designa).
   - Conta sem vínculo com o cadastro: mostrar "Sua conta ainda não está ligada ao seu cadastro. Peça
     a um administrador." em vez de lista vazia sem explicação.
   - **Decidido:** Pastoral e Integração continuam vendo o cadastro de pessoas (`pessoas.ver`), mas cada
     grupo só vê a sua área: Pastoral não vê Integração e vice-versa (já é assim hoje pelas permissões;
     conferir de novo, inclusive na ficha da pessoa, que só mostra os acompanhamentos da área de quem
     está vendo, e dentro da área só os casos atribuídos a ele).
6. **Janela de grupos do usuário (Acessos → Usuários → abrir alguém) está bagunçada.**
   - As caixinhas ficam de tamanhos diferentes quando a descrição quebra linha (a caixinha encolhe);
     nome e descrição na mesma linha quebram feio. Fazer cada grupo como uma linha: caixinha de tamanho
     fixo, nome em negrito em cima e descrição menor embaixo (mesmo padrão na janela do grupo, nas
     permissões e na lista "Quem está no grupo").
   - Quando "Administradores" estiver marcado, os outros grupos não mudam nada (admin já pode tudo):
     deixar os outros apagados/desabilitados com a nota "Administradores já pode tudo", para não
     marcar 5 caixinhas à toa.
   - **Mesma coisa na janela "Analisar" de quem está aguardando liberação** (é a mesma lista de grupos:
     a caixinha encolhe em Administração e Líderes de equipe). Conferir as duas janelas depois de arrumar.
   - Na tabela de Usuários, quem é Administrador mostra só a etiqueta "Administradores" (os outros grupos
     em cinza/recolhidos, ex.: "+6"), para a linha não virar uma fila de etiquetas.
7. **Grupos iniciais: não recriar o que o Arthur apagou.** Ele vai excluir Cadastro e Presença pela tela
   (a Administração já cobre os dois). Hoje o `01_estrutura.sql` recria grupo inicial que estiver faltando
   (`WHERE NOT EXISTS` pelo nome). Tirar Cadastro e Presença da lista de grupos iniciais e fazer a criação
   dos grupos iniciais acontecer **uma vez só** por grupo (ex.: tabela de marcação do que já foi semeado),
   para nenhum grupo apagado voltar ao rodar o 01 de novo. Grupos finais: Administradores, Administração,
   Pastoral, Integração, Líderes de equipe.
8. **Tema claro e escuro**, escolhido em **Minha conta**: Claro / Escuro / Automático (segue o celular).
   Guardar a escolha no navegador (não precisa de banco). Fazer junto com a repaginação: as cores todas
   em variáveis, e os gráficos (Chart.js) também trocando de cor. Conferir contraste no escuro.
9. **Repaginação do visual com a arte do Hype** (logo e cores) — quando o Arthur mandar.

## Já feito no `desenvolvimento`, esperando publicar
- (nada ainda)

## Próximos pacotes (depois desta publicação)

### Agenda de reuniões por ministério (ideia da Érika, aprovada pelo Arthur em 18/11)
- Aba **Agenda**. O líder de cada ministério cria a reunião (título, data/hora, local, descrição) e escolhe
  os membros do ministério que participam (por padrão, todos do ministério).
- Cada um vê só as reuniões dos ministérios em que está (depende do vínculo login ↔ cadastro).
- Precisa marcar quem é **líder de cada ministério** (no cadastro do ministério: líder(es)).
- Google Agenda, sem custo e sem cartão:
  1. **Convite por e-mail** com arquivo de agenda (.ics) pelo Gmail que o site já usa: chega como convite
     no Google Agenda/iPhone/Outlook de quem tem e-mail no cadastro, com Sim/Não/Talvez. Mudou o horário
     ou cancelou → manda a atualização e o evento muda sozinho na agenda da pessoa.
  2. Botão **"Adicionar ao Google Agenda"** em cada reunião (link pronto, sem API).
  - Não usar a API do Google Agenda agora (exige projeto no Google Cloud e login OAuth); só se um dia
    precisar ler as respostas Sim/Não dentro do site.
- Cuidados: e-mails faltando/errados no cadastro (mostrar quem não vai receber), limite do Gmail
  (~500 e-mails/dia, sobra), LGPD (só e-mail de quem participa do ministério).

### Escalas das sextas por ministério (ideia do Arthur em 18/11) — junto com a Agenda
- Aba **Escalas**. Hoje quem precisa: **Mídias** e **Diaconato** (fazem por planilha/WhatsApp).
- O líder do ministério monta a escala do mês: sextas nas colunas × **funções** do ministério nas linhas
  (ex.: Mídias: projeção, som, câmera, fotos; Diaconato: porta, recepção…), escolhendo membros do ministério.
  Funções de cada ministério cadastráveis pelo líder.
- Cada membro vê "Minhas escalas" (próximas sextas em que serve). Opcional depois: marcar "não posso nesta
  sexta" para o líder ver antes de montar; pedido de troca.
- Avisos: texto pronto da escala para colar no grupo do WhatsApp do ministério + exportar .xlsx/imprimir.
  Convite no Google Agenda para cada escalado (mesmo esquema .ics da Agenda).
- Alerta se a mesma pessoa estiver escalada em dois ministérios na mesma sexta.
- Base em comum com a Agenda: líder por ministério, membros do ministério, vínculo login ↔ cadastro.
