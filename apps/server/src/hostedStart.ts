import { mkdir, chown } from "@toonflow/file";
import { resolve } from "node:path";

// Railway volumes mount as root; drop privileges before loading the editor or serving requests.
if (process.getuid?.() === 0) {
  const directory = resolve(process.env.CFS_STUDIO_DATA ?? "/app/data");
  await mkdir(directory, { recursive: true });
  await chown(directory, 1000, 1000);
  process.setgid!(1000);
  process.setuid!(1000);
}
await import("./hosted");
