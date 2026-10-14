/**
 * Ritmos — Main Application (Phase 3: Spatial Zones & Multi-Camera Vision)
 * Coordinates video capture, WebSocket vision pipeline, SQLite session persistence,
 * spatial zones polygon editor, live HUD occupancy, and multi-camera device switching.
 */

(function () {
    'use strict';

    // ─── State ──────────────────────────────────────────
    const state = {
        sessionActive: false,
        sessionPaused: false,
        sessionId: null,
        sessionName: "Ritmos",
        sessionStartTime: null,
        sessionPausedDuration: 0,
        pauseTimestamp: null,
        recordedPointsCount: 0,

        // Spatial Zones (Phase 3)
        zones: [],
        selectedZoneColor: '#0a84ff',
        pendingZoneName: '',
        prevPersonZones: {}, // {personId: lastZoneName}

        // Live stats
        maxSimultaneous: 0,
        activityHistory: [],
        maxActivityHistory: 120,
        events: [],

        // Timer
        timerInterval: null,
    };

    // ─── Components ─────────────────────────────────────
    const camera = new CameraManager();
    const ws = new WebSocketManager();
    let overlay = null;
    let heatmap = null;
    let timeline = null;

    // ─── DOM Elements ───────────────────────────────────
    const dom = {
        // Space & Session Header
        spaceNameInput: document.getElementById('space-name-input'),
        btnOpenHistory: document.getElementById('btn-open-history'),
        historyCount: document.getElementById('history-count'),
        modalHistory: document.getElementById('modal-history'),
        btnCloseHistory: document.getElementById('btn-close-history'),
        historyContainer: document.getElementById('history-sessions-container'),

        // Camera Container & Overlays
        cameraContainer: document.getElementById('camera-container'),
        cameraVideo: document.getElementById('camera-video'),
        cameraPlaceholder: document.getElementById('camera-placeholder'),
        processingIndicator: document.getElementById('processing-indicator'),
        frameInfo: document.getElementById('frame-info'),
        fpsDisplay: document.getElementById('fps-display'),
        resolutionDisplay: document.getElementById('resolution-display'),
        btnExitFullscreen: document.getElementById('btn-exit-fullscreen'),

        // Floating Zone Drawing Bar (Phase 3)
        zoneDrawingBar: document.getElementById('zone-drawing-bar'),
        drawingPointCount: document.getElementById('drawing-point-count'),
        btnSaveZone: document.getElementById('btn-save-zone'),
        btnUndoZone: document.getElementById('btn-undo-zone'),
        btnCancelZone: document.getElementById('btn-cancel-zone'),

        // Controls
        btnCamera: document.getElementById('btn-camera'),
        btnCameraFlip: document.getElementById('btn-camera-flip'),
        cameraFlipLabel: document.getElementById('camera-flip-label'),
        btnStart: document.getElementById('btn-start'),
        btnPause: document.getElementById('btn-pause'),
        btnResume: document.getElementById('btn-resume'),
        btnStop: document.getElementById('btn-stop'),
        btnGrid: document.getElementById('btn-grid'),
        btnFullscreen: document.getElementById('btn-fullscreen'),
        btnZones: document.getElementById('btn-zones'),
        zonesCountBadge: document.getElementById('zones-count-badge'),

        // Config Selects
        selectAspect: document.getElementById('select-aspect'),
        selectFPS: document.getElementById('select-fps'),
        selectQuality: document.getElementById('select-quality'),

        // HUD & Overlays
        timerValue: document.getElementById('timer-value'),
        hudPointsCount: document.getElementById('hud-points-count'),
        sessionStatus: document.getElementById('session-status-text'),

        // Stats Cards
        statVisible: document.getElementById('stat-visible'),
        statTotal: document.getElementById('stat-total'),
        statMax: document.getElementById('stat-max'),
        statProcessing: document.getElementById('stat-processing'),

        // Sidebar Panels & Lists
        zonesOccupancyList: document.getElementById('zones-occupancy-list'),
        btnOpenZonesModal: document.getElementById('btn-open-zones-modal'),
        personsList: document.getElementById('persons-list'),
        eventsList: document.getElementById('events-list'),
        activityChart: document.getElementById('activity-chart'),

        // Zones Modal (Phase 3)
        modalZones: document.getElementById('modal-zones'),
        btnCloseZones: document.getElementById('btn-close-zones'),
        inputZoneName: document.getElementById('input-zone-name'),
        btnStartDrawZone: document.getElementById('btn-start-draw-zone'),
        modalZonesList: document.getElementById('modal-zones-list'),

        // Heatmaps & Trajectories (Phase 4)
        btnHeatmaps: document.getElementById('btn-heatmaps'),
        heatmapFloatingBar: document.getElementById('heatmap-floating-bar'),
        heatmapSegments: document.querySelectorAll('.heatmap-segmented-control .segment-btn'),
        heatmapOpacityRange: document.getElementById('heatmap-opacity-range'),
        heatmapOpacityVal: document.getElementById('heatmap-opacity-val'),
        heatmapRadiusRange: document.getElementById('heatmap-radius-range'),
        heatmapRadiusVal: document.getElementById('heatmap-radius-val'),
        heatmapPersonSelect: document.getElementById('heatmap-person-select'),
        heatmapWindowSelect: document.getElementById('heatmap-window-select'),
        btnHeatmapReset: document.getElementById('btn-heatmap-reset'),
        btnHeatmapExport: document.getElementById('btn-heatmap-export'),

        // Interactive Timeline Player (Historical Heatmap Replay)
        timelinePlayerBar: document.getElementById('timeline-player-bar'),
        timelineSessionName: document.getElementById('timeline-session-name'),
        timelinePointsStat: document.getElementById('timeline-points-stat'),
        timelineCurrentTime: document.getElementById('timeline-current-time'),
        timelineTotalDuration: document.getElementById('timeline-total-duration'),
        timelineScrubber: document.getElementById('timeline-scrubber'),
        btnTimelinePlay: document.getElementById('btn-timeline-play'),
        timelinePlayIcon: document.getElementById('timeline-play-icon'),
        btnTimelineRestart: document.getElementById('btn-timeline-restart'),
        btnTimelineStepBack: document.getElementById('btn-timeline-step-back'),
        btnTimelineStepFwd: document.getElementById('btn-timeline-step-fwd'),
        btnTimelineClose: document.getElementById('btn-timeline-close'),
        btnTimelineModeCum: document.getElementById('btn-timeline-mode-cum'),
        btnTimelineModeWin: document.getElementById('btn-timeline-mode-win'),
        timelineSpeedBtns: document.querySelectorAll('.btn-timeline-speed'),
        btnTimelineToggleClean: document.getElementById('btn-timeline-toggle-clean'),
        btnTimelineRestoreControls: document.getElementById('btn-timeline-restore-controls'),
        toggleLayerHeatmap: document.getElementById('toggle-layer-heatmap'),
        toggleLayerTrajectories: document.getElementById('toggle-layer-trajectories'),
        toggleLayerZones: document.getElementById('toggle-layer-zones'),
        toggleLayerLabels: document.getElementById('toggle-layer-labels'),
        toggleLayerGrid: document.getElementById('toggle-layer-grid'),
        replayVideo: document.getElementById('replay-video'),
        modalZoneMetrics: document.getElementById('modal-zone-metrics'),
        btnCloseZoneMetrics: document.getElementById('btn-close-zone-metrics'),
        zoneMetricsContainer: document.getElementById('zone-metrics-container'),
        modalRhythms: document.getElementById('modal-rhythms'),
        btnCloseRhythms: document.getElementById('btn-close-rhythms'),
        rhythmsContainer: document.getElementById('rhythms-container'),
        replayModeBadge: document.getElementById('replay-mode-badge'),
        btnExitReplayFloating: document.getElementById('btn-exit-replay-floating'),
    };

    const chartCtx = dom.activityChart.getContext('2d');

    // ═══════════════════════════════════════════════════════
    // INITIALIZATION & DATA SYNC
    // ═══════════════════════════════════════════════════════

    async function refreshHistoryCount() {
        try {
            const res = await fetch('/api/sessions');
            if (res.ok) {
                const data = await res.json();
                dom.historyCount.textContent = data.count || 0;
            }
        } catch (e) {
            console.warn('[App] Could not fetch session count:', e);
        }
    }

    async function loadZones() {
        try {
            const res = await fetch('/api/zones');
            if (res.ok) {
                const data = await res.json();
                state.zones = data.zones || [];
                if (overlay) {
                    overlay.setZones(state.zones);
                }
                if (ws.isConnected) {
                    ws.sendControl({
                        action: 'update_zones',
                        zones: state.zones
                    });
                }
                dom.zonesCountBadge.textContent = state.zones.length;
                renderModalZonesList();
                updateZonesOccupancy({});
            }
        } catch (e) {
            console.warn('[App] Could not load spatial zones:', e);
        }
    }

    // Load initial data
    refreshHistoryCount();
    loadZones();

    // ═══════════════════════════════════════════════════════
    // CAMERA & VISION PIPELINE
    // ═══════════════════════════════════════════════════════

    camera.onStart = (info) => {
        dom.cameraPlaceholder.classList.add('hidden');
        dom.resolutionDisplay.textContent = `${info.width}×${info.height}`;
        dom.btnCamera.querySelector('.btn-label').textContent = 'Detener Cam';
        dom.btnStart.disabled = false;

        if (!overlay) {
            overlay = new CanvasOverlay('overlay-canvas', camera);
        }
        overlay.setZones(state.zones);

        if (!heatmap) {
            heatmap = new HeatmapRenderer('heatmap-canvas', camera);
        }

        // Update camera button label with active camera device info
        dom.cameraFlipLabel.textContent = camera.getCameraLabel();

        // Connect WebSocket and immediately start live vision analysis and automatic labeling!
        if (!ws.isConnected) {
            ws.connect();
        }
        const fps = parseInt(dom.selectFPS.value, 10) || 5;
        const quality = parseFloat(dom.selectQuality.value) || 0.6;
        camera.startCapture(fps, quality);

        addEvent('Cámara activada', `${info.width}×${info.height} — Visión y etiquetado automático en vivo`);
    };

    camera.onStop = () => {
        dom.cameraPlaceholder.classList.remove('hidden');
        dom.btnCamera.querySelector('.btn-label').textContent = 'Cámara';
        dom.btnStart.disabled = true;

        if (state.sessionActive) {
            stopSession();
        }
        if (overlay) overlay.clear();
        addEvent('Cámara detenida', 'Visualización cerrada');
    };

    camera.onError = (error) => {
        let message = 'Error al acceder a la cámara.';
        if (error.name === 'NotAllowedError') {
            message = 'Permiso denegado. Habilita el acceso a la cámara en el navegador.';
        } else if (error.name === 'NotFoundError') {
            message = 'No se encontró ninguna cámara conectada.';
        } else if (error.message) {
            message = error.message;
        }
        alert(message);
    };

    camera.onFrame = (blob) => {
        // Stream frames whenever WebSocket is connected for live automatic labeling
        if (ws.isConnected) {
            ws.sendFrame(blob);
        }
    };

    // ═══════════════════════════════════════════════════════
    // WEBSOCKET HANDLERS
    // ═══════════════════════════════════════════════════════

    ws.onConnect = () => {
        console.log('[App] WebSocket vision connected');
        dom.processingIndicator.classList.remove('hidden');
        if (state.zones.length > 0) {
            ws.sendControl({
                action: 'update_zones',
                zones: state.zones
            });
        }
    };

    ws.onDisconnect = () => {
        console.log('[App] WebSocket vision disconnected');
        dom.processingIndicator.classList.add('hidden');
    };

    ws.onResult = (result) => {
        const { persons, disappeared, frame_stats, session } = result;

        // Render live detection bounding boxes, tracking, and automatic labels
        if (overlay) {
            overlay.update(persons);
        }

        // Phase 4: Accumulate live coordinates for real-time Heatmaps and Trajectories
        if (heatmap && persons && persons.length > 0) {
            heatmap.addLivePoints(persons);
            updateHeatmapPersonSelector();
        }

        // Only count persistent DB points during an active session
        if (state.sessionActive && !state.sessionPaused) {
            state.recordedPointsCount += persons.length;
            dom.hudPointsCount.textContent = state.recordedPointsCount;
        }

        updateStats(persons, frame_stats);
        checkEvents(persons, disappeared, frame_stats);
        checkZoneTransitions(persons);

        if (frame_stats && frame_stats.zone_occupancy) {
            updateZonesOccupancy(frame_stats.zone_occupancy);
        }
    };

    ws.onControl = (message) => {
        console.log('[App] Control message:', message);
        if (message.control === 'session_stopped') {
            refreshHistoryCount();
        }
    };

    // ═══════════════════════════════════════════════════════
    // SESSION LIFECYCLE (SQLITE RECORDING & LIVE CAMERA)
    // ═══════════════════════════════════════════════════════

    function exitReplayAndReturnToLive() {
        if (timeline) {
            timeline.close();
        }
        if (dom.replayVideo) {
            dom.replayVideo.pause();
            dom.replayVideo.removeAttribute('src');
            dom.replayVideo.load();
            dom.replayVideo.classList.add('hidden');
        }
        if (dom.timelinePlayerBar) dom.timelinePlayerBar.classList.add('hidden');
        if (dom.btnTimelineRestoreControls) dom.btnTimelineRestoreControls.classList.add('hidden');
        if (dom.replayModeBadge) dom.replayModeBadge.classList.add('hidden');

        if (heatmap) {
            heatmap.clear();
            if (heatmap.canvas) heatmap.canvas.style.display = 'block';
        }
        if (overlay) {
            overlay.setOccupancyOverrides(null);
            overlay.clear();
            overlay.setTrailsVisible(true);
            overlay.setZonesVisible(true);
            overlay.setLabelsVisible(true);
            overlay.update([]);
        }

        if (camera.isActive) {
            dom.cameraPlaceholder.classList.add('hidden');
            camera.resumeCapture();
            dom.sessionStatus.textContent = 'Cámara en vivo lista';
            dom.sessionStatus.className = '';
        } else {
            dom.cameraPlaceholder.classList.remove('hidden');
            dom.sessionStatus.textContent = 'En espera — Presiona Iniciar Cámara';
            dom.sessionStatus.className = '';
        }

        // Restore start buttons state
        dom.btnStart.classList.remove('hidden');
        dom.btnPause.classList.add('hidden');
        dom.btnResume.classList.add('hidden');
        dom.btnStop.classList.add('hidden');

        addEvent('Cámara en vivo', 'Saliendo de la reproducción histórica y volviendo a la cámara');
    }

    function startSession() {
        // If historical replay is active, clear it first
        if (timeline && (timeline.session || !dom.replayVideo.classList.contains('hidden'))) {
            exitReplayAndReturnToLive();
        }

        if (!camera.isActive) {
            alert('Primero inicia la cámara antes de comenzar la observación.');
            return;
        }

        const spaceName = (dom.spaceNameInput.value || "").trim() || "Ritmos";
        const sessionId = `session_${Date.now()}`;

        state.sessionActive = true;
        state.sessionPaused = false;
        state.sessionId = sessionId;
        state.sessionName = spaceName;
        state.sessionStartTime = Date.now();
        state.sessionPausedDuration = 0;
        state.pauseTimestamp = null;
        state.recordedPointsCount = 0;
        state.maxSimultaneous = 0;
        state.activityHistory = [];
        state.prevPersonZones = {};

        // Connect WS if needed
        if (!ws.isConnected) {
            ws.connect();
        }

        // Send start session control message to server
        ws.sendControl({
            action: 'session_start',
            session_id: sessionId,
            name: spaceName
        });

        // Start camera video recording for historical playback
        camera.startVideoRecording();

        // Ensure capture is running at configured FPS
        const fps = parseInt(dom.selectFPS.value, 10) || 5;
        const quality = parseFloat(dom.selectQuality.value) || 0.6;
        camera.startCapture(fps, quality);

        // Update UI
        dom.btnStart.classList.add('hidden');
        dom.btnPause.classList.remove('hidden');
        dom.btnResume.classList.add('hidden');
        dom.btnStop.classList.remove('hidden');

        dom.sessionStatus.textContent = `Grabando: ${spaceName}`;
        dom.sessionStatus.className = 'recording';
        dom.spaceNameInput.disabled = true;

        startTimer();
        addEvent('Grabación iniciada', `${spaceName} (ID: ${sessionId})`);
    }

    function pauseSession() {
        if (!state.sessionActive || state.sessionPaused) return;

        state.sessionPaused = true;
        state.pauseTimestamp = Date.now();

        ws.sendControl({ action: 'session_pause' });

        dom.btnPause.classList.add('hidden');
        dom.btnResume.classList.remove('hidden');

        dom.sessionStatus.textContent = 'En pausa';
        dom.sessionStatus.className = 'paused';

        addEvent('Sesión pausada', 'Registro de coordenadas suspendido temporalmente');
    }

    function resumeSession() {
        if (!state.sessionActive || !state.sessionPaused) return;

        state.sessionPaused = false;
        if (state.pauseTimestamp) {
            state.sessionPausedDuration += Date.now() - state.pauseTimestamp;
            state.pauseTimestamp = null;
        }

        ws.sendControl({ action: 'session_resume' });

        dom.btnResume.classList.add('hidden');
        dom.btnPause.classList.remove('hidden');

        dom.sessionStatus.textContent = `Grabando: ${state.sessionName}`;
        dom.sessionStatus.className = 'recording';

        addEvent('Sesión reanudada', 'Continuando registro en SQLite');
    }

    async function stopSession() {
        if (!state.sessionActive) return;

        const stoppedSessionId = state.sessionId;

        ws.sendControl({ action: 'session_stop' });

        // Stop video recording and upload to backend
        try {
            const videoBlob = await camera.stopVideoRecording();
            if (videoBlob && videoBlob.size > 0 && stoppedSessionId) {
                const formData = new FormData();
                formData.append('video', videoBlob, `${stoppedSessionId}.webm`);
                formData.append('file', videoBlob, `${stoppedSessionId}.webm`);
                const upRes = await fetch(`/api/sessions/${stoppedSessionId}/video`, {
                    method: 'POST',
                    body: formData,
                });
                if (upRes.ok) {
                    const data = await upRes.json();
                    console.log('[Session] Video saved to server:', data);
                    const mbSize = (videoBlob.size / 1024 / 1024).toFixed(2);
                    addEvent('Video guardado', `${mbSize} MB archivados para reproducción`);
                    refreshHistoryCount();
                } else {
                    console.warn('[Session] Video upload returned non-200:', upRes.status);
                }
            }
        } catch (e) {
            console.warn('[Session] Error finalizing video recording:', e);
        }

        clearInterval(state.timerInterval);
        state.timerInterval = null;

        state.sessionActive = false;
        state.sessionPaused = false;

        dom.btnStart.classList.remove('hidden');
        dom.btnPause.classList.add('hidden');
        dom.btnResume.classList.add('hidden');
        dom.btnStop.classList.add('hidden');

        dom.sessionStatus.textContent = 'Sesión guardada en SQLite';
        dom.sessionStatus.className = '';
        dom.spaceNameInput.disabled = false;

        addEvent('Sesión finalizada', `${state.sessionName} — ${state.recordedPointsCount} puntos espaciales registrados`);
        refreshHistoryCount();
    }

    // ─── Timer ──────────────────────────────────────────
    function startTimer() {
        clearInterval(state.timerInterval);
        state.timerInterval = setInterval(() => {
            if (!state.sessionActive || state.sessionPaused) return;

            const elapsedMs = Date.now() - state.sessionStartTime - state.sessionPausedDuration;
            const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));

            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;

            dom.timerValue.textContent =
                `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }, 500);
    }

    // ═══════════════════════════════════════════════════════
    // STATS & COORDINATES RENDERING
    // ═══════════════════════════════════════════════════════

    function updateStats(persons, frameStats) {
        const visibleCount = persons.length;
        dom.statVisible.textContent = visibleCount;

        if (visibleCount > state.maxSimultaneous) {
            state.maxSimultaneous = visibleCount;
        }
        dom.statMax.textContent = state.maxSimultaneous;

        if (frameStats) {
            dom.statTotal.textContent = frameStats.total_detected;
            dom.statProcessing.textContent = Math.round(frameStats.processing_time_ms || 0);
            dom.fpsDisplay.textContent = `${frameStats.effective_fps || '--'} FPS`;
        }

        // Live Persons List with Automatic Tags & Coordinates
        renderPersonsList(persons);

        // Update Activity Density Chart
        state.activityHistory.push({
            time: Date.now(),
            count: visibleCount,
        });
        if (state.activityHistory.length > state.maxActivityHistory) {
            state.activityHistory.shift();
        }
        renderActivityChart();
    }

    function renderPersonsList(persons) {
        if (!persons || persons.length === 0) {
            dom.personsList.innerHTML = '<div class="persons-empty">Sin detecciones en el encuadre</div>';
            return;
        }

        let html = '';
        for (const p of persons) {
            const color = overlay ? overlay.getPersonColor(p.id) : '#0a84ff';
            const stateClass = p.state === 'moving' ? 'moving' : 'stopped';
            const stateLabel = p.state === 'moving' ? 'Movimiento' : 'Estático';
            const zoneHtml = p.zone ? `<span class="person-zone-pill" style="border-color:${p.zone_color || color};color:${p.zone_color || color};">${p.zone}</span>` : '';

            html += `
                <div class="person-item">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="person-badge" style="background: ${color}; color: #ffffff;">${p.label}</span>
                        ${zoneHtml}
                        <span class="person-coords">(${p.x.toFixed(2)}, ${p.y.toFixed(2)})</span>
                    </div>
                    <span class="person-state-tag ${stateClass}">${stateLabel}</span>
                </div>
            `;
        }
        dom.personsList.innerHTML = html;
    }

    // ─── Activity Density Chart ──────────────────────────
    function renderActivityChart() {
        const ctx = chartCtx;
        const w = dom.activityChart.width = dom.activityChart.clientWidth;
        const h = dom.activityChart.height = dom.activityChart.clientHeight;
        const data = state.activityHistory;

        if (data.length < 2) return;

        ctx.clearRect(0, 0, w, h);

        const maxCount = Math.max(1, ...data.map(d => d.count));
        const padding = { top: 10, bottom: 20, left: 4, right: 4 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        // Grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 3; i++) {
            const y = padding.top + (chartH / 3) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
        }

        // Draw Line
        ctx.beginPath();
        ctx.strokeStyle = '#0a84ff';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = '#0a84ff';
        ctx.shadowBlur = 6;

        for (let i = 0; i < data.length; i++) {
            const x = padding.left + (i / (data.length - 1)) * chartW;
            const y = padding.top + chartH - (data[i].count / maxCount) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Area Gradient
        ctx.lineTo(padding.left + chartW, padding.top + chartH);
        ctx.lineTo(padding.left, padding.top + chartH);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        grad.addColorStop(0, 'rgba(10, 132, 255, 0.28)');
        grad.addColorStop(1, 'rgba(10, 132, 255, 0.0)');
        ctx.fillStyle = grad;
        ctx.fill();
    }

    // ─── Events & Automatic Zone Transitions ────────────
    let prevIds = new Set();

    function checkEvents(persons, disappeared, frameStats) {
        const currentIds = new Set(persons.map(p => p.id));

        for (const id of currentIds) {
            if (!prevIds.has(id)) {
                addEvent(`Ingresó P${String(id).padStart(2, '0')}`, 'Nuevo cuerpo detectado en el espacio');
            }
        }

        if (disappeared && disappeared.length > 0) {
            for (const id of disappeared) {
                addEvent(`Salió P${String(id).padStart(2, '0')}`, 'Salió del campo de visión');
            }
        }

        prevIds = currentIds;
    }

    function checkZoneTransitions(persons) {
        for (const p of persons) {
            const id = p.id;
            const currentZone = p.zone || null;
            const prevZone = state.prevPersonZones[id] || null;

            if (currentZone !== prevZone) {
                if (currentZone && !prevZone) {
                    addEvent(`P${String(id).padStart(2, '0')} ingresó a [${currentZone}]`, 'Transición de zona espacial');
                } else if (!currentZone && prevZone) {
                    addEvent(`P${String(id).padStart(2, '0')} abandonó [${prevZone}]`, 'Fuera de zona delimitada');
                } else if (currentZone && prevZone) {
                    addEvent(`P${String(id).padStart(2, '0')} pasó de [${prevZone}] a [${currentZone}]`, 'Flujo interzonal');
                }
                state.prevPersonZones[id] = currentZone;
            }
        }
    }

    function addEvent(title, desc) {
        const now = new Date();
        const timeStr = now.toTimeString().substring(0, 8);

        state.events.unshift({ title, desc, time: timeStr });
        if (state.events.length > 40) state.events.pop();

        let html = '';
        for (const ev of state.events) {
            html += `
                <div class="event-item">
                    <span class="event-time">${ev.time}</span>
                    <strong style="color: #ffffff">${ev.title}</strong>
                    <span class="event-desc">— ${ev.desc}</span>
                </div>
            `;
        }
        dom.eventsList.innerHTML = html;
    }

    // ═══════════════════════════════════════════════════════
    // SPATIAL ZONES LOGIC & UI (PHASE 3)
    // ═══════════════════════════════════════════════════════

    function renderModalZonesList() {
        if (!state.zones || state.zones.length === 0) {
            dom.modalZonesList.innerHTML = '<div class="persons-empty">No hay zonas configuradas. Crea una arriba.</div>';
            return;
        }

        let html = '';
        for (const z of state.zones) {
            const vertCount = (z.polygon || []).length;
            html += `
                <div class="session-card" style="border-left: 4px solid ${z.color || '#0a84ff'};">
                    <div class="session-card-header">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="width:12px;height:12px;border-radius:50%;background:${z.color || '#0a84ff'};display:inline-block;"></span>
                            <span class="session-title">${z.name}</span>
                        </div>
                        <button class="btn btn-xs btn-danger" onclick="deleteZone('${z.id}')">🗑️ Eliminar</button>
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-secondary);font-family:var(--font-mono);">
                        Vértices: ${vertCount} puntos normalizados
                    </div>
                </div>
            `;
        }
        dom.modalZonesList.innerHTML = html;
    }

    function updateZonesOccupancy(occupancies) {
        if (!state.zones || state.zones.length === 0) {
            dom.zonesOccupancyList.innerHTML = '<div class="persons-empty">Sin zonas configuradas</div>';
            return;
        }

        let html = '';
        for (const z of state.zones) {
            const count = (occupancies && occupancies[z.name] !== undefined) ? occupancies[z.name] : 0;
            html += `
                <div class="zone-occupancy-tile" style="border-left: 3px solid ${z.color || '#0a84ff'};">
                    <div class="zone-name-group">
                        <span class="zone-dot" style="background:${z.color || '#0a84ff'};"></span>
                        <span class="zone-name">${z.name}</span>
                    </div>
                    <span class="zone-count-badge ${count > 0 ? 'active' : ''}">${count} ${count === 1 ? 'persona' : 'personas'}</span>
                </div>
            `;
        }
        dom.zonesOccupancyList.innerHTML = html;
    }

    window.deleteZone = async (zoneId) => {
        if (!confirm('¿Eliminar esta zona espacial?')) return;
        try {
            const res = await fetch(`/api/zones/${zoneId}`, { method: 'DELETE' });
            if (res.ok) {
                await loadZones();
            } else {
                alert('No se pudo eliminar la zona.');
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    function openZonesModal() {
        dom.modalZones.classList.add('active');
        renderModalZonesList();
    }

    function closeZonesModal() {
        dom.modalZones.classList.remove('active');
    }

    // ─── Drawing Workflow ────────────────────────────────
    function startZoneDrawingFlow() {
        const name = (dom.inputZoneName.value || "").trim() || `Zona ${state.zones.length + 1}`;
        state.pendingZoneName = name;
        closeZonesModal();

        // Start overlay drawing mode with pointer-events enabled
        if (!overlay) {
            overlay = new CanvasOverlay('overlay-canvas', camera);
        }
        overlay.startDrawingZone(state.selectedZoneColor);
        overlay.onPointAdded = (count) => {
            dom.drawingPointCount.textContent = `(${count} puntos marcados)`;
        };

        // Show floating instructions bar
        dom.zoneDrawingBar.classList.remove('hidden');
        dom.drawingPointCount.textContent = '(0 puntos marcados - Toca el video)';
    }

    async function saveDrawnZoneFlow() {
        if (!overlay || overlay.drawingPoints.length < 3) {
            alert('Debes marcar al menos 3 puntos sobre el video para delimitar un polígono de zona.');
            return;
        }

        const points = overlay.finishDrawingZone();
        dom.zoneDrawingBar.classList.add('hidden');

        try {
            const res = await fetch('/api/zones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: state.pendingZoneName || 'Nueva Zona',
                    color: state.selectedZoneColor || '#0a84ff',
                    polygon: points
                })
            });

            if (res.ok) {
                dom.inputZoneName.value = '';
                await loadZones();
                addEvent(`Zona creada: [${state.pendingZoneName}]`, `${points.length} vértices poligonales registrados`);
            } else {
                const err = await res.json();
                alert(`Error al guardar zona: ${err.detail || 'Error desconocido'}`);
            }
        } catch (e) {
            alert(`Error de red: ${e.message}`);
        }
    }

    function undoZonePointFlow() {
        if (overlay) {
            const count = overlay.undoDrawingPoint();
            dom.drawingPointCount.textContent = `(${count} puntos marcados)`;
        }
    }

    function cancelZoneDrawingFlow() {
        if (overlay) {
            overlay.cancelDrawingZone();
        }
        dom.zoneDrawingBar.classList.add('hidden');
    }

    // ═══════════════════════════════════════════════════════
    // SESSIONS HISTORY MODAL (SQLITE VIEWER)
    // ═══════════════════════════════════════════════════════

    async function openHistoryModal() {
        dom.modalHistory.classList.add('active');
        dom.historyContainer.innerHTML = '<div class="persons-empty">Cargando sesiones desde SQLite...</div>';

        try {
            const res = await fetch('/api/sessions');
            if (!res.ok) throw new Error('Error al consultar sesiones');
            const data = await res.json();
            const sessions = data.sessions || [];

            dom.historyCount.textContent = sessions.length;

            if (sessions.length === 0) {
                dom.historyContainer.innerHTML = `
                    <div class="persons-empty">
                        No hay sesiones registradas todavía.<br>
                        Inicia una sesión de observación y haz clic en "Finalizar" para almacenarla.
                    </div>
                `;
                return;
            }

            let html = '';
            for (const s of sessions) {
                const dateStr = s.started_at ? new Date(s.started_at * 1000).toLocaleString() : s.created_at;
                const durMin = (s.duration_seconds / 60).toFixed(1);
                const hasVideo = !!s.video_path;
                const videoBadge = hasVideo 
                    ? '<span class="tag tag-sm" style="background:rgba(48,209,88,0.22); color:#30d158; border:0.5px solid rgba(48,209,88,0.45); font-size:0.7rem; padding:2px 8px; border-radius:10px;">🎬 Video Grabado</span>'
                    : '';

                html += `
                    <div class="session-card">
                        <div class="session-card-header">
                            <div>
                                <span class="session-title">${s.name}</span>
                                <span class="session-date"> • ID: ${s.id}</span>
                                ${videoBadge}
                            </div>
                            <span class="session-date">${dateStr}</span>
                        </div>
                        <div class="session-metrics">
                            <div class="session-metric-item">
                                <span>Duración</span>
                                <strong>${durMin} min</strong>
                            </div>
                            <div class="session-metric-item">
                                <span>Total Cuerpos</span>
                                <strong>${s.total_persons}</strong>
                            </div>
                            <div class="session-metric-item">
                                <span>Pico Simultáneo</span>
                                <strong>${s.max_concurrent}</strong>
                            </div>
                            <div class="session-metric-item">
                                <span>FPS Medio</span>
                                <strong>${s.avg_fps}</strong>
                            </div>
                        </div>
                        <div class="session-actions">
                            <button class="btn btn-xs btn-session-heatmap" onclick="viewSessionHeatmap('${s.id}')" title="Reproducir video y mapas de calor interactivos">
                                ${hasVideo ? '🎬 Reproducir Video & Heatmap' : '🔥 Ver Heatmap'}
                            </button>
                            <button class="btn btn-xs btn-secondary" onclick="viewSessionZoneMetrics('${s.id}')" title="Consultar permanencias, picos de ocupación y flujo por zona">
                                📊 Métricas de Zona
                            </button>
                            <button class="btn btn-xs btn-session-rhythms" onclick="viewSessionRhythms('${s.id}')" title="Analizar cadencia de oleadas, picos y ritmo espacial">
                                ⏱️ Ritmos Espaciales
                            </button>
                            <button class="btn btn-xs btn-secondary" onclick="downloadSessionPoints('${s.id}')">
                                📥 Exportar JSON
                            </button>
                            <button class="btn btn-xs btn-danger" onclick="deleteSession('${s.id}')">
                                🗑️ Eliminar
                            </button>
                        </div>
                    </div>
                `;
            }

            dom.historyContainer.innerHTML = html;

        } catch (e) {
            console.error('[App] Error loading history:', e);
            dom.historyContainer.innerHTML = `<div class="persons-empty">Error al cargar historial: ${e.message}</div>`;
        }
    }

    function closeHistoryModal() {
        dom.modalHistory.classList.remove('active');
    }

    function formatTime(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        if (m >= 60) {
            const h = Math.floor(m / 60);
            const remM = m % 60;
            return `${String(h).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function initTimelinePlayer() {
        if (!timeline) {
            timeline = new TimelinePlayer({
                heatmap: heatmap,
                overlay: overlay,
                videoElement: dom.replayVideo,
                onTimeUpdate: (info) => {
                    dom.timelineCurrentTime.textContent = formatTime(info.currentTime);
                    dom.timelineTotalDuration.textContent = formatTime(info.duration);
                    dom.timelineScrubber.value = info.currentTime;
                    dom.timelineScrubber.max = info.duration;
                    const videoTag = info.hasVideo ? ' • 🎬 Video Sincronizado' : '';
                    dom.timelinePointsStat.textContent = `${info.pointsCount} puntos • ${info.activePersonsCount} personas${videoTag}`;
                    dom.timelinePlayIcon.textContent = info.isPlaying ? '⏸' : '▶';

                    if (info.zoneCounts) {
                        updateZonesOccupancy(info.zoneCounts);
                    }
                },
                onStateChange: (info) => {
                    if (info.isPlaying !== undefined) {
                        dom.timelinePlayIcon.textContent = info.isPlaying ? '⏸' : '▶';
                    }
                    if (info.duration !== undefined) {
                        dom.timelineScrubber.max = info.duration;
                        dom.timelineTotalDuration.textContent = formatTime(info.duration);
                    }
                    if (info.session && info.session.name) {
                        dom.timelineSessionName.textContent = info.session.name;
                    }
                }
            });
        }
    }

    // Global action helpers for the modal buttons
    window.viewSessionHeatmap = async (sessionId) => {
        try {
            if (!heatmap) {
                heatmap = new HeatmapRenderer('heatmap-canvas', camera);
            }
            if (!overlay) {
                overlay = new CanvasOverlay('overlay-canvas', camera);
            }
            overlay.setZones(state.zones);

            if (camera.isActive) {
                camera.pauseCapture();
            }
            dom.cameraPlaceholder.classList.add('hidden');
            if (dom.replayModeBadge) dom.replayModeBadge.classList.remove('hidden');

            const [metaRes, pointsRes] = await Promise.all([
                fetch(`/api/sessions/${sessionId}`),
                fetch(`/api/analytics/sessions/${sessionId}/heatmap?limit=50000`)
            ]);

            if (!pointsRes.ok) throw new Error('Error al consultar coordenadas del mapa de calor');
            const data = await pointsRes.json();
            const metaData = metaRes.ok ? await metaRes.json() : { session: {} };
            const session = metaData.session || { id: sessionId, name: `Sesión ${sessionId}` };

            initTimelinePlayer();
            await timeline.loadSession(session, data.points);

            updateHeatmapPersonSelector();
            setHeatmapMode('presence');

            // Show floating bars
            dom.heatmapFloatingBar.classList.remove('hidden');
            dom.timelinePlayerBar.classList.remove('hidden');
            dom.btnHeatmaps.classList.add('active');

            // Reset layer pill active styles
            if (dom.toggleLayerHeatmap) dom.toggleLayerHeatmap.classList.toggle('active', timeline.layers.heatmap);
            if (dom.toggleLayerTrajectories) dom.toggleLayerTrajectories.classList.toggle('active', timeline.layers.trajectories);
            if (dom.toggleLayerZones) dom.toggleLayerZones.classList.toggle('active', timeline.layers.zones);
            if (dom.toggleLayerLabels) dom.toggleLayerLabels.classList.toggle('active', timeline.layers.labels);
            if (dom.toggleLayerGrid) dom.toggleLayerGrid.classList.toggle('active', timeline.layers.grid);

            closeHistoryModal();
            addEvent('Reproductor Histórico', `Sesión [${session.name}]: ${data.count} coordenadas sincronizadas con video`);
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    window.downloadSessionPoints = async (sessionId) => {
        try {
            const res = await fetch(`/api/sessions/${sessionId}/points?limit=25000`);
            if (!res.ok) throw new Error('Error al descargar coordenadas');
            const data = await res.json();

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${sessionId}_spatial_points.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    window.deleteSession = async (sessionId) => {
        if (!confirm(`¿Eliminar la sesión ${sessionId} y todos sus datos de coordenadas espaciales?`)) {
            return;
        }
        try {
            const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
            if (res.ok) {
                openHistoryModal();
                refreshHistoryCount();
            } else {
                alert('No se pudo eliminar la sesión.');
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    window.viewSessionZoneMetrics = async (sessionId) => {
        try {
            dom.modalZoneMetrics.classList.add('active');
            dom.zoneMetricsContainer.innerHTML = '<div class="persons-empty">Analizando permanencias y tiempos de ocupación...</div>';

            const res = await fetch(`/api/analytics/sessions/${sessionId}/zones`);
            if (!res.ok) throw new Error('No se pudieron obtener las métricas de zona');
            const data = await res.json();
            const session = data.session || {};
            const metrics = data.metrics || {};
            const zones = metrics.zones || [];
            const transitions = metrics.transitions || {};

            const durMin = ((session.duration_seconds || metrics.duration_seconds || 1) / 60).toFixed(1);

            let html = `
                <div class="zone-metrics-overview-bar">
                    <div>
                        <div class="session-name">📍 ${session.name || sessionId}</div>
                        <div class="session-duration">ID: ${sessionId} • Duración: ${durMin} min</div>
                    </div>
                    <div class="session-metrics" style="border:none; padding:0; margin:0; background:none;">
                        <div class="session-metric-item" style="background:rgba(0,0,0,0.35);">
                            <span>Zonas con Datos</span>
                            <strong>${zones.length}</strong>
                        </div>
                    </div>
                </div>
            `;

            if (zones.length === 0) {
                html += `
                    <div class="persons-empty">
                        No se registraron permanencias en zonas poligonales durante esta sesión.<br>
                        Asegúrate de definir zonas en el menú "Zonas" antes o durante la observación.
                    </div>
                `;
            } else {
                html += '<div class="zone-metrics-grid">';
                for (const z of zones) {
                    const zoneObj = state.zones.find(item => item.name === z.zone);
                    const color = zoneObj ? zoneObj.color : '#0a84ff';
                    const occRate = z.occupancy_rate_percent || 0;

                    html += `
                        <div class="zone-stat-card">
                            <div class="zone-stat-header">
                                <div class="zone-stat-title">
                                    <span class="zone-color-indicator" style="background:${color}; color:${color};"></span>
                                    <span>${z.zone}</span>
                                </div>
                                <span class="tag tag-sm" style="background:${color}22; color:${color}; border:0.5px solid ${color}55;">
                                    ${z.visits_count} ${z.visits_count === 1 ? 'visita' : 'visitas'}
                                </span>
                            </div>

                            <div class="zone-stat-pills">
                                <div class="zone-stat-pill-item">
                                    <span class="label">Estadía Media</span>
                                    <span class="val">${z.avg_dwell_seconds}s</span>
                                </div>
                                <div class="zone-stat-pill-item">
                                    <span class="label">Estadía Máx.</span>
                                    <span class="val">${z.max_dwell_seconds}s</span>
                                </div>
                                <div class="zone-stat-pill-item">
                                    <span class="label">Pico Simultáneo</span>
                                    <span class="val">${z.peak_occupancy}</span>
                                </div>
                            </div>

                            <div class="zone-progress-section">
                                <div class="zone-progress-labels">
                                    <span>Tasa de Ocupación Temporal</span>
                                    <strong>${occRate}% (${Math.round(z.occupancy_seconds)}s)</strong>
                                </div>
                                <div class="zone-progress-track">
                                    <div class="zone-progress-fill" style="width: ${Math.min(100, occRate)}%; background: ${color};"></div>
                                </div>
                            </div>

                            <div style="font-size:0.75rem; color:var(--text-tertiary); display:flex; justify-content:space-between; margin-top:2px;">
                                <span>Tiempo Total Acumulado:</span>
                                <strong style="color:#ffffff;">${Math.round(z.total_dwell_seconds)}s</strong>
                            </div>
                        </div>
                    `;
                }
                html += '</div>';

                // Inter-zone flow transitions
                const transitionList = [];
                for (const [fromZ, toMap] of Object.entries(transitions)) {
                    for (const [toZ, count] of Object.entries(toMap)) {
                        transitionList.push({ from: fromZ, to: toZ, count });
                    }
                }
                transitionList.sort((a, b) => b.count - a.count);

                if (transitionList.length > 0) {
                    html += `
                        <div class="transitions-flow-card">
                            <div class="transitions-flow-title">
                                <span>🔄</span>
                                <span>Matriz de Flujo y Transiciones entre Zonas</span>
                            </div>
                            <div class="transitions-flow-list">
                    `;
                    for (const tr of transitionList) {
                        html += `
                            <div class="transition-chip">
                                <span>${tr.from} ➔ ${tr.to}</span>
                                <strong>${tr.count} ${tr.count === 1 ? 'paso' : 'pasos'}</strong>
                            </div>
                        `;
                    }
                    html += `
                            </div>
                        </div>
                    `;
                }
            }

            dom.zoneMetricsContainer.innerHTML = html;
        } catch (e) {
            console.error('[ZoneMetrics] Error:', e);
            dom.zoneMetricsContainer.innerHTML = `<div class="persons-empty">Error al cargar métricas: ${e.message}</div>`;
        }
    };

    // ═══════════════════════════════════════════════════════
    // PHASE 6: TEMPORAL RHYTHMS & WAVE CADENCE
    // ═══════════════════════════════════════════════════════

    function renderRhythmTimelineCanvas(timeline, peaks, valleys) {
        const canvas = document.getElementById('rhythm-timeline-canvas');
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = (rect.width || 800) * dpr;
        const h = (rect.height || 200) * dpr;

        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const width = w / dpr;
        const height = h / dpr;

        ctx.clearRect(0, 0, width, height);

        if (!timeline || timeline.length === 0) {
            ctx.fillStyle = '#8e8e93';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sin datos temporales para esta sesión', width / 2, height / 2);
            return;
        }

        const padding = { top: 25, right: 30, bottom: 35, left: 45 };
        const chartW = width - padding.left - padding.right;
        const chartH = height - padding.top - padding.bottom;

        const maxCount = Math.max(2, ...timeline.map(d => Math.max(d.total_count || 0, d.moving_count || 0, d.stopped_count || 0)));
        const nPoints = timeline.length;
        const totalDuration = timeline[nPoints - 1].t || (nPoints * 5);

        const getX = (t) => padding.left + (t / Math.max(1, totalDuration)) * chartW;
        const getY = (val) => padding.top + chartH - (val / maxCount) * chartH;

        // 1. Draw Valleys / Lulls (Translucent grey bars)
        if (valleys && valleys.length > 0) {
            for (const v of valleys) {
                const x1 = Math.max(padding.left, getX(v.start_t));
                const x2 = Math.min(padding.left + chartW, getX(v.end_t));
                const barW = Math.max(4, x2 - x1);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.fillRect(x1, padding.top, barW, chartH);

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.setLineDash([3, 3]);
                ctx.strokeRect(x1, padding.top, barW, chartH);
                ctx.setLineDash([]);

                if (barW > 40) {
                    ctx.fillStyle = 'rgba(235, 235, 245, 0.45)';
                    ctx.font = '10px var(--font-mono, monospace)';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Valle ${v.duration_seconds}s`, x1 + barW / 2, padding.top + 14);
                }
            }
        }

        // 2. Horizontal Gridlines & Y-axis labels
        const ySteps = maxCount <= 5 ? maxCount : 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#8e8e93';
        ctx.font = '10px var(--font-mono, monospace)';
        ctx.textAlign = 'right';

        for (let i = 0; i <= ySteps; i++) {
            const val = (maxCount / ySteps) * i;
            const y = getY(val);

            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartW, y);
            ctx.stroke();

            ctx.fillText(`${Math.round(val)}p`, padding.left - 8, y + 3);
        }

        // 3. X-axis Time Labels
        ctx.textAlign = 'center';
        const numTicks = Math.min(nPoints, 6);
        for (let i = 0; i < numTicks; i++) {
            const idx = Math.floor(i * (nPoints - 1) / Math.max(1, numTicks - 1));
            const pt = timeline[idx];
            const x = getX(pt.t);

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.moveTo(x, padding.top + chartH);
            ctx.lineTo(x, padding.top + chartH + 5);
            ctx.stroke();

            ctx.fillText(pt.time_label, x, padding.top + chartH + 18);
        }

        // 4. Gradient Fill Area for Total Count
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + chartH);
        for (let i = 0; i < nPoints; i++) {
            const x = getX(timeline[i].t);
            const y = getY(timeline[i].total_count);
            ctx.lineTo(x, y);
        }
        ctx.lineTo(padding.left + chartW, padding.top + chartH);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        grad.addColorStop(0, 'rgba(191, 90, 242, 0.35)');
        grad.addColorStop(1, 'rgba(191, 90, 242, 0.01)');
        ctx.fillStyle = grad;
        ctx.fill();

        // 5. Curve: Stopped Count (dashed orange line)
        ctx.beginPath();
        ctx.strokeStyle = '#ff9f0a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        for (let i = 0; i < nPoints; i++) {
            const x = getX(timeline[i].t);
            const y = getY(timeline[i].stopped_count);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // 6. Curve: Moving Count (green line)
        ctx.beginPath();
        ctx.strokeStyle = '#30d158';
        ctx.lineWidth = 1.8;
        for (let i = 0; i < nPoints; i++) {
            const x = getX(timeline[i].t);
            const y = getY(timeline[i].moving_count);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 7. Curve: Total Count (solid purple line with glow)
        ctx.beginPath();
        ctx.strokeStyle = '#bf5af2';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(191, 90, 242, 0.5)';
        ctx.shadowBlur = 6;
        for (let i = 0; i < nPoints; i++) {
            const x = getX(timeline[i].t);
            const y = getY(timeline[i].total_count);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 8. Peaks: Highlight Markers & Badges
        if (peaks && peaks.length > 0) {
            for (const p of peaks) {
                const px = getX(p.t);
                const py = getY(p.count);

                // Vertical peak pin line
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(100, 210, 255, 0.45)';
                ctx.setLineDash([2, 2]);
                ctx.moveTo(px, py);
                ctx.lineTo(px, padding.top + chartH);
                ctx.stroke();
                ctx.setLineDash([]);

                // Peak circle dot
                ctx.beginPath();
                ctx.arc(px, py, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = '#64d2ff';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Peak count badge above pin
                const label = `${p.count}p` + (p.dominant_zone ? ` [${p.dominant_zone}]` : '');
                ctx.font = 'bold 9px var(--font-mono, monospace)';
                const txtW = ctx.measureText(label).width;
                const bx = Math.max(padding.left, Math.min(padding.left + chartW - txtW - 10, px - (txtW + 10) / 2));
                const by = Math.max(padding.top - 18, py - 18);

                ctx.fillStyle = 'rgba(28, 28, 30, 0.88)';
                ctx.strokeStyle = 'rgba(100, 210, 255, 0.6)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(bx, by, txtW + 10, 14, 4);
                } else {
                    ctx.rect(bx, by, txtW + 10, 14);
                }
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#64d2ff';
                ctx.textAlign = 'left';
                ctx.fillText(label, bx + 5, by + 10);
            }
        }
    }

    window.viewSessionRhythms = async (sessionId, bucketSeconds = 5) => {
        try {
            dom.modalRhythms.classList.add('active');
            dom.rhythmsContainer.innerHTML = '<div class="persons-empty">Analizando ritmos temporales, picos y cadencia de oleadas...</div>';

            const res = await fetch(`/api/analytics/sessions/${sessionId}/rhythms?bucket_seconds=${bucketSeconds}`);
            if (!res.ok) throw new Error('No se pudieron obtener los datos de ritmos temporales');
            const data = await res.json();
            const session = data.session || {};
            const rhythms = data.rhythms || {};
            const timeline = rhythms.timeline || [];
            const summary = rhythms.rhythm_summary || {};
            const peaks = rhythms.peaks || [];
            const valleys = rhythms.valleys || [];
            const zoneRhythms = rhythms.zone_rhythms || {};

            const durMin = ((rhythms.duration_seconds || session.duration_seconds || 1) / 60).toFixed(1);
            const activeResolution = rhythms.bucket_seconds || bucketSeconds;

            let html = `
                <div class="rhythm-overview-bar">
                    <div>
                        <div class="session-name">⏱️ ${session.name || sessionId}</div>
                        <div class="session-duration">ID: ${sessionId} • Duración: ${durMin} min • Ventana: ${activeResolution}s</div>
                    </div>
                    <div class="rhythm-bucket-selector">
                        <span class="rhythm-bucket-label">Resolución:</span>
                        <button type="button" class="btn-rhythm-bucket ${activeResolution === 1 ? 'active' : ''}" data-bucket="1">1s</button>
                        <button type="button" class="btn-rhythm-bucket ${activeResolution === 5 ? 'active' : ''}" data-bucket="5">5s</button>
                        <button type="button" class="btn-rhythm-bucket ${activeResolution === 15 ? 'active' : ''}" data-bucket="15">15s</button>
                        <button type="button" class="btn-rhythm-bucket ${activeResolution === 30 ? 'active' : ''}" data-bucket="30">30s</button>
                    </div>
                </div>

                <div class="rhythm-classification-card">
                    <div class="rhythm-classification-left">
                        <div class="rhythm-classification-badge">
                            <span class="pulse-orb"></span>
                            <span>${summary.classification || 'Ritmo Espacial'}</span>
                        </div>
                        <div class="rhythm-classification-desc">
                            ${summary.description || 'Dinámica temporal observada en el espacio.'}
                        </div>
                    </div>
                    <div class="session-metrics" style="border:none; padding:0; margin:0; background:none;">
                        <div class="session-metric-item" style="background:rgba(0,0,0,0.4);">
                            <span>Oleadas / Picos</span>
                            <strong>${peaks.length}</strong>
                        </div>
                    </div>
                </div>

                <div class="rhythm-kpis-grid">
                    <div class="rhythm-kpi-card">
                        <span class="rhythm-kpi-label">Cadencia Media</span>
                        <div class="rhythm-kpi-value">
                            ${summary.avg_cadence_seconds !== null && summary.avg_cadence_seconds !== undefined ? summary.avg_cadence_seconds : '--'}<span class="rhythm-kpi-unit">s</span>
                        </div>
                        <span class="rhythm-kpi-sub">Intervalo entre oleadas</span>
                    </div>

                    <div class="rhythm-kpi-card">
                        <span class="rhythm-kpi-label">Coef. Variación (CV)</span>
                        <div class="rhythm-kpi-value">${summary.coefficient_of_variation ?? '0.00'}</div>
                        <span class="rhythm-kpi-sub">${(summary.coefficient_of_variation || 0) > 0.6 ? 'Alta fluctuación' : 'Flujo regular'}</span>
                    </div>

                    <div class="rhythm-kpi-card">
                        <span class="rhythm-kpi-label">Pico Máximo</span>
                        <div class="rhythm-kpi-value">${summary.max_peak_count || 0}<span class="rhythm-kpi-unit">pers</span></div>
                        <span class="rhythm-kpi-sub">Simultáneos en encuadre</span>
                    </div>

                    <div class="rhythm-kpi-card">
                        <span class="rhythm-kpi-label">Valle Quietud Máx</span>
                        <div class="rhythm-kpi-value">${summary.longest_lull_seconds ?? 0}<span class="rhythm-kpi-unit">s</span></div>
                        <span class="rhythm-kpi-sub">${valleys.length} valles sin presencia</span>
                    </div>

                    <div class="rhythm-kpi-card">
                        <span class="rhythm-kpi-label">Dinámica de Mov.</span>
                        <div class="rhythm-kpi-value" style="font-size:1.1rem;">
                            ${summary.movement_ratio_percent ?? 0}% <span class="rhythm-kpi-unit">/ ${summary.stopped_ratio_percent ?? 0}%</span>
                        </div>
                        <span class="rhythm-kpi-sub">Movimiento / Detenido</span>
                    </div>
                </div>

                <div class="rhythm-chart-card">
                    <div class="rhythm-chart-header">
                        <div class="rhythm-chart-title">
                            <span>📈</span>
                            <span>Cronograma de Densidad y Oleadas de Ocupación</span>
                        </div>
                        <div class="rhythm-chart-legend">
                            <span class="legend-pill"><span class="legend-dot" style="background:#bf5af2;"></span> Total Presentes</span>
                            <span class="legend-pill"><span class="legend-dot" style="background:#30d158;"></span> En Movimiento</span>
                            <span class="legend-pill"><span class="legend-dot" style="background:#ff9f0a;"></span> Detenidos</span>
                            <span class="legend-pill"><span style="color:#64d2ff; font-weight:bold;">▲</span> Picos de Oleada</span>
                            <span class="legend-pill"><span style="display:inline-block; width:12px; height:8px; background:rgba(255,255,255,0.08); border:0.5px dashed rgba(255,255,255,0.3);"></span> Valles de Quietud</span>
                        </div>
                    </div>
                    <div class="rhythm-canvas-wrap">
                        <canvas id="rhythm-timeline-canvas"></canvas>
                    </div>
                </div>
            `;

            // Zone synchronization section
            const zoneKeys = Object.keys(zoneRhythms);
            if (zoneKeys.length > 0) {
                html += `
                    <div class="rhythm-zone-sync-card">
                        <div class="rhythm-zone-sync-title">
                            <span>📐</span>
                            <span>Sincronización de Picos de Afluencia por Zona Espacial</span>
                        </div>
                        <div class="rhythm-zone-sync-grid">
                `;
                for (const zk of zoneKeys) {
                    const zInfo = zoneRhythms[zk];
                    const zColor = zInfo.color || '#0a84ff';
                    html += `
                        <div class="rhythm-zone-item" style="border-left-color: ${zColor};">
                            <div class="rhythm-zone-name">
                                <span>${zk}</span>
                                <span class="tag tag-sm" style="background:${zColor}22; color:${zColor}; border:0.5px solid ${zColor}55;">
                                    ${zInfo.active_buckets_count} intervalos
                                </span>
                            </div>
                            <div class="rhythm-zone-stat-row">
                                <span>Pico Máximo:</span>
                                <strong>${zInfo.peak_count} personas</strong>
                            </div>
                            <div class="rhythm-zone-stat-row">
                                <span>Momento del Pico:</span>
                                <strong>${zInfo.peak_time_label || 'Sin actividad'}</strong>
                            </div>
                        </div>
                    `;
                }
                html += `
                        </div>
                    </div>
                `;
            }

            dom.rhythmsContainer.innerHTML = html;

            // Bind bucket selector buttons
            const bucketBtns = dom.rhythmsContainer.querySelectorAll('.btn-rhythm-bucket');
            bucketBtns.forEach(b => {
                b.addEventListener('click', () => {
                    const sec = parseInt(b.getAttribute('data-bucket'), 10);
                    window.viewSessionRhythms(sessionId, sec);
                });
            });

            // Draw Rhythm Canvas Chart
            renderRhythmTimelineCanvas(timeline, peaks, valleys);

        } catch (e) {
            console.error('[Rhythms] Error:', e);
            dom.rhythmsContainer.innerHTML = `<div class="persons-empty">Error al analizar ritmos: ${e.message}</div>`;
        }
    };


    // ═══════════════════════════════════════════════════════
    // EVENT LISTENERS
    // ═══════════════════════════════════════════════════════

    // Camera Start / Stop
    dom.btnCamera.addEventListener('click', () => {
        if (camera.isActive) {
            camera.stop();
        } else {
            camera.start();
        }
    });

    // Multi-Camera Switcher (Cycles across all detected cameras)
    dom.btnCameraFlip.addEventListener('click', async () => {
        const label = await camera.switchCamera();
        dom.cameraFlipLabel.textContent = label;
        addEvent('Cámara cambiada', label);
    });

    // Aspect Ratio Formats
    dom.selectAspect.addEventListener('change', () => {
        const val = dom.selectAspect.value;
        if (val === '16-9') {
            dom.cameraContainer.style.aspectRatio = '16 / 9';
        } else if (val === '4-3') {
            dom.cameraContainer.style.aspectRatio = '4 / 3';
        } else {
            dom.cameraContainer.style.aspectRatio = 'auto';
        }
        if (overlay) overlay._render();
    });

    // Fullscreen Camera View
    dom.btnFullscreen.addEventListener('click', () => {
        camera.toggleFullscreen(dom.cameraContainer);
    });
    dom.btnExitFullscreen.addEventListener('click', () => {
        camera.toggleFullscreen(dom.cameraContainer);
    });

    document.addEventListener('fullscreenchange', () => {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        dom.btnExitFullscreen.classList.toggle('hidden', !isFS);
        if (overlay) overlay._render();
    });

    // Sessions Lifecycle
    dom.btnStart.addEventListener('click', startSession);
    dom.btnPause.addEventListener('click', pauseSession);
    dom.btnResume.addEventListener('click', resumeSession);
    dom.btnStop.addEventListener('click', stopSession);

    // Toggle Spatial Grid
    dom.btnGrid.addEventListener('click', () => {
        if (overlay) {
            const active = overlay.toggleGrid();
            dom.btnGrid.classList.toggle('active', active);
        }
    });

    // Zones Buttons & Modals
    dom.btnZones.addEventListener('click', openZonesModal);
    dom.btnOpenZonesModal.addEventListener('click', openZonesModal);
    dom.btnCloseZones.addEventListener('click', closeZonesModal);
    dom.modalZones.addEventListener('click', (e) => {
        if (e.target === dom.modalZones) closeZonesModal();
    });

    // Color Swatches Selection
    const swatches = document.querySelectorAll('#zone-color-swatches .swatch');
    swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            swatches.forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            state.selectedZoneColor = swatch.getAttribute('data-color');
        });
    });

    // Start Drawing Zone
    dom.btnStartDrawZone.addEventListener('click', startZoneDrawingFlow);
    dom.btnSaveZone.addEventListener('click', saveDrawnZoneFlow);
    dom.btnUndoZone.addEventListener('click', undoZonePointFlow);
    dom.btnCancelZone.addEventListener('click', cancelZoneDrawingFlow);

    // History Modal
    dom.btnOpenHistory.addEventListener('click', openHistoryModal);
    dom.btnCloseHistory.addEventListener('click', closeHistoryModal);
    dom.modalHistory.addEventListener('click', (e) => {
        if (e.target === dom.modalHistory) closeHistoryModal();
    });

    // Zone Metrics Modal (Phase 5)
    if (dom.btnCloseZoneMetrics) {
        dom.btnCloseZoneMetrics.addEventListener('click', () => {
            dom.modalZoneMetrics.classList.remove('active');
        });
    }
    if (dom.modalZoneMetrics) {
        dom.modalZoneMetrics.addEventListener('click', (e) => {
            if (e.target === dom.modalZoneMetrics) {
                dom.modalZoneMetrics.classList.remove('active');
            }
        });
    }

    // Rhythms Modal (Phase 6)
    if (dom.btnCloseRhythms) {
        dom.btnCloseRhythms.addEventListener('click', () => {
            dom.modalRhythms.classList.remove('active');
        });
    }
    if (dom.modalRhythms) {
        dom.modalRhythms.addEventListener('click', (e) => {
            if (e.target === dom.modalRhythms) {
                dom.modalRhythms.classList.remove('active');
            }
        });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 4: HEATMAPS & TRAJECTORIES EVENT LISTENERS
    // ═══════════════════════════════════════════════════════

    function setHeatmapMode(mode) {
        if (!heatmap) {
            heatmap = new HeatmapRenderer('heatmap-canvas', camera);
        }
        heatmap.setMode(mode);
        dom.heatmapSegments.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
        });
        if (mode === 'off') {
            dom.btnHeatmaps.classList.remove('active');
        } else {
            dom.btnHeatmaps.classList.add('active');
        }
    }

    function updateHeatmapPersonSelector() {
        if (!heatmap) return;
        const currentVal = dom.heatmapPersonSelect.value;
        const pids = heatmap.getUniquePersons();
        let optionsHtml = '<option value="all">Todas</option>';
        for (const pid of pids) {
            const label = `P${pid < 10 ? '0' : ''}${pid}`;
            optionsHtml += `<option value="${pid}" ${String(pid) === currentVal ? 'selected' : ''}>${label}</option>`;
        }
        dom.heatmapPersonSelect.innerHTML = optionsHtml;
    }

    // Toggle Heatmap Bar
    dom.btnHeatmaps.addEventListener('click', () => {
        const isHidden = dom.heatmapFloatingBar.classList.contains('hidden');
        if (isHidden) {
            dom.heatmapFloatingBar.classList.remove('hidden');
            if (!heatmap || heatmap.mode === 'off') {
                setHeatmapMode('presence');
            }
        } else {
            dom.heatmapFloatingBar.classList.add('hidden');
        }
    });

    // Segmented Mode Buttons
    dom.heatmapSegments.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            setHeatmapMode(mode);
            if (mode === 'off') {
                dom.heatmapFloatingBar.classList.add('hidden');
            }
        });
    });

    // Sliders & Filters
    dom.heatmapOpacityRange.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        dom.heatmapOpacityVal.textContent = Math.round(val * 100) + '%';
        if (heatmap) heatmap.setOpacity(val);
    });

    dom.heatmapRadiusRange.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        dom.heatmapRadiusVal.textContent = val + 'px';
        if (heatmap) heatmap.setRadius(val);
    });

    dom.heatmapPersonSelect.addEventListener('change', (e) => {
        if (heatmap) heatmap.setPersonFilter(e.target.value);
    });

    dom.heatmapWindowSelect.addEventListener('change', (e) => {
        if (heatmap) heatmap.setTimeWindow(e.target.value);
    });

    dom.btnHeatmapReset.addEventListener('click', () => {
        if (heatmap) {
            heatmap.resetPoints();
            updateHeatmapPersonSelector();
            addEvent('Heatmap reiniciado', 'Acumulación de coordenadas puesta a cero');
        }
    });

    dom.btnHeatmapExport.addEventListener('click', () => {
        if (heatmap) {
            heatmap.exportSnapshot();
            addEvent('Captura exportada', 'Imagen PNG del mapa de calor descargada');
        }
    });

    // ═══════════════════════════════════════════════════════
    // TIMELINE PLAYER EVENT LISTENERS (HISTORICAL REPLAY)
    // ═══════════════════════════════════════════════════════

    // Scrubber scrubbing
    dom.timelineScrubber.addEventListener('input', (e) => {
        if (timeline) {
            timeline.seekTo(parseFloat(e.target.value));
        }
    });

    // Play / Pause
    dom.btnTimelinePlay.addEventListener('click', () => {
        if (timeline) {
            timeline.togglePlay();
        }
    });

    // Restart (00:00)
    dom.btnTimelineRestart.addEventListener('click', () => {
        if (timeline) {
            timeline.restart();
        }
    });

    // Step back 1s
    dom.btnTimelineStepBack.addEventListener('click', () => {
        if (timeline) {
            timeline.step(-1);
        }
    });

    // Step forward 1s
    dom.btnTimelineStepFwd.addEventListener('click', () => {
        if (timeline) {
            timeline.step(1);
        }
    });

    // Return to Live Camera / Close Timeline Player
    dom.btnTimelineClose.addEventListener('click', exitReplayAndReturnToLive);
    if (dom.btnExitReplayFloating) {
        dom.btnExitReplayFloating.addEventListener('click', exitReplayAndReturnToLive);
    }

    // Clean / Cinema Mode (Hide Panels to maximize video view)
    if (dom.btnTimelineToggleClean) {
        dom.btnTimelineToggleClean.addEventListener('click', () => {
            if (timeline) timeline.toggleCleanMode(true);
        });
    }
    if (dom.btnTimelineRestoreControls) {
        dom.btnTimelineRestoreControls.addEventListener('click', () => {
            if (timeline) timeline.toggleCleanMode(false);
        });
    }

    // Interactive Layer Toggles (Heatmap, Trajectories, Zones, Labels, Grid)
    const layerButtons = [
        { btn: dom.toggleLayerHeatmap, name: 'heatmap' },
        { btn: dom.toggleLayerTrajectories, name: 'trajectories' },
        { btn: dom.toggleLayerZones, name: 'zones' },
        { btn: dom.toggleLayerLabels, name: 'labels' },
        { btn: dom.toggleLayerGrid, name: 'grid' },
    ];
    layerButtons.forEach(({ btn, name }) => {
        if (btn) {
            btn.addEventListener('click', () => {
                if (timeline) {
                    const active = timeline.toggleLayer(name);
                    btn.classList.toggle('active', active);
                }
            });
        }
    });

    // Timeline Mode Toggle (Cumulative vs Window)
    dom.btnTimelineModeCum.addEventListener('click', () => {
        dom.btnTimelineModeCum.classList.add('active');
        dom.btnTimelineModeWin.classList.remove('active');
        if (timeline) timeline.setMode('cumulative');
    });

    dom.btnTimelineModeWin.addEventListener('click', () => {
        dom.btnTimelineModeWin.classList.add('active');
        dom.btnTimelineModeCum.classList.remove('active');
        if (timeline) timeline.setMode('window');
    });

    // Playback Speed Selector (0.5x, 1x, 2x, 4x)
    dom.timelineSpeedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dom.timelineSpeedBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const speed = parseFloat(btn.getAttribute('data-speed'));
            if (timeline) timeline.setPlaybackSpeed(speed);
        });
    });

    // FPS / Quality changes
    dom.selectFPS.addEventListener('change', () => {
        const fps = parseInt(dom.selectFPS.value, 10);
        camera.setAnalysisFPS(fps);
    });

    dom.selectQuality.addEventListener('change', () => {
        const quality = parseFloat(dom.selectQuality.value);
        camera.setJPEGQuality(quality);
    });

})();
