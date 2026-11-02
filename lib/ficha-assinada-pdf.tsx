// PDF da ficha assinada da sessão, gerado no aparelho (nada fica no servidor),
// para o dono mandar ao paciente pelo WhatsApp. Dados em lib/ficha-assinada.ts.
// Fonte padrão (Helvetica): só caracteres latinos, sem símbolo especial.
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { FichaAssinada } from "./ficha-assinada";

const TEAL = "#2E9A94";
const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

const s = StyleSheet.create({
  page: { padding: 34, fontFamily: "Helvetica", fontSize: 10, color: "#1d2327" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderBottomColor: "#3DBFB8", paddingBottom: 10, marginBottom: 14 },
  logo: { width: 120, height: 34, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  headerTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: TEAL },
  headerSub: { fontSize: 8, color: "#6b7780", marginTop: 2 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 12 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: TEAL, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 },
  campo: { flexDirection: "row", marginBottom: 3 },
  rotulo: { width: 140, color: "#6b7780" },
  valor: { flex: 1, fontFamily: "Helvetica-Bold" },
  pacote: { flexDirection: "row", gap: 6 },
  pacoteItem: { flex: 1, backgroundColor: "#F1F7F7", borderRadius: 6, padding: 7 },
  pacoteNum: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  pacoteRot: { fontSize: 7.5, color: "#6b7780", marginTop: 2 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dfe5e8", paddingVertical: 4 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#b9c4c9", paddingBottom: 3 },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6b7780" },
  caixa: { backgroundColor: "#F7F9FA", borderRadius: 6, padding: 8, lineHeight: 1.4 },
  assinaturas: { flexDirection: "row", gap: 16, marginTop: 6 },
  ass: { flex: 1, alignItems: "center" },
  assImg: { height: 56, width: 170, objectFit: "contain" },
  assLinha: { borderTopWidth: 0.8, borderTopColor: "#1d2327", width: "100%", marginTop: 2, paddingTop: 3, textAlign: "center", fontSize: 8, fontFamily: "Helvetica-Bold" },
  assMeta: { fontSize: 7.5, color: "#55626a", textAlign: "center", marginTop: 2 },
  verif: { marginTop: 10, fontSize: 7.5, color: "#6b7780", textAlign: "center" },
  alerta: { color: "#b42318", fontFamily: "Helvetica-Bold" },
  rodape: { position: "absolute", bottom: 20, left: 34, right: 34, fontSize: 7, color: "#8a959b", textAlign: "center" },
});

function FichaDocumento({ f, logo, rodape }: { f: FichaAssinada; logo: string; rodape: string }) {
  return (
    <Document title={f.titulo} author="Harmonize">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.headerTitle}>HARMONIZE</Text>}
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>Comprovante de Atendimento</Text>
            <Text style={s.headerSub}>HIPRO HOF · Ultrassom Microfocado</Text>
          </View>
        </View>
        <Text style={s.title}>{f.titulo}</Text>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Identificação</Text>
          {f.campos.map((c) => (
            <View key={c.rotulo} style={s.campo}>
              <Text style={s.rotulo}>{c.rotulo}</Text>
              <Text style={s.valor}>{c.valor}</Text>
            </View>
          ))}
        </View>

        {f.pacote.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Disparos do pacote</Text>
            <View style={s.pacote}>
              {f.pacote.map((x) => (
                <View key={x.rotulo} style={s.pacoteItem}>
                  <Text style={s.pacoteNum}>{fmt(x.valor)}</Text>
                  <Text style={s.pacoteRot}>{x.rotulo}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Áreas tratadas</Text>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 1 }]}>Área</Text>
            <Text style={[s.th, { width: 70, textAlign: "right" }]}>Disparos</Text>
          </View>
          {f.areas.length === 0 && <Text style={{ color: "#8a959b", paddingVertical: 6 }}>Nenhuma área registrada</Text>}
          {f.areas.map((a) => (
            <View key={a.nome} style={s.linha} wrap={false}>
              <Text style={{ flex: 1 }}>{a.nome}</Text>
              <Text style={{ width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{fmt(a.total)}</Text>
            </View>
          ))}
          {f.areas.length > 1 && (
            <View style={[s.linha, { borderBottomWidth: 0 }]}>
              <Text style={{ flex: 1, fontFamily: "Helvetica-Bold" }}>Total</Text>
              <Text style={{ width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{fmt(f.total)}</Text>
            </View>
          )}
        </View>

        {f.recomendacoes ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Recomendações</Text>
            <Text style={s.caixa}>{f.recomendacoes}</Text>
          </View>
        ) : null}

        {(f.triagem || f.termo) && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Triagem e consentimento</Text>
            <View style={s.caixa}>
              {f.triagem && <Text>Triagem: {f.triagem}</Text>}
              {f.termo && <Text style={{ marginTop: 3 }}>{f.termo}</Text>}
            </View>
          </View>
        )}

        <View wrap={false}>
          <View style={s.assinaturas}>
            {f.assinaturas.map((a) => (
              <View key={a.rotulo} style={s.ass}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                {a.src ? <Image src={a.src} style={s.assImg} /> : <View style={{ height: 56 }} />}
                <Text style={s.assLinha}>{a.rotulo}</Text>
                <Text style={s.assMeta}>
                  {a.nome}
                  {a.registro ? ` · ${a.registro}` : ""}
                </Text>
                <Text style={s.assMeta}>{a.quando}</Text>
              </View>
            ))}
          </View>
          {f.verificacao && <Text style={[s.verif, f.alterada ? s.alerta : {}]}>{f.verificacao}</Text>}
        </View>

        <Text style={s.rodape} fixed>
          {rodape}
        </Text>
      </Page>
    </Document>
  );
}

/** Gera o PDF. `logo` é um endereço de imagem (o próprio site) ou vazio. */
export async function gerarFichaAssinadaPdf(f: FichaAssinada, logo: string, rodape: string): Promise<Blob> {
  return pdf(<FichaDocumento f={f} logo={logo} rodape={rodape} />).toBlob();
}
