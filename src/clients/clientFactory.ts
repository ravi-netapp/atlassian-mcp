/**
 * @raviraj87/atlassian-mcp · clients/clientFactory.ts
 * Named connection factory for Jira and Bitbucket clients.
 *
 * Copyright (c) 2026 Ravi Raj · MIT License · see LICENSE
 */

import { loadConfig, resolveEnv } from "../config/loadConfig.js";
import { AppConfig, ConfluenceConfig } from "../config/schema.js";
import { basicAuth, bearerAuth } from "./baseClient.js";
import { BitbucketClient } from "./bitbucketClient.js";
import { ConfluenceClient } from "./confluenceClient.js";
import { JiraClient } from "./jiraClient.js";
import { RichFiltersClient } from "./richFiltersClient.js";

export type ConnectionClients = {
  name: string;
  jira?: JiraClient;
  bitbucket?: BitbucketClient;
  confluence?: ConfluenceClient;
};

export class ClientFactory {
  private readonly config: AppConfig;
  private readonly cache = new Map<string, ConnectionClients>();

  constructor(config?: AppConfig) {
    this.config = config ?? loadConfig();
  }

  listConnections(): string[] {
    return Object.keys(this.config.connections);
  }

  listConfluenceConnections(): string[] {
    return Object.entries(this.config.connections)
      .filter(([, entry]) => entry.confluence)
      .map(([name]) => name);
  }

  defaultConnection(): string {
    return this.config.default_connection;
  }

  get(connection?: string): ConnectionClients {
    const name = connection ?? this.config.default_connection;
    const cached = this.cache.get(name);
    if (cached) return cached;

    const entry = this.config.connections[name];
    if (!entry) throw new Error(`Unknown connection: ${name}`);

    const clients: ConnectionClients = { name };

    if (entry.jira) {
      const j = entry.jira;
      if (j.flavor === "cloud") {
        clients.jira = new JiraClient(j, basicAuth(resolveEnv(j.email_env), resolveEnv(j.token_env)));
      } else {
        clients.jira = new JiraClient(j, bearerAuth(resolveEnv(j.token_env)));
      }
    }

    if (entry.bitbucket) {
      const b = entry.bitbucket;
      const user = resolveBitbucketUsername(b);
      clients.bitbucket = new BitbucketClient(b, basicAuth(user, resolveEnv(b.token_env)));
    }

    if (entry.confluence) {
      const c = entry.confluence;
      const cloudId = c.flavor === "cloud" ? resolveConfluenceCloudId(c) : undefined;
      if (c.flavor === "cloud") {
        clients.confluence = new ConfluenceClient(
          c,
          basicAuth(resolveEnv(c.email_env), resolveEnv(c.token_env)),
          cloudId,
        );
      } else {
        clients.confluence = new ConfluenceClient(c, bearerAuth(resolveEnv(c.token_env)));
      }
    }

    this.cache.set(name, clients);
    return clients;
  }

  requireJira(connection?: string): JiraClient {
    const jira = this.get(connection).jira;
    if (!jira) throw new Error("Jira is not configured for this connection");
    return jira;
  }

  richFilters(connection?: string): RichFiltersClient {
    return new RichFiltersClient(this.requireJira(connection));
  }

  requireBitbucket(connection?: string): BitbucketClient {
    const bb = this.get(connection).bitbucket;
    if (!bb) throw new Error("Bitbucket is not configured for this connection");
    return bb;
  }

  requireConfluence(connection?: string): ConfluenceClient {
    const confluence = this.get(connection).confluence;
    if (!confluence) throw new Error("Confluence is not configured for this connection");
    return confluence;
  }
}

/** Bitbucket Server auth uses account slug (e.g. jdoe), not email — strip domain if needed. */
function resolveBitbucketUsername(b: { flavor: string; username_env: string }): string {
  const raw = resolveEnv(b.username_env);
  if (b.flavor === "server" && raw.includes("@")) {
    return raw.split("@")[0];
  }
  return raw;
}

/** Scoped Cloud API tokens (ATATT3x) require api.atlassian.com/ex/confluence/{cloudId}. */
function resolveConfluenceCloudId(c: Extract<ConfluenceConfig, { flavor: "cloud" }>): string | undefined {
  if (c.cloud_id) return c.cloud_id;
  if (c.cloud_id_env) return resolveEnv(c.cloud_id_env);
  return undefined;
}
