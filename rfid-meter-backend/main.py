import sqlite3
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Smart RFID Metered Resource API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize local SQLite database
conn = sqlite3.connect("rfid_meter.db", check_same_thread=False)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.executescript("""
CREATE TABLE IF NOT EXISTS rfid_users (
  uid TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL,
  balance REAL DEFAULT 0.0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  owner_name TEXT,
  status TEXT NOT NULL,
  units_used REAL DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO rfid_users (uid, owner_name, balance, is_active) VALUES
  ('01:02:03:04', 'John Doe', 50.00, 1),
  ('55:66:77:88', 'Guest Card (Empty)', 0.00, 1);
""")
conn.commit()

# WebSocket connection manager for live React dashboard updates
active_clients: List[WebSocket] = []

async def broadcast_event(payload: dict):
    for ws in list(active_clients):
        try:
            await ws.send_json(payload)
        except Exception:
            active_clients.remove(ws)

class ScanRequest(BaseModel):
    uid: str

class DeductRequest(BaseModel):
    uid: str
    units_used: float

class TopUpRequest(BaseModel):
    uid: str
    owner_name: str
    amount: float

@app.websocket("/ws/logs")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_clients:
            active_clients.remove(websocket)

@app.get("/api/v1/users")
def get_users():
    rows = cursor.execute("SELECT * FROM rfid_users").fetchall()
    return [dict(r) for r in rows]

@app.post("/api/v1/users/topup")
async def topup_user(req: TopUpRequest):
    uid = req.uid.strip().upper()
    existing = cursor.execute("SELECT * FROM rfid_users WHERE uid = ?", (uid,)).fetchone()
    if existing:
        new_bal = round(existing["balance"] + req.amount, 2)
        cursor.execute(
            "UPDATE rfid_users SET balance = ?, owner_name = ? WHERE uid = ?",
            (new_bal, req.owner_name, uid),
        )
    else:
        cursor.execute(
            "INSERT INTO rfid_users (uid, owner_name, balance, is_active) VALUES (?, ?, ?, 1)",
            (uid, req.owner_name, round(req.amount, 2)),
        )
    conn.commit()
    return {"status": "ok", "uid": uid}

@app.get("/api/v1/logs")
def get_logs():
    rows = cursor.execute("SELECT * FROM access_logs ORDER BY id DESC LIMIT 30").fetchall()
    return [dict(r) for r in rows]

@app.post("/api/v1/authorize")
async def authorize_card(req: ScanRequest):
    uid = req.uid.strip().upper()
    user = cursor.execute("SELECT * FROM rfid_users WHERE uid = ?", (uid,)).fetchone()

    if not user or not user["is_active"] or user["balance"] <= 0:
        owner = user["owner_name"] if user else "Unknown"
        cursor.execute(
            "INSERT INTO access_logs (uid, owner_name, status) VALUES (?, ?, ?)",
            (uid, owner, "DENIED"),
        )
        conn.commit()
        new_log = dict(cursor.execute("SELECT * FROM access_logs WHERE id = last_insert_rowid()").fetchone())
        await broadcast_event(new_log)
        return {"authorized": False, "balance": 0.0}

    cursor.execute(
        "INSERT INTO access_logs (uid, owner_name, status) VALUES (?, ?, ?)",
        (uid, user["owner_name"], "GRANTED"),
    )
    conn.commit()
    new_log = dict(cursor.execute("SELECT * FROM access_logs WHERE id = last_insert_rowid()").fetchone())
    await broadcast_event(new_log)

    return {"authorized": True, "owner": user["owner_name"], "balance": user["balance"]}

@app.post("/api/v1/deduct")
async def deduct_usage(req: DeductRequest):
    uid = req.uid.strip().upper()
    user = cursor.execute("SELECT * FROM rfid_users WHERE uid = ?", (uid,)).fetchone()
    if not user:
        return {"updated": False}

    new_balance = max(0.0, round(user["balance"] - req.units_used, 2))
    cursor.execute("UPDATE rfid_users SET balance = ? WHERE uid = ?", (new_balance, uid))
    cursor.execute(
        "INSERT INTO access_logs (uid, owner_name, status, units_used) VALUES (?, ?, ?, ?)",
        (uid, user["owner_name"], "COMPLETED", round(req.units_used, 2)),
    )
    conn.commit()
    new_log = dict(cursor.execute("SELECT * FROM access_logs WHERE id = last_insert_rowid()").fetchone())
    await broadcast_event(new_log)

    return {"updated": True, "new_balance": new_balance}