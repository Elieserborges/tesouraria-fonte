import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  // Sem isto o Next monta as URLs dos metadados relativas ao endereço do
  // deploy da vez, e um link compartilhado apontaria para a pré-visualização
  // em vez do endereço da igreja.
  metadataBase: new URL(SITE_URL),
  title: "Fluxx Finance",
  description: "Controle financeiro — entradas, saídas, categorias e relatórios.",
};

/*
 * Aplica o tema antes da primeira pintura, evitando o "flash" branco.
 *
 * A escolha fica travada no navegador: só muda quando a pessoa clica no
 * botão. Antes isto caía na preferência do sistema quando não havia nada
 * salvo — e em máquina com troca automática de tema, cada F5 vinha
 * diferente. Por isso a primeira visita já grava "claro" explicitamente.
 */
const scriptTema = `(function(){try{var t=localStorage.getItem("tema");if(t!=="claro"&&t!=="escuro"){t="claro";localStorage.setItem("tema",t)}document.documentElement.dataset.tema=t;if(localStorage.getItem("valores")==="ocultos"){document.documentElement.dataset.valores="ocultos"}}catch(e){document.documentElement.dataset.tema="claro"}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      data-tema="claro"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
