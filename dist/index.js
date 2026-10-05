#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
// stdio MCP server — stdout carries the protocol, so log to stderr only.
const server = createServer();
await server.connect(new StdioServerTransport());
console.error("paylo-mcp ready (stdio)");
