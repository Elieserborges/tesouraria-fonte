"use server";

import { revalidatePath } from "next/cache";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterSessao } from "@/lib/supabase/server";
import { ehAdmin, type PapelUsuario, type UsuarioGerenciado } from "@/lib/types";

export type EstadoUsuario = { erro?: string; sucesso?: string };

const PAPEIS: PapelUsuario[] = ["admin", "tesoureiro", "conselho"];

/**
 * Garante que quem chamou é administrador. Todas as ações abaixo usam a chave
 * `service_role` (que ignora o RLS), então esta checagem é a única barreira —
 * ela vem primeiro em toda ação.
 */
async function exigirAdmin() {
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada.");
  if (!ehAdmin(sessao.perfil?.papel)) {
    throw new Error("Apenas administradores podem gerenciar usuários.");
  }
  return sessao;
}

function mensagem(e: unknown, padrao: string) {
  return { erro: e instanceof Error ? e.message : padrao };
}

// ------------------------------------------------------------------
// Leitura
// ------------------------------------------------------------------

/** Junta `auth.users` (último acesso, confirmação) com `perfis` (nome, papel). */
export async function listarUsuarios(): Promise<UsuarioGerenciado[]> {
  await exigirAdmin();
  const admin = criarClienteAdmin();

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw new Error(error.message);

  const { data: perfis } = await admin
    .from("perfis")
    .select("id, nome, papel");

  const porId = new Map(
    (perfis ?? []).map((p) => [p.id as string, p as { nome: string; papel: PapelUsuario }]),
  );

  return data.users
    .map((u) => {
      const perfil = porId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "—",
        nome: perfil?.nome || (u.email ?? "").split("@")[0],
        papel: perfil?.papel ?? "conselho",
        criado_em: u.created_at,
        ultimo_acesso: u.last_sign_in_at ?? null,
        confirmado: Boolean(u.email_confirmed_at),
      } satisfies UsuarioGerenciado;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// ------------------------------------------------------------------
// Escrita
// ------------------------------------------------------------------

export async function criarUsuario(
  _anterior: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  try {
    await exigirAdmin();
    const admin = criarClienteAdmin();

    const nome = String(formData.get("nome") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const senha = String(formData.get("senha") ?? "");
    const papel = String(formData.get("papel") ?? "conselho") as PapelUsuario;

    if (!nome) return { erro: "Informe o nome da pessoa." };
    if (!email.includes("@")) return { erro: "Informe um e-mail válido." };
    if (senha.length < 8) {
      return { erro: "A senha provisória precisa ter ao menos 8 caracteres." };
    }
    if (!PAPEIS.includes(papel)) return { erro: "Papel inválido." };

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true, // sem SMTP configurado, já entra confirmado
      user_metadata: { nome },
    });

    if (error) {
      const jaExiste = /already|registered|exists/i.test(error.message);
      return {
        erro: jaExiste
          ? "Já existe um usuário com esse e-mail."
          : error.message,
      };
    }

    // O trigger cria o perfil como 'conselho'; ajustamos nome e papel.
    const { error: erroPerfil } = await admin
      .from("perfis")
      .update({ nome, papel })
      .eq("id", data.user.id);

    if (erroPerfil) return { erro: erroPerfil.message };
  } catch (e) {
    return mensagem(e, "Falha ao criar o usuário.");
  }

  revalidatePath("/usuarios");
  return { sucesso: "Usuário criado. Entregue a senha provisória à pessoa." };
}

export async function alterarPapel(
  usuarioId: string,
  papel: PapelUsuario,
): Promise<EstadoUsuario> {
  try {
    const sessao = await exigirAdmin();
    if (usuarioId === sessao.user.id) {
      return { erro: "Você não pode alterar o próprio papel." };
    }
    if (!PAPEIS.includes(papel)) return { erro: "Papel inválido." };

    const admin = criarClienteAdmin();
    const { error } = await admin
      .from("perfis")
      .update({ papel })
      .eq("id", usuarioId);

    if (error) return { erro: error.message };
  } catch (e) {
    return mensagem(e, "Falha ao alterar o papel.");
  }

  revalidatePath("/usuarios");
  return { sucesso: "Papel atualizado." };
}

export async function definirSenha(
  usuarioId: string,
  senha: string,
): Promise<EstadoUsuario> {
  try {
    await exigirAdmin();
    if (senha.length < 8) {
      return { erro: "A senha precisa ter ao menos 8 caracteres." };
    }

    const admin = criarClienteAdmin();
    const { error } = await admin.auth.admin.updateUserById(usuarioId, {
      password: senha,
    });

    if (error) return { erro: error.message };
  } catch (e) {
    return mensagem(e, "Falha ao definir a senha.");
  }

  revalidatePath("/usuarios");
  return { sucesso: "Senha redefinida." };
}

export async function excluirUsuario(usuarioId: string): Promise<EstadoUsuario> {
  try {
    const sessao = await exigirAdmin();
    if (usuarioId === sessao.user.id) {
      return { erro: "Você não pode excluir a própria conta." };
    }

    const admin = criarClienteAdmin();

    // Não deixa o sistema ficar sem nenhum administrador.
    const { data: alvo } = await admin
      .from("perfis")
      .select("papel")
      .eq("id", usuarioId)
      .maybeSingle();

    if (alvo?.papel === "admin") {
      const { count } = await admin
        .from("perfis")
        .select("id", { count: "exact", head: true })
        .eq("papel", "admin");

      if ((count ?? 0) <= 1) {
        return { erro: "É preciso manter ao menos um administrador." };
      }
    }

    const { error } = await admin.auth.admin.deleteUser(usuarioId);
    if (error) return { erro: error.message };
  } catch (e) {
    return mensagem(e, "Falha ao excluir o usuário.");
  }

  revalidatePath("/usuarios");
  return { sucesso: "Usuário excluído." };
}
