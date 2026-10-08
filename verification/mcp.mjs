import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.join(process.argv[2], "npm/node_modules");
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const { Server } = await load(
  "@modelcontextprotocol/sdk/dist/esm/server/index.js",
);
const { Client: Client1 } = await load(
  "@modelcontextprotocol/sdk/dist/esm/client/index.js",
);
const { Client: Client2 } = await load(
  "@modelcontextprotocol/client/dist/index.mjs",
);
const { InMemoryTransport } = await load(
  "@modelcontextprotocol/sdk/dist/esm/inMemory.js",
);
const { ListToolsRequestSchema, CallToolRequestSchema } = await load(
  "@modelcontextprotocol/sdk/dist/esm/types.js",
);
for (const [name, Client] of [
  ["sdk", Client1],
  ["client", Client2],
]) {
  const server = new Server(
    { name: "offline-fixture", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "echo",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async () => ({
    content: [{ type: "text", text: "MCP-PATCHED-OK" }],
  }));
  const client = new Client(
    { name: "offline-client", version: "1.0.0" },
    { capabilities: {} },
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    assert.equal((await client.listTools()).tools[0].name, "echo");
    assert.equal(
      (await client.callTool({ name: "echo", arguments: {} })).content[0].text,
      "MCP-PATCHED-OK",
    );
    console.log("PASS", name, "offline handshake/discovery/call");
  } finally {
    await client.close();
    await server.close();
  }
}
