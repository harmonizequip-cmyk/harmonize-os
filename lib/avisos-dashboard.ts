// Filtra os avisos do Dashboard pelas preferências. Aviso urgente nunca some
// (dinheiro atrasado não pode ficar escondido) e os de acesso ao Planejador
// (`acesso-<id>`) também não.

export function filtrarAvisosOcultos<T extends { id: string; nivel: string }>(avisos: T[], ocultos: string[]): T[] {
  if (ocultos.length === 0) return avisos;
  const escondidos = new Set(ocultos);
  return avisos.filter((a) => a.nivel === "urgente" || a.id.startsWith("acesso-") || !escondidos.has(a.id));
}
