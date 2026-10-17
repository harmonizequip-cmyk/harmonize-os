// Ícone e cor de cada categoria de gasto do Pessoal (pelo nome, sem acento).
// Categoria desconhecida cai em "Tag". Usado na lista de lançamentos e na rosca.

import {
  Car,
  Fuel,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  PartyPopper,
  Plane,
  Repeat,
  Shirt,
  ShoppingCart,
  Tag,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";

const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGRAS: { chaves: string[]; icone: LucideIcon; cor: string }[] = [
  { chaves: ["mercado", "supermercado", "feira", "padaria"], icone: ShoppingCart, cor: "#8b5cf6" },
  { chaves: ["aliment", "restaurante", "lanche", "ifood", "comida", "almoc", "jantar"], icone: Utensils, cor: "#f97316" },
  { chaves: ["combust", "gasolina", "etanol", "posto"], icone: Fuel, cor: "#ef4444" },
  { chaves: ["transporte", "uber", "carro", "estacionamento", "pedagio", "onibus"], icone: Car, cor: "#0ea5e9" },
  { chaves: ["saude", "farmacia", "medic", "plano de saude", "dentista", "consulta"], icone: HeartPulse, cor: "#ec4899" },
  { chaves: ["casa", "aluguel", "condominio", "moradia", "reforma"], icone: Home, cor: "#14b8a6" },
  { chaves: ["luz", "energia", "agua", "internet", "telefone", "celular", "conta"], icone: Zap, cor: "#eab308" },
  { chaves: ["lazer", "diversao", "cinema", "festa", "bar"], icone: PartyPopper, cor: "#d946ef" },
  { chaves: ["viagem", "hotel", "hospedagem", "passagem"], icone: Plane, cor: "#06b6d4" },
  { chaves: ["educ", "curso", "escola", "faculdade", "livro"], icone: GraduationCap, cor: "#6366f1" },
  { chaves: ["roupa", "vestuario", "calcado", "beleza", "cabelo"], icone: Shirt, cor: "#f43f5e" },
  { chaves: ["assinatura", "streaming", "mensalidade"], icone: Repeat, cor: "#a855f7" },
  { chaves: ["retirada", "salario", "saldo inicial", "pro-labore", "pro labore"], icone: Landmark, cor: "#10b981" },
];

export function visualDaCategoria(nome: string | null | undefined): { icone: LucideIcon; cor: string } {
  const n = sem(nome ?? "");
  for (const r of REGRAS) if (r.chaves.some((c) => n.includes(c))) return { icone: r.icone, cor: r.cor };
  return { icone: Tag, cor: "#64748b" };
}

/** Cores da rosca de gastos, na ordem das fatias. */
export const CORES_ROSCA = ["#7c3aed", "#f472b6", "#fb923c", "#38bdf8", "#34d399", "#facc15", "#a78bfa", "#94a3b8"];
