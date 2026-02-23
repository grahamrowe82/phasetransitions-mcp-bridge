#!/usr/bin/env node

/**
 * MCP Bridge — universal stdio-to-HTTP proxy for Claude Desktop.
 *
 * Usage:
 *   npx phasetransitions-mcp-bridge <url> <password>
 *
 * Claude Desktop launches this as a stdio process. Every JSON-RPC message
 * from stdin is POSTed to the remote /mcp endpoint. The response is written
 * back to stdout. Zero dependencies — uses only Node built-in modules.
 */

const { createInterface } = require("node:readline");

const url = process.argv[2];
const password = process.argv[3];

if (!url) {
  process.stderr.write("Usage: mcp-bridge <url> <password>\n");
  process.exit(1);
}

const authHeader = password
  ? "Basic " + Buffer.from("user:" + password).toString("base64")
  : null;

const rl = createInterface({ input: process.stdin, terminal: false });

let pending = 0;
let stdinClosed = false;

function maybeExit() {
  if (stdinClosed && pending === 0) process.exit(0);
}

async function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (!msg.method) return;

  pending++;

  try {
    const headers = { "Content-Type": "application/json" };
    if (authHeader) headers["Authorization"] = authHeader;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(msg),
    });

    if (res.status !== 204) {
      const body = await res.text();
      if (body) {
        // Validate before relaying — MCP SDK rejects id:null via Zod
        try {
          const parsed = JSON.parse(body);
          if (parsed.id === null || parsed.id === undefined) {
            if (msg.id != null) {
              // Server dropped the id — restore it from the original request
              parsed.id = msg.id;
              process.stdout.write(JSON.stringify(parsed) + "\n");
            }
            // else: notification response with no id — drop silently
          } else {
            process.stdout.write(body + "\n");
          }
        } catch {
          // Non-JSON response — only report for requests, not notifications
          if (msg.id != null) {
            process.stderr.write("[bridge] Non-JSON response: " + body.substring(0, 200) + "\n");
            process.stdout.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: msg.id,
                error: { code: -32603, message: "Server returned non-JSON response" },
              }) + "\n"
            );
          }
        }
      }
    }
  } catch (err) {
    process.stderr.write("[bridge] Request failed: " + err.message + "\n");

    if (msg.id != null) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32603, message: "Bridge error: " + err.message },
        }) + "\n"
      );
    }
  } finally {
    pending--;
    maybeExit();
  }
}

rl.on("line", (line) => handleMessage(line));

rl.on("close", () => {
  stdinClosed = true;
  maybeExit();
});

process.stderr.write("[bridge] Connected to " + url + "\n");
