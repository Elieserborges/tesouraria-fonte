# Plano — Expansão para outras igrejas (multi-tenant)

> Objetivo: sair de "uma contabilidade compartilhada" para "N igrejas isoladas", cada uma com plano gratuito ou pago, sem reescrever o produto do zero.

## Ponto de partida (hoje)

Nenhuma tabela tem coluna de tenant. `contas`, `categorias`, `transacoes`, `regras_categoria`, `pagadores` e `perfis` são globais. Todas as policies de RLS seguem `using (true)` para leitura — qualquer usuário autenticado vê a contabilidade inteira. Não há conceito de "organização" em nenhum lugar do schema ou do código.

**Consequência prática:** isso não é um flag para ligar. É uma migração de schema + dados em seis tabelas, e uma reescrita de toda regra de acesso.

## Fase 0 — pré-requisito (fazer antes, não em paralelo)

- [ ] Testes automatizados mínimos cobrindo os três fluxos que não podem quebrar silenciosamente: gravação de transação (webhook/cron), `aplicar_regras_categoria()`, `aplicar_nomes_pagadores()`.
- [ ] Camada de credenciais bancárias sai de env var (`MP_ACCESS_TOKEN_CONTA_1`) para uma tabela cifrada por conta. Sem isso, cada igreja nova exige redeploy manual — inviável em qualquer escala além de 2-3 contas.

Sem esses dois itens, a migração de tenant fica sem rede de segurança justamente na parte que envolve dinheiro.

## Fase 1 — modelagem de tenant

1. Criar tabela `igrejas` (id, nome, slug, plano, criado_em, ativa).
2. Adicionar `igreja_id uuid not null references igrejas(id)` em: `contas`, `categorias`, `transacoes`, `regras_categoria`, `pagadores`, `perfis`.
3. Migração de dados: a igreja atual vira a primeira linha de `igrejas`; todo dado existente recebe esse `igreja_id` (backfill único, sem downtime — é um `update` simples porque hoje só existe uma contabilidade).
4. Função `current_igreja()` (análoga a `eh_admin()`/`pode_editar()`) que resolve a igreja do usuário logado a partir de `perfis`.

## Fase 2 — reescrever RLS

Trocar, tabela por tabela, `using (true)` por `using (igreja_id = current_igreja())` — em leitura **e** escrita. É mecânico, mas precisa ser feito nas seis tabelas sem exceção; qualquer uma esquecida vaza dado entre igrejas. Reaproveitar o padrão de loop `foreach t in array [...]` que já existe em `schema.sql` para as policies de `contas/categorias/transacoes/regras_categoria` — só falta incluir `igreja_id` na condição.

**Checkpoint de segurança:** antes de seguir para a Fase 3, rodar um teste manual com dois usuários de igrejas diferentes confirmando que nenhum consegue ler/escrever dado do outro — por query direta via Supabase client, não só pela UI.

## Fase 3 — onboarding sem redeploy

- Fluxo de cadastro dentro do próprio produto: criar igreja → convidar admin → conectar banco(s) (usa a camada de credenciais da Fase 0).
- Isso troca o padrão atual de "dev adiciona env var e faz deploy" por um fluxo self-service — é o que separa "funciona pra 2 igrejas" de "funciona pra 20".

## Fase 4 — plano e cobrança recorrente

- Definir os dois planos: gratuito (a igreja atual, ou um tier limitado) e pago (demais igrejas).
- Decidir onde a cobrança roda: dentro do próprio Supabase (tabela de assinaturas + cron de cobrança) vs. um provedor externo (Stripe, Asaas, etc. — no Brasil, Asaas/Pagar.me lidam melhor com boleto/Pix recorrente para um público de igrejas).
- O webhook de cobrança (evento "assinatura paga/atrasada") passa a conviver com os webhooks bancários já existentes — mesmo padrão de `webhook_eventos`, provedor novo.
- Regra de bloqueio: o que acontece com uma igreja inadimplente (read-only? bloqueio total? carência?).

## Decisões em aberto (responder antes de começar a Fase 1)

| Decisão | Opções | Impacto |
|---|---|---|
| Um usuário pode pertencer a mais de uma igreja? | Sim (ex.: contador que atende várias) / Não | Muda `perfis` de 1:1 para uma tabela de associação `perfis_igrejas` |
| Cobrança dentro do Supabase ou provedor externo? | Manual/cron vs. Stripe/Asaas | Define se existe uma nova integração de pagamento além das bancárias |
| Plano gratuito é só para a igreja atual ou um tier permanente? | Caso especial vs. tier real | Muda se "gratuito" precisa de lógica de produto ou é só um registro manual |

## Riscos

- **Vazamento de dado entre igrejas** por policy esquecida — mitigado pelo checkpoint da Fase 2.
- **Migração de dados sem teste automatizado** — mitigado pela Fase 0.
- **Escopo inflar** (SSO, múltiplos papéis por igreja, hierarquia de denominação) — manter fora do escopo até a Fase 4 estar rodando com uma segunda igreja real.

## Critério de pronto

Duas igrejas reais rodando na mesma instância, com dados completamente isolados (validado pelo checkpoint de segurança), cada uma com seu próprio banco conectado via a camada de credenciais da Fase 0, e uma delas faturando no plano pago.
