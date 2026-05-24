import { useState, useRef } from "react";

const PRICE_PER_TRAY = 65;
const LAB_FEE = 225;
const MARKUP = 1.4;

// ── Tooth definitions ──────────────────────────────────────────
const UPPER_TEETH = [
  { id:6,  label:"#6",  name:"UR Canine",       widthMm:7.5, heightMm:9.6 },
  { id:7,  label:"#7",  name:"UR Lateral",       widthMm:6.5, heightMm:8.3 },
  { id:8,  label:"#8",  name:"UR Central",       widthMm:8.5, heightMm:10.9 },
  { id:9,  label:"#9",  name:"UL Central",       widthMm:8.5, heightMm:10.9 },
  { id:10, label:"#10", name:"UL Lateral",       widthMm:6.5, heightMm:8.3 },
  { id:11, label:"#11", name:"UL Canine",        widthMm:7.5, heightMm:9.6 },
];

const LOWER_TEETH = [
  { id:22, label:"#22", name:"LL Canine",        widthMm:6.5, heightMm:8.3 },
  { id:23, label:"#23", name:"LL Lateral",       widthMm:6.0, heightMm:7.7 },
  { id:24, label:"#24", name:"LL Central",       widthMm:5.5, heightMm:7.1 },
  { id:25, label:"#25", name:"LR Central",       widthMm:5.5, heightMm:7.1 },
  { id:26, label:"#26", name:"LR Lateral",       widthMm:6.0, heightMm:7.7 },
  { id:27, label:"#27", name:"LR Canine",        widthMm:6.5, heightMm:8.3 },
];

// Movement limits
const ROT_MAX   = 30;
const ROT_WARN  = 20;
const ROT_FLAG  = 25;
const ROT_ATTACH= 18;
const TRANS_MAX = 4.0;

function toothTrays(placed, pixPerMm) {
  if (!placed.corrected || !placed.placed) return 0;
  const ppm = pixPerMm || 6;
  const dx = (placed.x - placed.idealX) / ppm;
  const dy = (placed.y - placed.idealY) / ppm;
  const transMm = Math.sqrt(dx*dx + dy*dy);
  const transDeg = transMm * 6;
  const total = Math.abs(placed.rot || 0) + transDeg;
  if (total === 0) return 0;
  if (total <= 5) return 1;
  return Math.ceil(total / 6);
}

function archTrays(teeth, pixPerMm) {
  const vals = teeth.map(t => toothTrays(t, pixPerMm));
  return Math.max(...vals, 0);
}

function complexity(t) {
  if (t === 0) return { label:"—", color:"#94a3b8" };
  if (t <= 3)  return { label:"Simple",   color:"#16a34a" };
  if (t <= 7)  return { label:"Moderate", color:"#d97706" };
  return             { label:"Complex",   color:"#dc2626" };
}

function rotColor(rot) {
  const r = Math.abs(rot || 0);
  if (r >= ROT_MAX)   return "#dc2626";
  if (r >= ROT_FLAG)  return "#ea580c";
  if (r >= ROT_ATTACH)return "#d97706";
  if (r >= ROT_WARN)  return "#ca8a04";
  return null;
}

// ── Photo size on screen ───────────────────────────────────────
const VW = 340;
const VH = 260;

// ── Arch Editor with tap-to-place ─────────────────────────────
function ArchEditor({ teethDefs, placements, setPlacements, photo, isUpper, title, pixPerMm, setPixPerMm }) {
  // Modes: 'place' = placing teeth one by one, 'edit' = adjusting placed teeth, 'calib' = calibrating
  const [mode,       setMode]       = useState("place");
  const [placeIdx,   setPlaceIdx]   = useState(0);
  const [selId,      setSelId]      = useState(null);
  const [showIdeal,  setShowIdeal]  = useState(true);
  const [calibStep,  setCalibStep]  = useState(0);
  const [calibPt1,   setCalibPt1]   = useState(null);
  const [calibPt2,   setCalibPt2]   = useState(null);
  const [showPhotoTools, setShowPhotoTools] = useState(false);

  // Photo adjustment controls
  const [brightness,  setBrightness]  = useState(100);  // 50–200
  const [contrast,    setContrast]    = useState(100);  // 50–200
  const [saturation,  setSaturation]  = useState(100);  // 0–200

  // Zoom & pan
  const [zoom,        setZoom]        = useState(1);    // 1–4x
  const [panX,        setPanX]        = useState(0);
  const [panY,        setPanY]        = useState(0);
  const [isPanning,   setIsPanning]   = useState(false);
  const [lastTouch,   setLastTouch]   = useState(null);
  const [pinchDist,   setPinchDist]   = useState(null);

  const svgRef = useRef();
  const containerRef = useRef();

  const sel = placements.find(p => p.id === selId);
  const placedCount = placements.filter(p => p.placed).length;
  const allPlaced = placedCount === teethDefs.length;
  const archT = archTrays(placements, pixPerMm);

  // Tooth being placed next
  const nextTooth = mode === "place" ? teethDefs[placeIdx] : null;

  function getSvgPoint(e) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = VW / rect.width;
    const scaleY = VH / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // Account for zoom and pan
    const rawX = (clientX - rect.left) * scaleX;
    const rawY = (clientY - rect.top)  * scaleY;
    return {
      x: (rawX - VW/2 - panX) / zoom + VW/2,
      y: (rawY - VH/2 - panY) / zoom + VH/2,
    };
  }

  function getPinchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      setPinchDist(getPinchDist(e.touches));
      setIsPanning(false);
    } else if (e.touches.length === 1 && zoom > 1) {
      setLastTouch({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setIsPanning(true);
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2 && pinchDist) {
      const newDist = getPinchDist(e.touches);
      const scale = newDist / pinchDist;
      setZoom(z => Math.max(1, Math.min(4, z * scale)));
      setPinchDist(newDist);
    } else if (e.touches.length === 1 && isPanning && lastTouch) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = VW / rect.width;
      const scaleY = VH / rect.height;
      const dx = (e.touches[0].clientX - lastTouch.x) * scaleX;
      const dy = (e.touches[0].clientY - lastTouch.y) * scaleY;
      setPanX(px => px + dx);
      setPanY(py => py + dy);
      setLastTouch({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  }

  function handleTouchEnd(e) {
    if (e.touches.length < 2) setPinchDist(null);
    if (e.touches.length === 0) { setIsPanning(false); setLastTouch(null); }
  }

  function resetZoom() { setZoom(1); setPanX(0); setPanY(0); }
  function resetPhoto() { setBrightness(100); setContrast(100); setSaturation(100); resetZoom(); }

  function handleSvgClick(e) {
    e.stopPropagation();
    const pt = getSvgPoint(e);
    if (!pt) return;

    if (mode === "calib") {
      if (calibStep === 0) {
        setCalibPt1(pt);
        setCalibStep(1);
      } else {
        setCalibPt2(pt);
        // Calculate px/mm from distance between two taps on #8 (8.5mm wide)
        const dist = Math.sqrt(Math.pow(pt.x - calibPt1.x, 2) + Math.pow(pt.y - calibPt1.y, 2));
        const ppm = dist / 8.5;
        setPixPerMm(ppm);
        setMode("edit");
        setCalibStep(0); setCalibPt1(null); setCalibPt2(null);
      }
      return;
    }

    if (mode === "place" && nextTooth) {
      // Place this tooth at tap location
      // Calculate pixel size from known mm width
      const ppm = pixPerMm || 6;
      const wPx = nextTooth.widthMm * ppm;
      const hPx = nextTooth.heightMm * ppm;

      const existing = placements.find(p => p.id === nextTooth.id);
      const updated = {
        id: nextTooth.id,
        label: nextTooth.label,
        name: nextTooth.name,
        widthMm: nextTooth.widthMm,
        heightMm: nextTooth.heightMm,
        x: pt.x,
        y: pt.y,
        idealX: pt.x,  // ideal = where you placed it (corrected position)
        idealY: pt.y,
        wPx, hPx,
        rot: 0,
        corrected: false,
        placed: true,
      };

      setPlacements(prev => {
        const next = prev.filter(p => p.id !== nextTooth.id);
        return [...next, updated];
      });

      // Move to next tooth
      if (placeIdx < teethDefs.length - 1) {
        setPlaceIdx(placeIdx + 1);
      } else {
        setMode("edit");
        setSelId(null);
      }
    }

    if (mode === "edit") {
      // Check if tapped near a placed tooth
      const tapped = placements.find(p => {
        if (!p.placed) return false;
        const dist = Math.sqrt(Math.pow(p.x - pt.x, 2) + Math.pow(p.y - pt.y, 2));
        return dist < (p.wPx || 20) * 0.8;
      });
      if (tapped) {
        setSelId(prev => prev === tapped.id ? null : tapped.id);
      } else {
        setSelId(null);
      }
    }
  }

  function adjRot(delta) {
    if (!selId) return;
    setPlacements(prev => prev.map(p => {
      if (p.id !== selId) return p;
      const newRot = Math.max(-ROT_MAX, Math.min(ROT_MAX, (p.rot || 0) + delta));
      return { ...p, rot: Math.round(newRot * 10) / 10 };
    }));
  }

  function adjPos(dx, dy) {
    if (!selId) return;
    setPlacements(prev => prev.map(p => {
      if (p.id !== selId) return p;
      return { ...p, x: p.x + dx, y: p.y + dy };
    }));
  }

  function markCorrected() {
    if (!selId) return;
    setPlacements(prev => prev.map(p =>
      p.id === selId ? { ...p, corrected: !p.corrected } : p
    ));
  }

  function correctAll() {
    setPlacements(prev => prev.map(p => ({ ...p, corrected: true })));
    setSelId(null);
  }

  function resetPlacements() {
    setPlacements([]);
    setPlaceIdx(0);
    setMode("place");
    setSelId(null);
    setPixPerMm(null);
  }

  function removeTooth(id) {
    setPlacements(prev => prev.filter(p => p.id !== id));
    if (selId === id) setSelId(null);
    // Go back to place mode for that tooth
    const idx = teethDefs.findIndex(t => t.id === id);
    if (idx !== -1) {
      setPlaceIdx(idx);
      setMode("place");
    }
  }

  const selTrays = sel ? toothTrays(sel, pixPerMm) : 0;
  const selRc = sel ? rotColor(sel.rot) : null;
  const selMovMm = sel && pixPerMm
    ? Math.sqrt(Math.pow((sel.x-sel.idealX)/pixPerMm,2)+Math.pow((sel.y-sel.idealY)/pixPerMm,2)).toFixed(1)
    : "0.0";

  return (
    <div style={{ background:"#fff", borderRadius:16, overflow:"hidden", border:"1px solid #e2e8f0", marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,.07)" }}>

      {/* Header */}
      <div style={{ padding:"10px 14px", borderBottom:"1px solid #f1f5f9" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{title}</div>
          <div style={{ display:"flex", gap:6 }}>
            {mode==="edit" && !pixPerMm && (
              <button onClick={() => { setMode("calib"); setCalibStep(0); setCalibPt1(null); setCalibPt2(null); }}
                style={{ fontSize:10, padding:"4px 9px", borderRadius:7, background:"#fef3c7", color:"#92400e", fontWeight:700, border:"1px solid #fde68a", cursor:"pointer" }}>
                📐 Calibrate
              </button>
            )}
            {pixPerMm && (
              <div style={{ fontSize:10, padding:"4px 9px", borderRadius:7, background:"#f0fdf4", color:"#15803d", fontWeight:700, border:"1px solid #bbf7d0" }}>
                ✓ {pixPerMm.toFixed(1)}px/mm
              </div>
            )}
            {archT > 0 && (
              <div style={{ background:complexity(archT).color+"22", color:complexity(archT).color, fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:8 }}>
                {archT}t
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize:10, color:"#94a3b8" }}>
          {mode === "calib"
            ? `📐 Calibration: ${calibStep===0?"Tap mesial (left) edge of #8":"Tap distal (right) edge of #8"}`
            : mode === "place"
            ? nextTooth
              ? `👆 Tap on tooth ${nextTooth.label} — ${nextTooth.name} (${placeIdx+1}/${teethDefs.length})`
              : "All teeth placed — switch to edit mode"
            : `${placedCount}/${teethDefs.length} placed · ${placements.filter(p=>p.corrected).length} corrected`}
        </div>
      </div>

      {/* Photo tools bar */}
      <div style={{ background:"#1e293b", borderBottom:"1px solid #334155" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 10px" }}>
          <button onClick={() => setShowPhotoTools(s=>!s)} style={{ fontSize:10, padding:"4px 9px", borderRadius:7, background:showPhotoTools?"#334155":"transparent", color:"#94a3b8", fontWeight:600, border:"none", cursor:"pointer" }}>
            🎨 Photo tools {showPhotoTools?"▲":"▼"}
          </button>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {zoom > 1 && (
              <button onClick={resetZoom} style={{ fontSize:10, padding:"4px 9px", borderRadius:7, background:"#1a56db", color:"#fff", fontWeight:700, border:"none", cursor:"pointer" }}>
                Reset zoom ({zoom.toFixed(1)}x)
              </button>
            )}
            <div style={{ fontSize:10, color:"#64748b" }}>
              {zoom > 1 ? "Drag to pan · Pinch to zoom" : "Pinch to zoom in"}
            </div>
          </div>
        </div>

        {showPhotoTools && (
          <div style={{ padding:"8px 10px 10px", borderTop:"1px solid #334155" }}>
            {[
              { label:"☀️ Brightness", val:brightness, set:setBrightness, min:50, max:200, def:100 },
              { label:"◑ Contrast",   val:contrast,   set:setContrast,   min:50, max:200, def:100 },
              { label:"🎨 Saturation", val:saturation, set:setSaturation, min:0,  max:200, def:100 },
            ].map(({ label, val, set, min, max, def }) => (
              <div key={label} style={{ marginBottom:6 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                  <span style={{ fontSize:10, color:"#94a3b8" }}>{label}</span>
                  <span style={{ fontSize:10, color:"#64748b", fontFamily:"monospace" }}>{val}%</span>
                </div>
                <input type="range" min={min} max={max} step={5} value={val}
                  onChange={e => set(+e.target.value)}
                  style={{ width:"100%", accentColor:"#38bdf8" }} />
              </div>
            ))}
            <button onClick={resetPhoto} style={{ fontSize:10, padding:"4px 10px", borderRadius:7, background:"#334155", color:"#94a3b8", fontWeight:600, border:"none", cursor:"pointer", marginTop:2 }}>
              Reset photo
            </button>
          </div>
        )}
      </div>

      {/* SVG Photo Canvas */}
      <div ref={containerRef} style={{ position:"relative", background:"#0f172a", overflow:"hidden", touchAction:"none" }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${VW} ${VH}`}
          style={{ display:"block", cursor: zoom>1 ? (isPanning?"grabbing":"grab") : mode==="place"||mode==="calib" ? "crosshair" : "pointer" }}
          onClick={e => { if (!isPanning) handleSvgClick(e); }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={e => {
            handleTouchEnd(e);
            if (!isPanning && e.changedTouches.length === 1) handleSvgClick(e);
          }}
        >
          <defs>
            <filter id="photoFilter">
              <feComponentTransfer>
                <feFuncR type="linear" slope={brightness/100} />
                <feFuncG type="linear" slope={brightness/100} />
                <feFuncB type="linear" slope={brightness/100} />
              </feComponentTransfer>
              <feColorMatrix type="saturate" values={saturation/100} />
            </filter>
            <clipPath id="canvasClip">
              <rect width={VW} height={VH} />
            </clipPath>
          </defs>

          {/* Zoom/pan group */}
          <g clipPath="url(#canvasClip)">
            <g transform={`translate(${VW/2 + panX},${VH/2 + panY}) scale(${zoom}) translate(${-VW/2},${-VH/2})`}>

          {/* Photo with filters */}
          {photo
            ? <image href={photo} x="0" y="0" width={VW} height={VH}
                preserveAspectRatio="xMidYMid slice"
                filter="url(#photoFilter)"
                style={{ filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)` }}
              />
            : <>
                <rect width={VW} height={VH} fill="#1e293b" />
                <text x={VW/2} y={VH/2-10} textAnchor="middle" fill="#475569" fontSize="12">Upload photo — teeth appear here</text>
                <text x={VW/2} y={VH/2+8} textAnchor="middle" fill="#334155" fontSize="9">Real patient photo goes here</text>
              </>
          }

          {/* Dim overlay */}
          <rect width={VW} height={VH} fill="rgba(0,0,0,0.12)" />

          {/* Calibration points */}
          {mode==="calib" && calibPt1 && (
            <circle cx={calibPt1.x} cy={calibPt1.y} r={5} fill="#fbbf24" opacity="0.95" />
          )}
          {mode==="calib" && calibPt2 && calibPt1 && (
            <>
              <circle cx={calibPt2.x} cy={calibPt2.y} r={5} fill="#f59e0b" opacity="0.95" />
              <line x1={calibPt1.x} y1={calibPt1.y} x2={calibPt2.x} y2={calibPt2.y} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 2" />
            </>
          )}

          {/* Placed teeth */}
          {placements.filter(p=>p.placed).map(p => {
            const isSel = p.id === selId;
            const rc = rotColor(p.rot);
            const trays = toothTrays(p, pixPerMm);
            const w = p.wPx || 20;
            const h = p.hPx || 28;

            const fill = isSel
              ? "rgba(219,234,254,0.88)"
              : p.corrected
              ? trays===1 ? "rgba(220,252,231,0.85)" : "rgba(204,251,241,0.85)"
              : rc ? "rgba(254,243,199,0.75)"
              : "rgba(248,250,252,0.72)";

            const stroke = isSel ? "#1a56db"
              : rc ? rc
              : p.corrected ? (trays===1?"#16a34a":"#0d9488")
              : "rgba(203,213,225,0.9)";

            return (
              <g key={p.id} transform={`rotate(${p.rot||0},${p.x},${p.y})`}>
                {/* Tooth outline */}
                <rect
                  x={p.x - w/2} y={p.y - h/2}
                  width={w} height={h} rx={3}
                  fill={fill} stroke={stroke} strokeWidth={isSel?2.5:1.8}
                  filter={isSel?"drop-shadow(0 0 5px rgba(26,86,219,0.6))":undefined}
                />
                {/* Label */}
                <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize="6" fontWeight="800" fill={isSel?"#1e40af":p.corrected?"#065f46":"#475569"}
                  fontFamily="monospace" style={{ userSelect:"none", pointerEvents:"none" }}>
                  {p.label}
                </text>
                {/* Tray badge */}
                {p.corrected && trays > 0 && (
                  <text x={p.x} y={p.y - h/2 - 5} textAnchor="middle"
                    fontSize="7" fontWeight="800" fill={trays===1?"#16a34a":"#0d9488"}
                    style={{ userSelect:"none", pointerEvents:"none" }}>
                    {trays}t
                  </text>
                )}
                {/* Warning dot */}
                {rc && (
                  <circle cx={p.x + w/2 - 2} cy={p.y - h/2 + 2} r={3} fill={rc} opacity="0.9" />
                )}
                {/* Selection ring */}
                {isSel && (
                  <rect x={p.x-w/2-3} y={p.y-h/2-3} width={w+6} height={h+6} rx={5}
                    fill="none" stroke="#1a56db" strokeWidth="1" strokeDasharray="3 2" opacity="0.7" />
                )}
              </g>
            );
          })}

          {/* Next tooth to place indicator */}
          {mode==="place" && nextTooth && (
            <text x={VW/2} y={VH-10} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fbbf24">
              👆 Tap to place {nextTooth.label} — {nextTooth.name}
            </text>
          )}

          {/* Calibration instruction */}
          {mode==="calib" && (
            <text x={VW/2} y={VH-10} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fbbf24">
              {calibStep===0 ? "Tap LEFT edge of tooth #8" : "Now tap RIGHT edge of tooth #8"}
            </text>
          )}

            </g>{/* end zoom/pan group */}
          </g>{/* end clipPath group */}

          {/* Zoom indicator — outside zoom group so it stays fixed */}
          {zoom > 1 && (
            <g>
              <rect x={VW-52} y={4} width={48} height={16} rx={4} fill="rgba(0,0,0,0.55)" />
              <text x={VW-28} y={15} textAnchor="middle" fontSize="9" fontWeight="700" fill="#38bdf8">{zoom.toFixed(1)}x zoom</text>
            </g>
          )}

        </svg>
      </div>

      {/* Mode switcher */}
      {mode !== "calib" && (
        <div style={{ display:"flex", gap:0, borderBottom:"1px solid #f1f5f9" }}>
          {[
            { id:"place", label:"👆 Place Teeth" },
            { id:"edit",  label:"✏️ Edit & Correct" },
          ].map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setSelId(null); }}
              style={{
                flex:1, padding:"9px", background: mode===m.id?"#eff6ff":"#f8fafc",
                color: mode===m.id?"#1e40af":"#64748b",
                fontWeight: mode===m.id?700:400, fontSize:12, border:"none",
                borderBottom: mode===m.id?"2px solid #1a56db":"2px solid transparent",
                cursor:"pointer",
              }}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Tooth placement list — shows which teeth still need placing */}
      {mode==="place" && (
        <div style={{ padding:"10px 12px" }}>
          <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:8 }}>
            Tap each tooth in order in the photo above:
          </div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {teethDefs.map((t, i) => {
              const placed = placements.find(p => p.id === t.id && p.placed);
              const isCurrent = i === placeIdx;
              return (
                <div key={t.id} style={{
                  padding:"5px 8px", borderRadius:8, fontSize:11, fontWeight:700,
                  background: placed ? "#f0fdf4" : isCurrent ? "#1a56db" : "#f1f5f9",
                  color: placed ? "#15803d" : isCurrent ? "#fff" : "#94a3b8",
                  border: `1px solid ${placed?"#bbf7d0":isCurrent?"#1a56db":"#e2e8f0"}`,
                  cursor: "pointer",
                }} onClick={() => setPlaceIdx(i)}>
                  {placed ? "✓" : ""}{t.label}
                </div>
              );
            })}
          </div>
          {placedCount > 0 && (
            <button onClick={() => setMode("edit")}
              style={{ marginTop:10, width:"100%", padding:"8px", borderRadius:9, background:"#eff6ff", color:"#1e40af", fontWeight:700, fontSize:12, border:"1px solid #bfdbfe", cursor:"pointer" }}>
              Done placing — switch to Edit & Correct →
            </button>
          )}
        </div>
      )}

      {/* Edit controls */}
      {mode==="edit" && (
        <div style={{ padding:"12px" }}>
          {!sel ? (
            <div style={{ fontSize:12, color:"#94a3b8", textAlign:"center", padding:"8px 0" }}>
              Tap a tooth in the photo to select and adjust it
            </div>
          ) : (
            <div>
              {/* Selected tooth header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div>
                  <span style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{sel.name}</span>
                  <span style={{ fontSize:10, color:"#64748b", marginLeft:6 }}>{sel.widthMm}mm wide</span>
                  {selTrays > 0 && (
                    <span style={{ fontSize:11, background:"#eff6ff", color:"#1e40af", padding:"2px 7px", borderRadius:8, marginLeft:6, fontWeight:700 }}>
                      {selTrays}t
                    </span>
                  )}
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={markCorrected} style={{
                    padding:"5px 12px", borderRadius:8, border:"none", fontWeight:700, fontSize:11, cursor:"pointer",
                    background: sel.corrected?"#dcfce7":"linear-gradient(135deg,#0d9488,#065f46)",
                    color: sel.corrected?"#15803d":"#fff",
                  }}>
                    {sel.corrected ? "✓ Done" : "✓ Correct"}
                  </button>
                  <button onClick={() => removeTooth(sel.id)} style={{ padding:"5px 8px", borderRadius:8, background:"#fef2f2", color:"#dc2626", fontWeight:700, fontSize:11, border:"1px solid #fecaca", cursor:"pointer" }}>
                    ✕
                  </button>
                </div>
              </div>

              {/* Rotation */}
              <div style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:11, color:"#64748b", fontWeight:600 }}>↻ Rotation</span>
                  <span style={{ fontSize:12, fontFamily:"monospace", color: selRc||"#1e40af", fontWeight:700 }}>
                    {(sel.rot||0)>0?"+":""}{(sel.rot||0).toFixed(1)}°
                    {Math.abs(sel.rot||0)>=ROT_MAX && " 🛑"}
                  </span>
                </div>
                <input type="range" min={-ROT_MAX} max={ROT_MAX} step={0.5}
                  value={sel.rot||0}
                  onChange={e => adjRot(parseFloat(e.target.value)-(sel.rot||0))}
                  style={{ width:"100%", accentColor: selRc||"#1a56db" }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#cbd5e1" }}>
                  <span>-{ROT_MAX}° mesial</span><span style={{ color:"#6366f1" }}>0° ideal</span><span>+{ROT_MAX}° distal</span>
                </div>
              </div>

              {/* Warnings */}
              {Math.abs(sel.rot||0) >= ROT_ATTACH && Math.abs(sel.rot||0) < ROT_MAX && (
                <div style={{ background:"#fef3c7", borderRadius:8, padding:"6px 10px", marginBottom:8, fontSize:11, color:"#92400e", fontWeight:600 }}>
                  📎 {Math.abs(sel.rot||0).toFixed(0)}° — attachment recommended
                </div>
              )}
              {Math.abs(sel.rot||0) >= ROT_FLAG && (
                <div style={{ background:"#fef2f2", borderRadius:8, padding:"6px 10px", marginBottom:8, fontSize:11, color:"#dc2626", fontWeight:600 }}>
                  ⚠ {Math.abs(sel.rot||0).toFixed(0)}° — verify bite / interference check
                </div>
              )}

              {/* Position nudge */}
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:6 }}>↔ Nudge position</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:5 }}>
                  {[
                    { label:"← M", dx:-3, dy:0 },
                    { label:"D →", dx:3,  dy:0 },
                    { label:"↑", dx:0, dy:-3 },
                    { label:"↓", dx:0, dy:3 },
                  ].map(({ label, dx, dy }) => (
                    <button key={label} onClick={() => adjPos(dx,dy)} style={{
                      padding:"8px 4px", borderRadius:8, background:"#f8fafc",
                      color:"#475569", fontSize:11, fontWeight:700,
                      border:"1px solid #e2e8f0", cursor:"pointer",
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div style={{ background:"#f8fafc", borderRadius:9, padding:"8px 10px", border:"1px solid #f1f5f9", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, textAlign:"center" }}>
                {[
                  { label:"rotation",    val:`${Math.abs(sel.rot||0).toFixed(1)}°`, color: selRc||"#0f172a" },
                  { label:"translation", val:`${selMovMm}mm`,                        color:"#0f172a" },
                  { label:"trays",       val:`${selTrays}`,                           color:"#1e40af" },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <div style={{ fontSize:14, fontWeight:700, color }}>{val}</div>
                    <div style={{ fontSize:9, color:"#94a3b8" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Placed teeth list */}
          {placements.filter(p=>p.placed).length > 0 && (
            <div style={{ marginTop:12, display:"flex", gap:4, flexWrap:"wrap" }}>
              {placements.filter(p=>p.placed).sort((a,b)=>a.id-b.id).map(p => {
                const trays = toothTrays(p, pixPerMm);
                return (
                  <div key={p.id} onClick={() => setSelId(prev=>prev===p.id?null:p.id)} style={{
                    padding:"4px 8px", borderRadius:8, fontSize:10, fontWeight:700, cursor:"pointer",
                    background: selId===p.id ? "#eff6ff" : p.corrected ? "#f0fdf4" : "#f8fafc",
                    color: selId===p.id ? "#1e40af" : p.corrected ? "#15803d" : "#64748b",
                    border: `1px solid ${selId===p.id?"#bfdbfe":p.corrected?"#bbf7d0":"#e2e8f0"}`,
                  }}>
                    {p.label}{trays>0?` ${trays}t`:""}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Calib cancel */}
      {mode==="calib" && (
        <div style={{ padding:"10px 12px" }}>
          <div style={{ fontSize:11, color:"#92400e", marginBottom:8, lineHeight:1.5 }}>
            Tap the <strong>mesial (left)</strong> then <strong>distal (right)</strong> edge of tooth #8 in the photo above. The app will calculate real millimeter scale from the known 8.5mm width.
          </div>
          <button onClick={() => { setMode("edit"); setCalibStep(0); setCalibPt1(null); setCalibPt2(null); }}
            style={{ width:"100%", padding:"8px", borderRadius:9, background:"#f1f5f9", color:"#64748b", fontWeight:600, fontSize:12, border:"none", cursor:"pointer" }}>
            Cancel calibration
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ padding:"10px 12px", borderTop:"1px solid #f1f5f9", display:"flex", gap:8 }}>
        <button onClick={correctAll} style={{ flex:1, padding:"8px", borderRadius:9, background:"#f0fdf4", color:"#15803d", fontSize:11, fontWeight:700, border:"1px solid #bbf7d0", cursor:"pointer" }}>
          ✓ Correct All
        </button>
        <button onClick={resetPlacements} style={{ padding:"8px 14px", borderRadius:9, background:"#fef2f2", color:"#dc2626", fontSize:11, fontWeight:600, border:"1px solid #fecaca", cursor:"pointer" }}>
          Reset
        </button>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────
export default function App() {
  const [tab,      setTab]      = useState(0);
  const [patName,  setPatName]  = useState("");
  const [patDOB,   setPatDOB]   = useState("");
  const [photos,   setPhotos]   = useState({ upper:null, lower:null, facial:null });
  const [upperPlacements, setUpperPlacements] = useState([]);
  const [lowerPlacements, setLowerPlacements] = useState([]);
  const [upperPpm, setUpperPpm] = useState(null);
  const [lowerPpm, setLowerPpm] = useState(null);
  const fileRefs = useRef({});

  const uTrays    = archTrays(upperPlacements, upperPpm);
  const lTrays    = archTrays(lowerPlacements, lowerPpm);
  const combTrays = Math.max(uTrays, lTrays);

  const labU = uTrays    * PRICE_PER_TRAY + LAB_FEE;
  const labL = lTrays    * PRICE_PER_TRAY + LAB_FEE;
  const labC = combTrays * PRICE_PER_TRAY + LAB_FEE;
  const drU  = Math.round(labU * MARKUP / 5) * 5;
  const drL  = Math.round(labL * MARKUP / 5) * 5;
  const drC  = Math.round(labC * MARKUP / 5) * 5;

  function handlePhoto(id, e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => setPhotos(p => ({ ...p, [id]: ev.target.result }));
    reader.readAsDataURL(f);
  }

  function resetCase() {
    setUpperPlacements([]); setLowerPlacements([]);
    setUpperPpm(null); setLowerPpm(null);
    setPhotos({ upper:null, lower:null, facial:null });
    setPatName(""); setPatDOB(""); setTab(0);
  }

  const PHOTO_SLOTS = [
    { id:"upper",  label:"Upper Arch",  icon:"⬆️", hint:"Straight down, mouth open" },
    { id:"lower",  label:"Lower Arch",  icon:"⬇️", hint:"Straight down, tongue back" },
    { id:"facial", label:"Facial View", icon:"😬", hint:"Lips retracted, camera level" },
  ];

  const TABS = [
    { icon:"📷", label:"Photos" },
    { icon:"⬆️", label:"Upper" },
    { icon:"⬇️", label:"Lower" },
    { icon:"💰", label:"Quote" },
    { icon:"📋", label:"Report" },
  ];

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", maxWidth:480, margin:"0 auto", minHeight:"100vh", background:"#f1f5f9", paddingBottom:80 }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        input,select{font-family:inherit}
        button{font-family:inherit;cursor:pointer;border:none}
        .card{background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:12px}
        .inp{width:100%;padding:11px 13px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;color:#0f172a;background:#fff}
        .inp:focus{outline:none;border-color:#1a56db}
        .prim{background:linear-gradient(135deg,#0a1628,#1a56db);color:#fff;border-radius:12px;padding:14px;font-size:15px;font-weight:700;width:100%;cursor:pointer}
        .prim:disabled{background:#e2e8f0;color:#94a3b8;cursor:default}
        .sec{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;display:block}
        input[type=range]{accent-color:#1a56db;width:100%}
      `}</style>

      {/* Header */}
      <div style={{ background:"linear-gradient(170deg,#0a1628,#0d2149)", padding:"16px 16px 0", position:"sticky", top:0, zIndex:20, boxShadow:"0 2px 12px rgba(0,0,0,.2)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <div style={{ width:36, height:36, background:"linear-gradient(135deg,#1a56db,#0d9488)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🦷</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#f0f9ff" }}>Clear Moves™</div>
            <div style={{ fontSize:10, color:"#4b6cb7", letterSpacing:".05em" }}>TAP TO IDENTIFY TEETH · SML</div>
          </div>
          {patName && <div style={{ fontSize:12, color:"#38bdf8", fontWeight:500 }}>{patName}</div>}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)" }}>
          {TABS.map((t,i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              padding:"8px 2px 10px", background:"none",
              borderBottom: tab===i?"2.5px solid #38bdf8":"2.5px solid transparent",
              color: tab===i?"#38bdf8":"#64748b",
              fontSize:10, fontWeight: tab===i?700:400,
            }}>
              <div style={{ fontSize:16, marginBottom:2 }}>{t.icon}</div>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"14px 14px 0" }}>

        {/* ═══ TAB 0 — PHOTOS ═══ */}
        {tab===0 && (
          <div>
            <div className="card">
              <span className="sec">Patient</span>
              <div style={{ marginBottom:10 }}>
                <label className="sec">Name</label>
                <input className="inp" value={patName} onChange={e=>setPatName(e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className="sec">Date of Birth</label>
                <input className="inp" value={patDOB} onChange={e=>setPatDOB(e.target.value)} placeholder="MM/DD/YYYY" />
              </div>
            </div>

            <div className="card">
              <span className="sec">Upload 3 Photos</span>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:12, lineHeight:1.55 }}>
                Upload your 3Shape or intraoral camera photos. In the Upper and Lower tabs you will tap directly on each tooth to identify and place it — the outline sits exactly on the real tooth.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                {PHOTO_SLOTS.map(slot => (
                  <div key={slot.id}>
                    <div onClick={() => fileRefs.current[slot.id]?.click()} style={{
                      height:90, borderRadius:10, overflow:"hidden", cursor:"pointer",
                      border:`2px solid ${photos[slot.id]?"#16a34a":"#e2e8f0"}`,
                      background:"#f8fafc", position:"relative",
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}>
                      {photos[slot.id] ? (
                        <>
                          <img src={photos[slot.id]} alt={slot.label} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                          <div style={{ position:"absolute", top:4, right:4, background:"#16a34a", borderRadius:"50%", width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", fontWeight:700 }}>✓</div>
                        </>
                      ) : (
                        <div style={{ textAlign:"center" }}>
                          <div style={{ fontSize:22, marginBottom:2 }}>{slot.icon}</div>
                          <div style={{ fontSize:9, color:"#94a3b8" }}>Tap</div>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize:10, fontWeight:600, color:"#0f172a", marginTop:4 }}>{slot.label}</div>
                    <div style={{ fontSize:9, color:"#94a3b8" }}>{slot.hint}</div>
                    <input ref={el=>fileRefs.current[slot.id]=el} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={e=>handlePhoto(slot.id,e)} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
              <div style={{ fontSize:12, color:"#1e40af", fontWeight:700, marginBottom:4 }}>👆 How tooth identification works</div>
              <div style={{ fontSize:11, color:"#3b82f6", lineHeight:1.6 }}>
                After uploading, go to the Upper tab. The app shows your photo and asks you to tap each tooth one at a time — starting with #6 (UR Canine) through #11 (UL Canine). Tap the center of each tooth where you see it in the photo. The outline places exactly there. Then adjust rotation and mark corrected.
              </div>
            </div>

            <button className="prim" onClick={() => setTab(1)}>Go to Upper Arch →</button>
          </div>
        )}

        {/* ═══ TAB 1 — UPPER ═══ */}
        {tab===1 && (
          <div>
            <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:12, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#1e40af" }}>
              {photos.upper
                ? "👆 Tap each tooth in the photo to place its outline. Start with #6 and work across to #11."
                : "Upload the upper arch photo in the Photos tab first."}
            </div>
            <ArchEditor
              teethDefs={UPPER_TEETH}
              placements={upperPlacements}
              setPlacements={setUpperPlacements}
              photo={photos.upper}
              isUpper={true}
              title="Upper Arch · Tap to identify teeth #6–#11"
              pixPerMm={upperPpm}
              setPixPerMm={setUpperPpm}
            />
            {uTrays > 0 && (
              <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:"12px 16px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#166534" }}>Upper estimate</div>
                  <div style={{ fontSize:11, color:"#86efac" }}>{complexity(uTrays).label} · ~{uTrays*2} weeks</div>
                </div>
                <div style={{ fontSize:28, fontWeight:700, color:"#15803d" }}>{uTrays}<span style={{ fontSize:13 }}> trays</span></div>
              </div>
            )}
            <button className="prim" onClick={() => setTab(2)}>Continue to Lower Arch →</button>
          </div>
        )}

        {/* ═══ TAB 2 — LOWER ═══ */}
        {tab===2 && (
          <div>
            <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:12, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#1e40af" }}>
              {photos.lower
                ? "👆 Tap each tooth in the photo to place its outline. Start with #22 and work across to #27."
                : "Upload the lower arch photo in the Photos tab first."}
            </div>
            <ArchEditor
              teethDefs={LOWER_TEETH}
              placements={lowerPlacements}
              setPlacements={setLowerPlacements}
              photo={photos.lower}
              isUpper={false}
              title="Lower Arch · Tap to identify teeth #22–#27"
              pixPerMm={lowerPpm}
              setPixPerMm={setLowerPpm}
            />
            {lTrays > 0 && (
              <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:"12px 16px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#166534" }}>Lower estimate</div>
                  <div style={{ fontSize:11, color:"#86efac" }}>{complexity(lTrays).label} · ~{lTrays*2} weeks</div>
                </div>
                <div style={{ fontSize:28, fontWeight:700, color:"#15803d" }}>{lTrays}<span style={{ fontSize:13 }}> trays</span></div>
              </div>
            )}
            <button className="prim" onClick={() => setTab(3)}>View Quote →</button>
          </div>
        )}

        {/* ═══ TAB 3 — QUOTE ═══ */}
        {tab===3 && (
          <div>
            <div style={{ background:"#fef3c7", border:"1px solid #fde68a", borderRadius:12, padding:"12px 14px", marginBottom:14, display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:22 }}>🔒</span>
              <div style={{ fontSize:12, color:"#92400e", fontWeight:600 }}>Doctor view only — never shown to patient</div>
            </div>

            <div className="card">
              <span className="sec">Case Summary</span>
              {patName && <div style={{ fontSize:14, color:"#0f172a", marginBottom:10, fontWeight:600 }}>{patName} · {patDOB}</div>}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, textAlign:"center" }}>
                {[
                  { label:"Upper",    val:uTrays||"—",    color:complexity(uTrays).color },
                  { label:"Lower",    val:lTrays||"—",    color:complexity(lTrays).color },
                  { label:"Combined", val:combTrays||"—", color:"#1e40af" },
                ].map((s,i) => (
                  <div key={i} style={{ background:"#f8fafc", borderRadius:10, padding:"11px 6px" }}>
                    <div style={{ fontSize:10, color:"#94a3b8", marginBottom:3 }}>{s.label}</div>
                    <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.val}</div>
                    {s.val!=="—"&&typeof s.val==="number"&&<div style={{ fontSize:9, color:s.color }}>{complexity(s.val).label}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:14, padding:16, marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#1e40af", textTransform:"uppercase", letterSpacing:".05em", marginBottom:14 }}>Your Lab Cost</div>
              {uTrays>0&&<div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#1e3a8a", marginBottom:8 }}><span>Upper only ({uTrays} trays × $65 + $225)</span><span style={{ fontWeight:700 }}>${labU.toLocaleString()}</span></div>}
              {lTrays>0&&<div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#1e3a8a", marginBottom:8 }}><span>Lower only ({lTrays} trays × $65 + $225)</span><span style={{ fontWeight:700 }}>${labL.toLocaleString()}</span></div>}
              {uTrays>0&&lTrays>0&&<div style={{ borderTop:"1px solid #bfdbfe", paddingTop:10, display:"flex", justifyContent:"space-between", fontSize:15, fontWeight:700, color:"#1e40af" }}><span>Combined</span><span>${labC.toLocaleString()}</span></div>}
            </div>

            <div style={{ background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:14, padding:16, marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#15803d", textTransform:"uppercase", letterSpacing:".05em", marginBottom:14 }}>Suggested Patient Charge (×1.4)</div>
              {uTrays>0&&<div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#166534", marginBottom:8 }}><span>Upper only</span><span style={{ fontWeight:700 }}>${drU.toLocaleString()}</span></div>}
              {lTrays>0&&<div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#166634", marginBottom:8 }}><span>Lower only</span><span style={{ fontWeight:700 }}>${drL.toLocaleString()}</span></div>}
              {uTrays>0&&lTrays>0&&<div style={{ borderTop:"1px solid #bbf7d0", paddingTop:10, display:"flex", justifyContent:"space-between", fontSize:15, fontWeight:700, color:"#15803d" }}><span>Combined</span><span>${drC.toLocaleString()}</span></div>}
              <div style={{ fontSize:10, color:"#86efac", marginTop:10 }}>Doctor sets final fee — patient never sees this screen</div>
            </div>

            <button className="prim" onClick={() => setTab(4)}>Generate Patient Report →</button>
          </div>
        )}

        {/* ═══ TAB 4 — PATIENT REPORT ═══ */}
        {tab===4 && (
          <div>
            <div className="card" style={{ textAlign:"center", padding:"22px 16px" }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🦷</div>
              <div style={{ fontWeight:700, fontSize:20, color:"#0f172a", marginBottom:4 }}>{patName||"Your Smile Plan"}</div>
              <div style={{ fontSize:12, color:"#64748b" }}>Clear Moves™ Aligner Treatment</div>
            </div>

            {photos.facial && (
              <div className="card" style={{ padding:10 }}>
                <span className="sec" style={{ paddingLeft:2 }}>Your Current Smile</span>
                <img src={photos.facial} alt="smile" style={{ width:"100%", borderRadius:10, maxHeight:200, objectFit:"cover", display:"block" }} />
              </div>
            )}

            {/* Before / After */}
            <div className="card" style={{ padding:12 }}>
              <span className="sec">Before & After — Your Actual Teeth</span>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                {/* Upper */}
                <div>
                  <div style={{ fontSize:9, color:"#dc2626", fontWeight:700, marginBottom:3 }}>🔴 BEFORE — Upper</div>
                  <div style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"2px solid #fecaca" }}>
                    {photos.upper
                      ? <img src={photos.upper} alt="upper before" style={{ width:"100%", display:"block", filter:"brightness(0.75) saturate(0.6)" }} />
                      : <div style={{ height:80, background:"#fef2f2" }} />}
                    <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%" }} viewBox={`0 0 ${VW} ${VH}`}>
                      {upperPlacements.filter(p=>p.placed).map(p => (
                        <g key={p.id} transform={`rotate(${p.rot||0},${p.x},${p.y})`}>
                          <rect x={p.x-(p.wPx||20)/2} y={p.y-(p.hPx||28)/2} width={p.wPx||20} height={p.hPx||28} rx={2}
                            fill="rgba(254,202,202,0.8)" stroke="#ef4444" strokeWidth="1.5" />
                          <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="6" fontWeight="800" fill="#ef4444" fontFamily="monospace" style={{ userSelect:"none" }}>{p.label}</text>
                        </g>
                      ))}
                    </svg>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:9, color:"#16a34a", fontWeight:700, marginBottom:3 }}>✅ AFTER — Upper</div>
                  <div style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"2px solid #bbf7d0" }}>
                    {photos.upper
                      ? <img src={photos.upper} alt="upper after" style={{ width:"100%", display:"block" }} />
                      : <div style={{ height:80, background:"#f0fdf4" }} />}
                    <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%" }} viewBox={`0 0 ${VW} ${VH}`}>
                      {upperPlacements.filter(p=>p.placed).map(p => (
                        <g key={p.id}>
                          <rect x={p.idealX-(p.wPx||20)/2} y={p.idealY-(p.hPx||28)/2} width={p.wPx||20} height={p.hPx||28} rx={2}
                            fill={p.corrected?"rgba(187,247,208,0.88)":"rgba(248,250,252,0.7)"}
                            stroke={p.corrected?"#16a34a":"#cbd5e1"} strokeWidth="1.5" />
                          <text x={p.idealX} y={p.idealY} textAnchor="middle" dominantBaseline="middle" fontSize="6" fontWeight="800" fill={p.corrected?"#15803d":"#94a3b8"} fontFamily="monospace" style={{ userSelect:"none" }}>{p.label}</text>
                        </g>
                      ))}
                    </svg>
                  </div>
                </div>
                {/* Lower */}
                <div>
                  <div style={{ fontSize:9, color:"#dc2626", fontWeight:700, marginBottom:3 }}>🔴 BEFORE — Lower</div>
                  <div style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"2px solid #fecaca" }}>
                    {photos.lower
                      ? <img src={photos.lower} alt="lower before" style={{ width:"100%", display:"block", filter:"brightness(0.75) saturate(0.6)" }} />
                      : <div style={{ height:80, background:"#fef2f2" }} />}
                    <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%" }} viewBox={`0 0 ${VW} ${VH}`}>
                      {lowerPlacements.filter(p=>p.placed).map(p => (
                        <g key={p.id} transform={`rotate(${p.rot||0},${p.x},${p.y})`}>
                          <rect x={p.x-(p.wPx||20)/2} y={p.y-(p.hPx||28)/2} width={p.wPx||20} height={p.hPx||28} rx={2}
                            fill="rgba(254,202,202,0.8)" stroke="#ef4444" strokeWidth="1.5" />
                          <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="6" fontWeight="800" fill="#ef4444" fontFamily="monospace" style={{ userSelect:"none" }}>{p.label}</text>
                        </g>
                      ))}
                    </svg>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:9, color:"#16a34a", fontWeight:700, marginBottom:3 }}>✅ AFTER — Lower</div>
                  <div style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"2px solid #bbf7d0" }}>
                    {photos.lower
                      ? <img src={photos.lower} alt="lower after" style={{ width:"100%", display:"block" }} />
                      : <div style={{ height:80, background:"#f0fdf4" }} />}
                    <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%" }} viewBox={`0 0 ${VW} ${VH}`}>
                      {lowerPlacements.filter(p=>p.placed).map(p => (
                        <g key={p.id}>
                          <rect x={p.idealX-(p.wPx||20)/2} y={p.idealY-(p.hPx||28)/2} width={p.wPx||20} height={p.hPx||28} rx={2}
                            fill={p.corrected?"rgba(187,247,208,0.88)":"rgba(248,250,252,0.7)"}
                            stroke={p.corrected?"#16a34a":"#cbd5e1"} strokeWidth="1.5" />
                          <text x={p.idealX} y={p.idealY} textAnchor="middle" dominantBaseline="middle" fontSize="6" fontWeight="800" fill={p.corrected?"#15803d":"#94a3b8"} fontFamily="monospace" style={{ userSelect:"none" }}>{p.label}</text>
                        </g>
                      ))}
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Treatment */}
            <div className="card">
              <span className="sec">Your Treatment Plan</span>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:combTrays>0?10:0 }}>
                {uTrays>0&&<div style={{ background:"#f8fafc", borderRadius:10, padding:"13px", textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"#94a3b8", marginBottom:3 }}>Upper Arch</div>
                  <div style={{ fontSize:26, fontWeight:700, color:"#0f172a", lineHeight:1 }}>{uTrays}</div>
                  <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>trays · ~{uTrays*2} weeks</div>
                </div>}
                {lTrays>0&&<div style={{ background:"#f8fafc", borderRadius:10, padding:"13px", textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"#94a3b8", marginBottom:3 }}>Lower Arch</div>
                  <div style={{ fontSize:26, fontWeight:700, color:"#0f172a", lineHeight:1 }}>{lTrays}</div>
                  <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>trays · ~{lTrays*2} weeks</div>
                </div>}
              </div>
              {uTrays>0&&lTrays>0&&(
                <div style={{ background:"linear-gradient(135deg,#eff6ff,#f0fdf4)", border:"1px solid #bfdbfe", borderRadius:11, padding:"13px", textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"#1e40af", marginBottom:3 }}>Combined Treatment</div>
                  <div style={{ fontSize:22, fontWeight:700, color:"#1e40af" }}>{combTrays} trays · ~{combTrays*2} weeks</div>
                </div>
              )}
            </div>

            <div className="card">
              <p style={{ fontSize:13, color:"#475569", lineHeight:1.7 }}>
                Your Clear Moves™ aligners are custom-made, removable, and virtually invisible. Each tray is worn approximately two weeks before progressing to the next stage. Your doctor will confirm the final treatment plan after a full clinical evaluation.
              </p>
            </div>

            <div style={{ fontSize:10, color:"#94a3b8", lineHeight:1.6, marginBottom:16, padding:"0 2px" }}>
              Treatment estimates are based on visual assessment and subject to clinical review. Clear Moves™ is a registered trademark of Space Maintainers Laboratories. Results may vary.
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
              {[["📱","Text"],["📧","Email"],["🖨️","Print"]].map(([icon,lbl])=>(
                <button key={lbl} onClick={()=>lbl==="Print"?window.print():alert(`${lbl}: connect to practice management`)}
                  style={{ padding:"13px 8px", borderRadius:12, background:"#fff", border:"1.5px solid #e2e8f0", fontSize:12, fontWeight:600, color:"#1e40af", lineHeight:1.4 }}>
                  <div style={{ fontSize:22, marginBottom:3 }}>{icon}</div>{lbl}
                </button>
              ))}
            </div>

            <button className="prim" style={{ background:"#f1f5f9", color:"#64748b" }} onClick={resetCase}>
              + Start New Case
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
