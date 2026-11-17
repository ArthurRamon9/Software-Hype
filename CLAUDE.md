# Regras do projeto — Gestão do Hype

## Direitos e responsabilidade (obrigatório em TODOS os sites do Arthur)
- Todo site/sistema deve informar que os direitos são reservados a **Arthur Ramon da Silva**, responsável pelo site.
- Texto padrão no rodapé: `© <ano> <Nome do site> · Todos os direitos reservados a Arthur Ramon da Silva.`
- Incluir também: `<meta name="author">` e `<meta name="copyright">` no `<head>`, arquivo `LICENSE` (todos os direitos reservados) e o aviso no fim do README.
- Neste projeto o rodapé vem de `copyright()` em `js/ui.js`.

## Preferências
- Idioma da interface e da documentação: português do Brasil.
- Custo zero: priorizar serviços gratuitos (GitHub Pages, Supabase free, Gmail SMTP).
- Sempre responsivo (computador e celular), bonito, simples e funcional.

## Técnica
- Sem build: HTML + CSS + JavaScript (ES modules). Rotas por hash (`#/pessoas`).
- Banco: Supabase. Toda mudança de estrutura vai em `supabase/schema.sql` (idempotente) e precisa manter as regras RLS.
- Convenção de status: `cd_status` 1 = ativo, 0 = inativo.
