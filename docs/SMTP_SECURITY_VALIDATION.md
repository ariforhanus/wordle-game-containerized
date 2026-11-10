# Local SMTP TLS and authentication acceptance

Completed locally, 2026-11-10. This checkpoint explicitly pins
`mail.smtp.ssl.checkserveridentity=true` and tests real SMTP/STARTTLS connections.
Angus 2.0.5 already enables hostname checking by default: this is an explicit
policy/regression guard, **not** evidence that the previous version accepted
wrong hostnames. No provider, production credentials or deployment was configured.

## What was verified

| Real connection case | Result | Durable outbox result |
| --- | --- | --- |
| Trusted certificate, matching IP SAN, valid AUTH | STARTTLS precedes credentials; email accepted only after TLS/AUTH | SENT; payload removed, original capability remains single-use |
| Trusted certificate, wrong SAN | TLS identity rejected; zero AUTH or DATA | FAILED/tls, first attempt, encrypted payload removed |
| Matching SAN, untrusted certificate | TLS trust rejected; zero AUTH or DATA | FAILED/tls, first attempt, encrypted payload removed |
| AUTH rejected after valid TLS | Zero email DATA; credentials never sent in plaintext | FAILED/authentication, first attempt, payload removed |
| Server omits STARTTLS while offering AUTH | No downgrade, AUTH or DATA | PENDING/uncertain with bounded backoff |
| Server returns 454 to STARTTLS | No downgrade, AUTH or DATA | PENDING/uncertain with bounded backoff |
| Server stalls TLS handshake | Read timeout; zero AUTH or DATA | PENDING/connection with bounded backoff |

Ten transport cases cover synchronous and queued messages, actual configured
Spring Boot mail defaults, trusted/untrusted identities, STARTTLS negotiation and
AUTH. Seven real PostgreSQL/worker cases cover the same transport boundaries plus
terminal cleanup, preserved committed issuance, unchanged capability/expiry on
retry and single use after successful delivery. The worker sends actual SMTP;
AccountMail is not mocked in these integration cases.

Typed SSL/certificate failures and authentication failures stop automatically.
Angus reports missing/rejected STARTTLS as generic MessagingException, without a
structured TLS status. They follow the sanitized **uncertain** retry policy;
handshake read timeout follows **connection**. Neither path relaxes TLS, retries
immediately, mints a token, extends expiry or parses/stores provider text. Existing
attempt/expiry caps still apply. A terminal wiped job cannot be manually revived:
fix the configuration, then request a new link under the existing quotas.

## Fixtures and test reproduction

Run Java 21 with the isolated test PostgreSQL fixture, using `mvn verify` or
`-Dtest=SmtpTlsTransportTest,MailOutboxTransportIntegrationTest test`. These tests
truncate only the configured test DB, like the existing integration suite; never
point TEST_DATABASE_URL at production. Stop the browser-test app before Maven.

The JDK-bundled keytool generates fresh EC identities in JUnit temporary folders.
Certificate validity is relative (start yesterday, valid two days); there is no
fixed calendar expiry or committed PEM/private key. Test SSLContexts trust only
specific fixture certificates. No trust-all factory, global trust-store mutation,
production signing key, external DNS lookup or real mailbox is used. All sockets
bind loopback with dynamic ports and bounded timeouts. The fixture accepts either
RFC 4616 empty or matching authorization identity, without printing credentials.

`tests/fixtures/smtp.mjs` retains its default plaintext loopback capture on
2525/8025 for existing CI/local flows. For TLS browser acceptance, start it with:

- SMTP_FIXTURE_TLS_CERT and SMTP_FIXTURE_TLS_KEY pointing at fresh private local
  fixture files; a certificate with DNS:localhost and IP:127.0.0.1 SANs.
- SMTP_FIXTURE_USERNAME and SMTP_FIXTURE_PASSWORD containing only local test
  credentials. Authentication mode requires TLS; incomplete pairs fail startup.
- Configure the isolated backend with matching SMTP credentials, SMTP_AUTH=true
  and SMTP_STARTTLS=true, and trust this test certificate in that JVM's private
  test truststore. Leave system/Maven trust stores and production secrets alone.

One way to generate the local identity in an owner-only temporary directory is:

```sh
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
  -sha256 -nodes -days 2 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost,IP:127.0.0.1 \
  -keyout server.key -out server.crt
```

Do not place these files/credentials in the tracked root .env or image context.
Use a fresh temporary fixture identity/truststore for later runs; persisted test
certificates expire. The capture stores only local test emails in memory and adds
secure/authenticated metadata. It is a test helper, not a deployable mail service.

Use release assets and the real isolated backend with authentication limits on.
Set E2E_SMTP_CAPTURE_URL, E2E_BASE_URL and E2E_SMTP_TLS=true, then select
`verification and password reset use single-use email links`. The existing browser
flow now requires secure/authenticated metadata for both emails in TLS mode.
Desktop/mobile Chromium and Firefox passed: six captured emails, all TLS/AUTH.
A separate plaintext-local Chromium run passed after restarting only the owned
app/capture with local AUTH/STARTTLS disabled, preserving that supported test mode.
No frontend account behavior or endpoint contract changed.

## Remaining provider/release gates

These are controlled self-signed test identities, not a real provider's public
certificate chain, expired/intermediate/revocation matrix or deliverability proof.
Actual TLS/auth/DNS/SPF/DKIM/DMARC, clock/certificate operations, bounces/provider
limits, alert receivers, capacity, key rotation/restore and staged activation
remain open in TODO.md. The outbox is still opt-in and disabled by default;
Jenkins/CI activation remains deferred to the owner. Local success does not
activate production mail or a deployment.
