import sys
import os
import traceback
from faster_whisper import WhisperModel

try:
    if len(sys.argv) < 2:
        print("Usage: python local_whisper_stt.py <audiofile>", flush=True)
        sys.exit(1)

    AUDIO_PATH = sys.argv[1]
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(SCRIPT_DIR, "../../local_models/whisper-tiny")

    if not os.path.exists(MODEL_PATH):
        print(f"Error: Model not found at {MODEL_PATH}", flush=True)
        sys.exit(1)

    if not os.path.exists(AUDIO_PATH):
        print(f"Error: Audio file not found at {AUDIO_PATH}", flush=True)
        sys.exit(1)

    model = WhisperModel(MODEL_PATH, device="cpu")
    segments, _ = model.transcribe(AUDIO_PATH)

    final_text = " ".join(seg.text.strip() for seg in segments if seg.text.strip())

    if final_text.strip():
        print(final_text.strip(), flush=True)
    else:
        print("No speech detected.", flush=True)

except Exception:
    traceback.print_exc(file=sys.stdout)
    sys.exit(1)
