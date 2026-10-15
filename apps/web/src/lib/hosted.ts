import axios from "axios";
import { openHostedCut } from "./hostedCut";
export const nativeRoot = document.querySelector<HTMLElement>("#toonflow-native");
export const isNative = Boolean(nativeRoot);
export const isHosted = isNative || location.pathname.startsWith("/toonflow");

/** Branding and account navigation for the self-hosted SiVideoGen distribution. */
export function registerHosted() {
  if (!isHosted) return;
  const chinese = (new URLSearchParams(location.search).get("lang") ?? document.documentElement.lang).toLowerCase().startsWith("zh");
  if (isNative) {
    document.documentElement.dataset.hosted = "sivideogen";
    document.documentElement.dataset.toonflowNative = "true";
    const style = document.createElement("style");
    style.textContent = `#toonflow-native{height:100%;min-height:0;overflow:hidden;color:var(--el-text-color-primary);background:var(--el-bg-color)}#toonflow-native .workspacePage{height:100%!important}#toonflow-native .home{height:100%;min-height:0;overflow:hidden}#toonflow-native .home>.pageHeader{flex-shrink:0}#toonflow-native .home>.pageContent{min-height:0;overflow-y:auto;overscroll-behavior-y:contain;padding-bottom:max(56px,env(safe-area-inset-bottom))}html[data-toonflow-native] .nodeMenu{max-height:min(360px,calc(100dvh - 180px));overflow-y:auto}`;
    document.head.append(style);
    window.addEventListener("sivideogen:studio-cut", () => void openHostedCut());
    void fetch("/api/hosted/info").then(response => response.json()).then(result => {
      window.dispatchEvent(new CustomEvent("sivideogen:studio-info", { detail: { testing: Boolean(result.data?.testing) } }));
    }).catch(() => {});
    axios.interceptors.request.use(config => {
      if (config.url?.startsWith("https://api.toonflow.net")) throw new Error("Models and extensions are managed by SiVideoGen.");
      return config;
    });
    return;
  }
  document.title = "SiVideoGen · Short drama & anime studio";
  document.documentElement.dataset.hosted = "sivideogen";
  const style = document.createElement("style");
  style.textContent = `html[data-hosted] body{padding-top:44px;box-sizing:border-box;height:100dvh;overflow:hidden}html[data-hosted] #app{height:calc(100dvh - 44px)}html[data-hosted] .workspacePage{height:100%!important}html[data-hosted] .home{height:100%;min-height:0;overflow:hidden}html[data-hosted] .home>.pageHeader{flex-shrink:0}html[data-hosted] .home>.pageContent{min-height:0;overflow-y:auto;overscroll-behavior-y:contain;padding-bottom:max(56px,env(safe-area-inset-bottom))}#cfsHostedBar{height:44px;position:fixed;inset:0 0 auto;z-index:9999;display:flex;align-items:center;gap:16px;padding:0 18px;background:#111214;border-bottom:1px solid #292b30;color:#e4e6e9;font:13px/1.4 system-ui}#cfsHostedBar a{color:#65e9b6;text-decoration:none;min-height:44px;display:flex;align-items:center}#cfsHostedBar small{margin-left:auto;color:#a9afb7}@media(max-width:640px){#cfsHostedBar{gap:10px;padding:0 10px}#cfsHostedBar small,#cfsHostedBar .cfsHostedTitle{display:none}#cfsHostedBar .cfsHostedTest{font-size:10px!important}}`;
  document.head.append(style);
  const menuStyle = document.createElement("style");
  menuStyle.textContent = "html[data-hosted] .nodeMenu{max-height:min(360px,calc(100dvh - 120px));overflow-y:auto}";
  document.head.append(menuStyle);
  const bar = document.createElement("nav");
  bar.id = "cfsHostedBar";
  bar.setAttribute("aria-label", "SiVideoGen studio");
  const back = document.createElement("a"); back.href = "/ai-short-drama"; back.target = "_top"; back.textContent = "SiVideoGen";
  const label = document.createElement("span"); label.className = "cfsHostedTitle"; label.textContent = chinese ? "短剧 / AI 动漫工作台" : "Drama & anime studio";
  const credit = document.createElement("small"); credit.textContent = chinese ? "Toonflow · MIT · 生成前显示积分" : "Toonflow · MIT · Credits shown before generation";
  const cut = document.createElement("button"); cut.textContent = chinese ? "镜头与成片" : "Shots & final cut"; cut.style.cssText = "min-height:44px;padding:6px 12px;border:1px solid #34373e;border-radius:6px;background:transparent;color:#e4e6e9"; cut.onclick = () => void openHostedCut();
  bar.append(back, label, cut, credit);
  document.body.append(bar);
  void fetch("/api/hosted/info").then(response => response.json()).then(result => {
    if (result.data?.testing) {
      const badge = document.createElement("span"); badge.className = "cfsHostedTest"; badge.textContent = chinese ? "测试账号 · 演示结果" : "Test account · Mock outputs";
      badge.style.cssText = "color:#ffd28a;font-size:12px"; bar.insertBefore(badge, credit);
    }
  }).catch(() => {});
  // Suppress calls to the upstream account/marketplace: providers are operated by SiVideoGen.
  axios.interceptors.request.use(config => {
    if (config.url?.startsWith("https://api.toonflow.net")) throw new Error("模型和扩展由 SiVideoGen 管理。");
    return config;
  });
}
