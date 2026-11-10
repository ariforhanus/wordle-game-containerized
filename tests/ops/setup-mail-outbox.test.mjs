import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("../../deploy/setup-mail-outbox.mjs", import.meta.url));
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "wordle-outbox-"));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function generate(file, ...args) {
  return spawnSync(process.execPath, [script, file, ...args], { encoding: "utf8" });
}
function values(file) {
  return Object.fromEntries(readFileSync(file, "utf8").split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

test("generates a private AES-256 ring without enabling delivery or printing keys", () => fixture((dir) => {
  const file = join(dir, ".mail-outbox.env");
  const result = generate(file);
  assert.equal(result.status, 0);
  const data = values(file);
  const [id, key] = data.MAIL_OUTBOX_KEYS.split(":");
  assert.equal(id, "v1");
  assert.equal(Buffer.from(key, "base64").length, 32);
  assert.equal(data.MAIL_OUTBOX_ENABLED, "false");
  assert.equal(data.MAIL_OUTBOX_ACTIVE_KEY_ID, id);
  assert.ok(!(result.stdout + result.stderr).includes(key));
  if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
}));
test("every installation gets independent key material and explicit version/enable flags", () => fixture((dir) => {
  const first = join(dir, "first.env");
  const second = join(dir, "second.env");
  assert.equal(generate(first).status, 0);
  assert.equal(generate(second, "--key-id", "v2", "--enable").status, 0);
  assert.notEqual(values(first).MAIL_OUTBOX_KEYS.split(":")[1], values(second).MAIL_OUTBOX_KEYS.split(":")[1]);
  assert.equal(values(second).MAIL_OUTBOX_ACTIVE_KEY_ID, "v2");
  assert.equal(values(second).MAIL_OUTBOX_ENABLED, "true");
}));
test("refuses overwrite and preserves an existing rotation ring", () => fixture((dir) => {
  const file = join(dir, "keys.env");
  const original = "MAIL_OUTBOX_KEYS=existing-protected-ring\n";
  writeFileSync(file, original);
  assert.notEqual(generate(file).status, 0);
  assert.equal(readFileSync(file, "utf8"), original);
}));
test("rejects invalid versions and missing directories without claiming success", () => fixture((dir) => {
  const file = join(dir, "keys.env");
  assert.notEqual(generate(file, "--key-id", "invalid:version").status, 0);
  assert.notEqual(generate(file, "--key-id").status, 0);
  assert.notEqual(generate(file, "--key-id", "--enable").status, 0);
  const result = generate(join(dir, "missing", "keys.env"));
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes("Created"));
}));
