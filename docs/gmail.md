# Connecting Gmail

An organisation admin can connect one Gmail mailbox in **Settings → Mail intake → Connect Gmail**. Triago then checks the watched label every two minutes (and whenever someone clicks **Check Gmail** in the queue). It drafts a ticket in **New** for each email from the last 7 days that it has not seen before.

Triago asks for read-only access (`gmail.readonly`). It never sends, labels or deletes mail. The refresh token is stored encrypted (AES-256-GCM). Set `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 48`) so the key is separate from `JWT_SECRET`; without it, a key derived from `JWT_SECRET` is used, and changing `JWT_SECRET` then means reconnecting Gmail. Tokens saved before you add the key keep working.

## 1. Create a Google OAuth client

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project (or pick one).
2. **APIs & Services → Library**: enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External**, then fill in the app name and your email.
   - **Data access / Scopes**: add `https://www.googleapis.com/auth/gmail.readonly`.
   - **Audience / Test users**: add every Gmail address that will be connected. While the app is in _Testing_, only these accounts can sign in. `gmail.readonly` is a restricted scope, so publishing to everyone needs Google's verification.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - **Authorised redirect URI**: `http://localhost:5173/api/gmail/callback` for local development, or `https://<your-web-host>/api/gmail/callback` in production. It must match exactly.

## 2. Configure the API

Add to `.env` (or the API's environment) and restart the API:

```bash
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
# Only if the redirect URI is not <CLIENT_ORIGIN>/api/gmail/callback:
# GOOGLE_REDIRECT_URI=https://app.example.com/api/gmail/callback
```

## 3. Connect

1. Sign in as an admin and open **Settings**. The card now shows **Connect Gmail**.
2. Choose the Google account and allow read access. Google sends you back to Settings.
3. Pick the **Watched label**:
   - **Inbox**: everything in the inbox.
   - **Support** / **Bugs**: only mail with that Gmail label. Create the label in Gmail first, ideally with a filter that applies it automatically.
4. **Skip newsletters and notifications** leaves out Gmail's Promotions, Social, Updates and Forums categories.

Each check saves up to 25 emails straight away; their AI drafts run as background jobs, three at a time. The rest come in on the next check.

**Older mail.** Settings → **Import older mail** brings in the last 30 days, 90 days or year from the watched label, in the background, 100 emails per step. Emails already imported are skipped, and a message Triago can't read becomes a placeholder ticket linking to it in Gmail.

## Troubleshooting

| What you see                                                     | Why                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "Gmail is not set up on this server"                             | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing, or the API was not restarted.                          |
| Google says `redirect_uri_mismatch`                              | The redirect URI in the Google console doesn't exactly match `<CLIENT_ORIGIN>/api/gmail/callback`.              |
| Google says "Access blocked: app has not completed verification" | The account is not on the consent screen's test-user list.                                                      |
| "Reconnect Gmail in Settings"                                    | Access was revoked in the Google account, the token expired (test apps: after 7 days), or `JWT_SECRET` changed. |
| Connected, but nothing imports                                   | The watched label has no mail from the last 7 days, or the label doesn't exist in Gmail.                        |

## Security notes

- The connect link only works in the browser that clicked **Connect Gmail**: a one-time cookie is checked against the signed `state` when Google sends the admin back. A consent link forwarded to someone else is refused, so nobody can trick another person into connecting their mailbox to the wrong organisation.
