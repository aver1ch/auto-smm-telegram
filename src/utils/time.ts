import type { Weekday } from "../types.js";

const weekdayMap: Record<string, Weekday> = {
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
  sun: "sun"
};

export interface ZonedDateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  weekday: Weekday;
}

export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayRaw = (values.weekday || "Mon").slice(0, 3).toLowerCase();

  return {
    year: values.year || "1970",
    month: values.month || "01",
    day: values.day || "01",
    hour: values.hour || "00",
    minute: values.minute || "00",
    weekday: weekdayMap[weekdayRaw] || "mon"
  };
}

export function toIsoMinuteKey(date: Date, timeZone: string): string {
  const parts = getZonedDateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}@${timeZone}`;
}
