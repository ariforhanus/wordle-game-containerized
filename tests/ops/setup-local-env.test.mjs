import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../deploy/setup-local-env.mjs", import.meta.url),
);
const secretKeys = [
  "POSTGRES_PASSWORD",
  "SPRING_DATASOURCE_PASSWORD",
  "JWT_SECRET",
  "ADMIN_PASSWORD",
];
function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), "wordle-env-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function generate(path) {
  return spawnSync(process.execPath, [script, path], { encoding: "utf8" });
}
function parse(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

test("generates independent strong local credentials without printing them", () =>
  fixture((directory) => {
    const path = join(directory, ".env");
    const result = generate(path);
    assert.equal(result.status, 0);
    const values = parse(path);
    const example = fileURLToPath(
      new URL("../../.env.example", import.meta.url),
    );
    assert.deepEqual(
      Object.keys(values).sort(),
      Object.keys(parse(example)).sort(),
    );
    for (const key of secretKeys) {
      assert.match(values[key], /^[A-Za-z0-9_-]{43,}$/);
      assert.ok(!(result.stdout + result.stderr).includes(values[key]));
    }
    assert.equal(
      new Set(secretKeys.map((key) => values[key])).size,
      secretKeys.length,
    );
    assert.ok(Buffer.byteLength(values.ADMIN_PASSWORD, "utf8") <= 72);
    assert.equal(values.PUBLIC_URL, "http://localhost:8080");
    assert.equal(values.ADMIN_USERNAME, "localadmin");
    assert.equal(values.MAIL_ENABLED, "false");
    assert.equal(values.REQUIRE_VERIFIED_EMAIL, "false");
    if (process.platform !== "win32")
      assert.equal(statSync(path).mode & 0o777, 0o600);
  }));

test("preserves an existing env file and database credentials", () =>
  fixture((directory) => {
    const path = join(directory, ".env");
    const original = "POSTGRES_PASSWORD=existing-fixture\n";
    writeFileSync(path, original);
    const result = generate(path);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(path, "utf8"), original);
  }));

test("each local installation receives different credentials", () =>
  fixture((directory) => {
    const first = join(directory, "first.env"),
      second = join(directory, "second.env");
    assert.equal(generate(first).status, 0);
    assert.equal(generate(second).status, 0);
    for (const key of secretKeys)
      assert.notEqual(parse(first)[key], parse(second)[key]);
  }));

test("reports a missing destination directory without claiming success", () =>
  fixture((directory) => {
    const result = generate(join(directory, "missing", ".env"));
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes("Created"));
  }));


test("explicit insecure-local flag sets only the requested test login and keeps random secrets", () =>
  fixture((directory) => {
    const path = join(directory, ".env");
    const result = spawnSync(process.execPath, [script, path, "--insecure-local-admin"], { encoding: "utf8" });
    assert.equal(result.status, 0);
    const values = parse(path);
    assert.equal(values.ADMIN_USERNAME, "admin");
    assert.equal(values.ADMIN_PASSWORD, "123456");
    assert.equal(values.ALLOW_INSECURE_LOCAL_ADMIN, "true");
    for (const key of secretKeys.filter((key) => key !== "ADMIN_PASSWORD")) {
      assert.match(values[key], /^[A-Za-z0-9_-]{43,}$/);
      assert.ok(!(result.stdout + result.stderr).includes(values[key]));
    }
    const original = readFileSync(path, "utf8");
    const repeated = spawnSync(process.execPath, [script, path, "--insecure-local-admin"], { encoding: "utf8" });
    assert.notEqual(repeated.status, 0);
    assert.equal(readFileSync(path, "utf8"), original);
  }));
