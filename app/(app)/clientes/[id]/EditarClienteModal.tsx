"use client";

import CaixaIsencaoTaxa from "@/components/CaixaIsencaoTaxa";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractCityFromAddress, toUpperOrNull, toUpperTrim } from "@/lib/format";
import ConfirmarExclusaoModal from "@/components/ConfirmarExclusaoModal";
import IndicadoPorSelect from "@/components/IndicadoPorSelect";
import { confirmar } from "@/components/Dialogos";
import { adicionarCidadeExtra } from "@/lib/cidades-cliente";
import { X } from "lucide-react";
import { usePreferencias } from "@/lib/usar-preferencias";
import { origensParaTela, rotuloDaOrigem } from "@/app/(app)/funil/NovoLeadModal";

interface Client {
  id: string;
  name: string;
  clinic_name: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  // Outras cidades onde ela atende (migration 2026-11-10-cidades-extras).
  cidades_extras?: string[] | null;
  address: string | null;
  notes: string | null;
  parceiro?: boolean;
  isento_taxa?: boolean;
  // Tabela de preço antiga (aluguel R$ 497 + disparo), migration 2026-11-07-tabela-antiga.
  tabela_antiga?: boolean;
  indicado_por?: string | null;
  origem?: string | null;
  treatment?: string | null;
  display_name?: string | null;
  // Leva W: CPF/CNPJ do contratante, usado na geração do contrato de locação.
  document?: string | null;
  // Leva X: nome/razão social e endereço alternativos para contrato e
  // NF-e, quando diferentes do cadastro (ex: quem paga/assina é uma
  // empresa, não a pessoa cadastrada). Nulos = usa name/address normais.
  contrato_nome?: string | null;
  contrato_endereco?: string | null;
}

export default function EditarClienteModal({
  client,
  bloqueioExclusao = null,
  onClose,
  onSaved,
  onDeleted,
}: {
  client: Client;
  // Motivo já conhecido pela ficha para não deixar excluir (locações ou
  // agendamentos). Nulo = mostra o botão; o banco ainda confere o resto.
  bloqueioExclusao?: string | null;
  onClose: () => void;
  onSaved: () => void;
  // Leva P.3: exclusão de lead/cliente. onDeleted navega pra fora desta
  // página (o registro deixa de existir), diferente de onSaved que só
  // atualiza a página atual.
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [name, setName] = useState(client.name);
  // Tratamento + Nome de exibição alimentam as mensagens automáticas
  // (ex: pedido de confirmação por WhatsApp) em vez do campo "Nome"
  // acima, que em cadastros antigos pode vir com tudo misturado.
  const [treatment, setTreatment] = useState<"" | "Dr." | "Dra.">((client.treatment as "Dr." | "Dra." | null) ?? "");
  const [displayName, setDisplayName] = useState(client.display_name ?? "");
  const [clinicName, setClinicName] = useState(client.clinic_name ?? "");
  const [whatsapp, setWhatsapp] = useState(client.whatsapp ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [city, setCity] = useState(client.city ?? "");
  const extrasOriginais = client.cidades_extras ?? [];
  const [cidadesExtras, setCidadesExtras] = useState<string[]>(extrasOriginais);
  const [novaCidade, setNovaCidade] = useState("");
  function adicionarExtra() {
    setCidadesExtras((l) => adicionarCidadeExtra(city, l, novaCidade));
    setNovaCidade("");
  }
  const [address, setAddress] = useState(client.address ?? "");
  // Nome evita sombrear o `document` global do navegador (usado em outros
  // arquivos do projeto, aqui não, mas é hábito seguro).
  const [documentNumber, setDocumentNumber] = useState(client.document ?? "");
  // Leva X: dados alternativos para contrato/NF-e. Ficam recolhidos por
  // padrão (ver showDadosContrato) porque só uma minoria dos clientes
  // precisa disso — a maioria usa o próprio nome/endereço do cadastro.
  const [contratoNome, setContratoNome] = useState(client.contrato_nome ?? "");
  const [contratoEndereco, setContratoEndereco] = useState(client.contrato_endereco ?? "");
  const [showDadosContrato, setShowDadosContrato] = useState(
    Boolean(client.contrato_nome || client.contrato_endereco)
  );
  const [notes, setNotes] = useState(client.notes ?? "");
  const [parceiro, setParceiro] = useState(client.parceiro ?? false);
  const [isentoTaxa, setIsentoTaxa] = useState(client.isento_taxa ?? false);
  const [tabelaAntiga, setTabelaAntiga] = useState(client.tabela_antiga ?? false);
  const [indicadoPor, setIndicadoPor] = useState<string | null>(client.indicado_por ?? null);
  // Por onde chegou (pedido do dono, 13/11/2026: corrigir indicação lançada por engano).
  const preferencias = usePreferencias();
  const origemOriginal = client.origem ?? "";
  const [origem, setOrigem] = useState(origemOriginal);
  const opcoesOrigem = (() => {
    const lista = origensParaTela(preferencias.listas.origens);
    if (origemOriginal && !lista.some((o) => o.value === origemOriginal)) {
      lista.push({ value: origemOriginal, label: rotuloDaOrigem(lista, origemOriginal) });
    }
    return lista;
  })();
  // Saiu de "indicação" nesta edição: a ligação com quem indicou e a etiqueta saem junto.
  const deixouDeSerIndicacao = origemOriginal === "indicacao" && origem !== "indicacao";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (!(await confirmar({ titulo: "Salvar as alterações no cliente?", confirmar: "Salvar" }))) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("clients")
      .update({
        name: toUpperTrim(name),
        treatment: treatment || null,
        display_name: displayName.trim() || null,
        clinic_name: toUpperOrNull(clinicName),
        whatsapp: whatsapp || null,
        email: email || null,
        city: toUpperOrNull(city),
        address: toUpperOrNull(address),
        document: documentNumber.trim() || null,
        contrato_nome: contratoNome.trim() || null,
        contrato_endereco: contratoEndereco.trim() || null,
        notes: notes || null,
        parceiro,
        isento_taxa: isentoTaxa,
        indicado_por: deixouDeSerIndicacao ? null : indicadoPor,
        ...(origem !== origemOriginal ? { origem: origem || null } : {}),
        // Nome de indicação pendente (Clientes > Indicações > Para ligar) também sai.
        ...(deixouDeSerIndicacao ? { indicacao_nome: null } : {}),
        // Cidades extras: só manda quando mudou (sem o SQL de 10/11, a coluna não existe).
        ...(JSON.stringify(cidadesExtras) !== JSON.stringify(extrasOriginais) ? { cidades_extras: cidadesExtras } : {}),
        // Só manda quando mudou: sem o SQL da tabela antiga, a coluna não existe.
        ...(tabelaAntiga !== (client.tabela_antiga ?? false) ? { tabela_antiga: tabelaAntiga } : {}),
      })
      .eq("id", client.id);
    if (!error && deixouDeSerIndicacao) {
      // A etiqueta automática "Indicação" foi posta pelo banco; tira junto.
      const { data: tag } = await supabase.from("tags").select("id").eq("name", "Indicação").maybeSingle();
      if (tag?.id) await supabase.from("client_tags").delete().eq("client_id", client.id).eq("tag_id", tag.id);
    }
    setSaving(false);
    if (error) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Editar cliente</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Tratamento</label>
              <select
                value={treatment}
                onChange={(e) => setTreatment(e.target.value as typeof treatment)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">-</option>
                <option value="Dr.">Dr.</option>
                <option value="Dra.">Dra.</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Nome de exibição</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Camila Lima"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-neutral-400">
            Usados nas mensagens ao cliente (ex: pedido de confirmação no WhatsApp). Sem os dois, a mensagem usa uma saudação genérica.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Clínica / Empresa</label>
            <input
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">WhatsApp</label>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(83) 90000-0000"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">E-mail</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Cidade</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Atende também em (outras cidades)</label>
            {cidadesExtras.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {cidadesExtras.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 py-1 pl-3 pr-1 text-xs font-semibold text-brand-teal-dark">
                    {c}
                    <button type="button" aria-label={`Tirar ${c}`} onClick={() => setCidadesExtras((l) => l.filter((x) => x !== c))} className="rounded-full p-0.5 hover:bg-white">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={novaCidade}
                onChange={(e) => setNovaCidade(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarExtra();
                  }
                }}
                placeholder="Ex.: Campina Grande"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              <button type="button" onClick={adicionarExtra} disabled={!novaCidade.trim()} className="rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-700 disabled:opacity-40">
                Adicionar
              </button>
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">Nas Melhores datas você escolhe para qual cidade olhar; o Encaixe usa a mais perto.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Endereço (opcional)</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => {
                if (!city.trim()) {
                  const detected = extractCityFromAddress(address);
                  if (detected) setCity(detected);
                }
              }}
              placeholder="Rua, número, bairro"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">CPF/CNPJ</label>
            <input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-neutral-400">Usado na geração do contrato de locação.</p>
          </div>

          {!showDadosContrato && (
            <button
              type="button"
              onClick={() => setShowDadosContrato(true)}
              className="text-xs text-brand-teal underline underline-offset-2"
            >
              + Contrato/NF-e em nome diferente do cliente
            </button>
          )}

          {showDadosContrato && (
            <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
              <p className="text-[11px] text-neutral-500">
                Preencha só se quem assina o contrato e recebe a nota fiscal for diferente do nome/endereço acima (ex:
                uma empresa). Fica valendo como padrão, mas ainda dá pra ajustar a cada contrato gerado.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  Nome/Razão social para contrato e NF-e
                </label>
                <input
                  value={contratoNome}
                  onChange={(e) => setContratoNome(e.target.value)}
                  placeholder="Deixe em branco para usar o nome acima"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  Endereço para contrato e NF-e
                </label>
                <input
                  value={contratoEndereco}
                  onChange={(e) => setContratoEndereco(e.target.value)}
                  placeholder="Deixe em branco para usar o endereço do cadastro"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Por onde chegou</label>
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {!origemOriginal && <option value="">Não informado</option>}
              {opcoesOrigem.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {deixouDeSerIndicacao && (
              <p className="mt-1 text-[11px] text-amber-700">
                Ao salvar, sai a ligação com quem indicou, a etiqueta "Indicação" e o desconto de indicação ainda não usado.
              </p>
            )}
          </div>

          {!deixouDeSerIndicacao && (
            <IndicadoPorSelect value={indicadoPor} onChange={setIndicadoPor} excludeId={client.id} />
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          {/* "Taxa de reserva" saiu: era uma taxa por cliente, e cada
              data reservada tem a sua. A taxa de cada agendamento fica na
              lista de Agendamentos. Aqui ficou o que é do cliente mesmo. */}
          <label className="flex items-start gap-2.5 rounded-lg border border-neutral-300 p-3">
            <input
              type="checkbox"
              checked={parceiro}
              onChange={(e) => setParceiro(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-teal"
            />
            <span className="text-xs text-neutral-600">
              <span className="block text-sm font-medium text-neutral-800">
                Parceiro
              </span>
              Reserva data sem pagar a taxa de compromisso.
            </span>
          </label>
          <CaixaIsencaoTaxa checked={isentoTaxa} onChange={setIsentoTaxa} parceiro={parceiro} />
          <label className="flex items-start gap-2.5 rounded-lg border border-neutral-300 p-3">
            <input
              type="checkbox"
              checked={tabelaAntiga}
              onChange={(e) => setTabelaAntiga(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-teal"
            />
            <span className="text-xs text-neutral-600">
              <span className="block text-sm font-medium text-neutral-800">Tabela antiga de preço</span>
              Aluguel R$ 497,00 + R$ 0,12 até 40.000, R$ 0,10 até 80.000 e R$ 0,08 acima (isento do aluguel); mínimo de 15.000
              disparos. A calculadora já abre nela para esta cliente, com opção de trocar na hora.
            </span>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>

        {bloqueioExclusao ? (
          <p className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
            {bloqueioExclusao}
          </p>
        ) : (
          <button
            onClick={() => setConfirmarExclusao(true)}
            className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600"
          >
            Excluir lead/cliente
          </button>
        )}

        {/* delete_record_forever (ramo clients) recusa, com a mensagem do
            banco, cliente com locação, lançamento, agendamento, crédito,
            contrato, planejamento, mentoria ou login de cliente (decisão do
            dono, 26/10/2026). Lead puro sai com tarefas, anotações,
            etiquetas e envios de campanha. Cliente de modo teste só sai se
            todos os movimentos forem de teste. */}
        {confirmarExclusao && (
          <ConfirmarExclusaoModal
            table="clients"
            id={client.id}
            onCancel={() => setConfirmarExclusao(false)}
            onDeleted={() => {
              setConfirmarExclusao(false);
              onDeleted();
            }}
          />
        )}
      </div>
    </div>
  );
}
