import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdir, readFile, writeAtomic } from "@toonflow/file";
import type { GeneratedMedia, MediaGenerationRequest } from "@toonflow/tools-scaffold/runtime";
import conf from "@/utils/conf";
import { generateMedia } from "@/utils/media/generation";

type mediaType = "image" | "video" | "audio";
type mediaJob = {
  id: string; directory: string; mediaType: mediaType; request: MediaGenerationRequest;
  fingerprint: string; status: "queued" | "running" | "succeeded" | "failed" | "interrupted";
  createdAt: number; updatedAt: number; files?: GeneratedMedia[]; message?: string;
};
const running = new Map<string, Promise<void>>();
const submissions = new Map<string, Promise<mediaJob>>();
const waiting = new Map<string, mediaJob>();
const jobRoot = resolve(dirname(conf.path), "mediaJobs");
function jobPath(id: string) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw Object.assign(new Error("Invalid generation task ID"), { status: 400 });
  return resolve(jobRoot, `${id}.json`);
}
async function readJob(id: string): Promise<mediaJob | undefined> {
  try { return JSON.parse(await readFile(jobPath(id), "utf8")); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw cause; }
}
async function saveJob(job: mediaJob) {
  await mkdir(jobRoot, { recursive: true });
  await writeAtomic(jobPath(job.id), JSON.stringify(job));
}
export function publicJob(job: mediaJob) {
  return { id: job.id, status: job.status, mediaType: job.mediaType, createdAt: job.createdAt, updatedAt: job.updatedAt, files: job.files, message: job.message };
}
function runJob(job: mediaJob) {
  if (running.has(job.id)) return;
  if (running.size >= 3) { waiting.set(job.id, job); return; }
  waiting.delete(job.id);
  // ACT: 单实例、最多三个并行媒体任务；请求断开不会中止已提交的付费生成。
  const operation = (async () => {
    try {
      job.status = "running"; job.updatedAt = Date.now();
      await saveJob(job);
      job.files = await generateMedia(job.directory, job.mediaType, job.request, AbortSignal.timeout(48 * 60_000), job.id);
      job.status = "succeeded";
    } catch (cause) {
      const status = (cause as { status?: number }).status;
      job.status = job.request.providerId === "sivideogen" && ![400, 402, 422].includes(status ?? 0) ? "interrupted" : "failed";
      job.message = cause instanceof Error ? cause.message : "Generation failed. Check your video history before starting another task.";
    }
    job.updatedAt = Date.now();
    await saveJob(job);
  })();
  running.set(job.id, operation);
  void operation.catch(() => console.error("media_job_persistence_failed", job.id)).finally(() => {
    running.delete(job.id);
    const next = waiting.values().next().value;
    if (next) runJob(next);
  });
}
export async function submitJob(directory: string, type: mediaType, request: MediaGenerationRequest, id: string): Promise<mediaJob> {
  jobPath(id);
  const fingerprint = createHash("sha256").update(JSON.stringify({ directory, type, request })).digest("hex");
  const previous = submissions.get(id);
  if (previous) {
    const job = await previous;
    if (job.fingerprint !== fingerprint) throw Object.assign(new Error("This task ID already has different settings."), { status: 409 });
    return job;
  }
  const operation = (async () => {
    const saved = await readJob(id);
    if (saved) {
      if (saved.fingerprint !== fingerprint) throw Object.assign(new Error("This task ID already has different settings."), { status: 409 });
      if (saved.status === "interrupted" && saved.request.providerId === "sivideogen") runJob(saved);
      return saved;
    }
    if (running.size >= 3) throw Object.assign(new Error("Three media tasks are already running. Wait for one to finish."), { status: 429 });
    const job: mediaJob = { id, directory, mediaType: type, request, fingerprint, status: "queued", createdAt: Date.now(), updatedAt: Date.now() };
    await saveJob(job);
    runJob(job);
    return job;
  })();
  submissions.set(id, operation);
  try { return await operation; } finally { submissions.delete(id); }
}
export async function getJob(directory: string, id: string) {
  const job = await readJob(id);
  if (!job || job.directory !== directory) throw Object.assign(new Error("Generation task not found in this workspace."), { status: 404 });
  if (["queued", "running"].includes(job.status) && !running.has(id)) {
    // 仅托管供应商用持久化 operationId 恢复；其他供应商重启后不能安全地重新提交付费请求。
    if (job.status === "queued" || job.request.providerId === "sivideogen") runJob(job);
    else {
      job.status = "interrupted";
      job.message = "The server restarted. Check the provider's task history before generating again; no automatic paid retry was made.";
      job.updatedAt = Date.now();
      await saveJob(job);
    }
  }
  return publicJob(job);
}
