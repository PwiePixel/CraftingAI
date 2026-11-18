# CraftingAI

A self-hosted AI chat platform: a polished chat interface for your users, an admin
dashboard for you, and a one-command installer that sets up HTTPS on your own domain.

- **Chat** with streaming replies, conversation history, search, rename and delete,
  Markdown with code highlighting, tables and maths, stop and regenerate, light and dark theme,
  desktop and mobile layout.
- **Three model tiers** under your own names (by default *Craft Lite*, *Craft Pro* and
  *Craft Ultra*). Users switch between them in the chat; each has its own daily message limit.
- **Admin dashboard**: usage and spend charts, user management (roles, suspension, per-user
  limits, password reset), model and limit configuration, branding, legal details, audit log.
- **Cost control**: per-user daily limits per tier, a global daily spending cap, bounded reply
  length and conversation memory, prompt caching.
- **Legal pages** in English: Terms of Use, Privacy Policy, Acceptable Use Policy, Legal Notice.
- **White-label**: the interface never names the model vendor. The only mention is the
  disclosure of third-party AI providers in the Terms of Use and the Privacy Policy.

Built with Next.js (App Router), React, TypeScript, Tailwind CSS and SQLite.

---

## Install on a server

### What you need

1. A server running **Ubuntu 22.04/24.04 or Debian 12/13** with root access, at least 1 GB RAM
   and ports **80** and **443** reachable from the internet.
2. A **domain** (or sub-domain) with a DNS `A` record (and `AAAA` if you use IPv6) pointing to
   the server.
3. An **Anthropic API key** (`sk-ant-…`) from <https://console.anthropic.com>.

### Run the installer

```bash
git clone https://github.com/PwiePixel/CraftingAI.git
```

```bash
cd CraftingAI
```

```bash
sudo bash install.sh
```

The installer asks for:

| Question | Used for |
| --- | --- |
| Domain | The address of your site and its HTTPS certificate |
| Email for certificate notices | Let's Encrypt account |
| Anthropic API key | Access to the AI models (input is hidden; the key is verified) |
| Site name | Branding (changeable later) |
| Administrator email and password | Your first admin account (leave the password empty to generate one) |
| Daily spending cap (USD) | Chatting pauses for the day once the estimated spend reaches it |
| Firewall | Optionally allow only SSH, HTTP and HTTPS |

It then installs Node.js and the [Caddy](https://caddyserver.com) web server, builds the
application, starts it as a sandboxed system service and configures HTTPS. **Caddy obtains the
certificate from Let's Encrypt and renews it automatically** — there is nothing to schedule.

When it finishes, open `https://your-domain/` and sign in with the administrator account.

### First steps after installing

1. **Admin → Settings**: enter your legal details (operator name, postal address, contact email,
   governing law). They appear in the Terms of Use, Privacy Policy and Legal Notice.
2. **Admin → Models & limits**: review the daily limits per tier and the daily budget.
3. Have the legal texts checked by a lawyer before you open the site to the public. They are
   carefully written templates, not legal advice.

---

## Models and limits

| Tier | Default name | Default upstream model | Messages per user per day |
| --- | --- | --- | --- |
| Basic (default) | Craft Lite | `claude-haiku-5-5` | 50 |
| Medium | Craft Pro | `claude-sonnet-5-5` | 10 |
| Top | Craft Ultra | `claude-opus-5-5` | 3 |

Everything in this table can be changed under **Admin → Models & limits**: display names and
descriptions, the upstream model, limits, maximum reply length, conversation memory, reasoning
effort, and the token prices used for the spend estimate. Users only ever see the display name
and description.

How spending is kept under control:

- **Per-user limits** per tier and day (UTC). A per-user multiplier (Admin → Users → Manage)
  raises or lowers them for individual accounts; administrators are not limited.
- **Daily budget**: when today's estimated spend reaches the cap, chatting pauses for everyone
  until midnight UTC. Set it to `0` to disable the cap.
- **Bounded requests**: maximum message length, maximum reply length and a window on how much
  conversation history is sent.
- **Prompt caching**: follow-up messages in a conversation reuse the cached history at a
  fraction of the normal input price.

The spend shown in the dashboard is an estimate based on the configured prices; your provider's
console shows the authoritative figures.

---

## Security

- **Passwords** are hashed with Argon2id. Common and very weak passwords are rejected.
- **Sessions** are random 256-bit tokens stored only as SHA-256 hashes, sent in an `HttpOnly`,
  `Secure`, `SameSite=Lax` cookie with the `__Host-` prefix. They expire after 30 days, or
  14 days without activity, and can be revoked ("Sign out other devices").
- **CSRF**: every state-changing request must come from the site's own origin.
- **Strict Content-Security-Policy** with a per-request nonce, plus HSTS, `X-Frame-Options`,
  `nosniff`, a restrictive `Permissions-Policy` and same-origin isolation headers.
- **Model output is untrusted**: Markdown is rendered without raw HTML, links open with
  `noopener noreferrer`, and remote images are never loaded.
- **Authorisation** is checked on every page and API route; conversations are always looked up
  together with their owner. The admin area answers with *404* for everyone else.
- **Rate limits** on sign-in (per address and per account), registration, chat, password
  changes and exports. One reply at a time per user.
- **Privacy**: IP addresses are stored only as keyed hashes. Message content is never written
  to logs. The admin dashboard shows usage numbers, not conversations. Users can export their
  data and delete their chats or their account.
- **The API key** stays on the server in `/etc/craftingai/craftingai.env` (mode `0640`,
  `root:craftingai`). Provider error messages are never passed on to users.
- **Service hardening**: the app runs as an unprivileged user in a systemd sandbox
  (`ProtectSystem=strict`, `NoNewPrivileges`, no capabilities) that can write only to its data
  and cache directories. The code itself is owned by root. The app listens on `127.0.0.1` only.

Not included: email verification and password-reset emails (there is no mail server
dependency). Administrators reset passwords in the dashboard or on the command line.

---

## Operating the site

| Task | Command |
| --- | --- |
| Status | `systemctl status craftingai` |
| Live logs | `journalctl -u craftingai -f` |
| Restart | `sudo systemctl restart craftingai` |
| HTTPS / certificate logs | `journalctl -u caddy -e` |

**Update** to a newer version: pull the code and run the installer again. It keeps your
configuration and data. The new version is built next to the running one and only takes over
once the build has succeeded; if it fails to start, the previous version is restored.

```bash
git pull
```

```bash
sudo bash install.sh
```

**Change the domain, API key or other answers:** `sudo bash install.sh --reconfigure`, or edit
`/etc/craftingai/craftingai.env` and restart the service.

**Reset an administrator password** on the server (prints a generated password):

```bash
cd /opt/craftingai/current && sudo -H -u craftingai env DATA_DIR=/var/lib/craftingai npm run admin -- reset you@example.com
```

Use `create` instead of `reset` to add an administrator or promote an existing account.

**Backups:** a snapshot of the database is written to `/var/lib/craftingai/backups` every day
and the last seven are kept. Copy them off the server regularly. To restore, stop the service,
replace `/var/lib/craftingai/craftingai.db` with a snapshot (remove the `-wal` and `-shm` files
next to it), and start the service again.

**Unattended install:** every question can be answered through environment variables
(`DOMAIN`, `ACME_EMAIL`, `ANTHROPIC_API_KEY`, `SITE_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`DAILY_BUDGET_USD`, `SETUP_FIREWALL=yes|no`) together with `ASSUME_YES=1`.

### File locations

| Path | Contents |
| --- | --- |
| `/opt/craftingai/current` | Application code and build of the live release (read-only for the service) |
| `/var/lib/craftingai` | Database and backups |
| `/etc/craftingai/craftingai.env` | Configuration and secrets |
| `/etc/caddy/Caddyfile` | Web server and HTTPS configuration |

---

## Development

Requires Node.js 22 or newer.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

To work without an API key, start the bundled mock provider in a second terminal and point the
app at it (see `.env.example`):

```bash
npm run mock:upstream
```

Create a local administrator:

```bash
ADMIN_PASSWORD='choose a long passphrase' npm run admin -- create you@example.com
```

Checks:

```bash
npm run lint && npm run typecheck && npm test
```

### Project layout

```
install.sh                 Server installer (Node.js, Caddy, systemd service, firewall, backups)
scripts/                   Admin command line, database backup, mock AI provider
src/proxy.ts               Per-request Content-Security-Policy
src/app/(auth)             Sign-in and registration
src/app/(app)              Chat and account settings
src/app/(admin)            Admin dashboard
src/app/(legal)            Terms of Use, Privacy Policy, Acceptable Use Policy, Legal Notice
src/app/api                JSON API and the streaming chat endpoint
src/lib/server             Database, authentication, sessions, limits, AI client
src/lib/shared             Types and validation shared by server and browser
src/components             User interface
tests/                     Unit tests
```
