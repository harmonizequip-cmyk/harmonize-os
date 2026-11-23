import { hojeLocal } from "@/lib/period";
import { estadoDeExemplo } from "@/lib/tour-planejador";
import EditorPlanejamento from "../EditorPlanejamento";

// Prévia do tour do portal para o dono, sem login de cliente: a mesma tela que a
// cliente vê em /portal/exemplo. É o "Ver como a cliente vê" de Configurações >
// Recursos em teste (o tour só aparece para elas depois que o dono libera).
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
