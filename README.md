# phasetransitions-mcp-bridge

Universal MCP stdio-to-HTTP bridge for Claude Desktop.

Connects Claude Desktop to any remote MCP server that speaks [Streamable HTTP](https://modelcontextprotocol.io/docs/concepts/transports#streamable-http). Zero dependencies, works with Node 18+.

## Usage

In your Claude Desktop config (`Settings > Developer > Edit Config`):

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "phasetransitions-mcp-bridge", "https://my-server.com/mcp", "my-password"]
    }
  }
}
```

That's it. Save, restart Claude Desktop.

## How it works

Claude Desktop speaks MCP over stdio (stdin/stdout). Remote MCP servers speak HTTP. This bridge sits between them:

```
Claude Desktop <--stdio--> mcp-bridge <--HTTP--> Your server's /mcp endpoint
```

Every JSON-RPC message from Claude is POSTed to the remote URL. The response is written back. Authentication is via Basic Auth, derived from the password argument.

## Arguments

```
npx phasetransitions-mcp-bridge <url> [password]
```

- `url` — The remote MCP endpoint (required)
- `password` — Sent as Basic Auth header (optional)

## Multiple servers

Use multiple entries in your config to connect to several servers at once:

```json
{
  "mcpServers": {
    "legal": {
      "command": "npx",
      "args": ["-y", "phasetransitions-mcp-bridge", "https://legal-search.com/mcp", "pass1"]
    },
    "analytics": {
      "command": "npx",
      "args": ["-y", "phasetransitions-mcp-bridge", "https://analytics.com/mcp", "pass2"]
    }
  }
}
```

## Requirements

- Node.js 18+ (install from [nodejs.org](https://nodejs.org))
- A remote MCP server with an HTTP endpoint

## License

MIT
