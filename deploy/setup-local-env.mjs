#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const destination = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../.env", import.meta.url));
const secret = () => randomBytes(32).toString("base64url");
const values = {
  POSTGRES_PASSWORD: secret(),
  SPRING_DATASOURCE_PASSWORD: secret(),
  JWT_SECRET: randomBytes(48).toString("base64url"),
  ADMIN_USERNAME: "localadmin",
  ADMIN_PASSWORD: secret(),
  ADMIN_EMAIL: "admin@example.test",
  WORDLE_DOMAIN: "localhost",
  CORS_ORIGINS: "http://localhost:8080,http://127.0.0.1:8080",
  PUBLIC_URL: "http://localhost:8080",
  MAIL_ENABLED: "false",
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
  console.log("Local URL: http://localhost:8080; admin user: localadmin");
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
