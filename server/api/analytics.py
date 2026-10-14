"""
Spatial Rhythm Observer — Analytics & Heatmaps REST API (Phase 4)
Endpoints to query cumulative heatmaps, trajectory reconstructions, and spatial motion summaries.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from storage.db import db

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/sessions/{session_id}/heatmap")
async def get_session_heatmap(
    session_id: str,
    type: str = Query("presence", description="presence | dwell | flow"),
    person_id: Optional[int] = Query(None, description="Filtrar por ID de persona anónima"),
    time_from: Optional[float] = Query(None, description="Timestamp mínimo"),
    time_to: Optional[float] = Query(None, description="Timestamp máximo"),
    limit: int = Query(50000, description="Límite máximo de puntos")
):
    """
    Retrieve spatial coordinate points for cumulative heatmap rendering.
    - presence: All detected coordinates (cumulative density)
    - dwell: Stationary coordinates where state == 'stopped'
    - flow: Movement coordinates where state == 'moving'
    """
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    points = db.get_session_heatmap_points(
        session_id=session_id,
        heatmap_type=type.lower(),
        person_id=person_id,
        time_from=time_from,
        time_to=time_to,
        limit=limit
    )

    return {
        "session_id": session_id,
        "type": type,
        "count": len(points),
        "points": points
    }


@router.get("/sessions/{session_id}/trajectories")
async def get_session_trajectories(
    session_id: str,
    person_id: Optional[int] = Query(None, description="Filtrar por ID de persona anónima"),
    time_from: Optional[float] = Query(None, description="Timestamp mínimo"),
    time_to: Optional[float] = Query(None, description="Timestamp máximo"),
    limit: int = Query(50000, description="Límite máximo de puntos")
):
    """
    Retrieve reconstructed continuous movement trajectories for each detected individual.
    Includes ordered waypoints, start/end nodes, duration, and calculated Euclidean distance.
    """
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    data = db.get_session_trajectories(
        session_id=session_id,
        person_id=person_id,
        time_from=time_from,
        time_to=time_to,
        limit=limit
    )
    return data


@router.get("/sessions/{session_id}/summary")
async def get_session_summary(session_id: str):
    """
    Get aggregated spatial movement metrics (dwell vs moving ratio, zone occupancies).
    """
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    summary = db.get_session_analytics_summary(session_id)
    return {
        "session": session,
        "analytics": summary
    }


@router.get("/sessions/{session_id}/zones")
async def get_session_zone_metrics(session_id: str):
    """
    Phase 5: Get detailed dwell times, occupancy rates, peak counts,
    and inter-zone transition flows for a session.
    """
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    metrics = db.get_session_zone_metrics(session_id)
    return {
        "session": session,
        "metrics": metrics
    }


@router.get("/sessions/{session_id}/rhythms")
async def get_session_rhythms(
    session_id: str,
    bucket_seconds: int = Query(5, ge=1, le=60, description="Ventana de tiempo en segundos para agrupar mediciones (1 a 60)")
):
    """
    Phase 6: Detección de ritmos y patrones temporales recurrentes.
    Calcula cadencia de oleadas de afluencia, picos locales, valles de quietud,
    clasificación de ritmo espacial y sincronización de picos por zona.
    """
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    rhythms = db.get_session_rhythms(session_id, bucket_seconds=bucket_seconds)
    return {
        "session": session,
        "rhythms": rhythms
    }


