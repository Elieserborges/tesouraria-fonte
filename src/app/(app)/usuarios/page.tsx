import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { GerenciadorUsuarios } from "@/components/usuarios/gerenciador-usuarios";
import { obterSessao } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/types";
import { listarUsuarios } from "./actions";

export const metadata: Metadata = { title: "Usuários · Tesouraria Fonte" };

export default async function PaginaUsuarios() {
  const sessao = await obterSessao();

  if (!ehAdmin(sessao?.perfil?.papel)) {
    return (
      <div className="cartao mx-auto max-w-md p-8 text-center">
        <ShieldAlert size={28} className="mx-auto mb-3 text-atencao" aria-hidden />
        <h1 className="text-lg font-semibold text-texto">Acesso restrito</h1>
        <p className="mt-1 text-sm text-texto-suave">
          A gestão de usuários é exclusiva dos administradores. Fale com quem
          administra o sistema se precisar de acesso.
        </p>
      </div>
    );
  }

  const usuarios = await listarUsuarios();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-texto">Usuários</h1>
        <p className="text-sm text-texto-suave">
          Quem entra no painel e o que cada pessoa pode fazer. As permissões são
          aplicadas no banco de dados, não apenas na tela.
        </p>
      </header>

      <GerenciadorUsuarios usuarios={usuarios} usuarioAtualId={sessao!.user.id} />
    </div>
  );
}
