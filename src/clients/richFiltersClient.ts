/**
 * @raviraj87/atlassian-mcp · clients/richFiltersClient.ts
 * Appfire Rich Filters for Jira (undocumented internal REST API).
 *
 * Copyright (c) 2026 Ravi Raj · MIT License · see LICENSE
 */

import { JiraClient } from "./jiraClient.js";
import { RequestOptions } from "./types.js";

const RF_PREFIX = "/rest/qoti-rich-filters/latest";

export interface RichFilterSearchParams {
  filterName?: string;
  startAt?: number;
  maxResults?: number;
  access?: "view" | "edit";
}

export interface RichFilterStaticFilterInput {
  label: string;
  jql: string;
  color?: string;
}

export interface RichFilterDynamicFilterInput {
  key: string;
}

export class RichFiltersClient {
  constructor(private readonly jira: JiraClient) {}

  private rf(path: string, options: RequestOptions = {}): Promise<unknown> {
    return this.jira.raw(`${RF_PREFIX}${path.startsWith("/") ? path : `/${path}`}`, options);
  }

  search(params: RichFilterSearchParams = {}) {
    return this.rf("rich-filters/search", { query: params as Record<string, string | number | boolean> });
  }

  get(richFilterId: number) {
    return this.rf(`rich-filters/${richFilterId}`);
  }

  create(name: string, jiraFilterId: number, dryRun?: boolean) {
    return this.rf("rich-filters", {
      method: "POST",
      body: { name, jiraFilter: jiraFilterId },
      dryRun,
    });
  }

  updateMeta(
    richFilterId: number,
    body: { name?: string; description?: string; jiraFilter?: number },
    dryRun?: boolean,
  ) {
    return this.rf(`rich-filters/${richFilterId}`, { method: "PUT", body, dryRun });
  }

  addStaticFilter(richFilterId: number, filter: RichFilterStaticFilterInput, dryRun?: boolean) {
    return this.rf(`rich-filters/${richFilterId}/static-filters`, {
      method: "POST",
      body: { label: filter.label, jql: filter.jql, color: filter.color ?? "#0052CC" },
      dryRun,
    });
  }

  addDynamicFilter(richFilterId: number, filter: RichFilterDynamicFilterInput, dryRun?: boolean) {
    return this.rf(`rich-filters/${richFilterId}/dynamic-filters`, {
      method: "POST",
      body: { key: filter.key },
      dryRun,
    });
  }

  issueCount(richFilterId: number, workingQuery = "") {
    return this.rf("support/issue-count", {
      method: "POST",
      body: { richFilterId, workingQuery },
    });
  }

  /** Add static + dynamic filter presets (POST per item). */
  async configure(
    richFilterId: number,
    opts: {
      staticFilters?: RichFilterStaticFilterInput[];
      dynamicFilters?: RichFilterDynamicFilterInput[];
      description?: string;
      dryRun?: boolean;
    },
  ) {
    if (opts.description) {
      await this.updateMeta(richFilterId, { description: opts.description }, opts.dryRun);
    }

    const created: { staticFilters: unknown[]; dynamicFilters: unknown[] } = {
      staticFilters: [],
      dynamicFilters: [],
    };

    for (const sf of opts.staticFilters ?? []) {
      created.staticFilters.push(await this.addStaticFilter(richFilterId, sf, opts.dryRun));
    }
    for (const df of opts.dynamicFilters ?? []) {
      created.dynamicFilters.push(await this.addDynamicFilter(richFilterId, df, opts.dryRun));
    }

    return created;
  }
}
