#!/bin/bash

# ═══════════════════════════════════════════════════════════════
#  MCP Server Installer
#  Connects Claude Desktop to your server
# ═══════════════════════════════════════════════════════════════
#
#  Double-click this file to run it. It will:
#    1. Check that Node.js is installed
#    2. Download a small connector script
#    3. Update your Claude Desktop settings
#
#  No credentials are stored in this file. You enter them at
#  runtime. Safe to share, email, or post publicly.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

BRIDGE_DIR="$HOME/mcp-bridge"
BRIDGE_URL="https://raw.githubusercontent.com/grahamrowe82/phasetransitions-mcp-bridge/main/index.js"
CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

# ── Helpers ──────────────────────────────────────────────────

print_banner() {
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  MCP Server Installer"
    echo "  Connects Claude Desktop to your server"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    echo "  If macOS warned you about this file, that's normal"
    echo "  — it's a setup script, not an app."
    echo ""
}

ok()   { echo "  ✓ $1"; }
warn() { echo "  ⚠ $1"; }
fail() { echo "  ✗ $1"; echo ""; exit 1; }

# ── Pre-flight checks ───────────────────────────────────────

check_node() {
    echo "Checking requirements..."

    if ! command -v node &>/dev/null; then
        fail "Node.js is required but not installed.\n\n  Download it from https://nodejs.org and re-run this installer."
    fi

    local node_version
    node_version=$(node --version 2>/dev/null)
    local major
    major=$(echo "$node_version" | sed 's/v//' | cut -d. -f1)

    if [ "$major" -lt 18 ]; then
        fail "Your Node.js is too old ($node_version).\n\n  Please update to version 18 or newer from https://nodejs.org"
    fi

    ok "Node.js $node_version found"
    echo ""
}

# ── Collect input ────────────────────────────────────────────

collect_input() {
    # Accept URL and password as arguments (for curl | bash -s -- <url> <pass>)
    # or prompt interactively (for double-click)
    SERVER_URL="${1:-}"
    SERVER_PASSWORD="${2:-}"
    CONNECTION_NAME="${3:-}"

    if [ -z "$SERVER_URL" ]; then
        read -rp "Enter your server URL: " SERVER_URL
    fi

    if [ -z "$SERVER_URL" ]; then
        fail "No URL entered. Please re-run and paste the URL from your setup email."
    fi

    if [[ ! "$SERVER_URL" =~ ^https:// ]]; then
        warn "URL doesn't start with https:// — double-check it's correct."
        echo ""
    fi

    if [ -z "$SERVER_PASSWORD" ]; then
        read -rsp "Enter your password: " SERVER_PASSWORD
        echo ""
    fi

    if [ -z "$SERVER_PASSWORD" ]; then
        fail "No password entered. Please re-run and enter the password you were given."
    fi

    # Derive default name from hostname (e.g. legalsearch-web.onrender.com → legalsearch)
    if [ -z "$CONNECTION_NAME" ]; then
        CONNECTION_NAME=$(echo "$SERVER_URL" | sed -E 's|https?://||' | cut -d/ -f1 | cut -d. -f1 | sed 's/-web$//' | sed 's/-app$//' | sed 's/-api$//')
    fi
    echo ""
}

# ── Test connection ──────────────────────────────────────────

test_connection() {
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$SERVER_URL" 2>/dev/null || echo "000")

    if [ "$status_code" = "000" ]; then
        warn "Could not reach the server right now — this might be"
        echo "    normal if the server is starting up. Continuing anyway."
    else
        ok "Server responded (HTTP $status_code)"
    fi
}

# ── Download bridge ──────────────────────────────────────────

download_bridge() {
    mkdir -p "$BRIDGE_DIR"

    if curl -sfL "$BRIDGE_URL" -o "$BRIDGE_DIR/index.js"; then
        ok "Bridge downloaded to ~/mcp-bridge/"
    else
        fail "Could not download the bridge script.\n\n  Check your internet connection and try again."
    fi
}

# ── Update Claude Desktop config ─────────────────────────────

update_config() {
    local bridge_path="$BRIDGE_DIR/index.js"

    # Ensure config directory exists
    mkdir -p "$CONFIG_DIR"

    # Back up existing config
    if [ -f "$CONFIG_FILE" ]; then
        cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    fi

    # Read or create config using Node (reliable JSON handling)
    # Check for existing entry before writing
    if [ -f "$CONFIG_FILE" ]; then
        local exists
        exists=$(node -e "
const fs = require('fs');
try {
    const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    console.log(c.mcpServers && c.mcpServers[process.argv[2]] ? 'yes' : 'no');
} catch { console.log('no'); }
" "$CONFIG_FILE" "$CONNECTION_NAME" 2>/dev/null || echo "no")

        if [ "$exists" = "yes" ]; then
            warn "Connection '$CONNECTION_NAME' already exists — updating it."
        fi
    fi

    node -e "
const fs = require('fs');
const configPath = process.argv[1];
const name = process.argv[2];
const bridgePath = process.argv[3];
const url = process.argv[4];
const password = process.argv[5];

let config = {};
try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(raw);
} catch (e) {}

if (!config.mcpServers) config.mcpServers = {};

config.mcpServers[name] = {
    command: 'node',
    args: [bridgePath, url, password]
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

const check = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (check.mcpServers && check.mcpServers[name]) {
    process.exit(0);
} else {
    process.exit(1);
}
" "$CONFIG_FILE" "$CONNECTION_NAME" "$bridge_path" "$SERVER_URL" "$SERVER_PASSWORD"

    if [ $? -eq 0 ]; then
        ok "Connection '$CONNECTION_NAME' added"
        ok "Config file saved and verified"
    else
        # Restore backup
        if [ -f "$CONFIG_FILE.backup" ]; then
            cp "$CONFIG_FILE.backup" "$CONFIG_FILE"
        fi
        fail "Something went wrong updating the config.\n\n  Your original settings have been restored from backup."
    fi
}

# ── Main ─────────────────────────────────────────────────────

print_banner
check_node
collect_input "$@"

echo "Setting up..."
test_connection
download_bridge
update_config

echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  All done! Please:"
echo ""
echo "    1. Quit Claude Desktop completely (Cmd+Q)"
echo "    2. Reopen it"
echo "    3. Your new tools will appear automatically"
echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
