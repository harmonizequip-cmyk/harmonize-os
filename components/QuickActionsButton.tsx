"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import NovaTarefaModal from "@/app/(app)/funil/NovaTarefaModal";
import NovoLeadModal from "@/app/(app)/funil/NovoLeadModal";
import NovoLancamentoModal from "@/app/(app)/financeiro/NovoLancamentoModal";
import NovoEventoModal from "@/app/(app)/agenda/NovoEventoModal";

interface ClientOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
  type: "entrada" | "saida";
}

type ActionKey = "tarefa" | "lancamento" | "lead" | "evento";

// Cada atalho aponta pro módulo de permissão que já governa a tela
// equivalente (mesma regra que Sidebar/BottomNav usam), pra um funcionário
// sem aquele acesso não ver a opção aqui também.
const ACTIONS: { key: ActionKey; label: string; emoji: string; module: string }[] = [
  { key: "tarefa", label: "Nova tarefa", emoji: "🗒️", module: "clientes" },
  { key: "lancamento", label: "Novo lançamento financeiro", emoji: "💰", module: "financeiro" },
  { key: "lead", label: "Novo lead/cliente", emoji: "🧲", module: "clientes" },
  { key: "evento", label: "Novo evento na agenda", emoji: "📅", module: "agenda" },
];

// Botão "+" único, disponível em toda tela (fica no layout, não em cada
// página). Reaproveita os mesmos formulários que já existem em Funil,
// Financeiro e Agenda — não duplica lógica de criação, só dá um atalho pra
// abrir qualquer um deles de onde a pessoa estiver.
export default function QuickActionsButton({
  permissions,
  isAdmin,
}: {
  permissions: Record<string,
