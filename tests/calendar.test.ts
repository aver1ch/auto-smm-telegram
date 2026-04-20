import test from "node:test";
import assert from "node:assert/strict";

import { createCalendarConfig, getMatchingCalendarSlot, parseCalendarExpression } from "../src/scheduling/calendar.js";

test("parseCalendarExpression parses multiple segments", () => {
  const rules = parseCalendarExpression("mon,wed@09:00,18:00; sat@12:30");
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0]?.days, ["mon", "wed"]);
  assert.deepEqual(rules[0]?.times, ["09:00", "18:00"]);
  assert.deepEqual(rules[1]?.days, ["sat"]);
  assert.deepEqual(rules[1]?.times, ["12:30"]);
});

test("getMatchingCalendarSlot matches zoned minute", () => {
  const calendar = createCalendarConfig("daily@12:00", "UTC");
  const slot = getMatchingCalendarSlot(calendar, new Date("2026-04-20T12:00:10.000Z"));
  assert.equal(slot, "2026-04-20T12:00@UTC");
});
