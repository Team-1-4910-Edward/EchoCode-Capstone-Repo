import sys
import os
import traceback
from faster_whisper import WhisperModel

def log(msg): print(str(msg), flush=True)

try:
    if len(sys.argv) < 2:
        log("Usage: python local_whisper_stt.py <audiofile>")
        sys.exit(1)

    AUDIO_PATH = sys.argv[1]
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    LEGACY_DIR = os.path.join(SCRIPT_DIR, "../../local_models/whisper-tiny")

    # --- Determine model source ---
    model_pref = os.environ.get("ECHOCODE_WHISPER_MODEL", "").strip()
    if model_pref:
        if os.path.isdir(model_pref):
            model_spec = model_pref           # Local folder path
        else:
            model_spec = model_pref           # Model name (e.g. "tiny", "base.en")
    elif os.path.isdir(LEGACY_DIR):
        model_spec = LEGACY_DIR
    else:
        model_spec = "tiny"

    if not os.path.exists(AUDIO_PATH):
        log(f"Error: Audio file not found at {AUDIO_PATH}")
        sys.exit(1)

    compute_type = os.environ.get("ECHOCODE_WHISPER_COMPUTE", "int8")
    # model = WhisperModel(model_spec, device="cpu", compute_type=compute_type)
    model = WhisperModel(model_spec, device="cuda", compute_type=compute_type)

    segments, _ = model.transcribe(AUDIO_PATH, beam_size=1)
    final_text = " ".join(seg.text.strip() for seg in segments if seg.text.strip())

    if final_text.strip():
        print(final_text.strip(), flush=True)
    else:
        log("No speech detected.")

except Exception:
    traceback.print_exc(file=sys.stdout)
    sys.exit(1)
