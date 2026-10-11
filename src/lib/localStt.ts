/**
 * Transcribes a recording on this computer, with no provider and no key. The model files are downloaded once
 * by the main process and read back through the app's own ats-model:// scheme, so nothing here ever reaches
 * the network: `allowRemoteModels` is off, and the WASM runtime is the copy shipped inside the app.
 *
 * The library and the runtime are loaded only when this is actually used — they are large, and most people
 * never turn the feature on.
 */
type Pipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text?: string }>;

let pipe: Promise<Pipeline> | null = null;

async function getPipeline(): Promise<Pipeline> {
  if (pipe) return pipe;
  pipe = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = 'ats-model://models/';
    const wasm = env.backends?.onnx?.wasm;
    if (wasm) {
      // The runtime is bundled with the app by the build, so its own default path is the right one — pointing
      // it elsewhere only breaks it. No cross-origin isolation inside the window, so threads are unavailable.
      wasm.numThreads = 1;
      wasm.proxy = false;
    }
    return await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', { dtype: 'q8' }) as unknown as Pipeline;
  })();
  try {
    return await pipe;
  } catch (e) {
    pipe = null; // a failed load must not be cached, or every later attempt fails with it
    throw e;
  }
}

/** Whisper expects mono 16 kHz samples, whatever the microphone recorded. */
export async function decodeAudio(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer();
  const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decoder = new Ctx();
  try {
    const decoded = await decoder.decodeAudioData(bytes.slice(0));
    const rate = 16000;
    const frames = Math.ceil(decoded.duration * rate);
    const offline = new OfflineAudioContext(1, Math.max(frames, 1), rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    void decoder.close();
  }
}

export type LocalResult = { ok: true; text: string } | { ok: false; error: string; message?: string };

export async function transcribeLocally(blob: Blob, language: 'ar' | 'en'): Promise<LocalResult> {
  try {
    const audio = await decodeAudio(blob);
    if (!audio.length) return { ok: false, error: 'no-audio' };
    const run = await getPipeline();
    const out = await run(audio, { language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
    const text = (out?.text ?? '').trim();
    return text ? { ok: true, text } : { ok: false, error: 'empty' };
  } catch (e) {
    return { ok: false, error: 'local-failed', message: String((e as Error)?.message ?? e) };
  }
}
