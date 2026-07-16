/**
 * @raviraj87/atlassian-mcp · clients/jiraClient.ts
 * Jira REST API client (Server and Cloud).
 *
 * Copyright (c) 2026 Ravi Raj · MIT License · see LICENSE
 */

import { BaseClient } from "./baseClient.js";
import { JiraConfig } from "../config/schema.js";
import { BatchOptions, runBatch } from "../util/batch.js";
import { AtlassianError } from "../util/errors.js";
import {
  applyUpdateTemplate,
  bulkEditUnsupportedReason,
  issueRef,
  JiraBulkUpdateResult,
  JiraIssueUpdate,
  JiraIssueUpdateTemplate,
  JiraServerInfo,
  normalizeIssueUpdates,
} from "../util/jiraBulk.js";
import { RequestOptions } from "./types.js";

export interface JiraBulkUpdateOptions extends BatchOptions {
  concurrency?: number;
  batchSize?: number;
  continueOnError?: boolean;
}

export interface BulkUpdateFromJqlOptions extends JiraBulkUpdateOptions {
  jql: string;
  update: JiraIssueUpdateTemplate;
  maxIssues?: number;
  verifyJql?: boolean;
}

export class JiraClient extends BaseClient {
  readonly flavor: "server" | "cloud";
  protected readonly apiPrefix: string;
  private serverInfoCache?: JiraServerInfo;

  constructor(config: JiraConfig, auth: Record<string, string>) {
    super(config.url.replace(/\/+$/, ""), auth);
    this.flavor = config.flavor;
    this.apiPrefix = config.flavor === "cloud" ? "/rest/api/3" : "/rest/api/2";
  }

  async raw(path: string, options: RequestOptions = {}): Promise<unknown> {
    const { data } = await this.request(path.startsWith("/") ? path : `${this.apiPrefix}/${path}`, options);
    return data;
  }

  getIssue(issueKey: string, fields?: string[]) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}`, {
      query: fields?.length ? { fields: fields.join(",") } : undefined,
    });
  }

  searchIssues(jql: string, startAt = 0, maxResults = 50, fields?: string[]) {
    return this.raw("search", {
      method: "POST",
      body: { jql, startAt, maxResults, fields: fields ?? ["summary", "status", "assignee", "priority"] },
    });
  }

  createIssue(fields: Record<string, unknown>, dryRun?: boolean) {
    return this.raw("issue", { method: "POST", body: { fields }, dryRun });
  }

  updateIssue(issueKey: string, fields: Record<string, unknown>, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}`, {
      method: "PUT",
      body: { fields },
      dryRun,
    });
  }

  deleteIssue(issueKey: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}`, { method: "DELETE", dryRun });
  }

  assignIssue(issueKey: string, accountIdOrName: string, dryRun?: boolean) {
    const body =
      this.flavor === "cloud"
        ? { accountId: accountIdOrName }
        : { name: accountIdOrName };
    return this.raw(`issue/${encodeURIComponent(issueKey)}/assignee`, {
      method: "PUT",
      body,
      dryRun,
    });
  }

  getComments(issueKey: string, startAt = 0, maxResults = 50) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/comment`, {
      query: { startAt, maxResults },
    });
  }

  addComment(issueKey: string, body: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/comment`, {
      method: "POST",
      body: { body: this.flavor === "cloud" ? this.adf(body) : body },
      dryRun,
    });
  }

  updateComment(issueKey: string, commentId: string, body: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/comment/${commentId}`, {
      method: "PUT",
      body: { body: this.flavor === "cloud" ? this.adf(body) : body },
      dryRun,
    });
  }

  deleteComment(issueKey: string, commentId: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/comment/${commentId}`, {
      method: "DELETE",
      dryRun,
    });
  }

  getTransitions(issueKey: string) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/transitions`);
  }

  transitionIssue(issueKey: string, transitionId: string, fields?: Record<string, unknown>, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/transitions`, {
      method: "POST",
      body: { transition: { id: transitionId }, fields },
      dryRun,
    });
  }

  getWorklogs(issueKey: string) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/worklog`);
  }

  addWorklog(issueKey: string, timeSpent: string, comment?: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/worklog`, {
      method: "POST",
      body: { timeSpent, comment },
      dryRun,
    });
  }

  updateWorklog(issueKey: string, worklogId: string, timeSpent: string, comment?: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/worklog/${worklogId}`, {
      method: "PUT",
      body: { timeSpent, comment },
      dryRun,
    });
  }

  deleteWorklog(issueKey: string, worklogId: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/worklog/${worklogId}`, {
      method: "DELETE",
      dryRun,
    });
  }

  getAttachments(issueKey: string) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}`, { query: { fields: "attachment" } });
  }

  createIssueLink(inward: string, outward: string, linkType: string, dryRun?: boolean) {
    return this.raw("issueLink", {
      method: "POST",
      body: { type: { name: linkType }, inwardIssue: { key: inward }, outwardIssue: { key: outward } },
      dryRun,
    });
  }

  getIssueLinkTypes() {
    return this.raw("issueLinkType");
  }

  getRemoteLinks(issueKey: string) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/remotelink`);
  }

  createRemoteLink(issueKey: string, url: string, title: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/remotelink`, {
      method: "POST",
      body: { object: { url, title } },
      dryRun,
    });
  }

  getProjects(startAt = 0, maxResults = 50) {
    if (this.flavor === "cloud") {
      return this.raw("project/search", { query: { startAt, maxResults } });
    }
    return this.raw("project", { query: { startAt, maxResults } });
  }

  getProject(projectKeyOrId: string) {
    return this.raw(`project/${encodeURIComponent(projectKeyOrId)}`);
  }

  getIssueTypes(projectKey?: string) {
    return projectKey
      ? this.raw(`issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`)
      : this.raw("issuetype");
  }

  getCreateMeta(projectKey: string, issueTypeId?: string) {
    return this.raw(`issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes${issueTypeId ? `/${issueTypeId}` : ""}`);
  }

  lookupUser(query: string, maxResults = 20) {
    return this.raw("user/search", { query: { query, maxResults } });
  }

  getGroups(query?: string) {
    return this.raw("groups/picker", { query: query ? { query } : undefined });
  }

  getVersions(projectKey: string) {
    return this.raw(`project/${encodeURIComponent(projectKey)}/versions`);
  }

  createVersion(projectKey: string, name: string, description?: string, dryRun?: boolean) {
    return this.raw("version", {
      method: "POST",
      body: { name, description, project: projectKey },
      dryRun,
    });
  }

  getComponents(projectKey: string) {
    return this.raw(`project/${encodeURIComponent(projectKey)}/components`);
  }

  getChangelog(issueKey: string) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}`, { query: { expand: "changelog" } });
  }

  watchIssue(issueKey: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/watchers`, { method: "POST", body: {}, dryRun });
  }

  getWatchers(issueKey: string) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/watchers`);
  }

  bulkUpdate(issueUpdates: unknown[], options: JiraBulkUpdateOptions = {}) {
    const items = normalizeIssueUpdates(issueUpdates);
    return this.bulkUpdateIssues(items, options);
  }

  async getServerInfo(): Promise<JiraServerInfo> {
    if (this.serverInfoCache) return this.serverInfoCache;
    const data = (await this.raw("serverInfo")) as {
      deploymentType?: string;
      version?: string;
      baseUrl?: string;
    };
    this.serverInfoCache = {
      deploymentType: data.deploymentType ?? (this.flavor === "cloud" ? "Cloud" : "Server"),
      version: data.version ?? "unknown",
      baseUrl: data.baseUrl ?? this.baseUrl,
    };
    return this.serverInfoCache;
  }

  async bulkUpdateIssues(items: JiraIssueUpdate[], options: JiraBulkUpdateOptions = {}): Promise<JiraBulkUpdateResult> {
    const info = await this.getServerInfo();

    if (options.dryRun) {
      return {
        strategy: "parallel_put",
        deploymentType: info.deploymentType,
        deploymentVersion: info.version,
        reason: bulkEditUnsupportedReason(info, this.flavor),
        total: items.length,
        updated: 0,
        failed: 0,
        dryRun: true,
        sample: items.slice(0, 3),
        failures: [],
      };
    }

    return this.bulkUpdateViaParallelPut(items, options, info, bulkEditUnsupportedReason(info, this.flavor));
  }

  async bulkUpdateFromJql(options: BulkUpdateFromJqlOptions) {
    const {
      jql,
      update,
      maxIssues,
      verifyJql = true,
      concurrency = 10,
      batchSize = 50,
      continueOnError = true,
      retries = 2,
      dryRun = false,
    } = options;

    const issues = await this.searchAllIssues(jql, [], maxIssues);
    const issueUpdates = issues.map((issue) => applyUpdateTemplate(issue.key, update));

    const bulk = await this.bulkUpdateIssues(issueUpdates, {
      concurrency,
      batchSize,
      continueOnError,
      retries,
      dryRun,
    });

    const remainingJqlCount =
      verifyJql && !dryRun
        ? ((await this.searchIssues(jql, 0, 1)) as { total?: number }).total ?? 0
        : dryRun
          ? issues.length
          : undefined;

    return {
      jql,
      updateTemplate: update,
      matched: issues.length,
      remainingJqlCount,
      ...bulk,
    };
  }

  private async searchAllIssues(jql: string, fields: string[], maxIssues?: number) {
    const maxResults = 100;
    let startAt = 0;
    const issues: Array<{ key: string; fields?: Record<string, unknown> }> = [];
    while (true) {
      const page = (await this.searchIssues(jql, startAt, maxResults, fields.length ? fields : undefined)) as {
        total?: number;
        issues?: Array<{ key: string; fields?: Record<string, unknown> }>;
      };
      issues.push(...(page.issues ?? []));
      if (maxIssues && issues.length >= maxIssues) {
        return issues.slice(0, maxIssues);
      }
      const total = page.total ?? issues.length;
      startAt += maxResults;
      if (startAt >= total || !(page.issues?.length)) break;
    }
    return issues;
  }

  private async applyIssueUpdate(item: JiraIssueUpdate, dryRun?: boolean) {
    const ref = issueRef(item);
    if (item.transition) {
      return this.transitionIssue(ref, item.transition.id, item.fields, dryRun);
    }
    const body: Record<string, unknown> = {};
    if (item.fields) body.fields = item.fields;
    if (item.update) body.update = item.update;
    if (item.historyMetadata) body.historyMetadata = item.historyMetadata;
    if (item.properties) body.properties = item.properties;
    return this.raw(`issue/${encodeURIComponent(ref)}`, { method: "PUT", body, dryRun });
  }

  private async bulkUpdateViaParallelPut(
    items: JiraIssueUpdate[],
    options: JiraBulkUpdateOptions,
    info: JiraServerInfo,
    reason?: string,
  ): Promise<JiraBulkUpdateResult> {
    const batchSize = Math.max(1, options.batchSize ?? 50);
    const concurrency = Math.max(1, options.concurrency ?? options.parallelism ?? 10);
    const continueOnError = options.continueOnError !== false;
    const allResults: JiraBulkUpdateResult["results"] = [];
    let updated = 0;
    let failed = 0;

    for (let offset = 0; offset < items.length; offset += batchSize) {
      const chunk = items.slice(offset, offset + batchSize);
      const batch = await runBatch(
        chunk,
        issueRef,
        (item) => this.applyIssueUpdate(item, options.dryRun),
        {
          mode: "parallel",
          parallelism: concurrency,
          onError: continueOnError ? "continue" : "stop",
          dryRun: options.dryRun,
          retries: options.retries ?? 2,
        },
      );
      updated += batch.succeeded;
      failed += batch.failed;
      allResults.push(...batch.results);
      if (!continueOnError && batch.failed > 0) break;
    }

    const failures = allResults
      .filter((r) => !r.ok)
      .map((r) => ({ key: r.item, error: r.error ?? "unknown", status: r.status }));

    return {
      strategy: "parallel_put",
      deploymentType: info.deploymentType,
      deploymentVersion: info.version,
      reason,
      total: items.length,
      updated,
      failed,
      failures,
      results: allResults,
    };
  }

  getBoards(startAt = 0, maxResults = 50) {
    return this.request("/rest/agile/1.0/board", { query: { startAt, maxResults } }).then((r) => r.data);
  }

  getSprints(boardId: number, startAt = 0, maxResults = 50) {
    return this.request(`/rest/agile/1.0/board/${boardId}/sprint`, {
      query: { startAt, maxResults },
    }).then((r) => r.data);
  }

  getSprintIssues(sprintId: number, startAt = 0, maxResults = 50) {
    return this.request(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
      query: { startAt, maxResults },
    }).then((r) => r.data);
  }

  moveIssuesToSprint(sprintId: number, issueKeys: string[], dryRun?: boolean) {
    return this.request(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
      method: "POST",
      body: { issues: issueKeys },
      dryRun,
    }).then((r) => r.data);
  }

  rankIssues(issueKeys: string[], rankBefore?: string, rankAfter?: string, dryRun?: boolean) {
    return this.request("/rest/agile/1.0/issue/rank", {
      method: "PUT",
      body: { issues: issueKeys, rankBeforeIssue: rankBefore, rankAfterIssue: rankAfter },
      dryRun,
    }).then((r) => r.data);
  }

  async cloneIssue(sourceKey: string, overrides?: Record<string, unknown>, dryRun?: boolean) {
    const source = (await this.getIssue(sourceKey)) as { fields?: Record<string, unknown> };
    const fields = { ...(source.fields ?? {}), ...(overrides ?? {}) };
    delete fields.created;
    delete fields.updated;
    delete fields.creator;
    delete fields.reporter;
    delete fields.status;
    delete fields.resolution;
    delete fields.resolutiondate;
    delete fields.comment;
    delete fields.worklog;
    delete fields.attachment;
    return this.createIssue(fields, dryRun);
  }

  moveIssue(issueKey: string, targetProject: string, targetIssueType?: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/move`, {
      method: "POST",
      query: { newProject: targetProject, newIssueType: targetIssueType },
      dryRun,
    });
  }

  deleteIssueLink(linkId: string, dryRun?: boolean) {
    return this.raw(`issueLink/${encodeURIComponent(linkId)}`, { method: "DELETE", dryRun });
  }

  deleteRemoteLink(issueKey: string, linkId: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/remotelink/${linkId}`, {
      method: "DELETE",
      dryRun,
    });
  }

  async addAttachment(issueKey: string, filename: string, contentBase64: string, dryRun?: boolean) {
    if (dryRun) return { dryRun: true, issueKey, filename };
    const bytes = Buffer.from(contentBase64, "base64");
    const form = new FormData();
    form.append("file", new Blob([bytes]), filename);
    const { data } = await this.request(
      `${this.apiPrefix}/issue/${encodeURIComponent(issueKey)}/attachments`,
      {
        method: "POST",
        headers: { "X-Atlassian-Token": "no-check" },
        body: form,
      },
    );
    return data;
  }

  deleteAttachment(attachmentId: string, dryRun?: boolean) {
    return this.raw(`attachment/${encodeURIComponent(attachmentId)}`, { method: "DELETE", dryRun });
  }

  addVote(issueKey: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/votes`, { method: "POST", body: {}, dryRun });
  }

  removeVote(issueKey: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/votes`, { method: "DELETE", dryRun });
  }

  getVotes(issueKey: string) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/votes`);
  }

  unwatchIssue(issueKey: string, dryRun?: boolean) {
    return this.raw(`issue/${encodeURIComponent(issueKey)}/watchers`, { method: "DELETE", dryRun });
  }

  createComponent(projectKey: string, name: string, description?: string, dryRun?: boolean) {
    return this.raw("component", {
      method: "POST",
      body: { name, description, project: projectKey },
      dryRun,
    });
  }

  updateComponent(componentId: string, fields: Record<string, unknown>, dryRun?: boolean) {
    return this.raw(`component/${encodeURIComponent(componentId)}`, {
      method: "PUT",
      body: fields,
      dryRun,
    });
  }

  deleteComponent(componentId: string, dryRun?: boolean) {
    return this.raw(`component/${encodeURIComponent(componentId)}`, { method: "DELETE", dryRun });
  }

  updateVersion(versionId: string, fields: Record<string, unknown>, dryRun?: boolean) {
    return this.raw(`version/${encodeURIComponent(versionId)}`, { method: "PUT", body: fields, dryRun });
  }

  deleteVersion(versionId: string, dryRun?: boolean) {
    return this.raw(`version/${encodeURIComponent(versionId)}`, { method: "DELETE", dryRun });
  }

  getEpicIssues(epicKey: string, startAt = 0, maxResults = 50) {
    return this.request(`/rest/agile/1.0/epic/${encodeURIComponent(epicKey)}/issue`, {
      query: { startAt, maxResults },
    }).then((r) => r.data);
  }

  getBoardEpics(boardId: number, startAt = 0, maxResults = 50) {
    return this.request(`/rest/agile/1.0/board/${boardId}/epic`, {
      query: { startAt, maxResults },
    }).then((r) => r.data);
  }

  getBoardBacklog(boardId: number, startAt = 0, maxResults = 50) {
    return this.request(`/rest/agile/1.0/board/${boardId}/backlog`, {
      query: { startAt, maxResults },
    }).then((r) => r.data);
  }

  createSprint(name: string, originBoardId: number, startDate?: string, endDate?: string, dryRun?: boolean) {
    return this.request("/rest/agile/1.0/sprint", {
      method: "POST",
      body: { name, originBoardId, startDate, endDate },
      dryRun,
    }).then((r) => r.data);
  }

  updateSprint(sprintId: number, fields: Record<string, unknown>, dryRun?: boolean) {
    return this.request(`/rest/agile/1.0/sprint/${sprintId}`, {
      method: "PUT",
      body: fields,
      dryRun,
    }).then((r) => r.data);
  }

  deleteSprint(sprintId: number, dryRun?: boolean) {
    return this.request(`/rest/agile/1.0/sprint/${sprintId}`, {
      method: "DELETE",
      dryRun,
    }).then((r) => r.data);
  }

  getFields() {
    return this.raw("field");
  }

  createFilter(name: string, jql: string, description?: string, dryRun?: boolean) {
    return this.raw("filter", {
      method: "POST",
      body: { name, jql, description: description ?? "", favourite: false },
      dryRun,
    });
  }

  getFilter(filterId: number | string) {
    return this.raw(`filter/${filterId}`);
  }

  deleteFilter(filterId: number | string, dryRun?: boolean) {
    return this.raw(`filter/${filterId}`, { method: "DELETE", dryRun });
  }

  whoAmI() {
    return this.raw("myself");
  }

  private adf(text: string) {
    return {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    };
  }
}
