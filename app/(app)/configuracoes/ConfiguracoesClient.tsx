"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import type { AppSettings } from "@/lib/settings";

const TAG_PALETTE = [
  { name: "Teal", hex: "#3DBFB8" },
  { name: "Rosa", hex: "#E8789A" },
  { name: "Azul", hex: "#7EC8E3" },
  { name: "Lilás", hex: "#B8A0D0" },
  { name: "Âmbar", hex: "#F59E0B" },
  { name: "Vermelho", hex: "#EF4444" },
  { name: "Verde", hex: "#10B981" },
  { name: "Cinza", hex: "#6B7280" },
];

interface TagRow {
  id: string;
  name: string;
  color: string;
  is_automatic: boolean;
}

function n(v: string) {
  return Number(v.replace(",", "."));
}

export default function ConfiguracoesClient({
  initialSettings,
  initialTags,
}: {
  initialSettings: AppSettings;
  initialTags: TagRow[];
}) {
  const router = useRouter();
  const supabase = createClient();

  // ---- Preços ----
  const [flatPackageLimit, setFlatPackageLimit] = useState(String(initialSettings.pricing.flatPackageLimit));
  const [flatPackageValue, setFlatPackageValue] = useState(String(initialSettings.pricing.flatPackageValue));
  const [tier2Limit, setTier2Limit] = useState(String(initialSettings.pricing.tier2Limit));
  const [tier2Rate, setTier2Rate] = useState(String(initialSettings.pricing.tier2Rate));
  const [tier3Rate, setTier3Rate] = useState(String(initialSettings.pricing.tier3Rate));
  const [reservationFee, setReservationFee] = useState(String(initialSettings.reservationFee));
  const [inactiveDays, setInactiveDays] = useState(String(initialSettings.inactiveDaysThreshold));
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // ---- Tags ----
  const [tags, setTags] = useState<TagRow[]>(initialTags);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_PALETTE[0].hex);
  const [creatingTag, setCreatingTag] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(TAG_PALETTE[0].hex);

  async function handleSaveSettings() {
    const payload = {
      flat_package_limit: Math.round(n(flatPackageLimit)),
      flat_package_value: n(flatPackageValue),
      tier2_limit: Math.round(n(tier2Limit)),
      tier2_rate: n(tier2Rate),
      tier3_rate: n(tier3Rate),
      reservation_fee: n(reservationFee),
      inactive_days_threshold: Math.round(n(inactiveDays)),
    };

    if (Object.values(payload).some((v) => !Number.isFinite(v) || v < 0)) {
      setSettingsError("Todos os valores precisam ser números válidos e não negativos.");
      return;
    }
    if (payload.tier2_limit <= payload.flat_package_limit) {
      setSettingsError("O limite da faixa 2 precisa ser maior que o limite do pacote fixo.");
      return;
    }
    if (!window.confirm("Salvar essas alterações de preço? Vale para toda locação nova a partir de agora.")) return;

    setSavingSettings(true);
    setSettingsError(null);
    setSettingsSaved(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("settings")
      .update({ ...payload, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq("id", true);

    setSavingSettings(false);

    if (error) {
      setSettingsError("Não foi possível salvar. Tente novamente.");
      return;
    }
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
    router.refresh();
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    setCreatingTag(true);
    setTagError(null);

    const { data, error } = await supabase.from("tags").insert({ name, color: newTagColor }).select("id, name, color, is_automatic").single();

    setCreatingTag(false);

    if (error) {
      setTagError(error.code === "23505" ? "Já existe uma tag com esse nome." : "Não foi possível criar a tag.");
      return;
    }
    if (data) {
      setTags((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName("");
      setNewTagColor(TAG_PALETTE[0].hex);
    }
  }

  function startEdit(tag: TagRow) {
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  async function handleSaveEdit(tagId: string) {
    const name = editName.trim();
    if (!name) return;
    const { error } = await supabase.from("tags").update({ name, color: editColor }).eq("id", tagId);
    if (error) {
      setTagError(error.code === "23505" ? "Já existe uma tag com esse nome." : "Não foi possível salvar.");
      return;
    }
    setTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, name, color: editColor } : t)).sort((a, b) => a.name.localeCompare(b.name)));
    setEditingTagId(null);
  }

  async function handleDeleteTag(tag: TagRow) {
    if (!window.confirm(`Apagar a tag "${tag.name}"? Ela some de todos os clientes que a usam.`)) return;
    const { error } = await supabase.from("tags").delete().eq("id", tag.id);
    if (error) {
      setTagError("Não foi possível apagar. Tente novamente.");
      return;
    }
    setTags((prev) => prev.filter((t) => t.id !== tag.id));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Configurações</h1>

      {/* ---- Preços ---- */}
      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">Preço da locação HIPRO</h2>
        <p className="mb-4 text-xs text-neutral-400">
          Pacote fixo até um limite, depois todo o excedente vai por uma faixa só (não é progressivo).
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Limite do pacote fixo (disparos)</label>
            <input
              inputMode="numeric"
              value={flatPackageLimit}
              onChange={(e) => setFlatPackageLimit(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Valor do pacote fixo (R$)</label>
            <input
              inputMode="decimal"
              value={flatPackageValue}
              onChange={(e) => setFlatPackageValue(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Limite da faixa 2 (disparos)</label>
            <input
              inputMode="numeric"
              value={tier2Limit}
              onChange={(e) => setTier2Limit(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Taxa faixa 2 (R$/disparo)</label>
            <input
              inputMode="decimal"
              value={tier2Rate}
              onChange={(e) => setTier2Rate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Taxa faixa 3 (R$/disparo)</label>
            <input
              inputMode="decimal"
              value={tier3Rate}
              onChange={(e) => setTier3Rate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Taxa de reserva (R$)</label>
            <input
              inputMode="decimal"
              value={reservationFee}
              onChange={(e) => setReservationFee(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-neutral-400">
          Prévia: {formatCurrency(n(flatPackageValue) || 0)} até {flatPackageLimit || 0} disparos.
        </p>

        <h2 className="mb-1 mt-6 text-sm font-semibold text-neutral-900 dark:text-neutral-100">Cliente inativo</h2>
        <p className="mb-2 text-xs text-neutral-400">Dias sem locação para o cliente ganhar a badge "Inativo" na lista.</p>
        <input
          inputMode="numeric"
          value={inactiveDays}
          onChange={(e) => setInactiveDays(e.target.value)}
          className="w-full max-w-[160px] rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />

        {settingsError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{settingsError}</p>}
        {settingsSaved && <p className="mt-3 text-sm text-brand-teal">Salvo ✓</p>}

        <button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="mt-4 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {savingSettings ? "Salvando..." : "Salvar preços"}
        </button>
      </div>

      {/* ---- Tags ---- */}
      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">Tags</h2>

        <div className="space-y-2">
          {tags.map((tag) =>
            editingTagId === tag.id ? (
              <div key={tag.id} className="rounded-xl border border-brand-teal/40 p-3">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mb-2 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {TAG_PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => setEditColor(c.hex)}
                      className="h-6 w-6 rounded-full ring-offset-2"
                      style={{ backgroundColor: c.hex, boxShadow: editColor === c.hex ? `0 0 0 2px ${c.hex}` : undefined }}
                      aria-label={c.name}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingTagId(null)}
                    className="flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    <X size={14} /> Cancelar
                  </button>
                  <button
                    onClick={() => handleSaveEdit(tag.id)}
                    className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <div key={tag.id} className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm text-neutral-800 dark:text-neutral-200">{tag.name}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(tag)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDeleteTag(tag)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          )}
          {tags.length === 0 && <p className="py-4 text-center text-xs text-neutral-400">Nenhuma tag ainda.</p>}
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
          <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">Nova tag</p>
          <input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Ex: VIP"
            className="mb-2 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <div className="mb-2 flex flex-wrap gap-1.5">
            {TAG_PALETTE.map((c) => (
              <button
                key={c.hex}
                onClick={() => setNewTagColor(c.hex)}
                className="h-6 w-6 rounded-full"
                style={{ backgroundColor: c.hex, boxShadow: newTagColor === c.hex ? `0 0 0 2px ${c.hex}` : undefined }}
                aria-label={c.name}
              />
            ))}
          </div>
          {tagError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{tagError}</p>}
          <button
            onClick={handleCreateTag}
            disabled={creatingTag || !newTagName.trim()}
            className="flex items-center gap-1 rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            <Plus size={14} /> {creatingTag ? "Criando..." : "Criar tag"}
          </button>
        </div>
      </div>
    </div>
  );
}
