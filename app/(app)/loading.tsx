// Mostrado enquanto qualquer tela do app carrega no servidor (sem isso, o
// toque num menu parecia não fazer nada até a tela nova chegar).
export default function Carregando() {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="Carregando">
      <div className="h-6 w-40 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-24 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-800/80" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-16 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-800/80" />
        <div className="h-16 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-800/80" />
        <div className="h-16 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-800/80" />
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-800/80" />
    </div>
  );
}
