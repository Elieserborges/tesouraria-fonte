import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tesouraria Fonte",
  description: "Painel financeiro da tesouraria — entradas, saídas e relatórios.",
};

// Aplica o tema salvo antes da primeira pintura, evitando o "flash" branco.
const scriptTema = `(function(){try{var t=localStorage.getItem("tema");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"escuro":"claro"}document.documentElement.dataset.tema=t}catch(e){}})();`;

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
