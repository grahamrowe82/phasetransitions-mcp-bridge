# phasetransitions-mcp-bridge

Universal MCP stdio-to-HTTP bridge for Claude Desktop.

Connects Claude Desktop to any remote MCP server that speaks [Streamable HTTP](https://modelcontextprotocol.io/docs/concepts/transports#streamable-http). Zero dependencies, works with Node 18+.

## Quick setup (non-technical users)

Download **[install.command](https://raw.githubusercontent.com/grahamrowe82/phasetransitions-mcp-bridge/main/install.command)**, double-click it, and follow the prompts. You'll need:

- Your **server URL** (provided by your admin)
- Your **password** (provided separately)
- [Node.js](https://nodejs.org) installed
- [Claude Desktop](https://claude.ai/download) installed

The installer downloads the bridge script, updates your Claude Desktop config, and you're done.

## How it works

Claude Desktop speaks MCP over stdio (stdin/stdout). Remote MCP servers speak HTTP. This bridge sits between them:

```
Claude Desktop <--stdio--> mcp-bridge <--HTTP--> Your server's /mcp endpoint
```

Every JSON-RPC message from Claude is POSTed to the remote URL. The response is written back. Authentication is via Basic Auth, derived from the password argument.

## Manual setup

If you prefer to configure things yourself:

1. Download `index.js` to a local folder (e.g. `~/mcp-bridge/`)
2. Edit your Claude Desktop config (`Settings > Developer > Edit Config`):

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/Users/you/mcp-bridge/index.js", "https://my-server.com/mcp", "my-password"]
    }
  }
}
```

3. Save, quit Claude Desktop (Cmd+Q), reopen.

## Multiple servers

Add multiple entries — one per server:

```json
{
  "mcpServers": {
    "legal": {
      "command": "node",
      "args": ["/Users/you/mcp-bridge/index.js", "https://legal-search.com/mcp", "pass1"]
    },
    "analytics": {
      "command": "node",
      "args": ["/Users/you/mcp-bridge/index.js", "https://analytics.com/mcp", "pass2"]
    }
  }
}
```

Run the installer once per server, or add entries manually.

## Requirements

- Node.js 18+ ([nodejs.org](https://nodejs.org))
- A remote MCP server with an HTTP endpoint

## License

MIT
