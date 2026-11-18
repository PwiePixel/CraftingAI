#!/usr/bin/env bash
#
# lishia.bond installer for Debian and Ubuntu servers.
#
#   sudo bash install.sh                install (or update an existing installation)
#   sudo bash install.sh --update       fetch the newest version from Git and deploy it
#   sudo bash install.sh --update --force   rebuild even when nothing has changed
#   sudo bash install.sh --reconfigure  ask all questions again
#   sudo bash install.sh --stripe       enter or change the Stripe keys for paid plans
#
# After the installation the same update is available as:  sudo lishia-update
#
# What it does:
#   1. Installs Node.js, the Caddy web server and build tools.
#   2. Asks for your domain, the API key for the AI models and an admin account.
#   3. Builds the application and runs it as a locked-down system service.
#   4. Configures HTTPS for your domain. Caddy obtains the certificate from
#      Let's Encrypt and renews it automatically; no cron job is needed.
#   5. Sets up a daily database backup and (optionally) the firewall.
#   6. Optionally keeps everything up to date by itself: a nightly timer
#      deploys new versions from your Git repository, and the operating
#      system installs its security updates automatically.
#
# Every answer can also be supplied as an environment variable for unattended
# installs: DOMAIN, ACME_EMAIL, ANTHROPIC_API_KEY, SITE_NAME, ASSISTANT_NAME,
# ADMIN_EMAIL, ADMIN_PASSWORD, CONTACT_EMAIL, DAILY_BUDGET_USD,
# SETUP_FIREWALL (yes/no), AUTO_UPDATE (yes/no), ASSUME_YES=1.
# SKIP_DNS_CHECK=1 and SKIP_KEY_CHECK=1 skip the respective pre-flight checks.

set -Eeuo pipefail

APP_NAME="lishia"
APP_USER="lishia"
APP_DIR="/opt/lishia"
DATA_DIR="/var/lib/lishia"
CONF_DIR="/etc/lishia"
ENV_FILE="${CONF_DIR}/lishia.env"
RELEASES_DIR="${APP_DIR}/releases"
CURRENT_LINK="${APP_DIR}/current"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
CADDYFILE="/etc/caddy/Caddyfile"
APP_PORT="${APP_PORT:-3000}"
NODE_MAJOR="${NODE_MAJOR:-24}"
MIN_NODE_MAJOR=22
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

UPDATE_CMD="/usr/local/sbin/${APP_NAME}-update"
DEPLOYED_FILE="${CONF_DIR}/deployed-commit"

RECONFIGURE=0
STRIPE_ONLY=0
UPDATE_ONLY=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --reconfigure) RECONFIGURE=1 ;;
    --update) UPDATE_ONLY=1 ;;
    --stripe) STRIPE_ONLY=1 ;;
    --force) FORCE=1 ;;
    -h | --help)
      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

# ---------------------------------------------------------------- output ----

if [[ -t 1 ]]; then
  BOLD=$'\033[1m' DIM=$'\033[2m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' BLUE=$'\033[34m' RESET=$'\033[0m'
else
  BOLD="" DIM="" RED="" GREEN="" YELLOW="" BLUE="" RESET=""
fi

step() { printf '\n%s==>%s %s%s%s\n' "$BLUE" "$RESET" "$BOLD" "$*" "$RESET"; }
info() { printf '    %s\n' "$*"; }
ok() { printf '    %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die() {
  printf '\n%sError:%s %s\n' "$RED" "$RESET" "$*" >&2
  exit 1
}

SWAP_FILE=""
RELEASE_DIR=""
RELEASE_LIVE=0
WORK_DIR=""
cleanup() {
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then rm -rf "$WORK_DIR"; fi
  if [[ -n "$SWAP_FILE" && -f "$SWAP_FILE" ]]; then
    swapoff "$SWAP_FILE" 2>/dev/null || true
    rm -f "$SWAP_FILE"
  fi
  # A release that never went live is removed again.
  if [[ -n "$RELEASE_DIR" && "$RELEASE_LIVE" -eq 0 && -d "$RELEASE_DIR" ]]; then
    rm -rf "$RELEASE_DIR"
  fi
}
trap cleanup EXIT
trap 'printf "\n%sInstallation failed%s near line %s. Nothing above this line was rolled back; fix the problem and run the installer again.\n" "$RED" "$RESET" "$LINENO" >&2' ERR

# ----------------------------------------------------------------- input ----

# Questions are read from the terminal even when the script itself is piped in.
if [[ -r /dev/tty ]] && [[ "${ASSUME_YES:-0}" != "1" ]] && [[ "$UPDATE_ONLY" -eq 0 ]]; then
  INTERACTIVE=1
else
  INTERACTIVE=0
fi

ask() { # ask VAR "Question" [default]
  local var="$1" prompt="$2" default="${3:-}" answer=""
  if [[ -n "${!var:-}" ]]; then return 0; fi
  if [[ "$INTERACTIVE" != "1" ]]; then
    [[ -n "$default" ]] || die "$var is required. Set it as an environment variable for unattended installs."
    printf -v "$var" '%s' "$default"
    return 0
  fi
  if [[ -n "$default" ]]; then
    read -r -p "    $prompt [$default]: " answer </dev/tty
  else
    read -r -p "    $prompt: " answer </dev/tty
  fi
  printf -v "$var" '%s' "${answer:-$default}"
}

ask_secret() { # ask_secret VAR "Question"
  local var="$1" prompt="$2" answer=""
  if [[ -n "${!var:-}" ]]; then return 0; fi
  [[ "$INTERACTIVE" == "1" ]] || return 0
  read -r -s -p "    $prompt: " answer </dev/tty
  printf '\n'
  printf -v "$var" '%s' "$answer"
}

confirm() { # confirm "Question" default(y/n)
  local prompt="$1" default="${2:-y}" answer=""
  [[ "$INTERACTIVE" == "1" ]] || { [[ "$default" == "y" ]]; return; }
  local hint="[Y/n]"
  [[ "$default" == "y" ]] || hint="[y/N]"
  read -r -p "    $prompt $hint " answer </dev/tty
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy] ]]
}

valid_domain() { [[ "$1" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$ ]]; }
# Deliberately strict: these values are written into configuration files.
valid_email() { [[ "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$ ]]; }

# ------------------------------------------------------------------- git ----

is_git_checkout() { [[ -d "${SOURCE_DIR}/.git" ]] && command -v git >/dev/null 2>&1; }

# Git always runs as the owner of the checkout, never as root, and never
# stops to ask for a password.
source_git() {
  local owner home
  owner="$(stat -c %U "$SOURCE_DIR")"
  if [[ "$owner" == "root" || "$owner" == "UNKNOWN" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$SOURCE_DIR" "$@"
  else
    home="$(getent passwd "$owner" | cut -d: -f6)"
    runuser -u "$owner" -- env HOME="${home:-/nonexistent}" GIT_TERMINAL_PROMPT=0 git -C "$SOURCE_DIR" "$@"
  fi
}

source_commit() {
  if is_git_checkout; then source_git rev-parse HEAD 2>/dev/null || true; fi
}

# ----------------------------------------------------------- pre-flight ----

[[ "$(id -u)" -eq 0 ]] || die "Please run this installer as root:  sudo bash install.sh"
[[ -f "${SOURCE_DIR}/package.json" ]] || die "Run install.sh from inside the project directory (package.json not found)."
case "${SOURCE_DIR}/" in
  "${APP_DIR}/"*) die "Keep the downloaded project outside ${APP_DIR} (for example in /root/CraftingAI) and run install.sh from there." ;;
esac
command -v apt-get >/dev/null 2>&1 || die "This installer supports Debian and Ubuntu (apt-get was not found)."
command -v systemctl >/dev/null 2>&1 || die "systemd is required."

# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
  ubuntu | debian) ;;
  *) warn "Untested distribution '${ID:-unknown}'. Continuing, but Debian or Ubuntu is recommended." ;;
esac

# Only one installation or update may run at a time (manual run vs. nightly
# timer). The script re-runs itself under "flock", which holds the lock in a
# separate process: programs started from here (such as the service itself)
# can therefore never keep the lock alive by accident.
if [[ "${LISHIA_LOCKED:-0}" != "1" ]]; then
  LOCK_DIR="/run/lock"
  [[ -d "$LOCK_DIR" ]] || LOCK_DIR="/var/lock"
  LOCK_STATUS=0
  LISHIA_LOCKED=1 flock --nonblock --close --conflict-exit-code 75 \
    "${LOCK_DIR}/${APP_NAME}-install.lock" bash "${BASH_SOURCE[0]}" "$@" || LOCK_STATUS=$?
  if [[ "$LOCK_STATUS" -eq 75 ]]; then
    die "Another installation or update is already running. Try again in a few minutes."
  fi
  exit "$LOCK_STATUS"
fi

if [[ "${LISHIA_SOURCE_READY:-0}" != "1" ]]; then
  printf '\n%s%s installer%s\n' "$BOLD" "lishia.bond" "$RESET"
  printf '%sSelf-hosted AI chat with automatic HTTPS.%s\n' "$DIM" "$RESET"
fi

if [[ "$UPDATE_ONLY" -eq 1 ]]; then
  [[ "$RECONFIGURE" -eq 0 ]] || die "--update and --reconfigure cannot be combined."
  [[ -f "$ENV_FILE" ]] || die "lishia.bond is not installed on this server yet. Run:  sudo bash install.sh"
  if [[ "${LISHIA_SOURCE_READY:-0}" != "1" ]] && is_git_checkout; then
    step "Fetching the latest version"
    if ! source_git pull --ff-only --quiet; then
      warn "The checkout in ${SOURCE_DIR} could not be updated from its Git repository."
      warn "Typical causes: no network, a private repository without stored credentials"
      warn "(set up a deploy key), or local changes that conflict with the new version."
      die "Nothing was changed; the running version stays as it is."
    fi
    ok "Source is at commit $(source_git rev-parse --short HEAD)"
    # Carry on with the installer that was just fetched, not with this copy.
    exec env LISHIA_SOURCE_READY=1 bash "${SOURCE_DIR}/install.sh" "$@"
  fi
fi

# ----------------------------------------------------------------- stripe ----

# "--stripe" only stores the payment keys and restarts the service.
if [[ "$STRIPE_ONLY" -eq 1 ]]; then
  [[ -f "$ENV_FILE" ]] || die "lishia.bond is not installed on this server yet. Run:  sudo bash install.sh"
  step "Stripe keys for paid plans"
  info "Both values come from the Stripe dashboard. Input is hidden."
  info "Webhook address to register there:  $(sed -n 's/^APP_URL=//p' "$ENV_FILE" | tr -d '"')/api/stripe/webhook"
  while true; do
    ask_secret STRIPE_SECRET_KEY "Secret key (starts with sk_ or rk_)"
    [[ "${STRIPE_SECRET_KEY:-}" =~ ^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$ ]] && break
    warn "That does not look like a Stripe secret key."
    [[ "$INTERACTIVE" == "1" ]] || die "Invalid or missing STRIPE_SECRET_KEY."
    STRIPE_SECRET_KEY=""
  done
  while true; do
    ask_secret STRIPE_WEBHOOK_SECRET "Webhook signing secret (starts with whsec_)"
    [[ "${STRIPE_WEBHOOK_SECRET:-}" =~ ^whsec_[A-Za-z0-9]{16,}$ ]] && break
    warn "That does not look like a webhook signing secret."
    [[ "$INTERACTIVE" == "1" ]] || die "Invalid or missing STRIPE_WEBHOOK_SECRET."
    STRIPE_WEBHOOK_SECRET=""
  done

  umask 077
  { grep -v -E '^(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)=' "$ENV_FILE" || true
    printf 'STRIPE_SECRET_KEY=%s\n' "$STRIPE_SECRET_KEY"
    printf 'STRIPE_WEBHOOK_SECRET=%s\n' "$STRIPE_WEBHOOK_SECRET"
  } >"${ENV_FILE}.new"
  umask 022
  chown root:"$APP_USER" "${ENV_FILE}.new"
  chmod 0640 "${ENV_FILE}.new"
  mv -f "${ENV_FILE}.new" "$ENV_FILE"
  systemctl restart "$APP_NAME"
  ok "Keys saved and service restarted"
  [[ "$STRIPE_SECRET_KEY" == *_test_* ]] && info "This is a test-mode key: no real money is charged."
  info "Check the result under Admin -> Plans."
  exit 0
fi

# Private scratch space: nothing sensitive is ever placed in a shared directory.
WORK_DIR="$(mktemp -d)"
chmod 700 "$WORK_DIR"

UPDATE=0
if [[ -f "$ENV_FILE" && "$RECONFIGURE" -eq 0 ]]; then
  UPDATE=1
  if [[ "$UPDATE_ONLY" -eq 0 ]]; then
    step "Existing installation found"
    info "Updating the application and keeping your configuration and data."
    info "Run with --reconfigure to change the domain, API key or other answers."
  fi
fi
SOURCE_COMMIT="$(source_commit)"

# ------------------------------------------------------------ questions ----

if [[ "$UPDATE" -eq 0 ]]; then
  step "Configuration"

  # Keep secrets from a previous installation when reconfiguring.
  OLD_SECRET=""
  OLD_EFFECTIVE_DATE=""
  OLD_STRIPE_LINES=""
  if [[ -f "$ENV_FILE" ]]; then
    OLD_SECRET="$(sed -n 's/^APP_SECRET=//p' "$ENV_FILE" | tr -d '"')"
    OLD_EFFECTIVE_DATE="$(sed -n 's/^LEGAL_EFFECTIVE_DATE=//p' "$ENV_FILE" | tr -d '"')"
    # Payment keys entered with --stripe survive a reconfiguration.
    OLD_STRIPE_LINES="$(grep -E '^(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)=' "$ENV_FILE" || true)"
  fi

  while true; do
    ask DOMAIN "Domain for the site" "lishia.bond"
    DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -e 's#^https\?://##' -e 's#/.*$##')"
    valid_domain "$DOMAIN" && break
    warn "'$DOMAIN' is not a valid domain name."
    [[ "$INTERACTIVE" == "1" ]] || die "Invalid DOMAIN."
    DOMAIN=""
  done

  while true; do
    ask ACME_EMAIL "Email address for HTTPS certificate notices (Let's Encrypt)"
    valid_email "$ACME_EMAIL" && break
    warn "Please enter a valid email address."
    [[ "$INTERACTIVE" == "1" ]] || die "Invalid ACME_EMAIL."
    ACME_EMAIL=""
  done

  while true; do
    ask_secret ANTHROPIC_API_KEY "Anthropic API key (input is hidden)"
    if [[ "${ANTHROPIC_API_KEY:-}" =~ ^sk-ant-[A-Za-z0-9_-]{20,}$ ]]; then break; fi
    warn "That does not look like an Anthropic API key (it should start with sk-ant-)."
    [[ "$INTERACTIVE" == "1" ]] || die "Invalid or missing ANTHROPIC_API_KEY."
    ANTHROPIC_API_KEY=""
  done

  while true; do
    ask SITE_NAME "Name of your site" "lishia.bond"
    if [[ "$SITE_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9\ ._-]{0,38}$ ]]; then break; fi
    warn "Use 1-39 letters, digits, spaces, dots, underscores or hyphens. You can change it later in the admin dashboard."
    [[ "$INTERACTIVE" == "1" ]] || die "Invalid SITE_NAME."
    SITE_NAME=""
  done

  while true; do
    ask ASSISTANT_NAME "Name of the AI assistant" "Lishia"
    if [[ "$ASSISTANT_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9\ ._-]{0,38}$ ]]; then break; fi
    warn "Use 1-39 letters, digits, spaces, dots, underscores or hyphens."
    [[ "$INTERACTIVE" == "1" ]] || die "Invalid ASSISTANT_NAME."
    ASSISTANT_NAME=""
  done

  while true; do
    ask ADMIN_EMAIL "Email address for the administrator account" "$ACME_EMAIL"
    valid_email "$ADMIN_EMAIL" && break
    warn "Please enter a valid email address."
    [[ "$INTERACTIVE" == "1" ]] || die "Invalid ADMIN_EMAIL."
    ADMIN_EMAIL=""
  done

  # Shown in the legal pages. Kept separate from the administrator's sign-in
  # address on purpose, so that address does not have to be published.
  if [[ -z "${CONTACT_EMAIL+x}" ]]; then
    CONTACT_EMAIL=""
    if [[ "$INTERACTIVE" == "1" ]]; then
      while true; do
        read -r -p "    Public contact email shown on the site (optional, Enter to skip): " CONTACT_EMAIL </dev/tty
        [[ -z "$CONTACT_EMAIL" ]] && break
        valid_email "$CONTACT_EMAIL" && break
        warn "Please enter a valid email address, or leave it empty."
      done
    fi
  elif [[ -n "$CONTACT_EMAIL" ]]; then
    valid_email "$CONTACT_EMAIL" || die "Invalid CONTACT_EMAIL."
  fi

  GENERATED_PASSWORD=0
  if [[ -z "${ADMIN_PASSWORD:-}" && "$INTERACTIVE" == "1" ]]; then
    info "Choose an administrator password of at least 10 characters,"
    info "or press Enter to have a strong one generated for you."
    while true; do
      ask_secret ADMIN_PASSWORD "Administrator password"
      [[ -n "$ADMIN_PASSWORD" ]] || break
      if [[ "${#ADMIN_PASSWORD}" -lt 10 ]]; then
        warn "The password must be at least 10 characters long."
        ADMIN_PASSWORD=""
        continue
      fi
      ADMIN_PASSWORD_REPEAT=""
      ask_secret ADMIN_PASSWORD_REPEAT "Repeat the password"
      [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_REPEAT" ]] && break
      warn "The passwords do not match."
      ADMIN_PASSWORD=""
    done
  fi

  while true; do
    ask DAILY_BUDGET_USD "Daily spending cap for AI usage in USD (0 = no cap)" "10"
    [[ "$DAILY_BUDGET_USD" =~ ^[0-9]+(\.[0-9]{1,2})?$ ]] && break
    warn "Enter a number such as 10 or 2.50."
    [[ "$INTERACTIVE" == "1" ]] || die "Invalid DAILY_BUDGET_USD."
    DAILY_BUDGET_USD=""
  done

  if ! is_git_checkout; then
    [[ "${AUTO_UPDATE:-no}" == "no" ]] || warn "Automatic updates need a Git checkout (git clone); they stay switched off."
    AUTO_UPDATE="no"
  elif [[ -z "${AUTO_UPDATE:-}" ]]; then
    info "Automatic updates deploy new versions from your Git repository every night"
    info "and let the operating system install its security updates by itself."
    if confirm "Enable automatic updates?" y; then
      AUTO_UPDATE="yes"
    else
      AUTO_UPDATE="no"
    fi
  fi
  [[ "$AUTO_UPDATE" == "yes" || "$AUTO_UPDATE" == "no" ]] || die "AUTO_UPDATE must be yes or no."

  if [[ -z "${SETUP_FIREWALL:-}" ]]; then
    if confirm "Configure the firewall (allow SSH, HTTP and HTTPS only)?" y; then
      SETUP_FIREWALL="yes"
    else
      SETUP_FIREWALL="no"
    fi
  fi
fi

# ------------------------------------------------------------- packages ----

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

step "Installing system packages"
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  ca-certificates curl gnupg openssl rsync build-essential python3 \
  debian-keyring debian-archive-keyring apt-transport-https >/dev/null
ok "Base packages installed"

node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

if ! command -v node >/dev/null 2>&1 || [[ "$(node_major)" -lt "$MIN_NODE_MAJOR" ]]; then
  info "Installing Node.js ${NODE_MAJOR} from NodeSource ..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o "${WORK_DIR}/nodesource_setup.sh"
  bash "${WORK_DIR}/nodesource_setup.sh" >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
[[ "$(node_major)" -ge "$MIN_NODE_MAJOR" ]] || die "Node.js ${MIN_NODE_MAJOR} or newer is required (found $(node -v 2>/dev/null || echo none))."
ok "Node.js $(node -v)"

if ! command -v caddy >/dev/null 2>&1; then
  info "Installing the Caddy web server ..."
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    >/etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi
if [[ "$UPDATE" -eq 1 ]]; then
  # Keep the web server and the JavaScript runtime patched as well.
  apt-get install -y -qq --only-upgrade caddy nodejs >/dev/null 2>&1 ||
    warn "Could not check for newer Caddy and Node.js packages."
fi
ok "Caddy $(caddy version 2>/dev/null | awk '{print $1}')"

# An update with nothing new to deploy stops here.
if [[ "$UPDATE_ONLY" -eq 1 && "$FORCE" -eq 0 && -n "$SOURCE_COMMIT" && -f "$DEPLOYED_FILE" ]] &&
  [[ "$(cat "$DEPLOYED_FILE")" == "$SOURCE_COMMIT" ]] && systemctl is-active --quiet "$APP_NAME"; then
  printf '\n%s%sAlready up to date.%s The running version is commit %s.\n\n' \
    "$GREEN" "$BOLD" "$RESET" "${SOURCE_COMMIT:0:7}"
  exit 0
fi

# -------------------------------------------------------- sanity checks ----

if [[ "$UPDATE" -eq 0 ]]; then
  step "Checking the environment"

  # Another web server on ports 80/443 would prevent Caddy from getting a certificate.
  if command -v ss >/dev/null 2>&1; then
    BLOCKERS="$(ss -ltnpH 'sport = :80 or sport = :443' 2>/dev/null | grep -v caddy || true)"
    if [[ -n "$BLOCKERS" ]]; then
      warn "Another program is already listening on port 80 or 443:"
      printf '%s\n' "$BLOCKERS" | sed 's/^/        /' >&2
      die "Stop or remove that web server (for example nginx or apache2) and run the installer again."
    fi
    if ss -ltnH "sport = :${APP_PORT}" 2>/dev/null | grep -q . && ! systemctl is-active --quiet "$APP_NAME"; then
      die "Port ${APP_PORT} is already in use. Re-run with another port, for example:  APP_PORT=3100 bash install.sh"
    fi
  fi

  # The domain has to point at this server before a certificate can be issued.
  if [[ "${SKIP_DNS_CHECK:-0}" == "1" ]]; then
    info "Skipping the DNS check (SKIP_DNS_CHECK=1)."
  else
    SERVER_IP4="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
    SERVER_IP6="$(curl -6 -fsS --max-time 8 https://api64.ipify.org 2>/dev/null || true)"
    DOMAIN_IPS="$(getent ahosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
    if [[ -z "$DOMAIN_IPS" ]]; then
      warn "${DOMAIN} does not resolve yet. Create a DNS A record pointing to ${SERVER_IP4:-this server}."
      confirm "Continue anyway? HTTPS will start working once DNS is set up." n ||
        die "Aborted. Set up DNS and run the installer again."
    elif [[ -n "$SERVER_IP4$SERVER_IP6" ]] &&
      ! grep -qwF -e "${SERVER_IP4:-none}" -e "${SERVER_IP6:-none}" <<<"$DOMAIN_IPS"; then
      warn "${DOMAIN} resolves to ${DOMAIN_IPS}but this server is ${SERVER_IP4:-?} ${SERVER_IP6:-}."
      warn "Fix the DNS record. If a CDN or proxy (for example Cloudflare) sits in front of this"
      warn "server on purpose, see \"Running behind a CDN\" in the README before you continue."
      confirm "Continue anyway?" y || die "Aborted. Fix DNS and run the installer again."
    else
      ok "${DOMAIN} points to this server"
    fi
  fi

  # Verify the API key with a free metadata request before going any further.
  # The key is handed to curl on standard input so it never appears in the process list.
  if [[ "${SKIP_KEY_CHECK:-0}" == "1" ]]; then
    KEY_STATUS="skipped"
  else
    KEY_STATUS="$(printf 'header = "x-api-key: %s"\n' "$ANTHROPIC_API_KEY" |
      curl -s -o /dev/null -w '%{http_code}' --max-time 15 --config - \
        -H 'anthropic-version: 2023-06-01' https://api.anthropic.com/v1/models || echo 000)"
  fi
  case "$KEY_STATUS" in
    skipped) info "Skipping the API key check (SKIP_KEY_CHECK=1)." ;;
    200) ok "API key accepted" ;;
    401 | 403) die "The API key was rejected (HTTP ${KEY_STATUS}). Check the key and run the installer again." ;;
    *) warn "Could not verify the API key right now (HTTP ${KEY_STATUS}). Continuing; you can check it later in the admin dashboard." ;;
  esac
fi

# ------------------------------------------------------- user and files ----

step "Preparing the application"

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
  ok "Created system user ${APP_USER}"
fi
install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
install -d -m 0750 -o root -g "$APP_USER" "$CONF_DIR" "$APP_DIR" "$RELEASES_DIR"

if [[ "$UPDATE" -eq 0 ]]; then
  umask 077
  {
    printf '# Configuration for %s. Written by install.sh on %s.\n' "$APP_NAME" "$(date -u +%F)"
    printf '# Restart the service after editing:  systemctl restart %s\n' "$APP_NAME"
    printf 'NODE_ENV=production\n'
    printf 'NEXT_TELEMETRY_DISABLED=1\n'
    printf 'HOSTNAME=127.0.0.1\n'
    printf 'PORT=%s\n' "$APP_PORT"
    printf 'APP_URL=https://%s\n' "$DOMAIN"
    printf 'TRUST_PROXY=1\n'
    printf 'DATA_DIR=%s\n' "$DATA_DIR"
    printf 'APP_SECRET=%s\n' "${OLD_SECRET:-$(openssl rand -hex 32)}"
    printf 'ANTHROPIC_API_KEY=%s\n' "$ANTHROPIC_API_KEY"
    printf 'SITE_NAME="%s"\n' "$SITE_NAME"
    printf 'ASSISTANT_NAME="%s"\n' "$ASSISTANT_NAME"
    printf 'CONTACT_EMAIL="%s"\n' "$CONTACT_EMAIL"
    printf 'DAILY_BUDGET_USD=%s\n' "$DAILY_BUDGET_USD"
    printf 'LEGAL_EFFECTIVE_DATE=%s\n' "${OLD_EFFECTIVE_DATE:-$(date -u +%F)}"
    if [[ -n "$OLD_STRIPE_LINES" ]]; then printf '%s\n' "$OLD_STRIPE_LINES"; fi
  } >"${ENV_FILE}.new"
  umask 022
  chown root:"$APP_USER" "${ENV_FILE}.new"
  chmod 0640 "${ENV_FILE}.new"
  mv -f "${ENV_FILE}.new" "$ENV_FILE"
  ok "Configuration written to ${ENV_FILE} (readable only by root and the service)"
else
  APP_PORT="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tr -d '"')"
  APP_PORT="${APP_PORT:-3000}"
  DOMAIN="$(sed -n 's#^APP_URL=https\?://##p' "$ENV_FILE" | tr -d '"')"
fi

# Every run builds into a fresh release directory. The version that is live
# keeps running untouched until the new one has been built successfully.
PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
[[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]] || PREVIOUS_RELEASE=""
RELEASE_DIR="${RELEASES_DIR}/$(date -u +%Y%m%d%H%M%S)"

# Local data, dependencies and build output are not copied.
rsync -a \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude '.data' \
  --exclude '.env*' --exclude '*.db' --exclude '*.db-wal' --exclude '*.db-shm' \
  "${SOURCE_DIR}/" "${RELEASE_DIR}/"
ok "Source code copied to ${RELEASE_DIR}"

# ------------------------------------------------------------------ build ----

step "Building the application (this takes a few minutes)"

# Small servers run out of memory during the build; add temporary swap if needed.
AVAILABLE_MB="$(awk '/MemAvailable|SwapFree/ {sum += $2} END {print int(sum / 1024)}' /proc/meminfo)"
if [[ "$AVAILABLE_MB" -lt 2000 ]]; then
  SWAP_FILE="/${APP_NAME}-build.swap"
  if fallocate -l 2G "$SWAP_FILE" 2>/dev/null && chmod 600 "$SWAP_FILE" &&
    mkswap "$SWAP_FILE" >/dev/null 2>&1 && swapon "$SWAP_FILE" 2>/dev/null; then
    info "Low memory (${AVAILABLE_MB} MB free): using 2 GB of temporary swap for the build."
  else
    rm -f "$SWAP_FILE"
    SWAP_FILE=""
    warn "Low memory (${AVAILABLE_MB} MB free) and no swap could be added. The build may fail."
  fi
fi

# Build as the unprivileged service user, never as root, and with a clean
# environment. Only proxy settings (if this server needs them) are passed on.
chown -R "$APP_USER":"$APP_USER" "$RELEASE_DIR"
PASS_ENV=()
for name in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy NODE_EXTRA_CA_CERTS SSL_CERT_FILE; do
  if [[ -n "${!name:-}" ]]; then PASS_ENV+=("${name}=${!name}"); fi
done
as_app() {
  runuser -u "$APP_USER" -- env -i \
    HOME="$DATA_DIR" PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    npm_config_cache="${DATA_DIR}/.npm" npm_config_update_notifier=false \
    NEXT_TELEMETRY_DISABLED=1 "${PASS_ENV[@]}" "$@"
}

BUILD_LOG="/var/log/${APP_NAME}-build.log"
cd "$RELEASE_DIR"

# A settings file kept from an earlier or customised version can lack settings
# the rest of the code relies on, which would stop the build. Add what is
# missing here, in the copy that is being built; your checkout is not touched.
if [[ -f scripts/repair-source.mjs ]]; then
  REPAIR_NOTE="$(as_app node scripts/repair-source.mjs . 2>&1 || true)"
  case "$REPAIR_NOTE" in
    *"added missing settings"*) info "Compatibility fix: ${REPAIR_NOTE#repair-source: }" ;;
  esac
fi
info "Installing dependencies ..."
as_app npm ci --no-audit --no-fund --loglevel=error >"$BUILD_LOG" 2>&1 ||
  { tail -n 40 "$BUILD_LOG" >&2; die "Installing the dependencies failed. Full log: ${BUILD_LOG}"; }
info "Compiling ..."
as_app env NODE_ENV=production npm run build >>"$BUILD_LOG" 2>&1 ||
  { tail -n 40 "$BUILD_LOG" >&2; die "The build failed. Full log: ${BUILD_LOG}"; }
ok "Build finished"

# The build cache is only useful for rebuilding in place, which never happens.
rm -rf "${RELEASE_DIR}/.next/cache"
# The running service may read the code but not change it.
chown -R root:"$APP_USER" "$RELEASE_DIR"
chmod -R u=rwX,g=rX,o= "$RELEASE_DIR"
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "${RELEASE_DIR}/.next/cache"
cd /

# ---------------------------------------------------------------- service ----

step "Setting up the service"

write_units() { # write_units <release directory>
  local release="$1"
  cat >"$SERVICE_FILE" <<UNIT
[Unit]
Description=lishia.bond web application
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${release}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/env node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${APP_PORT}
Restart=always
RestartSec=3
TimeoutStopSec=20
UMask=0077
LimitNOFILE=65536

# Sandboxing: the service can only write to its data and cache directories.
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${DATA_DIR} ${release}/.next/cache
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
SystemCallArchitectures=native
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
UNIT

  cat >"/etc/systemd/system/${APP_NAME}-backup.service" <<UNIT
[Unit]
Description=lishia.bond database backup

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${release}
Environment=DATA_DIR=${DATA_DIR}
ExecStart=/usr/bin/env node scripts/backup.mjs
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${DATA_DIR}
ProtectHome=true
PrivateTmp=true
UNIT

  cat >"/etc/systemd/system/${APP_NAME}-backup.timer" <<UNIT
[Unit]
Description=Daily lishia.bond database backup

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
}

wait_until_healthy() {
  for _ in $(seq 1 45); do
    if curl -fsS --max-time 3 "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

write_units "$RELEASE_DIR"
systemctl enable --quiet "$APP_NAME" "${APP_NAME}-backup.timer"
systemctl restart "$APP_NAME"
systemctl start "${APP_NAME}-backup.timer"

if ! wait_until_healthy; then
  journalctl -u "$APP_NAME" -n 30 --no-pager >&2 || true
  if [[ -n "$PREVIOUS_RELEASE" ]]; then
    warn "The new version did not start. Switching back to the previous version ..."
    write_units "$PREVIOUS_RELEASE"
    systemctl restart "$APP_NAME"
    wait_until_healthy || warn "The previous version did not come back either. Check:  journalctl -u ${APP_NAME} -e"
    die "The update was rolled back. The log above shows why the new version failed to start."
  fi
  die "The service did not start. See the log above, or run:  journalctl -u ${APP_NAME} -e"
fi

# The new release is live: point "current" at it and keep one older release.
RELEASE_LIVE=1
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort | head -n -2 | while read -r old_release; do
  rm -rf "$old_release"
done
ok "Service is running (daily backups in ${DATA_DIR}/backups)"

# Remember which version is live, so an update can tell whether there is news.
if [[ -n "$SOURCE_COMMIT" ]]; then
  printf '%s\n' "$SOURCE_COMMIT" >"$DEPLOYED_FILE"
else
  rm -f "$DEPLOYED_FILE"
fi

# ---------------------------------------------------------------- updates ----

# "sudo lishia-update" fetches and deploys the newest version at any time.
{
  printf '#!/usr/bin/env bash\n'
  printf '# Updates lishia.bond from its source checkout. Written by install.sh.\n'
  printf 'exec bash %q --update "$@"\n' "${SOURCE_DIR}/install.sh"
} >"$UPDATE_CMD"
chmod 755 "$UPDATE_CMD"

cat >"/etc/systemd/system/${APP_NAME}-update.service" <<UNIT
[Unit]
Description=Update lishia.bond to the latest version
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${UPDATE_CMD}
UNIT

cat >"/etc/systemd/system/${APP_NAME}-update.timer" <<UNIT
[Unit]
Description=Nightly lishia.bond update

[Timer]
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=45m
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload

# The choice is only applied when it was just made; a plain update keeps it.
if [[ "$UPDATE" -eq 0 ]]; then
  if [[ "$AUTO_UPDATE" == "yes" ]]; then
    step "Switching on automatic updates"
    systemctl enable --quiet --now "${APP_NAME}-update.timer"
    ok "New versions are deployed every night around 04:00 (journalctl -u ${APP_NAME}-update)"
    # Security updates of the operating system itself.
    if apt-get install -y -qq unattended-upgrades >/dev/null 2>&1; then
      printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' \
        >/etc/apt/apt.conf.d/20auto-upgrades
      ok "The operating system installs its security updates automatically"
    else
      warn "unattended-upgrades could not be installed; system updates stay manual."
    fi
    if [[ "$(stat -c %U "$SOURCE_DIR")" != "root" ]]; then
      warn "${SOURCE_DIR} belongs to $(stat -c %U "$SOURCE_DIR"). The nightly update runs this"
      warn "directory's install.sh as root, so only people you trust with root should be able to change it."
    fi
  else
    systemctl disable --quiet --now "${APP_NAME}-update.timer" 2>/dev/null || true
  fi
fi

# ------------------------------------------------------------------ admin ----

if [[ "$UPDATE" -eq 0 ]]; then
  step "Creating the administrator account"
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
    GENERATED_PASSWORD=1
  fi
  # The password is exported inside a subshell and inherited by the command, so
  # it never appears on a command line or in the process list.
  (
    cd "$CURRENT_LINK"
    export ADMIN_PASSWORD NODE_ENV=production DATA_DIR
    export HOME="$DATA_DIR" npm_config_cache="${DATA_DIR}/.npm" npm_config_update_notifier=false
    runuser -u "$APP_USER" -- npm run --silent admin -- create "$ADMIN_EMAIL"
  ) | sed 's/^/    /'
fi

# ------------------------------------------------------------------ HTTPS ----

if [[ "$UPDATE" -eq 0 ]]; then
  step "Configuring HTTPS with Caddy"

  SITE_BLOCK="$(cat <<CADDY
# BEGIN ${APP_NAME} (managed by install.sh; changes inside this block are overwritten)
${DOMAIN} {
	# Certificates are obtained from Let's Encrypt and renewed automatically.
	tls ${ACME_EMAIL}

	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}

	request_body {
		max_size 1MB
	}

	reverse_proxy 127.0.0.1:${APP_PORT} {
		# Pass streamed replies through immediately.
		flush_interval -1
	}
}
# END ${APP_NAME}
CADDY
)"

  install -d -m 0755 /etc/caddy
  if [[ -f "$CADDYFILE" ]]; then
    cp -a "$CADDYFILE" "${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
  fi
  if [[ -f "$CADDYFILE" ]] && grep -q "^# BEGIN ${APP_NAME}" "$CADDYFILE"; then
    # Replace our block, keep everything else.
    awk -v begin="# BEGIN ${APP_NAME}" -v end="# END ${APP_NAME}" '
      index($0, begin) == 1 { skip = 1 }
      !skip { print }
      index($0, end) == 1 { skip = 0 }
    ' "$CADDYFILE" >"${CADDYFILE}.new"
    printf '%s\n' "$SITE_BLOCK" >>"${CADDYFILE}.new"
  elif [[ -f "$CADDYFILE" ]] && grep -Eq '^[[:space:]]*[^#[:space:]]' "$CADDYFILE" &&
    ! grep -q '/usr/share/caddy' "$CADDYFILE"; then
    # A custom configuration exists: add our site and leave the rest alone.
    { cat "$CADDYFILE"; printf '\n%s\n' "$SITE_BLOCK"; } >"${CADDYFILE}.new"
  else
    # Fresh installation (or the stock placeholder page): replace it.
    printf '%s\n' "$SITE_BLOCK" >"${CADDYFILE}.new"
  fi

  if caddy validate --config "${CADDYFILE}.new" --adapter caddyfile >/dev/null 2>&1; then
    mv -f "${CADDYFILE}.new" "$CADDYFILE"
  else
    caddy validate --config "${CADDYFILE}.new" --adapter caddyfile >&2 || true
    rm -f "${CADDYFILE}.new"
    die "The generated Caddy configuration is invalid; your previous configuration was left untouched."
  fi
  systemctl enable --quiet caddy
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  ok "Caddy configured for https://${DOMAIN}"

  if [[ "${SETUP_FIREWALL:-no}" == "yes" ]]; then
    step "Configuring the firewall"
    command -v ufw >/dev/null 2>&1 || apt-get install -y -qq ufw >/dev/null
    # Keep every port the SSH daemon listens on open, so you cannot be locked out.
    SSH_PORTS="$( (sshd -T 2>/dev/null || true) | awk '$1 == "port" {print $2}' | sort -u)"
    for port in ${SSH_PORTS:-22}; do ufw allow "${port}/tcp" >/dev/null; done
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw allow 443/udp >/dev/null
    ufw --force enable >/dev/null
    ok "Firewall active: SSH (${SSH_PORTS:-22}), HTTP and HTTPS are allowed"
  fi

  info "Waiting for the HTTPS certificate ..."
  HTTPS_OK=0
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
      HTTPS_OK=1
      break
    fi
    sleep 3
  done
  if [[ "$HTTPS_OK" -eq 1 ]]; then
    ok "https://${DOMAIN} is live with a valid certificate"
  else
    warn "https://${DOMAIN} is not reachable yet. This is normal if DNS was changed recently:"
    warn "Caddy keeps retrying on its own. Check progress with:  journalctl -u caddy -e"
  fi
else
  systemctl reload caddy 2>/dev/null || true
fi

# ---------------------------------------------------------------- summary ----

printf '\n%s%sAll done.%s\n\n' "$GREEN" "$BOLD" "$RESET"
if [[ "$UPDATE" -eq 0 ]]; then
  printf '  Site:            %shttps://%s%s\n' "$BOLD" "$DOMAIN" "$RESET"
  printf '  Admin dashboard: https://%s/admin\n' "$DOMAIN"
  printf '  Admin sign-in:   %s\n' "$ADMIN_EMAIL"
  if [[ "${GENERATED_PASSWORD:-0}" -eq 1 ]]; then
    printf '  Admin password:  %s%s%s   (shown only once: store it now and change it after signing in)\n' "$BOLD" "$ADMIN_PASSWORD" "$RESET"
  fi
  printf '\n  Next steps:\n'
  printf '    1. Sign in and open Admin -> Settings to add your legal details (operator, address, contact).\n'
  printf '    2. Review limits and the daily budget under Admin -> Models & limits.\n'
else
  printf '  %s has been updated and restarted.\n' "https://${DOMAIN}"
fi
if systemctl is-enabled --quiet "${APP_NAME}-update.timer" 2>/dev/null; then
  printf '\n  Automatic updates are on: new versions are deployed every night.\n'
else
  printf '\n  Automatic updates are off. Update whenever you like with:  sudo %s-update\n' "$APP_NAME"
fi
printf '\n  Useful commands:\n'
printf '    sudo %s-update                 fetch and deploy the newest version now\n' "$APP_NAME"
printf '    systemctl status %s            service status\n' "$APP_NAME"
printf '    journalctl -u %s -f            live logs\n' "$APP_NAME"
printf '    journalctl -u %s-update -e     log of the automatic updates\n' "$APP_NAME"
printf '    %s    configuration (API key, domain)\n\n' "$ENV_FILE"
