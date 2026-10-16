import FormularioCadastro from "./FormularioCadastro";

export const metadata = { title: "Cadastro | Harmonize" };

export default async function CadastroPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  return <FormularioCadastro token={token} />;
}
