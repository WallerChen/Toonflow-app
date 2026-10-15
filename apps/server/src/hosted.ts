import { createHmac, timingSafeEqual, createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { mkdir, readFile, writeAtomic, readdir, copyFile } from "@toonflow/file";

const root = resolve(import.meta.dirname, "../../..");
const dataRoot = resolve(process.env.CFS_STUDIO_DATA ?? resolve(root, "data/hosted"));
const site = new URL(process.env.CFS_SITE_ORIGIN ?? "https://sivideogen.com");
if (site.protocol !== "https:") throw new Error("The account service must use HTTPS.");
const localSessionFile = process.env.CFS_LOCAL_SESSION_FILE;
const proxyKey = process.env.CFS_STUDIO_PROXY_KEY;
if (!proxyKey && !localSessionFile) throw new Error("Set the site proxy key or a loopback-only development session file.");
const hostname = localSessionFile ? "127.0.0.1" : process.env.CFS_STUDIO_HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? process.env.CFS_STUDIO_PORT ?? 4390);
type Actor = { user: string; session: string; language?: string; credential: string; directory: string; port: Promise<number>; process?: ReturnType<typeof Bun.spawn>; active: number; touched: number };
const actors = new Map<string, Actor>();
const activeOperations = new Map<string, Promise<unknown>>();
let localIdentity: { user: string; session: string; expires: number } | undefined;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const error = (message: string, status = 400) => Object.assign(new Error(message), { status });
const requestHeaders = (actor: Actor) => ({ cookie: `sid=${actor.session}`, origin: site.origin });
function priceInput(request: any, type = request.type) {
  return { type, model: request.model, size: request.size, duration: request.duration, resolution: request.resolution,
    generateAudio: request.generateAudio, ratio: request.ratio, voice: request.voice, language: request.language,
    text: type === "audio" ? request.text ?? request.prompt : undefined,
    prompt: type !== "audio" ? request.prompt : undefined,
    references: Number(request.references) || request.images?.length || (request.firstFrame ? 1 : 0) };
}

async function account(actor: Actor, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(new URL(path, site), {
    method, headers: { ...requestHeaders(actor), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json() as any;
  if (!response.ok) throw error(result.message ?? "Account service unavailable", response.status);
  return result;
}

async function actorFor(user: string, session: string) {
  const id = createHash("sha256").update(user).digest("hex");
  const existing = actors.get(id);
  if (existing) { existing.session = session; existing.touched = Date.now(); return existing; }
  if (actors.size >= Number(process.env.CFS_MAX_EDITORS ?? 4)) throw error("The studio is busy. Try again shortly.", 503);
  const directory = resolve(dataRoot, id);
  const actor: Actor = { user, session, directory, credential: randomBytes(32).toString("hex"), port: Promise.resolve(0), active: 0, touched: Date.now() };
  actors.set(id, actor);
  actor.port = (async () => {
    await mkdir(resolve(directory, "workspaces/myProject"), { recursive: true });
    await mkdir(resolve(directory, "curatedTools"), { recursive: true });
    // Hosted users cannot install server code or invoke arbitrary FFmpeg/browser/network tools.
    for (const name of ["canvas", "mediaGeneration", "assetOperator", "askUser", "workspace"]) {
      for (const file of await readdir(resolve(root, "build/tools"))) if (file.startsWith(`${name}.`)) await copyFile(resolve(root, "build/tools", file), resolve(directory, "curatedTools", file));
    }
    const child = Bun.spawn([process.execPath, "--tsconfig-override", resolve(root, "apps/server/tsconfig.json"), resolve(root, "apps/server/src/hostedActor.ts")], {
      cwd: root,
      env: { PATH: process.env.PATH, NODE_ENV: "production", CFS_ACTOR_DIRECTORY: directory, CFS_ACTOR_BRIDGE: `http://127.0.0.1:${port}/bridge/${id}`, CFS_ACTOR_CREDENTIAL: actor.credential },
      stdout: "pipe", stderr: "pipe",
    });
    actor.process = child;
    void new Response(child.stderr).text().then(text => { if (text) console.error("Editor process exited:", text.replaceAll(actor.credential, "[redacted]").slice(-1200)); });
    const reader = child.stdout.getReader();
    let pending = "";
    const timeout = setTimeout(() => child.kill(), 90_000);
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) throw error("The creation editor could not start.", 503);
        pending += new TextDecoder().decode(result.value);
        const ready = pending.match(/CFS_READY:(\d+)/);
        if (ready) { void child.exited.then(() => { if (actors.get(id) === actor) actors.delete(id); }); return Number(ready[1]); }
        if (pending.length > 8000) pending = pending.slice(-4000);
      }
    } catch (cause) { actors.delete(id); throw cause; }
    finally { clearTimeout(timeout); reader.releaseLock(); }
  })();
  return actor;
}

async function upload(actor: Actor, input: any) {
  if (!input || !["base64", "binary"].includes(input.type) || typeof input.data !== "string") throw error("Use an uploaded image from this project.");
  const bytes = Buffer.from(input.data.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw error("Reference images must be under 10 MB.");
  const response = await fetch(new URL("/api/studio/core/api/uploads", site), { method: "POST", headers: { ...requestHeaders(actor), "content-type": input.mimeType ?? "application/octet-stream" }, body: bytes, redirect: "error", signal: AbortSignal.timeout(30_000) });
  const result = await response.json() as any;
  if (!response.ok) throw error(result.message ?? "Image upload failed", response.status);
  return result.id as string;
}

async function generate(actor: Actor, input: any) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.operationId ?? "")) throw error("A generation request ID is required.");
  const key = `${actor.user}:${input.operationId}`;
  const running = activeOperations.get(key);
  if (running) return running;
  const operation = (async () => {
    const { request: request, type } = input;
    if (!request || !["image", "video", "audio"].includes(type)) throw error("Choose an image, video or narration node.");
    if (request.mask) throw error("Masked inpainting is not connected to this managed provider.");
    if (type === "audio" && ((request.format && request.format !== "mp3") || (request.sampleRate && request.sampleRate !== 44100) || request.images?.length || request.audios?.length)) throw error("Managed narration uses MP3 at 44.1 kHz without voice cloning or media references.");
    const journal = resolve(actor.directory, `operation${input.operationId}.json`);
    let saved = await readFile(journal, "utf8").then(JSON.parse).catch((cause: NodeJS.ErrnoException) => { if (cause.code !== "ENOENT") throw cause; return null; });
    const fingerprint = createHash("sha256").update(JSON.stringify({ type, request })).digest("hex");
    if (saved && saved.fingerprint !== fingerprint) throw error("This request ID already has different settings.", 409);
    if (saved?.state === "starting") throw error("Submission status is uncertain. Check your video history before generating again.", 409);
    let jobId = saved?.jobId as string | undefined;
    if (!jobId) {
      const references = request.images?.length ? request.images : request.firstFrame ? [request.firstFrame] : [];
      if (references.length > (type === "video" ? 1 : 3) || request.lastFrame || request.videos?.length || request.audios?.length) throw error("This managed model supports image references only; use one starting image for video.");
      const quote = await account(actor, "/api/studio/quote", priceInput(request, type));
      const imageIds: string[] = [];
      for (const reference of references) imageIds.push(await upload(actor, reference));
      const body = type === "audio" ? { text: request.text ?? request.prompt, voice: request.voice ?? "eve", language: request.language ?? "en", expectedCost: quote.credits, requestKey: input.operationId } : type === "image"
        ? { kind: "image", model: request.model, mode: imageIds.length ? "edit" : "t2i", prompt: request.prompt, imageIds, aspectRatio: request.ratio, quality: request.size, count: 1 }
        : { model: request.model, mode: imageIds.length ? "i2v" : "t2v", prompt: request.prompt, imageId: imageIds[0], duration: request.duration, resolution: request.resolution, aspectRatio: request.ratio, audio: request.generateAudio === true };
      await writeAtomic(journal, JSON.stringify({ fingerprint, state: "starting", quote, createdAt: Date.now() }));
      const result = await account(actor, type === "audio" ? "/api/bedtime/audio" : "/api/studio/core/api/jobs", body);
      jobId = result.job.id;
      await writeAtomic(journal, JSON.stringify({ fingerprint, state: "submitted", jobId, type, prompt: request.prompt, quote, createdAt: Date.now() }));
    }
    const deadline = Date.now() + 46 * 60_000;
    while (Date.now() < deadline) {
      const { job } = await account(actor, type === "audio" ? `/api/bedtime/jobs/${jobId}` : `/api/studio/core/api/jobs/${jobId}`);
      if (job.status === "failed") throw error(job.error ?? "Generation failed; held credits are returned by SiVideoGen.");
      if (job.status === "succeeded") {
        const results = type === "audio" ? [{ url: `/api/bedtime/assets/${jobId}` }] : type === "image" ? job.images : job.video ? [job.video] : [];
        if (!results?.length) throw error("The job finished without an available result.");
        return results.map((asset: { url: string }) => ({ type: "url", mediaType: type, url: new URL(asset.url, site).href }));
      }
      await sleep(3000);
    }
    throw error("This generation is still running. Its progress remains in your video history.", 504);
  })();
  activeOperations.set(key, operation); actor.active++;
  try { return await operation; }
  finally { activeOperations.delete(key); actor.active--; actor.touched = Date.now(); }
}

async function bridge(request: Request, url: URL) {
  const match = url.pathname.match(/^\/bridge\/([a-f0-9]{64})\/(.+)$/);
  const actor = match && actors.get(match[1]);
  if (!actor || request.headers.get("authorization") !== `Bearer ${actor.credential}`) return json({ message: "Private bridge" }, 403);
  const path = match![2];
  if (path === "catalog") return json(await account(actor, "/api/studio/catalog"));
  if (path === "balance") return json({ balance: (await account(actor, "/api/studio/core/api/me")).balance ?? 0 });
  if (path === "quote") return json(await account(actor, "/api/studio/quote", priceInput(await request.json())));
  if (path === "generate") return json(await generate(actor, await request.json()));
  if (path === "outputs") {
    const items: any[] = [];
    for (const name of (await readdir(actor.directory)).filter(name => /^operation[a-zA-Z0-9_-]+\.json$/.test(name)).slice(-40)) {
      const record = JSON.parse(await readFile(resolve(actor.directory, name), "utf8"));
      if (record.type !== "video" || !record.jobId) continue;
      const { job } = await account(actor, `/api/studio/core/api/jobs/${record.jobId}`);
      if (job.status === "succeeded" && job.video) items.push({ id: job.id, title: String(job.prompt).slice(0, 100), url: new URL(job.video.url, site).href, duration: job.duration, cost: job.cost });
    }
    return json({ items });
  }
  if (path === "stitch") {
    const body = await request.json() as { jobIds?: string[] };
    if (!Array.isArray(body.jobIds) || body.jobIds.length < 2 || body.jobIds.length > 6 || new Set(body.jobIds).size !== body.jobIds.length) throw error("Choose two to six different shots in order.");
    return json(await account(actor, "/api/studio/core/api/stitch", { jobIds: body.jobIds, title: "Toonflow final cut" }));
  }
  if (path.startsWith("job/")) {
    const id = path.slice(4);
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw error("Invalid shot ID");
    const result = await account(actor, `/api/studio/core/api/jobs/${id}`);
    if (result.job.video) result.job.video.url = new URL(result.job.video.url, site).href;
    return json(result);
  }
  if (path === "llm/v1/chat/completions") {
    const response = await fetch(new URL("/api/studio/llm/v1/chat/completions", site), { method: "POST", headers: { ...requestHeaders(actor), "content-type": "application/json" }, body: await request.text(), signal: request.signal });
    return new Response(response.body, { status: response.status, headers: response.headers });
  }
  return json({ message: "Not found" }, 404);
}

const server = Bun.serve({
  port, hostname, idleTimeout: 255, maxRequestBodySize: 100 * 1024 * 1024,
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true });
      if (url.pathname.startsWith("/bridge/")) return await bridge(request, url);
      let identity: { user: string; session: string };
      if (localSessionFile) {
        const session = (await readFile(localSessionFile, "utf8")).trim();
        if (!localIdentity || localIdentity.session !== session || localIdentity.expires < Date.now()) {
          const response = await fetch(new URL("/api/me", site), { headers: { cookie: `sid=${session}` } });
          const me = await response.json() as any;
          if (!me.user?.id) return json({ message: "Development session expired" }, 401);
          localIdentity = { user: me.user.id, session, expires: Date.now() + 30_000 };
        }
        identity = localIdentity;
      } else {
        const encoded = request.headers.get("x-cfs-studio-grant"), signature = request.headers.get("x-cfs-studio-signature");
        if (!encoded || !signature || !/^[a-f0-9]{64}$/.test(signature)) return json({ message: "Sign in through SiVideoGen" }, 401);
        const grant = Buffer.from(encoded, "base64").toString("utf8");
        const expected = createHmac("sha256", proxyKey!).update(grant).digest();
        if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return json({ message: "Invalid studio grant" }, 403);
        const claims = JSON.parse(grant);
        if (claims.tenant !== "sivideogen" || claims.expires < Date.now() || claims.expires > Date.now() + 65_000 || claims.method !== request.method || claims.path !== url.pathname + url.search) return json({ message: "Expired studio grant" }, 403);
        identity = claims;
      }
      const actor = await actorFor(identity.user, identity.session);
      if (url.searchParams.has("lang")) actor.language = url.searchParams.get("lang")!.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
      const actorPort = await actor.port;
      const pathname = url.pathname.startsWith("/api/toonflow/") ? url.pathname.slice("/api/toonflow".length) : url.pathname.replace(/^\/toonflow/, "") || "/";
      const target = new URL(`http://127.0.0.1:${actorPort}${pathname}${url.search}`);
      const origin = target.origin;
      const headers = new Headers({ "x-cfs-actor-credential": actor.credential, "x-toonflow-local-client": "0", "x-toonflow-workspace": "1", origin, referer: `${origin}/` });
      if (actor.language) headers.set("x-cfs-studio-language", actor.language);
      for (const name of ["content-type", "accept", "accept-language", "range"]) { const value = request.headers.get(name); if (value) headers.set(name, value); }
      const response = await fetch(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body, redirect: "manual" });
      const result = new Headers(response.headers); result.delete("set-cookie"); result.set("cache-control", "private, no-store");
      // The unmodified editor uses root API URLs, including its bundled node extensions.
      if (/(javascript|application\/json|text\/html|text\/css)/.test(result.get("content-type") ?? "")) {
        result.delete("content-length"); result.delete("content-encoding");
        const text = (await response.text()).replace(/(["'`])\/(api|mcp|a2a)(?=[/"'`?])/g, "$1/api/toonflow/$2");
        return new Response(text, { status: response.status, headers: result });
      }
      return new Response(response.body, { status: response.status, headers: result });
    } catch (cause) { return json({ message: cause instanceof Error ? cause.message : "Studio unavailable" }, (cause as { status?: number }).status ?? 500); }
  },
});
setInterval(() => { for (const [id, actor] of actors) if (!actor.active && Date.now() - actor.touched > 10 * 60_000) { actor.process?.kill(); actors.delete(id); } }, 60_000).unref();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { for (const actor of actors.values()) actor.process?.kill(); server.stop(true); process.exit(0); });
console.log(`SiVideoGen Toonflow editor: http://${hostname}:${port}/toonflow/`);
