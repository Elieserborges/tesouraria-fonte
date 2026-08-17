"use client";

import { Fragment, useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import {
  alterarPapel,
  criarUsuario,
  definirSenha,
  excluirUsuario,
  type EstadoUsuario,
} from "@/app/(app)/usuarios/actions";
import { gerarSenha } from "@/lib/senha";
import { formatarData, formatarDataHora } from "@/lib/format";
import {
  PAPEL_DESCRICAO,
  PAPEL_LABEL,
  type PapelUsuario,
  type UsuarioGerenciado,
} from "@/lib/types";

const PAPEIS: PapelUsuario[] = ["admin", "tesoureiro", "conselho"];

const CLASSE_CAMPO =
  "w-full rounded-xl border border-borda bg-superficie-2 px-3 py-2.5 text-sm text-texto outline-none transition focus:border-primaria focus:ring-2 focus:ring-primaria/25";

function BotaoCriar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-xl bg-primaria px-4 py-2.5 text-sm font-semibold text-primaria-contraste transition hover:opacity-90 disabled:opacity-60"
    >
      <UserPlus size={16} aria-hidden />
      {pending ? "Criando…" : "Criar usuário"}
    </button>
  );
}

function FormularioNovoUsuario({ aoFechar }: { aoFechar: () => void }) {
  const [estado, acao] = useActionState<EstadoUsuario, FormData>(criarUsuario, {});
  const [senha, setSenha] = useState(() => gerarSenha());

  return (
    <section className="cartao p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-texto">Novo usuário</h2>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2"
        >
          <X size={16} />
        </button>
      </header>

      <form action={acao} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Nome</span>
          <input name="nome" required placeholder="Maria da Silva" className={CLASSE_CAMPO} />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">E-mail</span>
          <input
            name="email"
            type="email"
            required
            placeholder="maria@igreja.com"
            className={CLASSE_CAMPO}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Papel</span>
          <select name="papel" defaultValue="conselho" className={CLASSE_CAMPO}>
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {PAPEL_LABEL[p]} — {PAPEL_DESCRICAO[p]}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5">
          <label htmlFor="senha-nova" className="text-sm font-medium text-texto">
            Senha provisória
          </label>
          <div className="flex gap-2">
            <input
              id="senha-nova"
              name="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={8}
              required
              className={`${CLASSE_CAMPO} font-mono`}
            />
            <button
              type="button"
              onClick={() => setSenha(gerarSenha())}
              aria-label="Gerar outra senha"
              className="shrink-0 rounded-xl border border-borda px-3 text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <p className="text-xs text-texto-suave">
            Anote e entregue à pessoa por um canal seguro — ela não é exibida de novo.
          </p>
        </div>

        {estado.erro && (
          <p role="alert" className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta sm:col-span-2">
            {estado.erro}
          </p>
        )}
        {estado.sucesso && (
          <p className="rounded-lg bg-verde-400/10 px-3 py-2 text-sm text-entrada sm:col-span-2">
            {estado.sucesso}
          </p>
        )}

        <div className="sm:col-span-2">
          <BotaoCriar />
        </div>
      </form>
    </section>
  );
}

function LinhaSenha({
  usuario,
  aoFechar,
  aoErro,
}: {
  usuario: UsuarioGerenciado;
  aoFechar: () => void;
  aoErro: (m: string | null) => void;
}) {
  const [senha, setSenha] = useState(() => gerarSenha());
  const [salva, setSalva] = useState(false);
  const [pendente, iniciar] = useTransition();

  function salvar() {
    aoErro(null);
    iniciar(async () => {
      const r = await definirSenha(usuario.id, senha);
      if (r.erro) aoErro(r.erro);
      else setSalva(true);
    });
  }

  return (
    <tr className="border-b border-borda/60 bg-superficie-2/60">
      <td colSpan={5} className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-texto">
            Nova senha para <strong>{usuario.nome}</strong>:
          </span>
          <input
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value);
              setSalva(false);
            }}
            minLength={8}
            aria-label="Nova senha"
            className={`${CLASSE_CAMPO} w-52 font-mono`}
          />
          <button
            type="button"
            onClick={() => {
              setSenha(gerarSenha());
              setSalva(false);
            }}
            aria-label="Gerar outra senha"
            className="rounded-xl border border-borda px-3 py-2.5 text-texto-suave transition hover:bg-superficie hover:text-texto"
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={pendente || senha.length < 8}
            className="rounded-xl bg-primaria px-4 py-2.5 text-sm font-semibold text-primaria-contraste transition hover:opacity-90 disabled:opacity-60"
          >
            {pendente ? "Salvando…" : "Definir"}
          </button>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-xl px-3 py-2.5 text-sm text-texto-suave transition hover:text-texto"
          >
            Cancelar
          </button>
          {salva && (
            <span className="text-sm text-entrada">
              Senha alterada. Entregue à pessoa.
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function GerenciadorUsuarios({
  usuarios,
  usuarioAtualId,
}: {
  usuarios: UsuarioGerenciado[];
  usuarioAtualId: string;
}) {
  const [criando, setCriando] = useState(false);
  const [editandoSenha, setEditandoSenha] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function mudarPapel(usuarioId: string, papel: PapelUsuario) {
    setErro(null);
    iniciar(async () => {
      const r = await alterarPapel(usuarioId, papel);
      if (r.erro) setErro(r.erro);
    });
  }

  function remover(usuario: UsuarioGerenciado) {
    if (
      !confirm(
        `Excluir ${usuario.nome} (${usuario.email})? A pessoa perde o acesso imediatamente. Os lançamentos que ela criou continuam no sistema.`,
      )
    )
      return;

    setErro(null);
    iniciar(async () => {
      const r = await excluirUsuario(usuario.id);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <div className="space-y-6">
      {criando ? (
        <FormularioNovoUsuario aoFechar={() => setCriando(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="flex items-center gap-2 rounded-xl bg-primaria px-4 py-2.5 text-sm font-semibold text-primaria-contraste transition hover:opacity-90"
        >
          <UserPlus size={16} aria-hidden />
          Novo usuário
        </button>
      )}

      {erro && (
        <p role="alert" className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
          {erro}
        </p>
      )}

      <section className={`cartao overflow-hidden ${pendente ? "opacity-60" : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs uppercase tracking-wider text-texto-suave">
                <th className="px-5 py-3 font-medium">Pessoa</th>
                <th className="px-5 py-3 font-medium">Papel</th>
                <th className="px-5 py-3 font-medium">Último acesso</th>
                <th className="px-5 py-3 font-medium">Desde</th>
                <th className="w-24 px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const souEu = u.id === usuarioAtualId;
                return (
                  <Fragment key={u.id}>
                    <tr className="border-b border-borda/60 last:border-0 hover:bg-superficie-2/60">
                      <td className="px-5 py-3">
                        <span className="block font-medium text-texto">
                          {u.nome}
                          {souEu && (
                            <span className="ml-2 rounded-full bg-primaria/12 px-2 py-0.5 text-xs font-normal text-primaria">
                              você
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-texto-suave">{u.email}</span>
                      </td>

                      <td className="px-5 py-3">
                        <select
                          value={u.papel}
                          disabled={souEu}
                          onChange={(e) => mudarPapel(u.id, e.target.value as PapelUsuario)}
                          aria-label={`Papel de ${u.nome}`}
                          title={souEu ? "Você não pode alterar o próprio papel." : undefined}
                          className="rounded-lg border border-borda bg-superficie px-2.5 py-1.5 text-sm text-texto outline-none transition focus:border-primaria focus:ring-2 focus:ring-primaria/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {PAPEIS.map((p) => (
                            <option key={p} value={p}>
                              {PAPEL_LABEL[p]}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="whitespace-nowrap px-5 py-3 text-texto-suave">
                        {u.ultimo_acesso ? formatarDataHora(u.ultimo_acesso) : "nunca entrou"}
                      </td>

                      <td className="whitespace-nowrap px-5 py-3 text-texto-suave">
                        {formatarData(u.criado_em)}
                      </td>

                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setEditandoSenha(editandoSenha === u.id ? null : u.id)
                            }
                            aria-label={`Definir nova senha para ${u.nome}`}
                            title="Definir nova senha"
                            className="rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                          >
                            <KeyRound size={15} />
                          </button>
                          {!souEu && (
                            <button
                              type="button"
                              onClick={() => remover(u)}
                              aria-label={`Excluir ${u.nome}`}
                              title="Excluir usuário"
                              className="rounded-lg p-1.5 text-texto-suave transition hover:bg-alerta/10 hover:text-alerta"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {editandoSenha === u.id && (
                      <LinhaSenha
                        usuario={u}
                        aoFechar={() => setEditandoSenha(null)}
                        aoErro={setErro}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cartao p-5">
        <h2 className="mb-3 text-sm font-semibold text-texto">O que cada papel pode</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          {PAPEIS.map((p) => (
            <div key={p} className="rounded-xl border border-borda bg-superficie-2 p-3">
              <dt className="text-sm font-medium text-texto">{PAPEL_LABEL[p]}</dt>
              <dd className="mt-1 text-xs text-texto-suave">{PAPEL_DESCRICAO[p]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
