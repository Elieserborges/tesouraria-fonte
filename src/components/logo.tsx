/**
 * Marca do sistema — mesma identidade do Fluxx E-commerce, com o "l"
 * substituído por uma barra inclinada em degradê azul.
 *
 * As letras herdam a cor do contexto (`currentColor`), então funciona no
 * tema claro, no escuro e sobre o painel azul da tela de login. A barra
 * mantém o azul da marca em qualquer fundo.
 */
export function Logo({
  className = "",
  tamanho = "normal",
}: {
  className?: string;
  tamanho?: "normal" | "grande";
}) {
  const escala = tamanho === "grande" ? "text-3xl" : "text-xl";
  const legenda = tamanho === "grande" ? "text-[0.6rem]" : "text-[0.5rem]";

  return (
    <div className={`inline-flex flex-col leading-none ${className}`}>
      <span
        className={`${escala} font-extrabold tracking-tight`}
        aria-label="Fluxx Finance"
      >
        <span aria-hidden>F</span>
        <span
          aria-hidden
          className="mx-[0.02em] inline-block -skew-x-12 bg-gradient-to-b from-marca-400 to-marca-500 bg-clip-text text-transparent"
        >
          l
        </span>
        <span aria-hidden>uxx</span>
      </span>
      <span
        aria-hidden
        className={`${legenda} mt-1.5 font-medium uppercase tracking-[0.42em] opacity-60`}
      >
        Finance
      </span>
    </div>
  );
}
