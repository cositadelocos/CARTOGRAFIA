"""
Spatial Rhythm Observer — Spatial Zones REST API
Endpoints to create, list, and delete polygon observation zones.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
import time

from storage.db import db

router = APIRouter(prefix="/api/zones", tags=["zones"])


class ZonePoint(BaseModel):
    x: float
    y: float


class ZonePayload(BaseModel):
    id: Optional[str] = None
    name: str
    color: Optional[str] = "#0a84ff"
    polygon: List[ZonePoint]


@router.get("")
async def list_zones():
    """List all saved spatial zones."""
    rows = db.list_zones()
    zones = []
    for r in rows:
        try:
            poly = json.loads(r["polygon_json"])
        except Exception:
            poly = []
        zones.append({
            "id": r["id"],
            "name": r["name"],
            "color": r["color"],
            "polygon": poly,
            "created_at": r["created_at"],
        })
    return {"zones": zones, "count": len(zones)}


@router.post("")
async def save_zone(payload: ZonePayload):
    """Save or update a spatial polygon zone."""
    if len(payload.polygon) < 3:
        raise HTTPException(
            status_code=400,
            detail="Una zona espacial debe contener al menos 3 vértices para formar un polígono."
        )

    zone_id = payload.id or f"zone_{int(time.time() * 1000)}"
    polygon_json = json.dumps([{"x": p.x, "y": p.y} for p in payload.polygon])
    saved = db.save_zone(
        zone_id=zone_id,
        name=payload.name.strip(),
        color=payload.color or "#0a84ff",
        polygon_json=polygon_json,
    )
    return {
        "status": "saved",
        "zone": {
            "id": saved["id"],
            "name": saved["name"],
            "color": saved["color"],
            "polygon": json.loads(saved["polygon_json"]),
            "created_at": saved["created_at"],
        }
    }


@router.delete("/{zone_id}")
async def delete_zone(zone_id: str):
    """Delete a spatial zone."""
    deleted = db.delete_zone(zone_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Zona espacial no encontrada")
    return {"status": "deleted", "id": zone_id}
