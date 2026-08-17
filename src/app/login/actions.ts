"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { erro?: string };

export async function entrar(
  _estadoAnterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const proximo = String(formData.get("proximo") ?? "/dashboard");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    const invalido = error.message.toLowerCase().includes("invalid");
    return {
      erro: invalido
        ? "E-mail ou senha incorretos."
        : "Não foi possível entrar. Tente novamente em instantes.",
    };
  }

  revalidatePath("/", "layout");
  redirect(proximo.startsWith("/") ? proximo : "/dashboard");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
