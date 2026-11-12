let activeState = null;
let historyState = [];
let mainChartInstance = null;
let barChartInstance = null;
let donutChartInstance = null;
let chartDisplayMode = 'both';

document.addEventListener('DOMContentLoaded', () => {
  bindUIEvents();
  fetchDashboardData();
});

function bindUIEvents() {
  document.getElementById('collapseBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchView(btn.dataset.view);
    });
  });

  document.getElementById('dashboardSelector').addEventListener('change', (e) => {
    switchView(e.target.value);
  });

  document.getElementById('dateRangeFilter').addEventListener('change', fetchDashboardData);
  document.getElementById('severityFilter').addEventListener('change', fetchDashboardData);
  document.getElementById('quickUploadTrigger').addEventListener('click', () => switchView('upload'));

  document.getElementById('datasetFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      document.getElementById('selectedFileName').textContent = `Selected: ${file.name}`;
    }
  });

  document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('datasetFileInput');
    if (!input.files.length) return;

    const formData = new FormData();
    formData.append('file', input.files[0]);

    const banner = document.getElementById('uploadStatusBanner');
    banner.classList.remove('hidden');
    banner.textContent = 'SPYNEX AI is running SciPy & Isolation Forest statistical trap analysis...';

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const payload = await res.json();
      if (payload.status === 'ok') {
        activeState = payload.data;
        historyState = payload.history || [];
        renderAll(activeState);
        banner.textContent = `Analysis complete for "${activeState.dataset_name}" (${activeState.rows} rows). Redirecting to Overview...`;
        setTimeout(() => switchView('overview'), 900);
      } else {
        banner.textContent = payload.message || 'Upload error.';
      }
    } catch (err) {
      banner.textContent = 'Network error communicating with backend.';
    }
  });

  document.getElementById('resetDemoBtn').addEventListener('click', async () => {
    const res = await fetch('/api/reset-demo', { method: 'POST' });
    const payload = await res.json();
    if (payload.status === 'ok') {
      activeState = payload.data;
      historyState = payload.history || [];
      renderAll(activeState);
      switchView('overview');
    }
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chartDisplayMode = btn.dataset.mode;
      if (activeState) renderMainTrendChart(activeState.main_chart);
    });
  });

  document.getElementById('chartGranularity').addEventListener('change', () => {
    if (activeState) renderMainTrendChart(activeState.main_chart);
  });

  document.getElementById('globalSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const q = e.target.value.trim();
      switchView('assistant');
      document.getElementById('aiQuestionInput').value = q;
      document.getElementById('aiChatForm').dispatchEvent(new Event('submit'));
    }
  });

  document.getElementById('quickAskBtn').addEventListener('click', () => switchView('assistant'));

  document.getElementById('aiChatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('aiQuestionInput');
    const question = input.value.trim();
    if (!question) return;

    appendChatMsg(question, 'user');
    input.value = '';

    const res = await fetch('/api/ask-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    const payload = await res.json();
    appendChatMsg(payload.answer || payload.message, 'ai');
  });

  document.getElementById('viewDetailedAnalysisBtn').addEventListener('click', () => openTrapModal());
  document.getElementById('viewAnomalyBtn').addEventListener('click', () => openTrapModal());
  document.getElementById('viewAllAnomaliesBtn').addEventListener('click', () => switchView('anomalies'));
  document.getElementById('notifBtn').addEventListener('click', () => openTrapModal());
  document.getElementById('helpBtn').addEventListener('click', () => {
    showModal(
      'SPYNEX AI Statistical Trap Engine — Methodology',
      `<p><strong>1. Simpson's Paradox Detector:</strong> Compares aggregate Pearson correlation against subgroup-stratified correlations to catch directional trend reversals.</p>
       <p style="margin-top:8px;"><strong>2. Outlier Skew &amp; Mean-Median Divergence:</strong> Quantifies skewness (SciPy) and IQR tail leverage.</p>
       <p style="margin-top:8px;"><strong>3. Multicollinearity &amp; VIF Audit:</strong> Flags predictor pairs with |r| ≥ 0.82.</p>
       <p style="margin-top:8px;"><strong>4. Isolation Forest Anomaly Scoring:</strong> Unsupervised ensemble isolation across numeric dimensions.</p>`
    );
  });
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('detailModal').classList.add('hidden');
  });
}

function switchView(viewName) {
  const overview = document.getElementById('view-overview');
  const uploadView = document.getElementById('view-upload');
  const assistantView = document.getElementById('view-assistant');
  const detailedView = document.getElementById('view-detailed-list');

  overview.classList.add('hidden');
  uploadView.classList.add('hidden');
  assistantView.classList.add('hidden');
  detailedView.classList.add('hidden');

  if (viewName === 'overview' || viewName === 'analytics') {
    overview.classList.remove('hidden');
  } else if (viewName === 'upload') {
    uploadView.classList.remove('hidden');
  } else if (viewName === 'assistant') {
    assistantView.classList.remove('hidden');
  } else {
    detailedView.classList.remove('hidden');
    renderSecondaryListView(viewName);
  }
}

async function fetchDashboardData() {
  const range = document.getElementById('dateRangeFilter').value;
  const severity = document.getElementById('severityFilter').value;
  const res = await fetch(`/api/dashboard?range=${encodeURIComponent(range)}&severity=${encodeURIComponent(severity)}`);
  const payload = await res.json();
  if (payload.status === 'ok') {
    activeState = payload.data;
    historyState = payload.history || [];
    renderAll(activeState);
  }
}

function renderAll(data) {
  const badge = document.getElementById('datasetSourceBadge');
  badge.textContent = data.is_demo ? 'DEMO DATA' : 'LIVE DATASET';
  badge.classList.toggle('live', !data.is_demo);
  document.getElementById('activeDatasetLabel').textContent =
    `Active Dataset: ${data.dataset_name} • ${data.rows.toLocaleString()} rows × ${data.columns} columns`;

  const k = data.kpis;
  document.getElementById('kpiDatasets').textContent = k.datasets_analyzed.value;
  document.getElementById('kpiDatasetsDelta').textContent = `↗ ${k.datasets_analyzed.delta} vs prior period`;

  document.getElementById('kpiTraps').textContent = k.traps_detected.value;
  document.getElementById('kpiTrapsDelta').textContent = `↗ ${k.traps_detected.delta} detected`;

  document.getElementById('kpiQuality').textContent = k.data_quality_score.value;
  document.getElementById('kpiQualityDelta').textContent = `↗ ${k.data_quality_score.delta} completeness`;

  document.getElementById('kpiAnomalies').textContent = k.anomalies_detected.value;
  document.getElementById('kpiAnomaliesDelta').textContent = `↗ ${k.anomalies_detected.delta} flagged`;

  document.getElementById('kpiAccuracy').textContent = k.analysis_accuracy.value;
  document.getElementById('kpiAccuracyDelta').textContent = `↗ ${k.analysis_accuracy.delta} validated`;

  drawSparkline('spark1', k.datasets_analyzed.spark, '#f97316');
  drawSparkline('spark2', k.traps_detected.spark, '#38bdf8');
  drawSparkline('spark3', k.data_quality_score.spark, '#a855f7');
  drawSparkline('spark4', k.anomalies_detected.spark, '#f59e0b');
  drawSparkline('spark5', k.analysis_accuracy.spark, '#ef4444');

  renderMainTrendChart(data.main_chart);

  const ins = data.ai_insight;
  document.getElementById('insightCategory').textContent = `Category: ${ins.category}`;
  document.getElementById('insightTitle').textContent = ins.title;
  document.getElementById('insightExplanation').textContent = ins.explanation;
  document.getElementById('insightSeverityBadge').textContent = `${ins.severity} Impact`;
  document.getElementById('insightSeverityBadge').className = `severity-pill ${ins.severity.toLowerCase()}`;

  const factorsHTML = (ins.factors || []).map(f => `
    <div class="factor-row">
      <span class="factor-name">${f.label}</span>
      <span class="factor-val pos">${f.delta}</span>
    </div>
  `).join('') + `
    <div class="factor-row">
      <span class="factor-name">AI Calibration Confidence</span>
      <span class="factor-val pos">${ins.confidence}%</span>
    </div>
  `;
  document.getElementById('insightFactors').innerHTML = factorsHTML;

  renderTrapBarChart(data.trap_distribution);
  renderDonutChart(data.dataset_breakdown);

  const tbody = document.getElementById('recentAnomaliesBody');
  tbody.innerHTML = data.recent_anomalies.map(row => {
    const sevCls = `sev-text-${row.severity.toLowerCase()}`;
    return `
      <tr>
        <td>${row.issue}</td>
        <td>${row.date}</td>
        <td class="${sevCls}">${row.severity} ${row.direction}</td>
        <td class="exp-cell" title="${row.explanation}">${row.explanation}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('lastRefreshedText').textContent = `Data Refreshed: ${data.timestamp} ↻`;
}

function drawSparkline(canvasId, points, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !points || !points.length) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  points.forEach((v, i) => {
    const x = (i / Math.max(1, points.length - 1)) * (w - 4) + 2;
    const y = h - 4 - ((v - min) / span) * (h - 8);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderMainTrendChart(mc) {
  document.getElementById('mainChartTitle').textContent = mc.title;
  document.getElementById('calloutDate').textContent = mc.highlight_date;
  document.getElementById('calloutDesc').textContent = mc.highlight_summary;
  const conf = activeState?.ai_insight?.confidence || 92;
  document.getElementById('calloutConf').textContent = `${conf}%`;
  document.getElementById('calloutConfBar').style.width = `${conf}%`;

  const ctx = document.getElementById('mainTrendChart').getContext('2d');
  if (mainChartInstance) mainChartInstance.destroy();

  const anomalySet = new Set(mc.anomaly_indices || [mc.highlight_index]);
  const pointRadii = mc.actual.map((_, idx) => (idx === mc.highlight_index ? 6 : (anomalySet.has(idx) ? 4 : 2.5)));
  const pointBg = mc.actual.map((_, idx) => (anomalySet.has(idx) ? '#f97316' : '#fb923c'));

  const datasets = [];
  if (chartDisplayMode !== 'expected') {
    datasets.push({
      label: 'Actual Metric',
      data: mc.actual,
      borderColor: '#f97316',
      backgroundColor: 'rgba(249, 115, 22, 0.14)',
      borderWidth: 2.2,
      tension: document.getElementById('chartGranularity').value === 'rolling' ? 0.42 : 0.25,
      fill: true,
      pointRadius: pointRadii,
      pointBackgroundColor: pointBg,
      pointBorderColor: '#0b0e14',
      pointBorderWidth: 1.5,
    });
  }
  if (chartDisplayMode === 'both' || chartDisplayMode === 'anomalies') {
    datasets.push({
      label: 'Expected Baseline',
      data: mc.expected,
      borderColor: '#64748b',
      borderDash: [4, 4],
      borderWidth: 1.6,
      tension: 0.35,
      fill: false,
      pointRadius: 0,
    });
  }

  mainChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: mc.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: 'rgba(249,115,22,0.4)',
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#64748b', font: { size: 10.5 }, maxTicksLimit: 8 }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#64748b', font: { size: 10.5 } }
        }
      }
    }
  });
}

function renderTrapBarChart(dist) {
  const ctx = document.getElementById('trapBarChart').getContext('2d');
  if (barChartInstance) barChartInstance.destroy();

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dist.map(d => d.label),
      datasets: [{
        data: dist.map(d => d.pct),
        backgroundColor: '#f97316',
        borderRadius: 4,
        barThickness: 12,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => ` ${c.raw}% share` }
        }
      },
      scales: {
        x: {
          max: 55,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { size: 10 }, callback: v => `${v}%` }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#cbd5e1', font: { size: 10.5 } }
        }
      }
    }
  });
}

function renderDonutChart(breakdown) {
  document.getElementById('donutTotalRecords').textContent = breakdown.total_records.toLocaleString();
  const segs = breakdown.segments;

  document.getElementById('donutLegend').innerHTML = segs.map(s => `
    <div class="donut-legend-row">
      <span class="donut-lbl"><i class="swatch" style="background:${s.color}"></i>${s.label}</span>
      <strong>${s.pct}%</strong>
    </div>
  `).join('');

  const ctx = document.getElementById('datasetDonutChart').getContext('2d');
  if (donutChartInstance) donutChartInstance.destroy();

  donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: segs.map(s => s.label),
      datasets: [{
        data: segs.map(s => s.pct),
        backgroundColor: segs.map(s => s.color),
        borderWidth: 0,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: { legend: { display: false } }
    }
  });
}

function openTrapModal() {
  if (!activeState) return;
  const html = activeState.all_traps.map(t => `
    <div style="padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-bottom:10px;background:rgba(255,255,255,0.02);">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <strong style="color:#fb923c;">${t.category} (${t.severity})</strong>
        <span>Confidence: ${t.confidence}%</span>
      </div>
      <div style="font-weight:600;color:#f8fafc;margin-bottom:4px;">${t.title}</div>
      <div>${t.explanation}</div>
    </div>
  `).join('');
  showModal(`SPYNEX AI Statistical Trap Audit — ${activeState.dataset_name}`, html);
}

function showModal(title, html) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('detailModal').classList.remove('hidden');
}

function appendChatMsg(text, role) {
  const feed = document.getElementById('chatFeed');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function renderSecondaryListView(viewName) {
  const titleEl = document.getElementById('detailedViewTitle');
  const container = document.getElementById('detailedViewContainer');
  if (!activeState) return;

  if (viewName === 'traps' || viewName === 'reports') {
    titleEl.textContent = viewName === 'reports'
      ? `SPYNEX AI Executive Audit Report — ${activeState.dataset_name}`
      : 'Detected Statistical Traps & Confounders';
    container.innerHTML = activeState.all_traps.map(t => `
      <div style="padding:12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <strong style="color:#fb923c;">${t.id} • ${t.category}</strong>
          <span class="severity-pill ${t.severity.toLowerCase()}">${t.severity} (${t.confidence}% conf)</span>
        </div>
        <h4 style="margin-bottom:6px;color:#fff;">${t.title}</h4>
        <p style="color:#94a3b8;">${t.explanation}</p>
      </div>
    `).join('');
  } else if (viewName === 'statistical') {
    titleEl.textContent = `Feature-Level Statistical Diagnostics — ${activeState.dataset_name}`;
    container.innerHTML = `
      <table class="spy-table">
        <thead><tr><th>Column</th><th>Type</th><th>Missing %</th><th>Unique</th><th>Mean</th><th>Median</th></tr></thead>
        <tbody>
          ${activeState.column_summary.map(c => `
            <tr>
              <td>${c.name}</td><td>${c.dtype}</td><td>${c.missing_pct}%</td>
              <td>${c.unique}</td><td>${c.mean ?? '—'}</td><td>${c.median ?? '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (viewName === 'history') {
    titleEl.textContent = 'Dataset Analysis History';
    container.innerHTML = `
      <table class="spy-table">
        <thead><tr><th>ID</th><th>Dataset</th><th>Shape</th><th>Traps</th><th>Quality</th><th>Timestamp</th></tr></thead>
        <tbody>
          ${historyState.map(h => `
            <tr>
              <td>${h.id}</td><td>${h.name}</td><td>${h.rows} × ${h.cols}</td>
              <td>${h.traps}</td><td>${h.quality}</td><td>${h.timestamp}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (viewName === 'anomalies') {
    titleEl.textContent = 'Full Anomaly Detection Log (Isolation Forest)';
    container.innerHTML = `
      <table class="spy-table">
        <thead><tr><th>Issue</th><th>Date</th><th>Severity</th><th>Confidence</th><th>Explanation</th></tr></thead>
        <tbody>
          ${activeState.recent_anomalies.map(a => `
            <tr>
              <td>${a.issue}</td><td>${a.date}</td><td>${a.severity} ${a.direction}</td>
              <td>${a.confidence}</td><td>${a.explanation}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    titleEl.textContent = 'SPYNEX AI Engine Detection Thresholds & Settings';
    container.innerHTML = `
      <p style="color:#94a3b8;line-height:1.6;">
        • <strong>Isolation Forest Contamination:</strong> 8.0%<br/>
        • <strong>Simpson's Paradox Subgroup Reversal Threshold:</strong> |r| &gt; 0.15 with sign inversion<br/>
        • <strong>Multicollinearity Alert Threshold:</strong> Pearson |r| ≥ 0.82 (VIF ≥ 3.1)<br/>
        • <strong>Skewness Distortion Threshold:</strong> |γ₁| &gt; 1.20
      </p>
    `;
  }
}
