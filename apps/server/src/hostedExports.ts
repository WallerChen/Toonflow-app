import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { mkdir, readFile, readdir, writeAtomic, rm, stat } from "@toonflow/file";
import { file } from "@toonflow/file/bun";
import { z } from "zod";

type Actor = { directory: string; active: number; touched: number };
type Cue = { start: number; end: number; text: string };
type ExportState = { id: string; jobId: string; state: "rendering" | "ready" | "failed"; createdAt: number; error?: string; duration?: number; cues: Cue[] };
const schema = z.object({ jobId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/), cues: z.array(z.object({ start: z.number().finite().min(0).max(120), end: z.number().finite().positive().max(120), text: z.string().trim().min(1).max(240) })).min(1).max(60) });
const running = new Set<string>();
const failure = (message: string, status = 400) => Object.assign(new Error(message), { status });
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "private, no-store" } });
function stamp(seconds: number, separator: string) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
}
function assStamp(seconds: number) { return stamp(seconds, ".").replace(/^0/, "").slice(0, -1); }
async function command(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 120000 });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (code !== 0) { console.warn("subtitle_export_failed", stderr.slice(-500)); throw failure("Video export could not finish. Your original video is unchanged.", 500); }
  return stdout;
}
async function render(directory: string, state: ExportState, source: URL) {
  const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 80 * 1024 * 1024) throw failure("Use a video under 80 MB.");
  let size = 0;
  const bytes: Uint8Array[] = [];
  for await (const part of response.body) { size += part.length; if (size > 80 * 1024 * 1024) throw failure("Use a video under 80 MB."); bytes.push(part); }
  await writeAtomic(resolve(directory, "input.mp4"), Buffer.concat(bytes));
  const metadata = JSON.parse(await command(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", "input.mp4"], directory));
  const duration = Number(metadata.format?.duration), video = metadata.streams?.find((stream: any) => stream.codec_type === "video");
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120 || !video?.width || !video?.height || video.width > 4096 || video.height > 4096) throw failure("Caption exports support videos up to two minutes and 4096 pixels.");
  if (state.cues.some(cue => cue.end > duration + 0.05)) throw failure("A caption extends beyond the video. Adjust its end time.");
  const cues = state.cues.map(cue => ({ ...cue, end: Math.min(cue.end, duration) }));
  await writeAtomic(resolve(directory, "captions.srt"), cues.map((cue, index) => `${index + 1}\n${stamp(cue.start, ",")} --> ${stamp(cue.end, ",")}\n${cue.text}\n`).join("\n"));
  await writeAtomic(resolve(directory, "captions.vtt"), "WEBVTT\n\n" + cues.map(cue => `${stamp(cue.start, ".")} --> ${stamp(cue.end, ".")}\n${cue.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}\n`).join("\n"));
  const fontSize = Math.round(video.height * 0.047), margin = Math.round(video.height * 0.075);
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${video.width}\nPlayResY: ${video.height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans CJK SC,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,0,0,0,0,100,100,0,0,1,2,1,2,${margin},${margin},${margin},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` + cues.map(cue => `Dialogue: 0,${assStamp(cue.start)},${assStamp(cue.end)},Default,,0,0,0,,${cue.text.replaceAll("\\", "＼").replaceAll("{", "｛").replaceAll("}", "｝").replace(/\r?\n/g, "\\N")}`).join("\n");
  await writeAtomic(resolve(directory, "captions.ass"), ass);
  await command(["ffmpeg", "-nostdin", "-y", "-threads", "1", "-i", "input.mp4", "-map", "0:v:0", "-map", "0:a?", "-vf", "subtitles=captions.ass", "-filter_threads", "1", "-c:v", "libx264", "-threads", "1", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "video.mp4"], directory);
  if ((await stat(resolve(directory, "video.mp4"))).size > 80 * 1024 * 1024) throw failure("The export exceeds 80 MB. Use a shorter video.");
  return { ...state, state: "ready" as const, duration, cues };
}

/** Restricted export of an owned core job. Never accepts user URLs, paths or FFmpeg arguments. */
export async function hostedExport(request: Request, pathname: string, actor: Actor, site: URL, getJob: (id: string) => Promise<any>): Promise<Response> {
  const root = resolve(actor.directory, "captionExports");
  await mkdir(root, { recursive: true });
  if (pathname === "/api/hosted/exports" && request.method === "POST") {
    if (Number(request.headers.get("content-length")) > 40000) throw failure("Caption data is too large.");
    const raw = await request.text(); if (raw.length > 40000) throw failure("Caption data is too large.");
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw failure("Invalid caption JSON."); }
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw failure("Add 1–60 captions with valid times and no more than 240 characters each.");
    const { jobId, cues } = parsed.data;
    if (cues.some((cue, index) => cue.end <= cue.start || (index > 0 && cue.start < cues[index - 1].end) || /[\u0000-\u0008\u000b-\u001f]/.test(cue.text))) throw failure("Captions must be in order, without overlapping times or control characters.");
    const { job } = await getJob(jobId);
    if (job.status !== "succeeded" || !["video", "stitch"].includes(job.kind) || !job.video?.url) throw failure("Choose a finished video from your account.");
    const source = new URL(job.video.url, site);
    if (source.origin !== site.origin || source.pathname !== `/media/o/sivideogen/${job.id}.mp4` || source.search) throw failure("Invalid source video.");
    const id = createHash("sha256").update(JSON.stringify({ jobId, cues })).digest("hex");
    const directory = resolve(root, id), key = `${actor.directory}:${id}`;
    const previous = await readFile(resolve(directory, "state.json"), "utf8").then(JSON.parse).catch((cause: NodeJS.ErrnoException) => { if (cause.code !== "ENOENT") throw cause; return null; });
    if (previous?.state === "ready" || running.has(key)) return reply(previous);
    // ACT: one renderer on the 1-CPU host; bounded private exports prevent unbounded work per account.
    if (running.size) throw failure("Another subtitle export is running. Try again shortly.", 429);
    if (!previous && (await readdir(root)).length >= 20) throw failure("This account has reached its saved subtitle export limit.", 409);
    running.add(key); actor.active++;
    const state: ExportState = { id, jobId, cues, state: "rendering", createdAt: Date.now() };
    try { await mkdir(directory, { recursive: true }); await writeAtomic(resolve(directory, "state.json"), JSON.stringify(state)); }
    catch (cause) { running.delete(key); actor.active--; throw cause; }
    void render(directory, state, source).then(result => writeAtomic(resolve(directory, "state.json"), JSON.stringify(result))).catch(async cause => {
      await rm(resolve(directory, "video.mp4"), { force: true });
      await writeAtomic(resolve(directory, "state.json"), JSON.stringify({ ...state, state: "failed", error: cause instanceof Error ? cause.message : "Export failed." }));
    }).finally(async () => { running.delete(key); actor.active--; actor.touched = Date.now(); await rm(resolve(directory, "input.mp4"), { force: true }); }).catch(cause => console.warn("caption_export_persistence", String(cause)));
    return reply(state, 202);
  }
  const match = pathname.match(/^\/api\/hosted\/exports\/([a-f0-9]{64})(?:\/(video|srt|vtt))?$/);
  if (!match || !["GET", "HEAD"].includes(request.method)) return reply({ message: "Not found" }, 404);
  const directory = resolve(root, match[1]);
  const state: ExportState | null = await readFile(resolve(directory, "state.json"), "utf8").then(JSON.parse).catch((cause: NodeJS.ErrnoException) => { if (cause.code !== "ENOENT") throw cause; return null; });
  if (!state) return reply({ message: "Export not found" }, 404);
  // Recheck job ownership/deletion for every download, including persisted exports.
  await getJob(state.jobId);
  if (state.state === "rendering" && !running.has(`${actor.directory}:${state.id}`)) { state.state = "failed"; state.error = "Export interrupted. Your source video is safe; export it again."; await writeAtomic(resolve(directory, "state.json"), JSON.stringify(state)); }
  if (!match[2]) return reply(state);
  if (state.state !== "ready") return reply({ message: "Export is not ready" }, 409);
  const kind = match[2], name = kind === "video" ? "video.mp4" : `captions.${kind}`, asset = file(resolve(directory, name));
  const headers = new Headers({ "content-type": kind === "video" ? "video/mp4" : kind === "srt" ? "application/x-subrip; charset=utf-8" : "text/vtt; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "accept-ranges": "bytes" });
  if (kind !== "video" || new URL(request.url).searchParams.get("download") === "1") headers.set("content-disposition", `attachment; filename="short-drama-${name}"`);
  const range = request.headers.get("range");
  if (range) {
    const bytes = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!bytes) return new Response(null, { status: 416, headers: { "content-range": `bytes */${asset.size}` } });
    const start = Number(bytes[1]), end = Math.min(bytes[2] ? Number(bytes[2]) : asset.size - 1, asset.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${asset.size}` } });
    headers.set("content-range", `bytes ${start}-${end}/${asset.size}`); headers.set("content-length", String(end - start + 1));
    return new Response(request.method === "HEAD" ? null : asset.slice(start, end + 1), { status: 206, headers });
  }
  headers.set("content-length", String(asset.size));
  return new Response(request.method === "HEAD" ? null : asset, { headers });
}
