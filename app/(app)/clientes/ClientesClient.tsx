"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NovoClienteModal from "./NovoClienteModal";

interface ClientRow {
  id: string;
  name: string;
  clinic_name: string | null;
  whatsapp: string | null;
  city: string | null;
}

export default function ClientesClient({ initialClients }: { initialClients: ClientRow[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return initialClients.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.clinic_name ?? "").toLowerCase().includes(term) ||
        (c.city ?? "").toLowerCase().includes(term)
    );
  }, [initialClients, search]);

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Clientes</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-teal-dark"
        >
          + Novo cliente
        </button>
      </div>

      <input
        placeholder="Buscar por nome, clínica ou cidade..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal sm:max-w-sm"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            href={`/clientes/${c.id}`}
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-brand-teal"
          >
            <p className="font-medium text-neutral-900">{c.name}</p>
            {c.clinic_name && <p className="mt-0.5 text-sm text-neutral-500">{c.clinic_name}</p>}
            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
              <span>{c.city ?? "-"}</span>
              <span>{c.whatsapp ?? "-"}</span>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 bg-white py-12 text-center text-neutral-400">
            Nenhum cliente encontrado.
          </div>
        )}
      </div>

      {modalOpen && <NovoClienteModal onClose={() => setModalOpen(false)} onCreated={handleCreated} />}
    </div>
  );
}
