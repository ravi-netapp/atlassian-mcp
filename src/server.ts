/**
 * @raviraj87/atlassian-mcp · server.ts
 * MCP server factory — registers Jira, Bitbucket, and Confluence tools.
 *
 * Copyright (c) 2026 Ravi Raj · MIT License · see LICENSE
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClientFactory } from "./clients/clientFactory.js";
import { registerBitbucketBulkTools } from "./tools/bitbucketBulkTools.js";
import { registerBitbucketTools } from "./tools/bitbucketTools.js";
import { registerCompositeTools } from "./tools/compositeTools.js";
import { registerConfluenceTools } from "./tools/confluenceTools.js";
import { registerConfluenceExtendedTools } from "./tools/confluenceExtendedTools.js";
import { registerCrossProductTools } from "./tools/crossproductTools.js";
import { registerBitbucketExtendedTools, registerJiraExtendedTools } from "./tools/extendedTools.js";
import { registerJiraTools } from "./tools/jiraTools.js";
import { registerRichFiltersTools } from "./tools/richFiltersTools.js";

export function createAtlassianMcpServer(factory: ClientFactory): McpServer {
  const server = new McpServer({
    name: "atlassian-mcp",
    version: "1.4.0",
  });

  registerJiraTools(server, factory);
  registerRichFiltersTools(server, factory);
  registerJiraExtendedTools(server, factory);
  registerBitbucketTools(server, factory);
  registerBitbucketExtendedTools(server, factory);
  registerBitbucketBulkTools(server, factory);
  registerConfluenceTools(server, factory);
  registerConfluenceExtendedTools(server, factory);
  registerCrossProductTools(server, factory);
  registerCompositeTools(server, factory);

  return server;
}
