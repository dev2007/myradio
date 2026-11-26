/**
 * 音频可视化：Web Audio AnalyserNode 驱动均衡器条。
 *
 * CORS 约束：跨域电台流若不带 CORS 头，接入 MediaElementAudioSourceNode 后输出会变成
 * 静音（且元素与图形库的绑定不可逆）。因此采用双元素策略——
 * - viz 元素恒带 crossOrigin="anonymous"：支持 CORS 的电台走它，频谱可用
 * - 不支持 CORS 的电台（加载即报错）记入失败名单，此后直接走普通元素，频谱降级为 CSS 律动
 */

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let boundEl: HTMLAudioElement | null = null;
const failedUuids = new Set<string>();
let globallyFailed = false;

/** 该电台是否允许尝试可视化元素 */
export function vizAllowed(uuid: string): boolean {
  return !globallyFailed && !failedUuids.has(uuid);
}

/** 标记电台可视化失败（此后走普通元素） */
export function markVizFailed(uuid: string): void {
  failedUuids.add(uuid);
}

/** 图形库是否就绪且在运行（suspended 时返回 null，调用方降级为 CSS 律动） */
export function getAnalyser(): AnalyserNode | null {
  return analyser && audioCtx?.state === "running" ? analyser : null;
}

/** 把 viz 元素接入 Web Audio 图（元素为单例，仅需绑定一次） */
export function bindGraph(el: HTMLAudioElement): void {
  if (boundEl === el && analyser) return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    if (boundEl !== el) {
      sourceNode?.disconnect();
      boundEl = el;
    }
    if (!analyser) {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
    }
    if (!sourceNode) {
      sourceNode = audioCtx.createMediaElementSource(el);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    }
  } catch {
    // Web Audio 不可用（极端环境）：永久降级
    globallyFailed = true;
  }
}
