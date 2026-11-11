// Loopback-only capture fixture. Never include this in a production deployment.
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import { readFileSync } from "node:fs";

const cert = process.env.SMTP_FIXTURE_TLS_CERT;
const key = process.env.SMTP_FIXTURE_TLS_KEY;
const username = process.env.SMTP_FIXTURE_USERNAME;
const password = process.env.SMTP_FIXTURE_PASSWORD;
if (!!cert !== !!key || !!username !== !!password) {
  throw new Error("SMTP fixture requires complete TLS and authentication pairs");
}
if (username && !cert) throw new Error("SMTP fixture authentication requires TLS");
const secureContext = cert
  ? tls.createSecureContext({ cert: readFileSync(cert), key: readFileSync(key) })
  : undefined;
const messages = [];

net.createServer((socket) => {
  let active = socket;
  let input = "";
  let data = false;
  let lines = [];
  let recipient = "";
  let secure = false;
  let authenticated = false;
  let awaitingAuth = false;
  const reply = (value) => active.write(value + "\r\n");
  const ready = () => (!secureContext || secure) && (!username || authenticated);
  const authenticate = (response) => {
    const fields = Buffer.from(response, "base64").toString("utf8").split("\0");
    authenticated = fields.length === 3 && (!fields[0] || fields[0] === username)
      && fields[1] === username && fields[2] === password;
    reply(authenticated ? "235 authenticated" : "535 fixture authentication rejected");
  };
  const consume = (chunk) => {
    input += chunk.toString("utf8");
    let end;
    while ((end = input.indexOf("\r\n")) >= 0) {
      const line = input.slice(0, end);
      input = input.slice(end + 2);
      if (data) {
        if (line === ".") {
          messages.push({ to: recipient, body: lines.join("\n"), secure, authenticated });
          data = false;
          lines = [];
          reply("250 captured");
        } else lines.push(line.replace(/^\.\./, "."));
        continue;
      }
      if (awaitingAuth) {
        awaitingAuth = false;
        authenticate(line);
        continue;
      }
      const command = line.toUpperCase();
      if (command.startsWith("EHLO") || command.startsWith("HELO")) {
        reply(["250-localhost", ...(username ? ["250-AUTH PLAIN"] : []),
          secureContext && !secure ? "250 STARTTLS" : "250 OK"].join("\r\n"));
      } else if (command === "STARTTLS" && secureContext && !secure) {
        reply("220 Ready for TLS");
        active.removeListener("data", consume);
        input = "";
        active = new tls.TLSSocket(socket, { isServer: true, secureContext });
        active.once("secure", () => { secure = true; });
        active.on("error", () => active.destroy());
        active.on("data", consume);
        return;
      } else if (command.startsWith("AUTH PLAIN") && username) {
        if (!secure) { reply("538 TLS required"); continue; }
        const response = line.slice("AUTH PLAIN".length).trim();
        if (response) authenticate(response);
        else { awaitingAuth = true; reply("334 "); }
      } else if (command.startsWith("MAIL FROM:") || command.startsWith("RCPT TO:") || command === "DATA") {
        if (!ready()) { reply("530 Secure authentication required"); continue; }
        if (command.startsWith("RCPT TO:")) {
          recipient = line.slice(8).trim().replace(/^<|>$/g, "");
          reply("250 OK");
        } else if (command === "DATA") {
          data = true;
          reply("354 End with dot");
        } else reply("250 OK");
      } else if (command === "QUIT") {
        active.end("221 bye\r\n");
      } else reply("250 OK");
    }
  };
  socket.on("error", () => active.destroy());
  socket.on("data", consume);
  reply("220 localhost test SMTP");
}).listen(2525, "127.0.0.1");

http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(messages));
}).listen(8025, "127.0.0.1");
