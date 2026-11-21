import { hojeLocal } from "@/lib/period";
import { estadoDeExemplo } from "@/lib/tour-planejador";
import EditorPlanejamento from "../EditorPlanejamento";

// TEMPORÁRIO (21/11/2026): prévia do tour do portal para o dono, sem login de cliente.
// Mostra a mesma tela que a cliente vê em /portal/exemplo. Apagar quando o dono aprovar.
export default function PreviaTourPage() {
  return (
    <EditorPlanejamento
      portal
      demo
      voltarPara="/planejador"
      planoId={null}
      estado={estadoDeExemplo(hojeLocal(), "Dra. Exemplo")}
      clienteId={null}
      eventoId={null}
      clientes={[]}
    />
  );
}
