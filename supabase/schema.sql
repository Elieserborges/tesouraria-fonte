-- =============================================================
-- Tesouraria Fonte — esquema do banco (Supabase / PostgreSQL)
-- Rode este arquivo no SQL Editor do Supabase.
-- =============================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- Tipos
-- -------------------------------------------------------------
do $$ begin
  create type public.papel_usuario as enum ('admin', 'tesoureiro', 'conselho');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_transacao as enum ('entrada', 'saida');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------
-- Perfis (espelha auth.users e guarda o papel de acesso)
-- -------------------------------------------------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null default '',
  email       text,
  papel       public.papel_usuario not null default 'conselho',
  criado_em   timestamptz not null default now()
);

comment on table public.perfis is 'Perfil de acesso. admin/tesoureiro editam; conselho apenas lê.';

-- Cria o perfil automaticamente quando um usuário é criado no Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers usados nas policies.
-- IMPORTANTE: são `security definer` para NÃO reaplicar o RLS de `perfis`
-- dentro da própria policy de `perfis` (isso causaria recursão infinita).
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel = 'admin'
  );
$$;

-- O usuário atual pode escrever?
create or replace function public.pode_editar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel in ('admin', 'tesoureiro')
  );
$$;

-- -------------------------------------------------------------
-- Contas (uma por conta do Mercado Pago)
-- -------------------------------------------------------------
create table if not exists public.contas (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,           -- usado na URL do webhook
  nome        text not null,
  descricao   text,
  mp_user_id  text,                           -- collector id no Mercado Pago
  cor         text not null default '#3345ED',
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Categorias
-- -------------------------------------------------------------
create table if not exists public.categorias (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  tipo      public.tipo_transacao not null,
  cor       text not null default '#20A979',
  criado_em timestamptz not null default now(),
  unique (nome, tipo)
);

/*
 * Transferência entre contas da própria igreja (ex.: Mercado Pago -> Sicredi)
 * não é receita nem despesa: é o mesmo dinheiro mudando de lugar. Categorias
 * marcadas assim afetam o SALDO de cada conta, mas ficam fora dos totais de
 * entradas/saídas e do gráfico de despesas — senão o mesmo valor apareceria
 * como despesa numa conta e receita na outra.
 */
alter table public.categorias
  add column if not exists eh_transferencia boolean not null default false;

-- -------------------------------------------------------------
-- Transações
-- -------------------------------------------------------------
create table if not exists public.transacoes (
  id             uuid primary key default gen_random_uuid(),
  conta_id       uuid references public.contas (id) on delete set null,
  categoria_id   uuid references public.categorias (id) on delete set null,
  tipo           public.tipo_transacao not null,
  valor          numeric(14, 2) not null check (valor >= 0),
  descricao      text,
  contraparte    text,                        -- quem pagou / quem recebeu
  metodo         text,                        -- pix, credit_card, boleto...
  status         text not null default 'approved',
  ocorrido_em    timestamptz not null default now(),
  origem         text not null default 'manual',   -- manual | mercadopago
  mp_payment_id  text unique,
  payload        jsonb,
  observacao     text,
  criado_por     uuid references auth.users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists transacoes_ocorrido_em_idx on public.transacoes (ocorrido_em desc);
create index if not exists transacoes_conta_idx       on public.transacoes (conta_id);
create index if not exists transacoes_categoria_idx   on public.transacoes (categoria_id);
create index if not exists transacoes_tipo_idx        on public.transacoes (tipo);

create or replace function public.touch_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists transacoes_touch on public.transacoes;
create trigger transacoes_touch
  before update on public.transacoes
  for each row execute function public.touch_atualizado_em();

-- Marca se a categoria veio de uma regra automática. Permite desfazer uma
-- regra sem apagar as classificações feitas à mão.
alter table public.transacoes
  add column if not exists categoria_automatica boolean not null default false;

-- -------------------------------------------------------------
-- Regras de categorização automática
--
-- Ao categorizar uma transação, o sistema guarda a regra
-- "descrição X + tipo Y => categoria Z" e aplica às demais.
-- O padrão é guardado normalizado (minúsculas, sem espaços nas pontas);
-- transação sem descrição vira padrão vazio.
-- -------------------------------------------------------------
create table if not exists public.regras_categoria (
  id            uuid primary key default gen_random_uuid(),
  padrao        text not null,
  tipo          public.tipo_transacao not null,
  categoria_id  uuid not null references public.categorias (id) on delete cascade,
  criado_por    uuid references auth.users (id) on delete set null,
  criado_em     timestamptz not null default now()
);

/*
 * 'exata'  = a descrição inteira é igual ao padrão.
 * 'contem' = o padrão aparece em qualquer parte da descrição.
 *
 * O modo 'contem' existe porque muitas descrições carregam o nome da pessoa
 * no fim ("Inscrição Café com Dança - Isabela Machado"). Sem ele, cada compra
 * viraria uma regra separada e nada seria automatizado.
 */
alter table public.regras_categoria
  add column if not exists modo text not null default 'exata';

alter table public.regras_categoria drop constraint if exists regras_categoria_modo_check;
alter table public.regras_categoria
  add constraint regras_categoria_modo_check check (modo in ('exata', 'contem'));

alter table public.regras_categoria drop constraint if exists regras_categoria_padrao_tipo_key;
create unique index if not exists regras_categoria_unica
  on public.regras_categoria (padrao, tipo, modo);

create index if not exists transacoes_descricao_norm_idx
  on public.transacoes (lower(btrim(coalesce(descricao, ''))));

/*
 * Preenche a categoria das transações que casam com alguma regra.
 * Só toca em transação SEM categoria — nunca sobrescreve escolha manual.
 * Devolve quantas foram classificadas.
 */
create or replace function public.aplicar_regras_categoria()
returns integer
language plpgsql
as $$
declare
  afetadas integer;
begin
  update public.transacoes t
     set categoria_id = r.categoria_id,
         categoria_automatica = true
    from public.regras_categoria r
   where t.categoria_id is null
     and t.tipo = r.tipo
     and (
       (r.modo = 'exata' and lower(btrim(coalesce(t.descricao, ''))) = r.padrao)
       or (r.modo = 'contem' and r.padrao <> ''
           and lower(btrim(coalesce(t.descricao, ''))) like '%' || r.padrao || '%')
     );

  get diagnostics afetadas = row_count;
  return afetadas;
end;
$$;

/*
 * Remove uma regra e, opcionalmente, limpa as categorias que ela aplicou.
 * As classificações feitas à mão (categoria_automatica = false) permanecem.
 */
create or replace function public.remover_regra_categoria(
  regra_id uuid,
  limpar boolean default true
)
returns integer
language plpgsql
as $$
declare
  regra public.regras_categoria%rowtype;
  afetadas integer := 0;
begin
  select * into regra from public.regras_categoria where id = regra_id;
  if not found then
    return 0;
  end if;

  if limpar then
    update public.transacoes t
       set categoria_id = null,
           categoria_automatica = false
     where t.categoria_automatica
       and t.categoria_id = regra.categoria_id
       and t.tipo = regra.tipo
       and (
         (regra.modo = 'exata' and lower(btrim(coalesce(t.descricao, ''))) = regra.padrao)
         or (regra.modo = 'contem' and regra.padrao <> ''
             and lower(btrim(coalesce(t.descricao, ''))) like '%' || regra.padrao || '%')
       );
    get diagnostics afetadas = row_count;
  end if;

  delete from public.regras_categoria where id = regra_id;
  return afetadas;
end;
$$;

-- -------------------------------------------------------------
-- Log de webhooks (auditoria + idempotência)
-- -------------------------------------------------------------
create table if not exists public.webhook_eventos (
  id           uuid primary key default gen_random_uuid(),
  conta_slug   text,
  tipo         text,
  acao         text,
  recurso_id   text,
  status       text not null default 'recebido',  -- recebido | processado | ignorado | erro
  detalhe      text,
  payload      jsonb,
  recebido_em  timestamptz not null default now()
);

create index if not exists webhook_eventos_recurso_idx on public.webhook_eventos (recurso_id);

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.perfis            enable row level security;
alter table public.contas            enable row level security;
alter table public.categorias        enable row level security;
alter table public.transacoes        enable row level security;
alter table public.webhook_eventos   enable row level security;
alter table public.regras_categoria  enable row level security;

-- perfis: cada um lê o próprio; admin lê todos
drop policy if exists "perfis: leitura" on public.perfis;
create policy "perfis: leitura" on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.eh_admin());

drop policy if exists "perfis: admin edita" on public.perfis;
create policy "perfis: admin edita" on public.perfis
  for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- contas / categorias / transacoes: todo autenticado lê, só admin+tesoureiro escreve
do $$
declare t text;
begin
  foreach t in array array['contas', 'categorias', 'transacoes', 'regras_categoria'] loop
    execute format('drop policy if exists "%s: leitura" on public.%I', t, t);
    execute format(
      'create policy "%s: leitura" on public.%I for select to authenticated using (true)', t, t);

    execute format('drop policy if exists "%s: escrita" on public.%I', t, t);
    execute format(
      'create policy "%s: escrita" on public.%I for all to authenticated
         using (public.pode_editar()) with check (public.pode_editar())', t, t);
  end loop;
end $$;

-- webhook_eventos: leitura só para quem edita; escrita só via service role (ignora RLS)
drop policy if exists "webhooks: leitura" on public.webhook_eventos;
create policy "webhooks: leitura" on public.webhook_eventos
  for select to authenticated using (public.pode_editar());

-- =============================================================
-- Views de apoio (security_invoker = respeitam o RLS de quem consulta)
-- =============================================================
create or replace view public.saldo_por_conta
with (security_invoker = on) as
select
  c.id                                                                as conta_id,
  c.nome                                                              as conta_nome,
  c.cor                                                               as conta_cor,
  coalesce(sum(t.valor) filter (where t.tipo = 'entrada'), 0)::numeric as entradas,
  coalesce(sum(t.valor) filter (where t.tipo = 'saida'), 0)::numeric   as saidas,
  coalesce(sum(case when t.tipo = 'entrada' then t.valor else -t.valor end), 0)::numeric as saldo
from public.contas c
left join public.transacoes t
  on t.conta_id = c.id and t.status = 'approved'
where c.ativa
group by c.id, c.nome, c.cor;

-- =============================================================
-- Dados iniciais
-- =============================================================
-- Uma conta por conta do Mercado Pago. O `slug` é o que aparece na URL do
-- webhook e define o sufixo das variáveis de ambiente (conta-1 -> CONTA_1).
-- Para acrescentar outra conta depois, insira uma linha com slug 'conta-2'
-- e cadastre MP_ACCESS_TOKEN_CONTA_2 / MP_WEBHOOK_SECRET_CONTA_2.
insert into public.contas (slug, nome, descricao, cor) values
  ('conta-1', 'Conta 1', 'Mercado Pago', '#3345ED')
on conflict (slug) do nothing;

insert into public.categorias (nome, tipo, cor) values
  ('Dízimos',            'entrada', '#20A979'),
  ('Ofertas',            'entrada', '#01E3A4'),
  ('Oferta de Missões',  'entrada', '#15724E'),
  ('Doações',            'entrada', '#4A7AFF'),
  ('Eventos',            'entrada', '#3345ED'),
  ('Outras entradas',    'entrada', '#94A3B8'),
  ('Manutenção',         'saida',   '#E5484D'),
  ('Utilidades (água/luz/internet)', 'saida', '#F5A524'),
  ('Ação Social',        'saida',   '#8B5CF6'),
  ('Missões',            'saida',   '#0EA5E9'),
  ('Salários e encargos','saida',   '#EC4899'),
  ('Materiais',          'saida',   '#14B8A6'),
  ('Tarifas bancárias',  'saida',   '#64748B'),
  ('Outras saídas',      'saida',   '#94A3B8')
on conflict (nome, tipo) do nothing;

-- Transferências entre contas próprias: mexem no saldo, não no resultado.
insert into public.categorias (nome, tipo, cor, eh_transferencia) values
  ('Transferência entre contas', 'saida',   '#7C8DB5', true),
  ('Transferência entre contas', 'entrada', '#7C8DB5', true)
on conflict (nome, tipo) do update set eh_transferencia = true;
