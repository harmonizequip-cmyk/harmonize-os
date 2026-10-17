import AssistenteClient from "../../assistente/AssistenteClient";

// Assistente do Pessoal: mesma tela do assistente, no escopo pessoal (memória,
// conversas e orçamento próprios, sem clientes).
export default function AssistentePessoalPage() {
  return <AssistenteClient escopo="pessoal" />;
}
