import test from "node:test";
import assert from "node:assert/strict";

import { extractJsonObject } from "../src/utils/json.js";

test("extractJsonObject parses fenced JSON", () => {
  const result = extractJsonObject('```json\n{"title":"x","post":"y"}\n```');
  assert.deepEqual(result, {
    title: "x",
    post: "y"
  });
});

test("extractJsonObject parses plain JSON", () => {
  const result = extractJsonObject('{"title":"x","post":"y"}');
  assert.deepEqual(result, {
    title: "x",
    post: "y"
  });
});
