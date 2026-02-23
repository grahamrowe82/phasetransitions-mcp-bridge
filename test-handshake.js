#!/usr/bin/env node

/**
 * MCP handshake smoke test.
 *
 * Simulates the exact sequence Claude Desktop sends on startup, running it
 * through the bridge, and asserts every response is valid JSON-RPC that the
 * MCP SDK's Zod validator will accept.
 *
 * Usage:
 *   node test-handshake.js <url> <password>
 *
 * Same args as the bridge itself — test any endpoint with one command.
 * Exit code 0 = all passed, 1 = failures.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const serverUrl = process.argv[2];
const password = process.argv[3];

if (!serverUrl) {
  console.error("Usage: node test-handshake.js <url> <password>");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgePath = join(__dirname, "index.js");

// --- Test sequence: exactly what Claude Desktop sends on startup ---

const steps = [
  {
    name: "initialize",
    send: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "handshake-test", version: "1.0" },
      },
    },
    expectResponse: true,
    validate(parsed) {
      if (!parsed.result) return "missing result";
      if (!parsed.result.protocolVersion) return "missing protocolVersion";
      if (!parsed.result.serverInfo) return "missing serverInfo";
      return null;
    },
  },
  {
    name: "notifications/initialized",
    send: { jsonrpc: "2.0", method: "notifications/initialized" },
    expectResponse: false, // notification — no stdout expected
  },
  {
    name: "tools/list",
    send: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    expectResponse: true,
    validate(parsed) {
      if (!parsed.result) return "missing result";
      if (!Array.isArray(parsed.result.tools)) return "missing tools array";
      return null;
    },
  },
  {
    name: "resources/list",
    send: { jsonrpc: "2.0", id: 3, method: "resources/list" },
    expectResponse: true,
  },
  {
    name: "prompts/list",
    send: { jsonrpc: "2.0", id: 4, method: "prompts/list" },
    expectResponse: true,
  },
  {
    name: "ping",
    send: { jsonrpc: "2.0", id: 5, method: "ping" },
    expectResponse: true,
  },
  {
    name: "ping with id=0 (falsy edge case)",
    send: { jsonrpc: "2.0", id: 0, method: "ping" },
    expectResponse: true,
  },
];

// --- Run the bridge as a subprocess, feed it messages, collect stdout ---

const bridge = spawn("node", [bridgePath, serverUrl, password || ""], {
  stdio: ["pipe", "pipe", "pipe"],
});

const responses = []; // { raw, parsed }
let stdoutBuf = "";

bridge.stdout.on("data", (chunk) => {
  stdoutBuf += chunk.toString();
  // Split on newlines — each line is one JSON-RPC response
  const lines = stdoutBuf.split("\n");
  stdoutBuf = lines.pop(); // keep incomplete trailing line
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      responses.push({ raw: line, parsed: JSON.parse(line) });
    } catch {
      responses.push({ raw: line, parsed: null });
    }
  }
});

bridge.stderr.on("data", () => {}); // swallow bridge logs

// Send each message with a delay to let the server respond
const DELAY_MS = 1500;
let stepIndex = 0;

function sendNext() {
  if (stepIndex >= steps.length) {
    // Wait for final responses then validate
    setTimeout(validate, DELAY_MS * 2);
    return;
  }
  const step = steps[stepIndex++];
  bridge.stdin.write(JSON.stringify(step.send) + "\n");
  setTimeout(sendNext, DELAY_MS);
}

setTimeout(sendNext, 500); // let bridge connect first

function validate() {
  bridge.kill();

  let failures = 0;
  let responseIndex = 0;

  console.log("");

  for (const step of steps) {
    if (!step.expectResponse) {
      // Notification — verify nothing was emitted for this step.
      // We can't perfectly correlate, but we check that no response
      // has a null id (which would be the failure mode).
      console.log(`  SKIP  ${step.name} (notification — no response expected)`);
      continue;
    }

    const resp = responses[responseIndex++];

    if (!resp) {
      console.log(`  FAIL  ${step.name}: no response received`);
      failures++;
      continue;
    }

    if (!resp.parsed) {
      console.log(`  FAIL  ${step.name}: not valid JSON — ${resp.raw.substring(0, 100)}`);
      failures++;
      continue;
    }

    const p = resp.parsed;

    // Core check: id must be string or number, never null/undefined
    if (p.id === null || p.id === undefined) {
      console.log(`  FAIL  ${step.name}: id is ${JSON.stringify(p.id)} (Zod will reject this)`);
      failures++;
      continue;
    }

    // id should match what we sent
    if (p.id !== step.send.id) {
      console.log(`  FAIL  ${step.name}: id mismatch — sent ${step.send.id}, got ${p.id}`);
      failures++;
      continue;
    }

    // Must have jsonrpc field
    if (p.jsonrpc !== "2.0") {
      console.log(`  FAIL  ${step.name}: missing jsonrpc:"2.0"`);
      failures++;
      continue;
    }

    // Must have either result or error (not both, not neither)
    if (!("result" in p) && !("error" in p)) {
      console.log(`  FAIL  ${step.name}: response has neither result nor error`);
      failures++;
      continue;
    }

    // Custom validation if defined
    if (step.validate) {
      const err = step.validate(p);
      if (err) {
        console.log(`  FAIL  ${step.name}: ${err}`);
        failures++;
        continue;
      }
    }

    console.log(`  PASS  ${step.name}`);
  }

  // Check for any stray null-id responses
  for (const resp of responses) {
    if (resp.parsed && (resp.parsed.id === null || resp.parsed.id === undefined)) {
      console.log(`  FAIL  unexpected null-id response: ${resp.raw.substring(0, 120)}`);
      failures++;
    }
  }

  console.log("");
  if (failures > 0) {
    console.log(`FAILED: ${failures} failure(s)`);
    process.exit(1);
  } else {
    console.log(`OK: all checks passed (${responses.length} responses)`);
    process.exit(0);
  }
}
