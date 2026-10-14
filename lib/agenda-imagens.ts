// Imagens da agenda para mandar às clientes: a mesma arte de "datas
// disponíveis" da Agenda, uma por mês que o período toca. Dia livre = os
// dois HIPROs sem evento não cancelado e sem bloqueio, fora domingo e dia
// passado (mesma regra da imagem da Agenda, sem o ajuste de cidade base).

import { eachDayOfInterval, endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canvasToPngFile, drawAvailabilityImage } from "./availability-image";
import { diasDoPeriodo } from "./period";

const chave = (d: Date) => format(d, "yyyy-MM-dd");

/** Meses (primeiro dia) que o período [inicio, fim] toca. */
export function mesesDoPeriodo(inicio: string, fim: string): Date[] {
  const meses: Date[] = [];
  const a = new Date(`${inicio}T12:00:00`);
  const b = new Date(`${fim}T12:00:00`);
  const fimIdx = b.getFullYear() * 12 + b.getMonth();
  for (let idx = a.getFullYear() * 12 + a.getMonth(); idx <= fimIdx && meses.length < 3; idx++) {
    meses.push(new Date(Math.floor(idx / 12), idx % 12, 1, 12));
  }
  return meses;
}

/** Dias livres de um mês, dados os ocupados. */
export function diasLivresDoMes(mes: Date, ocupados: Set<string>, hoje: Date): Set<string> {
  const dias = eachDayOfInterval({ start: startOfMonth(mes), end: endOfMonth(mes) });
  return new Set(
    dias.filter((d) => d >= hoje && d.getDay() !== 0 && !ocupados.has(chave(d))).map(chave)
  );
}

export async function gerarImagensAgenda(
  supabase: SupabaseClient,
  inicio: string,
  fim: string
): Promise<{ arquivos: File[]; previas: string[] }> {
  const hoje = startOfDay(new Date());
  const meses = mesesDoPeriodo(inicio, fim);
  const de = chave(startOfMonth(meses[0]));
  const ate = chave(endOfMonth(meses[meses.length - 1]));

  const [{ data: eventos }, { data: bloqueios }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("date_start, date_end")
      .in("event_type", ["hipro_1", "hipro_2"])
      .neq("status", "cancelada")
      .gte("date_end", de)
      .lte("date_start", ate),
    supabase.from("bloqueios_equipamento").select("data_inicio, data_fim").lte("data_inicio", ate).gte("data_fim", de),
  ]);
  const ocupados = new Set<string>();
  for (const e of eventos ?? []) for (const d of diasDoPeriodo(e.date_start, e.date_end ?? e.date_start)) ocupados.add(d);
  for (const b of bloqueios ?? []) for (const d of diasDoPeriodo(b.data_inicio, b.data_fim, 400)) ocupados.add(d);

  const arquivos: File[] = [];
  const previas: string[] = [];
  for (const mes of meses) {
    const daysInMonth = eachDayOfInterval({ start: startOfMonth(mes), end: endOfMonth(mes) });
    const canvas = await drawAvailabilityImage({
      daysInMonth,
      selectedDays: diasLivresDoMes(mes, ocupados, hoje),
      busyDates: ocupados,
      today: hoje,
    });
    arquivos.push(await canvasToPngFile(canvas, `agenda-${format(mes, "yyyy-MM")}.png`));
    previas.push(canvas.toDataURL("image/png"));
  }
  return { arquivos, previas };
}
