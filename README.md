# Tesouraria Fonte

Painel financeiro da tesouraria: as transações das contas do **Mercado Pago**
chegam por webhook, são categorizadas e viram gráficos e relatórios para a
tesouraria e o Conselho Fiscal.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase
(Postgres + Auth + RLS) · Recharts.

---

## 1. Subir o banco (Supabase)

1. Crie um projeto em <https://supabase.com> (plano gratuito serve).
2. Abra **SQL Editor** e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
   Ele cria tabelas, políticas de RLS, a view de saldos, as categorias padrão e
   uma conta (`conta-1`).
3. Em **Table Editor → contas**, ajuste o nome da conta e preencha `mp_user_id`
   com o *collector id* da conta do Mercado Pago — é o que permite distinguir
   entrada de saída.

Para acrescentar outra conta no futuro, insira uma linha em `contas` com slug
`conta-2` e cadastre as variáveis `MP_ACCESS_TOKEN_CONTA_2` e
`MP_WEBHOOK_SECRET_CONTA_2`. O sistema não tem limite de contas.

## 2. Criar os usuários

| Papel        | Pode                                              |
| ------------ | ------------------------------------------------- |
| `admin`      | tudo, inclusive gerenciar usuários                |
| `tesoureiro` | lançar, categorizar, criar/excluir categorias     |
| `conselho`   | apenas visualizar painéis, gráficos e transações  |

A restrição é aplicada no banco (RLS), não só na interface.

### Primeiro administrador

O primeiro usuário precisa ser criado à mão, porque ainda não existe ninguém
para acessar a tela de gestão. Em **Authentication → Users → Add user**, crie
o usuário (e-mail + senha, com "Auto Confirm User" ligado) e promova-o:

```sql
update public.perfis set papel = 'admin' where email = 'fulano@email.com';
```

### Os demais

Daí em diante, use a tela **Usuários** dentro do sistema (visível só para
administradores). Ela permite:

- **Criar usuário** com nome, e-mail, papel e senha provisória — há um gerador
  de senha embutido. O usuário já nasce confirmado, então **não é preciso
  configurar SMTP** no Supabase; a senha é entregue pessoalmente.
- **Trocar o papel** de alguém pelo seletor da linha.
- **Definir nova senha** quando alguém esquecer (o admin gera e repassa).
- **Excluir** o acesso. Os lançamentos que a pessoa criou permanecem no sistema.

Proteções embutidas: ninguém altera o próprio papel nem exclui a própria conta,
e o sistema se recusa a remover o último administrador.

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase →
  **Project Settings → API**.
- `SUPABASE_SERVICE_ROLE_KEY`: mesma tela. **Nunca** exponha no navegador —
  é usada só pelo webhook.
- `MP_ACCESS_TOKEN_CONTA_1` e `MP_WEBHOOK_SECRET_CONTA_1`: credenciais da conta
  do Mercado Pago. O sufixo vem do `slug` da conta em maiúsculas
  (`conta-1` → `CONTA_1`), então cada conta nova tem seu próprio par.

Em produção, essas variáveis vão no painel da Vercel
(**Settings → Environment Variables**), não neste arquivo — o `.env.local`
nunca é enviado no deploy.

## 4. Rodar

```bash
npm run dev
```

Abra <http://localhost:3000>.

---

## 5. Webhook do Mercado Pago

Cada conta tem sua própria URL, formada pelo `slug`:

```
https://SEU-DOMINIO/api/webhooks/mercadopago/conta-1
```

No painel do Mercado Pago: **Suas integrações → sua aplicação → Webhooks**,
cadastre a URL, marque o evento **Pagamentos** e copie a *assinatura secreta*
para `MP_WEBHOOK_SECRET_CONTA_1`.

O que a rota faz, em ordem:

1. Confere se o `slug` existe na tabela `contas`.
2. Valida a assinatura `x-signature` (HMAC-SHA256 do manifesto
   `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`). Assinatura inválida → `401`.
3. Busca o pagamento em `GET /v1/payments/{id}` com o access token da conta.
4. Grava em `transacoes` com `upsert` por `mp_payment_id` — reprocessar a mesma
   notificação é seguro, e mudança de status (aprovado → estornado) atualiza o
   registro **sem apagar a categoria já atribuída**.
5. Registra tudo em `webhook_eventos` para auditoria. Em caso de erro devolve
   `500`, e o Mercado Pago reenvia a notificação depois.

Só `status = 'approved'` entra no cálculo de saldo (ver a view `saldo_por_conta`).

### Testar localmente

O Mercado Pago precisa alcançar sua máquina. Use um túnel:

```bash
npx untun@latest tunnel http://localhost:3000
```

Depois, no painel do Mercado Pago, use **Simular notificação** apontando para
a URL do túnel.

---

## 6. Deploy (Vercel)

1. Suba o repositório para o GitHub.
2. Importe na Vercel — a raiz do projeto é a pasta `tesouraria-fonte`.
3. Cadastre as mesmas variáveis de ambiente em **Settings → Environment Variables**.
4. Troque as URLs de webhook no Mercado Pago para o domínio de produção.

---

## Estrutura

```
src/
  app/
    (app)/                 área autenticada (layout com menu lateral)
      dashboard/           cartões de saldo, gráficos, últimas movimentações
      transacoes/          lista com filtros, categorização e lançamento manual
      categorias/          cadastro de categorias
      usuarios/            gestão de acessos (só administradores)
    api/webhooks/mercadopago/[conta]/route.ts
    login/                 autenticação (Server Actions)
  components/              UI (gráficos, tabela, filtros, shell)
  lib/
    dados.ts               consultas e agregações
    mercadopago.ts         assinatura + API de pagamentos
    supabase/              clientes (navegador, servidor, service role)
  proxy.ts                 renova a sessão e protege as rotas
supabase/schema.sql        banco, RLS, views e dados iniciais
```

## Identidade visual

Tokens em `src/app/globals.css`, com tema claro e escuro.

| Cor       | Hex       | Uso                          |
| --------- | --------- | ---------------------------- |
| Azul      | `#3345ED` | primária, ações, marca       |
| Azul claro| `#4A7AFF` | primária no tema escuro      |
| Azul noite| `#172672` | fundo do cartão de destaque  |
| Verde     | `#20A979` | entradas, saldo positivo     |
| Verde menta | `#01E3A4` | acentos                    |
| Vermelho  | `#E5484D` | saídas, alertas              |
