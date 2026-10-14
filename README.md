# 🔬 Ritmos — Spatial Rhythm Observer (Fase 6)

Sistema de investigación y observación de espacios físicos mediante visión computacional, persistencia SQLite, análisis de permanencias por zona, ritmos temporales recurrentes y mapas de calor interactivos.

**Fase 6:** Ritmos Temporales + Cadencia de Oleadas + Detección de Picos y Valles + Clasificación de Ritmo Espacial + Sincronización Interzonal + Grabación y Reproducción de Video Sincronizada

---

## 📦 Requisitos Previos

- **Python 3.10 o superior** — [Descargar](https://www.python.org/downloads/)
- **pip** (incluido con Python)
- **Navegador moderno** (Chrome, Edge, Firefox)
- Conexión WiFi si usas el teléfono como cámara

### Hardware Recomendado
- **Mínimo:** CPU 4 cores, 8 GB RAM (YOLO11n, ~5-8 FPS)
- **Recomendado:** GPU NVIDIA con CUDA (YOLO11s, ~25+ FPS)

---

## 🚀 Instalación

### 1. Abrir terminal en la carpeta del proyecto

```powershell
cd "c:\Users\20050\OneDrive\Documentos\VISUAL LIZ\CAMARA DE SEGURIDAD"
```

### 2. Crear entorno virtual (recomendado)

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 3. Instalar dependencias

```powershell
pip install -r server/requirements.txt
```

> ⚠️ La primera vez que ejecutes el servidor, se descargará automáticamente el modelo YOLO11n (~6 MB). Requiere conexión a internet.

---

## ▶️ Ejecutar

```powershell
cd server
python main.py
```

Verás en la terminal:
```
============================================================
  🔬 SPATIAL RHYTHM OBSERVER — Phase 1
============================================================
  Server: http://0.0.0.0:8000
  Frontend: http://localhost:8000
  WebSocket: ws://localhost:8000/ws/vision
  Health: http://localhost:8000/api/health
============================================================
```

### Abrir en el navegador

- **En la misma PC:** http://localhost:8000
- **Desde el teléfono (misma red WiFi):** http://[IP-DE-TU-PC]:8000
  - Para encontrar tu IP: `ipconfig` en PowerShell → busca "IPv4 Address"

---

## 🧪 Cómo Probar que Funciona

### Paso 1: Verificar servidor
Abre http://localhost:8000/api/health en el navegador. Debe mostrar:
```json
{"status": "ok", "version": "0.1.0", "phase": 1}
```

### Paso 2: Abrir la aplicación
Abre http://localhost:8000 — verás el dashboard oscuro con el mensaje "Presiona Iniciar Cámara para comenzar".

### Paso 3: Activar la cámara
Haz clic en **📷 Cámara**. El navegador pedirá permiso — acéptalo. Verás el video de tu cámara.

### Paso 4: Iniciar observación
Haz clic en **▶ Iniciar**. El sistema:
1. Se conecta al servidor via WebSocket
2. Comienza a enviar frames
3. El servidor detecta personas con YOLO11
4. ByteTrack asigna IDs anónimos (P01, P02...)
5. Los resultados se dibujan sobre el video como círculos coloreados con etiquetas

### Paso 5: Verificar detecciones
- Apunta la cámara a personas
- Deberías ver **círculos coloreados** con etiquetas (P01, P02...) sobre cada persona
- El panel derecho muestra estadísticas en tiempo real
- Los eventos de entrada/salida aparecen en el log

---

## 📁 Estructura de Archivos

```
CAMARA DE SEGURIDAD/
├── server/                     # Backend Python
│   ├── api/
│   │   ├── __init__.py
│   │   └── websocket.py       # WebSocket endpoint
│   ├── cv/
│   │   ├── __init__.py
│   │   └── frame_processor.py # YOLO11 + ByteTrack pipeline
│   ├── config.py               # Configuración central
│   ├── main.py                 # Entry point del servidor
│   └── requirements.txt        # Dependencias Python
│
├── client/                     # Frontend Web
│   ├── css/
│   │   └── main.css            # Estilos (tema oscuro premium)
│   ├── js/
│   │   ├── app.js              # Lógica principal
│   │   ├── camera.js           # Gestión de cámara
│   │   ├── canvas-overlay.js   # Renderizado de detecciones
│   │   └── websocket.js        # Comunicación WebSocket
│   └── index.html              # Página principal
│
└── README.md                   # Este archivo
```

---

## ⚙️ Configuración

### Desde la interfaz
- **FPS análisis:** 1-10 FPS (selector en la barra de controles)
- **Calidad:** Baja/Media/Alta (afecta ancho de banda)

### Variables de entorno (server)
```powershell
$env:YOLO_MODEL = "yolo11s.pt"      # Modelo más preciso (requiere más potencia)
$env:YOLO_CONFIDENCE = "0.3"         # Umbral de confianza (0.0-1.0)
$env:PORT = "8000"                   # Puerto del servidor
```

---

## 🐛 Solución de Problemas

| Problema | Solución |
|:--|:--|
| "No se encontró una cámara" | Verifica que otro programa no esté usando la cámara |
| "Permiso denegado" | Habilita el acceso a cámara en la configuración del navegador |
| Detecciones lentas | Reduce FPS a 2-3; usa YOLO11n (por defecto) |
| No se conecta el WebSocket | Verifica que el servidor esté corriendo; revisa la consola del navegador (F12) |
| Desde el teléfono no carga | Verifica que ambos dispositivos estén en la misma red WiFi |
| Error HTTPS requerido para cámara | Chrome requiere HTTPS para getUserMedia en dispositivos remotos. Usa `chrome://flags` → "Insecure origins treated as secure" → agrega `http://[IP]:8000` |

---

## 📌 Estado de Fases

### ✅ Fase 1 — Captura, Detección & Tracking en Tiempo Real
- [x] Acceso a cámara desde navegador o móvil
- [x] Detección anónima de cuerpos con YOLO11
- [x] Tracking multi-persona con ByteTrack e IDs anónimos (P01, P02...)
- [x] Streaming WebSocket binario de bajo consumo
- [x] Bounding boxes tácticos en esquina y estelas de trayectoria

### ✅ Fase 2 — Persistencia Espacial, SQLite & Modo Oscuro Cyber-Observatory
- [x] Base de datos SQLite (`spatial_data.db`) con esquema optimizado WAL
- [x] Registro persistente de sesiones con nombre de espacio, duración y métricas
- [x] Almacenamiento continuo de coordenadas espaciales normalizadas `(X, Y)`, velocidad y dirección
- [x] Resumen por persona anónima (`dwell_time`, velocidad media, distancia recorrida)
- [x] API REST `/api/sessions` para consultar, exportar JSON y eliminar sesiones
- [x] Modal de Historial de Sesiones en la interfaz
- [x] Cuadrícula táctica de coordenadas espaciales activable (`▦ Cuadrícula`)
- [x] Tema Apple iOS / Puppertino Cupertino Dark (SF Pro, bordes squircle precisos, desenfoques translúcidos y paleta iOS)

### ✅ Fase 3 — Configuración Manual de Zonas Espaciales (Polígonos de Interés)
- [x] Herramienta interactiva para dibujar polígonos de zonas sobre el video (`📐 Zonas`)
- [x] Selector de colores iOS para zonas (Azul, Verde, Naranja, Púrpura, Rojo, Menta, Amarillo)
- [x] Algoritmo de punto en polígono (Ray Casting) en tiempo real en frontend y backend
- [x] Etiquetado automático de cuerpos con su zona activa (ej. `P01 [Entrada]`)
- [x] Panel de ocupación por zona en vivo con conteo de personas simultáneas
- [x] Registro cronológico de transiciones y flujos interzonales
- [x] Persistencia en SQLite (`spatial_zones`) y columna `zone` en `spatial_points`
- [x] API REST `/api/zones` (GET, POST, DELETE) y sincronización WebSocket
- [x] Selector de formato de cámara: Horizontal (16:9), Estándar (4:3) y Automático
- [x] Selector de cámara Trasera / Delantera (`🔄 Cambiar Cámara`) con cambio en caliente
- [x] Modo Pantalla Completa nativo (`⛶ Pantalla Completa`) con botón flotante de salida
- [x] Adaptabilidad horizontal optimizada para smartphones en orientación horizontal (Landscape)

### ✅ Fase 4 — Heatmaps Acumulativos, Recorridos y Reproductor Temporal con Video Sincronizado
- [x] Motor de renderizado de mapas de calor en canvas offscreen con paletas térmicas LUT 256
- [x] **Mapa de Presencia General**: Densidad acumulada de ocupación espacial (espectral azul-cian-verde-amarillo-rojo)
- [x] **Mapa de Permanencia / Detención**: Puntos calientes donde las personas se quedan detenidas (gradiente índigo-violeta-magenta-rojo)
- [x] **Mapa de Flujos / Movimiento**: Corredores y caminos transitados (gradiente cian-menta-oro)
- [x] **Trayectorias Vectoriales**: Reconstrucción de caminos continuos con flechas direccionales de desplazamiento, nodos de inicio y fin
- [x] Selector Segmentado estilo Apple iOS flotante (`🔥 Presencia`, `🛑 Permanencia`, `〰️ Flujos`, `↗️ Trayectorias`, `✕ Apagar`)
- [x] Sliders de ajuste de Opacidad calibrada y Radio de difusión (12px-60px)
- [x] Filtro dinámico por persona anónima (`Todas`, `P01`, `P02`...)
- [x] Filtro temporal por ventana activa (Toda la sesión, Últimos 30s, Últimos 2m, Últimos 5m)
- [x] **Grabación y Almacenamiento de Video de la Sesión**: Captura automática via MediaRecorder durante la observación y subida a `/api/sessions/{session_id}/video`
- [x] **Reproductor Histórico con Video Sincronizado**: Rebobinado segundo a segundo sincronizando el video grabado con heatmaps, trayectorias, etiquetas y conteos zonales
- [x] **Control Independiente de Capas**: Botones táctiles (`🔥 Heatmap`, `↗️ Recorridos`, `📐 Zonas`, `📍 Etiquetas`, `▦ Red`) conmutables en tiempo real sin reiniciar la reproducción
- [x] **Modo Limpio / Cinema**: Opción `👁️ Ocultar Panel` para pantalla despejada y botón flotante discreto de restauración
- [x] Exportación directa de capturas en PNG (`📸 PNG`)
- [x] API REST `/api/analytics/sessions/{session_id}/heatmap` y `/api/analytics/sessions/{session_id}/trajectories`

### ✅ Fase 5 — Permanencias por Zona y Tiempos de Ocupación Detallados
- [x] Cálculo analítico en backend (`Database.get_session_zone_metrics`):
  - **Tiempo promedio de permanencia por visita** (`avg_dwell_seconds`)
  - **Tiempo máximo y mínimo de estadía continua** (`max_dwell_seconds`, `min_dwell_seconds`)
  - **Tiempo total acumulado en cada zona** (`total_dwell_seconds`)
  - **Tasa de ocupación temporal** (`occupancy_rate_percent`): % de la sesión con personas en la zona
  - **Pico de ocupación concurrente** (`peak_occupancy`): máximo de cuerpos simultáneos
  - **Recuento de visitas** (`visits_count`) e individuos únicos
  - **Auditoría & Resiliencia**: Inclusión de todas las zonas espaciales configuradas (incluso con 0 visitas) y registro completo de visitantes con punto único
- [x] **Matriz de Flujo y Transiciones Interzonales**: Detección y conteo de desplazamientos entre zonas contiguas (ej. *Entrada ➔ Pasillo: 12 pasos*)
- [x] **Modal de Métricas de Zona**: Interfaz estilo Apple / Puppertino con tarjetas individuales, barras de progreso y chips de flujo
- [x] Endpoint REST: `GET /api/analytics/sessions/{session_id}/zones`

### ✅ Fase 6 — Detección de Ritmos y Patrones Temporales Recurrentes
- [x] **Agrupación y Bucket Temporal Parametrizable**: Muestreo adaptable en ventanas de `1s`, `5s`, `15s` y `30s` (`bucket_seconds`).
- [x] **Detección de Picos Locales (Oleadas de Afluencia)**: Identificación de máximos locales de densidad con identificación de zona dominante.
- [x] **Detección de Valles de Reposo / Quietud**: Segmentación de intervalos sin presencia o con vacancia prolongada en el espacio.
- [x] **Cadencia Promedio entre Oleadas ($\Delta t$)**: Intervalo temporal regular o intermitente entre oleadas sucesivas de afluencia.
- [x] **Clasificación Heurística y Coeficiente de Variación ($CV = \sigma / \mu$)**:
  - *Pulsante / Por Olas* ($CV > 0.60$, picos recurrentes con pausas intermedias)
  - *Continuo / Estable* ($CV \le 0.45$, densidad constante y uniforme)
  - *Tránsito Rápido* ($\ge 75\%$ en movimiento activo)
  - *Estancia / Remanso* ($\ge 60\%$ en estado estacionario o reposo)
  - *Fluctuante Mixto* (comportamiento híbrido)
- [x] **Sincronización de Picos por Zona**: Momento exacto ($t_{\text{pico}}$), nivel de afluencia máxima y cobertura temporal para cada polígono espacial configurado.
- [x] **Cronograma de Densidad Interactivo en Canvas**: Gráfico fluido con área sombreada en gradiente violeta/índigo, curvas diferenciadas de movimiento y detención, marcadores de picos y valles translúcidos.
- [x] **Modal de Ritmos Espaciales**: Selector dinámico de resolución, tarjeta de clasificación con orbe pulsante, KPIs de cadencia y sincronización interzonal.
- [x] Endpoint REST: `GET /api/analytics/sessions/{session_id}/rhythms?bucket_seconds={s}`

## ⏳ Próximas Fases
- **Fase 7:** Detección de aglomeraciones y alertas espaciales
- **Fase 8:** Comparativa entre franjas horarias y días
- **Fase 9:** Detección de interacciones y proximidad entre personas
- **Fase 10:** Exportación de informes PDF y CSV



