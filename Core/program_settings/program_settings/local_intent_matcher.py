import sys, json, os
from sentence_transformers import SentenceTransformer, util

# --- persistent global model ---
MODEL = None

def get_model():
    global MODEL
    if MODEL is None:
        # You can change this to 'all-MiniLM-L6-v2' if you want slightly faster results
        MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return MODEL

def classify_local_intent(transcript, commands):
    model = get_model()
    # embeddings
    query_emb = model.encode(transcript, convert_to_tensor=True)
    cmd_texts = [
        f"{c['id']} {c.get('title','')} {c.get('description','')}"
        for c in commands
    ]
    cmd_embs = model.encode(cmd_texts, convert_to_tensor=True)
    scores = util.cos_sim(query_emb, cmd_embs)[0]
    best_idx = int(scores.argmax())
    best_score = float(scores[best_idx])
    best_id = commands[best_idx]["id"]
    return {"command": best_id if best_score > 0.55 else "none", "score": best_score}

def main():
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({"command": "none", "score": 0.0}), flush=True)
        return

    try:
        payload = json.loads(raw)
        transcript = payload.get("transcript", "")
        commands = payload.get("commands", [])
        result = classify_local_intent(transcript, commands)
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"command": "none", "score": 0.0, "error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
