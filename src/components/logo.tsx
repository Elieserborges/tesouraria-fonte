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
  // A legenda acompanha a proporção do wordmark (40% do corpo), senão um
  // único valor de tracking não serve para os dois tamanhos.
  const legenda = tamanho === "grande" ? "text-[0.75rem]" : "text-[0.5rem]";

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
      {/*
        A legenda encosta na palavra: `leading-none` no wordmark já deixa
        pouco espaço, e uma margem grande fazia os dois parecerem elementos
        separados. O tracking é calculado para a legenda ficar da largura
        aproximada de "Fluxx" — é isso que faz o conjunto ler como uma marca.
      */}
      <span
        aria-hidden
        className={`${legenda} mt-px font-medium uppercase tracking-[0.44em] opacity-60`}
      >
        Finance
      </span>
    </div>
  );
}
