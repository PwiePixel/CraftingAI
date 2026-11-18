# lishia.bond

A self-hosted AI chat platform: a polished chat interface for your users, an admin
dashboard for you, and a one-command installer that sets up HTTPS on your own domain.

- **Home page** that explains the project, its models and its current status (an
  "in development" notice that you can switch off in the admin dashboard).
- **Chat** with streaming replies, conversation history, search, rename and delete,
  Markdown with code highlighting, tables and maths, stop and regenerate, light and dark theme,
  desktop and mobile layout.
- **Three model tiers** under your own names (by default *Lishia Lite*, *Lishia Pro* and
  *Lishia Ultra*). Users switch between them in the chat; each has its own message limit.
- **Plans**: a free plan with daily limits and, optionally, paid monthly plans with a 5-hour
  and a weekly limit per model. You define names, prices and limits in the admin dashboard;
  payment runs through Stripe (subscriptions, cancellation, invoices).
- **Account settings** in sections: profile with an uploadable profile picture, plan, usage,
  appearance, security and data export.
- **Admin dashboard**: usage and spend charts, user management (roles, suspension, plans,
  per-user limits, password reset), model and limit configuration, plans and prices, branding,
  legal details, audit log.
- **Cost control**: per-user limits per tier, a global daily spending cap, bounded reply
  length and conversation memory, prompt caching.
- **Legal pages** in English: Terms of Use, Privacy Policy, Acceptable Use Policy, Legal Notice.
- **White-label**: the public site never names the model vendor. The assistant is presented
  as your own product; the Terms of Use and the Privacy Policy state truthfully that
  third-party AI providers process the requests, without naming them. (The vendor only appears
  where you, the operator, configure the API key: in the installer, the configuration file and
  the admin dashboard.)
- **Texts that follow your set-up**: under Admin → Settings → *Where the models run* you state
  whether the language models run at external providers (the default, and what the stock
  installation does) or on servers you operate yourself. The home page, the Terms of Use and the
  Privacy Policy switch their wording accordingly. Select "our own servers" only when no message
  content leaves your infrastructure.

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
| Site name and assistant name | Branding; defaults are `lishia.bond` and `Lishia` (changeable later) |
| Administrator email and password | Your first admin account (leave the password empty to generate one) |
| Public contact email (optional) | Shown in the legal pages; deliberately separate from the admin sign-in address |
| Daily spending cap (USD) | Chatting pauses for the day once the estimated spend reaches it |
| Automatic updates | Nightly deployment of new versions from Git plus OS security updates |
| Firewall | Optionally allow only SSH, HTTP and HTTPS |

It then installs Node.js and the [Caddy](https://caddyserver.com) web server, builds the
application, starts it as a sandboxed system service and configures HTTPS. **Caddy obtains the
certificate from Let's Encrypt and renews it automatically** — there is nothing to schedule.

When it finishes, open `https://your-domain/` and sign in with the administrator account.

### First steps after installing

1. **Admin → Settings**: enter your legal details (operator name, postal address, contact email,
   governing law). They appear in the Terms of Use, Privacy Policy and Legal Notice.
2. **Admin → Models & limits**: review the daily limits per tier and the daily budget.
3. **Admin → Plans** (optional): set up paid plans, see [Plans and payments](#plans-and-payments).
4. Have the legal texts checked by a lawyer before you open the site to the public. They are
   carefully written templates, not legal advice.

---

## Models and limits

| Tier | Default name | Default upstream model | Free plan: messages per user per day |
| --- | --- | --- | --- |
| Basic (default) | Lishia Lite | `claude-haiku-5-5` | 50 |
| Medium | Lishia Pro | `claude-sonnet-5-5` | 10 |
| Top | Lishia Ultra | `claude-opus-5-5` | 3 |

Everything in this table can be changed under **Admin → Models & limits**: display names and
descriptions, the upstream model, limits, maximum reply length, conversation memory, reasoning
effort, and the token prices used for the spend estimate. Users only ever see the display name
and description.

How spending is kept under control:

- **Per-user limits** per tier: per day (UTC) on the free plan, per 5 hours and per week on
  paid plans. A per-user multiplier (Admin → Users → Manage) raises or lowers them for
  individual accounts; administrators are not limited.
- **Messages are booked before the AI is called.** A message counts against the allowance as
  soon as it is accepted, whether or not the reply is cancelled, and its worst-case cost is held
  against the budget until the real numbers arrive. Only requests the provider never worked on
  are refunded.
- **Daily budget**: when today's estimated spend reaches the cap, chatting pauses for everyone
  until midnight UTC. Set it to `0` to disable the cap.
- **Registration ceiling**: a site-wide maximum of new accounts per day (Admin → Settings),
  plus per-network limits, so the free allowance cannot be multiplied without bound by creating
  throwaway accounts.
- **Bounded requests**: maximum message length, maximum reply length and a window on how much
  conversation history is sent.
- **Prompt caching**: follow-up messages in a conversation reuse the cached history at a
  fraction of the normal input price.

The spend shown in the dashboard is an estimate based on the configured prices; your provider's
console shows the authoritative figures.

---

## Plans and payments

Every account starts on the free plan with the daily limits above. Under **Admin → Plans** you
can offer up to six paid plans. For each one you set the name, description, monthly price,
feature list and, per model tier, two limits:

- a **5-hour limit**: messages within any five hours, and
- a **weekly limit**: messages within any seven days.

Both are rolling windows: a message stops counting exactly five hours (or seven days) after it
was sent. A limit of `0` leaves that model out of the plan. Users see their current usage and
the time at which the next message becomes available under **Settings → Usage**.

The installation ships with two example plans, *Plus* and *Pro*. Treat their prices and limits
as placeholders and check them against what the messages cost you.

**Prices live in your database, not in Stripe.** There are no products or prices to create in
the Stripe dashboard. When somebody subscribes, the server reads the plan from its own settings
and passes the amount to Stripe; nothing a browser sends can influence the price. A changed
price applies to new subscriptions; existing subscribers keep the price they signed up for.

### Connecting Stripe

1. In the [Stripe dashboard](https://dashboard.stripe.com) create a **secret key** (or a
   restricted key with write access to Checkout Sessions, Customers, Subscriptions and
   Customer portal).
2. Add a **webhook endpoint** with the address `https://your-domain/api/stripe/webhook` and the
   events `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated` and `customer.subscription.deleted`. Copy its signing secret
   (`whsec_…`).
3. Enter both on the server (input is hidden; the service restarts afterwards):

   ```bash
   sudo bash install.sh --stripe
   ```

4. Activate the **customer portal** once in Stripe (Settings → Billing → Customer portal). Users
   reach it through *Manage billing* in Settings → Plan.
5. Open **Admin → Plans**: the checklist at the top shows whether both keys were found.

Start with a test-mode key (`sk_test_…`) and Stripe's test cards, then run the command again
with the live key and the live webhook secret.

How it behaves:

- **Subscribing**: Settings → Plan → *Upgrade* leads to Stripe's payment page. The plan becomes
  active when Stripe confirms the payment through the webhook, usually within seconds.
- **Cancelling**: users cancel in Settings → Plan. The plan stays usable until the end of the
  paid period and then falls back to the free plan. They can undo the cancellation until then.
- **Switching plans** starts a new subscription; the previous one is ended and Stripe credits
  the unused time.
- **Failed payments**: Stripe retries; the plan stays usable in the meantime and ends when
  Stripe gives up.
- **Deleting an account** ends its subscription immediately.
- **Plans without payment**: under Admin → Users → Manage you can put any account on a paid
  plan by hand, for team members or testers. This works without Stripe.
- A plan that still has users on it cannot be removed; disable it instead, which hides it from
  new subscribers and leaves the existing ones untouched.

Before you charge money: selling subscriptions to consumers comes with legal duties that depend
on your country (withdrawal rights, cancellation, price display, taxes, invoices). The Terms of
Use contain a general section on paid plans; have it and your Stripe tax settings checked.

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
- **Rate limits** on sign-in, registration, chat, password changes and exports, keyed on the
  client network (IPv6 clients are grouped by /64). Sign-in limits are tied to where the attempts
  come from, so an attacker cannot lock somebody else out of their account. Password hashing runs
  with bounded concurrency. One reply at a time per user.
- **Bounded work per request**: long conversations are loaded and shown page by page, Markdown is
  rendered in the browser rather than on the server, and exports are streamed.
- **Uploads**: profile pictures are limited in size, decoded on the server and stored again as
  a small WebP image, so metadata and unexpected file content are never kept or served.
- **Payments**: card details are entered on Stripe's pages and never reach this server. The
  webhook only accepts requests carrying a valid Stripe signature, and each event is applied
  once. Prices are always taken from the server's own settings.
- **Privacy**: IP addresses are stored only as keyed hashes. Message content is never written
  to logs. The admin dashboard shows usage numbers, not conversations. Users can export their
  data and delete their chats or their account.
- **The API key** stays on the server in `/etc/lishia/lishia.env` (mode `0640`,
  `root:lishia`). Provider error messages are never passed on to users.
- **Service hardening**: the app runs as an unprivileged user in a systemd sandbox
  (`ProtectSystem=strict`, `NoNewPrivileges`, no capabilities) that can write only to its data
  and cache directories. The code itself is owned by root. The app listens on `127.0.0.1` only.

Not included: email verification and password-reset emails (there is no mail server
dependency). Administrators reset passwords in the dashboard or on the command line. Without
email verification, registration reveals whether an address already has an account, and people
can register with addresses they do not own; the registration ceiling and the daily budget are
the backstop.

### Running behind a CDN

The installer assumes visitors connect to Caddy directly. If you put a CDN or another proxy
(for example Cloudflare) in front, every visitor appears to come from the CDN's addresses and
would share one rate-limit bucket. In that case add the CDN's address ranges as
[`trusted_proxies`](https://caddyserver.com/docs/caddyfile/options#trusted-proxies) in
`/etc/caddy/Caddyfile` so that Caddy passes on the real client address.

---

## Operating the site

| Task | Command |
| --- | --- |
| Status | `systemctl status lishia` |
| Live logs | `journalctl -u lishia -f` |
| Restart | `sudo systemctl restart lishia` |
| HTTPS / certificate logs | `journalctl -u caddy -e` |

**Update** to the newest version with one command. It fetches the code from Git, builds the
new version next to the running one and only switches over once the build has succeeded; if the
new version fails to start, the previous one is restored. When there is nothing new, it returns
immediately.

```bash
sudo lishia-update
```

`sudo bash install.sh --update` does the same; add `--force` to rebuild although nothing changed.

If you maintain a customised copy of this project, an older `settings-schema.ts` can lack
settings that newer code expects. Before every build the installer adds such missing settings
with their defaults to the copy it builds (`scripts/repair-source.mjs`); your checkout itself
is not modified.

**Automatic updates:** if you said yes during installation, a timer runs that update every night
around 04:00, and the operating system installs its own security updates (`unattended-upgrades`).
The web server and Node.js packages are refreshed during each update as well.

```bash
systemctl list-timers lishia-update.timer
```

```bash
journalctl -u lishia-update -e
```

Switch the nightly update off or on:

```bash
sudo systemctl disable --now lishia-update.timer
```

```bash
sudo systemctl enable --now lishia-update.timer
```

Things to know about automatic updates:

- The server deploys whatever is pushed to the branch your checkout follows. Protect that
  repository (two-factor authentication, no shared write access) as carefully as the server.
- A private repository needs credentials that work without a prompt, for example a read-only
  deploy key for the user who owns the checkout.
- Keep the checkout where you ran the installer; the update command points to it. It should
  belong to root or to a user you trust with root, because its `install.sh` runs as root.

**Change the domain, API key or other answers:** `sudo bash install.sh --reconfigure`, or edit
`/etc/lishia/lishia.env` and restart the service.

**Set or replace the Stripe keys:** `sudo bash install.sh --stripe` (see
[Plans and payments](#plans-and-payments)). `--reconfigure` keeps them.

**Reset an administrator password** on the server (prints a generated password):

```bash
cd /opt/lishia/current && sudo -H -u lishia env DATA_DIR=/var/lib/lishia npm run admin -- reset you@example.com
```

Use `create` instead of `reset` to add an administrator or promote an existing account.

**Backups:** a snapshot of the database is written to `/var/lib/lishia/backups` every day
and the last seven are kept. Copy them off the server regularly. To restore, stop the service,
replace `/var/lib/lishia/lishia.db` with a snapshot (remove the `-wal` and `-shm` files
next to it), and start the service again.

**Unattended install:** every question can be answered through environment variables
(`DOMAIN`, `ACME_EMAIL`, `ANTHROPIC_API_KEY`, `SITE_NAME`, `ASSISTANT_NAME`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `CONTACT_EMAIL`, `DAILY_BUDGET_USD`, `SETUP_FIREWALL=yes|no`,
`AUTO_UPDATE=yes|no`) together with
`ASSUME_YES=1`. The same works for `--stripe` with `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET`.

### File locations

| Path | Contents |
| --- | --- |
| `/opt/lishia/current` | Application code and build of the live release (read-only for the service) |
| `/var/lib/lishia` | Database (including profile pictures) and backups |
| `/etc/lishia/lishia.env` | Configuration and secrets |
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

Paid plans can be tried the same way without a Stripe account: the bundled stand-in shows a
payment page with a single button and sends signed webhooks like the real service (see
`.env.example` for the three variables to set).

```bash
npm run mock:stripe
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
install.sh                 Server installer and updater (Node.js, Caddy, systemd, firewall, backups)
installer.sh               Alias for install.sh
scripts/                   Admin command line, database backup, source repair, mock AI provider, mock Stripe
public/logo.webp           Logo (also src/app/icon.png and apple-icon.png for browser and phone icons)
src/proxy.ts               Per-request Content-Security-Policy
src/app/(auth)             Sign-in and registration
src/app/(app)              Chat and account settings (profile, plan, usage, appearance, security, data)
src/app/(admin)            Admin dashboard
src/app/(legal)            Terms of Use, Privacy Policy, Acceptable Use Policy, Legal Notice
src/app/api                JSON API, the streaming chat endpoint, billing and the Stripe webhook
src/lib/server             Database, authentication, sessions, limits, plans, billing, AI client
src/lib/shared             Types and validation shared by server and browser
src/components             User interface
tests/                     Unit tests
```
