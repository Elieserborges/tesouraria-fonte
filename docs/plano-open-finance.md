# Plano — Integração bancária via Open Finance (+ PagBank/Sicredi)

> Objetivo: sair de "só Mercado Pago" para múltiplos bancos por conta, decidindo caso a caso entre API própria do banco e Open Finance via agregador.

## Ponto de partida (hoje)

Webhook + cron do Mercado Pago já formam um padrão maduro: assinatura HMAC verificada em tempo constante, idempotência real (`upsert` por `mp_payment_id`), auditoria em `webhook_eventos`. O problema não é robustez — é acoplamento: `PagamentoMP`, `credenciais(slug)`, `mp_payment_id`, `mp_user_id`, `mp_payer_id` são nomeados e desenhados só para o Mercado Pago, e a lógica de mapear payload para linha de `transacoes` está duplicada entre webhook e cron.

## Decisão estratégica primeiro: Open Finance direto vs. agregador

**Open Finance direto não é "mais uma API".** Para consumir dados como Iniciador de Pagamento ou Agregador de Dados, a instituição precisa ser **participante registrado** no diretório do Banco Central — credenciamento regulatório, certificado FAPI, homologação. Isso é desproporcional para uma tesouraria de igreja.

**Caminho recomendado:** usar um agregador já homologado que faz a ponte com o Open Finance e expõe uma API comercial simples por cima — candidatos a orçar: **Pluggy**, **Belvo**, **Quanto**. Eles resolvem consentimento (OAuth do usuário final autorizando acesso à conta), extrato e, em alguns casos, iniciação de Pix.

**Por banco, a pergunta muda:**
- **PagBank** — tem API própria de recebimento, no mesmo espírito do Mercado Pago. Não precisa de Open Finance; encaixa direto no padrão de webhook+cron já existente.
- **Sicredi** — cooperativa; API própria de recebimento provavelmente não existe ou é limitada. Antes de escrever qualquer código, **confirmar com o gerente da conta** se há API própria ou se o caminho é exclusivamente Open Finance.

### Ação imediata (fazer antes da Fase 1)

- [ ] Levantar com PagBank: existe API própria de recebimento/Pix? Documentação, custos, SLA de webhook.
- [ ] Levantar com Sicredi: API própria ou só Open Finance?
- [ ] Cotar 2-3 agregadores (Pluggy, Belvo, Quanto) para o cenário Open Finance: custo por conta conectada/mês, cobertura de bancos cooperativos, suporte a extrato + Pix, tempo de homologação do consentimento.

Essa pesquisa muda o desenho técnico — vale travar antes de abrir a Fase 1.

## Fase 1 — extrair a interface de provedor (independe da decisão acima)

Hoje `route.ts` (webhook) e `route.ts` (cron) importam direto de `mercadopago.ts` e cada um monta a linha de `transacoes` na mão. Extrair uma interface comum:

```
interface ProvedorBancario {
  buscarNaJanela(credenciais, de, ate): Promise<PagamentoNormalizado[]>
  validarWebhook(request, credenciais): boolean
  normalizarParaTransacao(pagamentoBruto): TransacaoParcial
}
```

- `mercadopago.ts` vira a primeira implementação dessa interface (refatoração, sem mudar comportamento).
- Isso resolve, de graça, a duplicação atual entre webhook e cron (ambos passam a chamar a mesma implementação).
- `transacoes.origem` já é texto livre e `payload jsonb` já guarda o bruto — não precisam mudar. O que precisa generalizar: renomear/tratar `mp_payment_id` como um `id_externo` genérico (mantendo a coluna atual por compatibilidade, ou migrando com `origem` como discriminador).

## Fase 2 — credenciais em tabela, não em env var

Pré-requisito compartilhado com o plano de multi-igreja — implementar uma vez, serve para os dois:

- Tabela `credenciais_bancarias` (conta_id, provedor, dados cifrados, criado_em).
- `credenciais(conta.slug)` em `mercadopago.ts` passa a ler dessa tabela em vez de `process.env`.
- Sem isso, cada conta nova (banco novo ou igreja nova) ainda exige redeploy manual.

## Fase 3 — implementar o segundo provedor

Ordem sugerida pela pesquisa da fase 0: o que tiver API própria (provavelmente PagBank) primeiro — reaproveita 100% do padrão webhook+cron atual, é o menor risco. Open Finance via agregador entra depois, porque tem uma peça nova que o fluxo atual não tem: **consentimento do usuário final** (o tesoureiro autoriza o agregador a ler a conta do banco) — isso é uma tela/fluxo novo no produto, não só um conector de backend.

Para o conector via agregador:
- Nova rota de webhook (`api/webhooks/<agregador>/[conta]`) espelhando o padrão atual.
- `normalizarParaTransacao` traduz o formato do agregador para o mesmo formato interno — é aqui que a Fase 1 paga o investimento.
- Fluxo de consentimento: tela para o tesoureiro conectar a conta (redirect OAuth do agregador), estado de "aguardando autorização" em `contas`.

## Fase 4 — reconciliação

O extrato em PDF hoje é a fonte da verdade para saldo porque a API do Mercado Pago sozinha não cobre tudo (saques/reservas não aparecem em `/v1/payments`). Ao trocar de provedor, confirmar se o extrato via Open Finance/agregador é completo o suficiente para aposentar a importação manual de PDF — se não for, manter o importador como rede de segurança em paralelo.

## Riscos

- **Custo por conta do agregador** não escalar bem se o modelo de negócio for "igreja pequena, plano barato" — validar preço por conta antes de comprometer arquitetura no plano de multi-igreja.
- **Consentimento OAuth expira/revoga** sem aviso — precisa de um estado visível de "conexão perdida, reconectar" na UI, não só falha silenciosa no cron.
- **Sicredi sem API própria confirmada** — se só existir via Open Finance, isso empurra a implementação do agregador para antes do que o roteiro geral (fase 5 do plano de multi-igreja) previa.

## Critério de pronto

Uma segunda conta bancária real conectada e sincronizando (via API própria ou agregador, conforme a decisão da Fase 0), gravando em `transacoes` pelo mesmo pipeline idempotente que o Mercado Pago usa hoje, sem duplicar lógica de mapeamento de payload.
