const cutLabels: Record<string,string> = {"暂时无法读取镜头": "Shots are temporarily unavailable", "镜头与成片": "Shots & final cut", "选择 2–6 个已完成镜头，调整顺序后合成 MP4。拼接不额外扣积分。": "Choose 2–6 finished shots, arrange their order and make an MP4. Joining clips costs no additional credits.", "关闭": "Close", "正在读取镜头…": "Loading shots…", "合成 MP4 · 免费": "Make MP4 · Free", "上移": "Up", "下移": "Down", "先在画布的视频节点生成镜头，完成后会出现在这里。": "Finished video shots from your canvas appear here.", "读取镜头失败": "Could not load shots", "正在提交合成…": "Submitting final cut…", "合成失败，原镜头仍保留。": "The final cut failed. Your original shots are still available.", "成片已完成": "Your final cut is ready", "下载 MP4": "Download MP4", "正在合成 MP4…": "Making the MP4…", "合成失败": "Could not make the final cut", "选择镜头": "Select shot", "镜头": "Shot", "个已完成镜头": "finished shots"};
function uiText(value: string) { const chinese = (new URLSearchParams(location.search).get("lang") ?? document.documentElement.lang).toLowerCase().startsWith("zh"); return chinese ? value : cutLabels[value] ?? value; }
type Shot = { id: string; title: string; url: string; duration: number };
async function api(path: string, body?: unknown) {
  const response = await fetch(`/api/hosted/${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || uiText("暂时无法读取镜头"));
  return result;
}
export async function openHostedCut() {
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "width:min(720px,calc(100vw - 32px));max-height:85dvh;overflow:auto;border:1px solid #34373e;border-radius:16px;padding:24px;background:#151619;color:#eee;font:14px/1.5 system-ui";
  const heading = document.createElement("h2"); heading.textContent = uiText("镜头与成片");
  const help = document.createElement("p"); help.textContent = uiText("选择 2–6 个已完成镜头，调整顺序后合成 MP4。拼接不额外扣积分。");
  const close = document.createElement("button"); close.textContent = uiText("关闭"); close.style.cssText = "float:right;min-height:44px;padding:8px 16px"; close.onclick = () => dialog.close();
  const status = document.createElement("p"); status.setAttribute("role", "status"); status.textContent = uiText("正在读取镜头…");
  const list = document.createElement("div");
  const make = document.createElement("button"); make.textContent = uiText("合成 MP4 · 免费"); make.disabled = true; make.style.cssText = "min-height:44px;padding:10px 20px;background:#65e9b6;color:#10251c;border:0;border-radius:8px;margin-top:16px";
  dialog.append(close, heading, help, status, list, make); document.body.append(dialog); dialog.addEventListener("close", () => { dialog.remove(); }); dialog.showModal();
  let shots: Shot[] = [], selected = new Set<string>();
  function render() {
    list.replaceChildren();
    shots.forEach((shot, index) => {
      const row = document.createElement("div"); row.style.cssText = "display:grid;grid-template-columns:28px minmax(0,1fr) 48px 48px;gap:8px;align-items:center;padding:12px 0;border-bottom:1px solid #34373e";
      const check = document.createElement("input"); check.type = "checkbox"; check.id = `shot-${shot.id}`; check.style.cssText = "width:24px;height:44px"; check.checked = selected.has(shot.id); check.setAttribute("aria-label", `${uiText("选择镜头")} ${index + 1}`); check.onchange = () => { check.checked ? selected.add(shot.id) : selected.delete(shot.id); make.disabled = selected.size < 2 || selected.size > 6; };
      const title = document.createElement("label"); title.htmlFor = check.id; title.textContent = `${index + 1}. ${shot.title || uiText("镜头")} · ${shot.duration}s`;
      const up = document.createElement("button"); up.textContent = uiText("上移"); up.disabled = index === 0; up.style.minHeight = "44px"; up.onclick = () => { [shots[index - 1], shots[index]] = [shots[index], shots[index - 1]]; render(); };
      const down = document.createElement("button"); down.textContent = uiText("下移"); down.disabled = index === shots.length - 1; down.style.minHeight = "44px"; down.onclick = () => { [shots[index + 1], shots[index]] = [shots[index], shots[index + 1]]; render(); };
      row.append(check, title, up, down); list.append(row);
    });
  }
  try { shots = (await api("outputs")).items; status.textContent = shots.length ? `${shots.length} ${uiText("个已完成镜头")}` : uiText("先在画布的视频节点生成镜头，完成后会出现在这里。"); render(); }
  catch (cause) { status.textContent = cause instanceof Error ? cause.message : uiText("读取镜头失败"); }
  make.onclick = async () => {
    make.disabled = true;
    try {
      status.textContent = uiText("正在提交合成…");
      const result = await api("stitch", { jobIds: shots.filter(shot => selected.has(shot.id)).map(shot => shot.id) });
      while (dialog.isConnected) {
        const { job } = await api(`job?id=${encodeURIComponent(result.job.id)}`);
        if (job.status === "failed") throw new Error(job.error || uiText("合成失败，原镜头仍保留。"));
        if (job.status === "succeeded" && job.video) {
          status.textContent = uiText("成片已完成");
          const video = document.createElement("video"); video.controls = true; video.src = job.video.url; video.style.cssText = "width:100%;max-height:320px;margin-top:16px";
          const download = document.createElement("a"); download.href = job.video.url; download.download = "short-drama.mp4"; download.textContent = uiText("下载 MP4"); download.style.cssText = "display:block;color:#65e9b6;min-height:44px;padding-top:12px";
          list.append(video, download); return;
        }
        status.textContent = uiText("正在合成 MP4…");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (cause) { if (dialog.isConnected) status.textContent = cause instanceof Error ? cause.message : uiText("合成失败"); }
    finally { make.disabled = false; }
  };
}
