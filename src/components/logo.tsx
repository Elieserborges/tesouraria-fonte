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
  /*
   * O tracking é medido, não estimado.
   *
   * A legenda tem que terminar onde "Fluxx" termina. Com 0,355em a diferença
   * fica em meio pixel nos dois tamanhos — medido no navegador, com a fonte
   * já carregada. Antes de o webfont chegar a conta dá outra, então não
   * adianta conferir no primeiro quadro.
   */
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
        A legenda encosta na palavra e termina onde ela termina.

        A altura de linha justa no wordmark já deixa pouco espaço vertical, e
        a margem negativa no topo fecha o resto: com folga, os dois pareciam
        elementos separados em vez de uma marca só.

        Na horizontal, o tracking espalha "FINANCE" até a largura de "Fluxx",
        e a margem negativa à direita cancela o espaço que sobra depois da
        última letra — sem ela a legenda ocupa mais caixa do que tinta e o
        conjunto parece deslocado.
      */}
      <span
        aria-hidden
        className={`${legenda} -mt-px -mr-[0.355em] font-medium uppercase tracking-[0.355em] opacity-60`}
      >
        Finance
      </span>
    </div>
  );
}
