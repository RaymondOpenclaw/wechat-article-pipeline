import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgnesCommand } from "../src/core/agnesImageSkill.js";

test("resolveAgnesCommand honors explicit command override", async () => {
  const oldValue = process.env.AGNES_IMAGE_GEN_COMMAND;
  process.env.AGNES_IMAGE_GEN_COMMAND = "python3";
  const command = await resolveAgnesCommand();
  assert.deepEqual(command, { bin: "python3", prefixArgs: [] });
  if (oldValue === undefined) {
    delete process.env.AGNES_IMAGE_GEN_COMMAND;
  } else {
    process.env.AGNES_IMAGE_GEN_COMMAND = oldValue;
  }
});
