/**
 * Onde o sistema mora.
 *
 * Serve para o endereço aparecer no rodapé do relatório impresso — quem
 * recebe o PDF numa reunião precisa saber onde conferir os números — e para
 * o Next montar as URLs absolutas dos metadados.
 *
 * O domínio sem "www" redireciona para este, então é este que vale como
 * endereço canônico. Fica numa variável de ambiente para o dia em que a
 * igreja trocar de endereço sem precisar de um deploy de código.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://www.fluxxfinance.com.br";

/** O mesmo endereço sem o protocolo, para mostrar a uma pessoa. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
