import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns";

export function resolvePeriod(period: string | undefined, from?: string, to?: string) {
  const now = new Date();

  switch (period) {
    case "7dias":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "mes_anterior": {
      const prevMonth = subMonths(now, 1);
      return { from: startOfMonth(prevMonth), to: endOfMonth(prevMonth) };
    }
    case "personalizado":
      return {
        from: from ? startOfDay(new Date(from)) : startOfMonth(now),
        to: to ? endOfDay(new Date(to)) : endOfDay(now),
      };
    case "mes":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "hoje":
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}
