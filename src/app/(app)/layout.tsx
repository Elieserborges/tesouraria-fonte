import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { Navegacao } from "@/components/shell/navegacao";
import { MenuMobile } from "@/components/shell/menu-mobile";
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

  /*
   * Quem está logado e como sair.
   *
   * O mesmo bloco serve o rodapé da lateral no desktop e o fundo da gaveta no
   * celular. Fica aqui, no servidor, porque `sair` é uma server action — a
   * gaveta é um componente de cliente e recebe isto pronto.
   */
  const sessaoENoRodape = (
    <div className="space-y-3">
      <div className="rounded-xl border border-borda bg-superficie-2 px-3 py-2.5">
        <p className="truncate text-sm font-medium text-texto">{nome}</p>
        <p className="text-xs text-texto-suave">{PAPEL_LABEL[papel]}</p>
      </div>
      <div className="flex">
        <AlternarValores comRotulo />
      </div>
      <div className="flex items-center gap-2">
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
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/*
        Barra do celular.

        Fica grudada no topo porque é de onde se troca de aba: rolar até o fim
        de uma lista de mil transações para depois voltar ao começo só para
        abrir o menu não é caminho que alguém faça duas vezes.

        Some no PDF junto com o resto do sistema — o relatório impresso é o
        documento, não uma captura de tela.
      */}
      <header className="nao-imprimir sticky top-0 z-40 flex items-center gap-2 border-b border-borda bg-superficie/90 px-3 py-2.5 backdrop-blur-md lg:hidden">
        <MenuMobile pendentes={pendentes} ehAdmin={ehAdmin(papel)}>
          {sessaoENoRodape}
        </MenuMobile>
        <Logo className="text-texto" />
        {/*
          Só o olho fica na barra: esconder os valores é gesto de quem está
          mostrando a tela para alguém, e precisa estar a um toque. O tema se
          escolhe uma vez e mora na gaveta.
        */}
        <div className="ml-auto">
          <AlternarValores />
        </div>
      </header>

      {/* Barra lateral do desktop */}
      <aside className="nao-imprimir hidden shrink-0 flex-col gap-6 border-r border-borda bg-superficie p-6 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64">
        <div className="flex items-center justify-between">
          <Logo className="text-texto" />
        </div>

        <Navegacao pendentes={pendentes} ehAdmin={ehAdmin(papel)} />

        <div className="mt-auto">{sessaoENoRodape}</div>
      </aside>

      <main className="flex-1 px-4 py-5 sm:p-6 lg:p-8 print:p-0">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
