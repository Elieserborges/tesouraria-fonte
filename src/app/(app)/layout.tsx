import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { Navegacao } from "@/components/shell/navegacao";
import { AlternarTema } from "@/components/shell/alternar-tema";
import { AlternarValores } from "@/components/shell/alternar-valores";
import { obterSessao } from "@/lib/supabase/server";
import { contarSemCategoria } from "@/lib/dados";
import { ehAdmin, PAPEL_LABEL, type PapelUsuario } from "@/lib/types";
import { sair } from "@/app/login/actions";

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");

  const papel = (sessao.perfil?.papel ?? "conselho") as PapelUsuario;
  const nome = sessao.perfil?.nome || sessao.user.email || "Usuário";
  const pendentes = await contarSemCategoria();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Barra lateral */}
      <aside className="flex shrink-0 flex-col gap-6 border-b border-borda bg-superficie p-4 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:border-b-0 lg:border-r lg:p-6">
        <div className="flex items-center justify-between">
          <Logo className="text-texto" />
          <div className="flex gap-2 lg:hidden">
            <AlternarValores />
            <AlternarTema />
          </div>
        </div>

        <Navegacao pendentes={pendentes} ehAdmin={ehAdmin(papel)} />

        <div className="mt-auto hidden lg:block">
          <div className="rounded-xl border border-borda bg-superficie-2 p-3">
            <p className="truncate text-sm font-medium text-texto">{nome}</p>
            <p className="text-xs text-texto-suave">{PAPEL_LABEL[papel]}</p>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex">
              <AlternarValores comRotulo />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <AlternarTema comRotulo />
            <form action={sair} className="flex-1">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-borda px-3 py-2 text-sm text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
              >
                <LogOut size={15} aria-hidden />
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>

      {/* Rodapé de sessão no mobile */}
      <div className="border-t border-borda bg-superficie p-4 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-texto">{nome}</p>
            <p className="text-xs text-texto-suave">{PAPEL_LABEL[papel]}</p>
          </div>
          <form action={sair}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg border border-borda px-3 py-2 text-sm text-texto-suave transition hover:bg-superficie-2"
            >
              <LogOut size={15} aria-hidden />
              Sair
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
