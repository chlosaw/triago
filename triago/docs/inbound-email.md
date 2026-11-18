# Inbound email (SendGrid Inbound Parse)

Every Triago organisation has an address like `k3f9x2a7qm@in.example.com`. Mail sent there becomes a drafted ticket in that organisation's Pending queue, so demo visitors can email the app from their own inbox and watch it triage the message.

```
sender ──► MX: mx.sendgrid.net ──► SendGrid Inbound Parse ──(multipart POST)──► API /api/inbound/sendgrid/<secret>
                                                                                  finds the org, dedupes, drafts with AI
```

## How the endpoint behaves

- **Authentication.** SendGrid cannot sign Inbound Parse requests, so the secret is part of the webhook URL. A wrong or missing secret gets the same 404 as any unknown path. The secret is redacted from request logs.
- **Formats.** Both SendGrid formats work. Turn on **POST the raw, full MIME message**: the API then parses the whole message itself and handles every charset and encoding. Without it, the separate fields are decoded using SendGrid's `charsets` field.
- **Retries.** SendGrid retries any 5xx response for up to 3 days, which also covers a host that is waking from sleep (for example a free Render instance). Problems a retry cannot fix get a `200` with `{"status": "dropped", "reason": ...}` so SendGrid stops:

  | Reason         | When                                                         |
  | -------------- | ------------------------------------------------------------ |
  | `no_recipient` | None of the recipients is on `INBOUND_EMAIL_DOMAIN`          |
  | `spam`         | SendGrid's spam check is on and the score is 5 or more       |
  | `too_large`    | The message, attachments included, is over 5 MB              |
  | `too_long`     | The text body is over 100,000 characters                     |
  | `unreadable`   | The MIME message or sender address can't be parsed           |
  | `rate_limited` | The organisation already received 30 emails in the last hour |

  Mail to an address that doesn't exist answers `{"status": "ignored"}`, so the endpoint never reveals which addresses are real. Redeliveries are recognised by `Message-ID` before any model call.

- **Attachments** are skipped; the email's text becomes the ticket's first message.

## Set up

You need a domain you can add DNS records to. Use a dedicated subdomain such as `in.example.com` for demo mail.

1. **Authenticate the domain in SendGrid** (Settings → Sender Authentication). SendGrid only allows Inbound Parse on authenticated domains. If the receiving hostname is the same as the authenticated domain, turn off Automatic Security for it, or mail loops.

2. **Add the MX record** at your DNS host for the receiving subdomain:

   | Type | Host | Value              | Priority |
   | ---- | ---- | ------------------ | -------- |
   | MX   | `in` | `mx.sendgrid.net.` | 10       |

   Some hosts want the value as `10 mx.sendgrid.net.`. Don't reuse this subdomain for anything else.

3. **Configure the API.** Generate a secret with `openssl rand -hex 32` and set:

   ```bash
   INBOUND_EMAIL_DOMAIN=in.example.com
   INBOUND_WEBHOOK_SECRET=<the secret>
   ```

   Once both are set, the queue shows each organisation's address.

4. **Add the Inbound Parse setting** (Settings → Inbound Parse → Add Host & URL):
   - Receiving domain: `in.example.com`
   - Destination URL: `https://<your-api-host>/api/inbound/sendgrid/<the secret>`. SendGrid does not follow redirects, so use the final HTTPS URL.
   - Check **POST the raw, full MIME message**.
   - Optionally check **Check incoming emails for spam**.

Send a message to the address shown in the queue. It appears in Pending within a few seconds (or after the host wakes up, if it was asleep).

## Test locally

With the API running on port 3001 and `INBOUND_EMAIL_DOMAIN` and `INBOUND_WEBHOOK_SECRET` in `.env`, post what SendGrid would post. Use the address from the queue:

```bash
set -a; . ./.env; set +a
ADDR=<address from the queue>

curl -X POST "http://localhost:3001/api/inbound/sendgrid/$INBOUND_WEBHOOK_SECRET" \
  -F "email=$(printf 'From: Maya Chen <maya@orbitlabs.io>\r\nTo: %s\r\nSubject: Export to CSV keeps timing out\r\nMessage-ID: <test-1@orbitlabs.io>\r\n\r\nEvery export of last month times out.' "$ADDR")" \
  -F "envelope={\"to\":[\"$ADDR\"],\"from\":\"maya@orbitlabs.io\"}"
```

The response is `{"status":"created", ...}`, and the ticket appears in the queue. Sending the same command again returns `duplicate`.
