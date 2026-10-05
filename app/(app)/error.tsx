"use client";

// Rede de segurança das telas internas: se uma consulta falhar (o caso típico
// é a conexão cair), mostra o aviso e deixa tentar de novo, em vez de uma tela
// que parece normal mas vazia (ex.: "ninguém devendo" quando a lista não
// carregou).
export default function ErroDaTela({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
      <p className="font-semibold">Não consegui carregar esta tela.</p>
      <p className="text-xs">
        Nada foi alterado. Confira a conexão e tente de novo. Se continuar, avise com esta mensagem:{" "}
        {error.message ? `"${error.message}"` : "sem detalhe"}.
      </p>
      <button onClick={reset} className="w-full rounded-lg bg-red-600 py-2 text-sm font-medium text-white">
        Tentar de novo
      </button>
    </div>
  );
}
