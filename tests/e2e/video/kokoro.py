"""Speaks stdin into a WAV with Kokoro, for the demo video's narration (see narration.ts).

Usage: python kokoro.py MODEL_DIR VOICE SPEED OUT.wav < text
"""

import re
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

# A breath between sentences, in seconds.
PAUSE = 0.28

model_dir, voice, speed, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
kokoro = Kokoro(f"{model_dir}/kokoro-v1.0.onnx", f"{model_dir}/voices-v1.0.bin")
text = sys.stdin.read().strip()

parts, rate = [], 24000
for sentence in re.split(r"(?<=[.!?])\s+", text):
    samples, rate = kokoro.create(sentence, voice=voice, speed=speed, lang="en-us")
    parts += [samples, np.zeros(int(PAUSE * rate), dtype=samples.dtype)]
sf.write(out, np.concatenate(parts[:-1]), rate, subtype="PCM_16")
