"use client";

import { useEffect, useState } from "react";
import { DatabaseBackup } from "lucide-react";

const CHAVE = "harmonize-ultimo-backup";

/**
 * Cartão de backup manual em Configurações. O plano gratuito do Supabase não
 * guarda cópias que dê para restaurar, então o arquivo baixado aqui é a única
 * cópia fora do banco. O aviso de "último backup" fica só neste aparelho
 * (localStorage) e serve de lembrete, não de prova.
 */
export default function BackupCard() {
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    try {
      setUltimo(localStorage.getItem(CHAVE));
    } catch {
      // navegador sem armazenamento: o cartão funciona igual, só sem o lembrete
    }
  }, []);

  const diasDesde = ultimo ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000) : null;
  const atrasado = diasDesde === null || diasDesde >= 7;

  async function baixar() {
    setBaixando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/backup", { cache: "no-store" });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        throw new Error(corpo?.erro ?? "Não consegui gerar o backup.");
      }
      const blob = await resposta.blob();
      const nome = `backup-harmonize-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const agora = new Date().toISOString();
      try {
        localStorage.setItem(CHAVE, agora);
      } catch {
        // sem armazenamento: segue sem o lembrete
      }
      setUltimo(agora);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui gerar o backup.");
    }
    setBaixando(false);
  }

  return (
    <div
      className={`rounded-2xl border p-4 ${
        atrasado
          ? "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
          <DatabaseBackup size={17} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Backup dos dados</p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Baixa um arquivo com clientes, reservas, locações, pagamentos, lançamentos, tarefas e histórico. Guarde no
            Google Drive. Faça toda semana.
          </p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
            {ultimo
              ? `Último backup neste aparelho: ${new Date(ultimo).toLocaleDateString("pt-BR")} (${
                  diasDesde === 0 ? "hoje" : `há ${diasDesde} dia(s)`
                }).`
              : "Nenhum backup baixado neste aparelho ainda."}
          </p>
          <button
            type="button"
            onClick={baixar}
            disabled={baixando}
            className="mt-3 rounded-xl bg-brand-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {baixando ? "Gerando..." : "Baixar backup agora"}
          </button>
          {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
