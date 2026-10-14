"""
Spatial Rhythm Observer — Main Server Entry Point
FastAPI application that serves the frontend, WebSocket vision processing, and sessions API.
"""

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from config import HOST, PORT, DEBUG, CLIENT_DIR
from api.websocket import router as ws_router
from api.sessions import router as sessions_router
from api.zones import router as zones_router
from api.analytics import router as analytics_router


# ─── Create FastAPI App ──────────────────────────────────
app = FastAPI(
    title="Ritmos — Spatial Rhythm Observer",
    description="Sistema de investigación y observación de espacios físicos mediante visión computacional",
    version="0.6.0 — Phase 6: Temporal Rhythms & Wave Cadence",
)

# ─── Health Check ────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """Server health check endpoint."""
    return JSONResponse({
        "status": "ok",
        "version": "0.6.0",
        "phase": 6,
    })


# ─── Mount Routers ──────────────────────────────────────
app.include_router(sessions_router)
app.include_router(zones_router)
app.include_router(analytics_router)
app.include_router(ws_router)


# ─── Serve Frontend Static Files ────────────────────────
# Mounted last as catch-all
if CLIENT_DIR.exists():
    app.mount("/", StaticFiles(directory=str(CLIENT_DIR), html=True), name="static")
    print(f"[SERVER] Serving frontend from: {CLIENT_DIR}")
else:
    print(f"[SERVER] WARNING: Client directory not found at {CLIENT_DIR}")


# ─── Run Server ─────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  🔬 SPATIAL RHYTHM OBSERVER — Phase 2")
    print("=" * 60)
    print(f"  Server: http://{HOST}:{PORT}")
    print(f"  Frontend: http://localhost:{PORT}")
    print(f"  WebSocket: ws://localhost:{PORT}/ws/vision")
    print(f"  Sessions API: http://localhost:{PORT}/api/sessions")
    print(f"  Health: http://localhost:{PORT}/api/health")
    print("=" * 60)

    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=DEBUG,
        ws_max_size=5 * 1024 * 1024,
    )
