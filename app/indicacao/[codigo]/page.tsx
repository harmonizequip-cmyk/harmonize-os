import LinkIndicacao from "./LinkIndicacao";

export const metadata = { title: "Você ganhou 10% | Harmonize" };

export default async function IndicacaoPage(props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params;
  return <LinkIndicacao codigo={codigo} />;
}
