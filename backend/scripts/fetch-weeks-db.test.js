import test from "node:test";
import assert from "node:assert/strict";
import { getFutureWeeks, getISOWeekInfo } from "./fetch-weeks-db.js";

const localDate = (year, month, day) => new Date(year, month - 1, day, 12);

test("uses the ISO year around New Year's Day", () => {
  assert.deepEqual(getISOWeekInfo(localDate(2025, 12, 29)), { week: 1, year: 2026 });
  assert.deepEqual(getISOWeekInfo(localDate(2026, 12, 31)), { week: 53, year: 2026 });
  assert.deepEqual(getISOWeekInfo(localDate(2027, 1, 1)), { week: 53, year: 2026 });
  assert.deepEqual(getISOWeekInfo(localDate(2027, 1, 4)), { week: 1, year: 2027 });
});

test("future weeks cross week 53 without skipping or renumbering it", () => {
  assert.deepEqual(
    getFutureWeeks(4, localDate(2026, 12, 28)),
    [
      { week: 53, year: 2026 },
      { week: 1, year: 2027 },
      { week: 2, year: 2027 },
      { week: 3, year: 2027 },
    ],
  );
});
