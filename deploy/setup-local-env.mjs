#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const options = process.argv.slice(2);
const insecureLocalAdmin = options.includes("--insecure-local-admin");
const paths = options.filter((option) => option !== "--insecure-local-admin");
if (paths.length > 1 || paths.some((path) => path.startsWith("--"))) {
  console.error("Usage: node deploy/setup-local-env.mjs [destination] [--insecure-local-admin]");
  process.exit(1);
}
const destination = paths[0]
  ? resolve(paths[0])
  : fileURLToPath(new URL("../.env", import.meta.url));
const secret = () => randomBytes(32).toString("base64url");
const values = {
  POSTGRES_PASSWORD: secret(),
  SPRING_DATASOURCE_PASSWORD: secret(),
  JWT_SECRET: randomBytes(48).toString("base64url"),
  ADMIN_USERNAME: insecureLocalAdmin ? "admin" : "localadmin",
  ADMIN_PASSWORD: insecureLocalAdmin ? "123456" : secret(),
  ADMIN_EMAIL: "admin@example.test",
  ALLOW_INSECURE_LOCAL_ADMIN: String(insecureLocalAdmin),
  WORDLE_DOMAIN: "localhost",
  CORS_ORIGINS: "http://localhost:8080,http://127.0.0.1:8080",
  PUBLIC_URL: "http://localhost:8080",
  MAIL_ENABLED: "false",
  MAIL_OUTBOX_ENABLED: "false",
  MAIL_OUTBOX_WORKER_ENABLED: "true",
  MAIL_OUTBOX_ACTIVE_KEY_ID: "",
  MAIL_OUTBOX_KEYS: "",
  MAIL_OUTBOX_MAX_PENDING: "10000",
  MAIL_OUTBOX_MAX_ATTEMPTS: "6",
  MAIL_OUTBOX_LEASE_SECONDS: "120",
  MAIL_OUTBOX_BATCH_SIZE: "10",
  MAIL_OUTBOX_POLL_MILLIS: "5000",
  MAIL_FROM: "wordle@localhost",
  SMTP_HOST: "",
  SMTP_PORT: "587",
  SMTP_USERNAME: "",
  SMTP_PASSWORD: "",
  SMTP_AUTH: "true",
  SMTP_STARTTLS: "true",
  REQUIRE_VERIFIED_EMAIL: "false",
  BACKUP_RETENTION_DAYS: "14",
};
const content = [
  "# Generated for local Docker Compose testing; keep this file out of Git.",
  "# SMTP is disabled. Empty SMTP credentials are intentional until a provider is configured.",
  ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
  "",
].join("\n");
try {
  writeFileSync(destination, content, { flag: "wx", mode: 0o600 });
  console.log(`Created ${destination}`);
  console.log(`Local URL: http://localhost:8080; admin user: ${values.ADMIN_USERNAME}`);
  console.log(
    "Read ADMIN_PASSWORD from .env. Mail is disabled. Existing database volumes keep their old credentials.",
  );
} catch (error) {
  if (error.code === "EEXIST") {
    console.error(
      "Refusing to overwrite an existing env file; its credentials were preserved.",
    );
  } else {
    console.error(
      `Could not create env file (${error.code ?? "unknown error"}).`,
    );
  }
  process.exitCode = 1;
}
