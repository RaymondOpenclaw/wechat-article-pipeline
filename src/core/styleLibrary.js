import path from "node:path";
import { AiClient } from "./aiClient.js";
import {
  historyInboxPath,
  importHistoryFiles,
  importHistoryLinks,
  importHistoryTexts,
  loadStyleProfile,
  rawHistoryPath,
  refreshStyleProfile
} from "./styleProfile.js";
import { inspectStyleEngine, refreshStyleArtifacts } from "./styleEngine.js";
import { readJson, writeJson } from "../utils/files.js";

export function styleLibraryPaths(cwd, profileName = "default") {
  return {
    inboxPath: historyInboxPath(cwd, profileName),
    rawHistoryPath: rawHistoryPath(cwd, profileName),
    profilePath: path.join(cwd, "profiles", profileName, "style-profile.json"),
    stylePromptPath: path.join(cwd, "profiles", profileName, "style-prompt.md"),
    styleSkillPath: path.join(cwd, "profiles", profileName, "STYLE_SKILL.md"),
    manifestPath: path.join(cwd, "profiles", profileName, "style-library.json")
  };
}

export async function inspectStyleLibrary({ cwd = process.cwd(), profileName = "default" } = {}) {
  const paths = styleLibraryPaths(cwd, profileName);
  const profile = await loadStyleProfile(cwd, profileName);
  const raw = await readJson(paths.rawHistoryPath, null);
  const manifest = await readJson(paths.manifestPath, null);
  const artifacts = await inspectStyleEngine({ cwd, profileName });
  return {
    profileName,
    articleCount: profile?.articleCount || raw?.articles?.length || 0,
    profile,
    rawArticleCount: raw?.articles?.length || 0,
    failureCount: raw?.failures?.length || 0,
    lastRefreshedAt: profile?.updatedAt || manifest?.lastRefreshedAt || "",
    lastArtifactAt: manifest?.lastArtifactAt || "",
    autoRefresh: manifest?.autoRefresh || { enabled: true, intervalHours: 24 },
    paths,
    artifacts
  };
}

export async function importStyleLibraryLinks(links, {
  cwd = process.cwd(),
  profileName = "default",
  aiClient = new AiClient()
} = {}) {
  const result = await importHistoryLinks(links, { cwd, profileName, aiClient });
  await saveStyleLibraryManifest(cwd, profileName, {
    lastImportAt: new Date().toISOString(),
    lastImportType: "links",
    lastImportedCount: result.importedArticles?.length || 0
  });
  return refreshStyleLibraryArtifacts({ cwd, profileName, aiClient, source: "import-links", profileResult: result });
}

export async function importStyleLibraryTexts(items, {
  cwd = process.cwd(),
  profileName = "default",
  aiClient = new AiClient()
} = {}) {
  const result = await importHistoryTexts(items, { cwd, profileName, aiClient });
  await saveStyleLibraryManifest(cwd, profileName, {
    lastImportAt: new Date().toISOString(),
    lastImportType: "texts",
    lastImportedCount: result.importedArticles?.length || 0
  });
  return refreshStyleLibraryArtifacts({ cwd, profileName, aiClient, source: "import-texts", profileResult: result });
}

export async function refreshStyleLibrary({
  cwd = process.cwd(),
  profileName = "default",
  aiClient = new AiClient(),
  source = "manual-refresh"
} = {}) {
  const result = await refreshStyleProfile({ cwd, profileName, aiClient });
  return refreshStyleLibraryArtifacts({ cwd, profileName, aiClient, source, profileResult: result });
}

export async function refreshStyleLibraryFromInbox(targetPath, {
  cwd = process.cwd(),
  profileName = "default",
  aiClient = new AiClient()
} = {}) {
  const result = await importHistoryFiles(targetPath || historyInboxPath(cwd, profileName), { cwd, profileName, aiClient });
  return refreshStyleLibraryArtifacts({ cwd, profileName, aiClient, source: "inbox-files", profileResult: result });
}

export async function refreshStyleLibraryArtifacts({
  cwd = process.cwd(),
  profileName = "default",
  aiClient = new AiClient(),
  source = "manual-refresh",
  profileResult = null
} = {}) {
  const artifacts = await refreshStyleArtifacts({ cwd, profileName, aiClient });
  const manifest = await saveStyleLibraryManifest(cwd, profileName, {
    lastRefreshedAt: profileResult?.profile?.updatedAt || new Date().toISOString(),
    lastArtifactAt: new Date().toISOString(),
    lastRefreshSource: source,
    articleCount: artifacts.profile?.articleCount || profileResult?.profile?.articleCount || 0,
    stylePromptPath: artifacts.stylePromptPath,
    styleSkillPath: artifacts.styleSkillPath,
    failures: artifacts.failures || profileResult?.failures || []
  });
  return {
    ...(profileResult || {}),
    ...artifacts,
    manifest,
    library: await inspectStyleLibrary({ cwd, profileName })
  };
}

async function saveStyleLibraryManifest(cwd, profileName, patch) {
  const paths = styleLibraryPaths(cwd, profileName);
  const previous = await readJson(paths.manifestPath, null);
  const next = {
    profileName,
    autoRefresh: previous?.autoRefresh || { enabled: true, intervalHours: 24 },
    ...(previous || {}),
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await writeJson(paths.manifestPath, next);
  return next;
}
