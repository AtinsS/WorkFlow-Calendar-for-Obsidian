/**
 * GitHub Gist API client for publishing .ics calendar files.
 */

import { requestUrl } from "obsidian";
import { tRaw } from "../i18n";

const GIST_API_URL = "https://api.github.com/gists";

export interface GistConfig {
  token: string;
  gistId?: string; // existing gist to update, or empty for create
}

export interface GistResult {
  id: string;
  url: string;
  rawUrl: string;
}

interface GistApiResponse {
  id: string;
  html_url: string;
  owner?: { login?: string };
  files: Record<string, { raw_url?: string; content?: string }>;
}

interface GitHubUserResponse {
  login: string;
}

export async function createGist(
  config: GistConfig,
  filename: string,
  content: string,
  description: string
): Promise<GistResult> {
  const files: Record<string, { content: string }> = {};
  files[filename] = { content };

  const body: Record<string, unknown> = {
    description,
    public: false,
    files,
  };

  // If gistId provided, update existing gist
  const url = config.gistId ? `${GIST_API_URL}/${config.gistId}` : GIST_API_URL;
  const method = config.gistId ? "PATCH" : "POST";

  const response = await requestUrl({
    url,
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });

  if (response.status !== 200 && response.status !== 201) {
    const errorBody: string = response.text;
    if (response.status === 403) {
      throw new Error(tRaw("gist.noScope"));
    }
    if (response.status === 401) {
      throw new Error(tRaw("gist.invalidToken"));
    }
    throw new Error(`GitHub API error ${response.status}: ${errorBody}`);
  }

  const data: GistApiResponse = response.json as GistApiResponse;
  const rawUrl: string = data.files[filename]?.raw_url ?? "";

  // Generate stable URL without revision hash for subscriptions
  // Format: https://gist.githubusercontent.com/{user}/{gist_id}/raw/{filename}
  const owner: string = data.owner?.login ?? rawUrl.match(/githubusercontent\.com\/([^/]+)\//)?.[1] ?? "";
  const stableRawUrl: string = owner && data.id
    ? `https://gist.githubusercontent.com/${owner}/${data.id}/raw/${filename}`
    : rawUrl;

  return {
    id: data.id,
    url: data.html_url,
    rawUrl: stableRawUrl,
  };
}

export async function verifyToken(token: string): Promise<{ login: string; scopes: string[]; hasGistScope: boolean }> {
  const response = await requestUrl({
    url: "https://api.github.com/user",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (response.status !== 200) {
    if (response.status === 401) {
      throw new Error(tRaw("gist.invalidTokenShort"));
    }
    throw new Error(`GitHub API error ${response.status}`);
  }

  const data: GitHubUserResponse = response.json as GitHubUserResponse;
  const scopesHeader: string = response.headers["x-oauth-scopes"] ?? "";
  const scopes: string[] = scopesHeader.split(",").map((s: string) => s.trim());
  const hasGistScope: boolean = scopes.includes("gist");

  if (!hasGistScope) {
    console.warn("[GistSync] Token missing 'gist' scope. Current scopes:", scopes);
  }

  return { login: data.login, scopes, hasGistScope };
}

export async function getGistContent(
  token: string,
  gistId: string,
  filename: string
): Promise<string | null> {
  const response = await requestUrl({
    url: `${GIST_API_URL}/${gistId}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (response.status !== 200) return null;

  const data: GistApiResponse = response.json as GistApiResponse;
  return data.files[filename]?.content ?? null;
}
