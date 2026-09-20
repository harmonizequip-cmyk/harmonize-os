"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { buildWhatsAppLink } from "@/lib/format";
import { canvasToPngFile, drawAvailabilityImage } from "@/lib/availability-image";

const HOME_CITY_KEY = "harmonize_cidade_base";

function toDateKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function defaultMessage(clientName?: string) {
  if (!clientName) return "";
  return `Oi, ${clientName}! Passando pra avisar as datas que já estão livres na minha agenda. Qualquer uma dessas já dá pra garantir sua sessão 💛`;
}

/**
 * Calcula quais dias do mês entram como "sugestão automática" de disponível:
 * livre nos dois HIPROs, não é dia passado, não é domingo, e (se uma cidade
 * base foi informada) não é o dia seguinte a um evento em outra cidade —
 * porque quem trabalha sozinho e viaja pode não conseguir emendar.
 * Simplificação de propósito: não calcula distância de verdade entre
 * cidades, só compara nome da cidade do evento com a cidade base. Sem
 * cidade base preenchida, essa parte do cálculo é ignorada (comportamento
 * antigo).
 */
function computeAutoFree(
  days: Date[],
  busy: Set<string>,
  cityByDate: Map<string, string>,
  homeCity: string,
  today: Date
): Set<string> {
  const home = homeCity.trim().toLowerCase();
  const travel = new Set<string>();
  if (home) {
    for (const [dateKey, city] of cityByDate) {
      if (!city || city.trim().toLowerCase() === home) continue;
      const nextKey = toDateKey(addDays(new Date(`${dateKey}T00:00:00`), 1));
      travel.add(nextKey);
    }
  }
  const free = days.filter(
    (d) => !isBefore(d, today) && d.getDay() !== 0 && !busy.has(toDateKey(d)) && !travel.has(toDateKey(d))
  );
  return new Set(free.map(toDateKey));
}

/**
 * Gera uma imagem de calendário do mês inteiro com os dias já reservados
 * circulados, pra mandar pro cliente sem expor mais nada da agenda. Usado
 * de dois jeitos: na Agenda (mode="agenda", só baixar/compartilhar) e no
 * Funil, dentro do card de um lead (mode="funil", já com mensagem e
 * atalho de WhatsApp pro número daquele cliente).
 *
 * O dia começa marcado automaticamente quando os dois equipamentos estão
 * livres, mas dá pra desmarcar qualquer um — pensado pra quem viaja pra
 * outra cidade ou trabalha sozinho e sabe de compromissos que não estão
 * na agenda do sistema. Domingo é tratado como dia fechado: nunca entra
 * na sugestão automática e não dá nem pra marcar na mão.
 */
export default function AvailabilityImageModal({
  onClose,
  mode,
  clientName,
  whatsapp,
}: {
  onClose: () => void;
  mode: "agenda" | "funil";
  clientName?: string;
  whatsapp?: string | null;
}) {
  const supabase = createClient();
  const isWhatsappMode = mode === "funil";

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [busyDates, setBusyDates] = useState<Set<string>>(new Set());
  const [cityByDate, setCityByDate] = useState<Map<string, string>>(new Map());
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [canvasFile, setCanvasFile] = useState<File | null>(null);
  const [message, setMessage] = useState(() => defaultMessage(clientName));
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState("");

  // Guarda o valor mais recente da cidade base pra usar assim que o mês
  // carrega, sem precisar recarregar do servidor a cada letra digitada no
  // campo (isso é feito só na hora de buscar um mês novo, ou quando o
  // usuário pede pra reaplicar a sugestão manualmente).
  const homeCityRef = useRef(homeCity);
  useEffect(() => {
    homeCityRef.current = homeCity;
  }, [homeCity]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HOME_CITY_KEY);
      if (saved) setHomeCity(saved);
    } catch {
      // Sem localStorage disponível (modo privado etc) — segue sem lembrar a cidade base.
    }
  }, []);

  function updateHomeCity(value: string) {
    setHomeCity(value);
    try {
      localStorage.setItem(HOME_CITY_KEY, value);
    } catch {
      // Sem localStorage disponível — só não persiste entre sessões, sem quebrar nada.
    }
  }

  const monthKey = format(currentMonth, "yyyy-MM");
  const today = startOfDay(new Date());

  const daysInMonth = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }),
    [currentMonth]
  );

  // Dias sugeridos como "viagem" (dia seguinte a um evento fora da cidade
  // base) — só pra mostrar o aviso na grade, recalculado na hora conforme a
  // cidade base muda, sem precisar buscar nada de novo no servidor.
  const travelDays = useMemo(() => {
    const home = homeCity.trim().toLowerCase();
    const travel = new Set<string>();
    if (!home) return travel;
    for (const [dateKey, city] of cityByDate) {
      if (!city || city.trim().toLowerCase() === home) continue;
      travel.add(toDateKey(addDays(new Date(`${dateKey}T00:00:00`), 1)));
    }
    return travel;
  }, [cityByDate, homeCity]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setPreviewUrl(null);
      setCanvasFile(null);
      setShareNote(null);

      const start = toDateKey(startOfMonth(currentMonth));
      const end = toDateKey(endOfMonth(currentMonth));
      // Busca com 1 dia de folga pra cada lado do mês, pra conseguir avaliar
      // o "dia seguinte" de um evento que caiu bem no último dia do mês.
      const paddedStart = toDateKey(subDays(startOfMonth(currentMonth), 1));
      const paddedEnd = toDateKey(addDays(endOfMonth(currentMonth), 1));
      const { data } = await supabase
        .from("calendar_events")
        .select("date_start, clients(city)")
        .in("event_type", ["hipro_1", "hipro_2"])
        .neq("status", "cancelada")
        .gte("date_start", paddedStart)
        .lte("date_start", paddedEnd);
      if (cancelled) return;

      const rows = (data ?? []).map((e: any) => ({
        date: e.date_start as string,
        city: (Array.isArray(e.clients) ? e.clients[0]?.city : e.clients?.city) ?? null,
      }));

      const busy = new Set(rows.filter((r) => r.date >= start && r.date <= end).map((r) => r.date));
      const cityMap = new Map<string, string>();
      for (const r of rows) {
        if (r.city && !cityMap.has(r.date)) cityMap.set(r.date, r.city);
      }

      setBusyDates(busy);
      setCityByDate(cityMap);
      setSelectedDays(computeAutoFree(daysInMonth, busy, cityMap, homeCityRef.current, today));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  function toggleDay(key: string) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    setShareNote(null);
    const canvas = await drawAvailabilityImage({ daysInMonth, selectedDays, busyDates, today });
    const file = await canvasToPngFile(canvas, `datas-disponiveis-${monthKey}.png`);
    setCanvasFile(file);
    setPreviewUrl(canvas.toDataURL("image/png"));
    setGenerating(false);
  }

  function handleDownload() {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = `datas-disponiveis-${monthKey}.png`;
    link.click();
  }

  async function handleShareWhatsapp() {
    if (!canvasFile) return;
    const canShareFiles =
      typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare({ files: [canvasFile] });

    if (canShareFiles) {
      try {
        await navigator.share({ files: [canvasFile], text: message, title: "Datas disponíveis" });
        return;
      } catch {
        // Cancelou o compartilhamento nativo ou falhou — cai no plano B abaixo.
      }
    }

    // O WhatsApp não deixa anexar imagem automaticamente por um link (só a
    // Business API oficial consegue, que não é o caso aqui). Então baixa a
    // imagem e já abre a conversa com o texto pronto — falta só anexar.
    handleDownload();
    const link = buildWhatsAppLink(whatsapp, message);
    if (link) {
      window.open(link, "_blank");
      setShareNote("Baixei a imagem e abri a conversa no WhatsApp com a mensagem pronta — só falta anexar a imagem que acabou de baixar.");
    } else {
      setShareNote("Baixei a imagem. Copie a mensagem abaixo e envie junto com ela pelo WhatsApp.");
    }
  }

  async function handleShareGeneric() {
    if (!canvasFile) return;
    const canShareFiles =
      typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare({ files: [canvasFile] });
    if (canShareFiles) {
      try {
        await navigator.share({ files: [canvasFile], title: "Datas disponíveis" });
        return;
      } catch {
        // Cancelou o compartilhamento, sem problema.
      }
    }
    handleDownload();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/95 p-5 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/95 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Datas disponíveis{clientName ? ` para ${clientName}` : ""}
        </h2>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          Dias com os dois HIPROs livres já vêm marcados. Desmarque o que não servir por logística (viagem, outro
          compromisso etc).
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Sua cidade base (opcional)
          </label>
          <input
            value={homeCity}
            onChange={(e) => updateHomeCity(e.target.value)}
            placeholder="Ex: João Pessoa"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Preenchendo isso, o dia seguinte a um evento em outra cidade já vem desmarcado sozinho (às vezes não dá
            pra emendar com uma viagem). Fica salvo só neste aparelho.
          </p>
          {homeCity.trim() && (
            <button
              type="button"
              onClick={() => setSelectedDays(computeAutoFree(daysInMonth, busyDates, cityByDate, homeCity, today))}
              className="mt-1 text-xs text-brand-teal underline underline-offset-2"
            >
              🔄 Reaplicar sugestão automática
            </button>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <p className="text-sm font-semibold capitalize text-neutral-900 dark:text-neutral-100">
            {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          <button
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">Carregando agenda do mês...</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {daysInMonth.map((day) => {
              const key = toDateKey(day);
              const isPast = isBefore(day, today);
              const isBusy = busyDates.has(key);
              // Domingo nunca entra como disponível — nem sugerido
              // automaticamente, nem selecionável na mão.
              const isSunday = day.getDay() === 0;
              const isSelected = selectedDays.has(key);
              const disabled = isPast || isBusy || isSunday;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleDay(key)}
                  className={`rounded-xl border py-2 text-xs font-medium transition ${
                    disabled
                      ? "cursor-not-allowed border-neutral-200 text-neutral-300 dark:border-neutral-800 dark:text-neutral-700"
                      : isSelected
                      ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                      : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                  }`}
                >
                  {day.getDate()}
                  {isBusy ? (
                    <span className="block text-[9px] leading-tight">ocupado</span>
                  ) : isSunday ? (
                    <span className="block text-[9px] leading-tight">fechado</span>
                  ) : (
                    travelDays.has(key) && (
                      <span className="block text-[9px] leading-tight text-amber-500">viagem?</span>
                    )
                  )}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || generating}
          className="mt-4 w-full rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {generating ? "Gerando..." : "Gerar imagem"}
        </button>

        {previewUrl && (
          <div className="mt-4 space-y-3">
            <img
              src={previewUrl}
              alt="Prévia das datas disponíveis"
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700"
            />

            {isWhatsappMode && (
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Mensagem para o cliente
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            )}

            {shareNote && (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                {shareNote}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                Baixar
              </button>
              {isWhatsappMode ? (
                <button
                  type="button"
                  onClick={handleShareWhatsapp}
                  className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
                >
                  Enviar no WhatsApp
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleShareGeneric}
                  className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
                >
                  Compartilhar
                </button>
              )}
            </div>
          </div>
        )}

        <button type="button" onClick={onClose} className="mt-4 block w-full text-center text-xs text-neutral-400 underline">
          Fechar
        </button>
      </div>
    </div>
  );
}2
