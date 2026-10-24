// Leva X: geração do PDF do contrato de locação, direto no navegador
// (nenhum arquivo fica salvo no servidor — só o retrato dos dados usados,
// em contratos_emitidos.dados). Texto e estrutura replicam fielmente o
// modelo real usado pela operação fora do sistema (contrato de
// 08/06/2026, INSTITUTO ISABEL ALBUQUERQUE), com duas mudanças
// deliberadas: (1) a 2ª cláusula (valor) monta a tabela de faixas a
// partir da precificação configurada em Configurações no momento da
// geração, em vez de repetir os números daquele contrato específico —
// assim o texto gerado sempre bate com o que o sistema realmente cobra;
// (2) o fechamento dessa cláusula nunca afirma que os disparos "já
// foram registrados" ou que um valor "já foi apurado" — o contrato é
// sempre assinado ANTES da locação acontecer (leva Y), nunca depois,
// então shots/calculated_value são opcionais: quando a origem é uma
// locação já lançada (mesmo que para data futura), viram uma estimativa
// sujeita a ajuste; quando é uma pré-reserva sem disparos definidos
// ainda, o texto descreve só a tabela de tarifas.
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import {
  contratadoDoContrato,
  termosDoContrato,
  textoPenalidades,
  textoRescisao,
  type DadosContratado,
  type TermosContrato,
} from "./contrato-textos";

export interface ContratoDados {
  contratante: {
    nome: string;
    documento: string;
    endereco: string | null;
    // Leva X: quem assina pela parte contratante — normalmente a mesma
    // pessoa do "nome", mas pode ser diferente quando o contratante é
    // uma empresa (nome = razão social, responsável = quem assina).
    responsavel: string;
    email: string | null;
  };
  equipamento: {
    nome: string;
    serial_number: string | null;
    anvisa_registro: string | null;
  };
  locacao: {
    event_date: string;
    event_date_end: string | null;
    // Nulos quando o contrato nasce de uma pré-reserva (ainda sem
    // disparos combinados) — o contrato é sempre assinado antes do
    // procedimento, então nunca dá para afirmar um total "já apurado".
    // Quando vêm de uma locação já lançada, são tratados como estimativa
    // sujeita a ajuste pela contagem real do equipamento, não como fato.
    shots: number | null;
    calculated_value: number | null;
    payment_method: string;
  };
  // Retrato da precificação vigente em Configurações no momento desta
  // geração — usado para montar a 2ª cláusula. Fica salvo aqui (e não só
  // calculado ao vivo) para que "baixar de novo" reproduza exatamente o
  // mesmo texto, mesmo que a precificação mude depois em Configurações.
  precificacao: {
    flatPackageLimit: number;
    flatPackageValue: number;
    tier2Limit: number;
    tier2Rate: number;
    tier3Rate: number;
  };
  gerado_em: string;
  // Retrato dos dados da Harmonize e dos números das cláusulas
  // (Configurações > Empresa e contrato) no momento da geração. Contratos
  // antigos não têm: valem os padrões, iguais ao texto de antes.
  contratado?: DadosContratado;
  termos?: TermosContrato;
}

// Categoria do equipamento: hoje toda a frota (HIPRO 1 e HIPRO 2) é do
// mesmo tipo (HIFU médico-estético). Se um dia entrar um equipamento de
// categoria diferente, isso vira um campo próprio em equipments —
// enquanto só existir esse tipo, fica fixo aqui.
const CATEGORIA_EQUIPAMENTO = "Equipamento de HIFU Médico-Estético";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  permuta: "Permuta",
  outros: "Outros",
};

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function formatDateBR(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("pt-BR");
}

function formatDataPorExtenso(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatPeriodo(d: ContratoDados["locacao"]): string {
  if (d.event_date_end && d.event_date_end !== d.event_date) {
    return `${formatDateBR(d.event_date)} a ${formatDateBR(d.event_date_end)}`;
  }
  return formatDateBR(d.event_date);
}

function formatCurrencyBR(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatRatePerShot(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.45, color: "#1a1a1a" },
  letterheadTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "center", color: "#1a3d6d" },
  letterheadLine: { fontSize: 8.5, textAlign: "center", color: "#444", marginTop: 2 },
  hr: { borderBottomWidth: 1, borderBottomColor: "#1a3d6d", marginTop: 8, marginBottom: 10 },
  docTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 12, color: "#1a1a1a" },
  sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 5, color: "#1a3d6d" },
  table: { borderWidth: 1, borderColor: "#c7d2e0", marginBottom: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#c7d2e0" },
  tableRowLast: { flexDirection: "row" },
  tableLabel: { width: 150, backgroundColor: "#eaf0f8", padding: 5, fontFamily: "Helvetica-Bold", fontSize: 9 },
  tableValue: { flex: 1, padding: 5, fontSize: 9 },
  clauseTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 3 },
  paragraph: { marginBottom: 4, textAlign: "justify" },
  bullet: { marginBottom: 2, marginLeft: 10 },
  signatures: { marginTop: 40, flexDirection: "row", justifyContent: "space-between" },
  signatureBlock: { width: "45%" },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#1a1a1a", width: "100%", marginBottom: 4, marginTop: 30 },
  signatureName: { fontFamily: "Helvetica-Bold", textAlign: "center", fontSize: 9.5 },
  signatureRole: { textAlign: "center", fontSize: 8.5, color: "#555" },
  testemunhasTitle: { fontFamily: "Helvetica-Bold", marginTop: 28, marginBottom: 24, fontSize: 9.5 },
});

function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <View style={styles.table}>
      {rows.map(([label, value], i) => (
        <View key={label} style={i === rows.length - 1 ? styles.tableRowLast : styles.tableRow}>
          <Text style={styles.tableLabel}>{label}</Text>
          <Text style={styles.tableValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function ContratoDocument({ dados }: { dados: ContratoDados }) {
  const { flatPackageLimit, flatPackageValue, tier2Limit, tier2Rate, tier3Rate } = dados.precificacao;
  const paymentLabel = PAYMENT_LABELS[dados.locacao.payment_method] ?? dados.locacao.payment_method;
  const CONTRATADO = contratadoDoContrato(dados.contratado);
  const termos = termosDoContrato(dados.termos);

  // Fechamento da cláusula de valor: nunca no passado ("foi apurado"),
  // porque o contrato é sempre assinado antes da locação acontecer. Com
  // disparos/valor já combinados (locação já lançada), vira estimativa
  // sujeita a ajuste; sem eles (pré-reserva), descreve só a tabela.
  const temEstimativa = dados.locacao.shots != null && dados.locacao.calculated_value != null;
  const paragrafoValorFinal = temEstimativa
    ? `O valor final é apurado com base no contador do equipamento ao término do procedimento, sendo o comprovante de pagamento condição para a retirada do equipamento. Para esta locação, estima-se ${dados.locacao.shots!.toLocaleString("pt-BR")} disparo(s), com valor estimado de ${formatCurrencyBR(Number(dados.locacao.calculated_value))}, sujeito a ajuste conforme a contagem final do equipamento. O pagamento será realizado via ${paymentLabel}.`
    : `O valor final é apurado com base no contador do equipamento ao término do procedimento, sendo o comprovante de pagamento condição para a retirada do equipamento. A quantidade de disparos desta locação ainda será definida no dia do procedimento, e o valor total será calculado conforme a tabela acima. O pagamento será realizado via ${paymentLabel}.`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.letterheadTitle}>{CONTRATADO.razaoSocial.toUpperCase()}</Text>
        <Text style={styles.letterheadLine}>CNPJ: {CONTRATADO.cnpj}</Text>
        <Text style={styles.letterheadLine}>{CONTRATADO.endereco}</Text>
        <View style={styles.hr} />
        <Text style={styles.docTitle}>CONTRATO DE LOCAÇÃO DE EQUIPAMENTO MÉDICO-ESTÉTICO</Text>

        <Text style={styles.sectionTitle}>EQUIPAMENTO LOCADO</Text>
        <InfoTable
          rows={[
            ["Marca / Modelo", dados.equipamento.nome],
            ["Categoria", CATEGORIA_EQUIPAMENTO],
            ["Registro ANVISA", dados.equipamento.anvisa_registro || "-"],
            ["Número de Série", dados.equipamento.serial_number || "-"],
            ["Período de Locação", formatPeriodo(dados.locacao)],
          ]}
        />

        <Text style={styles.sectionTitle}>CONTRATANTE (LOCATÁRIO)</Text>
        <InfoTable
          rows={[
            ["Nome Completo", dados.contratante.nome],
            ["CPF/CNPJ", dados.contratante.documento],
            ["Endereço", dados.contratante.endereco || "-"],
            ["Responsável / Signatário", dados.contratante.responsavel],
            ["E-mail", dados.contratante.email || "-"],
          ]}
        />

        <Text style={styles.sectionTitle}>CONTRATADO (LOCADOR)</Text>
        <InfoTable
          rows={[
            ["Razão Social", CONTRATADO.razaoSocial],
            ["CNPJ", CONTRATADO.cnpj],
            ["Endereço", CONTRATADO.endereco],
            ["Responsável / Signatário", CONTRATADO.responsavel],
            ["E-mail", CONTRATADO.email],
          ]}
        />

        <Text style={styles.clauseTitle}>1ª CLÁUSULA. DO OBJETO</Text>
        <Text style={styles.paragraph}>
          O presente instrumento tem por objeto a locação temporária do equipamento {dados.equipamento.nome} (HIFU),
          devidamente registrado na ANVISA sob nº {dados.equipamento.anvisa_registro || "não informado"}, número de
          série {dados.equipamento.serial_number || "não informado"}, pelo período compreendido entre{" "}
          {formatDateBR(dados.locacao.event_date)} e {formatDateBR(dados.locacao.event_date_end || dados.locacao.event_date)}
          , para uso exclusivo em procedimentos estéticos no estabelecimento do Contratante.
        </Text>

        <Text style={styles.clauseTitle}>2ª CLÁUSULA. DO VALOR E FORMA DE PAGAMENTO</Text>
        <Text style={styles.paragraph}>
          O valor da locação é calculado com base na quantidade de disparos realizados durante o período de locação,
          conforme a tabela vigente:
        </Text>
        <Text style={styles.bullet}>
          • Até {flatPackageLimit.toLocaleString("pt-BR")} disparos: pacote fixo de {formatCurrencyBR(flatPackageValue)};
        </Text>
        <Text style={styles.bullet}>
          • De {(flatPackageLimit + 1).toLocaleString("pt-BR")} a {tier2Limit.toLocaleString("pt-BR")} disparos: pacote
          fixo de {formatCurrencyBR(flatPackageValue)} acrescido de R$ {formatRatePerShot(tier2Rate)} por disparo que
          exceder {flatPackageLimit.toLocaleString("pt-BR")};
        </Text>
        <Text style={styles.bullet}>
          • Acima de {tier2Limit.toLocaleString("pt-BR")} disparos: R$ {formatRatePerShot(tier3Rate)} por disparo sobre o
          total de disparos realizados.
        </Text>
        <Text style={styles.paragraph}>{paragrafoValorFinal}</Text>

        <Text style={styles.clauseTitle}>3ª CLÁUSULA. DAS OBRIGAÇÕES DO CONTRATANTE</Text>
        <Text style={styles.paragraph}>
          São obrigações do Contratante: (a) utilizar o equipamento exclusivamente para a finalidade para a qual foi
          locado, observando as normas sanitárias e técnicas aplicáveis; (b) não realizar qualquer modificação, reparo
          ou intervenção técnica no equipamento sem autorização prévia e por escrito do Contratado; (c)
          responsabilizar-se por danos ao equipamento decorrentes de uso inadequado, negligência, imprudência ou
          imperícia; (d) restituir o equipamento nas mesmas condições em que o recebeu, ressalvado o desgaste natural
          pelo uso correto; (e) não ceder ou sublocar o equipamento a terceiros.
        </Text>

        <Text style={styles.clauseTitle}>4ª CLÁUSULA. DAS OBRIGAÇÕES DO CONTRATADO</Text>
        <Text style={styles.paragraph}>
          São obrigações do Contratado: (a) disponibilizar o equipamento em plenas condições de funcionamento no
          início do período de locação; (b) prestar suporte técnico remoto durante o período de uso; (c) garantir que
          o equipamento esteja devidamente regularizado perante a ANVISA.
        </Text>

        <Text style={styles.clauseTitle}>5ª CLÁUSULA. DA RESPONSABILIDADE TÉCNICA E USO CLÍNICO</Text>
        <Text style={styles.paragraph}>
          O Contratante declara possuir equipe habilitada para a operação do equipamento HIFU e assume integral
          responsabilidade técnica, clínica e legal pelos procedimentos realizados durante o período de locação,
          isentando o Contratado de qualquer responsabilidade perante pacientes ou terceiros.
        </Text>

        <Text style={styles.clauseTitle}>6ª CLÁUSULA. DAS PENALIDADES</Text>
        <Text style={styles.paragraph}>{textoPenalidades(termos)}</Text>

        <Text style={styles.clauseTitle}>7ª CLÁUSULA. DA RESCISÃO</Text>
        <Text style={styles.paragraph}>{textoRescisao(termos)}</Text>

        <Text style={styles.clauseTitle}>8ª CLÁUSULA. DO FORO</Text>
        <Text style={styles.paragraph}>
          As partes elegem o Foro da Comarca de {CONTRATADO.cidadeForo} para dirimir quaisquer controvérsias oriundas
          do presente instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
        </Text>

        <Text style={styles.clauseTitle}>9ª CLÁUSULA. DAS DISPOSIÇÕES GERAIS</Text>
        <Text style={styles.paragraph}>
          Este contrato é celebrado em caráter irrevogável e irretratável, obrigando as partes, seus herdeiros e
          sucessores. O presente instrumento substitui quaisquer entendimentos anteriores sobre o objeto aqui
          pactuado.
        </Text>

        <Text style={styles.paragraph}>
          E, por estarem justas e contratadas, as partes assinam o presente instrumento via online(autentique).
        </Text>
        <Text style={styles.paragraph}>
          {CONTRATADO.cidadeForo}, {formatDataPorExtenso(dados.gerado_em)}.
        </Text>

        <View style={styles.signatures}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>{CONTRATADO.razaoSocial}</Text>
            <Text style={styles.signatureRole}>{CONTRATADO.responsavel} — CONTRATADO</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>{dados.contratante.nome}</Text>
            <Text style={styles.signatureRole}>{dados.contratante.documento} — CONTRATANTE</Text>
          </View>
        </View>

        <Text style={styles.testemunhasTitle}>TESTEMUNHAS:</Text>
        <View style={styles.signatures}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Gera o PDF do contrato inteiramente no navegador (sem passar por
 * nenhum servidor) e devolve um Blob pronto para download. Usado tanto na
 * geração original (GerarContratoModal) quanto no "baixar novamente" a
 * partir do retrato salvo em contratos_emitidos.dados.
 */
export async function gerarContratoPdfBlob(dados: ContratoDados): Promise<Blob> {
  return pdf(<ContratoDocument dados={dados} />).toBlob();
}

/**
 * Dispara o download do PDF no navegador a partir de um Blob já gerado.
 */
export function baixarPdfBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Nome de arquivo padrão para o download, já sem caracteres que
 * atrapalham em qualquer sistema de arquivos.
 */
export function nomeArquivoContrato(dados: ContratoDados): string {
  const nomeSanitizado = dados.contratante.nome.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "").trim().replace(/\s+/g, "-");
  return `Contrato-${nomeSanitizado}-${dados.locacao.event_date}.pdf`;
}
