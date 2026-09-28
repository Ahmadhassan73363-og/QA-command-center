export async function renderStatusPage(): Promise<string> {
  return `<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QA Command Center — Monitoring & Incident Management</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #09090b;
      --panel: #111114;
      --panel-hover: #16161a;
      --panel-elevated: #1a1a20;
      --border: #232329;
      --border-subtle: #1c1c22;
      --border-focus: #3b82f6;
      --fg: #fafafa;
      --fg-secondary: #a1a1aa;
      --fg-muted: #71717a;
      --fg-subtle: #52525b;
      --ok: #22c55e;
      --ok-bg: rgba(34, 197, 94, 0.1);
      --ok-border: rgba(34, 197, 94, 0.25);
      --warn: #eab308;
      --warn-bg: rgba(234, 179, 8, 0.1);
      --warn-border: rgba(234, 179, 8, 0.25);
      --crit: #ef4444;
      --crit-bg: rgba(239, 68, 68, 0.1);
      --crit-border: rgba(239, 68, 68, 0.25);
      --blue: #3b82f6;
      --blue-bg: rgba(59, 130, 246, 0.1);
      --radius: 8px;
      --radius-sm: 5px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      line-height: 1.5;
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
    }

    code, .mono {
      font-family: 'JetBrains Mono', monospace;
      font-feature-settings: 'tnum';
      font-variant-numeric: tabular-nums;
    }

    /* Container */
    .app-layout {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px 24px 80px;
    }

    /* Top Utility Bar */
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .app-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sys-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 500;
      color: var(--ok);
      background: var(--ok-bg);
      border: 1px solid var(--ok-border);
      padding: 2px 8px;
      border-radius: 4px;
    }
    .sys-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ok);
    }
    .db-tag {
      font-size: 11px;
      color: var(--fg-muted);
      border: 1px solid var(--border);
      padding: 2px 7px;
      border-radius: 4px;
      background: var(--panel);
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--fg);
      transition: all 0.12s ease;
      text-decoration: none;
    }
    .btn:hover {
      background: var(--panel-hover);
      border-color: #383842;
    }
    .btn-primary {
      background: #fafafa;
      color: #09090b;
      border-color: #fafafa;
      font-weight: 600;
    }
    .btn-primary:hover {
      background: #e4e4e7;
      border-color: #e4e4e7;
    }
    .btn-sm {
      padding: 4px 8px;
      font-size: 11px;
    }
    .btn-danger {
      color: var(--crit);
      border-color: rgba(239, 68, 68, 0.2);
    }
    .btn-danger:hover {
      background: var(--crit-bg);
    }

    /* KPI Summary Row */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    @media (max-width: 900px) {
      .kpi-row { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 500px) {
      .kpi-row { grid-template-columns: 1fr; }
    }
    .kpi-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 16px;
    }
    .kpi-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--fg-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .kpi-val {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      font-variant-numeric: tabular-nums;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .kpi-hint {
      font-size: 11px;
      color: var(--fg-subtle);
      margin-top: 4px;
    }

    /* Quick Audit Banner */
    .audit-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 24px;
    }
    .audit-box-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .audit-box-title {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .audit-form-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr auto;
      gap: 10px;
      align-items: center;
    }
    @media (max-width: 860px) {
      .audit-form-grid { grid-template-columns: 1fr; }
    }
    .form-ctrl {
      width: 100%;
      padding: 8px 11px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: #fff;
      font-size: 12px;
      outline: none;
      transition: border-color 0.12s;
    }
    .form-ctrl:focus {
      border-color: var(--border-focus);
    }

    /* Filter & Search Bar */
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 3px;
    }
    .f-btn {
      background: transparent;
      border: none;
      color: var(--fg-muted);
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .f-btn:hover { color: #fff; }
    .f-btn.active {
      background: #232329;
      color: #fff;
      font-weight: 600;
    }
    .f-badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      font-variant-numeric: tabular-nums;
    }

    .search-input-wrap {
      position: relative;
      min-width: 260px;
    }
    .search-ctrl {
      width: 100%;
      padding: 6px 10px 6px 28px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: #fff;
      font-size: 12px;
      outline: none;
    }
    .search-ctrl:focus {
      border-color: var(--border-focus);
    }
    .search-svg {
      position: absolute;
      left: 9px;
      top: 50%;
      transform: translateY(-50%);
      width: 12px;
      height: 12px;
      stroke: var(--fg-muted);
    }

    /* Views: Grid & Table */
    .view-toggle {
      display: flex;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .view-btn {
      background: var(--panel);
      border: none;
      padding: 6px 9px;
      cursor: pointer;
      color: var(--fg-muted);
      display: flex;
      align-items: center;
    }
    .view-btn.active {
      background: #27272e;
      color: #fff;
    }

    /* Cards Grid */
    .sites-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(390px, 1fr));
      gap: 12px;
      margin-bottom: 32px;
    }
    @media (max-width: 600px) {
      .sites-grid { grid-template-columns: 1fr; }
    }
    .site-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: border-color 0.15s, background-color 0.15s;
      position: relative;
    }
    .site-card:hover {
      border-color: #383842;
      background: var(--panel-hover);
    }
    .site-card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .site-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-indicator {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-indicator.ok { background: var(--ok); }
    .status-indicator.warn { background: var(--warn); }
    .status-indicator.crit { background: var(--crit); }
    .status-indicator.pending { background: var(--fg-muted); }

    .site-link {
      font-size: 11px;
      color: var(--fg-muted);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 2px;
      font-family: 'JetBrains Mono', monospace;
    }
    .site-link:hover { color: var(--fg); text-decoration: underline; }

    .status-badge {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 7px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .status-badge.ok { background: var(--ok-bg); color: var(--ok); border: 1px solid var(--ok-border); }
    .status-badge.warn { background: var(--warn-bg); color: var(--warn); border: 1px solid var(--warn-border); }
    .status-badge.crit { background: var(--crit-bg); color: var(--crit); border: 1px solid var(--crit-border); }
    .status-badge.pending { background: rgba(255, 255, 255, 0.05); color: var(--fg-muted); border: 1px solid var(--border); }

    /* Uptime / Check Timeline Bar */
    .uptime-timeline {
      display: flex;
      align-items: center;
      gap: 3px;
      padding: 4px 0;
    }
    .uptime-bar {
      flex: 1;
      height: 16px;
      border-radius: 2px;
      background: #1e1e24;
      cursor: pointer;
      position: relative;
      transition: opacity 0.1s;
    }
    .uptime-bar:hover { opacity: 0.8; }
    .uptime-bar.ok { background: var(--ok); }
    .uptime-bar.warn { background: var(--warn); }
    .uptime-bar.crit { background: var(--crit); }

    .uptime-caption {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--fg-subtle);
      font-family: 'JetBrains Mono', monospace;
    }

    /* Check Badges Wrap */
    .checks-flow {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .check-tag {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      padding: 2px 6px;
      border-radius: 3px;
      background: #18181f;
      border: 1px solid var(--border);
      color: var(--fg-secondary);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .check-tag.pass { border-color: rgba(34, 197, 94, 0.3); color: var(--ok); }
    .check-tag.warn { border-color: rgba(234, 179, 8, 0.3); color: var(--warn); }
    .check-tag.fail { border-color: rgba(239, 68, 68, 0.3); color: var(--crit); }

    .site-card-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid var(--border-subtle);
      padding-top: 10px;
      margin-top: auto;
    }
    .foot-meta {
      font-size: 11px;
      color: var(--fg-muted);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .foot-actions {
      display: flex;
      gap: 5px;
    }

    /* Visual Snapshot */
    .snapshot-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      margin-bottom: 14px;
    }
    .snapshot-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #141418;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 11px;
      font-weight: 600;
      color: var(--fg-muted);
      letter-spacing: 0.03em;
    }
    .snapshot-viewport {
      width: 100%;
      height: 200px;
      background: #09090b;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }
    .snapshot-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top;
      transition: transform 0.25s ease;
    }
    .snapshot-img:hover {
      transform: scale(1.02);
    }
    .card-thumb {
      width: 80px;
      height: 52px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      overflow: hidden;
      background: #09090b;
      flex-shrink: 0;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .card-thumb:hover {
      border-color: var(--fg-muted);
    }
    .card-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top;
    }
    .card-issues {
      margin-top: 10px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: rgba(234, 179, 8, 0.08);
      border: 1px solid rgba(234, 179, 8, 0.25);
      font-size: 11px;
    }
    .card-issues.crit {
      background: rgba(239, 68, 68, 0.08);
      border-color: rgba(239, 68, 68, 0.25);
    }
    .card-issue-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      color: var(--fg-secondary);
      line-height: 1.4;
    }
    .card-issue-row + .card-issue-row {
      margin-top: 5px;
    }
    .diag-item-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 14px;
      margin-bottom: 12px;
    }
    .diag-item-box.warn {
      border-color: rgba(234, 179, 8, 0.35);
      background: rgba(234, 179, 8, 0.02);
    }
    .diag-item-box.crit {
      border-color: rgba(239, 68, 68, 0.35);
      background: rgba(239, 68, 68, 0.02);
    }
    .diag-reason-banner {
      margin-top: 8px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      line-height: 1.4;
    }
    .diag-reason-banner.warn {
      background: rgba(234, 179, 8, 0.12);
      color: #fde047;
      border-left: 3px solid var(--warn);
    }
    .diag-reason-banner.crit {
      background: rgba(239, 68, 68, 0.12);
      color: #fca5a5;
      border-left: 3px solid var(--crit);
    }
    .diag-reason-banner.pass {
      background: rgba(34, 197, 94, 0.08);
      color: #86efac;
      border-left: 3px solid var(--ok);
    }
    .diag-remedy {
      margin-top: 6px;
      font-size: 11px;
      color: var(--fg-muted);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .snapshot-frame, .card-thumb iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: #09090b;
      pointer-events: none;
    }
    .snapshot-note {
      padding: 6px 12px;
      font-size: 10px;
      color: var(--fg-subtle);
      text-align: center;
      border-top: 1px solid var(--border-subtle);
    }

    /* Modal / Slide-out Drawer */
    .drawer-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      justify-content: flex-end;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    .drawer-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }
    .drawer-panel {
      width: 100%;
      max-width: 780px;
      background: var(--panel);
      border-left: 1px solid var(--border);
      height: 100vh;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      overflow-y: auto;
    }
    .drawer-overlay.active .drawer-panel {
      transform: translateX(0);
    }
    .drawer-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: #141418;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .drawer-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .close-icon-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg-muted);
      border-radius: var(--radius-sm);
      cursor: pointer;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .close-icon-btn:hover { color: #fff; background: var(--panel-hover); }

    /* Drawer Tabs */
    .drawer-tabs {
      display: flex;
      gap: 4px;
      border-bottom: 1px solid var(--border);
      padding: 0 20px;
      background: #141418;
    }
    .d-tab {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 500;
      color: var(--fg-muted);
      cursor: pointer;
    }
    .d-tab:hover { color: #fff; }
    .d-tab.active {
      color: #fff;
      font-weight: 600;
      border-bottom-color: var(--fg);
    }

    /* Diagnostic Groups */
    .diag-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
    }
    .diag-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--fg-muted);
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
    }
    .diag-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .diag-table td {
      padding: 7px 8px;
      border-bottom: 1px solid var(--border-subtle);
      vertical-align: middle;
    }
    .diag-table tr:last-child td { border-bottom: none; }
    .diag-table td.col-name { font-weight: 500; width: 35%; color: #fff; }
    .diag-table td.col-val { color: var(--fg-secondary); font-family: 'JetBrains Mono', monospace; font-size: 11px; }

    /* History Timeline Table */
    .history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .history-table th {
      text-align: left;
      padding: 8px 10px;
      color: var(--fg-muted);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      font-weight: 600;
    }
    .history-table td {
      padding: 10px;
      border-bottom: 1px solid var(--border-subtle);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
    }
    .history-table tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* Incidents Table */
    .inc-panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-top: 24px;
    }

    /* Toast */
    .toast-tray {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
    }
    .toast-msg {
      background: #18181b;
      color: #fff;
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      border: 1px solid #2e2e36;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .spin { animation: spin 0.8s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>

  <div class="app-layout">
    <!-- Top Utility Bar -->
    <header class="header-bar">
      <div class="header-left">
        <div class="app-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          QA Command Center
        </div>
        <div class="sys-badge"><span class="sys-dot"></span> Live Monitoring</div>
        <span class="db-tag" id="dbIndicator">Neon Cloud DB</span>
      </div>

      <div class="header-right">
        <span style="font-size: 11px; color: var(--fg-subtle); margin-right: 6px;" id="refreshCountdown">Synced</span>
        <button class="btn btn-sm" id="btnRunAll" onclick="runAllAudits()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Run All Checks
        </button>
        <button class="btn btn-sm" onclick="fetchDashboard(true)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
          Refresh
        </button>
      </div>
    </header>

    <!-- KPI Summary Row -->
    <section class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-label">Uptime & Health</div>
        <div class="kpi-val" id="kpiHealth">--%</div>
        <div class="kpi-hint" id="kpiHealthSub">Aggregated check pass rate</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Monitored Domains</div>
        <div class="kpi-val" id="kpiSites">--</div>
        <div class="kpi-hint" id="kpiSitesSub">0 active endpoints</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Mean Latency (TTFB)</div>
        <div class="kpi-val" id="kpiLatency">-- ms</div>
        <div class="kpi-hint" id="kpiLatencySub">HTTP response time</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Open Incidents</div>
        <div class="kpi-val" id="kpiIncidents">0</div>
        <div class="kpi-hint" id="kpiIncidentsSub">0 critical outages</div>
      </div>
    </section>

    <!-- Quick Audit & Add Domain Bar -->
    <section class="audit-box">
      <div class="audit-box-header">
        <div class="audit-box-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Add Domain & Run Instant Audit
        </div>
        <span style="font-size: 11px; color: var(--fg-muted);">Executes 9 automated checks synchronously</span>
      </div>

      <form class="audit-form-grid" id="auditForm" onsubmit="handleQuickAudit(event)">
        <input type="text" class="form-ctrl" id="inputUrl" placeholder="Enter URL or domain (e.g. rdx-request-management-system.vercel.app)" required>
        <input type="text" class="form-ctrl" id="inputName" placeholder="Site label (optional)">
        <select class="form-ctrl" id="selectProfile">
          <option value="generic">Profile: Generic Website</option>
          <option value="api">Profile: REST / GraphQL API</option>
        </select>
        <button type="submit" class="btn btn-primary" id="btnSubmitAudit" style="white-space: nowrap;">
          Audit & Add
        </button>
      </form>
    </section>

    <!-- Filter and Search Toolbar -->
    <div class="filter-bar">
      <div class="filter-group">
        <button class="f-btn active" data-filter="all" onclick="setFilter('all', this)">All <span class="f-badge" id="bAll">0</span></button>
        <button class="f-btn" data-filter="ok" onclick="setFilter('ok', this)">Healthy <span class="f-badge" id="bOk" style="color:var(--ok);">0</span></button>
        <button class="f-btn" data-filter="warn" onclick="setFilter('warn', this)">Warning <span class="f-badge" id="bWarn" style="color:var(--warn);">0</span></button>
        <button class="f-btn" data-filter="crit" onclick="setFilter('crit', this)">Critical <span class="f-badge" id="bCrit" style="color:var(--crit);">0</span></button>
      </div>

      <div style="display:flex; align-items:center; gap:8px;">
        <div class="search-input-wrap">
          <svg class="search-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="search-ctrl" id="searchBox" placeholder="Filter by domain or label..." oninput="renderSites()">
        </div>
      </div>
    </div>

    <!-- Sites Grid -->
    <div class="sites-grid" id="sitesGrid"></div>

    <!-- Open Incidents Section -->
    <div class="inc-panel" id="incidentsPanel" style="display:none;">
      <div style="font-size:13px; font-weight:600; color:#fff; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
        <span style="color:var(--warn);">⚠</span> Active Incidents
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="text-align:left; border-bottom:1px solid var(--border); color:var(--fg-muted); font-size:11px;">
              <th style="padding:6px 8px;">Severity</th>
              <th style="padding:6px 8px;">Domain</th>
              <th style="padding:6px 8px;">Check</th>
              <th style="padding:6px 8px;">Summary</th>
              <th style="padding:6px 8px;">Opened</th>
              <th style="padding:6px 8px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody id="incidentsBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Detailed Inspection & History Drawer -->
  <div class="drawer-overlay" id="drawerOverlay" onclick="handleDrawerOverlayClick(event)">
    <div class="drawer-panel">
      <div class="drawer-head">
        <div>
          <div style="font-size: 15px; font-weight: 700; color: #fff;" id="drSiteName">Site Report</div>
          <a href="#" target="_blank" rel="noopener noreferrer" class="site-link" id="drSiteUrl"></a>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="btn btn-sm" id="btnDrawerRetest" onclick="retestActiveSite()">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Re-Audit Now
          </button>
          <button class="close-icon-btn" onclick="closeDrawer()">&times;</button>
        </div>
      </div>

      <!-- Drawer Tabs: Diagnostics vs History -->
      <div class="drawer-tabs">
        <button class="d-tab active" id="tabDiagnostics" onclick="switchDrawerTab('diagnostics')">Diagnostics & Checks</button>
        <button class="d-tab" id="tabHistory" onclick="switchDrawerTab('history')">Run History & Timeline</button>
        <button class="d-tab" id="tabRaw" onclick="switchDrawerTab('raw')">Raw JSON</button>
      </div>

      <div class="drawer-body" id="drawerBody">
        <!-- Content injected dynamically -->
      </div>
    </div>
  </div>

  <div class="toast-tray" id="toastTray"></div>

  <script>
    // State
    let state = {
      sites: [],
      incidents: [],
      overview: {},
      activeFilter: 'all',
      activeDrawerSiteId: null,
      activeDrawerTab: 'diagnostics',
      historyCache: {},
      lastFetchTime: null
    };

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }

    function showToast(msg, type = 'info') {
      const tray = document.getElementById('toastTray');
      const el = document.createElement('div');
      el.className = 'toast-msg';
      const mark = type === 'ok' ? '✔' : type === 'warn' ? '⚠' : 'ℹ';
      el.innerHTML = '<span style="color:var(--' + (type === 'ok' ? 'ok' : type === 'warn' ? 'warn' : 'fg') + ');">' + mark + '</span> ' + esc(msg);
      tray.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.2s';
        setTimeout(() => el.remove(), 250);
      }, 3500);
    }

    // Health Computation
    function getStatus(checks) {
      if (!checks || !checks.length) return 'pending';
      if (checks.some(c => c.status === 'fail' || c.status === 'error')) return 'crit';
      if (checks.some(c => c.status === 'warn')) return 'warn';
      return 'ok';
    }

    // Maps a check's raw status ('pass'/'warn'/'fail'/'error') to the status-badge
    // CSS modifier ('ok'/'warn'/'crit'/'pending') — the two vocabularies differ.
    function badgeClass(status) {
      if (status === 'pass') return 'ok';
      if (status === 'warn') return 'warn';
      if (status === 'fail' || status === 'error') return 'crit';
      return 'pending';
    }
    function badgeLabel(status) {
      if (status === 'pass') return 'Pass';
      if (status === 'warn') return 'Warning';
      if (status === 'fail' || status === 'error') return 'Fail';
      return 'Pending';
    }
    // Worst status across a group of checks that make up one diagnostics box.
    function groupStatus() {
      const arr = Array.prototype.slice.call(arguments).filter(Boolean);
      if (!arr.length) return undefined;
      if (arr.some(c => c.status === 'fail' || c.status === 'error')) return 'fail';
      if (arr.some(c => c.status === 'warn')) return 'warn';
      return 'pass';
    }

    // Short, actionable next step per fixed error class (Revised Spec v2 error codes).
    const REMEDY_HINTS = {
      dns_fail: "Verify the domain's DNS records point to an active host.",
      tcp_refused: 'Check that the server is running and the port is open to the internet.',
      tcp_timeout: 'Check firewall rules and server load — the host is not responding in time.',
      tls_fail: 'Renew or reinstall the TLS certificate for this domain.',
      http_status: 'Confirm the endpoint is reachable and returns the expected status code.',
      timeout: 'Investigate slow backend responses or increase the check timeout threshold.',
      assertion_fail: 'Review the expected vs. actual values recorded for this check.',
      blocked_by_bot_protection: "Allowlist the monitor's user-agent or X-Monitor-Token header at the edge/WAF.",
      selector_not_found: 'Confirm the page markup still contains the expected element.',
      worker_error: 'Check monitor worker logs — this is an internal error, not a site issue.',
    };

    // Renders "which check failed and why" as a colored banner plus a remedy hint, for one check.
    function diagReasonBanner(check) {
      if (!check || check.status === 'pass') return '';
      const cls = (check.status === 'fail' || check.status === 'error') ? 'crit' : 'warn';
      const msg = check.error_message || (check.check_type + ' did not pass, no further detail recorded');
      const remedy = REMEDY_HINTS[check.error_code];
      return '<div class="diag-reason-banner ' + cls + '">' + esc(msg) + '</div>'
        + (remedy ? '<div class="diag-remedy">💡 ' + esc(remedy) + '</div>' : '');
    }
    function diagBoxClass(status) {
      if (status === 'fail' || status === 'error') return ' crit';
      if (status === 'warn') return ' warn';
      return '';
    }

    // Fetch Full Dashboard
    async function fetchDashboard(showToastFeedback = false) {
      try {
        const res = await fetch('/api/dashboard/stats');
        if (!res.ok) return;
        const data = await res.json();
        state.sites = data.sites || [];
        state.incidents = data.incidents || [];
        state.overview = data.overview || {};
        state.lastFetchTime = new Date();

        updateOverviewUI();
        renderSites();
        renderIncidents();

        // If drawer is currently open for a site, update it without closing or losing focus!
        if (state.activeDrawerSiteId) {
          updateDrawerContent();
        }

        if (showToastFeedback) showToast('Dashboard refreshed', 'ok');
      } catch (err) {
        console.error('Sync failed', err);
      }
    }

    function updateOverviewUI() {
      const ov = state.overview;
      document.getElementById('kpiHealth').textContent = (ov.healthPercent ?? 100) + '%';
      document.getElementById('kpiSites').textContent = (ov.activeSites ?? 0) + ' / ' + (ov.totalSites ?? 0);
      document.getElementById('kpiSitesSub').textContent = (ov.totalSites ?? 0) + ' configured sites';
      document.getElementById('kpiLatency').textContent = (ov.avgLatencyMs ?? 0) + ' ms';
      document.getElementById('kpiIncidents').textContent = ov.activeIncidents ?? 0;
      document.getElementById('kpiIncidentsSub').textContent = (ov.criticalIncidents ?? 0) + ' critical';

      let ok = 0, warn = 0, crit = 0;
      state.sites.forEach(s => {
        const st = getStatus(s.checks);
        if (st === 'ok') ok++;
        else if (st === 'warn') warn++;
        else if (st === 'crit') crit++;
      });
      document.getElementById('bAll').textContent = state.sites.length;
      document.getElementById('bOk').textContent = ok;
      document.getElementById('bWarn').textContent = warn;
      document.getElementById('bCrit').textContent = crit;
    }

    function setFilter(f, btn) {
      state.activeFilter = f;
      document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSites();
    }

    function renderSites() {
      const grid = document.getElementById('sitesGrid');
      const q = (document.getElementById('searchBox').value || '').toLowerCase().trim();

      const list = state.sites.filter(s => {
        const st = getStatus(s.checks);
        if (state.activeFilter !== 'all' && st !== state.activeFilter) return false;
        if (q) {
          return (s.name || '').toLowerCase().includes(q)
            || (s.url || '').toLowerCase().includes(q)
            || (s.tags || []).some(t => t.toLowerCase().includes(q));
        }
        return true;
      });

      if (!list.length) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:36px; color:var(--fg-muted); border:1px dashed var(--border); border-radius:var(--radius);">'
          + 'No sites match criteria. Use the audit bar above to add a site.'
          + '</div>';
        return;
      }

      grid.innerHTML = list.map(site => {
        const st = getStatus(site.checks);
        const checks = site.checks || [];
        const latencyCheck = checks.find(c => c.check_type === 'performance.response_time');
        const latency = latencyCheck?.response_time_ms;

        // Recent Runs Uptime Bar (last 15 runs from history)
        const recentRuns = site.recent_runs || [];
        let uptimeBarsHtml = '';
        if (recentRuns.length) {
          const reversed = [...recentRuns].reverse();
          uptimeBarsHtml = reversed.map(r => {
            const rStatus = r.failed > 0 ? 'crit' : r.warned > 0 ? 'warn' : 'ok';
            const dateStr = new Date(r.started_at).toLocaleTimeString();
            return '<div class="uptime-bar ' + rStatus + '" title="Run at ' + dateStr + ' (' + (r.latency_ms ?? '--') + ' ms) - ' + r.passed + ' passed, ' + r.warned + ' warn"></div>';
          }).join('');
        } else {
          uptimeBarsHtml = '<div class="uptime-bar ok" style="opacity:0.3;" title="Initial cycle pending"></div>';
        }

        // Key checks indicators
        const tags = [
          { key: 'availability.dns', label: 'DNS' },
          { key: 'ssl.cert_expiry', label: 'SSL' },
          { key: 'availability.http_status', label: 'HTTP' },
          { key: 'performance.response_time', label: 'TTFB' },
          { key: 'technical.security_headers', label: 'Headers' },
          { key: 'seo.robots_txt', label: 'Robots' },
          { key: 'seo.sitemap_xml', label: 'Sitemap' },
        ].map(item => {
          const c = checks.find(x => x.check_type === item.key);
          const cSt = c ? c.status : 'none';
          return '<span class="check-tag ' + cSt + '">' + item.label + '</span>';
        }).join('');

        // Failing / warning checks surfaced right on the card, with the recorded reason for each.
        const problems = checks.filter(c => c.status === 'warn' || c.status === 'fail' || c.status === 'error');
        const issuesHtml = problems.length
          ? '<div class="card-issues' + (problems.some(c => c.status === 'fail' || c.status === 'error') ? ' crit' : '') + '">'
            + problems.map(c => '<div class="card-issue-row"><strong>' + esc(c.check_type) + ':</strong> ' + esc(c.error_message || 'Check did not pass') + '</div>').join('')
            + '</div>'
          : '';

        return '<div class="site-card">'
          + '<div class="site-card-top">'
            + '<div style="overflow:hidden;">'
              + '<div class="site-title">'
                + '<span class="status-indicator ' + st + '"></span>'
                + esc(site.name)
              + '</div>'
              + '<a href="' + esc(site.url) + '" target="_blank" rel="noopener noreferrer" class="site-link">'
                + esc(site.url)
                + '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>'
              + '</a>'
            + '</div>'
            + '<div style="display:flex; align-items:flex-start; gap:8px; flex-shrink:0;">'
              + '<div class="card-thumb" title="Live preview (may be blank if the site blocks embedding)" onclick="openDrawer(' + site.id + ')">'
                + '<iframe src="' + esc(site.url) + '" loading="lazy" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" tabindex="-1" aria-hidden="true"></iframe>'
              + '</div>'
              + '<span class="status-badge ' + st + '">' + (st === 'ok' ? 'Healthy' : st === 'warn' ? 'Warning' : st === 'crit' ? 'Critical' : 'Pending') + '</span>'
            + '</div>'
          + '</div>'

          + '<div>'
            + '<div class="uptime-timeline">' + uptimeBarsHtml + '</div>'
            + '<div class="uptime-caption"><span>Recent audit runs</span><span>' + (latency != null ? latency + ' ms' : '--') + '</span></div>'
          + '</div>'

          + '<div class="checks-flow">' + tags + '</div>'

          + issuesHtml

          + '<div class="site-card-foot">'
            + '<div class="foot-meta">'
              + '<span>' + esc(site.profile_id) + '</span>'
              + '<span>·</span>'
              + (site.is_active ? '<span style="color:var(--ok)">Active</span>' : '<span style="color:var(--fg-muted)">Paused</span>')
            + '</div>'
            + '<div class="foot-actions">'
              + '<button class="btn btn-sm" onclick="openDrawer(' + site.id + ')">Report & History</button>'
              + '<button class="btn btn-sm" onclick="retestSingleSite(' + site.id + ', this)">Re-test</button>'
              + '<button class="btn btn-sm btn-danger" onclick="deleteSite(' + site.id + ')" title="Delete">🗑</button>'
            + '</div>'
          + '</div>'
        + '</div>';
      }).join('');
    }

    function renderIncidents() {
      const panel = document.getElementById('incidentsPanel');
      const tbody = document.getElementById('incidentsBody');
      const incs = state.incidents || [];

      if (!incs.length) {
        panel.style.display = 'none';
        return;
      }

      panel.style.display = 'block';
      tbody.innerHTML = incs.map(i => {
        const opened = new Date(i.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return '<tr style="border-bottom: 1px solid var(--border-subtle);">'
          + '<td style="padding:8px;"><span class="status-badge ' + (i.severity === 'critical' ? 'crit' : 'warn') + '">' + esc(i.severity) + '</span></td>'
          + '<td style="padding:8px; font-weight:600; color:#fff;">' + esc(i.site_name) + '</td>'
          + '<td style="padding:8px;"><code class="mono">' + esc(i.check_type) + '</code></td>'
          + '<td style="padding:8px; color:var(--fg-secondary); max-width:300px;">' + esc(i.summary) + '</td>'
          + '<td style="padding:8px; font-size:11px; color:var(--fg-muted);">' + opened + '</td>'
          + '<td style="padding:8px; text-align:right;">'
            + '<div style="display:inline-flex; gap:6px;">'
              + (i.status === 'open' ? '<button class="btn btn-sm" onclick="ackInc(' + i.id + ')">Ack</button>' : '')
              + '<button class="btn btn-sm btn-primary" onclick="resolveInc(' + i.id + ')">Resolve</button>'
            + '</div>'
          + '</td>'
        + '</tr>';
      }).join('');
    }

    // Quick Audit Form Submission
    async function handleQuickAudit(e) {
      e.preventDefault();
      const inUrl = document.getElementById('inputUrl');
      const inName = document.getElementById('inputName');
      const selProfile = document.getElementById('selectProfile');
      const btn = document.getElementById('btnSubmitAudit');

      const url = inUrl.value.trim();
      if (!url) return;

      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="spin">⚡</span> Auditing...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            name: inName.value.trim() || undefined,
            profile: selProfile.value
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Audit failed');
        }

        const data = await res.json();
        showToast('Audit complete for ' + data.site.name, 'ok');
        inUrl.value = '';
        inName.value = '';

        // Immediately refresh state and open drawer to inspect
        await fetchDashboard();
        openDrawer(data.site.id);
      } catch (err) {
        showToast(err.message, 'crit');
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    // Retest Single Site
    async function retestSingleSite(id, btn) {
      if (btn) {
        btn.innerHTML = '<span class="spin">⚡</span>';
        btn.disabled = true;
      }
      try {
        const res = await fetch('/api/sites/' + id + '/run', { method: 'POST' });
        if (!res.ok) throw new Error('Retest failed');
        showToast('Audit run completed', 'ok');
        await fetchDashboard();
      } catch (err) {
        showToast(err.message, 'crit');
      } finally {
        if (btn) {
          btn.innerHTML = 'Re-test';
          btn.disabled = false;
        }
      }
    }

    async function retestActiveSite() {
      if (!state.activeDrawerSiteId) return;
      const btn = document.getElementById('btnDrawerRetest');
      btn.innerHTML = '<span class="spin">⚡</span> Auditing...';
      btn.disabled = true;
      try {
        await fetch('/api/sites/' + state.activeDrawerSiteId + '/run', { method: 'POST' });
        showToast('Audit run completed', 'ok');
        // Invalidate history cache so it re-fetches latest history instantly!
        delete state.historyCache[state.activeDrawerSiteId];
        await fetchDashboard();
      } catch (err) {
        showToast(err.message, 'crit');
      } finally {
        btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Re-Audit Now';
        btn.disabled = false;
      }
    }

    // Run All Audits
    async function runAllAudits() {
      const btn = document.getElementById('btnRunAll');
      btn.innerHTML = '<span class="spin">⚡</span> Queuing...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const d = await res.json();
        showToast('Queued ' + (d.queued || 0) + ' audits', 'ok');
        setTimeout(fetchDashboard, 3000);
      } catch (err) {
        showToast(err.message, 'crit');
      } finally {
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Run All Checks';
        btn.disabled = false;
      }
    }

    // Delete Site
    async function deleteSite(id) {
      if (!confirm('Are you sure you want to delete this monitored site?')) return;
      try {
        await fetch('/api/sites/' + id, { method: 'DELETE' });
        showToast('Site removed', 'ok');
        if (state.activeDrawerSiteId === id) closeDrawer();
        await fetchDashboard();
      } catch (err) {
        showToast(err.message, 'crit');
      }
    }

    // Drawer Management
    function openDrawer(siteId) {
      state.activeDrawerSiteId = siteId;
      document.getElementById('drawerOverlay').classList.add('active');
      updateDrawerContent();
    }
    function closeDrawer() {
      document.getElementById('drawerOverlay').classList.remove('active');
      state.activeDrawerSiteId = null;
    }
    function handleDrawerOverlayClick(e) {
      if (e.target.id === 'drawerOverlay') closeDrawer();
    }

    function switchDrawerTab(tab) {
      state.activeDrawerTab = tab;
      document.getElementById('tabDiagnostics').classList.toggle('active', tab === 'diagnostics');
      document.getElementById('tabHistory').classList.toggle('active', tab === 'history');
      document.getElementById('tabRaw').classList.toggle('active', tab === 'raw');
      updateDrawerContent();
    }

    async function updateDrawerContent() {
      const site = state.sites.find(s => s.id === state.activeDrawerSiteId);
      if (!site) return;

      document.getElementById('drSiteName').textContent = site.name;
      const urlEl = document.getElementById('drSiteUrl');
      urlEl.textContent = site.url;
      urlEl.href = site.url;

      const body = document.getElementById('drawerBody');

      if (state.activeDrawerTab === 'diagnostics') {
        const checks = site.checks || [];
        const find = (type) => checks.find(c => c.check_type === type);

        const dns = find('availability.dns');
        const http = find('availability.http_status');
        const redirects = find('availability.redirect_chain');
        const latency = find('performance.response_time');
        const ssl = find('ssl.cert_expiry');
        const headers = find('technical.security_headers');
        const robots = find('seo.robots_txt');
        const sitemap = find('seo.sitemap_xml');
        const noindex = find('content.noindex');

        const netStatus = groupStatus(dns, http, redirects);
        const perfStatus = groupStatus(latency);
        const secStatus = groupStatus(ssl, headers);
        const seoStatus = groupStatus(robots, sitemap, noindex);

        body.innerHTML =
          // Live Snapshot
          '<div class="snapshot-card">'
            + '<div class="snapshot-top">'
              + '<span>LIVE PREVIEW</span>'
              + '<a href="' + esc(site.url) + '" target="_blank" rel="noopener noreferrer" class="site-link" style="margin:0;">Open site '
                + '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>'
              + '</a>'
            + '</div>'
            + '<div class="snapshot-viewport">'
              + '<iframe class="snapshot-frame" src="' + esc(site.url) + '" loading="lazy" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>'
            + '</div>'
            + '<div class="snapshot-note">Live embedded preview, not a stored image — some sites block embedding via X-Frame-Options/CSP and will render blank.</div>'
          + '</div>'

          // Availability Box
          + '<div class="diag-item-box' + diagBoxClass(netStatus) + '">'
            + '<div class="diag-title"><span>Network & Connectivity</span><span class="status-badge ' + badgeClass(netStatus) + '">' + badgeLabel(netStatus) + '</span></div>'
            + '<table class="diag-table">'
              + '<tr><td class="col-name">DNS Resolution</td><td class="col-val">' + (dns?.response_time_ms != null ? dns.response_time_ms + ' ms' : 'Resolves') + (dns?.actual_value?.addresses ? ' · ' + esc(JSON.stringify(dns.actual_value.addresses)) : '') + '</td></tr>'
              + '<tr><td class="col-name">HTTP Status</td><td class="col-val">' + (http?.response_code || 200) + ' (Method: ' + (http?.metadata?.method || 'HEAD') + ')</td></tr>'
              + '<tr><td class="col-name">Redirect Chain</td><td class="col-val">' + (redirects?.actual_value?.hops ?? 0) + ' hops · HTTPS verified</td></tr>'
            + '</table>'
            + diagReasonBanner(dns) + diagReasonBanner(http) + diagReasonBanner(redirects)
          + '</div>'

          // Performance Box
          + '<div class="diag-item-box' + diagBoxClass(perfStatus) + '">'
            + '<div class="diag-title"><span>Performance & Latency</span><span class="status-badge ' + badgeClass(perfStatus) + '">' + badgeLabel(perfStatus) + '</span></div>'
            + '<table class="diag-table">'
              + '<tr><td class="col-name">Time to First Byte</td><td class="col-val" style="font-weight:600; color:#fff;">' + (latency?.response_time_ms != null ? latency.response_time_ms + ' ms' : 'N/A') + ' <span style="color:var(--fg-muted); font-size:10px;">(Warn: 800ms / Crit: 2000ms)</span></td></tr>'
            + '</table>'
            + diagReasonBanner(latency)
          + '</div>'

          // Security Box
          + '<div class="diag-item-box' + diagBoxClass(secStatus) + '">'
            + '<div class="diag-title"><span>SSL Certificate & Security Headers</span><span class="status-badge ' + badgeClass(secStatus) + '">' + badgeLabel(secStatus) + '</span></div>'
            + '<table class="diag-table">'
              + '<tr><td class="col-name">SSL Expiry</td><td class="col-val">' + (ssl?.actual_value?.days_left != null ? ssl.actual_value.days_left + ' days remaining · ' + esc(ssl.actual_value.issuer || 'Valid CA') : 'Valid') + '</td></tr>'
              + '<tr><td class="col-name">Security Headers</td><td class="col-val">' + (headers?.error_message ? '<span style="color:var(--warn);">' + esc(headers.error_message) + '</span>' : '<span style="color:var(--ok);">All expected security headers present</span>') + '</td></tr>'
            + '</table>'
            + diagReasonBanner(ssl) + diagReasonBanner(headers)
          + '</div>'

          // SEO Box
          + '<div class="diag-item-box' + diagBoxClass(seoStatus) + '">'
            + '<div class="diag-title"><span>Search Engine Indexing & Crawl</span><span class="status-badge ' + badgeClass(seoStatus) + '">' + badgeLabel(seoStatus) + '</span></div>'
            + '<table class="diag-table">'
              + '<tr><td class="col-name">Robots.txt</td><td class="col-val">' + (robots?.status === 'pass' ? 'Accessible, crawlers allowed' : 'Status ' + (robots?.response_code || 404)) + '</td></tr>'
              + '<tr><td class="col-name">Sitemap XML</td><td class="col-val">' + (sitemap?.status === 'pass' ? 'Valid urlset structure' : 'Returned ' + (sitemap?.response_code || 'error')) + '</td></tr>'
              + '<tr><td class="col-name">Noindex Directive</td><td class="col-val">' + (noindex?.status === 'pass' ? 'Indexing allowed' : 'Noindex directive active') + '</td></tr>'
            + '</table>'
            + diagReasonBanner(robots) + diagReasonBanner(sitemap) + diagReasonBanner(noindex)
          + '</div>';
      }
      else if (state.activeDrawerTab === 'history') {
        body.innerHTML = '<div style="font-size:12px; color:var(--fg-muted);"><span class="spin">⚡</span> Loading historical check runs from database...</div>';

        // Fetch history if not cached
        let history = state.historyCache[site.id];
        if (!history) {
          try {
            const hRes = await fetch('/api/sites/' + site.id + '/history');
            if (hRes.ok) {
              history = await hRes.json();
              state.historyCache[site.id] = history;
            }
          } catch (err) {
            body.innerHTML = '<div style="color:var(--crit);">Failed to load history: ' + err.message + '</div>';
            return;
          }
        }

        if (!history || !history.length) {
          body.innerHTML = '<div style="color:var(--fg-muted); padding:20px; text-align:center;">No history recorded yet. Click "Re-Audit Now" to trigger a run.</div>';
          return;
        }

        const rowsHtml = history.map(h => {
          const runDate = new Date(h.started_at).toLocaleString();
          const runStatus = h.fail_checks > 0 ? 'crit' : h.warn_checks > 0 ? 'warn' : 'ok';
          return '<tr>'
            + '<td>' + runDate + '</td>'
            + '<td><span class="status-badge ' + runStatus + '">' + (runStatus === 'ok' ? 'Pass' : runStatus === 'warn' ? 'Warn' : 'Fail') + '</span></td>'
            + '<td>' + (h.avg_ms != null ? h.avg_ms + ' ms' : '--') + '</td>'
            + '<td><span style="color:var(--ok);">' + h.passed_checks + ' pass</span>' + (h.warn_checks ? ' · <span style="color:var(--warn);">' + h.warn_checks + ' warn</span>' : '') + (h.fail_checks ? ' · <span style="color:var(--crit);">' + h.fail_checks + ' fail</span>' : '') + '</td>'
            + '<td><span style="color:var(--fg-muted);">' + esc(h.trigger) + '</span></td>'
          + '</tr>';
        }).join('');

        body.innerHTML = 
          '<div style="font-size:12px; color:var(--fg-secondary); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">'
            + '<span>Total Recorded Runs: <strong style="color:#fff;">' + history.length + '</strong></span>'
            + '<span style="font-size:11px; color:var(--fg-muted);">Live database audit trail</span>'
          + '</div>'
          + '<div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden;">'
            + '<table class="history-table">'
              + '<thead><tr><th>Timestamp</th><th>Status</th><th>Latency</th><th>Checks Breakdown</th><th>Trigger</th></tr></thead>'
              + '<tbody>' + rowsHtml + '</tbody>'
            + '</table>'
          + '</div>';
      } 
      else if (state.activeDrawerTab === 'raw') {
        body.innerHTML = '<div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius); padding:14px; overflow-x:auto;">'
          + '<pre class="mono" style="font-size:11px; color:var(--fg-secondary);">' + esc(JSON.stringify(site, null, 2)) + '</pre>'
          + '</div>';
      }
    }

    // Incident Handlers
    async function ackInc(id) {
      await fetch('/api/incidents/' + id + '/ack', { method: 'POST' });
      showToast('Incident acknowledged', 'ok');
      fetchDashboard();
    }
    async function resolveInc(id) {
      await fetch('/api/incidents/' + id + '/resolve', { method: 'POST' });
      showToast('Incident resolved', 'ok');
      fetchDashboard();
    }

    // Initial Load & Non-Intrusive Background Auto-Sync (Every 5 seconds)
    fetchDashboard();
    setInterval(() => {
      fetchDashboard(false);
    }, 5000);
  </script>
</body>
</html>`;
}
