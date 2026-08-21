import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Entrar · Fluxx Finance" };

export default async function PaginaLogin(props: PageProps<"/login">) {
  const { proximo } = await props.searchParams;
  const destino = typeof proximo === "string" ? proximo : "/dashboard";

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* Painel de marca */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-marca-900 p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_0%,#3345ED_0%,transparent_55%),radial-gradient(90%_80%_at_100%_100%,#20A979_0%,transparent_50%)] opacity-70"
        />
        <div className="relative">
          <Logo className="text-white" tamanho="grande" />
        </div>
        <div className="relative max-w-md space-y-4">
          <p className="text-3xl font-semibold leading-tight">
            Transparência que se vê em tempo real.
          </p>
          <p className="text-white/70">
            Entradas e saídas das contas do Mercado Pago chegam automaticamente,
            já categorizadas e prontas para o relatório da Diretoria.
          </p>
        </div>
        <ul className="relative flex gap-6 text-sm text-white/60">
          <li>Confiança</li>
          <li>Segurança</li>
          <li>Equilíbrio</li>
        </ul>
      </section>

      {/* Formulário */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 lg:hidden">
            <Logo />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-texto">
              Acessar o painel
            </h1>
            <p className="text-sm text-texto-suave">
              Use as credenciais fornecidas pela tesouraria.
            </p>
          </div>

          <FormularioLogin proximo={destino} />

          <p className="text-xs leading-relaxed text-texto-suave">
            Esqueceu a senha ou precisa de acesso? Fale com o administrador do
            sistema — os cadastros são feitos pela tesouraria.
          </p>
        </div>
      </section>
    </main>
  );
}
