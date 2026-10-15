<template>
  <el-dialog v-model="visible" :title="text('Shots, captions & export', '镜头、字幕与导出')" width="min(960px,94vw)" alignCenter appendToBody class="hostedCut" :closeOnClickModal="false">
    <div class="cutContent">
      <p>{{ text('Choose one finished shot, or join 2–6 shots in order. Joining and subtitle exports use no generation credits.', '选择一个成品镜头，或按顺序拼接 2–6 个镜头。拼接与字幕导出不扣生成积分。') }}</p>
      <div class="cutShots">
        <div v-for="(shot,index) in shots" :key="shot.id" class="cutShot">
          <label><input v-model="selected" type="checkbox" :value="shot.id" :disabled="busy"/><span>{{ index+1 }}. {{ shot.title || text('Shot','镜头') }} · {{ shot.duration }}s</span></label>
          <button :disabled="busy || index===0" :aria-label="text('Move shot up','镜头上移')" @click="move(index,-1)">↑</button>
          <button :disabled="busy || index===shots.length-1" :aria-label="text('Move shot down','镜头下移')" @click="move(index,1)">↓</button>
        </div>
      </div>
      <el-button :disabled="busy || selected.length<1 || selected.length>6" :loading="joining" @click="make">{{ selected.length===1 ? text('Use selected video','使用所选视频') : text('Join selected shots · Free','合成所选镜头 · 免费') }}</el-button>
      <p role="status" aria-live="polite" class="cutStatus"><span v-if="busy" class="cutSpinner"/>{{ status }}</p>
      <p v-if="error" role="alert" class="cutError">{{ error }}</p>
      <template v-if="source">
        <video :key="previewUrl" ref="player" :src="previewUrl" controls playsinline preload="metadata" @loadedmetadata="metadata">
          <track v-if="trackUrl && !exportId" :key="trackUrl" :src="trackUrl" kind="subtitles" srclang="en" :label="text('Captions','字幕')" default/>
        </video>
        <div class="cutActions"><a :href="source.url+'?download=1'" download="short-drama.mp4">{{ text('Download original MP4','下载原版 MP4') }}</a><a :href="previewUrl" target="_blank" rel="noopener">{{ text('Open video','打开视频') }}</a></div>
        <div class="cutHeading"><h3>{{ text('Editable captions','可编辑字幕') }}</h3><span>{{ videoDuration ? videoDuration.toFixed(2)+'s' : '' }}</span></div>
        <p>{{ text('Enter dialogue and adjust its timing to match the actual audio. This editor does not transcribe speech automatically.', '填写对白并按实际声音调整时间；这里不会自动识别语音。') }}</p>
        <div class="cutActions"><button :disabled="busy || !workspace.project" @click="loadDraft">{{ text('Load project captions','读取项目字幕') }}</button><button :disabled="busy || !workspace.project || !validCues" @click="saveDraft">{{ text('Save to project','保存到项目') }}</button></div>
        <div v-for="(cue,index) in cues" :key="index" class="cutCue">
          <label>{{ text('Start (s)','开始（秒）') }}<input v-model.number="cue.start" type="number" min="0" max="120" step="0.1" :disabled="busy"/></label>
          <label>{{ text('End (s)','结束（秒）') }}<input v-model.number="cue.end" type="number" min="0" max="120" step="0.1" :disabled="busy"/></label>
          <label class="cutText">{{ text('Caption','字幕') }} {{ index+1 }}<textarea v-model="cue.text" rows="2" maxlength="240" :disabled="busy"/></label>
          <button :disabled="busy" :aria-label="text('Remove caption','删除字幕')+' '+(index+1)" @click="cues.splice(index,1)">×</button>
        </div>
        <button :disabled="busy || cues.length>=60" @click="addCue">{{ text('+ Add caption','＋ 添加字幕') }}</button>
        <p v-if="cues.length && !validCues" class="cutError">{{ text('Use ordered, non-overlapping times within the video, and fill in each caption.', '请填写字幕，时间须按顺序、不重叠，且不能超出视频时长。') }}</p>
        <div class="cutActions"><button :disabled="!validCues" @click="downloadCaptions('srt')">SRT ↓</button><button :disabled="!validCues" @click="downloadCaptions('vtt')">VTT ↓</button><el-button type="primary" :disabled="busy || !validCues" :loading="rendering" @click="burn">{{ text('Export MP4 with subtitles','导出带字幕 MP4') }}</el-button></div>
        <p class="cutHint">{{ text('Up to 2 minutes / 80 MB. Caption text is permanently visible in the exported MP4.', '支持 2 分钟 / 80 MB 以内的视频。字幕会直接显示在导出的 MP4 画面中。') }}</p>
        <div v-if="exportId" class="cutActions"><a class="cutPrimary" :href="previewUrl+'?download=1'" download="short-drama-captioned.mp4">{{ text('Download captioned MP4','下载字幕版 MP4') }}</a></div>
        <div class="cutActions" v-if="supportsShare"><button v-if="!shareFile" :disabled="preparing || busy" @click="prepareShare">{{ preparing ? text('Preparing video…','正在准备视频…') : text('Prepare video for sharing','准备分享视频') }}</button><button v-else @click="share">{{ text('Share / Save video','分享 / 保存视频') }}</button></div>
        <p class="cutHint">{{ text('On mobile, use Download or Share. Available save destinations depend on your browser and device.', '手机可选择下载或分享；可保存的位置由浏览器和设备决定。') }}</p>
      </template>
    </div>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
type Shot = { id: string; title: string; url: string; duration: number };
type Cue = { start: number; end: number; text: string };
const chinese = document.documentElement.lang.startsWith('zh');
const text = (en: string, zh: string) => chinese ? zh : en;
const visible=ref(false), shots=ref<Shot[]>([]), selected=ref<string[]>([]), source=ref<Shot>(), cues=ref<Cue[]>([]);
const joining=ref(false), rendering=ref(false), status=ref(''), error=ref(''), videoDuration=ref(0), exportId=ref(''), trackUrl=ref(''), player=ref<HTMLVideoElement>();
const busy=computed(()=>joining.value || rendering.value), workspace=useWorkspaceStore();
const previewUrl=computed(()=>exportId.value ? `/api/hosted/exports/${exportId.value}/video` : source.value?.url || '');
const validCues=computed(()=>cues.value.length>0 && cues.value.length<=60 && cues.value.every((cue,index)=>Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start>=0 && cue.end>cue.start && cue.end<=Math.min(videoDuration.value || 120,120)+0.01 && cue.text.trim().length>0 && cue.text.length<=240 && !/[\u0000-\u0008\u000b-\u001f]/.test(cue.text) && (!index || cue.start>=cues.value[index-1].end)));
const supportsShare=typeof navigator.canShare==='function', shareFile=ref<File>(), preparing=ref(false);
let alive=true;
async function api(path: string, body?: unknown) { const response=await fetch(`/api/hosted/${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}); const result=await response.json(); if(!response.ok) throw new Error(result.message || 'Request failed'); return result; }
function failed(cause: unknown) { error.value=cause instanceof Error?cause.message:String(cause); }
async function open(){ visible.value=true; error.value=''; status.value=text('Loading shots…','正在读取镜头…'); try{ shots.value=(await api('outputs')).items; status.value=shots.value.length ? text('Select shots in playback order.','按播放顺序选择镜头。') : text('Finished shots from your canvas will appear here.','画布上生成完成的镜头会显示在这里。'); }catch(cause){failed(cause);status.value='';} }
function move(index:number,delta:number){ const item=shots.value.splice(index,1)[0]; shots.value.splice(index+delta,0,item); }
async function make(){ joining.value=true;error.value=''; try{ const items=shots.value.filter(shot=>selected.value.includes(shot.id)); if(items.length===1){ source.value=items[0]; }else{ status.value=text('Joining clips… You can close this panel while it runs.','正在合成镜头…等待时可关闭此面板。'); const result=await api('stitch',{jobIds:items.map(shot=>shot.id)}); for(let attempt=0;alive && attempt<240;attempt++){ const {job}=await api(`job?id=${encodeURIComponent(result.job.id)}`); if(job.status==='failed')throw new Error(job.error || 'Joining failed'); if(job.status==='succeeded' && job.video){source.value={id:job.id,url:job.video.url,title:'Final cut',duration:items.reduce((sum,item)=>sum+item.duration,0)};break;} await new Promise(resolve=>setTimeout(resolve,3000)); if(attempt===239)throw new Error(text('Still processing. Reopen this panel later to check your videos.','仍在处理中，稍后重新打开查看视频。')); } } exportId.value='';videoDuration.value=source.value?.duration||0;status.value=text('Video ready. Add captions or download it.','视频已就绪，可以添加字幕或下载。'); }catch(cause){failed(cause);}finally{joining.value=false;} }
function metadata(){ if(Number.isFinite(player.value?.duration))videoDuration.value=player.value!.duration; }
function addCue(){const start=cues.value.at(-1)?.end||0;cues.value.push({start,end:Math.min(start+3,videoDuration.value||120),text:''});}
async function loadDraft(){error.value='';try{const draft=await useWorkspaceFiles().readJson<{cues:Cue[]}>('subtitleDraft.json');if(!Array.isArray(draft.cues)||draft.cues.length>60||draft.cues.some(cue=>typeof cue.text!=='string'||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)))throw new Error('Invalid caption draft');cues.value=draft.cues.map(({start,end,text})=>({start,end,text}));status.value=text('Draft loaded. Check timings against the video.','草稿已读取，请对照视频校准时间。');}catch(cause){failed(cause);}}
async function saveDraft(){try{await useWorkspaceFiles().writeJson('subtitleDraft.json',{cues:cues.value});status.value=text('Captions saved to this project.','字幕已保存到当前项目。');}catch(cause){failed(cause);}}
function stamp(seconds:number,separator:string){const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${separator}${String(ms%1000).padStart(3,'0')}`;}
function captions(kind:'srt'|'vtt'){return (kind==='vtt'?'WEBVTT\n\n':'')+cues.value.map((cue,index)=>`${kind==='srt'?index+1+'\n':''}${stamp(cue.start,kind==='srt'?',':'.')} --> ${stamp(cue.end,kind==='srt'?',':'.')}\n${kind==='vtt'?cue.text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'):cue.text}\n`).join('\n');}
function downloadCaptions(kind:'srt'|'vtt'){const url=URL.createObjectURL(new Blob([captions(kind)],{type:kind==='vtt'?'text/vtt':'application/x-subrip'}));const link=document.createElement('a');link.href=url;link.download=`short-drama.${kind}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
watch(cues,()=>{exportId.value='';if(trackUrl.value)URL.revokeObjectURL(trackUrl.value);trackUrl.value=validCues.value?URL.createObjectURL(new Blob([captions('vtt')],{type:'text/vtt'})):'';},{deep:true});
watch(previewUrl,()=>{shareFile.value=undefined;});
async function burn(){if(!source.value||!validCues.value)return;rendering.value=true;error.value='';status.value=text('Rendering subtitles… Your original video is kept.','正在渲染字幕…原视频会保留。');try{let result=await api('exports',{jobId:source.value.id,cues:cues.value});for(let attempt=0;alive && attempt<120;attempt++){if(result.state==='ready'){exportId.value=result.id;status.value=text('Captioned MP4 is ready.','字幕版 MP4 已完成。');return;}if(result.state==='failed')throw new Error(result.error||'Export failed');await new Promise(resolve=>setTimeout(resolve,2000));result=await api(`exports/${result.id}`);}throw new Error(text('Export is still processing. Use Export again to check the same task.','导出仍在处理中，再次点击导出可查询同一任务。'));}catch(cause){failed(cause);}finally{rendering.value=false;}}
async function prepareShare(){preparing.value=true;error.value='';const url=previewUrl.value;try{const response=await fetch(url);if(!response.ok)throw new Error('Download failed');const blob=await response.blob();const item=new File([blob],'short-drama.mp4',{type:'video/mp4'});if(!navigator.canShare({files:[item]}))throw new Error(text('File sharing is unavailable here. Use Download MP4 instead.','当前浏览器不支持分享文件，请使用下载 MP4。'));if(url===previewUrl.value)shareFile.value=item;}catch(cause){failed(cause);}finally{preparing.value=false;}}
async function share(){if(!shareFile.value)return;try{await navigator.share({files:[shareFile.value],title:'SiVideoGen short drama'});}catch(cause){if(!(cause instanceof DOMException && cause.name==='AbortError'))failed(cause);}}
window.addEventListener('sivideogen:studio-cut-open',open);
onBeforeUnmount(()=>{alive=false;window.removeEventListener('sivideogen:studio-cut-open',open);if(trackUrl.value)URL.revokeObjectURL(trackUrl.value);});
</script>
<style lang="scss">
.hostedCut{.el-dialog__body{max-height:78dvh;overflow:auto;overscroll-behavior:contain}.cutContent{display:grid;gap:16px;padding-bottom:env(safe-area-inset-bottom);p{margin:0;line-height:1.6;color:var(--el-text-color-secondary)}button,a{min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--el-border-color);border-radius:8px;background:var(--el-fill-color-light);color:var(--el-text-color-primary);padding:8px 14px;font:inherit;cursor:pointer;text-decoration:none;gap:8px;&:disabled{opacity:.45;cursor:not-allowed}&:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:2px}}video{width:100%;max-height:320px;border-radius:10px;background:#000}.cutShots{max-height:200px;overflow:auto}.cutShot{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--el-border-color);padding:8px 0;label{display:flex;gap:10px;align-items:center;flex:1;min-width:0;span{overflow-wrap:anywhere}input{width:20px;height:44px;flex-shrink:0}}}.cutActions{display:flex;gap:10px;flex-wrap:wrap}.cutHeading{display:flex;align-items:center;justify-content:space-between;h3{margin:4px 0}}.cutCue{display:grid;grid-template-columns:85px 85px minmax(0,1fr) 44px;gap:10px;align-items:end;label{font-size:12px;display:grid;gap:6px}input,textarea{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border:1px solid var(--el-border-color);border-radius:8px;background:var(--el-bg-color);color:var(--el-text-color-primary);padding:8px;font-size:16px}textarea{resize:vertical}button{padding:8px}}.cutError{color:var(--el-color-danger)}.cutHint{font-size:12px}.cutPrimary{background:var(--el-color-primary);color:var(--el-color-primary-dark-2)}.cutStatus{display:flex;gap:10px;align-items:center;min-height:24px}.cutSpinner{width:16px;height:16px;border:2px solid var(--el-border-color);border-top-color:var(--el-color-primary);border-radius:50%;animation:cutSpin 1s linear infinite;flex-shrink:0}}}
@keyframes cutSpin{to{transform:rotate(360deg)}}
@media(max-width:600px){.hostedCut .cutContent .cutCue{grid-template-columns:1fr 1fr 44px;.cutText{grid-column:1/3;grid-row:2}button{grid-column:3;grid-row:2}}}
@media(prefers-reduced-motion:reduce){.hostedCut .cutContent .cutSpinner{animation-duration:3s}}
</style>
