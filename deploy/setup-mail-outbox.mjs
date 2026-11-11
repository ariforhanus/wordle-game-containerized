#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
let enabled = false;
let id = "v1";
let destination;
function usageError() {
  console.error("Usage: node deploy/setup-mail-outbox.mjs [destination] [--key-id version] [--enable]");
  process.exit(1);
}
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--enable") {
    enabled = true;
  } else if (args[i] === "--key-id") {
    if (!args[i + 1] || args[i + 1].startsWith("--")) usageError();
    id = args[++i];
  } else if (!args[i].startsWith("--") && destination === undefined) {
    destination = resolve(args[i]);
  } else {
    usageError();
  }
}
if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
  console.error("Invalid key version");
  process.exit(1);
}
destination ??= fileURLToPath(new URL("../.mail-outbox.env", import.meta.url));
const content = [
  "# Private mail outbox key ring. Keep outside Git/images and protect backups.",
  "# MAIL_ENABLED and SMTP must be configured separately; retain old keys until pending work drains.",
  `MAIL_OUTBOX_ENABLED=${enabled}`,
  "MAIL_OUTBOX_WORKER_ENABLED=true",
  `MAIL_OUTBOX_ACTIVE_KEY_ID=${id}`,
  `MAIL_OUTBOX_KEYS=${id}:${randomBytes(32).toString("base64")}`,
  "MAIL_OUTBOX_MAX_PENDING=10000",
  "MAIL_OUTBOX_MAX_ATTEMPTS=6",
  "MAIL_OUTBOX_LEASE_SECONDS=120",
  "MAIL_OUTBOX_BATCH_SIZE=10",
  "MAIL_OUTBOX_POLL_MILLIS=5000",
  "",
].join("\n");
try {
  writeFileSync(destination, content, { flag: "wx", mode: 0o600 });
  console.log(`Created private outbox configuration: ${destination}`);
  console.log(`Outbox ${enabled ? "enabled explicitly" : "disabled until reviewed"}; no keys were printed.`);
} catch (error) {
  console.error(error.code === "EEXIST"
    ? "Refusing to overwrite existing outbox keys."
    : `Could not create outbox configuration (${error.code ?? "unknown error"}).`);
  process.exitCode = 1;
}
