// Cadastros que chegam do formulário (Google Forms da Contourline Academy):
// achar o cliente que já existe, separar cidade e UF e montar o convite.

import { saudacaoCurta } from "./saudacao";

export const LINK_ACADEMY = "https://academy.contourline.com.br/invites/xOP09Q/join";

export interface CadastroRecebido {
  id: string;
  respondido_em: string | null;
  recebido_em: string;
  nome: string | null;
  profissao: string | null;
  whatsapp: string | null;
  email: string | null;
  empresa: string | null;
  estabelecimento: string | null;
  cidade_estado: string | null;
}

export interface ClienteParaComparar {
  id: string;
  name: string;
  display_name: string | null;
  treatment: string | null;
  whatsapp: string | null;
  email: string | null;
  clinic_name: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  is_client: boolean | null;
}

const UFS = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")
);

/** "João Pessoa/PB", "Campina Grande - PB", "Recife PE" → cidade e UF. */
export function dividirCidadeEstado(t: string | null): { cidade: string | null; uf: string | null } {
  const s = (t ?? "").trim();
  if (!s) return { cidade: null, uf: null };
  const m = s.match(/^(.*?)[\s/,\-–]+([A-Za-z]{2})\.?$/);
  if (m && UFS.has(m[2].toUpperCase())) {
    const cidade = m[1].trim().replace(/[\s/,\-–]+$/, "");
    return { cidade: cidade || null, uf: m[2].toUpperCase() };
  }
  return { cidade: s, uf: null };
}

export const digitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/** Palavras do nome que contam: sem Dr./Dra., sem "de/da/dos", sem o que vem depois de " - ". */
export function palavrasDoNome(t: string | null | undefined): string[] {
  const base = semAcento((t ?? "").split(/\s[-–]\s/)[0]);
  return base
    .split(/[^A-Z]+/)
    .filter((p) => p.length > 1 && !["DR", "DRA", "DE", "DA", "DO", "DAS", "DOS", "E"].includes(p));
}

export type Parecido = { cliente: ClienteParaComparar; motivo: string };

/**
 * Cliente que provavelmente é a mesma pessoa: mesmo WhatsApp (8 últimos
 * dígitos), mesmo e-mail ou mesmo primeiro e último nome. Melhores primeiro.
 */
export function acharParecidos(cad: CadastroRecebido, clientes: ClienteParaComparar[], max = 3): Parecido[] {
  const zap = digitos(cad.whatsapp).slice(-8);
  const email = (cad.email ?? "").trim().toLowerCase();
  const nome = palavrasDoNome(cad.nome);
  const primeiro = nome[0];
  const ultimo = nome[nome.length - 1];
  const achados: (Parecido & { peso: number })[] = [];
  for (const c of clientes) {
    if (zap.length === 8 && digitos(c.whatsapp).slice(-8) === zap) {
      achados.push({ cliente: c, motivo: "mesmo WhatsApp", peso: 3 });
      continue;
    }
    if (email && (c.email ?? "").trim().toLowerCase() === email) {
      achados.push({ cliente: c, motivo: "mesmo e-mail", peso: 3 });
      continue;
    }
    if (primeiro && nome.length > 1) {
      const pc = palavrasDoNome(c.name);
      if (pc.includes(primeiro) && pc.includes(ultimo)) {
        achados.push({ cliente: c, motivo: "nome parecido", peso: 2 });
        continue;
      }
    }
  }
  return achados.sort((a, b) => b.peso - a.peso).slice(0, max).map(({ cliente, motivo }) => ({ cliente, motivo }));
}

/** Observação que vai junto: profissão e estabelecimento (não têm campo próprio). */
export function notaDoCadastro(cad: CadastroRecebido): string | null {
  const partes = [
    cad.profissao ? `Profissão: ${cad.profissao}` : null,
    cad.estabelecimento ? `Estabelecimento: ${cad.estabelecimento}` : null,
  ].filter(Boolean);
  return partes.length ? `Formulário Academy: ${partes.join(" · ")}` : null;
}

/** Tratamento pelo começo do nome ("Dra. Ana") ou pela profissão (Médica → Dra., Médico → Dr.). */
export function tratamentoSugerido(cad: CadastroRecebido): "Dr." | "Dra." | "" {
  const n = (cad.nome ?? "").trim().toLowerCase();
  if (/^dra\.?\s/.test(n)) return "Dra.";
  if (/^dr\.?\s/.test(n)) return "Dr.";
  const p = semAcento(cad.profissao ?? "");
  if (/\b(MEDICA|BIOMEDICA|ODONTOLOGA|CIRURGIA DENTISTA)\b/.test(p)) return "Dra.";
  if (/\b(MEDICO|BIOMEDICO|ODONTOLOGO|CIRURGIAO DENTISTA)\b/.test(p)) return "Dr.";
  return "";
}

export function mensagemConviteAcademy(nome: string | null, tratamento: string | null): string {
  return (
    `${saudacaoCurta({ name: nome, treatment: tratamento })} 😊\n\nRecebi seu cadastro. Para acessar a Contourline Academy, entre por este link e crie seu acesso:\n${LINK_ACADEMY}\n\n` +
    `Qualquer dúvida, me chama por aqui.`
  );
}
