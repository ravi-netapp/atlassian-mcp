/**
 * @raviraj87/atlassian-mcp · tools/richFiltersTools.ts
 * Appfire Rich Filters for Jira Dashboards tools.
 *
 * Copyright (c) 2026 Ravi Raj · MIT License · see LICENSE
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ClientFactory } from "../clients/clientFactory.js";
import { connectionField, dryRunField, jsonResult, registerTool } from "./common.js";

const staticFilterSchema = z.object({
  label: z.string(),
  jql: z.string(),
  color: z.string().optional(),
});

const dynamicFilterSchema = z.object({
  key: z.string(),
});

export function registerRichFiltersTools(server: McpServer, factory: ClientFactory): void {
  registerTool(
    server,
    "rich_filter_search",
    "Search Rich Filters (Appfire plugin) by name.",
    {
      connection: connectionField,
      filterName: z.string().optional(),
      startAt: z.number().optional(),
      maxResults: z.number().optional(),
    },
    async ({ connection, filterName, startAt, maxResults }) =>
      jsonResult(await factory.richFilters(connection).search({ filterName, startAt, maxResults })),
  );

  registerTool(
    server,
    "rich_filter_get",
    "Get full Rich Filter config (static, dynamic, smart filters, views).",
    { connection: connectionField, richFilterId: z.number() },
    async ({ connection, richFilterId }) =>
      jsonResult(await factory.richFilters(connection).get(richFilterId)),
  );

  registerTool(
    server,
    "rich_filter_create",
    "Create a Rich Filter wrapping an existing Jira saved filter.",
    {
      connection: connectionField,
      name: z.string(),
      jiraFilterId: z.number(),
      dryRun: dryRunField,
    },
    async ({ connection, name, jiraFilterId, dryRun }) =>
      jsonResult(await factory.richFilters(connection).create(name, jiraFilterId, dryRun)),
  );

  registerTool(
    server,
    "rich_filter_configure",
    "Set static + dynamic filters on a Rich Filter (GET-merge-PUT).",
    {
      connection: connectionField,
      richFilterId: z.number(),
      staticFilters: z.array(staticFilterSchema).optional(),
      dynamicFilters: z.array(dynamicFilterSchema).optional(),
      description: z.string().optional(),
      dryRun: dryRunField,
    },
    async ({ connection, richFilterId, staticFilters, dynamicFilters, description, dryRun }) =>
      jsonResult(
        await factory.richFilters(connection).configure(richFilterId, {
          staticFilters,
          dynamicFilters,
          description,
          dryRun,
        }),
      ),
  );

  registerTool(
    server,
    "rich_filter_issue_count",
    "Count issues for a Rich Filter (+ optional working JQL).",
    {
      connection: connectionField,
      richFilterId: z.number(),
      workingQuery: z.string().optional(),
    },
    async ({ connection, richFilterId, workingQuery }) =>
      jsonResult(await factory.richFilters(connection).issueCount(richFilterId, workingQuery ?? "")),
  );

  registerTool(
    server,
    "rich_filter_api",
    "Escape hatch: call Rich Filters REST under /rest/qoti-rich-filters/latest/.",
    {
      connection: connectionField,
      path: z.string().describe("Path after /rest/qoti-rich-filters/latest/, e.g. rich-filters/123"),
      method: z.string().optional(),
      query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      body: z.unknown().optional(),
      dryRun: dryRunField,
    },
    async ({ connection, path, method, query, body, dryRun }) => {
      const prefix = "/rest/qoti-rich-filters/latest/";
      const fullPath = path.startsWith("/") ? path : `${prefix}${path}`;
      return jsonResult(await factory.requireJira(connection).raw(fullPath, { method, query, body, dryRun }));
    },
  );

  registerTool(
    server,
    "jira_create_filter",
    "Create a Jira saved filter.",
    {
      connection: connectionField,
      name: z.string(),
      jql: z.string(),
      description: z.string().optional(),
      dryRun: dryRunField,
    },
    async ({ connection, name, jql, description, dryRun }) =>
      jsonResult(await factory.requireJira(connection).createFilter(name, jql, description, dryRun)),
  );

  registerTool(
    server,
    "jira_delete_filter",
    "Delete a Jira saved filter by ID.",
    {
      connection: connectionField,
      filterId: z.union([z.number(), z.string()]),
      dryRun: dryRunField,
    },
    async ({ connection, filterId, dryRun }) =>
      jsonResult(await factory.requireJira(connection).deleteFilter(filterId, dryRun)),
  );
}
