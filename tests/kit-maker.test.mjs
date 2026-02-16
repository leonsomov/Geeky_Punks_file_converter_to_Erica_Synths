import test from "node:test";
import assert from "node:assert/strict";

import { buildKitMakerPlan, KIT_MAKER_LIMIT_WARNING } from "../resources/js/kit-maker.mjs";

test("kit maker sorts files by filename ascending before numbering", () => {
  const files = [{ name: "kick.wav" }, { name: "Hat.wav" }, { name: "snare.wav" }];
  const plan = buildKitMakerPlan(files);

  assert.equal(plan.blocked, false);
  assert.deepEqual(
    plan.entries.map((entry) => entry.file.name),
    ["Hat.wav", "kick.wav", "snare.wav"]
  );
});

test("kit maker names output files from 0 to N-1", () => {
  const files = [{ name: "b.wav" }, { name: "a.wav" }, { name: "c.wav" }];
  const plan = buildKitMakerPlan(files);

  assert.equal(plan.blocked, false);
  assert.deepEqual(
    plan.entries.map((entry) => entry.outputName),
    ["0.wav", "1.wav", "2.wav"]
  );
});

test("kit maker blocks when selection is larger than 10 files", () => {
  const files = Array.from({ length: 11 }, (_, i) => ({ name: `sample-${i}.wav` }));
  const plan = buildKitMakerPlan(files);

  assert.equal(plan.blocked, true);
  assert.equal(plan.warning, KIT_MAKER_LIMIT_WARNING);
  assert.deepEqual(plan.entries, []);
});
