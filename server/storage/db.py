"""
Spatial Rhythm Observer — Database Layer (SQLite)
Handles persistence for sessions, spatial tracking points, and person summaries.
"""

import math
import sqlite3
import time
from pathlib import Path
from typing import Optional, List, Dict, Any

from config import STORAGE_DIR

DB_PATH = STORAGE_DIR / "spatial_data.db"


class Database:
    """SQLite Database manager for spatial observation data."""

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = str(db_path)
        self._init_tables()

    def get_connection(self) -> sqlite3.Connection:
        """Create a connection with row factory and foreign keys enabled."""
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")  # Fast concurrent read/write
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    def _init_tables(self):
        """Create tables and indexes if they do not exist."""
        with self.get_connection() as conn:
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                started_at REAL NOT NULL,
                ended_at REAL,
                duration_seconds REAL DEFAULT 0,
                total_persons INTEGER DEFAULT 0,
                max_concurrent INTEGER DEFAULT 0,
                total_frames INTEGER DEFAULT 0,
                avg_fps REAL DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS spatial_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                person_id INTEGER NOT NULL,
                timestamp REAL NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                speed REAL DEFAULT 0,
                direction REAL DEFAULT 0,
                state TEXT DEFAULT 'stopped',
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_spatial_session 
                ON spatial_points (session_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_spatial_person 
                ON spatial_points (session_id, person_id);

            CREATE TABLE IF NOT EXISTS person_summaries (
                session_id TEXT NOT NULL,
                person_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                first_seen REAL NOT NULL,
                last_seen REAL NOT NULL,
                dwell_time_seconds REAL DEFAULT 0,
                avg_speed REAL DEFAULT 0,
                distance_traveled REAL DEFAULT 0,
                points_count INTEGER DEFAULT 0,
                PRIMARY KEY (session_id, person_id),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS spatial_zones (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                polygon_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            # Safe migration for existing DB
            try:
                conn.execute("ALTER TABLE spatial_points ADD COLUMN zone TEXT")
            except Exception:
                pass

            try:
                conn.execute("ALTER TABLE sessions ADD COLUMN video_path TEXT")
            except Exception:
                pass

    # ─── SESSIONS ────────────────────────────────────────────

    def set_session_video(self, session_id: str, video_path: str):
        """Update session record with video path."""
        with self.get_connection() as conn:
            conn.execute("UPDATE sessions SET video_path = ? WHERE id = ?", (video_path, session_id))

    def create_session(self, session_id: str, name: str, started_at: Optional[float] = None) -> Dict[str, Any]:
        """Create a new observation session."""
        started_at = started_at or time.time()
        name = (name or "").strip() or f"Sesión {time.strftime('%Y-%m-%d %H:%M')}"
        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT INTO sessions (id, name, started_at, status)
                VALUES (?, ?, ?, 'active')
                """,
                (session_id, name, started_at)
            )
        return self.get_session(session_id)

    def update_session_status(self, session_id: str, status: str):
        """Update session status (active, paused, completed)."""
        with self.get_connection() as conn:
            conn.execute(
                "UPDATE sessions SET status = ? WHERE id = ?",
                (status, session_id)
            )

    def complete_session(
        self,
        session_id: str,
        ended_at: Optional[float] = None,
        duration_seconds: float = 0,
        total_persons: int = 0,
        max_concurrent: int = 0,
        total_frames: int = 0,
        avg_fps: float = 0
    ) -> Optional[Dict[str, Any]]:
        """Mark a session as completed with final summary metrics."""
        ended_at = ended_at or time.time()
        with self.get_connection() as conn:
            conn.execute(
                """
                UPDATE sessions 
                SET ended_at = ?, duration_seconds = ?, total_persons = ?,
                    max_concurrent = ?, total_frames = ?, avg_fps = ?, status = 'completed'
                WHERE id = ?
                """,
                (ended_at, duration_seconds, total_persons, max_concurrent, total_frames, avg_fps, session_id)
            )
        return self.get_session(session_id)

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session metadata by ID."""
        with self.get_connection() as conn:
            cur = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def list_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        """List all observation sessions sorted from newest to oldest."""
        with self.get_connection() as conn:
            cur = conn.execute(
                """
                SELECT * FROM sessions 
                ORDER BY started_at DESC 
                LIMIT ?
                """,
                (limit,)
            )
            return [dict(row) for row in cur.fetchall()]

    def delete_session(self, session_id: str) -> bool:
        """Delete a session and all its points and summaries (CASCADE)."""
        with self.get_connection() as conn:
            cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            return cur.rowcount > 0

    # ─── SPATIAL POINTS ──────────────────────────────────────

    def insert_spatial_points_batch(self, points: List[tuple]):
        """
        Batch insert tracking points for high performance.
        points: list of tuples:
        (session_id, person_id, timestamp, x, y, speed, direction, state) or
        (session_id, person_id, timestamp, x, y, speed, direction, state, zone)
        """
        if not points:
            return
        with self.get_connection() as conn:
            if len(points[0]) >= 9:
                conn.executemany(
                    """
                    INSERT INTO spatial_points 
                    (session_id, person_id, timestamp, x, y, speed, direction, state, zone)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    points
                )
            else:
                conn.executemany(
                    """
                    INSERT INTO spatial_points 
                    (session_id, person_id, timestamp, x, y, speed, direction, state)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    points
                )

    def get_session_points(
        self,
        session_id: str,
        person_id: Optional[int] = None,
        limit: int = 10000
    ) -> List[Dict[str, Any]]:
        """Retrieve recorded spatial coordinates for a session."""
        with self.get_connection() as conn:
            if person_id is not None:
                cur = conn.execute(
                    """
                    SELECT person_id, timestamp, x, y, speed, direction, state
                    FROM spatial_points
                    WHERE session_id = ? AND person_id = ?
                    ORDER BY timestamp ASC
                    LIMIT ?
                    """,
                    (session_id, person_id, limit)
                )
            else:
                cur = conn.execute(
                    """
                    SELECT person_id, timestamp, x, y, speed, direction, state
                    FROM spatial_points
                    WHERE session_id = ?
                    ORDER BY timestamp ASC
                    LIMIT ?
                    """,
                    (session_id, limit)
                )
            return [dict(row) for row in cur.fetchall()]

    # ─── PERSON SUMMARIES ────────────────────────────────────

    def save_person_summaries(self, summaries: List[Dict[str, Any]]):
        """Insert or replace person summaries for a session."""
        if not summaries:
            return
        rows = [
            (
                s["session_id"],
                s["person_id"],
                s.get("label", f"P{s['person_id']:02d}"),
                s["first_seen"],
                s["last_seen"],
                s.get("dwell_time_seconds", 0.0),
                s.get("avg_speed", 0.0),
                s.get("distance_traveled", 0.0),
                s.get("points_count", 0),
            )
            for s in summaries
        ]
        with self.get_connection() as conn:
            conn.executemany(
                """
                INSERT OR REPLACE INTO person_summaries
                (session_id, person_id, label, first_seen, last_seen,
                 dwell_time_seconds, avg_speed, distance_traveled, points_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows
            )

    def get_session_person_summaries(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieve person summaries for a session."""
        with self.get_connection() as conn:
            cur = conn.execute(
                """
                SELECT * FROM person_summaries
                WHERE session_id = ?
                ORDER BY person_id ASC
                """,
                (session_id,)
            )
            return [dict(row) for row in cur.fetchall()]

    # ─── SPATIAL ZONES ───────────────────────────────────────

    def save_zone(self, zone_id: str, name: str, color: str, polygon_json: str) -> Dict[str, Any]:
        """Save or update a spatial polygon zone."""
        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO spatial_zones (id, name, color, polygon_json)
                VALUES (?, ?, ?, ?)
                """,
                (zone_id, name, color, polygon_json)
            )
        return self.get_zone(zone_id)

    def get_zone(self, zone_id: str) -> Optional[Dict[str, Any]]:
        """Get a single zone by ID."""
        with self.get_connection() as conn:
            cur = conn.execute("SELECT * FROM spatial_zones WHERE id = ?", (zone_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def list_zones(self) -> List[Dict[str, Any]]:
        """List all defined spatial zones."""
        with self.get_connection() as conn:
            cur = conn.execute("SELECT * FROM spatial_zones ORDER BY created_at ASC")
            return [dict(row) for row in cur.fetchall()]

    def delete_zone(self, zone_id: str) -> bool:
        """Delete a spatial zone."""
        with self.get_connection() as conn:
            cur = conn.execute("DELETE FROM spatial_zones WHERE id = ?", (zone_id,))
            return cur.rowcount > 0

    # ─── HEATMAPS & TRAJECTORIES (PHASE 4) ────────────────────

    def get_session_heatmap_points(
        self,
        session_id: str,
        heatmap_type: str = "presence",
        person_id: Optional[int] = None,
        time_from: Optional[float] = None,
        time_to: Optional[float] = None,
        limit: int = 50000
    ) -> List[Dict[str, Any]]:
        """
        Retrieve filtered coordinates for cumulative heatmaps.
        heatmap_type:
            - 'presence': all coordinates
            - 'dwell': only stopped positions (state = 'stopped')
            - 'flow': only moving positions (state = 'moving')
        """
        query = "SELECT person_id, timestamp, x, y, speed, direction, state, zone FROM spatial_points WHERE session_id = ?"
        params: List[Any] = [session_id]

        if heatmap_type == "dwell":
            query += " AND state = 'stopped'"
        elif heatmap_type == "flow":
            query += " AND state = 'moving'"

        if person_id is not None:
            query += " AND person_id = ?"
            params.append(person_id)

        if time_from is not None:
            query += " AND timestamp >= ?"
            params.append(time_from)

        if time_to is not None:
            query += " AND timestamp <= ?"
            params.append(time_to)

        query += " ORDER BY timestamp ASC LIMIT ?"
        params.append(limit)

        with self.get_connection() as conn:
            cur = conn.execute(query, params)
            return [dict(row) for row in cur.fetchall()]

    def get_session_trajectories(
        self,
        session_id: str,
        person_id: Optional[int] = None,
        time_from: Optional[float] = None,
        time_to: Optional[float] = None,
        limit: int = 50000
    ) -> Dict[str, Any]:
        """
        Retrieve and reconstruct continuous trajectory paths for detected individuals.
        """
        import math
        query = "SELECT person_id, timestamp, x, y, speed, direction, state, zone FROM spatial_points WHERE session_id = ?"
        params: List[Any] = [session_id]

        if person_id is not None:
            query += " AND person_id = ?"
            params.append(person_id)

        if time_from is not None:
            query += " AND timestamp >= ?"
            params.append(time_from)

        if time_to is not None:
            query += " AND timestamp <= ?"
            params.append(time_to)

        query += " ORDER BY person_id ASC, timestamp ASC LIMIT ?"
        params.append(limit)

        with self.get_connection() as conn:
            cur = conn.execute(query, params)
            rows = [dict(r) for r in cur.fetchall()]

        # Group by person_id
        grouped: Dict[int, List[Dict[str, Any]]] = {}
        for r in rows:
            pid = r["person_id"]
            if pid not in grouped:
                grouped[pid] = []
            grouped[pid].append(r)

        trajectories = []
        for pid, pts in grouped.items():
            if not pts:
                continue
            total_dist = 0.0
            for i in range(1, len(pts)):
                dx = pts[i]["x"] - pts[i-1]["x"]
                dy = pts[i]["y"] - pts[i-1]["y"]
                total_dist += math.sqrt(dx * dx + dy * dy)

            start_t = pts[0]["timestamp"]
            end_t = pts[-1]["timestamp"]
            trajectories.append({
                "person_id": pid,
                "label": f"P{pid:02d}",
                "start_time": start_t,
                "end_time": end_t,
                "duration_seconds": round(end_t - start_t, 2),
                "points_count": len(pts),
                "total_distance": round(total_dist, 4),
                "start_point": {"x": pts[0]["x"], "y": pts[0]["y"], "zone": pts[0].get("zone")},
                "end_point": {"x": pts[-1]["x"], "y": pts[-1]["y"], "zone": pts[-1].get("zone")},
                "points": [{"x": p["x"], "y": p["y"], "t": p["timestamp"], "speed": p["speed"], "state": p["state"], "zone": p.get("zone")} for p in pts]
            })

        return {
            "session_id": session_id,
            "trajectories_count": len(trajectories),
            "trajectories": trajectories
        }

    def get_session_analytics_summary(self, session_id: str) -> Dict[str, Any]:
        """Compute spatial aggregate analytics for a session."""
        with self.get_connection() as conn:
            session = self.get_session(session_id)
            if not session:
                return {}

            # Count moving vs stopped points
            cur = conn.execute(
                """
                SELECT state, COUNT(*) as cnt 
                FROM spatial_points 
                WHERE session_id = ? 
                GROUP BY state
                """,
                (session_id,)
            )
            states = {row["state"]: row["cnt"] for row in cur.fetchall()}

            # Zone distribution
            cur = conn.execute(
                """
                SELECT zone, COUNT(*) as cnt 
                FROM spatial_points 
                WHERE session_id = ? AND zone IS NOT NULL AND zone != ''
                GROUP BY zone 
                ORDER BY cnt DESC
                """,
                (session_id,)
            )
            zone_counts = {row["zone"]: row["cnt"] for row in cur.fetchall()}

            # Unique persons count
            cur = conn.execute(
                "SELECT COUNT(DISTINCT person_id) as total_p FROM spatial_points WHERE session_id = ?",
                (session_id,)
            )
            row_p = cur.fetchone()
            total_unique = row_p["total_p"] if row_p else 0

            return {
                "session_id": session_id,
                "total_points": sum(states.values()),
                "stopped_points": states.get("stopped", 0),
                "moving_points": states.get("moving", 0),
                "total_unique_persons": total_unique,
                "zone_distribution": zone_counts,
            }

    def get_session_zone_metrics(self, session_id: str) -> Dict[str, Any]:
        """
        Phase 5: Compute detailed dwell times, occupancy rates, peak headcounts,
        and inter-zone transition flows for a session.
        """
        with self.get_connection() as conn:
            session = self.get_session(session_id)
            if not session:
                return {}

            duration = session.get("duration_seconds") or 1.0

            # Fetch configured spatial zones so unvisited zones are also represented
            cur_z = conn.execute("SELECT name, color FROM spatial_zones")
            configured_zones = {row["name"]: row["color"] for row in cur_z.fetchall()}

            # Fetch all points with zones ordered by person_id, timestamp
            cur = conn.execute(
                """
                SELECT person_id, timestamp, zone 
                FROM spatial_points 
                WHERE session_id = ? 
                ORDER BY person_id ASC, timestamp ASC
                """,
                (session_id,)
            )
            rows = [dict(r) for r in cur.fetchall()]

        if rows:
            actual_span = rows[-1]["timestamp"] - rows[0]["timestamp"]
            duration = max(duration, actual_span, 1.0)

        # Group stays by person
        zone_stays: Dict[str, List[float]] = {}
        transitions: Dict[str, Dict[str, int]] = {}
        zone_unique_persons: Dict[str, set] = {}

        grouped_by_person: Dict[int, List[Dict[str, Any]]] = {}
        for r in rows:
            pid = r["person_id"]
            if pid not in grouped_by_person:
                grouped_by_person[pid] = []
            grouped_by_person[pid].append(r)

        for pid, pts in grouped_by_person.items():
            current_zone = None
            zone_start_t = None
            last_t = None

            for p in pts:
                z = p.get("zone")
                t = p["timestamp"]

                if z:
                    if z not in zone_unique_persons:
                        zone_unique_persons[z] = set()
                    zone_unique_persons[z].add(pid)

                is_gap = last_t is not None and (t - last_t) > 4.0

                if is_gap or z != current_zone:
                    if current_zone and zone_start_t is not None and last_t is not None:
                        dwell = max(1.0, last_t - zone_start_t)
                        if current_zone not in zone_stays:
                            zone_stays[current_zone] = []
                        zone_stays[current_zone].append(dwell)

                        if not is_gap and z and z != current_zone:
                            if current_zone not in transitions:
                                transitions[current_zone] = {}
                            transitions[current_zone][z] = transitions[current_zone].get(z, 0) + 1

                    current_zone = z
                    zone_start_t = t if z else None

                last_t = t

            if current_zone and zone_start_t is not None and last_t is not None:
                dwell = max(1.0, last_t - zone_start_t)
                if current_zone not in zone_stays:
                    zone_stays[current_zone] = []
                zone_stays[current_zone].append(dwell)

        zone_occupancy_seconds: Dict[str, float] = {}
        zone_peaks: Dict[str, int] = {}

        if rows:
            min_t = rows[0]["timestamp"]
            buckets: Dict[tuple, set] = {}
            for r in rows:
                z = r.get("zone")
                if not z:
                    continue
                sec = int(r["timestamp"] - min_t)
                key = (sec, z)
                if key not in buckets:
                    buckets[key] = set()
                buckets[key].add(r["person_id"])

            for (sec, z), pids in buckets.items():
                zone_occupancy_seconds[z] = zone_occupancy_seconds.get(z, 0.0) + 1.0
                if len(pids) > zone_peaks.get(z, 0):
                    zone_peaks[z] = len(pids)

        all_zones = sorted(list(set(list(zone_stays.keys()) + list(zone_occupancy_seconds.keys()) + list(configured_zones.keys()))))
        zone_metrics = []

        for z in all_zones:
            stays = zone_stays.get(z, [])
            total_dwell = sum(stays)
            visits = len(stays)
            avg_dwell = round(total_dwell / visits, 1) if visits > 0 else 0.0
            max_dwell = round(max(stays), 1) if stays else 0.0
            min_dwell = round(min(stays), 1) if stays else 0.0
            occ_sec = zone_occupancy_seconds.get(z, 0.0)
            occ_rate = round(min(100.0, (occ_sec / max(1.0, duration)) * 100), 1)
            peak = zone_peaks.get(z, 0)
            color = configured_zones.get(z, "#0a84ff")

            zone_metrics.append({
                "zone": z,
                "color": color,
                "visits_count": visits,
                "unique_persons_count": len(zone_unique_persons.get(z, set())),
                "total_dwell_seconds": round(total_dwell, 1),
                "avg_dwell_seconds": avg_dwell,
                "min_dwell_seconds": min_dwell,
                "max_dwell_seconds": max_dwell,
                "occupancy_seconds": round(occ_sec, 1),
                "occupancy_rate_percent": occ_rate,
                "peak_occupancy": peak,
            })

        return {
            "session_id": session_id,
            "duration_seconds": round(duration, 1),
            "zones": zone_metrics,
            "transitions": transitions,
        }

    def get_session_rhythms(self, session_id: str, bucket_seconds: int = 5) -> Dict[str, Any]:
        """
        Phase 6: Temporal Rhythms, Peak Cadence, Flow-vs-Stay Waves,
        and Inter-Zone Phase Synchronization Analysis.
        """
        bucket_seconds = max(1, min(60, int(bucket_seconds or 5)))

        with self.get_connection() as conn:
            session = self.get_session(session_id)
            if not session:
                return {}

            # Configured zones
            cur_z = conn.execute("SELECT name, color FROM spatial_zones")
            configured_zones = {row["name"]: row["color"] for row in cur_z.fetchall()}

            # Fetch all points ordered chronologically
            cur = conn.execute(
                """
                SELECT person_id, timestamp, x, y, speed, state, zone 
                FROM spatial_points 
                WHERE session_id = ? 
                ORDER BY timestamp ASC
                """,
                (session_id,)
            )
            rows = [dict(r) for r in cur.fetchall()]

        if not rows:
            return {
                "session_id": session_id,
                "duration_seconds": 0,
                "bucket_seconds": bucket_seconds,
                "timeline": [],
                "peaks": [],
                "valleys": [],
                "rhythm_summary": {
                    "classification": "Sin Datos",
                    "description": "No se registraron coordenadas para esta sesión.",
                    "coefficient_of_variation": 0.0,
                    "avg_cadence_seconds": None,
                    "max_peak_count": 0,
                    "longest_lull_seconds": 0,
                    "movement_ratio_percent": 0,
                    "stopped_ratio_percent": 0,
                    "unique_persons_count": 0,
                },
                "zone_rhythms": {},
            }

        start_t = rows[0]["timestamp"]
        end_t = rows[-1]["timestamp"]
        total_span = max(1.0, end_t - start_t)
        total_buckets = max(1, math.ceil(total_span / bucket_seconds))

        timeline_buckets = []
        for b in range(total_buckets):
            t_offset = b * bucket_seconds
            timeline_buckets.append({
                "bucket_index": b,
                "t": t_offset,
                "time_label": f"{int(t_offset // 60):02d}:{int(t_offset % 60):02d}",
                "persons": set(),
                "moving": set(),
                "stopped": set(),
                "zones": {z: set() for z in configured_zones.keys()},
                "speeds": []
            })

        all_unique_persons = set()
        for r in rows:
            t = r["timestamp"]
            pid = r["person_id"]
            all_unique_persons.add(pid)
            b_idx = min(total_buckets - 1, max(0, int((t - start_t) // bucket_seconds)))
            b = timeline_buckets[b_idx]

            b["persons"].add(pid)
            if r["state"] == "moving":
                b["moving"].add(pid)
            else:
                b["stopped"].add(pid)

            z = r.get("zone")
            if z:
                if z not in b["zones"]:
                    b["zones"][z] = set()
                b["zones"][z].add(pid)

            if r.get("speed") is not None:
                b["speeds"].append(float(r["speed"]))

        timeline_data = []
        counts_series = []
        for b in timeline_buckets:
            total_c = len(b["persons"])
            mov_c = len(b["moving"])
            stp_c = len(b["stopped"])
            counts_series.append(total_c)

            zone_counts = {z: len(pids) for z, pids in b["zones"].items()}
            avg_spd = round(sum(b["speeds"]) / len(b["speeds"]), 3) if b["speeds"] else 0.0

            timeline_data.append({
                "t": b["t"],
                "time_label": b["time_label"],
                "total_count": total_c,
                "moving_count": mov_c,
                "stopped_count": stp_c,
                "avg_speed": avg_spd,
                "zones": zone_counts,
            })

        # Peak & Wave Detection
        peaks = []
        n_buckets = len(timeline_data)
        for i in range(n_buckets):
            c = timeline_data[i]["total_count"]
            if c == 0:
                continue

            is_local_max = True
            if i > 0 and timeline_data[i - 1]["total_count"] > c:
                is_local_max = False
            if i < n_buckets - 1 and timeline_data[i + 1]["total_count"] > c:
                is_local_max = False

            if is_local_max and c >= 1:
                z_counts = timeline_data[i]["zones"]
                dominant_z = max(z_counts.items(), key=lambda item: item[1])[0] if z_counts and any(z_counts.values()) else None

                peaks.append({
                    "t": timeline_data[i]["t"],
                    "time_label": timeline_data[i]["time_label"],
                    "count": c,
                    "dominant_zone": dominant_z,
                })

        # Quiet lulls detection
        lull_runs = []
        current_lull_start = None
        for i in range(n_buckets):
            c = timeline_data[i]["total_count"]
            if c == 0:
                if current_lull_start is None:
                    current_lull_start = timeline_data[i]["t"]
            else:
                if current_lull_start is not None:
                    lull_dur = timeline_data[i]["t"] - current_lull_start
                    if lull_dur >= bucket_seconds * 2:
                        lull_runs.append({
                            "start_t": current_lull_start,
                            "end_t": timeline_data[i]["t"],
                            "duration_seconds": round(lull_dur, 1),
                            "time_label": f"{int(current_lull_start // 60):02d}:{int(current_lull_start % 60):02d}",
                        })
                    current_lull_start = None

        if current_lull_start is not None:
            lull_dur = total_span - current_lull_start
            if lull_dur >= bucket_seconds * 2:
                lull_runs.append({
                    "start_t": current_lull_start,
                    "end_t": total_span,
                    "duration_seconds": round(lull_dur, 1),
                    "time_label": f"{int(current_lull_start // 60):02d}:{int(current_lull_start % 60):02d}",
                })

        # Wave Cadence
        wave_intervals = []
        if len(peaks) >= 2:
            for i in range(1, len(peaks)):
                dt = peaks[i]["t"] - peaks[i - 1]["t"]
                wave_intervals.append(dt)

        avg_cadence = round(sum(wave_intervals) / len(wave_intervals), 1) if wave_intervals else None

        # Statistics & Classification
        mean_c = sum(counts_series) / len(counts_series) if counts_series else 0.0
        variance = sum((x - mean_c) ** 2 for x in counts_series) / len(counts_series) if counts_series else 0.0
        std_dev = math.sqrt(variance)
        cv = (std_dev / mean_c) if mean_c > 0 else 0.0

        total_moving_pts = sum(1 for r in rows if r["state"] == "moving")
        total_stopped_pts = sum(1 for r in rows if r["state"] == "stopped")
        total_valid_pts = max(1, total_moving_pts + total_stopped_pts)
        mov_pct = round((total_moving_pts / total_valid_pts) * 100, 1)
        stp_pct = round((total_stopped_pts / total_valid_pts) * 100, 1)

        max_peak = max(counts_series) if counts_series else 0
        longest_lull = max([lr["duration_seconds"] for lr in lull_runs], default=0.0)

        if mean_c == 0:
            classification = "Inactivo"
            desc = "Espacio desprovisto de ocupantes durante la sesión."
        elif len(peaks) >= 2 and cv > 0.60:
            classification = "Pulsante / Por Olas"
            desc = f"Dinámica intermitente con oleadas de afluencia cada ~{avg_cadence or 0}s, seguidas de pausas."
        elif cv <= 0.45 and mean_c >= 1.0:
            classification = "Continuo / Estable"
            desc = "Flujo uniforme y homogéneo con densidad constante y sin fluctuaciones abruptas."
        elif mov_pct >= 75.0:
            classification = "Tránsito Rápido"
            desc = "Corredor de alta fluidez donde los ocupantes se desplazan activamente sin fijar permanencias."
        elif stp_pct >= 60.0:
            classification = "Estancia / Remanso"
            desc = "Espacio de permanencia donde la actividad dominante es estacionaria o de reposo."
        else:
            classification = "Fluctuante Mixto"
            desc = "Ritmo alterno con variación moderada en los niveles de ocupación y movimiento."

        # Per-Zone Peak Time Synchronization
        zone_rhythms = {}
        for z in configured_zones.keys():
            z_series = [b["zones"].get(z, 0) for b in timeline_data]
            z_max = max(z_series) if z_series else 0
            z_peak_t = None
            if z_max > 0:
                idx = z_series.index(z_max)
                z_peak_t = timeline_data[idx]["t"]

            zone_rhythms[z] = {
                "color": configured_zones.get(z, "#0a84ff"),
                "peak_count": z_max,
                "peak_time": z_peak_t,
                "peak_time_label": f"{int((z_peak_t or 0) // 60):02d}:{int((z_peak_t or 0) % 60):02d}" if z_peak_t is not None else None,
                "active_buckets_count": sum(1 for c in z_series if c > 0),
            }

        return {
            "session_id": session_id,
            "duration_seconds": round(total_span, 1),
            "bucket_seconds": bucket_seconds,
            "total_buckets": len(timeline_data),
            "timeline": timeline_data,
            "peaks": peaks,
            "valleys": lull_runs,
            "rhythm_summary": {
                "classification": classification,
                "description": desc,
                "coefficient_of_variation": round(cv, 2),
                "avg_cadence_seconds": avg_cadence,
                "max_peak_count": max_peak,
                "longest_lull_seconds": round(longest_lull, 1),
                "movement_ratio_percent": mov_pct,
                "stopped_ratio_percent": stp_pct,
                "unique_persons_count": len(all_unique_persons),
            },
            "zone_rhythms": zone_rhythms,
        }

    def get_session_crowd_events(
        self,
        session_id: str,
        cluster_radius: float = 0.16,
        min_cluster_size: int = 3
    ) -> Dict[str, Any]:
        """
        Phase 7: Detección de aglomeraciones y alertas espaciales.
        Agrupamiento por proximidad euclidiana (spatial clustering) y detección de
        cuellos de botella y picos de sobreocupación local.
        """
        cluster_radius = max(0.04, min(0.5, float(cluster_radius or 0.16)))
        min_cluster_size = max(2, min(20, int(min_cluster_size or 3)))

        with self.get_connection() as conn:
            session = self.get_session(session_id)
            if not session:
                return {}

            cur = conn.execute(
                """
                SELECT person_id, timestamp, x, y, speed, state, zone 
                FROM spatial_points 
                WHERE session_id = ? 
                ORDER BY timestamp ASC
                """,
                (session_id,)
            )
            rows = [dict(r) for r in cur.fetchall()]

        if not rows:
            return {
                "session_id": session_id,
                "duration_seconds": 0,
                "cluster_radius": cluster_radius,
                "min_cluster_size": min_cluster_size,
                "total_events": 0,
                "total_crowded_seconds": 0.0,
                "crowd_time_percent": 0.0,
                "max_cluster_size": 0,
                "events": [],
                "hotspots": [],
            }

        start_t = rows[0]["timestamp"]
        end_t = rows[-1]["timestamp"]
        total_duration = max(1.0, end_t - start_t)

        # Slice points by 1-second intervals
        slices: Dict[int, Dict[int, Dict[str, Any]]] = {}
        for r in rows:
            sec = int(r["timestamp"] - start_t)
            pid = r["person_id"]
            if sec not in slices:
                slices[sec] = {}
            slices[sec][pid] = r

        # Detect spatial clusters per second
        raw_second_clusters = []
        for sec in sorted(slices.keys()):
            persons_in_sec = list(slices[sec].values())
            n_p = len(persons_in_sec)
            if n_p < min_cluster_size:
                continue

            # Graph adjacency by Euclidean distance
            adj = {i: [] for i in range(n_p)}
            for i in range(n_p):
                for j in range(i + 1, n_p):
                    dx = persons_in_sec[i]["x"] - persons_in_sec[j]["x"]
                    dy = persons_in_sec[i]["y"] - persons_in_sec[j]["y"]
                    dist = math.sqrt(dx * dx + dy * dy)
                    if dist <= cluster_radius:
                        adj[i].append(j)
                        adj[j].append(i)

            visited = set()
            for i in range(n_p):
                if i not in visited:
                    # BFS component
                    comp = []
                    q = [i]
                    visited.add(i)
                    while q:
                        curr = q.pop(0)
                        comp.append(curr)
                        for neighbor in adj[curr]:
                            if neighbor not in visited:
                                visited.add(neighbor)
                                q.append(neighbor)

                    if len(comp) >= min_cluster_size:
                        members = [persons_in_sec[idx] for idx in comp]
                        cx = sum(m["x"] for m in members) / len(members)
                        cy = sum(m["y"] for m in members) / len(members)
                        zones = [m.get("zone") for m in members if m.get("zone")]
                        dominant_zone = max(set(zones), key=zones.count) if zones else None

                        raw_second_clusters.append({
                            "sec": sec,
                            "size": len(members),
                            "cx": round(cx, 3),
                            "cy": round(cy, 3),
                            "dominant_zone": dominant_zone,
                            "person_ids": [m["person_id"] for m in members]
                        })

        # Merge adjacent seconds into continuous Crowd Events
        events = []
        if raw_second_clusters:
            current_event_secs = [raw_second_clusters[0]]
            for c in raw_second_clusters[1:]:
                last_c = current_event_secs[-1]
                # If gap is <= 2 seconds and centroids are within reasonable distance
                dx = c["cx"] - last_c["cx"]
                dy = c["cy"] - last_c["cy"]
                dist = math.sqrt(dx * dx + dy * dy)
                if (c["sec"] - last_c["sec"]) <= 2 and dist <= (cluster_radius * 1.5):
                    current_event_secs.append(c)
                else:
                    events.append(current_event_secs)
                    current_event_secs = [c]
            if current_event_secs:
                events.append(current_event_secs)

        formatted_events = []
        total_crowd_seconds = 0.0
        max_size_seen = 0
        hotspots_dict = {}

        for ev in events:
            start_sec = ev[0]["sec"]
            end_sec = ev[-1]["sec"]
            dur = max(1.0, float(end_sec - start_sec + 1))
            total_crowd_seconds += dur

            peak_size = max(c["size"] for c in ev)
            max_size_seen = max(max_size_seen, peak_size)

            avg_cx = sum(c["cx"] for c in ev) / len(ev)
            avg_cy = sum(c["cy"] for c in ev) / len(ev)

            # Zone majority
            ev_zones = [c["dominant_zone"] for c in ev if c["dominant_zone"]]
            dom_z = max(set(ev_zones), key=ev_zones.count) if ev_zones else None

            # Severity
            if peak_size >= 6:
                severity = "Crítica"
                color = "#ff453a"
            elif peak_size >= 4:
                severity = "Alta"
                color = "#ff9f0a"
            else:
                severity = "Moderada"
                color = "#ffd60a"

            # Hotspot grouping
            hs_key = f"{round(avg_cx, 1)}_{round(avg_cy, 1)}"
            if hs_key not in hotspots_dict:
                hotspots_dict[hs_key] = {
                    "cx": round(avg_cx, 3),
                    "cy": round(avg_cy, 3),
                    "zone": dom_z,
                    "event_count": 0,
                    "total_duration": 0.0
                }
            hotspots_dict[hs_key]["event_count"] += 1
            hotspots_dict[hs_key]["total_duration"] += dur

            formatted_events.append({
                "id": f"crowd_{start_sec}_{end_sec}",
                "start_time": start_sec,
                "end_time": end_sec,
                "duration_seconds": round(dur, 1),
                "start_time_label": f"{int(start_sec // 60):02d}:{int(start_sec % 60):02d}",
                "end_time_label": f"{int(end_sec // 60):02d}:{int(end_sec % 60):02d}",
                "peak_cluster_size": peak_size,
                "centroid_x": round(avg_cx, 3),
                "centroid_y": round(avg_cy, 3),
                "dominant_zone": dom_z,
                "severity": severity,
                "severity_color": color,
            })

        hotspots = sorted(
            hotspots_dict.values(),
            key=lambda item: item["total_duration"],
            reverse=True
        )[:5]

        crowd_pct = round((total_crowd_seconds / total_duration) * 100, 1)

        return {
            "session_id": session_id,
            "duration_seconds": round(total_duration, 1),
            "cluster_radius": cluster_radius,
            "min_cluster_size": min_cluster_size,
            "total_events": len(formatted_events),
            "total_crowded_seconds": round(total_crowd_seconds, 1),
            "crowd_time_percent": crowd_pct,
            "max_cluster_size": max_size_seen,
            "events": formatted_events,
            "hotspots": hotspots,
        }

    def compare_sessions(self, session_ids: List[str]) -> Dict[str, Any]:
        """
        Phase 8: Comparativa entre múltiples sesiones de observación (franjas/días).
        """
        if not session_ids:
            return {"sessions": [], "comparison": {}}

        results = []
        for sid in session_ids:
            s = self.get_session(sid)
            if not s:
                continue
            rhythms = self.get_session_rhythms(sid, bucket_seconds=15)
            zones = self.get_session_zone_metrics(sid)

            results.append({
                "session": s,
                "rhythms": rhythms.get("rhythm_summary", {}),
                "zones_summary": zones.get("zones", []),
                "timeline_sample": rhythms.get("timeline", [])[:10],
            })

        if not results:
            return {"sessions": [], "comparison": {}}

        # Comparative KPIs
        highest_volume = max(results, key=lambda item: (item["session"].get("total_persons") or 0))
        highest_concurrent = max(results, key=lambda item: (item["session"].get("max_concurrent") or 0))
        longest_dur = max(results, key=lambda item: (item["session"].get("duration_seconds") or 0.0))

        return {
            "sessions_count": len(results),
            "sessions": results,
            "summary_highlights": {
                "highest_volume_session": highest_volume["session"].get("name") or highest_volume["session"].get("id", "Sesión"),
                "highest_volume_count": highest_volume["session"].get("total_persons") or 0,
                "highest_concurrent_session": highest_concurrent["session"].get("name") or highest_concurrent["session"].get("id", "Sesión"),
                "highest_concurrent_count": highest_concurrent["session"].get("max_concurrent") or 0,
                "longest_session": longest_dur["session"].get("name") or longest_dur["session"].get("id", "Sesión"),
                "longest_duration": round(longest_dur["session"].get("duration_seconds") or 0.0, 1),
            }
        }

    def get_time_slots_analytics(self) -> Dict[str, Any]:
        """
        Phase 8: Agrupación histórica por franjas horarias (Madrugada, Mañana, Tarde, Noche)
        y días de la semana a partir de todas las sesiones registradas.
        """
        with self.get_connection() as conn:
            cur = conn.execute(
                """
                SELECT id, name, started_at, duration_seconds, total_persons, max_concurrent, avg_fps, created_at
                FROM sessions
                WHERE status = 'completed' AND started_at IS NOT NULL
                ORDER BY started_at DESC
                """
            )
            rows = [dict(r) for r in cur.fetchall()]

        slots = {
            "morning": {"label": "Mañana (06:00 - 12:00)", "sessions_count": 0, "total_persons": 0, "avg_concurrent": 0.0, "sessions": []},
            "afternoon": {"label": "Tarde (12:00 - 18:00)", "sessions_count": 0, "total_persons": 0, "avg_concurrent": 0.0, "sessions": []},
            "evening": {"label": "Noche (18:00 - 24:00)", "sessions_count": 0, "total_persons": 0, "avg_concurrent": 0.0, "sessions": []},
            "night": {"label": "Madrugada (00:00 - 06:00)", "sessions_count": 0, "total_persons": 0, "avg_concurrent": 0.0, "sessions": []},
        }

        days = {
            0: {"day": "Lunes", "sessions_count": 0, "total_persons": 0},
            1: {"day": "Martes", "sessions_count": 0, "total_persons": 0},
            2: {"day": "Miércoles", "sessions_count": 0, "total_persons": 0},
            3: {"day": "Jueves", "sessions_count": 0, "total_persons": 0},
            4: {"day": "Viernes", "sessions_count": 0, "total_persons": 0},
            5: {"day": "Sábado", "sessions_count": 0, "total_persons": 0},
            6: {"day": "Domingo", "sessions_count": 0, "total_persons": 0},
        }

        import datetime

        for r in rows:
            st = r["started_at"]
            dt = datetime.datetime.fromtimestamp(st)
            hour = dt.hour
            weekday = dt.weekday()

            if 6 <= hour < 12:
                slot_key = "morning"
            elif 12 <= hour < 18:
                slot_key = "afternoon"
            elif 18 <= hour < 24:
                slot_key = "evening"
            else:
                slot_key = "night"

            slots[slot_key]["sessions_count"] += 1
            slots[slot_key]["total_persons"] += (r.get("total_persons") or 0)
            slots[slot_key]["avg_concurrent"] += (r.get("max_concurrent") or 0)
            slots[slot_key]["sessions"].append(r.get("name") or r.get("id"))

            days[weekday]["sessions_count"] += 1
            days[weekday]["total_persons"] += (r.get("total_persons") or 0)

        for k in slots.keys():
            sc = slots[k]["sessions_count"]
            if sc > 0:
                slots[k]["avg_concurrent"] = round(slots[k]["avg_concurrent"] / sc, 1)

        return {
            "total_analyzed_sessions": len(rows),
            "slots": slots,
            "days_of_week": list(days.values())
        }

    def get_session_interactions(
        self,
        session_id: str,
        distance_threshold: float = 0.12,
        min_interaction_seconds: float = 3.0
    ) -> Dict[str, Any]:
        """
        Phase 9: Detección de interacciones interpersonales y proximidad social.
        Identifica pares de individuos en interacción continuada, agrupamiento y caminata conjunta.
        """
        distance_threshold = max(0.04, min(0.35, float(distance_threshold or 0.12)))
        min_interaction_seconds = max(1.0, min(60.0, float(min_interaction_seconds or 3.0)))

        with self.get_connection() as conn:
            session = self.get_session(session_id)
            if not session:
                return {}

            cur = conn.execute(
                """
                SELECT person_id, timestamp, x, y, speed, state, zone 
                FROM spatial_points 
                WHERE session_id = ? 
                ORDER BY timestamp ASC
                """,
                (session_id,)
            )
            rows = [dict(r) for r in cur.fetchall()]

        if not rows:
            return {
                "session_id": session_id,
                "total_interactions": 0,
                "unique_interacting_persons": 0,
                "social_ratio_percent": 0.0,
                "avg_interaction_duration": 0.0,
                "interactions": [],
            }

        start_t = rows[0]["timestamp"]
        end_t = rows[-1]["timestamp"]
        total_span = max(1.0, end_t - start_t)

        all_persons = set(r["person_id"] for r in rows)

        # Bin points by 1-second intervals
        slices: Dict[int, Dict[int, Dict[str, Any]]] = {}
        for r in rows:
            sec = int(r["timestamp"] - start_t)
            pid = r["person_id"]
            if sec not in slices:
                slices[sec] = {}
            slices[sec][pid] = r

        # Pair proximity occurrences: {(p1, p2): [sec1, sec2, ...]}
        pair_seconds: Dict[tuple, List[Dict[str, Any]]] = {}
        sorted_secs = sorted(slices.keys())

        for sec in sorted_secs:
            persons = list(slices[sec].values())
            n = len(persons)
            for i in range(n):
                for j in range(i + 1, n):
                    p1 = persons[i]
                    p2 = persons[j]
                    pid1 = min(p1["person_id"], p2["person_id"])
                    pid2 = max(p1["person_id"], p2["person_id"])
                    pair_key = (pid1, pid2)

                    dx = p1["x"] - p2["x"]
                    dy = p1["y"] - p2["y"]
                    d = math.sqrt(dx * dx + dy * dy)

                    if d <= distance_threshold:
                        if pair_key not in pair_seconds:
                            pair_seconds[pair_key] = []
                        pair_seconds[pair_key].append({
                            "sec": sec,
                            "dist": d,
                            "zone": p1.get("zone") or p2.get("zone"),
                            "state1": p1.get("state"),
                            "state2": p2.get("state"),
                        })

        # Find continuous runs >= min_interaction_seconds
        encounters = []
        interacting_pids = set()

        for (pid1, pid2), sec_list in pair_seconds.items():
            if not sec_list:
                continue

            # Group consecutive seconds with gap <= 2s
            runs = []
            curr_run = [sec_list[0]]
            for item in sec_list[1:]:
                if (item["sec"] - curr_run[-1]["sec"]) <= 2:
                    curr_run.append(item)
                else:
                    runs.append(curr_run)
                    curr_run = [item]
            if curr_run:
                runs.append(curr_run)

            for run in runs:
                dur = max(1.0, float(run[-1]["sec"] - run[0]["sec"] + 1))
                if dur >= min_interaction_seconds:
                    interacting_pids.add(pid1)
                    interacting_pids.add(pid2)

                    avg_d = sum(item["dist"] for item in run) / len(run)
                    zones = [item["zone"] for item in run if item["zone"]]
                    dom_zone = max(set(zones), key=zones.count) if zones else None

                    # Classification
                    stopped_both = sum(1 for item in run if item["state1"] == "stopped" and item["state2"] == "stopped")
                    moving_both = sum(1 for item in run if item["state1"] == "moving" and item["state2"] == "moving")

                    if stopped_both >= (len(run) * 0.5):
                        interaction_type = "Conversación Estacionaria"
                        type_badge = "☕ Conversación"
                    elif moving_both >= (len(run) * 0.5):
                        interaction_type = "Caminata Conjunta"
                        type_badge = "🚶 Caminata Conjunta"
                    else:
                        interaction_type = "Interacción Mixta"
                        type_badge = "🔄 Mixta"

                    start_sec = run[0]["sec"]
                    end_sec = run[-1]["sec"]

                    encounters.append({
                        "person_a": pid1,
                        "person_b": pid2,
                        "label": f"P{pid1:02d} ↔ P{pid2:02d}",
                        "start_time": start_sec,
                        "end_time": end_sec,
                        "duration_seconds": round(dur, 1),
                        "start_time_label": f"{int(start_sec // 60):02d}:{int(start_sec % 60):02d}",
                        "end_time_label": f"{int(end_sec // 60):02d}:{int(end_sec % 60):02d}",
                        "avg_distance": round(avg_d, 3),
                        "zone": dom_zone,
                        "interaction_type": interaction_type,
                        "type_badge": type_badge,
                    })

        encounters.sort(key=lambda item: item["duration_seconds"], reverse=True)

        avg_dur = round(sum(e["duration_seconds"] for e in encounters) / len(encounters), 1) if encounters else 0.0
        longest_dur = max([e["duration_seconds"] for e in encounters], default=0.0)
        total_p = max(1, len(all_persons))
        social_pct = round((len(interacting_pids) / total_p) * 100, 1)

        return {
            "session_id": session_id,
            "duration_seconds": round(total_span, 1),
            "distance_threshold": distance_threshold,
            "min_interaction_seconds": min_interaction_seconds,
            "total_interactions_count": len(encounters),
            "unique_interacting_persons": len(interacting_pids),
            "total_individuals_count": len(all_persons),
            "social_ratio_percent": social_pct,
            "avg_interaction_duration_seconds": avg_dur,
            "longest_interaction_seconds": round(longest_dur, 1),
            "interactions": encounters,
        }


# Global database singleton
db = Database()


