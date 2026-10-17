/**
 * The demo video's voice: Kokoro, an open neural text-to-speech that runs on this computer
 * (speaking is done by kokoro.py, in its own Python environment).
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** The narrator. Other voices: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md (af_bella, bf_emma...). */
export const VOICE = 'af_heart';
/** What Accessible Find reads aloud, in a voice of its own (the browser's voice in real use). */
export const READER_VOICE = 'am_michael';
/** A touch slower than the voice's natural pace. */
const SPEED = 0.95;
const KOKORO = path.join(os.homedir(), '.cache', 'accessible-find', 'kokoro');
const PYTHON = path.join(KOKORO, 'venv', 'bin', 'python');
const MODELS = path.join(KOKORO, 'models');
const RELEASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0';

export interface Line {
  text: string;
  file: string;
  seconds: number;
  /** Read aloud by Accessible Find, not said by the narrator. */
  reader?: boolean;
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

/** Speaks `text` into a WAV in `dir` (kept for the same text and voice), and says how long it lasts. */
export async function narrate(text: string, dir: string, voice = VOICE): Promise<Line> {
  if (!(await exists(PYTHON)) || !(await exists(path.join(MODELS, 'kokoro-v1.0.onnx')))) {
    throw new Error(
      `The narration voice is missing. Install it with:\n` +
        `  uv venv --python 3.12 ${KOKORO}/venv && uv pip install --python ${PYTHON} kokoro-onnx soundfile\n` +
        `  mkdir -p ${MODELS} && cd ${MODELS} && curl -LO ${RELEASE}/kokoro-v1.0.onnx -LO ${RELEASE}/voices-v1.0.bin`,
    );
  }
  const id = createHash('sha1').update(`kokoro ${voice} ${SPEED}\n${text}`).digest('hex').slice(0, 12);
  const file = path.join(dir, `line-${id}.wav`);
  if (!(await exists(file))) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(PYTHON, [path.resolve('tests/e2e/video/kokoro.py'), MODELS, voice, `${SPEED}`, file], {
        stdio: ['pipe', 'ignore', 'inherit'],
      });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`kokoro.py exited with ${code}`))));
      child.stdin.end(text);
    });
  }
  return { text, file, seconds: wavSeconds(await readFile(file)), reader: voice !== VOICE };
}

/** Length of a PCM WAV file, from its header. */
function wavSeconds(wav: Buffer): number {
  const byteRate = wav.readUInt32LE(28);
  for (let i = 12; i + 8 <= wav.length; ) {
    const size = wav.readUInt32LE(i + 4);
    if (wav.toString('ascii', i, i + 4) === 'data') return size / byteRate;
    i += 8 + size;
  }
  throw new Error('Not a WAV file');
}
