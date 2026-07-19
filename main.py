"""
Zero-Hardware Digital Receipt MVP — FastAPI Backend + Realtime Database
Multi-tenant, multi-cassa, concurrent sessions with TTL
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uuid

try:
    import firebase_admin
    from firebase_admin import credentials, db as rtdb
    if not firebase_admin._apps:
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred, {
            "databaseURL": "https://fiscal-9a0c8-default-rtdb.europe-west1.firebasedatabase.app"
        })
    db = rtdb.reference()
    RTDB_ENABLED = True
    print("[FIREBASE] Realtime Database client initialized")
except Exception as e:
    db = None
    RTDB_ENABLED = False
    print(f"[FIREBASE] WARNING: RTDB not available: {e}")

app = FastAPI(title="Digital Receipt MVP — RTDB")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.post("/api/receipt")
async def post_receipt(payload: dict):
    cassa_id = payload.get("cassa_id")
    if not cassa_id:
        raise HTTPException(status_code=400, detail="Missing 'cassa_id' in payload")
    if not RTDB_ENABLED:
        raise HTTPException(status_code=503, detail="Realtime Database not configured on server")
    receipt_id = str(uuid.uuid4())
    db.child("scontrini").child(receipt_id).set({
        "cassa_id": cassa_id,
        "timestamp": {".sv": "timestamp"},
        "status": "UNCLAIMED",
        "data": payload,
        "receipt_id": receipt_id
    })
    print(f"[POST] Written receipt to RTDB for cassa={cassa_id}")
    return {"status": "ok", "cassa_id": cassa_id, "receipt_id": receipt_id, "action": "written_to_rtdb"}

@app.get("/")
async def serve_index():
    return FileResponse("index.html")

@app.get("/cassa.html")
async def serve_cassa():
    return FileResponse("cassa.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
