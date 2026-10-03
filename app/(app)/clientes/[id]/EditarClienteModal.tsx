"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractCityFromAddress, toUpperOrNull, toUpperTrim } from "@/lib/format";
import ConfirmarExclusaoModal from "@/components/ConfirmarExclusaoModal";
import IndicadoPorSelect from "@/components/IndicadoPorSelect";

interface Client {
  id: string;
  name: string;
  clinic_name: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  parceiro?: boolean;
  indicado_por?: string | null;
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
  onClose,
  onSaved,
  onDeleted,
}: {
  client: Client;
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
  const [indicadoPor, setIndicadoPor] = useState<string | null>(client.indicado_por ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (!window.confirm("Salvar essas alterações no cliente?")) return;
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
        indicado_por: indicadoPor,
      })
      .eq("id", client.id);
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Editar cliente</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Tratamento</label>
              <select
                value={treatment}
                onChange={(e) => setTreatment(e.target.value as typeof treatment)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="">-</option>
                <option value="Dr.">Dr.</option>
                <option value="Dra.">Dra.</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Nome de exibição</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Camila Lima"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-neutral-400">
            Usados nas mensagens ao cliente (ex: pedido de confirmação no WhatsApp). Sem os dois, a mensagem usa uma saudação genérica.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Clínica / Empresa</label>
            <input
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">WhatsApp</label>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(83) 90000-0000"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">E-mail</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Cidade</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Endereço (opcional)</label>
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">CPF/CNPJ</label>
            <input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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
            <div className="space-y-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Preencha só se quem assina o contrato e recebe a nota fiscal for diferente do nome/endereço acima (ex:
                uma empresa). Fica valendo como padrão, mas ainda dá pra ajustar a cada contrato gerado.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Nome/Razão social para contrato e NF-e
                </label>
                <input
                  value={contratoNome}
                  onChange={(e) => setContratoNome(e.target.value)}
                  placeholder="Deixe em branco para usar o nome acima"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Endereço para contrato e NF-e
                </label>
                <input
                  value={contratoEndereco}
                  onChange={(e) => setContratoEndereco(e.target.value)}
                  placeholder="Deixe em branco para usar o endereço do cadastro"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>
          )}

          <IndicadoPorSelect value={indicadoPor} onChange={setIndicadoPor} excludeId={client.id} />

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          {/* "Taxa de reserva" saiu: era uma taxa por cliente, e cada
              data reservada tem a sua. A taxa de cada agendamento fica na
              lista de Agendamentos. Aqui ficou o que é do cliente mesmo. */}
          <label className="flex items-start gap-2.5 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
            <input
              type="checkbox"
              checked={parceiro}
              onChange={(e) => setParceiro(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-teal"
            />
            <span className="text-xs text-neutral-600 dark:text-neutral-400">
              <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
                Parceiro
              </span>
              Reserva data sem pagar a taxa de compromisso.
            </span>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
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

        <button
          onClick={() => setConfirmarExclusao(true)}
          className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 dark:border-red-900/50 dark:text-red-400"
        >
          Excluir lead/cliente
        </button>

        {/* Leva P.3: delete_record_forever bloqueia sozinho (com uma
            mensagem clara) se este lead/cliente já tiver locação,
            pagamento ou lançamento financeiro no histórico — nunca
            cascateia sobre dinheiro de verdade. */}
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
