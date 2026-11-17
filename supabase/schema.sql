-- =====================================================================
--  GESTÃO DO HYPE — Estrutura do banco de dados (Supabase / PostgreSQL)
--  © Arthur Ramon da Silva — Todos os direitos reservados.
--
--  COMO USAR: no painel do Supabase, abra "SQL Editor" > "New query",
--  cole TODO este arquivo e clique em "Run". Pode rodar de novo sem medo:
--  o script é idempotente (não apaga dados existentes).
--
--  Convenção: cd_status  1 = ativo   0 = inativo
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFIS DE ACESSO (quem faz login no sistema = quem serve no ministério)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default '',
  email       text not null default '',
  papel       text not null default 'servo' check (papel in ('admin','lider','servo')),
  cd_status   smallint not null default 0 check (cd_status in (0,1)), -- 0 = aguardando aprovação/bloqueado
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. MINISTÉRIOS (louvor, mídia, recepção, pastoral...)
-- ---------------------------------------------------------------------
create table if not exists public.ministerios (
  id          bigint generated always as identity primary key,
  nome        text not null unique,
  descricao   text,
  cor         text default '#6d4aff',
  cd_status   smallint not null default 1 check (cd_status in (0,1)),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. PESSOAS (todos os jovens do Hype — membros e visitantes)
-- ---------------------------------------------------------------------
create table if not exists public.pessoas (
  id               bigint generated always as identity primary key,
  nome             text not null,
  data_nascimento  date,
  sexo             text check (sexo in ('M','F')),
  telefone         text,
  email            text,
  instagram        text,
  endereco         text,
  tipo             text not null default 'visitante'
                   check (tipo in ('membro','visitante','frequentador')),
  batizado         boolean not null default false,
  como_conheceu    text,
  observacoes      text,
  foto_path        text,            -- caminho da foto no Storage (bucket "fotos")
  data_cadastro    date not null default current_date,
  cd_status        smallint not null default 1 check (cd_status in (0,1)),
  created_by       uuid references auth.users(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists pessoas_nome_idx   on public.pessoas (lower(nome));
create index if not exists pessoas_status_idx on public.pessoas (cd_status);

-- Em quais ministérios a pessoa serve (N:N)
create table if not exists public.pessoa_ministerio (
  pessoa_id     bigint not null references public.pessoas(id) on delete cascade,
  ministerio_id bigint not null references public.ministerios(id) on delete cascade,
  primary key (pessoa_id, ministerio_id)
);

-- ---------------------------------------------------------------------
-- 4. ENCONTROS (cultos de sexta) e PRESENÇAS
-- ---------------------------------------------------------------------
create table if not exists public.encontros (
  id          bigint generated always as identity primary key,
  data        date not null unique,
  tema        text,
  observacoes text,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.presencas (
  encontro_id   bigint not null references public.encontros(id) on delete cascade,
  pessoa_id     bigint not null references public.pessoas(id) on delete cascade,
  presente      boolean not null,
  justificativa text,
  marcado_por   uuid references auth.users(id) on delete set null default auth.uid(),
  marcado_em    timestamptz not null default now(),
  primary key (encontro_id, pessoa_id)
);
create index if not exists presencas_pessoa_idx on public.presencas (pessoa_id);

-- ---------------------------------------------------------------------
-- 5. PASTORAL (acompanhamento / cuidado dos jovens faltantes)
-- ---------------------------------------------------------------------
create table if not exists public.pastoral_casos (
  id               bigint generated always as identity primary key,
  pessoa_id        bigint not null references public.pessoas(id) on delete cascade,
  responsavel_nome text not null,                  -- pastor/líder designado
  responsavel_id   uuid references public.profiles(id) on delete set null,
  motivo           text,
  status           text not null default 'aberto'
                   check (status in ('aberto','em_andamento','concluido')),
  aberto_em        timestamptz not null default now(),
  concluido_em     timestamptz,
  created_by       uuid references auth.users(id) on delete set null default auth.uid()
);
create index if not exists pastoral_status_idx on public.pastoral_casos (status);

create table if not exists public.pastoral_registros (
  id          bigint generated always as identity primary key,
  caso_id     bigint not null references public.pastoral_casos(id) on delete cascade,
  texto       text not null,
  autor_nome  text,
  autor_id    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- FUNÇÕES AUXILIARES
-- =====================================================================

-- Usuário logado está aprovado?
create or replace function public.is_aprovado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and cd_status = 1);
$$;

-- Usuário logado é administrador aprovado?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and cd_status = 1 and papel = 'admin');
$$;

-- Ao criar conta: cria o perfil. O PRIMEIRO usuário vira admin já aprovado.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  primeiro boolean;
begin
  select not exists (select 1 from public.profiles) into primeiro;
  insert into public.profiles (id, nome, email, papel, cd_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    case when primeiro then 'admin' else 'servo' end,
    case when primeiro then 1 else 0 end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impede que um usuário comum se promova (só admin muda papel/status)
create or replace function public.protege_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.papel     := old.papel;
    new.cd_status := old.cd_status;
    new.email     := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protege on public.profiles;
create trigger profiles_protege
  before update on public.profiles
  for each row execute function public.protege_profile();

-- Atualiza updated_at das pessoas
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists pessoas_touch on public.pessoas;
create trigger pessoas_touch before update on public.pessoas
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- SEGURANÇA (Row Level Security)
-- Só usuários APROVADOS enxergam e mexem nos dados. Excluir = só admin.
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.ministerios        enable row level security;
alter table public.pessoas            enable row level security;
alter table public.pessoa_ministerio  enable row level security;
alter table public.encontros          enable row level security;
alter table public.presencas          enable row level security;
alter table public.pastoral_casos     enable row level security;
alter table public.pastoral_registros enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_aprovado());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete
  using (public.is_admin() and id <> auth.uid());

-- Tabelas operacionais: mesmo padrão para todas
do $$
declare t text;
begin
  foreach t in array array['ministerios','pessoas','pessoa_ministerio','encontros',
                           'presencas','pastoral_casos','pastoral_registros']
  loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_aprovado())', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_aprovado())', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_aprovado())', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_admin())', t);
  end loop;
end $$;

-- Exceções: quem marca presença precisa poder desmarcar/remover vínculos
drop policy if exists presencas_delete on public.presencas;
create policy presencas_delete on public.presencas for delete using (public.is_aprovado());
drop policy if exists pessoa_ministerio_delete on public.pessoa_ministerio;
create policy pessoa_ministerio_delete on public.pessoa_ministerio for delete using (public.is_aprovado());

-- =====================================================================
-- FOTOS (Supabase Storage) — bucket PRIVADO "fotos"
-- As fotos só abrem para usuários aprovados (links temporários assinados).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists fotos_select on storage.objects;
create policy fotos_select on storage.objects for select
  using (bucket_id = 'fotos' and public.is_aprovado());
drop policy if exists fotos_insert on storage.objects;
create policy fotos_insert on storage.objects for insert
  with check (bucket_id = 'fotos' and public.is_aprovado());
drop policy if exists fotos_update on storage.objects;
create policy fotos_update on storage.objects for update
  using (bucket_id = 'fotos' and public.is_aprovado());
drop policy if exists fotos_delete on storage.objects;
create policy fotos_delete on storage.objects for delete
  using (bucket_id = 'fotos' and public.is_aprovado());

-- =====================================================================
-- DADOS INICIAIS (ministérios de exemplo — edite pelo sistema depois)
-- =====================================================================
insert into public.ministerios (nome, cor) values
  ('Louvor',    '#6d4aff'),
  ('Mídia',     '#2a78d6'),
  ('Recepção',  '#1baf7a'),
  ('Pastoral',  '#eb6834'),
  ('Intercessão','#e87ba4')
on conflict (nome) do nothing;
