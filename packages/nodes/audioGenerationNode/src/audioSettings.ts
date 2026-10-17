export const hostedAudio = typeof document !== "undefined" && document.documentElement.dataset.hosted === "sivideogen";
export const languageOptions = hostedAudio ? [
  { label: "English", value: "en" }, { label: "中文", value: "zh" },
  { label: "Español", value: "es" }, { label: "Português", value: "pt" },
  { label: "Français", value: "fr" }, { label: "Deutsch", value: "de" }, { label: "日本語", value: "ja" },
] : [
  { label: "中文", value: "zh-CN" },
  { label: "英文", value: "en" },
];
export const sampleRateOptions = hostedAudio ? [44100] : [8000, 16000, 24000, 48000];
export const formatOptions = hostedAudio ? ["mp3"] : ["wav", "mp3", "pcm", "ogg_opus"];
