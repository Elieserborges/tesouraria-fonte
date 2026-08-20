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

/*
 * Forma de pagamento, derivada do payload do Mercado Pago.
 *
 * O campo `metodo` guarda a bandeira ("debmaster", "visa"), que não responde
 * a pergunta da tesouraria: entrou pela maquininha, por QR Code no culto,
 * por link de pagamento ou por Pix? Saiu no cartão físico, em Pix ou foi
 * para o cofrinho?
 *
 * Quem separa isso é `point_of_interaction.type`, confirmado nos dados:
 *   POINT          -> maquininha        INSTORE   -> QR Code presencial
 *   CHECKOUT       -> link/checkout     MP_DEBIT_CARD -> cartão físico
 *   PSP_TRANSFER   -> Pix               OPENFINANCE   -> Pix
 * e `operation_type = partition_transfer` marca os cofrinhos.
 */
alter table public.transacoes add column if not exists forma text;

create or replace function public.derivar_forma()
returns trigger
language plpgsql
as $$
declare
  poi  text := new.payload -> 'point_of_interaction' ->> 'type';
  op   text := new.payload ->> 'operation_type';
  tipo text := new.payload ->> 'payment_type_id';
  d    text := lower(coalesce(new.descricao, ''));
begin
  new.forma :=
    case
      when op = 'partition_transfer'            then 'cofrinho'
      when poi = 'MP_DEBIT_CARD'                then 'cartao_fisico'
      when poi = 'POINT'                        then 'maquininha'
      when poi = 'CHECKOUT'                     then 'checkout'
      when poi = 'INSTORE'                      then 'qr_presencial'
      when poi in ('PSP_TRANSFER', 'OPENFINANCE') then 'pix'
      when tipo = 'bank_transfer'               then 'pix'
      when tipo in ('credit_card', 'debit_card', 'prepaid_card') then 'maquininha'
      -- Lançamentos vindos do extrato em PDF não têm payload; sobra a descrição.
      when d like 'pix %'                       then 'pix'
      when d like 'dinheiro reservado%'
        or d like 'dinheiro retirado%'          then 'cofrinho'
      when new.origem = 'manual'                then 'manual'
      when new.origem = 'extrato'               then 'transferencia'
      else 'outros'
    end;
  return new;
end;
$$;

drop trigger if exists transacoes_forma on public.transacoes;
create trigger transacoes_forma
  before insert or update on public.transacoes
  for each row execute function public.derivar_forma();

-- Preenche o que já está gravado (o trigger só pega escritas novas).
update public.transacoes set atualizado_em = atualizado_em where forma is null;

create index if not exists transacoes_forma_idx on public.transacoes (forma);

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

/*
 * Contra qual campo a regra compara.
 *
 * 'descricao'   = o texto da movimentação
 * 'contraparte' = o nome de quem pagou ou recebeu
 *
 * O segundo existe porque Pix não traz descrição: 511 movimentos chegaram
 * em branco. O que identifica esses é a pessoa — e um dizimista recorrente
 * vira uma regra só.
 */
alter table public.regras_categoria
  add column if not exists campo text not null default 'descricao';

alter table public.regras_categoria drop constraint if exists regras_categoria_campo_check;
alter table public.regras_categoria
  add constraint regras_categoria_campo_check check (campo in ('descricao', 'contraparte'));

alter table public.regras_categoria drop constraint if exists regras_categoria_padrao_tipo_key;
drop index if exists public.regras_categoria_unica;
create unique index if not exists regras_categoria_unica
  on public.regras_categoria (padrao, tipo, modo, campo);

create index if not exists transacoes_descricao_norm_idx
  on public.transacoes (lower(btrim(coalesce(descricao, ''))));

/*
 * Texto da transação contra o qual a regra compara, já normalizado.
 * Existe para não repetir o mesmo CASE em cada consulta que usa regras.
 */
create or replace function public.valor_do_campo(
  t public.transacoes,
  campo text
)
returns text
language sql
immutable
as $$
  select lower(btrim(coalesce(
    case when campo = 'contraparte' then t.contraparte else t.descricao end,
    ''
  )));
$$;

/*
 * Aplica as regras às transações.
 *
 * Alcança dois casos:
 *   1. transação sem categoria  -> recebe a da regra
 *   2. categoria posta por regra -> passa a seguir a regra atual
 *
 * O que foi classificado à mão (categoria_automatica = false) nunca é
 * tocado: decisão de pessoa vence regra. Mas se a própria regra colocou a
 * categoria, mudar a regra tem que refletir nas antigas também — senão
 * trocar de ideia deixaria um rastro de transações com a categoria velha.
 *
 * Quando mais de uma regra casa, vence a mais específica: 'exata' antes de
 * 'contem', e entre iguais o padrão mais longo.
 */
create or replace function public.aplicar_regras_categoria()
returns integer
language plpgsql
as $$
declare
  afetadas integer;
begin
  with correspondencia as (
    select distinct on (t.id)
           t.id as transacao_id,
           r.categoria_id
      from public.transacoes t
      join public.regras_categoria r
        -- padrão vazio nunca vale: casaria com toda transação sem o campo
        on r.tipo = t.tipo
       and r.padrao <> ''
       and (
         (r.modo = 'exata' and public.valor_do_campo(t, r.campo) = r.padrao)
         or (r.modo = 'contem'
             and public.valor_do_campo(t, r.campo) like '%' || r.padrao || '%')
       )
     where t.categoria_id is null or t.categoria_automatica
     order by t.id, (r.modo = 'exata') desc, length(r.padrao) desc, r.criado_em desc
  )
  update public.transacoes t
     set categoria_id = c.categoria_id,
         categoria_automatica = true
    from correspondencia c
   where t.id = c.transacao_id
     and t.categoria_id is distinct from c.categoria_id;

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
       and regra.padrao <> ''
       and (
         (regra.modo = 'exata'
          and public.valor_do_campo(t, regra.campo) = regra.padrao)
         or (regra.modo = 'contem'
             and public.valor_do_campo(t, regra.campo) like '%' || regra.padrao || '%')
       );
    get diagnostics afetadas = row_count;
  end if;

  delete from public.regras_categoria where id = regra_id;
  return afetadas;
end;
$$;

-- -------------------------------------------------------------
-- Cadastro de pagadores
--
-- A API do Mercado Pago mascara o nome de quem paga por Pix: vem
-- "XXXXXXXXXXX" no e-mail, first_name nulo e CPF 99999999999. O nome real
-- só aparece no extrato em PDF.
--
-- Mas o `payer.id` vem limpo e é estável por pessoa. Então, uma vez que o
-- extrato ensina que o id X é a Maria, todo Pix futuro dela é identificado
-- na hora, sem esperar o extrato do mês.
-- -------------------------------------------------------------
create table if not exists public.pagadores (
  mp_payer_id   text primary key,
  nome          text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.pagadores enable row level security;

drop policy if exists "pagadores: leitura" on public.pagadores;
create policy "pagadores: leitura" on public.pagadores
  for select to authenticated using (true);

drop policy if exists "pagadores: escrita" on public.pagadores;
create policy "pagadores: escrita" on public.pagadores
  for all to authenticated
  using (public.pode_editar()) with check (public.pode_editar());

create index if not exists transacoes_payer_id_idx
  on public.transacoes ((payload -> 'payer' ->> 'id'));

/*
 * Preenche o nome de quem pagou usando o cadastro.
 * Só toca no que está vazio ou mascarado — nome já conhecido é preservado.
 */
create or replace function public.aplicar_nomes_pagadores()
returns integer
language plpgsql
as $$
declare
  afetadas integer;
begin
  update public.transacoes t
     set contraparte = p.nome
    from public.pagadores p
   where t.payload -> 'payer' ->> 'id' = p.mp_payer_id
     and (
       t.contraparte is null
       or btrim(t.contraparte) = ''
       or t.contraparte ~ '^[Xx]+$'
       or t.contraparte like '%@%'
     );

  get diagnostics afetadas = row_count;
  return afetadas;
end;
$$;

-- -------------------------------------------------------------
-- Edições de evento
--
-- Face a Face acontece 3x por ano para homens e 3x para mulheres;
-- Cura-me, 1x. Criar uma categoria por edição encheria o cadastro de 14
-- categorias novas por ano — em três anos, de 26 para 68.
--
-- Aqui a categoria continua sendo o tipo do evento ("Face a Face") e a
-- EDIÇÃO é um registro com janela de datas. Cada transação daquela
-- categoria dentro da janela pertence àquela edição, sem ninguém precisar
-- marcar lançamento por lançamento.
--
-- A regra que isso impõe: duas edições da mesma categoria não podem ter
-- janelas sobrepostas. Com meses de intervalo entre elas, não é limitação
-- na prática.
-- -------------------------------------------------------------
create table if not exists public.eventos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  categoria_nome text not null,
  inicio         date not null,
  fim            date not null,
  observacao     text,
  criado_por     uuid references auth.users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  constraint eventos_janela_valida check (fim >= inicio)
);

create index if not exists eventos_categoria_idx on public.eventos (categoria_nome);

alter table public.eventos enable row level security;

drop policy if exists "eventos: leitura" on public.eventos;
create policy "eventos: leitura" on public.eventos
  for select to authenticated using (true);

drop policy if exists "eventos: escrita" on public.eventos;
create policy "eventos: escrita" on public.eventos
  for all to authenticated
  using (public.pode_editar()) with check (public.pode_editar());

/*
 * Arrecadação, despesa e resultado de cada edição.
 *
 * A ligação é pela categoria + janela de datas, calculada na hora: mudar
 * as datas da edição corrige os números na mesma consulta, sem precisar
 * reprocessar transação nenhuma.
 */
create or replace view public.resultado_por_evento
with (security_invoker = on) as
select
  e.id                                                                as evento_id,
  e.nome,
  e.categoria_nome,
  e.inicio,
  e.fim,
  e.observacao,
  coalesce(sum(t.valor) filter (where t.tipo = 'entrada'), 0)::numeric as entradas,
  coalesce(sum(t.valor) filter (where t.tipo = 'saida'), 0)::numeric   as saidas,
  coalesce(sum(case when t.tipo = 'entrada' then t.valor else -t.valor end), 0)::numeric
                                                                      as resultado,
  count(t.id)                                                         as lancamentos
from public.eventos e
left join public.categorias c
  on c.nome = e.categoria_nome
left join public.transacoes t
  on t.categoria_id = c.id
 and t.status in ('approved', 'authorized')
 and t.ocorrido_em >= e.inicio::timestamptz
 and t.ocorrido_em < (e.fim + 1)::timestamptz
group by e.id, e.nome, e.categoria_nome, e.inicio, e.fim, e.observacao;

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
/*
 * O saldo conta os aprovados e os autorizados.
 *
 * "authorized" é a compra no cartão que o lojista ainda não capturou. O valor
 * já está bloqueado — some do disponível na hora, como o próprio aplicativo do
 * Mercado Pago mostra — mas a linha só entra no extrato quando a captura
 * acontece, dias depois. Contando só "approved", o sistema exibia como
 * disponível um dinheiro que a igreja já não podia gastar.
 *
 * Uma autorização pode expirar sem captura, e aí o dinheiro volta. O cron
 * revisita esses lançamentos até chegarem a um estado final.
 */
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
  on t.conta_id = c.id and t.status in ('approved', 'authorized')
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

-- =============================================================
-- Extrato do Mercado Pago pela API
-- =============================================================
/*
 * O valor que interessa à tesouraria é o líquido — o que de fato entrou na
 * conta. A API de pagamentos devolve o bruto, e a diferença (tarifa) vinha
 * sendo lançada como uma despesa mensal estimada, o que fazia o saldo
 * divergir do extrato real.
 *
 * Agora cada transação guarda os três números: `valor` é o líquido e manda no
 * saldo; `valor_bruto` é o que foi cobrado da pessoa; `tarifa` é o que o
 * Mercado Pago reteve. Assim o relatório mostra as tarifas sem inventá-las.
 */
alter table public.transacoes add column if not exists valor_bruto numeric(14, 2);
alter table public.transacoes add column if not exists tarifa      numeric(14, 2) not null default 0;

comment on column public.transacoes.valor       is 'Líquido: o que entrou ou saiu da conta.';
comment on column public.transacoes.valor_bruto is 'O que foi cobrado da pessoa, antes das tarifas.';
comment on column public.transacoes.tarifa      is 'Tarifa e impostos retidos pelo Mercado Pago.';

/*
 * Fila dos relatórios de extrato.
 *
 * O relatório não sai na hora: o pedido entra numa fila do Mercado Pago e o
 * arquivo aparece minutos depois. O cron pede numa execução e busca em outra,
 * então o pedido precisa sobreviver entre elas.
 */
create table if not exists public.extrato_pedidos (
  id            bigint primary key,             -- id devolvido pelo Mercado Pago
  conta_id      uuid references public.contas (id) on delete cascade,
  inicio        timestamptz not null,
  fim           timestamptz not null,
  arquivo       text,
  status        text not null default 'pendente',  -- pendente | importado | erro
  movimentos    integer,
  detalhe       text,
  criado_em     timestamptz not null default now(),
  importado_em  timestamptz
);

create index if not exists extrato_pedidos_status_idx on public.extrato_pedidos (status, criado_em);

alter table public.extrato_pedidos enable row level security;

-- Escrita só pelo service role (que ignora RLS); leitura para quem edita.
drop policy if exists "extrato: leitura" on public.extrato_pedidos;
create policy "extrato: leitura" on public.extrato_pedidos
  for select to authenticated using (public.pode_editar());
