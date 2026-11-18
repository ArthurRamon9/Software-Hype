# Pendências para a próxima publicação

Combinado com o Arthur: **nada vai para o `main` (que publica no Netlify) até ele mandar a arte do Hype.**
Aí fazemos a repaginação do visual + tudo desta lista e publicamos **uma vez só** (15 créditos).
Enquanto isso, o trabalho fica no ramo `desenvolvimento`.

## A fazer
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
4. **Repaginação do visual com a arte do Hype** (logo e cores) — quando o Arthur mandar.

## Já feito no `desenvolvimento`, esperando publicar
- (nada ainda)
