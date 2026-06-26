export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type HorarioDia = {
  dia_semana: DiaSemana;
  ativo: boolean;
  abre: string;
  fecha: string;
};

export type HorariosConfig = {
  horario_automatico: boolean;
  pausa_imediata: boolean;
  loja_aberta: boolean;
  fuso_horario: string;
};

/** Fuso fixo da operacao (Recife/PE) — nao exposto na UI. */
export const STORE_TIMEZONE = "America/Recife";

export function normalizeHorariosConfig(config: HorariosConfig): HorariosConfig {
  return { ...config, fuso_horario: STORE_TIMEZONE };
}

export type StoreOpenStatus = {
  abertaAgora: boolean;
  motivo: string;
  diaAtual: string;
  horarioHoje: HorarioDia | null;
  proximaAbertura: string | null;
};

export const DIAS_SEMANA: Array<{ dia: DiaSemana; label: string; short: string }> = [
  { dia: 0, label: "Domingo", short: "Dom" },
  { dia: 1, label: "Segunda-feira", short: "Seg" },
  { dia: 2, label: "Terca-feira", short: "Ter" },
  { dia: 3, label: "Quarta-feira", short: "Qua" },
  { dia: 4, label: "Quinta-feira", short: "Qui" },
  { dia: 5, label: "Sexta-feira", short: "Sex" },
  { dia: 6, label: "Sabado", short: "Sab" },
];

export const DEFAULT_HORARIOS: HorarioDia[] = DIAS_SEMANA.map((item) => ({
  dia_semana: item.dia,
  ativo: true,
  abre: item.dia === 0 ? "08:00" : item.dia === 6 ? "08:00" : "08:00",
  fecha: item.dia === 0 ? "14:00" : item.dia === 6 ? "18:00" : "20:00",
}));

export function normalizeHorarioDia(row: Partial<HorarioDia> & { dia_semana: number }): HorarioDia {
  const fallback = DEFAULT_HORARIOS.find((h) => h.dia_semana === row.dia_semana);
  return {
    dia_semana: row.dia_semana as DiaSemana,
    ativo: row.ativo ?? fallback?.ativo ?? true,
    abre: formatTimeValue(row.abre ?? fallback?.abre ?? "08:00"),
    fecha: formatTimeValue(row.fecha ?? fallback?.fecha ?? "20:00"),
  };
}

export function formatTimeValue(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "08:00";
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  const [h, m] = formatTimeValue(value).split(":").map(Number);
  return h * 60 + m;
}

export function isValidHorarioDia(horario: HorarioDia) {
  if (!horario.ativo) return true;
  return timeToMinutes(horario.abre) < timeToMinutes(horario.fecha);
}

export function getWeekdayInTimezone(date: Date, timeZone: string) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const map: Record<string, DiaSemana> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export function getMinutesInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isOpenAtSchedule(horario: HorarioDia, minutesNow: number) {
  if (!horario.ativo) return false;
  const start = timeToMinutes(horario.abre);
  const end = timeToMinutes(horario.fecha);
  return minutesNow >= start && minutesNow < end;
}

export function getCalendarDateInTimezone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isMessageBeforeCalendarDay(
  messageAt: string | null | undefined,
  reference: Date,
  timeZone: string,
) {
  if (!messageAt) return true;
  const messageDay = getCalendarDateInTimezone(new Date(messageAt), timeZone);
  const referenceDay = getCalendarDateInTimezone(reference, timeZone);
  return messageDay < referenceDay;
}

/** Converte hora local (HH:mm) no fuso informado para Date UTC. */
export function buildDateAtTimeInTimezone(reference: Date, time: string, timeZone: string) {
  const ymd = getCalendarDateInTimezone(reference, timeZone);
  const [hours, minutes] = formatTimeValue(time).split(":").map(Number);
  let utc = Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10)),
    hours,
    minutes,
    0,
    0,
  );

  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(utc));
    const localHour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const localMinute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const targetMinutes = hours * 60 + minutes;
    const localMinutes = localHour * 60 + localMinute;
    utc += (targetMinutes - localMinutes) * 60_000;
  }

  return new Date(utc);
}

export function buildStartOfDayInTimezone(reference: Date, timeZone: string) {
  return buildDateAtTimeInTimezone(reference, "00:00", timeZone);
}

/** Limite temporal: mensagens antes disso pertencem ao expediente anterior. */
export function getAttendanceClosingBoundary(
  status: StoreOpenStatus,
  config: HorariosConfig,
  now = new Date(),
): Date | null {
  if (status.abertaAgora) return null;

  const timeZone = STORE_TIMEZONE;

  if (config.pausa_imediata || !config.horario_automatico) {
    return now;
  }

  const horario = status.horarioHoje;
  if (!horario?.ativo) {
    return buildStartOfDayInTimezone(now, timeZone);
  }

  const minutesNow = getMinutesInTimezone(now, timeZone);
  const closeMinutes = timeToMinutes(horario.fecha);
  const openMinutes = timeToMinutes(horario.abre);

  if (minutesNow >= closeMinutes) {
    return buildDateAtTimeInTimezone(now, horario.fecha, timeZone);
  }

  if (minutesNow < openMinutes) {
    return buildStartOfDayInTimezone(now, timeZone);
  }

  return now;
}

/** Ultimo horario de fechamento programado que ja passou (para encerrar conversas antigas). */
export function getLastStoreCloseMoment(
  config: HorariosConfig,
  horarios: HorarioDia[],
  now = new Date(),
): Date | null {
  if (config.pausa_imediata || !config.horario_automatico) {
    return null;
  }

  const timeZone = STORE_TIMEZONE;
  const diaAtualNum = getWeekdayInTimezone(now, timeZone);
  const minutesNow = getMinutesInTimezone(now, timeZone);

  for (let offset = 0; offset < 7; offset += 1) {
    const dia = ((diaAtualNum - offset + 7) % 7) as DiaSemana;
    const horario = horarios.find((h) => h.dia_semana === dia);
    if (!horario?.ativo) continue;

    if (offset === 0 && minutesNow < timeToMinutes(horario.fecha)) {
      continue;
    }

    const ref = offset === 0 ? now : new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    return buildDateAtTimeInTimezone(ref, horario.fecha, timeZone);
  }

  return null;
}

export function resolveStoreOpenStatus(
  config: HorariosConfig,
  horarios: HorarioDia[],
  now = new Date(),
): StoreOpenStatus {
  const timeZone = STORE_TIMEZONE;
  const diaAtualNum = getWeekdayInTimezone(now, timeZone);
  const diaLabel = DIAS_SEMANA.find((d) => d.dia === diaAtualNum)?.label ?? "Hoje";
  const horarioHoje = horarios.find((h) => h.dia_semana === diaAtualNum) ?? null;
  const minutesNow = getMinutesInTimezone(now, timeZone);

  if (config.pausa_imediata) {
    return {
      abertaAgora: false,
      motivo: "Pausa imediata ativa no painel",
      diaAtual: diaLabel,
      horarioHoje,
      proximaAbertura: findNextOpening(horarios, diaAtualNum, minutesNow, timeZone, now),
    };
  }

  if (!config.horario_automatico) {
    const horarioHojeLabel =
      horarioHoje?.ativo && horarioHoje
        ? `${horarioHoje.abre} as ${horarioHoje.fecha}`
        : "sem expediente cadastrado";
    return {
      abertaAgora: config.loja_aberta,
      motivo: config.loja_aberta
        ? `Controle manual: loja aberta · Grade de hoje: ${horarioHojeLabel}`
        : `Controle manual: loja fechada · Grade de hoje: ${horarioHojeLabel}`,
      diaAtual: diaLabel,
      horarioHoje,
      proximaAbertura: config.loja_aberta
        ? null
        : findNextOpening(horarios, diaAtualNum, minutesNow, timeZone, now),
    };
  }

  if (!horarioHoje?.ativo) {
    return {
      abertaAgora: false,
      motivo: `Fechado hoje (${diaLabel})`,
      diaAtual: diaLabel,
      horarioHoje,
      proximaAbertura: findNextOpening(horarios, diaAtualNum, minutesNow, timeZone, now),
    };
  }

  const aberta = isOpenAtSchedule(horarioHoje, minutesNow);
  return {
    abertaAgora: aberta,
    motivo: aberta
      ? `Aberto — ${horarioHoje.abre} as ${horarioHoje.fecha}`
      : minutesNow < timeToMinutes(horarioHoje.abre)
        ? `Abre hoje as ${horarioHoje.abre}`
        : `Fechou hoje as ${horarioHoje.fecha}`,
    diaAtual: diaLabel,
    horarioHoje,
    proximaAbertura: aberta
      ? null
      : findNextOpening(horarios, diaAtualNum, minutesNow, timeZone, now),
  };
}

export function resolveEffectiveLojaAberta(
  config: HorariosConfig,
  horarios: HorarioDia[],
  now = new Date(),
) {
  return resolveStoreOpenStatus(config, horarios, now).abertaAgora;
}

function findNextOpening(
  horarios: HorarioDia[],
  diaAtual: DiaSemana,
  minutesNow: number,
  _timeZone: string,
  _now: Date,
) {
  for (let offset = 0; offset < 7; offset += 1) {
    const dia = ((diaAtual + offset) % 7) as DiaSemana;
    const horario = horarios.find((h) => h.dia_semana === dia);
    if (!horario?.ativo) continue;
    const abre = timeToMinutes(horario.abre);
    if (offset === 0 && minutesNow < abre) {
      const label = DIAS_SEMANA.find((d) => d.dia === dia)?.short ?? "Hoje";
      return `${label} as ${horario.abre}`;
    }
    if (offset > 0) {
      const label = DIAS_SEMANA.find((d) => d.dia === dia)?.label ?? "Proximo dia";
      return `${label} as ${horario.abre}`;
    }
  }
  return null;
}

export function sortHorarios(horarios: HorarioDia[]) {
  return [...horarios].sort((a, b) => a.dia_semana - b.dia_semana);
}

export type HorariosPainelState = {
  config: HorariosConfig;
  horarios: HorarioDia[];
  status: StoreOpenStatus;
  loja_aberta: boolean;
  schemaReady: boolean;
  warning?: string;
};

export function buildDefaultHorariosConfig(): HorariosConfig {
  return normalizeHorariosConfig({
    loja_aberta: true,
    horario_automatico: true,
    pausa_imediata: false,
    fuso_horario: STORE_TIMEZONE,
  });
}

export function ensureFullWeek(horarios: HorarioDia[]) {
  const map = new Map(horarios.map((h) => [h.dia_semana, normalizeHorarioDia(h)]));
  return DIAS_SEMANA.map((dia) => map.get(dia.dia) ?? normalizeHorarioDia({ dia_semana: dia.dia }));
}

export function buildDefaultHorariosPainelState(options?: {
  schemaReady?: boolean;
  warning?: string;
}): HorariosPainelState {
  const config = buildDefaultHorariosConfig();
  const horarios = ensureFullWeek(DEFAULT_HORARIOS);
  const status = resolveStoreOpenStatus(config, horarios);
  return {
    config,
    horarios,
    status,
    loja_aberta: resolveEffectiveLojaAberta(config, horarios),
    schemaReady: options?.schemaReady ?? false,
    warning: options?.warning,
  };
}
