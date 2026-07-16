/**
 * @raviraj87/atlassian-mcp · tools/compositeTools.ts
 * Composite multi-call MCP tools.
 *
 * Copyright (c) 2026 Ravi Raj · MIT License · see LICENSE
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ClientFactory } from "../clients/clientFactory.js";
import { jiraBulkUpdateFromJqlOptionsSchema } from "../util/jiraBulk.js";
import { connectionField, dryRunField, jsonResult, registerTool } from "./common.js";

const staticFilterInput = z.object({
  label: z.string(),
  jql: z.string(),
  color: z.string().optional(),
});

const dynamicFilterInput = z.object({
  key: z.string(),
});

export function registerCompositeTools(server: McpServer, factory: ClientFactory): void {
  registerTool(
    server,
    "jira_bulk_update_from_jql",
    "Composite: JQL search → apply the same fields/update/transition to every match → optional verify remaining count. Generic bulk edit for any field.",
    { connection: connectionField, ...jiraBulkUpdateFromJqlOptionsSchema },
    async (args) => jsonResult(await factory.requireJira(args.connection).bulkUpdateFromJql(args)),
  );

  registerTool(
    server,
    "jira_triage_issue",
    "Composite: fetch issue, comments, transitions, and remote links in one call.",
    { connection: connectionField, issueKey: z.string() },
    async ({ connection, issueKey }) => {
      const jira = factory.requireJira(connection);
      const [issue, comments, transitions, remoteLinks] = await Promise.all([
        jira.getIssue(issueKey, ["summary", "status", "assignee", "priority", "description"]),
        jira.getComments(issueKey, 0, 10),
        jira.getTransitions(issueKey),
        jira.getRemoteLinks(issueKey),
      ]);
      return jsonResult({ issue, comments, transitions, remoteLinks });
    },
  );

  registerTool(
    server,
    "jira_whats_on_my_plate",
    "Composite: issues assigned to current user, grouped by status.",
    { connection: connectionField, maxResults: z.number().optional() },
    async ({ connection, maxResults }) => {
      const jira = factory.requireJira(connection);
      const me = (await jira.whoAmI()) as { name?: string; displayName?: string; accountId?: string };
      const assignee = me.accountId ?? me.name ?? me.displayName;
      const jql = assignee
        ? `assignee = "${assignee}" AND resolution = Unresolved ORDER BY priority DESC, updated DESC`
        : `assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC`;
      const data = (await jira.searchIssues(jql, 0, maxResults ?? 50, ["summary", "status", "priority"])) as {
        issues?: Array<{ key: string; fields?: { summary?: string; status?: { name?: string }; priority?: { name?: string } } }>;
      };
      const grouped: Record<string, Array<{ key: string; summary: string; priority?: string }>> = {};
      for (const issue of data.issues ?? []) {
        const status = issue.fields?.status?.name ?? "Unknown";
        grouped[status] ??= [];
        grouped[status].push({
          key: issue.key,
          summary: issue.fields?.summary ?? "",
          priority: issue.fields?.priority?.name,
        });
      }
      return jsonResult({ jql, grouped, total: data.issues?.length ?? 0 });
    },
  );

  registerTool(
    server,
    "bitbucket_triage_pr",
    "Composite: PR details, diff summary, commits, and approval state.",
    {
      connection: connectionField,
      project: z.string(),
      repository: z.string(),
      pullRequestId: z.number(),
    },
    async ({ connection, project, repository, pullRequestId }) => {
      const bb = factory.requireBitbucket(connection);
      const ref = { project, repository };
      const [pr, diff, commits] = await Promise.all([
        bb.getPullRequest(ref, pullRequestId),
        bb.getPullRequestDiff(ref, pullRequestId, 3, 8000),
        bb.listPullRequestCommits(ref, pullRequestId),
      ]);
      return jsonResult({ pullRequest: pr, diff, commits });
    },
  );

  registerTool(
    server,
    "bitbucket_review_pull_request",
    "Composite: PR + diff preview + linked Jira keys from title/description.",
    {
      connection: connectionField,
      project: z.string(),
      repository: z.string(),
      pullRequestId: z.number(),
    },
    async ({ connection, project, repository, pullRequestId }) => {
      const bb = factory.requireBitbucket(connection);
      const ref = { project, repository };
      const pr = (await bb.getPullRequest(ref, pullRequestId)) as { title?: string; description?: string };
      const diff = await bb.getPullRequestDiff(ref, pullRequestId, 3, 6000);
      const text = `${pr.title ?? ""}\n${pr.description ?? ""}`;
      const keys = [...new Set(text.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [])];
      return jsonResult({ pullRequest: pr, diff, linkedJiraKeys: keys });
    },
  );

  registerTool(
    server,
    "daily_standup",
    "Composite: my open Jira issues + open PRs authored by me (best effort).",
    {
      connection: connectionField,
      project: z.string().optional(),
      repository: z.string().optional(),
    },
    async ({ connection, project, repository }) => {
      const jira = factory.requireJira(connection);
      const issues = await jira.searchIssues(
        "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC",
        0,
        20,
        ["summary", "status"],
      );

      let pullRequests: unknown = null;
      if (project && repository) {
        pullRequests = await factory.requireBitbucket(connection).listPullRequests({ project, repository }, "OPEN", 0, 20);
      }

      return jsonResult({ jiraIssues: issues, openPullRequests: pullRequests });
    },
  );

  registerTool(
    server,
    "rich_filter_bootstrap",
    "Composite: create Jira saved filter + Rich Filter, then add static/dynamic filter presets.",
    {
      connection: connectionField,
      name: z.string().describe("Name for both the Jira filter and Rich Filter"),
      jql: z.string().describe("Base JQL for the Jira saved filter"),
      description: z.string().optional(),
      jiraFilterId: z
        .number()
        .optional()
        .describe("Use an existing Jira filter instead of creating one"),
      staticFilters: z.array(staticFilterInput).optional(),
      dynamicFilters: z.array(dynamicFilterInput).optional(),
      dryRun: dryRunField,
    },
    async ({ connection, name, jql, description, jiraFilterId, staticFilters, dynamicFilters, dryRun }) => {
      const jira = factory.requireJira(connection);
      const rf = factory.richFilters(connection);

      const search = (await rf.search({ filterName: name, maxResults: 20 })) as {
        results?: Array<{ id: number; name: string; jiraFilter?: { value?: { id?: number } } }>;
      };
      const existingRf = search.results?.find((r) => r.name === name);

      let resolvedJiraFilterId = jiraFilterId ?? existingRf?.jiraFilter?.value?.id;

      if (!resolvedJiraFilterId) {
        const created = (await jira.createFilter(name, jql, description, dryRun)) as {
          id?: string;
          dryRun?: boolean;
        };
        if (created.dryRun) {
          return jsonResult({
            dryRun: true,
            name,
            jql,
            staticFilters: staticFilters ?? [],
            dynamicFilters: dynamicFilters ?? [],
          });
        }
        resolvedJiraFilterId = Number(created.id);
      }

      let richFilterId = existingRf?.id;
      if (!richFilterId) {
        const created = (await rf.create(name, resolvedJiraFilterId, dryRun)) as { id?: number; dryRun?: boolean };
        if (created.dryRun) {
          return jsonResult({ dryRun: true, jiraFilterId: resolvedJiraFilterId, name });
        }
        richFilterId = created.id;
      }

      if (!richFilterId) throw new Error("Rich Filter creation did not return an id");

      const configured = await rf.configure(richFilterId, {
        staticFilters,
        dynamicFilters,
        description,
        dryRun,
      });

      const issueCount = dryRun ? null : await rf.issueCount(richFilterId);

      return jsonResult({
        status: existingRf ? "updated" : "created",
        jiraFilterId: resolvedJiraFilterId,
        richFilterId,
        name,
        configured,
        issueCount,
      });
    },
  );

  registerTool(
    server,
    "bitbucket_open_pr_from_changes",
    "Composite: create branch + PR from source/target refs with optional Jira link.",
    {
      connection: connectionField,
      project: z.string(),
      repository: z.string(),
      title: z.string(),
      fromRef: z.string(),
      toRef: z.string(),
      issueKey: z.string().optional(),
      description: z.string().optional(),
      dryRun: dryRunField,
    },
    async ({ connection, project, repository, title, fromRef, toRef, issueKey, description, dryRun }) => {
      const bb = factory.requireBitbucket(connection);
      const ref = { project, repository };
      const prTitle = issueKey && !title.includes(issueKey) ? `${issueKey}: ${title}` : title;
      const pr = await bb.createPullRequest(ref, prTitle, fromRef, toRef, description, dryRun);
      if (issueKey && !dryRun) {
        await factory.requireJira(connection).addComment(issueKey, `PR opened: ${prTitle}`, false);
      }
      return jsonResult({ pullRequest: pr, issueKey: issueKey ?? null });
    },
  );
}
