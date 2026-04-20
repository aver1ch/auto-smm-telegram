import crypto from "node:crypto";

import type { CalendarConfig, CalendarRule, Weekday } from "../types.js";
import { getZonedDateParts, toIsoMinuteKey } from "../utils/time.js";

const allWeekdays: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const weekdayLookup = new Set(allWeekdays);

function expandDays(raw: string): Weekday[] {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized === "*" || normalized === "daily" || normalized === "everyday") {
    return [...allWeekdays];
  }
  if (normalized === "weekdays") {
    return ["mon", "tue", "wed", "thu", "fri"];
  }
  if (normalized === "weekends") {
    return ["sat", "sun"];
  }

  const values = normalized.split(",").map((item) => item.trim()).filter(Boolean) as Weekday[];
  for (const value of values) {
    if (!weekdayLookup.has(value)) {
      throw new Error(`Invalid weekday in calendar expression: ${value}`);
    }
  }

  return Array.from(new Set(values));
}

function normalizeTime(raw: string): string {
  const value = raw.trim();
  if (!/^\d{1,2}:\d{2}$/.test(value)) {
    throw new Error(`Invalid time in calendar expression: ${value}`);
  }

  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time in calendar expression: ${value}`);
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseCalendarExpression(expression: string): CalendarRule[] {
  const normalized = expression.trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [daysRaw, timesRaw] = segment.split("@").map((part) => part.trim());
      if (!daysRaw || !timesRaw) {
        throw new Error(`Invalid calendar segment: ${segment}`);
      }

      const times = Array.from(
        new Set(
          timesRaw
            .split(",")
            .map((time) => time.trim())
            .filter(Boolean)
            .map(normalizeTime)
        )
      );

      if (times.length === 0) {
        throw new Error(`Calendar segment has no times: ${segment}`);
      }

      return {
        id: crypto.randomUUID().slice(0, 8),
        days: expandDays(daysRaw),
        times
      };
    });
}

export function createCalendarConfig(expression: string, timezone: string): CalendarConfig {
  return {
    enabled: true,
    timezone,
    rawExpression: expression,
    rules: parseCalendarExpression(expression)
  };
}

export function getMatchingCalendarSlot(config: CalendarConfig, now = new Date()): string | null {
  if (!config.enabled || config.rules.length === 0) {
    return null;
  }

  const parts = getZonedDateParts(now, config.timezone);
  const currentTime = `${parts.hour}:${parts.minute}`;
  const matched = config.rules.some((rule) => rule.days.includes(parts.weekday) && rule.times.includes(currentTime));

  if (!matched) {
    return null;
  }

  return toIsoMinuteKey(now, config.timezone);
}

export function describeCalendar(config: CalendarConfig): string {
  if (!config.enabled || config.rules.length === 0) {
    return `calendar off (${config.timezone})`;
  }

  return `${config.timezone}: ${config.rawExpression}`;
}
