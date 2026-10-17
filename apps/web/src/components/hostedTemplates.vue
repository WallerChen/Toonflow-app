<template>
  <teleport v-if="isNative" to=".toonflow-studio > header">
    <button type="button" class="templateEntry" @click="open">{{ text('Drama templates', '短剧模板') }}</button>
  </teleport>
  <el-dialog v-model="visible" :title="text('Start with a story', '从一个故事开始')" width="min(1040px, 94vw)" alignCenter appendToBody :closeOnClickModal="!creating" :closeOnPressEscape="!creating" :showClose="!creating" class="dramaTemplates">
    <p class="templateIntro">{{ text('Choose a three-shot story. Edit the character and dialogue, then generate each shot on your canvas.', '选择三镜头短剧，修改角色与对白，然后在画布中逐镜头生成。') }}</p>
    <div class="templateLayout">
      <div class="templateGrid" role="group" :aria-label="text('Supported templates', '支持的模板')">
        <button v-for="item in dramaTemplates" :key="item.id" type="button" class="templateCard" :class="{ chosen: selected.id === item.id }" :aria-pressed="selected.id === item.id" :disabled="creating" @click="select(item)">
          <span class="templateGenre">{{ item.genre[languageIndex] }}</span><strong>{{ item.title[languageIndex] }}</strong><span>{{ item.premise[languageIndex] }}</span><small>{{ text('3 editable shots', '3 个可编辑镜头') }}</small>
        </button>
      </div>
      <section class="templateDetails" :aria-label="text('Template settings', '模板设置')">
        <label>{{ text('Project title', '项目名称') }}<input v-model="title" :disabled="creating" maxlength="70" /></label>
        <label>{{ text('Character description', '角色描述') }}<textarea v-model="character" :disabled="creating" rows="3" maxlength="600" /></label>
        <div class="templateFields">
          <label>{{ text('Dialogue', '对白语言') }}<select v-model="speech" :disabled="creating"><option value="en">English</option><option value="zh">中文</option></select></label>
          <label>{{ text('Format', '画面比例') }}<select v-model="ratio" :disabled="creating"><option>9:16</option><option>16:9</option><option>1:1</option></select></label>
          <label>{{ text('Each shot', '单镜头时长') }}<select v-model.number="duration" :disabled="creating"><option v-for="value in durations" :key="value" :value="value">{{ value }}s</option></select></label>
          <label>{{ text('Resolution', '分辨率') }}<select v-model="resolution" :disabled="creating"><option v-for="value in resolutions" :key="value">{{ value }}</option></select></label>
        </div>
        <label>{{ text('Available model', '可用模型') }}<select v-model="modelId" :disabled="creating || !models.length"><option v-for="model in models" :key="model.modelId" :value="model.modelId">{{ model.label }}</option></select></label>
        <ol class="templateBeats"><li v-for="(beat, index) in selected.beats" :key="index"><strong>{{ index + 1 }} · {{ text(['Opening', 'Turn', 'Payoff'][index], ['开场', '转折', '收尾'][index]) }}</strong><p>{{ beat.action }}</p><label>{{ text('Editable dialogue', '可编辑对白') }}<textarea v-model="lines[index]" rows="2" maxlength="120" :disabled="creating" /></label></li></ol>
        <p class="templateNotice">{{ text('Keep the same character reference image across shots for a consistent cast. This is a script preview, not a generated video.', '跨镜头使用同一张角色参考图，保持人物一致。这里是剧本预览，不是已生成的视频。') }}</p>
        <p role="status">{{ quote || text('Checking available models…', '正在检查可用模型…') }}</p>
        <p v-if="errorMessage" role="alert" class="templateError">{{ errorMessage }}</p>
      </section>
    </div>
    <template #footer><span class="templateFree">{{ text('Creating a template project uses no credits. Generation is billed per shot.', '创建模板项目不扣积分，生成时按镜头收费。') }}</span><el-button type="primary" :loading="creating" :disabled="!chosenModel || !title.trim() || !character.trim()" @click="create">{{ text('Use template', '使用模板') }}</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { isNative } from "@/lib/hosted";
import router from "@/router";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { dramaTemplates, type DramaTemplate } from "@/lib/dramaTemplates";
const chinese = document.documentElement.lang.startsWith("zh");
const text = (en: string, zh: string) => chinese ? zh : en;
const languageIndex = chinese ? 1 : 0;
const visible = ref(false), creating = ref(false), errorMessage = ref(""), quote = ref("");
const selected = ref(dramaTemplates[0]), title = ref(""), character = ref(""), speech = ref(chinese ? "zh" : "en"), lines = ref<string[]>([]);
const ratio = ref("9:16"), duration = ref(5), resolution = ref("768p"), modelId = ref("");
type Model = { providerId: string; modelId: string; label: string; type: string; audio?: boolean | string; durationResolutionMap: { duration: number[]; resolution: string[] }[] };
const models = ref<Model[]>([]), chosenModel = computed(() => models.value.find(model => model.modelId === modelId.value));
const durations = computed(() => [...new Set(chosenModel.value?.durationResolutionMap.flatMap(group => group.duration) ?? [])].filter(value => [5, 10].includes(value)));
const resolutions = computed(() => [...new Set(chosenModel.value?.durationResolutionMap.filter(group => group.duration.includes(duration.value)).flatMap(group => group.resolution) ?? [])]);
const workspace = useWorkspaceStore();
function select(item: DramaTemplate) { selected.value = item; title.value = item.title[languageIndex]; character.value = item.character; lines.value = item.beats.map(beat => beat.line[speech.value === "zh" ? 1 : 0]); }
watch(speech, () => { lines.value = selected.value.beats.map(beat => beat.line[speech.value === "zh" ? 1 : 0]); });
watch([modelId, duration], () => { if (durations.value.length && !durations.value.includes(duration.value)) duration.value = durations.value[0]; if (resolutions.value.length && !resolutions.value.includes(resolution.value)) resolution.value = resolutions.value[0]; });
let quoteSequence = 0;
watch([modelId, duration, resolution, ratio], async () => {
  const sequence = ++quoteSequence, model = chosenModel.value; if (!model) return;
  quote.value = text('Checking price…', '正在核价…');
  try {
    const { data } = await axios.post('/api/ai/media/price', { mediaType: 'video', providerId: model.providerId, modelId: model.modelId, prompt: '', duration: duration.value, resolution: resolution.value, ratio: ratio.value, generateAudio: model.audio === 'optional' || model.audio === true });
    if (sequence !== quoteSequence) return;
    if (data.code !== 200) throw new Error(data.message);
    const price = String(data.data?.price ?? ''), credits = /^(\d+) credits$/.exec(price);
    quote.value = credits ? text(`${price} / shot · ${Number(credits[1]) * 3} credits for 3 shots`, `${credits[1]} 积分 / 镜头 · 三镜头共 ${Number(credits[1]) * 3} 积分`) : price || text('Price shown before each generation.', '每次生成前显示价格。');
  } catch { if (sequence === quoteSequence) quote.value = text('Price temporarily unavailable. Check the quote on each node before generating.', '价格暂不可用，请在生成前查看各节点报价。'); }
});
async function open() {
  visible.value = true; errorMessage.value = ''; select(selected.value);
  try { const { data } = await axios.get('/api/ai/media/models'); if (data.code !== 200) throw new Error(data.message); models.value = data.data.filter((model: Model) => model.type === 'video' && model.providerId === 'sivideogen' && ['minimax-h3-compshare', 'minimax-h3-max-turbo'].includes(model.modelId)); modelId.value = models.value[0]?.modelId ?? ''; if (!models.value.length) errorMessage.value = text('No supported video model is available right now.', '当前没有可用的视频模型。'); }
  catch (cause) { errorMessage.value = cause instanceof Error ? cause.message : text('Could not load models.', '模型读取失败。'); }
}
async function create() {
  const model = chosenModel.value; if (!model || creating.value) return;
  creating.value = true; errorMessage.value = '';
  try {
    const { data } = await axios.get('/api/workspaces/list'); if (data.code !== 200) throw new Error(data.message);
    const root = data.data.absolutePath, folder = `${selected.value.id}${crypto.randomUUID().slice(0, 8)}`;
    await useWorkspaceFiles(root).mkdir(folder);
    const directory = `${root}/${folder}`, files = useWorkspaceFiles(directory);
    const story = `# ${title.value}\n\n${character.value}\n\n${selected.value.style}\n\n` + selected.value.beats.map((beat, index) => `## ${index + 1}\n${beat.action}\n\n${lines.value[index]}`).join('\n\n');
    const nodes: unknown[] = [{ id: crypto.randomUUID(), type: 'remote-textNode', position: { x: 0, y: 0 }, data: { label: text('Story & character bible', '剧本与角色设定'), textSnapshot: story } }];
    selected.value.beats.forEach((beat, index) => {
      const prompt = `${character.value}. ${selected.value.style}. ${beat.action} ${lines.value[index]?.trim() ? `Spoken dialogue in ${speech.value === 'zh' ? 'Mandarin Chinese' : 'English'}: "${lines.value[index].trim()}".` : 'No dialogue.'} Same character design and wardrobe in every shot. Natural ambient audio. No burned-in text, titles, subtitles, logos or watermarks.`;
      nodes.push({ id: crypto.randomUUID(), type: 'remote-videoGenerationNode', position: { x: 520 + index * 560, y: 0 }, data: { label: `${index + 1} · ${title.value}`, prompt, promptModel: [[{ type: 'Write', text: prompt }]], model: JSON.stringify([model.providerId, model.modelId]), mode: JSON.stringify('text'), duration: duration.value, resolution: resolution.value, ratio: ratio.value, generateAudio: model.audio === 'optional' || model.audio === true } });
    });
    await files.writeJson('storyboard.json', { toonflowCanvas: true, nodes, edges: [], viewport: { x: 32, y: 100, zoom: 0.45 } }, true);
    await files.write('story.md', story, true);
    await files.writeJson('subtitleDraft.json', { templateId: selected.value.id, language: speech.value, cues: lines.value.map((line, index) => ({ start: index * duration.value, end: (index + 1) * duration.value, text: line })) }, true);
    await workspace.openProject(directory); workspace.renameProject(directory, title.value.trim());
    await router.push('/workspace'); visible.value = false;
  } catch (cause) { errorMessage.value = cause instanceof Error ? cause.message : text('Could not create project.', '项目创建失败。'); }
  finally { creating.value = false; }
}
window.addEventListener('sivideogen:studio-templates', open);
onBeforeUnmount(() => { window.removeEventListener('sivideogen:studio-templates', open); quoteSequence++; });
</script>
<style lang="scss">
.templateEntry{min-height:44px;padding:8px 14px;border:1px solid var(--el-border-color);border-radius:8px;color:var(--el-text-color-primary);background:var(--el-bg-color-overlay);cursor:pointer;font:inherit;order:1;white-space:nowrap}
.dramaTemplates{--el-dialog-bg-color:var(--el-bg-color-overlay); .el-dialog__body{max-height:70dvh;overflow:auto} .el-dialog__footer{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap} .el-button{min-height:44px}.el-button--primary{background:#65e9b6;border-color:#65e9b6;color:#10251c}}
.templateIntro{margin:0 0 20px;color:var(--el-text-color-secondary);line-height:1.6}
.templateLayout{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,1fr);gap:24px; .templateGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-content:start} .templateCard{display:flex;flex-direction:column;gap:10px;text-align:left;min-height:174px;padding:16px;border:1px solid var(--el-border-color);border-radius:12px;background:var(--el-fill-color-light);color:var(--el-text-color-primary);cursor:pointer;transition:border-color .15s;strong{font-size:17px}span:not(.templateGenre){font-size:13px;line-height:1.5;color:var(--el-text-color-secondary)}small{margin-top:auto;color:var(--el-text-color-secondary)}&.chosen{border-color:var(--el-color-primary);box-shadow:inset 0 0 0 1px var(--el-color-primary)}&:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:3px}} .templateGenre{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--el-color-primary)} .templateDetails{min-width:0;display:flex;flex-direction:column;gap:14px} label{display:flex;flex-direction:column;gap:7px;font-size:13px} input,textarea,select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border:1px solid var(--el-border-color);background:var(--el-bg-color);border-radius:8px;padding:10px;color:var(--el-text-color-primary);font:inherit;font-size:16px} textarea{resize:vertical} .templateFields{display:grid;grid-template-columns:1fr 1fr;gap:12px} .templateBeats{list-style:none;margin:0;padding:0;display:grid;gap:16px;li{border-top:1px solid var(--el-border-color);padding-top:12px}p{font-size:13px;line-height:1.6;color:var(--el-text-color-secondary)}} .templateNotice{font-size:12px;line-height:1.6;color:var(--el-text-color-secondary)} .templateError{color:var(--el-color-danger)} }
.templateFree{font-size:12px;color:var(--el-text-color-secondary);max-width:60%;text-align:left}
@media(max-width:700px){.templateLayout{grid-template-columns:1fr}.templateFree{max-width:100%}.dramaTemplates .el-dialog__body{max-height:65dvh}.templateEntry{font-size:12px;padding:8px 10px}}
</style>
