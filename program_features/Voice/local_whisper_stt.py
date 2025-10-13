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

    print(f"[Python] Loading local Whisper model from: {MODEL_PATH}", flush=True)

    if not os.path.exists(MODEL_PATH):
        print(f"[Python Error] Model not found at {MODEL_PATH}", flush=True)
        sys.exit(1)

    if not os.path.exists(AUDIO_PATH):
        print(f"[Python Error] Audio file not found at {AUDIO_PATH}", flush=True)
        sys.exit(1)

    model = WhisperModel(MODEL_PATH, device="cpu")
    segments, info = model.transcribe(AUDIO_PATH)

    print(f"[Python] Transcription started. Duration: {info.duration}", flush=True)

    final_text = ""
    segment_count = 0
    for seg in segments:
        segment_count += 1
        print(f"[Python] Segment {segment_count}: start={seg.start:.2f}s end={seg.end:.2f}s text='{seg.text.strip()}'", flush=True)
        final_text += seg.text.strip() + " "

    if not final_text.strip():
        print("[Python Warning] No text detected — possibly silence or low microphone volume.", flush=True)
    else:
        print("[Python] Final Transcript:", flush=True)
        print(final_text.strip(), flush=True)

except Exception as e:
    print("[Python Exception]", flush=True)
    traceback.print_exc(file=sys.stdout)
    sys.exit(1)
