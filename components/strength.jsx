/* global React, RepsData, RepsState, RepsStrength, RepsIcons, d3 */
const { useState: useStr, useEffect: useStrE, useMemo: useStrMemo, useRef: useStrRef } = React;
const StrIcons = RepsIcons;

// Annotation type catalog — kept tiny on purpose. Color + short label.
const STR_ANNOTATION_TYPES = [
  { id: "pr",          label: "PR",            color: "var(--accent)",   glyph: "★" },
  { id: "deload",      label: "Deload",        color: "var(--muted)",    glyph: "↓" },
  { id: "injury",      label: "Injury",        color: "var(--bad)",      glyph: "✕" },
  { id: "travel",      label: "Travel",        color: "var(--muted)",    glyph: "✈" },
  { id: "sick",        label: "Sick",          color: "var(--muted)",    glyph: "•" },
  { id: "form_change", label: "Form change",   color: "var(--good)",     glyph: "↻" },
  { id: "note",        label: "Note",          color: "var(--ink)",      glyph: "✎" }
];
const STR_ANNOTATION_BY_ID = Object.fromEntries(STR_ANNOTATION_TYPES.map(t => [t.id, t]));

// ============================================================================
// Exercise picker — search + grid of cards with sparklines
// ============================================================================
function ExercisePicker({ items, selected, onPick }) {
  const [q, setQ] = useStr("");
  const filtered = items.filter(it =>
    !q || it.name.toLowerCase().includes(q.toLowerCase()) ||
    (it.group || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="strength-picker">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search exercises…"
        className="strength-picker-search" />
      <div className="strength-picker-grid">
        {filtered.map(it => (
          <button
            key={it.name}
            className={`strength-picker-card ${selected === it.name ? "is-active" : ""}`}
            onClick={() => onPick(it.name)}>
            <div className="strength-picker-name">{it.name}</div>
            <div className="strength-picker-meta">
              <span className={`plan-type ${(it.group || "").toLowerCase()}`}>{it.group || "Other"}</span>
              <span className="mono" style={{color: "var(--muted)", fontSize: 10}}>
                {it.totalSets} sets · {it.daysSince === 0 ? "today" : `${it.daysSince}d ago`}
              </span>
            </div>
            <PickerSparkline data={it.sparkline} />
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="empty" style={{padding: 12, fontSize: 12, gridColumn: "1 / -1"}}>
            No exercises match.
          </div>
        )}
      </div>
    </div>
  );
}

function PickerSparkline({ data }) {
  if (!data || data.length < 2) return <div style={{height: 22}}></div>;
  const w = 120, h = 22, pad = 1;
  const min = Math.min(...data), max = Math.max(...data);
  const range = Math.max(0.5, max - min);
  const xs = (i) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const ys = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
  const d = data.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="strength-picker-spark" style={{width: "100%", height: 22}} preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.55" />
    </svg>
  );
}

// ============================================================================
// The Curve — hero chart. React owns layout, D3 owns SVG.
// ============================================================================
function HeroChart({ history, compareHistory, blockRanges, profile, visibleRange, setVisibleRange, highlightBucket, annotations, onAnnotate }) {
  const svgRef = useStrRef(null);
  const brushSvgRef = useStrRef(null);
  const [pinned, setPinned] = useStr(null);             // session object or null
  const [hover, setHover] = useStr(null);               // session object or null
  const [series, setSeries] = useStr({ top: true, e1rm: true, avg: false, volume: true });

  // The data the chart works against
  const sessions = useStrMemo(() => {
    if (!history) return [];
    return history.sessions.map(s => ({
      ...s,
      avgW: RepsStrength.avgSetWeight(s),
      _date: new Date(s.date + "T00:00:00Z"),
      block: RepsStrength.blockFor(s.date, blockRanges)
    }));
  }, [history, blockRanges]);

  const compareSessions = useStrMemo(() => {
    if (!compareHistory) return null;
    return compareHistory.sessions.map(s => ({
      ...s,
      _date: new Date(s.date + "T00:00:00Z")
    }));
  }, [compareHistory]);

  // Reset hover/pin on exercise change (visibleRange managed by parent).
  // Also drop the cached hero scales so the light hover updater can never
  // position the crosshair with the previous exercise's x-scale.
  useStrE(() => {
    setPinned(null);
    setHover(null);
    if (svgRef.current) svgRef.current.__heroState = null;
  }, [history?.name]);

  // Live reference to `pinned` for drawHero's contextmenu handler (no re-render needed).
  const pinnedRef = useStrRef(null);
  useStrE(() => { pinnedRef.current = pinned; }, [pinned]);

  // Draw the main chart (structural — only on sessions/range/series/blocks change)
  useStrE(() => {
    if (!svgRef.current || !sessions.length || !visibleRange) return;
    drawHero({
      svg: d3.select(svgRef.current),
      sessions,
      compareSessions,
      compareName: compareHistory?.name,
      visibleRange,
      series,
      blockRanges,
      annotations,
      onHover: setHover,
      onClick: (s) => setPinned(p => p && p.date === s.date ? null : s),
      getPinned: () => pinnedRef.current
    });
  }, [sessions, compareSessions, compareHistory, visibleRange, series, blockRanges, annotations]);

  // Apply rep-bucket cross-highlight (from donut hover)
  useStrE(() => {
    if (!svgRef.current) return;
    applyBucketHighlight(d3.select(svgRef.current), highlightBucket);
  }, [highlightBucket, sessions, visibleRange, series]);

  // Light update — only crosshair + dot highlight on hover/pin change
  useStrE(() => {
    if (!svgRef.current || !sessions.length || !visibleRange) return;
    updateHoverState({
      svg: d3.select(svgRef.current),
      sessions,
      visibleRange,
      hover, pinned
    });
  }, [hover, pinned, sessions, visibleRange]);

  // Draw brush mini-map
  useStrE(() => {
    if (!brushSvgRef.current || !sessions.length) return;
    drawBrush({
      svg: d3.select(brushSvgRef.current),
      sessions,
      visibleRange,
      blockRanges,
      onBrush: setVisibleRange
    });
  }, [sessions, blockRanges, visibleRange]);

  if (!sessions.length) {
    return <div className="empty" style={{padding: 40, textAlign: "center"}}>No history yet for this exercise.</div>;
  }

  // Tooltip content rendered in React (positioned by D3)
  return (
    <div className="strength-hero">
      <div className="strength-chips">
        <ChipToggle on={series.top} onClick={() => setSeries(s => ({ ...s, top: !s.top }))} color="ink" label="top set" />
        <ChipToggle on={series.e1rm} onClick={() => setSeries(s => ({ ...s, e1rm: !s.e1rm }))} color="accent" dashed label="est 1RM" />
        <ChipToggle on={series.avg} onClick={() => setSeries(s => ({ ...s, avg: !s.avg }))} color="muted" label="avg set" />
        <ChipToggle on={series.volume} onClick={() => setSeries(s => ({ ...s, volume: !s.volume }))} color="good" dashed label="volume" />
        {pinned && (
          <button className="strength-chip" onClick={() => onAnnotate?.(pinned.date)}
            title="Annotate the pinned session"
            style={{color: "var(--accent-ink)", borderColor: "var(--accent-line)"}}>
            <StrIcons.Edit /> annotate
          </button>
        )}
        {pinned && (
          <button className="strength-chip strength-chip-clear" onClick={() => setPinned(null)} title="Clear pinned point">
            <StrIcons.X /> clear pin
          </button>
        )}
      </div>
      <svg ref={svgRef} viewBox="0 0 700 360" className="strength-svg" preserveAspectRatio="xMidYMid meet" />
      <svg ref={brushSvgRef} viewBox="0 0 700 48" className="strength-brush" preserveAspectRatio="xMidYMid meet" />
      <div className="strength-brush-foot">
        <span>{visibleRange ? `${RepsData.shortDate(toIso(visibleRange[0]))} → ${RepsData.shortDate(toIso(visibleRange[1]))}` : "full range"}</span>
        <span style={{color: "var(--faint)"}}>click a point to pin · drag the strip to zoom · right-click to clear pin</span>
      </div>
      {(hover || pinned) && (
        <HeroTooltip
          session={hover || pinned}
          pinned={pinned && hover && hover.date !== pinned.date ? pinned : null}
          hoverIsPinned={!!hover && !!pinned && hover.date === pinned.date}
          annotation={annotations?.[(hover || pinned).date] || null} />
      )}
    </div>
  );
}

function ChipToggle({ on, onClick, color, dashed, label }) {
  const colors = {
    ink: "var(--ink)",
    accent: "var(--accent)",
    muted: "var(--muted)",
    good: "var(--good)"
  };
  return (
    <button className={`strength-chip ${on ? "is-on" : ""}`} onClick={onClick}>
      <span
        className="strength-chip-swatch"
        style={{
          background: dashed ? "transparent" : colors[color],
          borderTop: dashed ? `2px dashed ${colors[color]}` : "none",
          height: dashed ? 0 : 2
        }}
      />
      {label}
    </button>
  );
}

function HeroTooltip({ session, pinned, hoverIsPinned, annotation }) {
  if (!session) return null;
  const annType = annotation ? STR_ANNOTATION_BY_ID[annotation.type] : null;
  const fmtKg = (v) => v == null ? "—" : `${(Math.round(v * 10) / 10).toFixed(1)} kg`;
  return (
    <div className="strength-tooltip" id="strength-tooltip-host">
      <div className="strength-tooltip-head">
        <span className="mono">{RepsData.shortDate(session.date)}</span>
        <span className="mono" style={{color: "var(--muted)"}}>
          {session.block ? `${session.block}` : ""}
          {session.split ? ` · ${session.split}` : ""}
          {hoverIsPinned ? " · pinned" : ""}
        </span>
      </div>
      <div className="strength-tooltip-row">
        <span className="lbl">top set</span>
        <span className="val">
          <strong>{session.maxWeight}</strong>{session.unit} × {session.topReps}
          {session.isWeightPR && <span className="pr-pill" title="All-time weight PR">PR</span>}
        </span>
      </div>
      <div className="strength-tooltip-row">
        <span className="lbl">est 1RM</span>
        <span className="val mono">{Math.round(session.est1rm)} kg{session.isE1rmPR && <span className="pr-pill" title="Estimated 1RM PR">PR</span>}</span>
      </div>
      <div className="strength-tooltip-row">
        <span className="lbl">volume</span>
        <span className="val mono">
          {Math.round(session.volume).toLocaleString()} kg-reps ({session.totalSets} sets)
          {session.isVolumePR && <span className="pr-pill" title="All-time volume PR">PR</span>}
        </span>
      </div>
      <div className="strength-tooltip-row">
        <span className="lbl">total reps</span>
        <span className="val mono">{session.totalReps || 0}</span>
      </div>
      <div className="strength-tooltip-row">
        <span className="lbl">avg set</span>
        <span className="val mono">{fmtKg(session.avgW)}</span>
      </div>
      {annotation && (
        <div className="strength-tooltip-compare" style={{marginTop: 6, paddingTop: 6}}>
          <div className="strength-tooltip-compare-head" style={{display: "flex", alignItems: "center", gap: 6}}>
            <span style={{color: annType?.color}}>{annType?.glyph || "?"}</span>
            <span>{annType?.label || annotation.type}</span>
          </div>
          {annotation.note && (
            <div style={{fontSize: 12, color: "var(--ink)", marginTop: 2, lineHeight: 1.4}}>{annotation.note}</div>
          )}
        </div>
      )}
      {pinned && (
        <div className="strength-tooltip-compare">
          <div className="strength-tooltip-compare-head">vs pinned · {RepsData.shortDate(pinned.date)}</div>
          {(() => {
            const cmp = RepsStrength.compareSessions(session, pinned);
            const fmt = (n, unit) => `${n > 0 ? "+" : ""}${(Math.round(n * 10) / 10).toFixed(1)}${unit || ""}`;
            const cls = (n) => n > 0 ? "good" : n < 0 ? "bad" : "flat";
            return (
              <div className="strength-tooltip-deltas">
                <div><span className="lbl">Δ top</span> <span className={`val mono ${cls(cmp.weightDelta)}`}>{fmt(cmp.weightDelta, " kg")}</span></div>
                <div><span className="lbl">Δ 1RM</span> <span className={`val mono ${cls(cmp.e1rmDelta)}`}>{fmt(cmp.e1rmDelta, " kg")}</span></div>
                <div><span className="lbl">Δ vol</span> <span className={`val mono ${cls(cmp.volumeDelta)}`}>{fmt(cmp.volumeDelta, "")}</span></div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

// ============================================================================
// D3 drawing functions — pure, no React state writes (callbacks delegate up).
// ============================================================================
function drawHero({ svg, sessions, compareSessions, compareName, visibleRange, series, blockRanges, annotations, onHover, onClick, getPinned }) {
  const W = 700, H = 360;
  const M = { top: 22, right: 50, bottom: 26, left: 48 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  // Filter to visible window
  const inWindow = sessions.filter(s => s._date >= visibleRange[0] && s._date <= visibleRange[1]);
  // Tag PRs only within full history (not just visible) so PR markers are stable
  const allTagged = RepsStrength.tagPRs(sessions);
  const taggedMap = new Map(allTagged.map(s => [s.date, s]));
  const visTagged = inWindow.map(s => ({ ...s, ...taggedMap.get(s.date) }));

  // Scales — include compare sessions in y bounds so both curves fit
  const x = d3.scaleTime().domain(visibleRange).range([0, iw]);
  const compInWindow = (compareSessions || []).filter(s => s._date >= visibleRange[0] && s._date <= visibleRange[1]);
  const yPoints = [...visTagged, ...compInWindow.map(s => ({ maxWeight: s.maxWeight, est1rm: s.est1rm }))];
  const [yLo, yHi] = RepsStrength.smartYBounds(yPoints);
  const y = d3.scaleLinear().domain([yLo, yHi]).range([ih, 0]).nice();
  const volumeValues = visTagged.map(s => s.volume).filter(v => Number.isFinite(v));
  const yVol = d3.scaleLinear()
    .domain([0, Math.max(1, ...volumeValues) * 1.08])
    .range([ih, 0])
    .nice();

  // Root group (create once) — preserveAspectRatio is set in JSX (xMidYMid meet)
  let root = svg.select("g.root");
  if (root.empty()) {
    root = svg.append("g").attr("class", "root").attr("transform", `translate(${M.left},${M.top})`);
    root.append("g").attr("class", "bands");
    root.append("g").attr("class", "grid");
    root.append("g").attr("class", "lines");
    root.append("g").attr("class", "dots");
    root.append("g").attr("class", "prs");
    root.append("g").attr("class", "xaxis").attr("transform", `translate(0,${ih})`);
    root.append("g").attr("class", "yaxis");
    root.append("g").attr("class", "yaxisR").attr("transform", `translate(${iw},0)`);
    root.append("g").attr("class", "hover");
    root.append("rect").attr("class", "capture")
      .attr("width", iw).attr("height", ih).attr("fill", "transparent");
  }
  let yAxisR = root.select("g.yaxisR");
  if (yAxisR.empty()) yAxisR = root.append("g").attr("class", "yaxisR");
  yAxisR.attr("transform", `translate(${iw},0)`);

  // Block bands
  const bandData = blockRanges.map(b => {
    const x1 = x(new Date(b.start + "T00:00:00Z"));
    const x2 = x(new Date(b.end + "T00:00:00Z"));
    return { id: b.id, label: b.label, x1, x2 };
  }).filter(b => b.x2 > 0 && b.x1 < iw);
  const bands = root.select("g.bands").selectAll("g.band").data(bandData, d => d.id);
  bands.exit().remove();
  const bandEnter = bands.enter().append("g").attr("class", "band");
  bandEnter.append("rect").attr("y", 0).attr("height", ih)
    .attr("fill", "currentColor").attr("fill-opacity", 0.04);
  bandEnter.append("text").attr("y", 12)
    .attr("font-family", "var(--font-mono)").attr("font-size", 10)
    .attr("fill", "currentColor").attr("fill-opacity", 0.45)
    .attr("text-anchor", "middle");
  const bandAll = bandEnter.merge(bands);
  bandAll.select("rect")
    .attr("x", d => Math.max(0, d.x1))
    .attr("width", d => Math.max(0, Math.min(iw, d.x2) - Math.max(0, d.x1)));
  bandAll.select("text")
    .attr("x", d => (Math.max(0, d.x1) + Math.min(iw, d.x2)) / 2)
    .text(d => d.label);

  // Grid lines
  const gridG = root.select("g.grid");
  const xTicks = x.ticks(6);
  const yTicks = y.ticks(5);
  const gx = gridG.selectAll("line.gx").data(xTicks);
  gx.exit().remove();
  gx.enter().append("line").attr("class", "gx")
    .attr("stroke", "currentColor").attr("stroke-opacity", 0.07)
    .merge(gx)
    .attr("x1", d => x(d)).attr("x2", d => x(d))
    .attr("y1", 0).attr("y2", ih);
  const gy = gridG.selectAll("line.gy").data(yTicks);
  gy.exit().remove();
  gy.enter().append("line").attr("class", "gy")
    .attr("stroke", "currentColor").attr("stroke-opacity", 0.07)
    .merge(gy)
    .attr("y1", d => y(d)).attr("y2", d => y(d))
    .attr("x1", 0).attr("x2", iw);

  // Lines + faint area fill under the top-set line for visual depth
  const linesG = root.select("g.lines");
  const lineTop = d3.line().curve(d3.curveMonotoneX).x(d => x(d._date)).y(d => y(d.maxWeight));
  const lineE = d3.line().curve(d3.curveMonotoneX).x(d => x(d._date)).y(d => y(d.est1rm));
  const lineAvg = d3.line().curve(d3.curveMonotoneX).defined(d => d.avgW != null).x(d => x(d._date)).y(d => y(d.avgW));
  const lineVol = d3.line().curve(d3.curveMonotoneX).defined(d => d.volume != null).x(d => x(d._date)).y(d => yVol(d.volume));
  const areaTop = d3.area().curve(d3.curveMonotoneX).x(d => x(d._date)).y0(ih).y1(d => y(d.maxWeight));

  // Make sure a clipPath exists so transitions don't draw outside the plot
  let defs = svg.select("defs");
  if (defs.empty()) {
    defs = svg.append("defs");
    defs.append("clipPath").attr("id", "strength-clip")
      .append("rect").attr("x", 0).attr("y", 0).attr("width", iw).attr("height", ih);
  } else {
    defs.select("clipPath#strength-clip rect").attr("width", iw).attr("height", ih);
  }
  linesG.attr("clip-path", "url(#strength-clip)");

  const ensure = (cls, attrs) => {
    let sel = linesG.select(`path.${cls}`);
    if (sel.empty()) sel = linesG.append("path").attr("class", cls).attr("fill", "none");
    for (const [k, v] of Object.entries(attrs)) sel.attr(k, v);
    return sel;
  };

  // Area fill — sits underneath everything
  ensure("top-area", { fill: "var(--ink)", "fill-opacity": series.top ? 0.06 : 0, stroke: "none" })
    .transition().duration(220).attr("d", areaTop(visTagged) || "");
  ensure("top", { stroke: "var(--ink)", "stroke-width": 1.7, "stroke-opacity": series.top ? 1 : 0 })
    .transition().duration(220).attr("d", lineTop(visTagged) || "");
  ensure("e", { stroke: "var(--accent)", "stroke-width": 1.5, "stroke-dasharray": "4 3", "stroke-opacity": series.e1rm ? 1 : 0 })
    .transition().duration(220).attr("d", lineE(visTagged) || "");
  ensure("avg", { stroke: "var(--muted)", "stroke-width": 1, "stroke-opacity": series.avg ? 0.85 : 0 })
    .transition().duration(220).attr("d", lineAvg(visTagged) || "");
  ensure("volume", { stroke: "var(--good)", "stroke-width": 1.4, "stroke-dasharray": "2 3", "stroke-opacity": series.volume && volumeValues.length ? 0.9 : 0 })
    .transition().duration(220).attr("d", series.volume && volumeValues.length ? (lineVol(visTagged) || "") : "");

  // Compare line — second exercise overlaid in a muted accent
  if (compareSessions && compInWindow.length) {
    ensure("compare", { stroke: "var(--accent)", "stroke-width": 1.4, "stroke-opacity": 0.55, "stroke-dasharray": "1 0" })
      .transition().duration(220).attr("d", lineTop(compInWindow) || "");
    // Compare dots
    const cmpDots = root.select("g.dots").selectAll("circle.cmppt").data(compInWindow, d => "c-" + d.date);
    cmpDots.exit().remove();
    cmpDots.enter().append("circle").attr("class", "cmppt").attr("r", 2.2)
      .attr("stroke", "var(--surface)").attr("stroke-width", 0.8)
      .merge(cmpDots)
      .attr("cx", d => x(d._date))
      .attr("cy", d => y(d.maxWeight))
      .attr("fill", "var(--accent)")
      .attr("fill-opacity", 0.7);
    // Compare label in the top-right of the plot
    let cLabel = root.select("text.cmplabel");
    if (cLabel.empty()) {
      cLabel = root.append("text").attr("class", "cmplabel")
        .attr("font-family", "var(--font-mono)").attr("font-size", 10)
        .attr("fill", "var(--accent)").attr("fill-opacity", 0.85)
        .attr("text-anchor", "end");
    }
    cLabel.attr("x", iw - 4).attr("y", 12).text(`vs ${compareName}`);
  } else {
    linesG.selectAll("path.compare").attr("stroke-opacity", 0).attr("d", "");
    root.select("g.dots").selectAll("circle.cmppt").remove();
    root.select("text.cmplabel").remove();
  }

  // Regression projection — 4 weeks of forward extrapolation, faint dashed
  if (series.top && visTagged.length >= 4) {
    const proj = RepsStrength.projectForward(visTagged, 28);
    if (proj) {
      const projData = [
        { _date: new Date(visTagged[visTagged.length - 1].date + "T00:00:00Z"), maxWeight: visTagged[visTagged.length - 1].maxWeight },
        { _date: proj.endDate, maxWeight: proj.endValue }
      ];
      ensure("proj", { stroke: "var(--ink)", "stroke-width": 1.2, "stroke-dasharray": "2 4", "stroke-opacity": 0.35 })
        .transition().duration(220).attr("d", lineTop(projData) || "");
    } else {
      ensure("proj", { "stroke-opacity": 0 });
    }
  } else {
    ensure("proj", { "stroke-opacity": 0 });
  }

  // Dots — base fill is ink; hover/pinned highlighting is applied in updateHoverState
  const dotsG = root.select("g.dots");
  const dots = dotsG.selectAll("circle.pt").data(visTagged, d => d.date);
  dots.exit().remove();
  dots.enter().append("circle").attr("class", "pt").attr("r", 3)
    .attr("stroke", "var(--surface)").attr("stroke-width", 1)
    .merge(dots)
    .attr("cx", d => x(d._date))
    .attr("cy", d => y(d.maxWeight))
    .attr("fill", "var(--ink)");

  // PR markers (diamond glyphs)
  const prData = visTagged.filter(d => d.isWeightPR);
  const symDiamond = d3.symbol().type(d3.symbolDiamond).size(70);
  const prs = root.select("g.prs").selectAll("path.pr").data(prData, d => d.date);
  prs.exit().remove();
  prs.enter().append("path").attr("class", "pr")
    .attr("stroke", "var(--surface)").attr("stroke-width", 1)
    .merge(prs)
    .attr("d", symDiamond)
    .attr("transform", d => `translate(${x(d._date)}, ${y(d.maxWeight) - 12})`)
    .attr("fill", "var(--accent)");

  // User annotations — rendered as small colored glyphs above the line
  const annData = Object.entries(annotations || {})
    .map(([date, ann]) => ({ date, ann, _date: new Date(date + "T00:00:00Z") }))
    .filter(a => a._date >= visibleRange[0] && a._date <= visibleRange[1]);
  let annG = root.select("g.anns");
  if (annG.empty()) annG = root.append("g").attr("class", "anns");
  const annSel = annG.selectAll("g.ann").data(annData, d => d.date);
  annSel.exit().remove();
  const annEnter = annSel.enter().append("g").attr("class", "ann").style("cursor", "default");
  annEnter.append("circle").attr("class", "ann-bg").attr("r", 8)
    .attr("fill", "var(--surface)").attr("stroke", "var(--hairline)").attr("stroke-width", 1);
  annEnter.append("text").attr("class", "ann-glyph")
    .attr("text-anchor", "middle").attr("dy", 3.5)
    .attr("font-family", "var(--font-mono)").attr("font-size", 10).attr("font-weight", 500);
  annEnter.append("title");
  const annAll = annEnter.merge(annSel);
  annAll.attr("transform", d => `translate(${x(d._date)}, 6)`);
  annAll.select("circle.ann-bg").attr("stroke", d => STR_ANNOTATION_BY_ID[d.ann.type]?.color || "var(--ink)");
  annAll.select("text.ann-glyph")
    .attr("fill", d => STR_ANNOTATION_BY_ID[d.ann.type]?.color || "var(--ink)")
    .text(d => STR_ANNOTATION_BY_ID[d.ann.type]?.glyph || "?");
  annAll.select("title").text(d => {
    const t = STR_ANNOTATION_BY_ID[d.ann.type]?.label || d.ann.type;
    return `${t}${d.ann.note ? " — " + d.ann.note : ""}`;
  });

  // Axes
  const xAxis = root.select("g.xaxis")
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%b %d")).tickSize(0));
  xAxis.selectAll("text").attr("font-family", "var(--font-mono)").attr("font-size", 10).attr("fill", "currentColor").attr("fill-opacity", 0.55);
  xAxis.select(".domain").remove();
  const yAxis = root.select("g.yaxis")
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d} kg`).tickSize(0));
  yAxis.selectAll("text").attr("font-family", "var(--font-mono)").attr("font-size", 10).attr("fill", "currentColor").attr("fill-opacity", 0.55).attr("x", -8);
  yAxis.select(".domain").remove();
  if (series.volume && volumeValues.length) {
    yAxisR
      .call(d3.axisRight(yVol).ticks(4).tickFormat(d => d >= 1000 ? `${(d / 1000).toFixed(d >= 10000 ? 0 : 1)}k` : `${Math.round(d)}`).tickSize(0));
    yAxisR.selectAll("text")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", 10)
      .attr("fill", "var(--good)")
      .attr("fill-opacity", 0.75)
      .attr("x", 8);
    yAxisR.select(".domain").remove();
  } else {
    yAxisR.selectAll("*").remove();
  }

  // Hover/pin layers (positioned by updateHoverState)
  const hoverG = root.select("g.hover");
  if (hoverG.select("line.crosshair").empty()) {
    hoverG.append("line").attr("class", "crosshair")
      .attr("y1", 0).attr("y2", ih)
      .attr("stroke", "var(--ink)").attr("stroke-opacity", 0.25)
      .attr("pointer-events", "none").style("display", "none");
  }
  if (hoverG.select("line.pinline").empty()) {
    hoverG.append("line").attr("class", "pinline")
      .attr("y1", 0).attr("y2", ih)
      .attr("stroke", "var(--accent)").attr("stroke-opacity", 0.55).attr("stroke-dasharray", "2 3")
      .attr("pointer-events", "none").style("display", "none");
  }

  // Stash scales + visible data on the root so the lightweight hover updater can use them
  svg.node().__heroState = { x, y, ih, iw, visTagged };

  // Mouse capture (full interactive surface)
  const capture = root.select("rect.capture");
  capture
    .on("mousemove", function (event) {
      const [mx] = d3.pointer(event, root.node());
      const near = RepsStrength.nearestByX(visTagged, (d) => x(d._date), mx);
      onHover(near);
    })
    .on("mouseleave", function () { onHover(null); })
    .on("click", function (event) {
      const [mx] = d3.pointer(event, root.node());
      const near = RepsStrength.nearestByX(visTagged, (d) => x(d._date), mx);
      if (near) onClick(near);
    })
    .on("contextmenu", function (event) {
      event.preventDefault();
      const cur = getPinned && getPinned();
      if (cur) onClick(cur); // toggle off
    });
}

// Cross-filter from donut: fade dots whose top set doesn't fall in the bucket.
function applyBucketHighlight(svg, bucket) {
  const root = svg.select("g.root");
  if (!bucket) {
    root.selectAll("circle.pt").attr("opacity", 1);
    return;
  }
  const [lo, hi] = (() => {
    switch (bucket) {
      case "1-5": return [1, 5];
      case "6-8": return [6, 8];
      case "9-12": return [9, 12];
      case "13-20": return [13, 20];
      case "21+": return [21, Infinity];
      default: return [-1, -1];
    }
  })();
  root.selectAll("circle.pt").attr("opacity", function (d) {
    return d.topReps >= lo && d.topReps <= hi ? 1 : 0.15;
  });
}

// Light hover/pin updater — only moves the crosshair and re-fills the matching dots.
function updateHoverState({ svg, sessions, visibleRange, hover, pinned }) {
  const state = svg.node().__heroState;
  if (!state) return;
  const { x } = state;
  const root = svg.select("g.root");

  const crosshair = root.select("line.crosshair");
  if (hover) crosshair.attr("x1", x(hover._date)).attr("x2", x(hover._date)).style("display", null);
  else crosshair.style("display", "none");

  const pinLine = root.select("line.pinline");
  if (pinned && pinned._date) pinLine.attr("x1", x(pinned._date)).attr("x2", x(pinned._date)).style("display", null);
  else pinLine.style("display", "none");

  // Update dot fills (cheap)
  const hoverDate = hover?.date;
  const pinDate = pinned?.date;
  root.selectAll("circle.pt").attr("fill", function (d) {
    if (d.date === hoverDate || d.date === pinDate) return "var(--accent)";
    return "var(--ink)";
  });
}

function drawBrush({ svg, sessions, visibleRange, blockRanges, onBrush }) {
  const W = 700, H = 48;
  const M = { top: 4, right: 18, bottom: 14, left: 48 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  let root = svg.select("g.root");
  if (root.empty()) {
    root = svg.append("g").attr("class", "root").attr("transform", `translate(${M.left},${M.top})`);
    root.append("g").attr("class", "bands");
    root.append("path").attr("class", "spark").attr("fill", "none");
    root.append("g").attr("class", "brush");
    root.append("g").attr("class", "xaxis").attr("transform", `translate(0,${ih})`);
  }

  const xFull = d3.scaleTime()
    .domain([sessions[0]._date, sessions[sessions.length - 1]._date])
    .range([0, iw]);
  const yLo = d3.min(sessions, d => d.maxWeight);
  const yHi = d3.max(sessions, d => d.maxWeight);
  const yFull = d3.scaleLinear().domain([yLo, yHi]).range([ih, 0]);

  // Block bands in mini
  const bandData = blockRanges.map(b => ({
    id: b.id, label: b.label,
    x1: xFull(new Date(b.start + "T00:00:00Z")),
    x2: xFull(new Date(b.end + "T00:00:00Z"))
  }));
  const bands = root.select("g.bands").selectAll("rect.bb").data(bandData, d => d.id);
  bands.exit().remove();
  bands.enter().append("rect").attr("class", "bb")
    .attr("y", 0).attr("height", ih)
    .attr("fill", "currentColor").attr("fill-opacity", 0.05)
    .merge(bands)
    .attr("x", d => Math.max(0, d.x1))
    .attr("width", d => Math.max(0, Math.min(iw, d.x2) - Math.max(0, d.x1)));

  // Sparkline
  const lineGen = d3.line().curve(d3.curveMonotoneX).x(d => xFull(d._date)).y(d => yFull(d.maxWeight));
  root.select("path.spark")
    .attr("stroke", "var(--muted)").attr("stroke-width", 1).attr("stroke-opacity", 0.7)
    .attr("d", lineGen(sessions));

  // X axis
  const xa = root.select("g.xaxis").call(d3.axisBottom(xFull).ticks(4).tickFormat(d3.timeFormat("%b")).tickSize(0));
  xa.selectAll("text").attr("font-family", "var(--font-mono)").attr("font-size", 9).attr("fill", "currentColor").attr("fill-opacity", 0.45);
  xa.select(".domain").remove();

  // Brush — created ONCE per svg node and re-used: re-creating it on every
  // redraw re-installed D3's internal drag listeners and made fast drags fire
  // duplicated events. Only the user handler is refreshed per draw so it
  // closes over the current sessions/xFull. Programmatic brush.move(...) calls
  // below are ignored via the sourceEvent guard to avoid a React feedback loop.
  const brushG = root.select("g.brush");
  let brush = svg.node().__miniBrush;
  if (!brush) {
    brush = d3.brushX().extent([[0, 0], [iw, ih]]);
    svg.node().__miniBrush = brush;
    brushG.call(brush);
  }
  brush.on("brush end", function (event) {
    if (!event.sourceEvent) return;
    if (!event.selection) {
      onBrush([sessions[0]._date, sessions[sessions.length - 1]._date]);
      return;
    }
    const [a, b] = event.selection;
    onBrush([xFull.invert(a), xFull.invert(b)]);
  });

  // Set initial selection from visibleRange
  if (visibleRange) {
    const [a, b] = visibleRange;
    const sel = [xFull(a), xFull(b)];
    const cur = d3.brushSelection(brushG.node());
    const isFull = Math.abs(sel[0] - 0) < 1 && Math.abs(sel[1] - iw) < 1;
    if (!cur && !isFull) brushG.call(brush.move, sel);
    else if (cur && (Math.abs(cur[0] - sel[0]) > 0.5 || Math.abs(cur[1] - sel[1]) > 0.5) && !isFull) {
      brushG.call(brush.move, sel);
    }
  }

  // Style brush
  brushG.selectAll(".selection")
    .attr("fill", "var(--accent)").attr("fill-opacity", 0.08)
    .attr("stroke", "var(--accent)").attr("stroke-opacity", 0.55);
  brushG.selectAll(".handle")
    .attr("fill", "var(--accent)").attr("fill-opacity", 0.5);
}

// ============================================================================
// Phase 2 — supporting visualisations
// ============================================================================

// --- Rep range donut ---------------------------------------------------------
function RepRangeDonut({ history, visibleRange, onHoverBucket }) {
  const svgRef = useStrRef(null);
  const dateFrom = visibleRange ? toIso(visibleRange[0]) : null;
  const dateTo = visibleRange ? toIso(visibleRange[1]) : null;

  const buckets = useStrMemo(
    () => RepsStrength.repBucketsInRange(history, dateFrom, dateTo),
    [history, dateFrom, dateTo]
  );
  const total = buckets.reduce((s, b) => s + b.count, 0);

  useStrE(() => {
    if (!svgRef.current) return;
    drawDonut(d3.select(svgRef.current), buckets, total, onHoverBucket);
  }, [buckets, total, onHoverBucket]);

  return (
    <div className="strength-donut-wrap">
      <svg ref={svgRef} viewBox="0 0 240 200" className="strength-donut-svg" preserveAspectRatio="xMidYMid meet" />
      <div className="strength-donut-legend">
        {buckets.map(b => {
          const pct = total ? Math.round((b.count / total) * 100) : 0;
          return (
            <div key={b.id} className="strength-donut-legend-row"
              onMouseEnter={() => onHoverBucket(b.id)}
              onMouseLeave={() => onHoverBucket(null)}>
              <span className={`strength-donut-swatch s-${b.id.replace("+", "p")}`}></span>
              <span className="lbl">{b.label}</span>
              <span className="val mono">{b.count}</span>
              <span className="pct mono">{pct}%</span>
            </div>
          );
        })}
        {total === 0 && (
          <div className="empty" style={{padding: 10, fontSize: 11}}>No sets in this range.</div>
        )}
      </div>
    </div>
  );
}

function drawDonut(svg, buckets, total, onHover) {
  const W = 240, H = 200, cx = 120, cy = 100, r = 78, ir = 50;
  let root = svg.select("g.root");
  if (root.empty()) {
    root = svg.append("g").attr("class", "root").attr("transform", `translate(${cx},${cy})`);
    root.append("text").attr("class", "center-num")
      .attr("text-anchor", "middle").attr("dy", -6)
      .attr("font-family", "var(--font-sans)").attr("font-weight", 500)
      .attr("font-size", 28).attr("fill", "currentColor")
      .style("letter-spacing", "-0.01em");
    root.append("text").attr("class", "center-lbl-top")
      .attr("text-anchor", "middle").attr("dy", 8)
      .attr("font-family", "var(--font-mono)").attr("font-size", 9)
      .attr("fill", "currentColor").attr("fill-opacity", 0.55)
      .style("letter-spacing", "0.06em")
      .style("text-transform", "uppercase")
      .text("working sets");
    root.append("text").attr("class", "center-lbl-bot")
      .attr("text-anchor", "middle").attr("dy", 22)
      .attr("font-family", "var(--font-mono)").attr("font-size", 9)
      .attr("fill", "currentColor").attr("fill-opacity", 0.4)
      .style("letter-spacing", "0.06em");
  }
  // Top bucket label under the count
  if (total > 0) {
    const topBucket = [...buckets].sort((a, b) => b.count - a.count)[0];
    const topPct = Math.round((topBucket.count / total) * 100);
    root.select("text.center-lbl-bot").text(`${topPct}% in ${topBucket.id}`);
  } else {
    root.select("text.center-lbl-bot").text("");
  }

  const colorFor = (id) => {
    switch (id) {
      case "1-5":   return "var(--accent)";
      case "6-8":   return "color-mix(in oklch, var(--accent) 70%, var(--ink))";
      case "9-12":  return "var(--ink)";
      case "13-20": return "color-mix(in oklch, var(--ink) 55%, var(--surface))";
      case "21+":   return "color-mix(in oklch, var(--ink) 30%, var(--surface))";
      default:      return "var(--muted)";
    }
  };

  root.select("text.center-num").text(total);

  if (total === 0) {
    root.selectAll("path.slice").remove();
    return;
  }

  const pie = d3.pie().value(d => d.count).sort(null).padAngle(0.012);
  const arc = d3.arc().innerRadius(ir).outerRadius(r).cornerRadius(2);
  const arcHover = d3.arc().innerRadius(ir - 4).outerRadius(r + 4).cornerRadius(2);

  const arcs = pie(buckets);
  const sel = root.selectAll("path.slice").data(arcs, d => d.data.id);
  sel.exit().remove();
  const enter = sel.enter().append("path").attr("class", d => `slice s-${d.data.id.replace("+", "p")}`)
    .attr("fill", d => colorFor(d.data.id))
    .attr("stroke", "var(--surface)").attr("stroke-width", 1)
    .each(function (d) { this._current = d; });
  enter.merge(sel)
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => onHover(d.data.id))
    .on("mouseleave", () => onHover(null))
    .transition().duration(240)
    .attrTween("d", function (d) {
      const i = d3.interpolate(this._current || d, d);
      this._current = i(1);
      return t => arc(i(t));
    });
}

// --- Calendar heatmap ---------------------------------------------------------
function CalendarHeatmap({ history, weeks, onPickDate }) {
  const svgRef = useStrRef(null);
  const cells = useStrMemo(() => RepsStrength.heatmapCells(history, weeks), [history, weeks]);

  useStrE(() => {
    if (!svgRef.current) return;
    drawHeatmap(d3.select(svgRef.current), cells, onPickDate);
  }, [cells, onPickDate]);

  return (
    <div className="strength-heatmap-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${weeks * 13 + 28} 100`} className="strength-heatmap-svg" preserveAspectRatio="xMidYMid meet" />
    </div>
  );
}

function drawHeatmap(svg, { cols, startMonday, endSunday }, onPickDate) {
  const cellSize = 11, gap = 2, leftLabel = 22, topLabel = 12;
  let root = svg.select("g.root");
  if (root.empty()) {
    root = svg.append("g").attr("class", "root").attr("transform", `translate(${leftLabel},${topLabel})`);
    root.append("g").attr("class", "cells");
    root.append("g").attr("class", "dayLabels");
    root.append("g").attr("class", "monthLabels");
  }

  // Day-of-week labels
  const dayLabels = ["", "Tue", "", "Thu", "", "Sat", ""];
  const dl = root.select("g.dayLabels").selectAll("text").data(dayLabels);
  dl.exit().remove();
  dl.enter().append("text").merge(dl)
    .attr("x", -6).attr("y", (_, i) => i * (cellSize + gap) + cellSize - 2)
    .attr("text-anchor", "end")
    .attr("font-family", "var(--font-mono)").attr("font-size", 9)
    .attr("fill", "currentColor").attr("fill-opacity", 0.45)
    .text(d => d);

  // Flatten cells with positions
  const flat = [];
  cols.forEach((col, ci) => col.forEach((cell, di) => flat.push({ ...cell, ci, di })));

  // Color scale — fixed buckets feel more legible than continuous
  const colorFor = (sets, future) => {
    if (future) return "transparent";
    if (sets === 0) return "var(--surface-2)";
    if (sets <= 2) return "color-mix(in oklch, var(--accent) 22%, var(--surface))";
    if (sets <= 4) return "color-mix(in oklch, var(--accent) 50%, var(--surface))";
    if (sets <= 6) return "color-mix(in oklch, var(--accent) 75%, var(--surface))";
    return "var(--accent)";
  };

  const cells = root.select("g.cells").selectAll("rect").data(flat, d => d.date);
  cells.exit().remove();
  cells.enter().append("rect")
    .attr("rx", 2).attr("width", cellSize).attr("height", cellSize)
    .merge(cells)
    .attr("x", d => d.ci * (cellSize + gap))
    .attr("y", d => d.di * (cellSize + gap))
    .attr("fill", d => colorFor(d.sets, d.future))
    .attr("stroke", d => d.future ? "var(--hairline)" : "none")
    .attr("stroke-width", 0.5)
    .style("cursor", d => d.future ? "default" : "pointer")
    .on("click", (event, d) => { if (!d.future && onPickDate) onPickDate(d.date); })
    .append("title")
    .text(d => `${d.date} · ${d.sets} sets${d.future ? " (future)" : ""}`);

  // Month labels above (only when month changes)
  const monthMarks = [];
  let lastMonth = null;
  cols.forEach((col, ci) => {
    const mondayMonth = col[0].date.slice(5, 7);
    if (mondayMonth !== lastMonth) {
      monthMarks.push({ ci, label: new Date(col[0].date + "T00:00:00Z").toLocaleString("en-GB", { month: "short", timeZone: "UTC" }) });
      lastMonth = mondayMonth;
    }
  });
  const ml = root.select("g.monthLabels").selectAll("text").data(monthMarks, d => d.ci);
  ml.exit().remove();
  ml.enter().append("text").merge(ml)
    .attr("x", d => d.ci * (cellSize + gap))
    .attr("y", -3)
    .attr("font-family", "var(--font-mono)").attr("font-size", 9)
    .attr("fill", "currentColor").attr("fill-opacity", 0.55)
    .text(d => d.label);
}

// --- Block comparison small multiples ---------------------------------------
function BlockSmallMultiples({ history, blockRanges, onPickRange }) {
  const data = useStrMemo(() => RepsStrength.perBlockSessions(history, blockRanges), [history, blockRanges]);
  if (!data.length) {
    return <div className="empty" style={{padding: 24, fontSize: 12}}>No blocks contain this exercise yet.</div>;
  }
  // Shared Y across all blocks for fair comparison
  const yLo = Math.min(...data.flatMap(b => b.sessions.map(s => s.maxWeight)));
  const yHi = Math.max(...data.flatMap(b => b.sessions.map(s => s.maxWeight)));
  const yRange = Math.max(0.5, yHi - yLo);

  return (
    <div className="strength-multiples-grid">
      {data.map(({ block, sessions }) => {
        const xMin = sessions[0].date;
        const xMax = sessions[sessions.length - 1].date;
        const xDays = Math.max(1, RepsData.daysBetween(xMin, xMax));
        const pts = sessions.map(s => {
          const t = RepsData.daysBetween(xMin, s.date) / xDays;
          const v = (s.maxWeight - yLo) / yRange;
          return [t, v];
        });
        const W = 160, H = 60, pad = 6;
        const dPath = pts.map(([t, v], i) => {
          const x = pad + t * (W - pad * 2);
          const y = (H - pad) - v * (H - pad * 2);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        const peak = sessions.reduce((m, s) => s.maxWeight > m.maxWeight ? s : m, sessions[0]);
        return (
          <button
            key={block.id}
            className="strength-multiple"
            onClick={() => {
              if (onPickRange) {
                onPickRange([
                  new Date(block.start + "T00:00:00Z"),
                  new Date(block.end + "T00:00:00Z")
                ]);
              }
            }}
            title="Click to zoom the hero chart to this block">
            <div className="strength-multiple-head">
              <span className="strength-multiple-name mono">{block.label}</span>
              <span className="strength-multiple-peak mono">{peak.maxWeight}{peak.unit} × {peak.topReps}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{display: "block", width: "100%"}}>
              <path d={dPath} fill="none" stroke="currentColor" strokeWidth="1.4" />
              {pts.map(([t, v], i) => (
                <circle key={i}
                  cx={pad + t * (W - pad * 2)}
                  cy={(H - pad) - v * (H - pad * 2)}
                  r="1.6" fill="currentColor" />
              ))}
            </svg>
            <div className="strength-multiple-foot mono">{sessions.length} sessions · {RepsData.shortDate(block.start)} → {RepsData.shortDate(block.end)}</div>
          </button>
        );
      })}
    </div>
  );
}

// --- Per-session table -------------------------------------------------------
function SessionsTable({ history }) {
  const [sortField, setSortField] = useStr("date");
  const [sortDir, setSortDir] = useStr("desc");
  const [openId, setOpenId] = useStr(null);
  const [showAll, setShowAll] = useStr(false);

  const rows = useStrMemo(() => {
    if (!history) return [];
    const list = [...history.sessions];
    list.sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case "top":   va = a.maxWeight; vb = b.maxWeight; break;
        case "vol":   va = a.volume; vb = b.volume; break;
        case "e1rm":  va = a.est1rm; vb = b.est1rm; break;
        case "sets":  va = a.totalSets; vb = b.totalSets; break;
        case "reps":  va = a.totalReps; vb = b.totalReps; break;
        case "avg":   va = RepsStrength.avgSetWeight(a) || 0; vb = RepsStrength.avgSetWeight(b) || 0; break;
        default:      va = a.date; vb = b.date;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [history, sortField, sortDir]);

  const visible = showAll ? rows : rows.slice(0, 8);

  const sortHead = (label, field, align) => (
    <th
      className={align === "num" ? "num" : ""}
      style={{cursor: "pointer", userSelect: "none", whiteSpace: "nowrap"}}
      onClick={() => {
        if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortField(field); setSortDir(field === "date" ? "desc" : "desc"); }
      }}>
      {label}
      {sortField === field && (
        <span style={{marginLeft: 4, fontSize: 9, color: "var(--accent-ink)"}}>
          {sortDir === "asc" ? "▲" : "▼"}
        </span>
      )}
    </th>
  );

  if (!rows.length) return null;

  return (
    <div className="panel" style={{padding: 0}}>
      <div className="panel-head">
        <h3>All sessions</h3>
        <span className="label">{rows.length} sessions · click a row to expand</span>
      </div>
      <div className="panel-body tight">
        <table className="tab">
          <thead>
            <tr>
              {sortHead("Date", "date")}
              <th>Split</th>
              {sortHead("Top", "top", "num")}
              {sortHead("Sets", "sets", "num")}
              {sortHead("Reps", "reps", "num")}
              {sortHead("Avg kg", "avg", "num")}
              {sortHead("Volume", "vol", "num")}
              {sortHead("est 1RM", "e1rm", "num")}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(s => {
              const isOpen = openId === s.date;
              return (
                <React.Fragment key={s.date}>
                  <tr style={{cursor: "pointer"}} onClick={() => setOpenId(o => o === s.date ? null : s.date)}>
                    <td className="mono">{RepsData.shortDate(s.date)}</td>
                    <td className="muted">{s.split || "—"}</td>
                    <td className="num mono">{s.maxWeight}{s.unit} × {s.topReps}</td>
                    <td className="num mono">{s.totalSets}</td>
                    <td className="num mono">{s.totalReps}</td>
                    <td className="num mono">{RepsStrength.avgSetWeight(s)?.toFixed(1) || "—"}</td>
                    <td className="num mono">{Math.round(s.volume).toLocaleString()}</td>
                    <td className="num mono">{Math.round(s.est1rm)}</td>
                    <td className="shrink mono" style={{color: "var(--faint)"}}>{isOpen ? "▴" : "▾"}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan="9" style={{padding: "8px 14px 12px", background: "var(--surface-2)"}}>
                        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6}}>
                          {(s.sets || []).map((set, i) => (
                            <div key={i} className="mono" style={{fontSize: 11, padding: "4px 8px", background: "var(--surface)", borderRadius: "var(--r-sm)"}}>
                              <span style={{color: "var(--muted)"}}>{set.n}.</span> {set.weight}{set.unit} × {set.reps}
                              {set.note && <div style={{fontSize: 10, color: "var(--muted)", marginTop: 2}}>{set.note}</div>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length > 8 && (
          <div style={{padding: "8px 14px", borderTop: "var(--hair)"}}>
            <button className="btn ghost sm" onClick={() => setShowAll(s => !s)}>
              {showAll ? "Show fewer" : `Show all ${rows.length} sessions`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Annotation modal --------------------------------------------------------
function AnnotationModal({ exerciseName, date, existing, onSave, onClear, onClose }) {
  const [type, setType] = useStr(existing?.type || "note");
  const [note, setNote] = useStr(existing?.note || "");

  const submit = () => {
    onSave({ type, note: note.trim() });
    onClose();
  };

  return (
    <div className="strength-compare-mode" onClick={onClose}>
      <div className="strength-compare-panel" onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <div>
            <h3>Annotate session</h3>
            <div className="kpi-label" style={{marginTop: 2}}>
              <span className="mono">{exerciseName}</span>
              <span style={{margin: "0 6px", color: "var(--faint)"}}>·</span>
              {RepsData.shortDate(date)}
            </div>
          </div>
          <button className="btn ghost sm icon-only" onClick={onClose}><StrIcons.X /></button>
        </div>
        <div style={{padding: 14, display: "flex", flexDirection: "column", gap: 14}}>
          <div>
            <div className="kpi-label" style={{marginBottom: 6}}>Type</div>
            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 4}}>
              {STR_ANNOTATION_TYPES.map(t => (
                <button key={t.id}
                  className={`strength-ann-type ${type === t.id ? "is-on" : ""}`}
                  onClick={() => setType(t.id)}
                  style={{borderColor: type === t.id ? t.color : "var(--hairline)"}}>
                  <span className="strength-ann-glyph" style={{color: t.color}}>{t.glyph}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="kpi-label" style={{marginBottom: 6}}>Note (optional)</div>
            <textarea
              value={note} autoFocus rows={3}
              onChange={e => setNote(e.target.value)}
              placeholder="What happened? Form cue, pain, gym closed, jet lag…"
              style={{width: "100%", padding: "8px 10px", border: "var(--hair)", borderRadius: "var(--r-sm)", background: "var(--bg)", fontSize: "var(--t-sm)", fontFamily: "var(--font-sans)", resize: "vertical", lineHeight: 1.4}} />
          </div>
          <div style={{display: "flex", justifyContent: "space-between", gap: 8}}>
            {existing ? (
              <button className="btn ghost sm" style={{color: "var(--bad)"}}
                onClick={() => { onClear(); onClose(); }}>
                <StrIcons.X /> Remove annotation
              </button>
            ) : <span />}
            <div style={{display: "flex", gap: 8}}>
              <button className="btn ghost sm" onClick={onClose}>Cancel</button>
              <button className="btn primary sm" onClick={submit}>
                <StrIcons.Check /> {existing ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Compare picker modal ----------------------------------------------------
function ComparePicker({ items, current, onPick, onClose }) {
  const [q, setQ] = useStr("");
  const filtered = items.filter(it =>
    !q || it.name.toLowerCase().includes(q.toLowerCase()) ||
    (it.group || "").toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="strength-compare-mode" onClick={onClose}>
      <div className="strength-compare-panel" onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <div>
            <h3>Compare with another exercise</h3>
            <div className="kpi-label" style={{marginTop: 2}}>Overlays a second line on the chart</div>
          </div>
          <button className="btn ghost sm icon-only" onClick={onClose}><StrIcons.X /></button>
        </div>
        <div style={{padding: 10}}>
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder="Search exercises…"
            style={{width: "100%", height: 32, padding: "0 10px", border: "var(--hair)", borderRadius: "var(--r-sm)", background: "var(--bg)", fontSize: "var(--t-md)"}} />
        </div>
        <div style={{maxHeight: 480, overflowY: "auto"}}>
          {current && (
            <button
              className="strength-picker-card"
              onClick={() => onPick(null)}
              style={{borderBottom: "var(--hair)", color: "var(--bad)"}}>
              <div className="strength-picker-name">Clear comparison</div>
            </button>
          )}
          {filtered.map(it => (
            <button key={it.name}
              className={`strength-picker-card ${current === it.name ? "is-active" : ""}`}
              onClick={() => onPick(it.name)}>
              <div className="strength-picker-name">{it.name}</div>
              <div className="strength-picker-meta">
                <span className={`plan-type ${(it.group || "").toLowerCase()}`}>{it.group || "Other"}</span>
                <span className="mono" style={{color: "var(--muted)", fontSize: 10}}>
                  {it.totalSets} sets · {it.daysSince === 0 ? "today" : `${it.daysSince}d ago`}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="empty" style={{padding: 20, textAlign: "center"}}>No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- URL hash helpers --------------------------------------------------------
// Encodes Strength view state into the URL hash so the view is shareable.
// Schema: #strength:exercise=NAME&compare=NAME&from=YYYY-MM-DD&to=YYYY-MM-DD
const STR_HASH_PREFIX = "#strength:";
function parseStrengthHash() {
  const h = window.location.hash || "";
  if (!h.startsWith(STR_HASH_PREFIX)) return null;
  const params = new URLSearchParams(h.slice(STR_HASH_PREFIX.length));
  return {
    exercise: params.get("exercise") || null,
    compare: params.get("compare") || null,
    from: params.get("from") || null,
    to: params.get("to") || null
  };
}
function writeStrengthHash({ exercise, compare, from, to }) {
  const params = new URLSearchParams();
  if (exercise) params.set("exercise", exercise);
  if (compare) params.set("compare", compare);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const next = STR_HASH_PREFIX + params.toString();
  if (window.location.hash !== next) {
    // replaceState avoids polluting history
    history.replaceState(null, "", window.location.pathname + window.location.search + next);
  }
}

// ============================================================================
// Top-level Strength view
// ============================================================================
function StrengthView() {
  const app = RepsState.useApp();
  const profile = app.activeProfile;
  const picker = useStrMemo(() => RepsStrength.topExercisesForPicker(36), [profile]);
  const initialHash = useStrMemo(() => parseStrengthHash(), []);
  const [selectedName, setSelectedName] = useStr(() => initialHash?.exercise || picker[0]?.name || null);
  const [compareName, setCompareName] = useStr(() => initialHash?.compare || null);
  const [visibleRange, setVisibleRange] = useStr(null);   // [Date, Date] — controlled at this level
  const [highlightBucket, setHighlightBucket] = useStr(null);
  const [showComparePicker, setShowComparePicker] = useStr(false);
  const [annotateDate, setAnnotateDate] = useStr(null);  // ISO date being annotated, or null

  const annotationsForExercise = useStrMemo(
    () => (profile.exerciseAnnotations || {})[selectedName] || {},
    [profile, selectedName]
  );

  // If profile change wipes the selected exercise, fall back to top of picker
  useStrE(() => {
    if (!selectedName && picker[0]) setSelectedName(picker[0].name);
    if (selectedName && !picker.find(p => p.name === selectedName) && picker[0]) {
      setSelectedName(picker[0].name);
    }
  }, [picker, selectedName]);

  const history = useStrMemo(() => selectedName ? RepsData.exerciseHistory(selectedName) : null, [selectedName, profile]);
  const compareHistory = useStrMemo(() => compareName ? RepsData.exerciseHistory(compareName) : null, [compareName, profile]);
  const hero = useStrMemo(() => selectedName ? RepsStrength.heroNumbers(selectedName) : null, [selectedName, profile]);
  const blockRanges = useStrMemo(() => RepsStrength.blockRanges(profile), [profile]);

  // Clear compare when the user navigates to the same exercise as compare
  useStrE(() => {
    if (compareName && compareName === selectedName) setCompareName(null);
  }, [selectedName, compareName]);

  // Reset visible range when exercise changes — honor hash for the FIRST mount,
  // then default to the full data window.
  const restoredHashRef = useStrRef(false);
  useStrE(() => {
    if (history && history.sessions.length) {
      const first = new Date(history.sessions[0].date + "T00:00:00Z");
      const last = new Date(history.sessions[history.sessions.length - 1].date + "T00:00:00Z");
      if (!restoredHashRef.current && initialHash?.from && initialHash?.to) {
        const fromD = new Date(initialHash.from + "T00:00:00Z");
        const toD = new Date(initialHash.to + "T00:00:00Z");
        // Clamp to data range
        const lo = fromD < first ? first : fromD > last ? last : fromD;
        const hi = toD > last ? last : toD < first ? first : toD;
        setVisibleRange([lo, hi]);
      } else {
        setVisibleRange([first, last]);
      }
      restoredHashRef.current = true;
    } else {
      setVisibleRange(null);
    }
  }, [history?.name]);

  // Write state changes back to the URL hash
  useStrE(() => {
    if (!restoredHashRef.current) return;
    writeStrengthHash({
      exercise: selectedName,
      compare: compareName,
      from: visibleRange ? toIso(visibleRange[0]) : null,
      to: visibleRange ? toIso(visibleRange[1]) : null
    });
  }, [selectedName, compareName, visibleRange]);

  // Keyboard nav: ← / → flip exercises, [ / ] step blocks
  useStrE(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (!picker.length) return;
      const i = picker.findIndex(p => p.name === selectedName);
      if (e.key === "ArrowLeft" && i > 0) { setSelectedName(picker[i - 1].name); e.preventDefault(); }
      else if (e.key === "ArrowRight" && i < picker.length - 1) { setSelectedName(picker[i + 1].name); e.preventDefault(); }
      else if (e.key === "[" || e.key === "]") {
        // Jump to previous/next block
        if (!blockRanges.length || !visibleRange) return;
        const midIso = toIso(new Date((+visibleRange[0] + +visibleRange[1]) / 2));
        const idx = blockRanges.findIndex(b => b.start <= midIso && midIso <= b.end);
        const target = e.key === "[" ? Math.max(0, (idx === -1 ? 0 : idx - 1)) : Math.min(blockRanges.length - 1, (idx === -1 ? 0 : idx + 1));
        const b = blockRanges[target];
        if (b) {
          setVisibleRange([new Date(b.start + "T00:00:00Z"), new Date(b.end + "T00:00:00Z")]);
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [picker, selectedName, blockRanges, visibleRange]);

  const hasD3 = typeof d3 !== "undefined";

  return (
    <div className="view strength-view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Strength</h1>
          <div className="page-sub">
            <span className="mono">{profile.name}</span>
            <span style={{margin: "0 6px", color: "var(--faint)"}}>·</span>
            {picker.length} exercises with weight history
          </div>
        </div>
      </div>

      {!hasD3 && (
        <div className="panel" style={{borderColor: "var(--bad)", background: "color-mix(in oklch, var(--bad) 8%, var(--surface))"}}>
          <div className="panel-body">
            <strong>D3 didn't load.</strong> Check your network or that <span className="mono">Reps.html</span> includes the D3 script tag.
          </div>
        </div>
      )}

      {picker.length === 0 && (
        <div className="panel">
          <div className="panel-body">
            <div className="empty" style={{padding: 30, textAlign: "center"}}>
              No exercises with weight history yet. Log a few sessions and come back.
            </div>
          </div>
        </div>
      )}

      {picker.length > 0 && (
        <>
          <div className="strength-layout">
            <div className="panel" style={{padding: 0}}>
              <div className="panel-head">
                <h3>Pick an exercise</h3>
                <span className="label">sorted by recency × frequency</span>
              </div>
              <ExercisePicker items={picker} selected={selectedName} onPick={setSelectedName} />
            </div>

            <div className="panel" style={{padding: 0}}>
              <div className="panel-head">
                <div>
                  <div className="mono" style={{fontSize: 10, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase"}}>strength</div>
                  <h3 style={{fontSize: 22, fontWeight: 500, marginTop: 2}}>{selectedName || "—"}</h3>
                </div>
                <div style={{display: "flex", gap: 6}}>
                  <button className="btn ghost sm" onClick={() => {
                    const i = picker.findIndex(p => p.name === selectedName);
                    if (i > 0) setSelectedName(picker[i - 1].name);
                  }} disabled={picker.findIndex(p => p.name === selectedName) <= 0}>
                    <StrIcons.ChevronLeft />
                  </button>
                  <button className="btn ghost sm" onClick={() => {
                    const i = picker.findIndex(p => p.name === selectedName);
                    if (i < picker.length - 1) setSelectedName(picker[i + 1].name);
                  }} disabled={picker.findIndex(p => p.name === selectedName) >= picker.length - 1}>
                    <StrIcons.Chevron />
                  </button>
                </div>
              </div>

              {hero && (
                <div className="strength-hero-numbers">
                  <div className="strength-hero-num">
                    <div className="strength-hero-val-row">
                      <span className={`strength-hero-val ${hero.delta < 0 ? "neg" : "pos"}`}>
                        {hero.delta >= 0 ? "+" : ""}{hero.delta.toFixed(1)}
                      </span>
                      <span className="strength-hero-unit">kg</span>
                    </div>
                    <span className="strength-hero-sub">over {hero.spanLabel}</span>
                  </div>
                  <div className="strength-hero-num">
                    <div className="strength-hero-val-row">
                      <span className="strength-hero-val mono">{hero.prText}</span>
                    </div>
                    <span className="strength-hero-sub">PR · {RepsData.shortDate(hero.prDate)}</span>
                  </div>
                  <div className="strength-hero-num">
                    <div className="strength-hero-val-row">
                      <span className="strength-hero-val mono">{hero.e1rm}</span>
                      <span className="strength-hero-unit">kg</span>
                    </div>
                    <span className="strength-hero-sub">est 1RM</span>
                  </div>
                  <div className="strength-hero-num">
                    <div className="strength-hero-val-row">
                      <span className={`strength-hero-val mono ${hero.volumeDelta < 0 ? "neg" : "pos"}`}>
                        {Math.round(hero.lastVolume).toLocaleString()}
                      </span>
                    </div>
                    <span className="strength-hero-sub">volume · best {Math.round(hero.peakVolume).toLocaleString()}</span>
                  </div>
                  <div className="strength-hero-num">
                    <div className="strength-hero-val-row">
                      <span className="strength-hero-val mono">{hero.totalSessions}</span>
                    </div>
                    <span className="strength-hero-sub">sessions logged</span>
                  </div>
                </div>
              )}

              <div className="strength-hero-container" style={{position: "relative"}}>
                {history ? (
                  <>
                    <div style={{display: "flex", justifyContent: "flex-end", marginBottom: 6}}>
                      <button
                        className={`strength-compare-btn ${compareName ? "is-on" : ""}`}
                        onClick={() => setShowComparePicker(true)}>
                        {compareName ? `vs ${compareName}` : "compare with…"}
                        {compareName && (
                          <span
                            onClick={(e) => { e.stopPropagation(); setCompareName(null); }}
                            style={{cursor: "pointer", paddingLeft: 4, display: "inline-flex"}}>
                            <StrIcons.X />
                          </span>
                        )}
                      </button>
                    </div>
                    <HeroChart
                      history={history}
                      compareHistory={compareHistory}
                      blockRanges={blockRanges}
                      profile={profile}
                      visibleRange={visibleRange}
                      setVisibleRange={setVisibleRange}
                      highlightBucket={highlightBucket}
                      annotations={annotationsForExercise}
                      onAnnotate={(date) => setAnnotateDate(date)} />
                    {showComparePicker && (
                      <ComparePicker
                        items={picker.filter(p => p.name !== selectedName)}
                        current={compareName}
                        onPick={(n) => { setCompareName(n); setShowComparePicker(false); }}
                        onClose={() => setShowComparePicker(false)} />
                    )}
                    {annotateDate && (
                      <AnnotationModal
                        exerciseName={selectedName}
                        date={annotateDate}
                        existing={annotationsForExercise[annotateDate]}
                        onSave={(patch) => app.setExerciseAnnotation(selectedName, annotateDate, patch)}
                        onClear={() => app.clearExerciseAnnotation(selectedName, annotateDate)}
                        onClose={() => setAnnotateDate(null)} />
                    )}
                  </>
                ) : (
                  <div className="empty" style={{padding: 40, textAlign: "center"}}>
                    Pick an exercise to see its progression.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Phase 2 — supporting views */}
          {history && (
            <div className="strength-grid-2">
              <div className="panel" style={{padding: 0}}>
                <div className="panel-head">
                  <h3>Rep range mix</h3>
                  <span className="label">within visible range · hover to filter chart</span>
                </div>
                <div className="panel-body">
                  <RepRangeDonut history={history} visibleRange={visibleRange} onHoverBucket={setHighlightBucket} />
                </div>
              </div>

              <div className="panel" style={{padding: 0}}>
                <div className="panel-head">
                  <h3>Block comparison</h3>
                  <span className="label">same scale · click to zoom hero</span>
                </div>
                <div className="panel-body">
                  <BlockSmallMultiples
                    history={history}
                    blockRanges={blockRanges}
                    onPickRange={setVisibleRange} />
                </div>
              </div>
            </div>
          )}

          {history && (
            <div className="panel" style={{padding: 0}}>
              <div className="panel-head">
                <h3>Training calendar</h3>
                <span className="label">last 26 weeks · click a day to zoom hero</span>
              </div>
              <div className="panel-body">
                <CalendarHeatmap
                  history={history}
                  weeks={26}
                  onPickDate={(iso) => {
                    const monday = RepsData.mondayOf(iso);
                    const sunday = RepsData.addDays(monday, 6);
                    setVisibleRange([new Date(monday + "T00:00:00Z"), new Date(sunday + "T00:00:00Z")]);
                  }} />
              </div>
            </div>
          )}

          {history && <SessionsTable history={history} />}

          <div className="panel" style={{padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
            <div className="mono" style={{fontSize: 10, color: "var(--muted)"}}>
              <strong style={{color: "var(--ink)"}}>Keyboard:</strong> ← → flip exercises · [ ] step blocks · drag the brush to zoom
            </div>
            <button className="btn ghost sm" onClick={() => {
              if (!history || !history.sessions.length) return;
              const first = new Date(history.sessions[0].date + "T00:00:00Z");
              const last = new Date(history.sessions[history.sessions.length - 1].date + "T00:00:00Z");
              setVisibleRange([first, last]);
            }}>Reset zoom</button>
          </div>
        </>
      )}
    </div>
  );
}

window.RepsStrengthView = StrengthView;
