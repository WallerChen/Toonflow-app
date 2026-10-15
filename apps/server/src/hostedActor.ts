import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFile, writeAtomic, mkdir, readdir } from "@toonflow/file";
import { createApp } from "./app";

const root = resolve(import.meta.dirname, "../../..");
const dataDirectory = process.env.CFS_ACTOR_DIRECTORY!;
const bridge = process.env.CFS_ACTOR_BRIDGE!;
const credential = process.env.CFS_ACTOR_CREDENTIAL!;
if (!dataDirectory || !bridge || !credential) throw new Error("Use the hosted launcher to start this editor.");
const readRoutes = new Set([
  "/api/ai/models", "/api/ai/media/models", "/api/ai/media/balance", "/api/ai/media/balanceEvents",
  "/api/providers/media/list", "/api/providers/models", "/api/nodes/get", "/api/nodes/files",
  "/api/tools/get", "/api/tools/client", "/api/tools/renderers", "/api/ext/list", "/api/ext/read",
  "/api/skills/list", "/api/skills/get", "/api/skills/read", "/api/agents/get", "/api/agents/read",
  "/api/settings/get", "/api/settings/personalization/get", "/api/settings/systemPrompt",
  "/api/workspaces/list", "/api/workspaces/check", "/api/workspaces/files/list", "/api/workspaces/files/read",
  "/api/assets/list", "/api/assets/read", "/api/agent/list", "/api/agent/get", "/api/agent/skills", "/api/agent/mentionSource",
  "/api/mcp/status", "/api/mcp/control/events", "/api/ffmpeg/status",
]);
const writeRoutes = new Set([
  "/api/ai/generate", "/api/ai/media/generate", "/api/ai/media/price", "/api/ai/media/balance",
  "/api/workspaces/selectDirectory", "/api/workspaces/files/write", "/api/workspaces/files/mkdir", "/api/workspaces/files/rename", "/api/workspaces/files/remove", "/api/workspaces/files/copy",
  "/api/assets/save", "/api/assets/mkdir", "/api/assets/rename", "/api/assets/remove",
  "/api/agent", "/api/agent/create", "/api/agent/message", "/api/agent/answer", "/api/agent/canvasResult", "/api/agent/rename",
  "/api/mcp/control/state", "/api/mcp/control/result", "/api/mcp/skill", "/api/settings/personalization/save",
  "/api/singleAgent/create", "/api/singleAgent/run", "/api/singleAgent/answer", "/api/singleAgent/control", "/api/singleAgent/toolResult",
]);

// Hosted users cannot edit installed code; synchronize managed plugins on every build change.
const revision = createHash("sha256");
for (const directory of [resolve(root, "build/nodes"), resolve(root, "build/ext"), resolve(dataDirectory, "curatedTools")]) {
  for (const name of (await readdir(directory)).filter(name => name.endsWith(".js")).sort()) revision.update(name).update(await readFile(resolve(directory, name)));
}
const app = await createApp({
  webRoot: resolve(root, "build/web"), dataDirectory,
  nodesRoot: resolve(root, "build/nodes"), extRoot: resolve(root, "build/ext"),
  toolsRoot: resolve(dataDirectory, "curatedTools"), skillsRoot: resolve(root, "packages/skills"),
  pluginRevision: revision.digest("hex"),
  configureApp(app) {
    app.use(async (req, res, next) => {
      if (req.get("x-cfs-actor-credential") !== credential) return res.status(403).json({ code: 403, message: "Private editor instance" });
      if (/^\/(mcp|a2a)(\/|$)/.test(req.path)) return res.status(403).json({ code: 403, message: "External agent access is unavailable in the hosted studio." });
      if (!req.path.startsWith("/api/")) return next();
      const { default: conf } = await import("./utils/conf");
      if (req.path === "/api/hosted/info") return res.json({ code: 200, data: { name: "SiVideoGen", mode: "hosted", testing: conf.get("settings", {}).studioTesting === true, text: "Script → characters → storyboard → shots", attribution: "Powered by Toonflow · MIT", capabilities: { managedModels: true, audio: true } } });
      if (["/api/hosted/outputs", "/api/hosted/stitch", "/api/hosted/job"].includes(req.path)) {
        const path = req.path.endsWith("/job") ? `job/${String(req.query.id ?? "")}` : req.path.split("/").at(-1)!;
        const response = await fetch(`${bridge}/${path}`, { method: req.method, headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" }, body: req.method === "POST" ? JSON.stringify(req.body) : undefined });
        return res.status(response.status).json(await response.json());
      }
      if (req.path === "/api/settings/get") {
        const settings = structuredClone(conf.get("settings", {}));
        const language = req.get("x-cfs-studio-language");
        if (language) settings.ui = { ...(settings.ui as Record<string, unknown> | undefined), language };
        settings.customProviders = [{ id: "sivideogen", label: "SiVideoGen Writer", apiUrl: "", apiKey: "", protocol: "openai-completions", models: [{ id: "studio-writer", label: "Story & storyboard" }] }];
        settings.mediaProviderConfigs = {};
        return res.json({ code: 200, data: settings });
      }
      if (req.path === "/api/settings/save" && req.method === "PUT") {
        const settings = req.body?.settings;
        if (!settings || typeof settings !== "object") return res.status(400).json({ code: 400, message: "Invalid settings" });
        const previous = conf.get("settings", {});
        for (const key of ["ui", "general", "stores", "agentSystemPrompt"]) if (Object.hasOwn(settings, key)) previous[key] = settings[key];
        conf.set("settings", previous);
        return res.json({ code: 200, data: { nodeMenu: (previous.general as { nodeMenu?: unknown } | undefined)?.nodeMenu ?? null } });
      }
      if ((req.method === "GET" && readRoutes.has(req.path)) || (["POST", "PUT", "DELETE", "PATCH"].includes(req.method) && writeRoutes.has(req.path))) return next();
      console.warn("hosted_route_blocked", req.method, req.path);
      return res.status(403).json({ code: 403, message: "This host capability is managed by SiVideoGen." });
    });
  },
});
// Only managed provider connections are available. Browser-visible settings never contain these credentials.
const { default: conf } = await import("./utils/conf");
const settings = conf.get("settings", {});
settings.helloCompleted = true;
settings.customProviders = [{ id: "sivideogen", label: "SiVideoGen Writer", apiUrl: `${bridge}/llm/v1`, apiKey: credential, protocol: "openai-completions", models: [{ id: "studio-writer", label: "Story & storyboard", contextWindow: 24000, maxOutputTokens: 2048 }] }];
settings.mediaProviderConfigs = { sivideogen: { apiUrl: bridge, apiKey: credential } };
settings.privacy = { dataCollectionEnabled: false };
settings.mcp = { enabled: false };
settings.ui ??= { theme: "dark", primaryColor: "#39d99b", startupAnimation: false, language: "zh-CN" };
conf.set("settings", settings);
await mkdir(resolve(dataDirectory, "providers"), { recursive: true });
const response = await fetch(`${bridge}/catalog`, { headers: { authorization: `Bearer ${credential}` } });
if (!response.ok) throw new Error("Cannot load the managed model catalog.");
const { models, testing } = await response.json() as { models: unknown[]; testing?: boolean };
conf.set("settings.studioTesting", Boolean(testing));
const source = await readFile(resolve(root, "packages/providers/src/media/sivideogen.ts"), "utf8");
await writeAtomic(resolve(dataDirectory, "providers/sivideogen.ts"), source.replace("models: []", `models: ${JSON.stringify(models)}`));
const server = app.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") process.stdout.write(`CFS_READY:${address.port}\n`);
});
