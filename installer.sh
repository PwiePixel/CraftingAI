#!/usr/bin/env bash
# Alias for install.sh, so both names work:  sudo bash installer.sh [options]
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install.sh" "$@"
