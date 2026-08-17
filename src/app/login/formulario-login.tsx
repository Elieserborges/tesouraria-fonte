"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LogIn } from "lucide-react";
import { entrar, type EstadoLogin } from "./actions";

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primaria px-4 py-3 text-sm font-semibold text-primaria-contraste transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogIn size={16} aria-hidden />
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="proximo" value={proximo} />

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-texto">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tesouraria@igreja.com"
          className="w-full rounded-xl border border-borda bg-superficie-2 px-4 py-3 text-sm text-texto outline-none transition placeholder:text-texto-suave focus:border-primaria focus:ring-2 focus:ring-primaria/30"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="senha" className="text-sm font-medium text-texto">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="w-full rounded-xl border border-borda bg-superficie-2 px-4 py-3 text-sm text-texto outline-none transition placeholder:text-texto-suave focus:border-primaria focus:ring-2 focus:ring-primaria/30"
        />
      </div>

      {estado.erro && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {estado.erro}
        </p>
      )}

      <BotaoEntrar />
    </form>
  );
}
