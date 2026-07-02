# Atlassian MCP

Local MCP server for **Jira** and **Bitbucket**. Gives Cursor (or any MCP client) ~110 tools to search issues, manage PRs, and link Jira ↔ Bitbucket.

- Runs on **your machine** (not cloud-hosted)
- Uses **REST API + personal tokens** — **no Atlassian Connect app**
- **MIT license** — standalone repo: https://github.com/ravi-netapp/atlassian-mcp

---

## Quick start

```bash
git clone https://github.com/ravi-netapp/atlassian-mcp.git
cd atlassian-mcp
npm install
npm run build
```

Then edit `~/.cursor/mcp.json` (see [Cursor setup](#cursor-setup)), restart Cursor, and ask: *"Use jira_who_am_i"*.

---

## What you customize on each machine

Every user/machine needs **their own** values. Do not copy paths or tokens from someone else's config.

| What | Where | Example |
|------|--------|---------|
| Path to this repo | `mcp.json` → `args` | Where **you** cloned it, e.g. `~/code/atlassian-mcp/dist/index.js` |
| API tokens | `mcp.json` → `env` | Your `JIRA_PAT`, `BITBUCKET_TOKEN`, etc. |
| Jira/Bitbucket URLs | YAML **or** `env` | Your company's URLs |
| YAML config file | Optional | Default: `~/.atlassian-mcp.yaml` (home dir on **your** machine) |

**You do not need `ATLASSIAN_MCP_CONFIG`** if your YAML file is at `~/.atlassian-mcp.yaml` (the default).

---

## Authentication (no Atlassian Connect)

| Product | Type | What you need |
|---------|------|----------------|
| Jira Server / DC | On-prem | `JIRA_PAT` |
| Jira Cloud | Atlassian Cloud | `JIRA_EMAIL` + `JIRA_PAT` |
| Bitbucket Server / DC | On-prem | `BITBUCKET_USERNAME` + `BITBUCKET_TOKEN` |
| Bitbucket Cloud | Atlassian Cloud | `BITBUCKET_WORKSPACE` + username + app password |

You can configure **Jira only**, **Bitbucket only**, or both.

### How to get tokens

**Jira Server/DC:** Profile → Personal Access Tokens → create token → `JIRA_PAT`

**Jira Cloud:** [Create API token](https://id.atlassian.com/manage-profile/security/api-tokens) → `JIRA_EMAIL` + `JIRA_PAT`

**Bitbucket Server/DC:** Personal settings → HTTP access tokens → `BITBUCKET_USERNAME` (account slug) + `BITBUCKET_TOKEN`

**Bitbucket Cloud:** Personal settings → App passwords → `BITBUCKET_WORKSPACE` + `BITBUCKET_USERNAME` + `BITBUCKET_TOKEN`

---

## Choose a setup style

| Style | When to use | Config file? |
|-------|-------------|--------------|
| **A. YAML** | Multiple environments (e.g. `corp` + `cloud`) | `~/.atlassian-mcp.yaml` |
| **B. Env only** | One Jira + one Bitbucket connection | None |

---

## Setup A — YAML config

**1. Create config** (URLs only — no secrets in the file):

```bash
cp config.example.yaml ~/.atlassian-mcp.yaml
# Edit URLs in ~/.atlassian-mcp.yaml for your Jira/Bitbucket instances
```

**2. Put secrets in Cursor** (`~/.cursor/mcp.json` → `env`):

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "node",
      "args": ["<<YOUR_CLONE_PATH>>/atlassian-mcp/dist/index.js"],
      "env": {
        "JIRA_PAT": "your-jira-token",
        "BITBUCKET_USERNAME": "your-user",
        "BITBUCKET_TOKEN": "your-bitbucket-token"
      }
    }
  }
}
```

Replace `<<YOUR_CLONE_PATH>>` with the folder where you cloned the repo (e.g. `/Users/jane/code` or `C:\\dev`).

**Optional:** use a different YAML file location:

```json
"ATLASSIAN_MCP_CONFIG": "/path/on/your/machine/my-atlassian.yaml"
```

**Optional:** switch profiles per tool call: `"connection": "cloud"` (name from your YAML).

---

## Setup B — Env only (no YAML)

Put everything in `mcp.json` `env`:

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "node",
      "args": ["<<YOUR_CLONE_PATH>>/atlassian-mcp/dist/index.js"],
      "env": {
        "JIRA_BASE_URL": "https://jira.example.com",
        "JIRA_PAT": "your-token",
        "BITBUCKET_BASE_URL": "https://bitbucket.example.com",
        "BITBUCKET_USERNAME": "your-user",
        "BITBUCKET_TOKEN": "your-token"
      }
    }
  }
}
```

**Jira Cloud** — add `"JIRA_EMAIL": "you@company.com"` (do **not** set this for Server/DC).

**Bitbucket Cloud** — use `BITBUCKET_WORKSPACE` instead of `BITBUCKET_BASE_URL`:

```json
"BITBUCKET_WORKSPACE": "my-workspace",
"BITBUCKET_USERNAME": "my-user",
"BITBUCKET_TOKEN": "app-password"
```

### Env variable reference

| Variable | Required when | Notes |
|----------|---------------|-------|
| `JIRA_BASE_URL` | Jira (env mode) | Server/DC or Cloud URL |
| `JIRA_PAT` | Jira | API / personal access token |
| `JIRA_EMAIL` | Jira Cloud only | Omit for Server/DC |
| `BITBUCKET_BASE_URL` | BB Server/DC | Omit for Cloud |
| `BITBUCKET_WORKSPACE` | BB Cloud | Workspace slug |
| `BITBUCKET_USERNAME` | Bitbucket | Account slug or username |
| `BITBUCKET_TOKEN` | Bitbucket | HTTP token or app password |
| `ATLASSIAN_MCP_CONFIG` | Rarely | Only if YAML is **not** at `~/.atlassian-mcp.yaml` |
| `ATLASSIAN_DEFAULT_CONNECTION` | Optional | Default YAML profile name |

---

## Cursor setup

1. Edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project).
2. Use **Setup A** or **Setup B** above — pick one, not both.
3. Replace `<<YOUR_CLONE_PATH>>` with your clone location.
4. Restart Cursor completely.
5. Check **Settings → MCP** — `atlassian` should list tools.

**Dev mode** (skip `npm run build`):

```json
"command": "npx",
"args": ["tsx", "<<YOUR_CLONE_PATH>>/atlassian-mcp/src/index.ts"]
```

---

## Verify

**Terminal:**

```bash
export JIRA_PAT=... BITBUCKET_USERNAME=... BITBUCKET_TOKEN=...
npm run test:readonly
```

Expect `"ok": true`.

**In Cursor:** *"Use jira_who_am_i"* or *"Search Jira: assignee = currentUser()"*

---

## Using tools

| Parameter | Purpose |
|-----------|---------|
| `connection` | YAML profile name (`corp`, `cloud`, …). Omit = default. |
| `dryRun` | On write tools: `true` = validate only, no save. |

| You ask | Tool |
|---------|------|
| What's in PROJ-123? | `jira_get_issue`, `jira_triage_issue` |
| My open tickets | `jira_whats_on_my_plate` |
| PRs for PROJ-123 | `find_prs_for_jira_issue` |
| Release notes from JQL | `release_notes` |

---

## Tool reference

### Jira (~55)

Issues, comments, worklogs, attachments, links, workflow, agile/sprints, projects, versions, components — plus `jira_who_am_i`, `jira_api`.

### Bitbucket (~50)

Repos, branches, commits, PRs, review, tasks, code search, build status, webhooks — plus `bitbucket_api`.

### Cross-product (8)

`find_prs_for_jira_issue`, `find_jira_issues_for_pr`, `find_commits_for_jira_issue`, `open_pr_for_jira_issue`, `transition_jira_on_pr_event`, `comment_jira_with_pr_link`, `comment_pr_with_jira_summary`, `release_notes`

### Composite (6)

`jira_triage_issue`, `jira_whats_on_my_plate`, `bitbucket_triage_pr`, `bitbucket_review_pull_request`, `bitbucket_open_pr_from_changes`, `daily_standup`

<details>
<summary>Full Jira tool list</summary>

| Area | Tools |
|------|-------|
| Issues | `jira_get_issue`, `jira_search`, `jira_create_issue`, `jira_update_issue`, `jira_delete_issue`, `jira_assign_issue`, `jira_clone_issue`, `jira_move_issue`, `jira_bulk_update` |
| Comments | `jira_get_comments`, `jira_add_comment`, `jira_update_comment`, `jira_delete_comment` |
| Worklogs | `jira_get_worklogs`, `jira_add_worklog`, `jira_update_worklog`, `jira_delete_worklog` |
| Attachments | `jira_get_attachments`, `jira_add_attachment`, `jira_delete_attachment` |
| Links | `jira_create_issue_link`, `jira_delete_issue_link`, `jira_get_issue_link_types`, `jira_get_remote_links`, `jira_create_remote_link`, `jira_delete_remote_link` |
| Workflow | `jira_get_transitions`, `jira_transition_issue`, `jira_get_changelog` |
| Social | `jira_watch_issue`, `jira_unwatch_issue`, `jira_get_watchers`, `jira_add_vote`, `jira_remove_vote`, `jira_get_votes` |
| Projects | `jira_get_projects`, `jira_get_project`, `jira_get_issue_types`, `jira_get_create_meta`, `jira_lookup_user`, `jira_get_groups`, `jira_get_fields` |
| Versions | `jira_get_versions`, `jira_create_version`, `jira_update_version`, `jira_delete_version`, `jira_get_components`, `jira_create_component`, `jira_update_component`, `jira_delete_component` |
| Agile | `jira_get_boards`, `jira_get_sprints`, `jira_create_sprint`, `jira_update_sprint`, `jira_delete_sprint`, `jira_get_sprint_issues`, `jira_move_issues_to_sprint`, `jira_rank_issues`, `jira_get_epic_issues`, `jira_get_board_epics`, `jira_get_board_backlog` |
| Utility | `jira_list_connections`, `jira_who_am_i`, `jira_api` |

</details>

<details>
<summary>Full Bitbucket tool list</summary>

| Area | Tools |
|------|-------|
| Repos | `bitbucket_list_projects`, `bitbucket_list_repositories`, `bitbucket_search_repositories`, `bitbucket_get_repository`, `bitbucket_create_repository` |
| Branches | `bitbucket_list_branches`, `bitbucket_get_branch`, `bitbucket_create_branch`, `bitbucket_delete_branch`, `bitbucket_list_tags`, `bitbucket_create_tag` |
| Commits | `bitbucket_get_commit`, `bitbucket_list_commits` |
| PRs | `bitbucket_list_pull_requests`, `bitbucket_get_pull_request`, `bitbucket_create_pull_request`, `bitbucket_update_pull_request`, `bitbucket_merge_pull_request`, `bitbucket_decline_pull_request`, `bitbucket_get_pull_request_diff`, `bitbucket_list_pull_request_commits`, `bitbucket_get_pr_changes` |
| Review | `bitbucket_add_comment`, `bitbucket_delete_comment`, `bitbucket_list_pr_comments`, `bitbucket_set_pr_approval`, `bitbucket_set_review_status`, `bitbucket_add_pr_reviewer` |
| Tasks | `bitbucket_list_pr_tasks`, `bitbucket_create_pr_task`, `bitbucket_update_pr_task`, `bitbucket_delete_pr_task`, `bitbucket_set_pr_task_status`, `bitbucket_convert_pr_item` |
| Code | `bitbucket_get_file_content`, `bitbucket_list_directory`, `bitbucket_get_file_blame`, `bitbucket_search_code`, `bitbucket_search_files`, `bitbucket_find_in_files` |
| CI | `bitbucket_get_build_status`, `bitbucket_set_build_status`, `bitbucket_list_webhooks`, `bitbucket_create_webhook`, `bitbucket_delete_webhook` |
| Other | `bitbucket_search_users`, `bitbucket_manage_attachment`, `bitbucket_api` |

</details>

---

## npm scripts

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Build `dist/` (required before production use) |
| `npm run dev` | Run with `tsx` (no build) |
| `npm run test:readonly` | Smoke test against live APIs |

---

## Security

- Never commit tokens. YAML holds URLs only; secrets go in `mcp.json` `env`.
- Admin-capable: can create/update/delete issues, PRs, branches. Use `dryRun: true` when testing.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Config file not found | Use Setup B env vars, or create `~/.atlassian-mcp.yaml` |
| Missing env variable | Add token to `mcp.json` `env` |
| 401 / 403 Jira | Regenerate token; Cloud needs `JIRA_EMAIL` |
| 401 / 403 Bitbucket | Use account **slug**, not display name |
| Tools missing in Cursor | Fix `args` path; run `npm run build`; restart Cursor |
| Wrong machine paths | Use **your** clone path — never copy `/Users/someone/...` |

---

## Publishing

See [PUBLISHING.md](./PUBLISHING.md).
