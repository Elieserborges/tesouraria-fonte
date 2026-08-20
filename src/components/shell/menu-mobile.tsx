"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { Navegacao } from "@/components/shell/navegacao";

/**
 * A navegação do celular, atrás de um botão.
 *
 * Aberta na tela, ela ocupava metade do espaço útil: oito itens em grade
 * empurravam o conteúdo para baixo em toda página. Numa gaveta, some quando
 * não é necessária — que é quase sempre, porque a pessoa entra numa aba e
 * fica nela.
 *
 * A gaveta fecha sozinha ao navegar. Sem isso, tocar num item deixaria o
 * painel aberto por cima da página que acabou de carregar.
 */
export function MenuMobile({
  pendentes,
  ehAdmin,
  children,
}: {
  pendentes: number;
  ehAdmin: boolean;
  /** Cartão do usuário e ações de sessão, montados no servidor. */
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(false);

  // Enquanto a gaveta está aberta, o corpo não rola atrás dela.
  useEffect(() => {
    if (!aberta) return;

    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(false);
    };
    window.addEventListener("keydown", aoTeclar);

    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [aberta]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label="Abrir menu"
        aria-expanded={aberta}
        className="relative -ml-1 rounded-lg p-2 text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
      >
        <Menu size={20} aria-hidden />
        {/*
          Um ponto no botão fechado avisa que há trabalho esperando lá dentro.
          Sem ele, as transações sem categoria ficariam invisíveis no celular,
          já que o contador mora no item do menu.
        */}
        {pendentes > 0 && (
          <>
            <span
              aria-hidden
              className="absolute right-1 top-1 size-2 rounded-full bg-atencao ring-2 ring-superficie"
            />
            <span className="sr-only">{pendentes} transações sem categoria</span>
          </>
        )}
      </button>

      {aberta && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAberta(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />

          <div className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col gap-5 overflow-y-auto border-r border-borda bg-superficie p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Logo className="text-texto" />
              <button
                type="button"
                onClick={() => setAberta(false)}
                aria-label="Fechar menu"
                className="-mr-1 rounded-lg p-2 text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            {/*
              Tocar num item fecha a gaveta — senão ela ficaria por cima da
              página que acabou de carregar. O clique no link é o sinal, não a
              mudança de rota: assim o fechamento acontece junto com o toque,
              sem esperar a navegação terminar.
            */}
            <div
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) setAberta(false);
              }}
            >
              <Navegacao pendentes={pendentes} ehAdmin={ehAdmin} emGaveta />
            </div>

            <div className="mt-auto">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
