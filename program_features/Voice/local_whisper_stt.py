import sys
import os
import traceback
from faster_whisper import WhisperModel

def log(msg):
    print(str(msg), flush=True)

try:
    if len(sys.argv) < 2:
        log("Usage: python local_whisper_stt.py <audiofile>")
        sys.exit(1)

    AUDIO_PATH = sys.argv[1]
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

    # absolute folder path instead of downloading from HuggingFace
    MODEL_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "../../local_models/whisper-tiny"))

    if not os.path.exists(AUDIO_PATH):
        log(f"Error: Audio file not found at {AUDIO_PATH}")
        sys.exit(1)

    if not os.path.isdir(MODEL_DIR):
        log(f"Error: Model folder not found at {MODEL_DIR}")
        sys.exit(1)

    # explicitly load from folder, not from HuggingFace hub
    model = WhisperModel(MODEL_DIR, device="cpu", compute_type="int8")

    segments, _ = model.transcribe(AUDIO_PATH, beam_size=1)
    final_text = " ".join(seg.text.strip() for seg in segments if seg.text.strip())

    if final_text.strip():
        print(final_text.strip(), flush=True)
    else:
        log("No speech detected.")

except Exception:
    traceback.print_exc(file=sys.stdout)
    sys.exit(1)
