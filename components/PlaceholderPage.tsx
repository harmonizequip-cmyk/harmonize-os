export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300/70 bg-white/50 py-20 text-center backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
      <p className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">{title}</p>
      <p className="mt-1 text-sm text-neutral-400">Este módulo chega na próxima fase.</p>
    </div>
  );
}
