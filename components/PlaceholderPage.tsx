export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white py-20 text-center">
      <p className="text-lg font-semibold text-neutral-700">{title}</p>
      <p className="mt-1 text-sm text-neutral-400">Este módulo chega na próxima fase.</p>
    </div>
  );
}
