/**
 * Submission Quality Checker - Live Floating HUD & Visual UI Overlay (v2 UI)
 * Floating status pill, full-height side sheet, unified dialog system, field highlights and toasts.
 *
 * Public API is unchanged: init, updateState, updateApplyFlowInfo, setQuickApplyStatus,
 * showToast, updateDrawer, updateFieldHighlights, showBlockingModal, removeBlockingModal, toggleDrawer.
 */

window.SubmissionHUD = (function () {
  'use strict';

  let containerEl = null;
  let pillEl = null;
  let drawerEl = null;
  let blockingDialog = null;
  let isDrawerOpen = false;
  let activeTab = 'overview'; // 'overview' | 'fields' | 'job' | 'debug'
  let fieldFilter = 'all';    // 'all' | 'required' | 'empty'
  let fieldQuery = '';
  let activeTooltips = [];
  let openDialogs = [];

  let currentProfile = null;
  let currentSettings = null;
  let currentDuplicateRecord = null;
  let allProfiles = [];
  let currentApplyFlowParams = null;
  let currentApplyFlowContext = null;
  let quickApplyState = 'idle'; // 'idle' | 'pending' | 'submitted'
  let currentScreenshots = [];

  let lastValidation = null;
  let lastExtracted = null;
  let lastDrawerFingerprint = '';
  let escListenerBound = false;
  let isVerifyingWithApplyFlow = false;
  let verifyBannerEl = null;
  let verifyBannerTimer = null;

  // ---------------------------------------------------------------------------
  // Icon set (inline SVG, stroke-based)
  // ---------------------------------------------------------------------------
  const ICONS = {
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    shieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    paste: '<path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M12 11v6M9 14l3 3 3-3"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    bot: '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    userX: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    octagon: '<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z"/><path d="M15 9l-6 6M9 9l6 6"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
  };

  function icon(name, size = 16, extraClass = '') {
    return `<svg class="sqc-ic ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  function spinner(size = 14) {
    return icon('loader', size, 'sqc-spin');
  }

  // Ensure HUD container is attached to DOM (resilient against SPA page re-renders)
  // CRITICAL: HUD overlay is ONLY rendered in the top-level window. Child iframes never render their own floating HUD.
  function ensureContainer() {
    if (window !== window.top) {
      return null;
    }

    // Do not inject container on non-job pages or portals
    if (window.JobFormExtractor && !window.JobFormExtractor.isJobApplicationPortal()) {
      if (containerEl) {
        try { containerEl.remove(); } catch (_) {}
        containerEl = null;
      }
      return null;
    }

    if (!containerEl || !document.body || !document.body.contains(containerEl)) {
      let existing = document.getElementById('sqc-hud-container');
      if (existing && document.body && document.body.contains(existing)) {
        containerEl = existing;
        containerEl.classList.add('sqc-root');
      } else {
        if (existing) existing.remove();
        if (document.body) {
          containerEl = document.createElement('div');
          containerEl.id = 'sqc-hud-container';
          containerEl.className = 'sqc-root';
          try {
            const savedPos = localStorage.getItem('sqc_pill_pos');
            if (savedPos) {
              const pos = JSON.parse(savedPos);
              if (pos.left && pos.left !== 'auto') containerEl.style.left = pos.left;
              if (pos.top) containerEl.style.top = pos.top;
              if (pos.right && pos.right !== 'auto') containerEl.style.right = pos.right;
            }
          } catch (_) {}
          document.body.appendChild(containerEl);
          if (pillEl) containerEl.appendChild(pillEl);
          if (drawerEl && isDrawerOpen) containerEl.appendChild(drawerEl);
        }
      }
    }
    if (containerEl) containerEl.classList.toggle('sqc-is-open', isDrawerOpen);
    return containerEl;
  }

  function bindGlobalKeys() {
    if (escListenerBound) return;
    escListenerBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isDrawerOpen && openDialogs.length === 0) {
        toggleDrawer(false);
      }
    });
  }

  // Teardown HUD and remove all injected elements from DOM
  function destroy() {
    if (containerEl) {
      try { containerEl.remove(); } catch (_) {}
      containerEl = null;
    }
    if (backdropEl) {
      try { backdropEl.remove(); } catch (_) {}
      backdropEl = null;
    }
    pillEl = null;
    drawerEl = null;
    blockingDialog = null;
    isDrawerOpen = false;
    lastValidation = null;
    lastExtracted = null;
    lastDrawerFingerprint = '';
    const existingModal = document.getElementById('sqc-modal-overlay');
    if (existingModal) {
      try { existingModal.remove(); } catch (_) {}
    }
    updateFieldHighlights(new Map());
  }

  function getActiveProfile() {
    return currentProfile;
  }

  // Initialize HUD in DOM
  function init(profiles, activeProfile, settings) {
    if (window !== window.top) {
      return; // Do not render floating HUD inside iframes
    }

    if (window.JobFormExtractor && !window.JobFormExtractor.isJobApplicationPortal()) {
      return; // Do not render on non-job portal pages like ChatGPT
    }

    allProfiles = profiles || [];
    currentProfile = activeProfile;
    currentSettings = settings;

    // Eagerly resolve Apply-Flow parameters from URL, session, or window storage
    if (window.JobFormExtractor) {
      currentApplyFlowParams = window.JobFormExtractor.extractApplyFlowParams();
    } else if (window.__SQC_PERSISTED_AF_SESSION) {
      currentApplyFlowParams = { ...window.__SQC_PERSISTED_AF_SESSION };
    }

    ensureContainer();
    renderPill();
    if (pillEl) setupDraggable(pillEl);
    bindGlobalKeys();
  }

  function updateState(profiles, activeProfile, settings, duplicateRecord) {
    allProfiles = profiles || allProfiles;
    currentProfile = activeProfile || currentProfile;
    currentSettings = settings || currentSettings;
    currentDuplicateRecord = duplicateRecord !== undefined ? duplicateRecord : currentDuplicateRecord;
    lastDrawerFingerprint = '';
    lastValidation = null;
    lastExtracted = null;
    renderPill();
    if (isDrawerOpen) {
      updateDrawer(lastExtracted, lastValidation);
    }
  }

  let lastKnownJobUrl = '';

  function isSameJobPath(prevUrlKey, newUrlKey) {
    if (!prevUrlKey || !newUrlKey) return false;
    const clean = (url) => url.toLowerCase()
      .replace(/\/(confirmation|confirm|thank-you|thanks|submitted|success|step\d+|form|review|apply)\b.*$/i, '')
      .replace(/\/$/, '');
    return clean(prevUrlKey) === clean(newUrlKey);
  }

  function updateApplyFlowInfo(params, context) {
    currentApplyFlowParams = params || currentApplyFlowParams;
    currentApplyFlowContext = context || currentApplyFlowContext;
    const currentUrlKey = window.location.origin + window.location.pathname;
    if (lastKnownJobUrl && !isSameJobPath(lastKnownJobUrl, currentUrlKey)) {
      // Genuinely new job opened in this tab — reset quickApplyState for the new job
      quickApplyState = 'idle';
    }
    lastKnownJobUrl = currentUrlKey;
    lastDrawerFingerprint = '';
    renderPill();
  }

  function setQuickApplyStatus(status, message) {
    quickApplyState = status || 'idle';
    lastDrawerFingerprint = '';
    renderPill();
    if (message) {
      showToast(message);
    }
  }

  function setAlreadyApplied(record) {
    currentDuplicateRecord = record || currentDuplicateRecord || {};
    if (!currentApplyFlowContext) currentApplyFlowContext = {};
    currentApplyFlowContext.currentStatus = 'APPLIED';
    currentApplyFlowContext.status = 'APPLIED';
    if (record?.appliedAt) currentApplyFlowContext.appliedAt = record.appliedAt;

    if (lastValidation) {
      lastValidation.isAlreadyApplied = true;
      lastValidation.errors = (lastValidation.errors || []).filter(
        e => {
          const s = String(e.rule || '').toUpperCase();
          return !s.includes('REQUIRED') && !s.includes('EMPTY') && !s.includes('MISSING') && !s.includes('RESUME') && !s.includes('UNANSWERED') && !s.includes('FILE');
        }
      );
      lastValidation.isValid = lastValidation.errors.length === 0;
    }
    lastDrawerFingerprint = '';
    renderPill(lastValidation, lastExtracted);
    if (isDrawerOpen) {
      updateDrawer(lastExtracted, lastValidation);
    }
  }

  function clearAlreadyApplied() {
    currentDuplicateRecord = null;
    quickApplyState = 'idle';
    if (currentApplyFlowContext && (currentApplyFlowContext.currentStatus === 'APPLIED' || currentApplyFlowContext.status === 'APPLIED')) {
      delete currentApplyFlowContext.currentStatus;
      delete currentApplyFlowContext.status;
      delete currentApplyFlowContext.appliedAt;
    }
    if (lastValidation) {
      lastValidation.isAlreadyApplied = false;
    }
    lastDrawerFingerprint = '';
    renderPill(lastValidation, lastExtracted);
    if (isDrawerOpen) {
      updateDrawer(lastExtracted, lastValidation);
    }
  }

  function showVerificationBanner(opts = {}) {
    ensureContainer();
    if (!containerEl) return;

    const status = opts.status || 'verifying';
    if (status === 'dismiss') {
      hideVerificationBanner();
      return;
    }

    if (verifyBannerTimer) {
      clearTimeout(verifyBannerTimer);
      verifyBannerTimer = null;
    }

    isVerifyingWithApplyFlow = status === 'verifying';

    if (!verifyBannerEl) {
      verifyBannerEl = document.createElement('div');
      verifyBannerEl.className = 'sqc-verify-banner';
      containerEl.appendChild(verifyBannerEl);
    } else if (!containerEl.contains(verifyBannerEl)) {
      containerEl.appendChild(verifyBannerEl);
    }

    verifyBannerEl.classList.remove('is-leaving');

    const candName = opts.candidateName || currentProfile?.fullName || 'Candidate';

    if (status === 'verifying') {
      verifyBannerEl.innerHTML = `
        <div class="sqc-verify-inner t-pending">
          <span class="sqc-verify-spin">${spinner(14)}</span>
          <div class="sqc-verify-content">
            <div class="sqc-verify-title">
              <span>Verifying status in Apply-Flow…</span>
              <span class="sqc-verify-badge">Checking</span>
            </div>
            <div class="sqc-verify-desc">Checking submission history for <strong>${escapeHtml(candName)}</strong></div>
          </div>
        </div>
      `;
    } else if (status === 'verified') {
      verifyBannerEl.innerHTML = `
        <div class="sqc-verify-inner t-ok">
          <span class="sqc-verify-ic" style="color:#34d399;">${icon('checkCircle', 16)}</span>
          <div class="sqc-verify-content">
            <div class="sqc-verify-title" style="color:#6ee7b7;">Verified in Apply-Flow · Ready to Apply</div>
            <div class="sqc-verify-desc">No prior applications found for <strong>${escapeHtml(candName)}</strong>. You may proceed.</div>
          </div>
        </div>
      `;
      verifyBannerTimer = setTimeout(() => {
        hideVerificationBanner();
      }, 1600);
    } else if (status === 'applied') {
      const appliedDate = opts.appliedAt ? new Date(opts.appliedAt).toLocaleDateString() : '';
      const byUser = opts.appliedBy ? ` by ${opts.appliedBy}` : '';
      verifyBannerEl.innerHTML = `
        <div class="sqc-verify-inner t-warn">
          <span class="sqc-verify-ic" style="color:#fbbf24;">${icon('alert', 16)}</span>
          <div class="sqc-verify-content">
            <div class="sqc-verify-title" style="color:#fde68a;">⚠️ Already Applied in Apply-Flow</div>
            <div class="sqc-verify-desc"><strong>${escapeHtml(candName)}</strong> was already submitted${appliedDate ? ` on ${appliedDate}` : ''}${escapeHtml(byUser)}.</div>
          </div>
          <button class="sqc-verify-close" id="sqc-verify-banner-close" title="Dismiss notice">✕</button>
        </div>
      `;
      verifyBannerEl.querySelector('#sqc-verify-banner-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        hideVerificationBanner();
      });
      verifyBannerTimer = setTimeout(() => {
        hideVerificationBanner();
      }, 6500);
    }

    renderPill();
    if (isDrawerOpen) {
      updateDrawer(lastExtracted, lastValidation);
    }
  }

  function hideVerificationBanner() {
    isVerifyingWithApplyFlow = false;
    if (verifyBannerEl) {
      verifyBannerEl.classList.add('is-leaving');
      setTimeout(() => {
        if (verifyBannerEl && verifyBannerEl.parentNode) {
          verifyBannerEl.parentNode.removeChild(verifyBannerEl);
        }
        verifyBannerEl = null;
      }, 280);
    }
    renderPill();
  }

  function updateScreenshots(screenshots) {
    currentScreenshots = Array.isArray(screenshots) ? screenshots : [];
    lastDrawerFingerprint = '';
    if (isDrawerOpen) {
      updateDrawer(lastExtracted, lastValidation);
    }
  }

  function renderScreenshotsSection() {
    const count = currentScreenshots.length;
    return `
      <section class="sqc-section">
        <div class="sqc-section-head">
          <span class="sqc-section-title">Page screenshots (${count})</span>
          <button class="sqc-btn sqc-btn-soft sqc-btn-sm sqc-btn-snap-trigger" title="Capture a screenshot of the current form page">${icon('camera', 12)}Snap page</button>
        </div>
        ${count === 0 ? `
          <div class="sqc-empty" style="padding:14px 12px;">
            ${icon('camera', 18)}
            <span>Auto-captures as you answer questions, step through pages &amp; submit, or click <strong>Snap page</strong>.</span>
          </div>
        ` : `
          <div class="sqc-shots-grid">
            ${currentScreenshots.map((shot, idx) => `
              <div class="sqc-shot-card" data-shot-id="${escapeHtml(shot.id)}">
                <div class="sqc-shot-thumb-wrap" data-shot-preview="${escapeHtml(shot.id)}" title="Click to view full screenshot">
                  <img src="${escapeHtml(shot.data_url)}" alt="${escapeHtml(shot.step_label || `Step ${idx + 1}`)}" class="sqc-shot-thumb" />
                  <span class="sqc-shot-badge">${escapeHtml(shot.trigger === 'FINAL_SUBMIT' ? 'SUBMIT' : shot.trigger === 'STEP_TRANSITION' ? 'STEP' : shot.trigger === 'QUESTIONS_ANSWERED' ? 'Q&A' : 'SNAP')}</span>
                </div>
                <div class="sqc-shot-meta">
                  <div class="sqc-shot-label" title="${escapeHtml(shot.step_label)}">${escapeHtml(shot.step_label || `Page ${idx + 1}`)}</div>
                  <div class="sqc-shot-sub">
                    <span>${shot.answered_count || 0} ans</span>
                    <button class="sqc-shot-del" data-shot-delete="${escapeHtml(shot.id)}" title="Remove screenshot">${icon('trash', 11)}</button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </section>
    `;
  }

  function openScreenshotPreviewDialog(shotId) {
    const shot = currentScreenshots.find(s => s.id === shotId);
    if (!shot) return;
    openDialog({
      tone: 'accent',
      iconName: 'camera',
      title: escapeHtml(shot.step_label || 'Captured Page Screenshot'),
      subtitle: `Trigger: ${escapeHtml(shot.trigger || 'AUTO')} · ${shot.answered_count || 0} answered field(s) · ${shot.captured_at ? new Date(shot.captured_at).toLocaleTimeString() : ''}`,
      width: 760,
      body: `
        <div style="background:#0f172a;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);max-height:65vh;overflow-y:auto;">
          <img src="${escapeHtml(shot.data_url)}" alt="${escapeHtml(shot.step_label)}" style="width:100%;height:auto;display:block;" />
        </div>
      `,
      footer: `
        <span class="sqc-meta" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:460px;">${escapeHtml(shot.page_url || '')}</span>
        <span class="sqc-spacer"></span>
        <button class="sqc-btn sqc-btn-primary" data-sqc-close>Close preview</button>
      `
    });
  }

  // ---------------------------------------------------------------------------
  // Shared state helpers
  // ---------------------------------------------------------------------------
  function getEffectiveJobId() {
    return currentApplyFlowParams?.jobId ||
      window.__SQC_PERSISTED_AF_SESSION?.jobId ||
      (window.JobFormExtractor ? window.JobFormExtractor.extractApplyFlowParams()?.jobId : '');
  }

  function getApplyFlowJobStatus() {
    return (
      currentApplyFlowContext?.currentStatus ||
      currentApplyFlowContext?.jobProfile?.status ||
      currentApplyFlowContext?.status ||
      currentApplyFlowContext?.job_status ||
      ''
    ).toUpperCase();
  }

  function isAfSubmittedStatus() {
    return ['SUBMITTED', 'APPLIED'].includes(getApplyFlowJobStatus());
  }

  function isAfAppliedOrSubmitted() {
    const s = getApplyFlowJobStatus();
    return s === 'APPLIED' || s === 'SUBMITTED' || s === 'ALREADY_APPLIED';
  }

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatMoney(n) {
    const num = Number(n) || 0;
    if (num >= 1000) return `$${Math.round(num / 1000)}k`;
    return `$${num.toLocaleString()}`;
  }

  // Compute overall status (shared by pill + hero)
  function computeStatus(validationResult, extractedData) {
    const errCount = validationResult ? validationResult.errorCount ?? (validationResult.errors || []).length : 0;
    const warnCount = validationResult ? validationResult.warningCount ?? (validationResult.warnings || []).length : 0;

    let boundStatus = '';
    let boundAppliedAt = '';
    try {
      const bs = JSON.parse(sessionStorage.getItem('applyflow_bound_session') || '{}');
      const currentCanon = window.JobFormExtractor?.getCanonicalJobPath ? window.JobFormExtractor.getCanonicalJobPath(window.location.href) : '';
      const isMatch = Boolean(
        (bs.canonicalPath && currentCanon && (bs.canonicalPath === currentCanon || currentCanon.startsWith(bs.canonicalPath) || bs.canonicalPath.startsWith(currentCanon))) ||
        (bs.jobId && window.location.href.includes(bs.jobId))
      );
      if (isMatch) {
        if (bs.status) boundStatus = bs.status;
        if (bs.appliedAt) boundAppliedAt = bs.appliedAt;
      }
    } catch (_) {}

    const isBoundApplied = ['APPLIED', 'SUBMITTED', 'ALREADY_APPLIED'].includes(boundStatus);
    const isAlreadyApplied = Boolean(validationResult?.isAlreadyApplied || extractedData?.is_already_applied || currentDuplicateRecord || isBoundApplied || isAfAppliedOrSubmitted());
    const hasCaptcha = Boolean(extractedData?.captcha_detected?.has_captcha);
    const isAfLinked = Boolean(getEffectiveJobId());

    const hasAccountMismatch = Boolean((validationResult?.errors || []).some(e => e.rule === 'ACCOUNT_MISMATCH'));
    if (hasAccountMismatch) {
      const acctName = extractedData?.logged_in_account?.accountName || 'Another Account';
      return { tone: 'bad', label: 'Wrong Account', headline: `Signed into portal as ${acctName} (Expected: ${currentProfile?.firstName || 'Assigned'})` };
    }

    const hasContextMismatch = Boolean((validationResult?.errors || []).some(e => e.rule === 'CONTEXT_PROFILE_MISMATCH'));
    if (hasContextMismatch) {
      return { tone: 'bad', label: 'Wrong profile', headline: 'Context Mismatch: Incorrect profile attached' };
    }

    const stackMismatchErr = (validationResult?.errors || []).find(e => e.rule === 'JOB_STACK_MISMATCH');
    if (stackMismatchErr) {
      return { tone: 'bad', label: 'Stack Mismatch', headline: stackMismatchErr.message || 'Job stack does not match candidate profile track' };
    }

    if (validationResult?.isSubmissionFailed || extractedData?.is_submission_failed) {
      const msg = validationResult?.submissionFailureMessage || extractedData?.submission_failure_message || 'Submission failed';
      return { tone: 'bad', label: 'Unsuccessful', headline: msg };
    }

    if (isAlreadyApplied || isAfAppliedOrSubmitted()) {
      const dup = currentDuplicateRecord || {};
      const appliedDate = dup.appliedAt || dup.timestamp || dup.candidate?.applied_at || currentApplyFlowContext?.appliedAt || currentApplyFlowContext?.jobProfile?.appliedAt || boundAppliedAt;
      const formattedDate = appliedDate ? new Date(appliedDate).toLocaleDateString() : '';
      return { tone: 'warn', label: 'Already applied', headline: formattedDate ? `Applied on ${formattedDate} in Apply-Flow` : 'Already applied in Apply-Flow' };
    }

    if (quickApplyState === 'submitting') return { tone: 'pending', label: 'Submitting…', headline: 'Submitting application to Apply-Flow…' };
    if (quickApplyState === 'pending') return { tone: 'pending', label: 'Verifying…', headline: 'Verifying submission…' };
    if (isVerifyingWithApplyFlow && !isAlreadyApplied && !isAfAppliedOrSubmitted()) {
      return { tone: 'pending', label: 'Verifying…', headline: 'Verifying in Apply-Flow…' };
    }
    
    const isDirectPortalSuccess = typeof window !== 'undefined' && window.JobFormExtractor?.detectSubmissionSuccess?.()?.is_success;
    const isConfirmationPage = Boolean(
      quickApplyState === 'submitted' ||
      extractedData?.is_submission_success ||
      validationResult?.isSubmissionSuccess ||
      isDirectPortalSuccess ||
      /\/(confirmation|confirm|thank-you|thanks|submitted|success)\b/i.test(window.location.href)
    );

    if (isConfirmationPage) {
      return { tone: 'ok', label: 'Submitted', headline: 'Application submitted & confirmed' };
    }

    if (isAlreadyApplied || isAfAppliedOrSubmitted()) {
      const dup = currentDuplicateRecord || {};
      const appliedDate = dup.appliedAt || dup.timestamp || dup.candidate?.applied_at || currentApplyFlowContext?.appliedAt || currentApplyFlowContext?.jobProfile?.appliedAt || boundAppliedAt;
      const formattedDate = appliedDate ? new Date(appliedDate).toLocaleDateString() : '';
      return { tone: 'warn', label: 'Already applied', headline: formattedDate ? `Applied on ${formattedDate} in Apply-Flow` : 'Already applied in Apply-Flow' };
    }
    if (errCount > 0) return { tone: 'bad', label: `${errCount} issue${errCount > 1 ? 's' : ''}`, headline: `${errCount} issue${errCount > 1 ? 's' : ''} blocking submission` };
    if (hasCaptcha) return { tone: 'warn', label: 'CAPTCHA', headline: 'Complete the CAPTCHA to continue' };
    if (warnCount > 0) return { tone: 'warn', label: `${warnCount} warning${warnCount > 1 ? 's' : ''}`, headline: `Ready, with ${warnCount} warning${warnCount > 1 ? 's' : ''}` };
    return { tone: isAfLinked ? 'ok' : 'warn', label: isAfLinked ? 'Ready' : 'Unlinked', headline: 'Ready to submit' };
  }

  // ---------------------------------------------------------------------------
  // Floating pill
  // ---------------------------------------------------------------------------
  function renderPill(validationResult = null, extractedData = null) {
    ensureContainer();
    if (!containerEl) return;

    if (validationResult) lastValidation = validationResult;
    if (extractedData) lastExtracted = extractedData;

    const status = computeStatus(validationResult || lastValidation, extractedData || lastExtracted);
    const candidateName = currentProfile ? currentProfile.fullName : 'No profile';
    const firstName = String(candidateName).split(/\s+/)[0] || candidateName;
    const isAuditMode = currentSettings?.interceptionMode === 'audit';
    const isAfLinked = Boolean(getEffectiveJobId());

    if (!pillEl) {
      pillEl = document.createElement('div');
      pillEl.className = 'sqc-pill';
      pillEl.setAttribute('role', 'button');
      pillEl.setAttribute('tabindex', '0');
      pillEl.setAttribute('aria-label', 'Open Apply-Flow Gatekeeper');
      pillEl.addEventListener('click', () => {
        if (pillEl.dataset.isDragging === 'true') return;
        toggleDrawer();
      });
      pillEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDrawer(); }
      });
      containerEl.appendChild(pillEl);
    } else if (!containerEl.contains(pillEl)) {
      containerEl.appendChild(pillEl);
    }

    pillEl.innerHTML = `
      <span class="sqc-pill-avatar">
        ${escapeHtml(getInitials(candidateName))}
        <span class="sqc-pill-dot t-${status.tone}"></span>
      </span>
      <span class="sqc-pill-name">${escapeHtml(firstName)}</span>
      <span class="sqc-pill-status t-${status.tone}">
        ${status.tone === 'pending' ? spinner(11) : ''}${escapeHtml(status.label)}
      </span>
      ${isAfLinked ? `<span class="sqc-pill-tag is-af" title="Linked to Apply-Flow">${icon('zap', 10)}AF</span>` : ''}
      ${Boolean((validationResult?.errors || []).some(e => e.rule === 'JOB_STACK_MISMATCH')) ? `<span class="sqc-pill-tag" style="background:rgba(239,68,68,0.25);color:#fca5a5;border:1px solid rgba(239,68,68,0.4);" title="Job tech stack mismatch">${icon('alertOctagon', 10)}Wrong Stack</span>` : ''}
      ${(currentProfile?.tailoringMode === 'tailored' && !(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sqc_tailored_resume'))) ? `<span class="sqc-pill-tag" style="background:rgba(239,68,68,0.22);color:#fca5a5;border:1px solid rgba(239,68,68,0.4);" title="Job-tailored resume required">${icon('sparkles', 10)}Needs Resume</span>` : ''}
      ${(currentProfile?.tailoringMode === 'tailored' && (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sqc_tailored_resume'))) ? `<span class="sqc-pill-tag" style="background:rgba(16,185,129,0.22);color:#6ee7b7;" title="Job-tailored resume active">${icon('sparkles', 10)}Tailored</span>` : ''}
      ${isAuditMode ? '<span class="sqc-pill-tag is-audit" title="Audit mode — submissions are not blocked">Audit</span>' : ''}
    `;
  }

  let clickOutsideBound = false;
  let backdropEl = null;

  function handleDocumentClickOutside(e) {
    if (!isDrawerOpen) return;
    const target = e.target;
    if (!target) return;
    // Don't close if clicking inside containerEl (pill or drawer) or active SQC modals/dialogs
    if (
      containerEl?.contains(target) ||
      target.closest?.('#sqc-hud-container, #sqc-modal-overlay, .sqc-modal-overlay, .sqc-modal-backdrop, .sqc-toast, [data-sqc-modal]')
    ) {
      return;
    }
    toggleDrawer(false);
  }

  function toggleDrawer(forceOpen = null) {
    ensureContainer();
    isDrawerOpen = forceOpen !== null ? forceOpen : !isDrawerOpen;
    if (containerEl) containerEl.classList.toggle('sqc-is-open', isDrawerOpen);

    if (isDrawerOpen) {
      // Backdrop: Clicking anywhere outside the drawer automatically closes it
      if (!backdropEl) {
        backdropEl = document.createElement('div');
        backdropEl.className = 'sqc-drawer-backdrop';
        backdropEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleDrawer(false);
        });
        backdropEl.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleDrawer(false);
        });
      }
      if (document.body && !document.body.contains(backdropEl)) {
        document.body.appendChild(backdropEl);
      }
      backdropEl.style.display = 'block';

      if (!clickOutsideBound) {
        clickOutsideBound = true;
        setTimeout(() => {
          if (isDrawerOpen) {
            window.addEventListener('pointerdown', handleDocumentClickOutside, true);
            window.addEventListener('click', handleDocumentClickOutside, true);
          }
        }, 50);
      }
      lastDrawerFingerprint = ''; // Force render when opening
      if (!drawerEl) {
        drawerEl = document.createElement('div');
        drawerEl.className = 'sqc-drawer';
        drawerEl.setAttribute('role', 'dialog');
        drawerEl.setAttribute('aria-label', 'Apply-Flow Gatekeeper');
        if (containerEl) containerEl.appendChild(drawerEl);
      } else if (containerEl && !containerEl.contains(drawerEl)) {
        containerEl.appendChild(drawerEl);
      }
      if (drawerEl) {
        drawerEl.style.display = 'flex';
        drawerEl.classList.remove('is-leaving');
      }

      // Immediately render drawer with last known state so drawer never hangs in a blank loading screen
      if (lastExtracted || lastValidation) {
        updateDrawer(lastExtracted, lastValidation);
      } else {
        let eagerExt = null;
        let eagerVal = null;
        if (window.JobFormExtractor) {
          try {
            eagerExt = window.JobFormExtractor.extractAllFields();
            if (window.JobFormValidator) {
              eagerVal = window.JobFormValidator.validate(eagerExt, currentProfile, currentSettings);
            }
          } catch (_) {}
        }
        updateDrawer(eagerExt || {}, eagerVal);
      }

      if (window.SubmissionCheckerCore) {
        window.SubmissionCheckerCore.runLiveCheck();
      }
    } else {
      if (backdropEl) {
        backdropEl.style.display = 'none';
      }
      if (drawerEl) {
        if (clickOutsideBound) {
          window.removeEventListener('pointerdown', handleDocumentClickOutside, true);
          window.removeEventListener('click', handleDocumentClickOutside, true);
          clickOutsideBound = false;
        }
        drawerEl.style.display = 'none';
        lastDrawerFingerprint = '';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drawer (side sheet)
  // ---------------------------------------------------------------------------
  function callout(tone, iconName, title, text = '', extra = '') {
    return `
      <div class="sqc-callout t-${tone}">
        <span class="sqc-callout-ic">${icon(iconName, 16)}</span>
        <div class="sqc-callout-body">
          <div class="sqc-callout-title">${title}</div>
          ${text ? `<div class="sqc-callout-text">${text}</div>` : ''}
          ${extra}
        </div>
      </div>
    `;
  }

  function renderCheckItem(title, errObj, warnObj, defaultDesc) {
    const status = errObj ? 'bad' : (warnObj ? 'warn' : 'ok');
    const iconName = errObj ? 'x' : (warnObj ? 'alert' : 'check');
    const desc = errObj ? errObj.message : (warnObj ? warnObj.message : defaultDesc);

    return `
      <div class="sqc-check t-${status}">
        <span class="sqc-check-ic">${icon(iconName, 12)}</span>
        <div class="sqc-check-body">
          <div class="sqc-check-title">${escapeHtml(title)}</div>
          <div class="sqc-check-desc">${escapeHtml(desc)}</div>
        </div>
      </div>
    `;
  }

  function updateDrawer(extractedData, validationResult) {
    ensureContainer();
    renderPill(validationResult, extractedData);

    if (!isDrawerOpen || !drawerEl) return;

    // Preserve scroll + focus across live re-renders
    const prevBody = drawerEl.querySelector('.sqc-body');
    const prevScroll = prevBody ? prevBody.scrollTop : 0;
    const activeId = document.activeElement && drawerEl.contains(document.activeElement) ? document.activeElement.id : null;
    const prevJobInput = drawerEl.querySelector('#sqc-af-input-job-id')?.value || '';

    const x = extractedData || {};
    const p = currentProfile || { fullName: 'Unassigned', primaryEmail: 'None' };
    const afContext = currentApplyFlowContext || {};
    const afStatus = (afContext.status || afContext.job_status || afContext.currentStatus || afContext.jobProfile?.status || '').toUpperCase();
    const isJobAlreadyMarkedSubmitted = ['SUBMITTED', 'APPLIED', 'ALREADY_APPLIED'].includes(afStatus);
    const isAlreadyApplied = Boolean(validationResult?.isAlreadyApplied || x.is_already_applied || currentDuplicateRecord || isAfAppliedOrSubmitted() || isJobAlreadyMarkedSubmitted);
    const rawErrs = validationResult?.errors || [];
    const isFormInputRule = (r) => {
      const s = String(r || '').toUpperCase();
      return s.includes('REQUIRED') || s.includes('EMPTY') || s.includes('MISSING') || s.includes('RESUME') || s.includes('UNANSWERED') || s.includes('FILE') || s.includes('INPUT');
    };
    const errs = isAlreadyApplied
      ? rawErrs.filter(e => !isFormInputRule(e.rule))
      : rawErrs;
    const warns = validationResult?.warnings || [];
    const isLocked = currentSettings?.isProfileLocked !== false;
    const isAuditMode = currentSettings?.interceptionMode === 'audit';
    const afParams = currentApplyFlowParams || {};
    const hasAfJob = Boolean(afParams.jobId);
    const allEntries = x.all_entries || [];
    const status = computeStatus(validationResult, x);
    const rule = (o) => String(o?.rule || '');

    // ---------- Checks ----------
    const stackMismatchErr = errs.find(e => rule(e) === 'JOB_STACK_MISMATCH');
    const hasTailored = typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('sqc_tailored_resume'));
    const isTailoringMethod = p.tailoringMode === 'tailored';
    const resumeStatusText = stackMismatchErr
      ? `Stack Mismatch · Job: ${stackMismatchErr.meta?.jobStackLabel || 'Different Stack'} (Candidate: ${stackMismatchErr.meta?.candStackLabel || p.targetStack || 'Profile'})`
      : (hasTailored
          ? 'Tailored resume active for this job'
          : (isTailoringMethod
              ? 'Tailoring required · No tailored resume provided'
              : (x.resume_uploaded || (p.resumeText ? 'Base resume ready' : 'No resume detected'))));

    const salaryTarget = Number(x.salary_expected || p.compensation?.desiredSalary || p.salaryFloor || 120000);
    const salaryDesc = x.jd_salary?.has_jd_salary
      ? `JD lists ${x.jd_salary.raw} → targeting $${salaryTarget.toLocaleString()}`
      : `Default target $${Number(p.compensation?.desiredSalary || p.salaryFloor || 120000).toLocaleString()} (no salary in JD)`;

    const contextMismatchErr = errs.find(e => rule(e) === 'CONTEXT_PROFILE_MISMATCH');
    const targetCandidateLabel = afParams.profileName || x.target_profile_name || x.apply_flow_params?.profileName || 'Unknown';

    const tailoringRequiredErr = (isTailoringMethod && !hasTailored)
      ? { message: 'Tailored resume required for this profile' }
      : null;
    const resumeErr = stackMismatchErr || errs.find(e => rule(e).includes('RESUME')) || tailoringRequiredErr;

    const checks = [
      {
        title: 'Identity match',
        err: contextMismatchErr || errs.find(e => rule(e).includes('IDENTITY') || rule(e).includes('EMAIL')),
        warn: warns.find(w => rule(w).includes('EMAIL')),
        desc: contextMismatchErr ? `Station: "${p.fullName || 'Unassigned'}" · URL Target: "${targetCandidateLabel}"` : 'Name and email match the active profile'
      },
      { title: 'Resume & stack', err: isAlreadyApplied ? null : resumeErr, warn: null, desc: isAlreadyApplied ? 'Application verified in Apply-Flow' : resumeStatusText },
      { title: 'Screening & compliance', err: isAlreadyApplied ? null : errs.find(e => ['SCREENING', 'WORK_AUTH', 'PROFILE_RECORD', 'ELIGIBILITY'].some(k => rule(e).includes(k))), warn: null, desc: isAlreadyApplied ? 'Profile answers recorded in Apply-Flow' : 'Profile answers verified across 17 categories' },
      { title: 'Compensation', err: errs.find(e => rule(e).includes('SALARY')), warn: warns.find(w => rule(w).includes('SALARY')), desc: salaryDesc },
      contextMismatchErr
        ? { title: 'Apply-Flow sync', err: contextMismatchErr, warn: null, desc: `Mismatch · Dispatched for ${targetCandidateLabel}` }
        : (hasAfJob
            ? { title: 'Apply-Flow sync', err: null, warn: null, desc: `Linked · ${afParams.jobId.slice(0, 14)}…` }
            : { title: 'Apply-Flow sync', err: null, warn: { message: 'Untracked job — no #job_id in the URL' }, desc: '' })
    ];
    const passed = checks.filter(c => !c.err && !c.warn).length;
    const pct = Math.round((passed / checks.length) * 100);

    // ---------- Overview tab ----------
    let overviewHtml = '';
    const callouts = [];

    const accountMismatchErr = (validationResult?.errors || []).find(e => e.rule === 'ACCOUNT_MISMATCH');
    if (accountMismatchErr) {
      const acctName = x.logged_in_account?.accountName || x.logged_in_account?.accountEmail || 'Different Account';
      const platform = x.logged_in_account?.platform || 'this job portal';
      const activeName = p?.fullName || 'Assigned Candidate';

      // Look up if acctName matches another candidate in allProfiles
      let matchedCandidate = null;
      if (allProfiles && allProfiles.length) {
        const acctToks = acctName.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
        matchedCandidate = allProfiles.find(cand => {
          const fn = (cand.fullName || '').toLowerCase();
          const first = (cand.firstName || '').toLowerCase();
          const pref = (cand.preferredName || '').toLowerCase();
          return acctToks.some(t => fn.includes(t) || first.includes(t) || pref.includes(t));
        });
      }

      callouts.unshift(callout(
        'bad',
        'alertCircle',
        `Critical Account Mismatch · Signed in as ${escapeHtml(acctName)}`,
        `This browser is signed into <strong>${escapeHtml(platform)}</strong> as <strong>${escapeHtml(acctName)}</strong>, but this workstation is locked to candidate <strong>${escapeHtml(activeName)}</strong>. Submitting 1-Click Apply will submit under <strong>${escapeHtml(acctName)}'s</strong> account and resume!`,
        `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;">
           ${matchedCandidate ? `
             <button class="sqc-btn sqc-btn-danger sqc-btn-sm" id="sqc-btn-switch-to-account-candidate" data-target-id="${escapeHtml(matchedCandidate.id)}" data-target-name="${escapeHtml(matchedCandidate.fullName)}">
               ${icon('user', 13)} Switch Workstation to ${escapeHtml(matchedCandidate.fullName)}
             </button>
           ` : ''}
           <span class="sqc-meta" style="color:#fca5a5;">⚠️ Log out of ${escapeHtml(platform)} and sign in as ${escapeHtml(activeName)}.</span>
         </div>`
      ));
    }

    if (contextMismatchErr) {
      const targetName = afParams.profileName || x.target_profile_name || x.apply_flow_params?.profileName || '';
      const targetId = afParams.profileId || x.target_candidate_id || x.apply_flow_params?.profileId || '';
      const activeName = p?.fullName || 'Unassigned Profile';
      const switchBtnLabel = targetName ? `Switch Active Station to ${escapeHtml(targetName)}` : `Switch Profile (${escapeHtml(targetId.slice(0, 8))})`;

      callouts.unshift(callout(
        'bad',
        'alertCircle',
        'Context Window Mismatch · Wrong Profile Attached',
        `This job application was dispatched in Apply-Flow for candidate <strong>${escapeHtml(targetName || targetId)}</strong>, but this browser station is currently active for <strong>${escapeHtml(activeName)}</strong>. Submitting under this profile will contaminate candidate records and send wrong credentials.`,
        `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
           <button class="sqc-btn sqc-btn-danger sqc-btn-sm" id="sqc-btn-switch-to-target-candidate" data-target-name="${escapeHtml(targetName)}" data-target-id="${escapeHtml(targetId)}">
             ${icon('user', 13)} ${switchBtnLabel}
           </button>
           <button class="sqc-btn sqc-btn-secondary sqc-btn-sm" id="sqc-btn-open-settings-mismatch">
             ${icon('settings', 13)} Workstation Settings
           </button>
         </div>`
      ));
    }

    if (stackMismatchErr) {
      const detected = stackMismatchErr.meta?.detectedJobStack || x.detected_job_stack || {};
      const jobStackKey = detected.key || 'unknown';
      const jobStackTitle = stackMismatchErr.meta?.jobStackLabel || detected.title || 'Different Stack';
      const candStackTitle = stackMismatchErr.meta?.candStackLabel || p.targetStack || 'Assigned Track';
      const candName = p?.fullName || 'Active Candidate';

      let matchedStackProfile = null;
      if (allProfiles && allProfiles.length && jobStackKey !== 'unknown') {
        const getCat = window.JobFormValidator?.getCandidateStackCategory || ((pr) => {
          const s = `${pr.targetStack || ''} ${pr.primaryBackendLanguages || ''} ${(pr.primaryStackKeywords || []).join(' ')}`.toLowerCase();
          if (s.includes('python') || s.includes('fastapi') || s.includes('django')) return 'python';
          if (s.includes('c#') || s.includes('.net') || s.includes('asp.net')) return 'dotnet';
          if (s.includes('java') || s.includes('spring')) return 'java';
          if (s.includes('php') || s.includes('laravel')) return 'php';
          return 'unknown';
        });

        matchedStackProfile = allProfiles.find(pr => {
          const isSameName = (pr.fullName || '').toLowerCase().trim() === candName.toLowerCase().trim();
          return isSameName && getCat(pr) === jobStackKey;
        });

        if (!matchedStackProfile) {
          matchedStackProfile = allProfiles.find(pr => getCat(pr) === jobStackKey);
        }
      }

      const switchBtnLabel = matchedStackProfile
        ? `Switch to ${escapeHtml(matchedStackProfile.fullName)} (${escapeHtml(matchedStackProfile.targetStack || jobStackTitle)})`
        : `Switch to ${escapeHtml(jobStackTitle)} Profile`;

      callouts.unshift(callout(
        'bad',
        'alertOctagon',
        `Tech Track Conflict · Job requires ${escapeHtml(jobStackTitle)}`,
        `This job posting requires <strong>${escapeHtml(jobStackTitle)}</strong>, but this workstation is locked to <strong>${escapeHtml(candName)}</strong> on the <strong>${escapeHtml(candStackTitle)}</strong> track.<br/><span style="display:inline-block;margin-top:4px;font-size:12px;color:#fca5a5;">⚠️ Submitting C#/.NET credentials to a Python role causes instant ATS screening rejection. Switch to the matching track profile or reject this job in Apply-Flow.</span>`,
        `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;">
           ${matchedStackProfile ? `
             <button class="sqc-btn sqc-btn-danger sqc-btn-sm" id="sqc-btn-switch-stack-candidate" data-target-id="${escapeHtml(matchedStackProfile.id)}" data-target-name="${escapeHtml(matchedStackProfile.fullName)}">
               ${icon('zap', 13)} ⚡ ${switchBtnLabel}
             </button>
           ` : ''}
           <button class="sqc-btn sqc-btn-soft sqc-btn-sm" id="sqc-btn-reject-stack-job" data-reason="TECH_STACK_MISMATCH">
             ${icon('xCircle', 13)} 🚫 Reject / Skip Job in Apply-Flow
           </button>
           <button class="sqc-btn sqc-btn-ghost sqc-btn-sm" id="sqc-btn-open-settings-stack">
             ${icon('settings', 13)} Profile Directory
           </button>
         </div>`
      ));
    }

    const unmetGithubErr = (validationResult?.errors || []).find(e => e.rule === 'UNMET_REQUIREMENT_GITHUB');
    if (unmetGithubErr) {
      callouts.unshift(callout(
        'bad',
        'alertOctagon',
        'Strict Requirement Unmet · GitHub Profile Required',
        `This job application strictly requires a <strong>GitHub Profile URL</strong>, but candidate <strong>${escapeHtml(p.fullName)}</strong> has no GitHub profile configured. Dummy values like "nil" will cause ATS rejection. Technically, this job should be rejected/skipped in Apply-Flow.`,
        `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;">
           <button class="sqc-btn sqc-btn-danger sqc-btn-sm" id="sqc-btn-reject-unmet-job" data-reason="UNMET_REQUIREMENT_GITHUB">
             ${icon('xCircle', 13)} 🚫 Reject / Skip Job in Apply-Flow
           </button>
           <span class="sqc-meta" style="color:#fca5a5;">Candidate cannot fulfill mandatory GitHub check.</span>
         </div>`
      ));
    }

    if (x.captcha_detected?.has_captcha) {
      callouts.push(callout('warn', 'bot',
        `${escapeHtml(x.captcha_detected.type || 'Human verification')} detected`,
        'Form fields are filled. Solve the verification step manually before submitting.'));
    }

    if (isAlreadyApplied) {
      const dup = currentDuplicateRecord || {};
      const appliedDate = dup.appliedAt || dup.timestamp || dup.candidate?.applied_at || currentApplyFlowContext?.appliedAt || currentApplyFlowContext?.jobProfile?.appliedAt;
      const appliedBy = dup.applier || dup.applier_id || dup.candidate?.applied_by || dup.candidate?.assigned_applier || currentApplyFlowContext?.assignedApplier?.name || currentApplyFlowContext?.assignedApplier?.username;
      const candName = dup.candidate?.profile_name || dup.profile_assigned || currentApplyFlowContext?.candidateProfile?.name || p?.fullName || 'this candidate';
      const formattedDate = appliedDate ? new Date(appliedDate).toLocaleDateString() : '';

      const bannerTitle = formattedDate
        ? `ALREADY APPLIED on ${formattedDate}${appliedBy ? ` by ${appliedBy}` : ''}`
        : `ALREADY APPLIED for ${candName}`;

      const alreadyAppliedMsg = dup.message || validationResult?.alreadyAppliedMessage || x.already_applied_message || `${candName} was already submitted to this job in Apply-Flow.`;

      callouts.unshift(`
        <div class="sqc-callout t-warn sqc-applied-callout">
          <span class="sqc-callout-ic" style="color:#fbbf24;background:rgba(251,191,36,0.18);">${icon('checkCircle', 16)}</span>
          <div class="sqc-callout-body" style="flex:1;">
            <div class="sqc-callout-title" style="color:#fde68a;font-size:13px;font-weight:700;">⚠️ ${escapeHtml(bannerTitle)}</div>
            <div class="sqc-callout-text" style="color:#e2e8f0;margin-top:4px;font-size:12px;line-height:1.45;">
              ${escapeHtml(alreadyAppliedMsg)}<br/>
              <span style="display:inline-block;margin-top:4px;color:#cbd5e1;font-size:11px;">Portal submission is locked to prevent duplicate submissions on this company ATS.</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;align-items:center;">
              ${appliedBy ? `<span class="sqc-meta" style="color:#fde68a;">Recorded by: <strong>${escapeHtml(appliedBy)}</strong></span>` : ''}
              <button class="sqc-btn sqc-btn-warning sqc-btn-sm" id="sqc-btn-mark-already-applied">${icon('pin', 12)} Re-sync Status with Apply-Flow</button>
            </div>
          </div>
        </div>
      `);
    }

    // Tailoring Method & Fast Resume Attachment Callout
    if (isTailoringMethod && !hasTailored) {
      callouts.push(callout(
        'warn',
        'sparkles',
        'Tailoring Method Active · Tailored Resume Required',
        `Candidate <strong>${escapeHtml(p.fullName)}</strong> requires a <strong>job-tailored resume</strong> for every application. Paste the tailored resume below to extract skills dynamically and attach it to this job portal before submitting.`,
        `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
           <button class="sqc-btn sqc-btn-primary sqc-btn-sm" id="sqc-btn-open-tailor-banner">
             ${icon('sparkles', 13)} Paste & Attach Tailored Resume
           </button>
         </div>`
      ));
    } else if (hasTailored) {
      let tailoredSkillCount = 0;
      try {
        const raw = sessionStorage.getItem('sqc_tailored_resume_data');
        if (raw) {
          const d = JSON.parse(raw);
          tailoredSkillCount = (d.primaryStackKeywords || []).length;
        }
      } catch (_) {}

      callouts.push(callout(
        'ok',
        'checkCircle',
        `Tailored Resume Active · ${tailoredSkillCount ? tailoredSkillCount + ' Skills Mapped' : 'Ready in Memory'}`,
        `A custom-tailored resume is active for this job application. Skills have been dynamically extracted and verified against job requirements.`,
        `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
           <button class="sqc-btn sqc-btn-soft sqc-btn-sm" id="sqc-btn-reattach-portal">📎 Attach to Portal</button>
           <button class="sqc-btn sqc-btn-ghost sqc-btn-sm" id="sqc-btn-download-tailored">📥 Download File</button>
           <button class="sqc-btn sqc-btn-ghost sqc-btn-sm" id="sqc-btn-copy-tailored">📋 Copy Text</button>
           <button class="sqc-btn sqc-btn-ghost sqc-btn-sm" id="sqc-btn-edit-tailored">✏️ Edit</button>
         </div>`
      ));
    }

    if (callouts.length) {
      overviewHtml += `<div class="sqc-stack">${callouts.join('')}</div>`;
    }

    if (errs.length > 0 || warns.length > 0) {
      overviewHtml += `
        <section class="sqc-section">
          <div class="sqc-section-head">
            <span class="sqc-section-title">Needs attention</span>
            <span class="sqc-badge t-${errs.length ? 'bad' : 'warn'}">${errs.length ? 'Blocking' : 'Warnings'} · ${errs.length + warns.length}</span>
          </div>
          <div class="sqc-list">
            ${errs.map(e => `
              <div class="sqc-issue t-bad">
                <span class="sqc-issue-ic">${icon('xCircle', 15)}</span>
                <div class="sqc-issue-body">
                  <div class="sqc-issue-msg">${escapeHtml(e.message)}</div>
                  <div class="sqc-issue-rule">${escapeHtml(e.rule || 'ERROR')}</div>
                </div>
              </div>`).join('')}
            ${warns.map(w => `
              <div class="sqc-issue t-warn">
                <span class="sqc-issue-ic">${icon('alertCircle', 15)}</span>
                <div class="sqc-issue-body">
                  <div class="sqc-issue-msg">${escapeHtml(w.message)}</div>
                  <div class="sqc-issue-rule">${escapeHtml(w.rule || 'WARN')}</div>
                </div>
              </div>`).join('')}
          </div>
        </section>
      `;
    }

    overviewHtml += `
      <section class="sqc-section">
        <div class="sqc-section-head">
          <span class="sqc-section-title">Pre-flight checks</span>
          <span class="sqc-section-meta">${passed}/${checks.length} passed</span>
        </div>
        <div class="sqc-list">
          ${checks.map(c => renderCheckItem(c.title, c.err, c.warn, c.desc)).join('')}
        </div>
      </section>
      ${renderScreenshotsSection()}
    `;

    // ---------- Fields tab ----------
    const unansweredEntries = allEntries.filter(e => {
      if (!e || !e.label) return false;
      const canon = e.label.toLowerCase();
      if (canon.includes('first name') || canon.includes('last name') || canon.includes('email') || canon.includes('phone') || canon.includes('resume')) return false;
      return e.unanswered || e.type === 'textarea' || e.required || e.is_required;
    });
    const unansweredCount = unansweredEntries.length;
    const isEmpty = (e) => Boolean(e.unanswered || !String(e.value || '').trim());
    const isReq = (e) => Boolean(e.required || e.is_required);
    const reqCount = allEntries.filter(isReq).length;
    const emptyCount = allEntries.filter(isEmpty).length;

    const fieldsHtml = `
      <div class="sqc-ai-card">
        <div class="sqc-ai-card-top">
          <span class="sqc-ai-card-ic">${icon('sparkles', 16)}</span>
          <div>
            <div class="sqc-ai-card-title">AI answer assistant</div>
            <div class="sqc-ai-card-sub">${unansweredCount} open question${unansweredCount === 1 ? '' : 's'} on this page</div>
          </div>
        </div>
        <div class="sqc-ai-card-actions">
          <button class="sqc-btn sqc-btn-ai sqc-btn-sm" id="sqc-btn-copy-ai-prompt" title="Copy a ChatGPT prompt with resume, JD and questions">${icon('copy', 13)}Copy prompt</button>
          <button class="sqc-btn sqc-btn-soft sqc-btn-sm" id="sqc-btn-paste-ai-answers" title="Paste ChatGPT's reply to auto-fill">${icon('paste', 13)}Paste answers</button>
        </div>
      </div>

      <div class="sqc-field-tools">
        <label class="sqc-search">
          ${icon('search', 14)}
          <input type="text" id="sqc-field-search" placeholder="Filter ${allEntries.length} fields…" value="${escapeHtml(fieldQuery)}" autocomplete="off" />
        </label>
        <div class="sqc-chips" role="tablist">
          <button class="sqc-chip ${fieldFilter === 'all' ? 'active' : ''}" data-filter="all">All <span>${allEntries.length}</span></button>
          <button class="sqc-chip ${fieldFilter === 'required' ? 'active' : ''}" data-filter="required">Required <span>${reqCount}</span></button>
          <button class="sqc-chip ${fieldFilter === 'empty' ? 'active' : ''}" data-filter="empty">Empty <span>${emptyCount}</span></button>
        </div>
      </div>

      <div class="sqc-list sqc-fields" id="sqc-fields-list">
        ${allEntries.length === 0
          ? `<div class="sqc-empty">${icon('list', 22)}<span>No form fields detected yet.</span></div>`
          : allEntries.map(e => `
            <div class="sqc-field ${isEmpty(e) ? 'is-empty' : ''} ${isReq(e) ? 'is-req' : ''}"
                 data-req="${isReq(e) ? 1 : 0}" data-empty="${isEmpty(e) ? 1 : 0}"
                 data-text="${escapeHtml(`${e.label || ''} ${e.value || ''}`.toLowerCase())}">
              <div class="sqc-field-label">
                <span class="sqc-field-label-text">${escapeHtml(e.label)}</span>
                ${isReq(e) ? '<span class="sqc-req">Required</span>' : ''}
              </div>
              <div class="sqc-field-value">${isEmpty(e) ? 'Not answered' : escapeHtml(e.value)}</div>
            </div>`).join('')}
        <div class="sqc-empty sqc-no-match" style="display:none;">${icon('search', 20)}<span>No fields match this filter.</span></div>
      </div>
    `;

    // ---------- Job tab ----------
    const jobHtml = `
      <section class="sqc-section">
        <div class="sqc-section-head"><span class="sqc-section-title">Apply-Flow</span></div>
        <div class="sqc-af ${hasAfJob ? 't-ok' : 't-warn'}">
          <div class="sqc-af-head">
            <span class="sqc-af-dot"></span>
            <span class="sqc-af-title">${hasAfJob ? 'Connected to job queue' : 'Not linked to a job'}</span>
            <span class="sqc-badge t-${hasAfJob ? 'ok' : 'warn'}">${hasAfJob ? 'Synced' : 'Untracked'}</span>
          </div>
          ${hasAfJob ? `
            <div class="sqc-dl">
              <div class="sqc-dl-row"><span>Job ID</span><span class="sqc-mono" title="${escapeHtml(afParams.jobId)}">${escapeHtml(afParams.jobId)}</span></div>
              ${afParams.profileName ? `<div class="sqc-dl-row"><span>Candidate</span><span>${escapeHtml(afParams.profileName)}</span></div>` : ''}
              ${afContext.targetSalary ? `<div class="sqc-dl-row"><span>Target salary</span><span class="sqc-accent-text">${escapeHtml(afContext.targetSalary)}</span></div>` : ''}
            </div>
            ${Array.isArray(afContext.techStack) && afContext.techStack.length ? `<div class="sqc-tags">${afContext.techStack.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          ` : `
            <p class="sqc-muted-text">This page URL has no <code>#job_id=</code> from Apply-Flow. Paste the job ID to track this submission.</p>
            <div class="sqc-input-group">
              <input type="text" id="sqc-af-input-job-id" placeholder="Paste Apply-Flow job ID" value="${escapeHtml(prevJobInput)}" autocomplete="off" />
              <button class="sqc-btn sqc-btn-primary sqc-btn-sm" id="sqc-btn-attach-job-id">${icon('link', 13)}Link</button>
            </div>
          `}
        </div>
      </section>

      <section class="sqc-section">
        <div class="sqc-section-head"><span class="sqc-section-title">Job details</span></div>
        <div class="sqc-list sqc-dl">
          <div class="sqc-dl-row"><span>Title</span><span title="${escapeHtml(x.job_title)}">${escapeHtml(x.job_title) || '—'}</span></div>
          <div class="sqc-dl-row"><span>Company</span><span title="${escapeHtml(x.company)}">${escapeHtml(x.company) || '—'}</span></div>
          <div class="sqc-dl-row"><span>ATS platform</span><span>${escapeHtml(x.ats_domain) || '—'}${x.req_id ? ` <em class="sqc-dim">(${escapeHtml(x.req_id)})</em>` : ''}</span></div>
          ${x.jd_salary?.has_jd_salary ? `<div class="sqc-dl-row"><span>JD pay range</span><span class="sqc-ok-text">${escapeHtml(x.jd_salary.raw)}</span></div>` : ''}
        </div>
      </section>

      ${renderScreenshotsSection()}

      <section class="sqc-section">
        <div class="sqc-section-head"><span class="sqc-section-title">Report a blocker</span></div>
        <div class="sqc-list">
          <button class="sqc-action-row t-warn" id="sqc-flag-otp">
            <span class="sqc-action-ic">${icon('mail', 15)}</span>
            <span class="sqc-action-text"><strong>Email code required</strong><em>Login needs an OTP / verification email</em></span>
            ${icon('chevron', 14, 'sqc-action-chev')}
          </button>
          <button class="sqc-action-row t-bad" id="sqc-flag-login">
            <span class="sqc-action-ic">${icon('userX', 15)}</span>
            <span class="sqc-action-text"><strong>Account or login error</strong><em>Portal account disabled or broken</em></span>
            ${icon('chevron', 14, 'sqc-action-chev')}
          </button>
          <button class="sqc-action-row t-bad" id="sqc-btn-portal-failed">
            <span class="sqc-action-ic">${icon('ban', 15)}</span>
            <span class="sqc-action-text"><strong>Portal failed…</strong><em>CAPTCHA, lockout, site down, activation</em></span>
            ${icon('chevron', 14, 'sqc-action-chev')}
          </button>
        </div>
      </section>
    `;

    // ---------- Debug tab ----------
    const debugHtml = `
      <section class="sqc-section">
        <div class="sqc-section-head">
          <span class="sqc-section-title">Payload preview</span>
          <button class="sqc-btn sqc-btn-soft sqc-btn-sm" id="sqc-btn-copy">${icon('copy', 13)}Copy JSON</button>
        </div>
        <pre class="sqc-code">${escapeHtml(JSON.stringify(cleanPayloadForView(extractedData, p), null, 2))}</pre>
      </section>
    `;

    const metaBits = [
      p.targetStack || 'Developer',
      isTailoringMethod ? '✨ Tailoring Method' : '📄 Base Method',
      `${formatMoney(p.salaryFloor || p.compensation?.salaryFloor || 0)} floor`
    ];
    const jobLine = [x.job_title, x.company].filter(Boolean).map(escapeHtml).join(' · ');

    // Fingerprint state to prevent 80ms re-render loops and blinking
    const currentFingerprint = [
      p.id,
      p.fullName,
      p.targetStack,
      p.tailoringMode,
      hasTailored,
      isLocked,
      isAuditMode,
      status.tone,
      status.headline,
      passed,
      checks.length,
      checks.map(c => c.title + ':' + (c.err?.message || c.warn?.message || 'ok')).join('|'),
      errs.map(e => (e.rule || '') + ':' + (e.message || '')).join(';'),
      warns.map(w => (w.rule || '') + ':' + (w.message || '')).join(';'),
      x.job_title || '',
      x.company || '',
      x.ats_domain || '',
      isAlreadyApplied,
      currentDuplicateRecord ? ('dup:' + (currentDuplicateRecord.appliedAt || currentDuplicateRecord.status)) : 'no-dup',
      hasAfJob ? afParams.jobId : 'no-af',
      afStatus,
      allEntries.length,
      unansweredCount,
      currentScreenshots.map(s => s.id + ':' + s.answered_count).join(','),
      activeTab,
      fieldFilter,
      fieldQuery
    ].join('§');

    if (lastDrawerFingerprint === currentFingerprint && drawerEl.querySelector('.sqc-body')) {
      return; // DOM is completely identical; skip innerHTML wipe to stop flickering
    }
    lastDrawerFingerprint = currentFingerprint;

    drawerEl.innerHTML = `
      <header class="sqc-head">
        <div class="sqc-id">
          <span class="sqc-avatar">${escapeHtml(getInitials(p.fullName))}</span>
          <div class="sqc-id-text">
            <div class="sqc-id-name">
              <span>${escapeHtml(p.fullName)}</span>
              <span class="sqc-lock ${isLocked ? 'is-locked' : 'is-unlocked'}" title="${isLocked ? 'Profile locked to this station' : 'Profile unlocked'}">${icon(isLocked ? 'lock' : 'unlock', 11)}</span>
            </div>
            <div class="sqc-id-meta">${metaBits.map(escapeHtml).join(' · ')}</div>
          </div>
        </div>
        <div class="sqc-head-actions">
          ${isLocked ? `<button class="sqc-icon-btn" id="sqc-btn-hud-unlock" title="Reassign candidate (admin)">${icon('key', 15)}</button>` : ''}
          <button class="sqc-icon-btn" id="sqc-open-options" title="Open settings">${icon('settings', 15)}</button>
          <button class="sqc-icon-btn" id="sqc-drawer-close" title="Close (Esc)">${icon('x', 16)}</button>
        </div>
      </header>

      <div class="sqc-hero t-${status.tone}">
        <div class="sqc-ring" style="--p:${pct}"><span>${passed}<em>/${checks.length}</em></span></div>
        <div class="sqc-hero-text">
          <div class="sqc-hero-eyebrow">
            <span class="sqc-mode ${isAuditMode ? 'is-audit' : 'is-gate'}">${icon(isAuditMode ? 'info' : 'shieldCheck', 11)}${isAuditMode ? 'Audit mode' : 'Active gate'}</span>
            ${x.ats_domain ? `<span class="sqc-dim">${escapeHtml(x.ats_domain)}</span>` : ''}
          </div>
          <div class="sqc-hero-title">${escapeHtml(status.headline)}</div>
          <div class="sqc-hero-sub">${jobLine || 'Waiting for job details…'}</div>
        </div>
      </div>

      <nav class="sqc-seg" role="tablist">
        <button class="sqc-seg-btn ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">${icon('gauge', 14)}<span>Overview</span>${errs.length ? `<i class="sqc-seg-count is-bad">${errs.length}</i>` : ''}</button>
        <button class="sqc-seg-btn ${activeTab === 'fields' ? 'active' : ''}" data-tab="fields">${icon('list', 14)}<span>Fields</span><i class="sqc-seg-count">${allEntries.length}</i></button>
        <button class="sqc-seg-btn ${activeTab === 'job' ? 'active' : ''}" data-tab="job">${icon('briefcase', 14)}<span>Job</span></button>
        <button class="sqc-seg-btn ${activeTab === 'debug' ? 'active' : ''}" data-tab="debug" title="Raw payload">${icon('code', 14)}</button>
      </nav>

      <div class="sqc-body">
        <div class="sqc-tab ${activeTab === 'overview' ? 'active' : ''}" id="sqc-tab-overview">${overviewHtml}</div>
        <div class="sqc-tab ${activeTab === 'fields' ? 'active' : ''}" id="sqc-tab-fields">${fieldsHtml}</div>
        <div class="sqc-tab ${activeTab === 'job' ? 'active' : ''}" id="sqc-tab-job">${jobHtml}</div>
        <div class="sqc-tab ${activeTab === 'debug' ? 'active' : ''}" id="sqc-tab-debug">${debugHtml}</div>
      </div>

      <footer class="sqc-foot">
        <div class="sqc-foot-tools">
          <button class="sqc-tool" id="sqc-btn-open-resume" title="Resume manager">${icon('file', 15)}<span>Resume</span></button>
          <button class="sqc-tool" id="sqc-btn-copy-ai-footer" title="Copy ChatGPT prompt with resume, JD and questions">${icon('sparkles', 15)}<span>AI prompt</span></button>
          <button class="sqc-tool" id="sqc-btn-paste-ai-footer" title="Paste ChatGPT answers to auto-fill">${icon('paste', 15)}<span>Paste AI</span></button>
          <button class="sqc-tool sqc-btn-snap-trigger" id="sqc-btn-snap-footer" title="Capture a screenshot of this page">${icon('camera', 15)}<span>Snap (${currentScreenshots.length})</span></button>
        </div>
        <div class="sqc-foot-main">
          <button class="sqc-btn sqc-btn-soft" id="sqc-btn-restore" title="Fill blank inputs from the candidate profile">${icon('wand', 15)}Autofill</button>
          ${isAlreadyApplied ? `
            <button class="sqc-btn sqc-btn-warning" id="sqc-btn-mark-already-applied" title="Application recorded in Apply-Flow">
              ${icon('checkCircle', 15)} Already Submitted · Re-sync
            </button>
          ` : `
            <button class="sqc-btn sqc-btn-success" id="sqc-btn-confirm-apply" title="Confirm this submission completed and log it to Apply-Flow">${icon('send', 15)}Confirm submission</button>
          `}
        </div>
      </footer>
    `;

    // Restore scroll / focus / filters
    const body = drawerEl.querySelector('.sqc-body');
    if (body) body.scrollTop = prevScroll;
    applyFieldFilter();
    if (activeId) {
      const el = drawerEl.querySelector(`#${CSS.escape(activeId)}`);
      if (el) {
        el.focus();
        if (el.setSelectionRange && typeof el.value === 'string') {
          try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {}
        }
      }
    }

    bindDrawerEvents(extractedData, p);
  }

  function applyFieldFilter() {
    if (!drawerEl) return;
    const list = drawerEl.querySelector('#sqc-fields-list');
    if (!list) return;
    const q = fieldQuery.trim().toLowerCase();
    let visible = 0;
    const rows = list.querySelectorAll('.sqc-field');
    rows.forEach(row => {
      let show = true;
      if (fieldFilter === 'required' && row.dataset.req !== '1') show = false;
      if (fieldFilter === 'empty' && row.dataset.empty !== '1') show = false;
      if (show && q && !(row.dataset.text || '').includes(q)) show = false;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    const noMatch = list.querySelector('.sqc-no-match');
    if (noMatch) noMatch.style.display = rows.length > 0 && visible === 0 ? '' : 'none';
  }

  function handleCopyAiPrompt() {
    try {
      const bundle = JobFormExtractor.generateChatGptPrompt(currentProfile, lastExtracted, null);
      if (bundle.questionCount === 0) {
        showToast("ℹ️ No open-ended questions on this page — standard fields are handled by Autofill.");
        return;
      }
      navigator.clipboard.writeText(bundle.prompt).then(() => {
        showToast(`📋 Prompt copied with resume, JD & ${bundle.questionCount} question${bundle.questionCount === 1 ? '' : 's'}. Paste it into ChatGPT.`);
      }).catch(() => {
        showToast("⚠️ Could not access the clipboard.");
      });
    } catch (err) {
      console.error(err);
      showToast("⚠️ Error generating the AI prompt.");
    }
  }

  function setBtnBusy(btn, label) {
    if (!btn) return () => {};
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-busy');
    btn.innerHTML = `${spinner(14)}${escapeHtml(label)}`;
    return () => {
      btn.disabled = false;
      btn.classList.remove('is-busy');
      btn.innerHTML = original;
    };
  }

  function bindDrawerEvents(extractedData, p) {
    const $ = (sel) => drawerEl.querySelector(sel);

    // Tabs
    drawerEl.querySelectorAll('.sqc-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        lastDrawerFingerprint = ''; // Invalidate so next render knows activeTab
        drawerEl.querySelectorAll('.sqc-seg-btn').forEach(b => b.classList.toggle('active', b === btn));
        drawerEl.querySelectorAll('.sqc-tab').forEach(c => {
          const isActive = c.id === `sqc-tab-${activeTab}`;
          c.classList.toggle('active', isActive);
          if (isActive) {
            c.classList.add('is-tab-switching');
            setTimeout(() => c.classList.remove('is-tab-switching'), 250);
          }
        });
        const body = $('.sqc-body');
        if (body) body.scrollTop = 0;
      });
    });

    // Field filters
    drawerEl.querySelectorAll('.sqc-chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        fieldFilter = chip.dataset.filter;
        drawerEl.querySelectorAll('.sqc-chip[data-filter]').forEach(c => c.classList.toggle('active', c === chip));
        applyFieldFilter();
      });
    });
    $('#sqc-field-search')?.addEventListener('input', (e) => {
      fieldQuery = e.target.value || '';
      applyFieldFilter();
    });

    // Header
    $('#sqc-drawer-close')?.addEventListener('click', () => toggleDrawer(false));
    $('#sqc-open-options')?.addEventListener('click', () => chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }));
    $('#sqc-btn-hud-unlock')?.addEventListener('click', () => openAdminDialog());

    // Tools
    $('#sqc-btn-open-resume')?.addEventListener('click', () => openResumeModal());
    $('#sqc-btn-open-tailor-banner')?.addEventListener('click', () => openResumeModal());
    $('#sqc-btn-edit-tailored')?.addEventListener('click', () => openResumeModal());
    $('#sqc-btn-reattach-portal')?.addEventListener('click', () => {
      const tailoredText = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sqc_tailored_resume') : null) || p.resumeText || '';
      const res = attachResumeToPortal(tailoredText, p, null, { userInitiated: true });
      if (res && res.fileInputsCount > 0) {
        showToast(`🎉 Attached "${res.filename}" to ${res.fileInputsCount} file input(s)!`);
      } else if (res && res.triggerActivated) {
        showToast(`🚀 Portal upload opened! "${res.filename}" is downloaded & ready in Downloads.`);
      } else if (res && res.textareasCount > 0) {
        showToast(`📝 Resume pasted into ${res.textareasCount} field(s)!`);
      } else {
        downloadResumeFile(tailoredText, p, { silent: false });
        showToast(`📥 "${res?.filename || 'Resume.pdf'}" downloaded! Select it in the portal dialog.`);
      }
      if (window.SubmissionCheckerCore) window.SubmissionCheckerCore.runLiveCheck();
    });
    $('#sqc-btn-download-tailored')?.addEventListener('click', () => {
      const tailoredText = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sqc_tailored_resume') : null) || p.resumeText || '';
      downloadResumeFile(tailoredText, p);
    });
    $('#sqc-btn-copy-tailored')?.addEventListener('click', () => {
      const tailoredText = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sqc_tailored_resume') : null) || p.resumeText || '';
      if (tailoredText) {
        navigator.clipboard.writeText(tailoredText).then(() => showToast("📋 Tailored resume copied to clipboard!"));
      }
    });
    $('#sqc-btn-copy-ai-prompt')?.addEventListener('click', handleCopyAiPrompt);
    $('#sqc-btn-copy-ai-footer')?.addEventListener('click', handleCopyAiPrompt);
    $('#sqc-btn-paste-ai-answers')?.addEventListener('click', () => openAiPasteModal());
    $('#sqc-btn-paste-ai-footer')?.addEventListener('click', () => openAiPasteModal());

    // Screenshot capture, preview & delete
    drawerEl.querySelectorAll('.sqc-btn-snap-trigger').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (window.SubmissionCheckerCore?.captureScreenshot) {
          await window.SubmissionCheckerCore.captureScreenshot('MANUAL');
        }
      });
    });
    drawerEl.querySelectorAll('[data-shot-preview]').forEach(el => {
      el.addEventListener('click', () => {
        openScreenshotPreviewDialog(el.dataset.shotPreview);
      });
    });
    drawerEl.querySelectorAll('[data-shot-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.SubmissionCheckerCore?.deleteScreenshot) {
          window.SubmissionCheckerCore.deleteScreenshot(btn.dataset.shotDelete);
        }
      });
    });

    // Confirm & log submission
    $('#sqc-btn-confirm-apply')?.addEventListener('click', async (e) => {
      if (!window.SubmissionCheckerCore) return;
      setQuickApplyStatus('submitting', '⏳ Submitting application to Apply-Flow...');
      const restore = setBtnBusy(e.currentTarget, 'Submitting…');
      try {
        const res = await window.SubmissionCheckerCore.confirmAndLogSubmission();
        restore();
        if (res && res.success) {
          setQuickApplyStatus('submitted', '🎉 Submitted successfully to Apply-Flow!');
          showToast("🎉 Application submitted & confirmed in Apply-Flow!");
          setTimeout(() => toggleDrawer(false), 900);
        } else if (res?.reason === 'ALREADY_SUBMITTED_PROTECTED' || res?.reason === 'USER_CANCELLED_INCOMPLETE') {
          setQuickApplyStatus('idle');
          // Toast already shown by the core
        } else {
          setQuickApplyStatus('submitted', '🎉 Application recorded locally.');
          showToast("⚠️ Submission recorded locally.");
        }
      } catch (err) {
        restore();
        setQuickApplyStatus('idle');
        showToast(`❌ Error: ${err.message || 'Submission failed'}`);
      }
    });

    // Portal failure dialog
    $('#sqc-btn-portal-failed')?.addEventListener('click', () => openPortalFailedDialog());

    // Mark as already applied
    $('#sqc-btn-mark-already-applied')?.addEventListener('click', async (e) => {
      if (!window.SubmissionCheckerCore) return;
      const restore = setBtnBusy(e.currentTarget, 'Updating…');
      const res = await window.SubmissionCheckerCore.markAsAlreadyApplied();
      restore();
      if (res && res.success) {
        toggleDrawer(false);
      }
    });

    // Reject job due to unmet strict requirement (e.g. GitHub Profile Required)
    $('#sqc-btn-reject-unmet-job')?.addEventListener('click', async (e) => {
      if (!window.SubmissionCheckerCore) return;
      const reason = e.currentTarget.dataset.reason || 'UNMET_REQUIREMENT_GITHUB';
      const restore = setBtnBusy(e.currentTarget, 'Rejecting in Apply-Flow…');
      const res = await window.SubmissionCheckerCore.rejectJob(reason);
      restore();
      if (res && res.success) {
        toggleDrawer(false);
      }
    });

    // Autofill / restore
    $('#sqc-btn-restore')?.addEventListener('click', () => {
      if (currentProfile?.tailoringMode === 'tailored' && !(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sqc_tailored_resume'))) {
        showToast('⚠️ Tailoring Method: Please upload or paste the job-tailored resume first to extract all required skills.');
        openResumeModal();
        return;
      }
      if (window.SubmissionCheckerCore) {
        const res = window.SubmissionCheckerCore.restoreForm();
        const tailoredText = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sqc_tailored_resume') : null) || currentProfile?.resumeText || '';
        if (tailoredText) {
          attachResumeToPortal(tailoredText, currentProfile);
        }
        showToast(`⚡ Filled ${res?.count || 0} field${res?.count === 1 ? '' : 's'} & verified resume attachment.`);
      }
    });

    // Copy payload
    $('#sqc-btn-copy')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const payload = cleanPayloadForView(extractedData, p);
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      const original = btn.innerHTML;
      btn.innerHTML = `${icon('check', 13)}Copied`;
      btn.classList.add('is-done');
      setTimeout(() => { btn.innerHTML = original; btn.classList.remove('is-done'); }, 1500);
    });

    // Apply-Flow job linking
    const attach = () => {
      const val = $('#sqc-af-input-job-id')?.value?.trim();
      if (!val) {
        showToast("⚠️ Paste an Apply-Flow job ID first.");
        $('#sqc-af-input-job-id')?.focus();
        return;
      }
      if (window.SubmissionCheckerCore) window.SubmissionCheckerCore.attachApplyFlowJobId(val);
    };
    $('#sqc-btn-attach-job-id')?.addEventListener('click', attach);
    $('#sqc-af-input-job-id')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') attach(); });

    // Blockers
    $('#sqc-flag-otp')?.addEventListener('click', () => {
      if (window.SubmissionCheckerCore) {
        window.SubmissionCheckerCore.reportBlockedStatus("EMAIL_OTP_REQUIRED", "Blocked: Candidate email verification / OTP code required to login.");
      }
    });
    $('#sqc-flag-login')?.addEventListener('click', () => {
      if (window.SubmissionCheckerCore) {
        window.SubmissionCheckerCore.reportBlockedStatus("LOGIN_ERROR", "Blocked: ATS portal account error or login disabled.");
      }
    });

    // Context mismatch action buttons
    $('#sqc-btn-open-settings-mismatch')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    });

    $('#sqc-btn-switch-to-target-candidate')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const targetName = btn.dataset.targetName || '';
      const targetId = btn.dataset.targetId || '';
      handleSwitchToTargetCandidate(targetName, targetId, btn);
    });

    $('#sqc-btn-switch-to-account-candidate')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const targetName = btn.dataset.targetName || '';
      const targetId = btn.dataset.targetId || '';
      handleSwitchToTargetCandidate(targetName, targetId, btn);
    });

    // Tech stack conflict buttons
    $('#sqc-btn-switch-stack-candidate')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const targetName = btn.dataset.targetName || '';
      const targetId = btn.dataset.targetId || '';
      handleSwitchToTargetCandidate(targetName, targetId, btn);
    });

    $('#sqc-btn-reject-stack-job')?.addEventListener('click', async (e) => {
      if (!window.SubmissionCheckerCore) return;
      const reason = e.currentTarget.dataset.reason || 'TECH_STACK_MISMATCH';
      const restore = setBtnBusy(e.currentTarget, 'Rejecting in Apply-Flow…');
      const res = await window.SubmissionCheckerCore.rejectJob(reason);
      restore();
      if (res && res.success) {
        toggleDrawer(false);
      }
    });

    $('#sqc-btn-open-settings-stack')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    });
  }

  function handleSwitchToTargetCandidate(targetName, targetId, btn = null) {
    const tName = (targetName || '').trim();
    const tId = (targetId || '').trim();

    // Find matching profile in allProfiles
    const matched = (allProfiles || []).find(prof => {
      if (tId && String(prof.id).toLowerCase() === tId.toLowerCase()) return true;
      if (tName) {
        const tLower = tName.toLowerCase();
        const pLower = (prof.fullName || '').toLowerCase();
        if (pLower === tLower || pLower.includes(tLower) || tLower.includes(pLower)) return true;
        const pTokens = pLower.split(/\s+/).filter(tok => tok.length >= 2);
        const tTokens = tLower.split(/\s+/).filter(tok => tok.length >= 2);
        if (tTokens.length >= 2 && tTokens.every(tok => pTokens.includes(tok))) return true;
      }
      return false;
    });

    if (!matched) {
      showToast(`Candidate "${tName || tId}" is not in this workstation's profile directory. Opening settings to add candidate.`);
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      return;
    }

    // If station profile is locked, open admin passkey modal with this candidate pre-selected
    if (currentSettings?.isProfileLocked) {
      openAdminDialog(matched.id);
      return;
    }

    // Otherwise switch directly
    const restore = btn ? setBtnBusy(btn, 'Switching…') : () => {};
    chrome.runtime.sendMessage({
      type: "SET_ACTIVE_PROFILE",
      profileId: matched.id
    }, (res) => {
      restore();
      if (res && res.success) {
        showToast(`✅ Workstation switched to ${matched.fullName}.`);
        if (window.SubmissionCheckerCore) window.SubmissionCheckerCore.reloadConfig();
      } else if (res?.isLocked) {
        openAdminDialog(matched.id);
      } else {
        showToast(`⚠️ Failed to switch profile: ${res?.error || 'Unknown error'}`);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------------
  function detectToastTone(message) {
    const m = String(message || '').trim();
    if (/^(❌|🚫|🔴|⛔)/u.test(m)) return 'bad';
    if (/^(⚠️|⚠)/u.test(m)) return 'warn';
    if (/^(🎉|✅|💾|📋|⚡|✨|📌)/u.test(m)) return 'ok';
    return 'info';
  }

  function showToast(message) {
    const existing = document.getElementById('sqc-toast-notice');
    if (existing) existing.remove();

    const tone = detectToastTone(message);
    const iconName = tone === 'ok' ? 'checkCircle' : tone === 'bad' ? 'xCircle' : tone === 'warn' ? 'alertCircle' : 'info';
    const text = String(message || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');

    const toast = document.createElement('div');
    toast.id = 'sqc-toast-notice';
    toast.className = `sqc-root sqc-toast t-${tone}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<span class="sqc-toast-ic">${icon(iconName, 16)}</span><span class="sqc-toast-msg">${escapeHtml(text)}</span>`;
    if (document.body) document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 320);
    }, 3400);
  }

  // ---------------------------------------------------------------------------
  // In-page outlines and non-intrusive error indicators (no layout shifts)
  // ---------------------------------------------------------------------------
  function updateFieldHighlights(fieldMap) {
    const currentElements = new Set();

    if (fieldMap) {
      fieldMap.forEach((errList, element) => {
        if (!element || !document.body || !document.body.contains(element)) return;
        currentElements.add(element);

        const hasFatal = errList.some(e => !e.isWarning);
        element.classList.toggle('sqc-field-error', hasFatal);
        element.classList.toggle('sqc-field-warning', !hasFatal);

        const errorText = errList.map(e => e.message).join(' | ');
        element.setAttribute('data-sqc-error', errorText);
        if (!element.title || element.getAttribute('data-sqc-has-title') === 'true') {
          element.title = `⚠️ Gatekeeper: ${errorText}`;
          element.setAttribute('data-sqc-has-title', 'true');
        }
      });
    }

    // Clean up any legacy tooltips
    if (activeTooltips.length > 0) {
      activeTooltips.forEach(t => { try { t.remove(); } catch (_) {} });
      activeTooltips = [];
    }

    document.querySelectorAll('.sqc-field-error, .sqc-field-warning').forEach(el => {
      if (!currentElements.has(el)) {
        el.classList.remove('sqc-field-error', 'sqc-field-warning');
        el.removeAttribute('data-sqc-error');
        if (el.getAttribute('data-sqc-has-title') === 'true') {
          el.title = '';
          el.removeAttribute('data-sqc-has-title');
        }
        if (el._sqcTooltip) {
          try { el._sqcTooltip.remove(); } catch (_) {}
          el._sqcTooltip = null;
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Dialog system
  // ---------------------------------------------------------------------------
  function openDialog({ tone = 'accent', iconName = 'info', title = '', subtitle = '', body = '', footer = '', width = 520, id = '', dismissible = true, onClose = null }) {
    const overlay = document.createElement('div');
    overlay.className = 'sqc-root sqc-ai-modal-overlay sqc-dialog-overlay';
    if (id) overlay.id = id;
    overlay.innerHTML = `
      <div class="sqc-dialog t-${tone}" role="dialog" aria-modal="true" style="--sqc-dialog-w:${width}px">
        <div class="sqc-dialog-head">
          <span class="sqc-dialog-icon">${icon(iconName, 20)}</span>
          <div class="sqc-dialog-titles">
            <div class="sqc-dialog-title">${title}</div>
            ${subtitle ? `<div class="sqc-dialog-sub">${subtitle}</div>` : ''}
          </div>
          ${dismissible ? `<button class="sqc-icon-btn sqc-dialog-close" data-sqc-close title="Close (Esc)">${icon('x', 16)}</button>` : ''}
        </div>
        <div class="sqc-dialog-body">${body}</div>
        ${footer ? `<div class="sqc-dialog-foot">${footer}</div>` : ''}
      </div>
    `;

    let closed = false;
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible && openDialogs[openDialogs.length - 1] === overlay) {
        e.stopPropagation();
        close();
      }
    };
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      openDialogs = openDialogs.filter(d => d !== overlay);
      overlay.classList.add('is-leaving');
      setTimeout(() => overlay.remove(), 160);
      if (onClose) onClose();
    }

    overlay.addEventListener('mousedown', (e) => {
      if (dismissible && e.target === overlay) close();
    });
    overlay.querySelectorAll('[data-sqc-close]').forEach(b => b.addEventListener('click', close));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    openDialogs.push(overlay);

    return { el: overlay, close, $: (sel) => overlay.querySelector(sel) };
  }

  function setStatus(el, tone, msg) {
    if (!el) return;
    el.className = `sqc-status-msg t-${tone} is-visible`;
    el.textContent = msg;
  }

  // Blocking modal shown when a submit is intercepted
  function showBlockingModal(validationResult, onOverride) {
    removeBlockingModal();

    const p = currentProfile || { fullName: 'Candidate' };
    const errors = validationResult.errors || [];
    const hasContextMismatch = errors.some(e => e.rule === 'CONTEXT_PROFILE_MISMATCH');
    const allowOverride = currentSettings?.allowOverride !== false && !hasContextMismatch;
    const targetCandidateName = currentApplyFlowParams?.profileName || lastExtracted?.target_profile_name || '';
    const targetCandidateId = currentApplyFlowParams?.profileId || lastExtracted?.target_candidate_id || '';

    const body = `
      <p class="sqc-dialog-lead">${hasContextMismatch
        ? `The Gatekeeper blocked this submission: this workstation is active for <strong>${escapeHtml(p.fullName)}</strong>, but the job belongs to <strong>${escapeHtml(targetCandidateName || targetCandidateId)}</strong>. Do not submit under this profile!`
        : `The Gatekeeper stopped this application because of ${errors.length} critical mismatch${errors.length === 1 ? '' : 'es'}. Fix them, then submit again.`}</p>
      <div class="sqc-list">
        ${errors.map(err => `
          <div class="sqc-issue t-bad">
            <span class="sqc-issue-ic">${icon('xCircle', 15)}</span>
            <div class="sqc-issue-body">
              <div class="sqc-issue-msg">${escapeHtml(err.message)}</div>
              <div class="sqc-issue-rule">${escapeHtml(err.rule || 'VALIDATION ERROR')}</div>
            </div>
          </div>`).join('')}
      </div>
    `;

    const footer = `
      ${hasContextMismatch && (targetCandidateName || targetCandidateId) ? `
        <button class="sqc-btn sqc-btn-danger" id="sqc-modal-switch-candidate" data-target-name="${escapeHtml(targetCandidateName)}" data-target-id="${escapeHtml(targetCandidateId)}">
          ${icon('user', 14)} Switch Station to ${escapeHtml(targetCandidateName || 'Assigned Candidate')}
        </button>
      ` : ''}
      ${allowOverride ? `<button class="sqc-btn sqc-btn-ghost-danger" id="sqc-modal-override">${icon('alert', 14)}Submit anyway</button>` : ''}
      <span class="sqc-spacer"></span>
      <button class="sqc-btn sqc-btn-primary" id="sqc-modal-fix">${icon('wand', 14)}Review & fix</button>
    `;

    blockingDialog = openDialog({
      id: 'sqc-modal-overlay',
      tone: 'bad',
      iconName: 'octagon',
      title: hasContextMismatch ? 'Candidate Context Mismatch' : 'Submission blocked',
      subtitle: `Active Profile: <strong>${escapeHtml(p.fullName)}</strong>`,
      body,
      footer,
      width: 520,
      onClose: () => { blockingDialog = null; }
    });

    blockingDialog.$('#sqc-modal-fix')?.addEventListener('click', () => {
      removeBlockingModal();
      toggleDrawer(true);
    });

    blockingDialog.$('#sqc-modal-switch-candidate')?.addEventListener('click', () => {
      removeBlockingModal();
      handleSwitchToTargetCandidate(targetCandidateName, targetCandidateId);
    });

    blockingDialog.$('#sqc-modal-override')?.addEventListener('click', () => {
      removeBlockingModal();
      if (onOverride) onOverride();
    });
  }

  function removeBlockingModal() {
    if (blockingDialog) {
      const d = blockingDialog;
      blockingDialog = null;
      d.close();
    }
  }

  // Admin reassignment dialog
  function openAdminDialog(preferredProfileId = null) {
    const p = currentProfile || {};
    const stackKey = currentSettings?.activeStackKey || 'dotnet';
    const profileOptions = allProfiles.map(prof => `
      <option value="${escapeHtml(prof.id)}" ${(preferredProfileId ? prof.id === preferredProfileId : prof.id === p.id) ? 'selected' : ''}>${escapeHtml(prof.fullName)} — ${escapeHtml(prof.targetStack || 'Dev')}</option>
    `).join('');

    const dlg = openDialog({
      tone: 'accent',
      iconName: 'key',
      title: 'Reassign candidate',
      subtitle: 'Admin passkey required to switch profile or stack track.',
      width: 440,
      body: `
        <label class="sqc-form-field">
          <span class="sqc-form-label">Candidate profile</span>
          <select id="sqc-hud-target-profile" class="sqc-control">${profileOptions}</select>
        </label>
        <label class="sqc-form-field">
          <span class="sqc-form-label">Stack track</span>
          <select id="sqc-hud-target-stack" class="sqc-control">
            <option value="dotnet" ${stackKey === 'dotnet' ? 'selected' : ''}>Full Stack C# / .NET</option>
            <option value="python" ${stackKey === 'python' ? 'selected' : ''}>Full Stack Python / FastAPI</option>
            <option value="php" ${stackKey === 'php' ? 'selected' : ''}>Full Stack PHP / Laravel</option>
            <option value="auto" ${stackKey === 'auto' ? 'selected' : ''}>Auto-detect per job</option>
          </select>
        </label>
        <label class="sqc-form-field">
          <span class="sqc-form-label">Admin passkey</span>
          <input type="password" id="sqc-hud-passkey" class="sqc-control" placeholder="••••••••••" autocomplete="off" />
        </label>
        <div id="sqc-hud-admin-err" class="sqc-status-msg"></div>
      `,
      footer: `
        <button class="sqc-btn sqc-btn-ghost" data-sqc-close id="sqc-hud-cancel-admin">Cancel</button>
        <button class="sqc-btn sqc-btn-primary" id="sqc-hud-submit-admin">${icon('unlock', 14)}Reassign</button>
      `
    });

    const passkeyInput = dlg.$('#sqc-hud-passkey');
    const errEl = dlg.$('#sqc-hud-admin-err');
    setTimeout(() => passkeyInput?.focus(), 60);

    const submit = () => {
      const token = passkeyInput?.value?.trim();
      const targetProf = dlg.$('#sqc-hud-target-profile')?.value;
      const targetStack = dlg.$('#sqc-hud-target-stack')?.value || 'dotnet';

      if (!token) {
        setStatus(errEl, 'bad', 'Please enter the admin passkey.');
        passkeyInput?.focus();
        return;
      }

      const btn = dlg.$('#sqc-hud-submit-admin');
      const restore = setBtnBusy(btn, 'Verifying…');
      chrome.runtime.sendMessage({
        type: "ADMIN_UNLOCK_PROFILE",
        adminToken: token,
        profileId: targetProf,
        activeStackKey: targetStack
      }, (res) => {
        restore();
        if (res && res.success) {
          dlg.close();
          showToast("✅ Candidate reassigned.");
          if (window.SubmissionCheckerCore) window.SubmissionCheckerCore.reloadConfig();
        } else {
          setStatus(errEl, 'bad', res?.error || 'Invalid admin passkey.');
        }
      });
    };

    dlg.$('#sqc-hud-submit-admin')?.addEventListener('click', submit);
    passkeyInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  // Portal failure dialog (replaces window.prompt flow)
  function openPortalFailedDialog() {
    if (!window.SubmissionCheckerCore) return;

    const reasons = [
      { key: 'PORTAL_ACCESS_FAILED', title: 'Login failed', desc: 'Credentials rejected or login loop' },
      { key: 'CAPTCHA_BLOCKED', title: 'CAPTCHA blocked', desc: 'Verification could not be solved' },
      { key: 'ACCOUNT_LOCKED', title: 'Account locked', desc: 'Too many attempts / locked out' },
      { key: 'PORTAL_DOWN', title: 'Portal down', desc: 'Site unreachable or erroring' },
      { key: 'ACTIVATION_REQUIRED', title: 'Activation required', desc: 'Account not yet activated' }
    ];
    let selected = reasons[0].key;
    let attempts = 1;

    const dlg = openDialog({
      tone: 'bad',
      iconName: 'ban',
      title: 'Report portal failure',
      subtitle: 'Logs the failure reason to Apply-Flow for this job.',
      width: 460,
      body: `
        <div class="sqc-options" role="radiogroup">
          ${reasons.map((r, i) => `
            <button class="sqc-option ${i === 0 ? 'selected' : ''}" data-key="${r.key}" role="radio" aria-checked="${i === 0}">
              <span class="sqc-option-radio"></span>
              <span class="sqc-option-text"><strong>${r.title}</strong><em>${r.desc}</em></span>
            </button>`).join('')}
        </div>
        <div class="sqc-row-between">
          <span class="sqc-form-label">Attempts made</span>
          <div class="sqc-stepper">
            <button class="sqc-icon-btn" id="sqc-attempt-minus" title="Fewer">${icon('minus', 14)}</button>
            <span id="sqc-attempt-count">1</span>
            <button class="sqc-icon-btn" id="sqc-attempt-plus" title="More">${icon('plus', 14)}</button>
          </div>
        </div>
      `,
      footer: `
        <button class="sqc-btn sqc-btn-ghost" data-sqc-close>Cancel</button>
        <button class="sqc-btn sqc-btn-danger-solid" id="sqc-portal-submit">${icon('flag', 14)}Log failure</button>
      `
    });

    dlg.el.querySelectorAll('.sqc-option').forEach(opt => {
      opt.addEventListener('click', () => {
        selected = opt.dataset.key;
        dlg.el.querySelectorAll('.sqc-option').forEach(o => {
          const on = o === opt;
          o.classList.toggle('selected', on);
          o.setAttribute('aria-checked', String(on));
        });
      });
    });

    const countEl = dlg.$('#sqc-attempt-count');
    dlg.$('#sqc-attempt-minus')?.addEventListener('click', () => { attempts = Math.max(1, attempts - 1); countEl.textContent = attempts; });
    dlg.$('#sqc-attempt-plus')?.addEventListener('click', () => { attempts = Math.min(99, attempts + 1); countEl.textContent = attempts; });

    dlg.$('#sqc-portal-submit')?.addEventListener('click', async (e) => {
      const restore = setBtnBusy(e.currentTarget, 'Logging…');
      await window.SubmissionCheckerCore.markAsPortalFailed(selected, attempts);
      restore();
      dlg.close();
    });
  }

  // Draggable logic for floating pill
  function setupDraggable(el) {
    if (!el || el.dataset.sqcDraggable === '1') return;
    el.dataset.sqcDraggable = '1';
    let startX, startY, initialLeft, initialTop;

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;

      const rect = containerEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      const onMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          el.dataset.isDragging = 'true';
          el.classList.add('is-dragging');
          const maxLeft = window.innerWidth - rect.width - 4;
          const maxTop = window.innerHeight - rect.height - 4;
          containerEl.style.left = `${Math.min(Math.max(4, initialLeft + dx), maxLeft)}px`;
          containerEl.style.top = `${Math.min(Math.max(4, initialTop + dy), maxTop)}px`;
          containerEl.style.right = 'auto';
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        el.classList.remove('is-dragging');
        if (el.dataset.isDragging === 'true' && containerEl) {
          try {
            localStorage.setItem('sqc_pill_pos', JSON.stringify({
              left: containerEl.style.left,
              top: containerEl.style.top,
              right: containerEl.style.right
            }));
          } catch (_) {}
        }
        setTimeout(() => {
          el.dataset.isDragging = 'false';
        }, 50);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // =========================================================================
  // Robust In-Memory Resume Attachment & Fast Tailoring Engine
  // =========================================================================
  let activeTailoredFile = null;

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function base64ToFile(dataUrl, filename) {
    try {
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime, lastModified: Date.now() });
    } catch (e) {
      console.warn("[SQC] base64ToFile failed:", e);
      return null;
    }
  }

  // =========================================================================
  // Executive-Grade Typographic Resume PDF Synthesizer
  // Formats raw or pasted resume text into a professional, cleanly styled PDF
  // with modern header, contact banner, accent divider rules, section headers,
  // right-aligned dates, and indented bullet points.
  // =========================================================================
  function synthesizeExecutiveResumePdf(textContent, filename, profile = {}) {
    const p = profile || currentProfile || {};
    const pName = String(p.fullName || 'Candidate').trim();
    const email = p.primaryEmail || p.email || '';
    const phone = p.phone || p.formattedPhone || '';
    const location = [p.city, p.state].filter(Boolean).join(', ') || p.country || '';
    const linkedin = p.linkedin ? (p.linkedin.includes('linkedin.com') ? p.linkedin : 'linkedin.com/in/' + p.linkedin) : '';
    const github = p.github || '';

    const contactItems = [email, phone, location, linkedin, github].filter(Boolean);
    const contactLine = contactItems.join('   •   ');

    const escapePdf = (str) => String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    function wrapWords(str, maxChars) {
      const words = String(str || '').split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).trim().length <= maxChars) {
          cur = (cur + ' ' + w).trim();
        } else {
          if (cur) lines.push(cur);
          cur = w;
        }
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [''];
    }

    const rawLines = String(textContent || '').split('\n').map(l => l.trim()).filter(Boolean);
    const pageStreams = [];
    let curStream = '';
    let y = 745;
    const leftX = 42;
    const rightX = 570;

    function flushPage() {
      if (curStream) pageStreams.push(curStream);
      curStream = '';
      y = 745;
    }

    // --- Modern Executive Header ---
    curStream += '0.08 0.12 0.22 rg\n';
    curStream += 'BT\n/F1 18 Tf\n' + leftX + ' ' + y + ' Td\n(' + escapePdf(pName) + ') Tj\nET\n';
    y -= 14;

    if (p.targetStack) {
      curStream += '0.3 0.35 0.45 rg\n';
      curStream += 'BT\n/F1 9.5 Tf\n' + leftX + ' ' + y + ' Td\n(' + escapePdf(p.targetStack.toUpperCase()) + ') Tj\nET\n';
      y -= 12;
    }

    if (contactLine) {
      curStream += '0.25 0.3 0.38 rg\n';
      const cLines = wrapWords(contactLine, 95);
      for (const cl of cLines) {
        curStream += 'BT\n/F2 8.5 Tf\n' + leftX + ' ' + y + ' Td\n(' + escapePdf(cl) + ') Tj\nET\n';
        y -= 11;
      }
    }

    y -= 3;
    // Accent rule beneath header
    curStream += '0.15 0.28 0.5 RG\n1.5 w\n' + leftX + ' ' + y + ' m ' + rightX + ' ' + y + ' l S\n';
    y -= 16;

    const sectionRegex = /^(technical\s*skills|skills|summary|professional\s*summary|experience|professional\s*experience|work\s*experience|employment|work\s*history|education|certifications|projects|awards|honors|publications)$/i;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (i < 3 && line.toLowerCase() === pName.toLowerCase()) continue;

      const cleanSec = line.replace(/^#+\s*/, '').replace(/[:]$/, '').trim();
      if (sectionRegex.test(cleanSec)) {
        if (y < 90) flushPage();
        y -= 6;
        curStream += '0.1 0.18 0.36 rg\n';
        curStream += 'BT\n/F1 11 Tf\n' + leftX + ' ' + y + ' Td\n(' + escapePdf(cleanSec.toUpperCase()) + ') Tj\nET\n';
        y -= 3;
        curStream += '0.75 0.78 0.85 RG\n0.8 w\n' + leftX + ' ' + y + ' m ' + rightX + ' ' + y + ' l S\n';
        y -= 14;
        continue;
      }

      const isBullet = /^([•\-\*]|\d+\.)\s+/.test(line);
      if (isBullet) {
        const bulletText = line.replace(/^([•\-\*]|\d+\.)\s+/, '').trim();
        const wrapped = wrapWords(bulletText, 88);
        if (y - (wrapped.length * 12) < 45) flushPage();

        curStream += '0.18 0.22 0.3 rg\n';
        curStream += 'BT\n/F1 9 Tf\n' + (leftX + 6) + ' ' + y + ' Td\n(*) Tj\nET\n';

        for (let wIdx = 0; wIdx < wrapped.length; wIdx++) {
          const textX = leftX + 16;
          curStream += 'BT\n/F2 9 Tf\n' + textX + ' ' + y + ' Td\n(' + escapePdf(wrapped[wIdx]) + ') Tj\nET\n';
          y -= 11.5;
        }
        y -= 1.5;
        continue;
      }

      const isRole = line.includes('|') || /(19\d\d|20\d\d)/.test(line);
      if (isRole) {
        if (y < 65) flushPage();
        curStream += '0.08 0.12 0.2 rg\n';
        curStream += 'BT\n/F1 9.5 Tf\n' + leftX + ' ' + y + ' Td\n(' + escapePdf(line) + ') Tj\nET\n';
        y -= 13;
        continue;
      }

      const wrapped = wrapWords(line, 92);
      if (y - (wrapped.length * 12) < 45) flushPage();

      curStream += '0.15 0.18 0.24 rg\n';
      for (const wLine of wrapped) {
        curStream += 'BT\n/F2 9 Tf\n' + leftX + ' ' + y + ' Td\n(' + escapePdf(wLine) + ') Tj\nET\n';
        y -= 12;
      }
      y -= 2;
    }

    if (curStream) pageStreams.push(curStream);
    if (!pageStreams.length) pageStreams.push('BT\n/F1 14 Tf\n50 700 Td\n(' + escapePdf(pName) + ') Tj\nET\n');

    // Assemble valid PDF-1.4 with cross-reference table
    const numPages = pageStreams.length;
    const fontObjId1 = 3 + (numPages * 2);
    const fontObjId2 = fontObjId1 + 1;

    let body = '%PDF-1.4\n';
    const offsets = [];

    function addObj(id, content) {
      offsets[id] = body.length;
      body += id + ' 0 obj\n' + content + '\nendobj\n';
    }

    // 1: Catalog
    addObj(1, '<< /Type /Catalog /Pages 2 0 R >>');

    // 2: Pages
    const kids = [];
    for (let pIdx = 0; pIdx < numPages; pIdx++) {
      kids.push((3 + (pIdx * 2)) + ' 0 R');
    }
    addObj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + numPages + ' >>');

    // Pages & Content streams
    for (let pIdx = 0; pIdx < numPages; pIdx++) {
      const pageId = 3 + (pIdx * 2);
      const contentId = pageId + 1;
      const stream = pageStreams[pIdx];

      addObj(pageId, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + contentId + ' 0 R /Resources << /Font << /F1 ' + fontObjId1 + ' 0 R /F2 ' + fontObjId2 + ' 0 R >> >> >>');
      addObj(contentId, '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
    }

    // Fonts
    addObj(fontObjId1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    addObj(fontObjId2, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    const totalObjs = fontObjId2;
    const xrefOffset = body.length;
    let xref = 'xref\n0 ' + (totalObjs + 1) + '\n0000000000 65535 f \n';
    for (let id = 1; id <= totalObjs; id++) {
      const off = String(offsets[id] || 0).padStart(10, '0');
      xref += off + ' 00000 n \n';
    }

    const trailer = 'trailer\n<< /Size ' + (totalObjs + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
    const fullPdf = body + xref + trailer;

    return new Blob([fullPdf], { type: 'application/pdf' });
  }

  function getCandidateCleanFileName(profile, originalFilename = '') {
    const p = profile || currentProfile || {};
    const candName = String(p.fullName || 'Candidate').trim();
    const lowerOrig = String(originalFilename || '').toLowerCase();
    let ext = 'pdf';
    if (lowerOrig.endsWith('.docx')) ext = 'docx';
    else if (lowerOrig.endsWith('.doc')) ext = 'doc';
    return `${candName}.${ext}`;
  }

  function getStoredOrSynthesizedResumeFile(resumeText, profile) {
    if (activeTailoredFile) return activeTailoredFile;

    const p = profile || currentProfile || {};
    const canonicalName = getCandidateCleanFileName(p, '.pdf');

    // 1. Try rehydrating active tailored file from sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      const b64 = sessionStorage.getItem('sqc_tailored_resume_file_b64');
      if (b64) {
        const rehydrated = base64ToFile(b64, canonicalName);
        if (rehydrated) {
          activeTailoredFile = rehydrated;
          return rehydrated;
        }
      }
    }

    // 2. Try candidate profile's stored master original styled PDF
    if (p.resumeBase64) {
      const masterFile = base64ToFile(p.resumeBase64, canonicalName);
      if (masterFile) {
        activeTailoredFile = masterFile;
        return masterFile;
      }
    }

    // 3. Synthesize an Executive-Grade Styled PDF from resume text
    const pdfBlob = synthesizeExecutiveResumePdf(resumeText, canonicalName, p);
    const file = new File([pdfBlob], canonicalName, { type: 'application/pdf', lastModified: Date.now() });
    activeTailoredFile = file;
    return file;
  }

  function broadcastResumeToFrames(file, resumeText, profile) {
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result;
        const msg = {
          type: 'SQC_ATTACH_RESUME_TO_PORTAL',
          filename: file.name,
          mimeType: file.type || 'application/pdf',
          base64: base64Data,
          resumeText: resumeText || '',
          profile: profile || currentProfile || {}
        };
        // Broadcast to all child iframes
        document.querySelectorAll('iframe').forEach(f => {
          try {
            f.contentWindow?.postMessage(msg, '*');
          } catch (_) {}
        });
        // Also broadcast to parent window if inside an iframe
        if (window !== window.top) {
          try {
            window.top?.postMessage(msg, '*');
          } catch (_) {}
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.warn("[SQC] Broadcast resume to frames error:", e);
    }
  }

  function attachResumeToPortal(resumeText, profile, customFile = null, options = {}) {
    const p = profile || currentProfile || {};
    const hasCachedFile = typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('sqc_tailored_resume_file_b64'));
    if ((!resumeText || !resumeText.trim()) && !customFile && !activeTailoredFile && !hasCachedFile && !p.resumeBase64) {
      return { success: false, error: "Empty resume content" };
    }
    const canonicalName = getCandidateCleanFileName(p, (customFile?.name || activeTailoredFile?.name || '.pdf'));

    let effectiveFile = customFile || activeTailoredFile;
    if (!effectiveFile) {
      effectiveFile = getStoredOrSynthesizedResumeFile(resumeText, p);
    } else if (effectiveFile && effectiveFile.name !== canonicalName) {
      // Ensure the attached file is strictly renamed to the candidate profile's name alone
      effectiveFile = new File([effectiveFile], canonicalName, {
        type: effectiveFile.type || (canonicalName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf'),
        lastModified: effectiveFile.lastModified || Date.now()
      });
      activeTailoredFile = effectiveFile;
    }

    const filename = canonicalName;
    let fileInputsCount = 0;
    let textareasCount = 0;
    let triggerActivated = false;

    // Helper: Collect all file inputs across DOM and open shadow roots
    function collectAllFileInputs() {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]')).filter(inp => {
        if (inp.closest('#sqc-hud-container, #sqc-modal-overlay, .sqc-ai-modal-overlay, .sqc-dialog-overlay')) return false;
        return true;
      });
      try {
        document.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) {
            el.shadowRoot.querySelectorAll('input[type="file"]').forEach(si => {
              if (!si.closest('#sqc-hud-container, #sqc-modal-overlay, .sqc-ai-modal-overlay, .sqc-dialog-overlay')) {
                inputs.push(si);
              }
            });
          }
        });
      } catch (_) {}
      return inputs;
    }

    // Helper: Collect upload triggers (TTC Portals, Taleo, Workday buttons)
    function collectUploadTriggers() {
      return Array.from(document.querySelectorAll('button, a, label, [role="button"], div, span, li')).filter(el => {
        if (el.closest('#sqc-hud-container, #sqc-modal-overlay, .sqc-ai-modal-overlay, .sqc-dialog-overlay')) return false;
        const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (/upload (a\s+)?(resume|cv)/i.test(txt) ||
            /upload\s*(from\s*device)?/i.test(txt) ||
            /select\s*(a\s*)?(resume|cv|file)/i.test(txt) ||
            /browse\s*(resume|file|document)?/i.test(txt) ||
            /drop\s*or\s*select/i.test(txt) ||
            /choose\s*(a\s*)?(resume|cv|file)/i.test(txt) ||
            (/^upload$/i.test(txt) && /resume|cv/i.test(el.closest('div, section, form, [role="dialog"], .modal')?.innerText || ''))) {
          return txt.length < 80;
        }
        const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-automation-id') || el.className || el.id || '').toLowerCase();
        return aria.includes('upload-resume') || aria.includes('resume-upload') || aria.includes('uploadresume') || aria.includes('fileupload');
      });
    }

    // 1. In-Memory Real File & DataTransfer Injection
    try {
      if (effectiveFile) {
        let allFileInputs = collectAllFileInputs();
        const uploadTriggers = collectUploadTriggers();

        // Check if any triggers enclose or point to an input
        uploadTriggers.forEach(trig => {
          const forId = trig.getAttribute('for');
          const forInput = forId ? document.getElementById(forId) : null;
          const nearby = forInput || trig.querySelector('input[type="file"]') || trig.parentElement?.querySelector('input[type="file"]') || trig.closest('form, div, section, [role="dialog"], .modal')?.querySelector('input[type="file"]');
          if (nearby && !allFileInputs.includes(nearby)) {
            allFileInputs.push(nearby);
          }
        });

        const resumeInputs = allFileInputs.filter(inp => {
          const idName = `${inp.id} ${inp.name} ${inp.getAttribute('data-qa') || ''} ${inp.getAttribute('aria-label') || ''}`.toLowerCase();
          const parentText = (inp.closest('label, .form-group, .file-upload, [class*="upload"], [class*="resume"], fieldset, div') || inp.parentElement)?.innerText?.toLowerCase() || '';
          return idName.includes('resume') || idName.includes('cv') || idName.includes('file') || idName.includes('upload') || parentText.includes('resume') || parentText.includes('cv') || parentText.includes('curriculum');
        });

        const targets = resumeInputs.length > 0 ? resumeInputs : (allFileInputs.length > 0 ? [allFileInputs[0]] : []);

        targets.forEach(inp => {
          try {
            const dt = new DataTransfer();
            dt.items.add(effectiveFile);
            inp.files = dt.files;
            inp.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            fileInputsCount++;

            // Trigger drop simulation on dropzone containers and upload triggers
            const dropzoneTargets = [
              inp,
              inp.parentElement,
              inp.closest('.dropzone, [class*="dropzone"], [class*="drop-zone"], [class*="file-upload"], [class*="attach"], [class*="_dropzone_"], [class*="upload"]'),
              ...uploadTriggers
            ].filter(Boolean);

            dropzoneTargets.forEach(dtTarget => {
              try {
                dtTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
                dtTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
                dtTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
              } catch (_) {}
            });
          } catch (err) {
            console.warn("[SQC] File input injection notice:", err);
          }
        });

        // 2. Fallback for TTC Portals, Taleo, Workday: If no direct file input yet, activate the upload trigger!
        if (targets.length === 0 && uploadTriggers.length > 0) {
          try {
            const dt = new DataTransfer();
            dt.items.add(effectiveFile);

            // Simulate drag & drop first
            uploadTriggers.forEach(trig => {
              try {
                trig.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
                trig.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
                trig.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
              } catch (_) {}
            });

            // Find the best trigger element (preferring interactive element or innermost with upload text)
            const bestTrigger = uploadTriggers.find(el => ['A', 'BUTTON', 'LABEL'].includes(el.tagName) || el.getAttribute('role') === 'button') || uploadTriggers[uploadTriggers.length - 1];

            if (bestTrigger) {
              // Ensure clean file is downloaded so user has it immediately in Downloads folder
              downloadResumeFile(resumeText, p, { silent: true });

              // Visually highlight the trigger on the portal
              const origOutline = bestTrigger.style.outline;
              const origBoxShadow = bestTrigger.style.boxShadow;
              bestTrigger.style.outline = '3px solid #10b981';
              bestTrigger.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.6)';
              bestTrigger.style.transition = 'all 0.3s ease';
              setTimeout(() => {
                bestTrigger.style.outline = origOutline;
                bestTrigger.style.boxShadow = origBoxShadow;
              }, 4000);

              // Programmatically click the trigger
              bestTrigger.focus?.();
              bestTrigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
              bestTrigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
              bestTrigger.click();
              triggerActivated = true;

              // Actively watch for dynamically added file input over the next 3500ms
              let pollAttempts = 0;
              const watchInterval = setInterval(() => {
                pollAttempts++;
                const dynamicInputs = collectAllFileInputs();
                if (dynamicInputs.length > 0) {
                  clearInterval(watchInterval);
                  dynamicInputs.forEach(dynInp => {
                    try {
                      const dtDyn = new DataTransfer();
                      dtDyn.items.add(effectiveFile);
                      dynInp.files = dtDyn.files;
                      dynInp.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                      dynInp.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    } catch (_) {}
                  });
                  showToast(`🎉 Attached "${filename}" to portal upload!`);
                  if (window.SubmissionCheckerCore) window.SubmissionCheckerCore.runLiveCheck();
                } else if (pollAttempts > 35) {
                  clearInterval(watchInterval);
                }
              }, 100);
            }
          } catch (e) {
            console.warn("[SQC] Upload trigger activation error:", e);
          }
        }

        // Cross-Frame Broadcast: Transmit real resume file to all iframes
        broadcastResumeToFrames(effectiveFile, resumeText, p);
      }
    } catch (e) {
      console.warn("[SQC] DataTransfer / File generation notice:", e);
    }

    // 3. Autofill matching resume textareas with plain text
    if (resumeText) {
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach(ta => {
        if (ta.closest('#sqc-hud-container, #sqc-modal-overlay, .sqc-ai-modal-overlay, .sqc-dialog-overlay')) return;
        const lbl = (ta.getAttribute('aria-label') || ta.placeholder || ta.name || ta.id || '').toLowerCase();
        const parentLbl = (ta.closest('label, .form-group, fieldset, div')?.querySelector('label, h3, h4, span')?.innerText || '').toLowerCase();
        if (lbl.includes('resume') || lbl.includes('cv') || lbl.includes('paste') || parentLbl.includes('resume') || parentLbl.includes('cv')) {
          ta.value = resumeText;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          textareasCount++;
        }
      });
    }

    // 4. Update in-memory extractedData so HUD immediately reflects the attached resume
    if (lastExtracted) {
      lastExtracted.resume_uploaded = filename;
      lastExtracted.resume_size = effectiveFile?.size || resumeText?.length || 102400;
    }

    // 5. Save to session storage
    if (typeof sessionStorage !== 'undefined') {
      if (resumeText) sessionStorage.setItem('sqc_tailored_resume', resumeText);
      sessionStorage.setItem('sqc_tailored_resume_filename', filename);
    }

    return {
      success: true,
      filename,
      fileInputsCount,
      textareasCount,
      triggerActivated
    };
  }

  function downloadResumeFile(resumeText, profile, options = {}) {
    const p = profile || currentProfile || {};
    const canonicalName = getCandidateCleanFileName(p, (activeTailoredFile?.name || '.pdf'));

    let fileToDownload = activeTailoredFile;
    if (!fileToDownload && typeof sessionStorage !== 'undefined') {
      const b64 = sessionStorage.getItem('sqc_tailored_resume_file_b64');
      if (b64) {
        fileToDownload = base64ToFile(b64, canonicalName);
      }
    }
    if (!fileToDownload && p.resumeBase64) {
      fileToDownload = base64ToFile(p.resumeBase64, canonicalName);
    }

    let url, filename = canonicalName;
    if (fileToDownload) {
      url = URL.createObjectURL(fileToDownload);
    } else {
      const blob = synthesizeExecutiveResumePdf(resumeText, canonicalName, p);
      url = URL.createObjectURL(blob);
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (!options.silent) {
      showToast(`📥 Downloaded ${filename} — ready for portal upload!`);
    }
    return filename;
  }

  // Resume manager dialog
  function openResumeModal() {
    const p = currentProfile || {};
    const isTailoringMethod = p.tailoringMode === 'tailored';
    const existingTailored = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sqc_tailored_resume') : null) || '';
    const existingBase = p.resumeText || p.baseResumeText || '';
    const currentText = existingTailored || existingBase;
    const countLabel = (t) => t ? `${t.length.toLocaleString()} chars · ~${t.split(/\s+/).filter(Boolean).length.toLocaleString()} words` : 'Empty';

    const canonicalProfileName = getCandidateCleanFileName(p, (activeTailoredFile?.name || '.pdf'));

    // Check if a real file is cached
    if (!activeTailoredFile && typeof sessionStorage !== 'undefined') {
      const b64 = sessionStorage.getItem('sqc_tailored_resume_file_b64');
      if (b64) {
        activeTailoredFile = base64ToFile(b64, canonicalProfileName);
      }
    }

    const hasActiveFile = Boolean(activeTailoredFile || existingTailored || existingBase);
    const activeFileName = canonicalProfileName;

    const methodBadge = isTailoringMethod
      ? `<span class="sqc-badge t-ai">✨ Tailoring Method Active</span>`
      : `<span class="sqc-badge t-info">📄 Base Method Active</span>`;

    const sourceBadge = existingTailored
      ? `<span class="sqc-badge t-ok">${icon('sparkles', 11)}Tailored for this job</span>`
      : (existingBase ? `<span class="sqc-badge t-info">${icon('file', 11)}Base profile resume</span>` : `<span class="sqc-badge t-warn">No resume yet</span>`);

    // Initial skill extraction preview if text exists
    let initialSkillsPreviewHtml = '';
    if (currentText && typeof window !== 'undefined' && window.ResumeDocumentParser?.extractAndInferTechnicalSkills) {
      try {
        const skillsData = window.ResumeDocumentParser.extractAndInferTechnicalSkills(currentText, currentText.toLowerCase());
        const kw = skillsData.primaryStackKeywords || [];
        if (kw.length > 0) {
          initialSkillsPreviewHtml = `
            <div class="sqc-skills-preview-box">
              <div class="sqc-skills-preview-title">✨ ${kw.length} Technical Skills Detected & Inferred:</div>
              <div class="sqc-skills-chips-flow">
                ${kw.slice(0, 16).map(k => `<span class="sqc-skill-pill-sm">${escapeHtml(k)}</span>`).join('')}
                ${kw.length > 16 ? `<span class="sqc-meta">+${kw.length - 16} more</span>` : ''}
              </div>
            </div>
          `;
        }
      } catch (_) {}
    }

    const dlg = openDialog({
      tone: isTailoringMethod ? 'ai' : 'info',
      iconName: 'file',
      title: isTailoringMethod ? 'Tailored Resume Studio' : 'Candidate Resume Manager',
      subtitle: isTailoringMethod 
        ? `Upload document (.pdf, .docx). Extracts skills, attaches to portal & context for autofill, and closes so you can go ahead with the application.`
        : `Verified standard resume for ${p.fullName || 'Candidate'}. Used across all applications.`,
      width: 640,
      body: `
        <div class="sqc-row-between">
          <div style="display:flex; gap:6px; align-items:center;">
            ${methodBadge}
            ${sourceBadge}
          </div>
          <span class="sqc-meta">Supports .PDF, .DOCX, .TXT</span>
        </div>

        <!-- Document File Dropzone -->
        <div class="sqc-dropzone ${hasActiveFile ? 'has-file' : ''}" id="sqc-resume-dropzone" role="button" tabindex="0" title="Click to browse or drop resume file">
          <input type="file" id="sqc-modal-resume-file" accept=".pdf,.docx,.doc,.txt,.md,.rtf" style="display:none;" />
          <div class="sqc-dropzone-icon" id="sqc-dropzone-icon">${icon(hasActiveFile ? 'checkCircle' : 'upload', 20)}</div>
          <div class="sqc-dropzone-title" id="sqc-dropzone-title">
            ${hasActiveFile ? `✅ Ready: ${escapeHtml(activeFileName)} (${activeTailoredFile ? Math.round(activeTailoredFile.size / 1024) + ' KB' : 'Active'})` : 'Click to Upload or Drag & Drop Resume File (.pdf, .docx, .txt)'}
          </div>
          <div class="sqc-dropzone-desc" id="sqc-dropzone-desc">
            ${hasActiveFile ? 'Ready for portal attachment · Auto-attaches to context for autofill' : 'Auto-extracts skills, attaches real document to portal, and closes for autofill.'}
          </div>
          <div class="sqc-dropzone-actions">
            <button type="button" class="sqc-btn sqc-btn-primary sqc-btn-sm" id="sqc-btn-browse-file">
              ${icon('folder', 13)} Browse Document File (.pdf, .docx)
            </button>
            <button type="button" class="sqc-btn sqc-btn-soft sqc-btn-sm" id="sqc-btn-paste-clip-resume">
              ${icon('paste', 13)} Paste Text from Clipboard
            </button>
            ${(currentText || hasActiveFile) ? `
              <button type="button" class="sqc-btn sqc-btn-soft sqc-btn-sm" id="sqc-btn-modal-dl-file">
                ${icon('download', 13)} Download
              </button>
            ` : ''}
            ${existingTailored ? `
              <button type="button" class="sqc-btn sqc-btn-ghost sqc-btn-sm" id="sqc-btn-clear-tailored">
                ${icon('undo', 12)} Revert to Base
              </button>
            ` : ''}
          </div>
        </div>

        <div class="sqc-row-between">
          <span class="sqc-meta" style="font-weight:600; color:var(--sqc-text);">Parsed Text & Content (used for question answers & AI):</span>
          <span id="sqc-resume-char-count" class="sqc-meta">${countLabel(currentText)}</span>
        </div>
        <textarea id="sqc-resume-paste-textarea" class="sqc-textarea" style="height: 120px; min-height: 110px;" spellcheck="false" placeholder="Resume text will appear here automatically when file is uploaded, or paste raw text...">${escapeHtml(currentText)}</textarea>

        <div id="sqc-resume-skills-preview-container">${initialSkillsPreviewHtml}</div>
        <div id="sqc-resume-modal-status" class="sqc-status-msg"></div>
      `,
      footer: `
        <button class="sqc-btn sqc-btn-ghost" data-sqc-close id="sqc-resume-modal-cancel">Close</button>
        <span class="sqc-spacer"></span>
        <button class="sqc-btn sqc-btn-soft" id="sqc-btn-save-profile-resume" title="Save permanently as the candidate's base profile resume">Save as Base Default</button>
        <button class="sqc-btn sqc-btn-primary" id="sqc-resume-modal-apply">${icon('checkCircle', 14)} Attach & Continue Application</button>
      `
    });

    const dropzone = dlg.$('#sqc-resume-dropzone');
    const fileInput = dlg.$('#sqc-modal-resume-file');
    const textarea = dlg.$('#sqc-resume-paste-textarea');
    const charSpan = dlg.$('#sqc-resume-char-count');
    const statusDiv = dlg.$('#sqc-resume-modal-status');
    const skillsPreviewContainer = dlg.$('#sqc-resume-skills-preview-container');
    const activeFileBarContainer = dlg.$('#sqc-active-file-bar-container');
    const dropzoneTitle = dlg.$('#sqc-dropzone-title');
    const dropzoneDesc = dlg.$('#sqc-dropzone-desc');

    const updateLiveSkills = (val) => {
      if (charSpan) charSpan.textContent = countLabel(val);
      if (!skillsPreviewContainer) return;

      if (!val || val.length < 40) {
        skillsPreviewContainer.innerHTML = '';
        return;
      }

      if (typeof window !== 'undefined' && window.ResumeDocumentParser?.extractAndInferTechnicalSkills) {
        try {
          const s = window.ResumeDocumentParser.extractAndInferTechnicalSkills(val, val.toLowerCase());
          const kw = s.primaryStackKeywords || [];
          if (kw.length > 0) {
            skillsPreviewContainer.innerHTML = `
              <div class="sqc-skills-preview-box">
                <div class="sqc-skills-preview-title">✨ ${kw.length} Technical Skills Detected & Inferred:</div>
                <div class="sqc-skills-chips-flow">
                  ${kw.slice(0, 16).map(k => `<span class="sqc-skill-pill-sm">${escapeHtml(k)}</span>`).join('')}
                  ${kw.length > 16 ? `<span class="sqc-meta">+${kw.length - 16} more</span>` : ''}
                </div>
              </div>
            `;
            return;
          }
        } catch (_) {}
      }
      skillsPreviewContainer.innerHTML = '';
    };

    // Helper to process uploaded File (PDF, DOCX, TXT)
    const handleSelectedFile = async (file) => {
      if (!file) return;
      try {
        if (dropzoneTitle) dropzoneTitle.innerText = `⏳ Parsing ${file.name}...`;
        setStatus(statusDiv, 'pending', `Extracting text and technical skills from ${file.name}...`);

        let extractedText = '';
        if (window.ResumeDocumentParser?.extractTextFromFile) {
          extractedText = await window.ResumeDocumentParser.extractTextFromFile(file);
        } else {
          extractedText = await file.text();
        }

        if (!extractedText || extractedText.trim().length < 10) {
          setStatus(statusDiv, 'bad', `Could not extract readable text from ${file.name}. Please paste text directly.`);
          if (dropzoneTitle) dropzoneTitle.innerText = 'Drag & Drop Resume File (.pdf, .docx, .txt)';
          return;
        }

        // Resolve canonical filename to candidate profile's name alone (never append _tailored)
        const canonicalName = getCandidateCleanFileName(p, file.name);
        const resolvedFile = new File([file], canonicalName, {
          type: file.type || (canonicalName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf'),
          lastModified: file.lastModified || Date.now()
        });

        // Cache resolved file object & base64 representation
        activeTailoredFile = resolvedFile;
        try {
          const b64 = await fileToBase64(resolvedFile);
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('sqc_tailored_resume_file_b64', b64);
            sessionStorage.setItem('sqc_tailored_resume_filename', canonicalName);
            sessionStorage.setItem('sqc_tailored_resume_file_type', resolvedFile.type);
          }
        } catch (e) {
          console.warn("[SQC] File base64 caching notice:", e);
        }

        // Update textarea and live skills
        if (textarea) textarea.value = extractedText;
        updateLiveSkills(extractedText);

        // 1. Dynamic Skill Extraction & Inference
        let extractedSkills = null;
        if (extractedText && typeof window !== 'undefined' && window.ResumeDocumentParser?.extractAndInferTechnicalSkills) {
          try {
            extractedSkills = window.ResumeDocumentParser.extractAndInferTechnicalSkills(extractedText, extractedText.toLowerCase());
          } catch (e) {
            console.warn("[SQC] Skill extraction notice:", e);
          }
        }

        // Store in memory & session storage
        window.__SQC_TAILORED_RESUME_DATA = extractedSkills ? { ...extractedSkills, text: extractedText } : { text: extractedText };
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('sqc_tailored_resume', extractedText);
          if (extractedSkills) {
            sessionStorage.setItem('sqc_tailored_resume_data', JSON.stringify({ ...extractedSkills, text: extractedText }));
          }
        }

        // 2. Attach Real Binary File & Fill Textareas on Job Portal
        const attachRes = attachResumeToPortal(extractedText, p, resolvedFile);

        if (window.SubmissionCheckerCore) {
          window.SubmissionCheckerCore.runLiveCheck();
        }

        // Update UI state
        const dropzoneIcon = dlg.$('#sqc-dropzone-icon');
        if (dropzone) dropzone.classList.add('has-file');
        if (dropzoneIcon) dropzoneIcon.innerHTML = icon('checkCircle', 20);
        if (dropzoneTitle) dropzoneTitle.innerText = `✅ Ready: ${canonicalName} (${Math.round(resolvedFile.size / 1024)} KB)`;
        if (dropzoneDesc) dropzoneDesc.innerText = 'Attached to portal & context · You can go ahead with the application';

        const skillCount = extractedSkills?.primaryStackKeywords?.length || 0;
        setStatus(statusDiv, 'ok', `✅ Upload successful! ${skillCount} skills & resume attached to context.`);

        // Auto-close upload box with clear notification so applier can immediately continue
        setTimeout(() => {
          dlg.close();
          showToast(`✅ Upload successful! Resume "${canonicalName}" & ${skillCount} skills attached to context for autofill. You can go ahead with the application.`);
        }, 700);
      } catch (err) {
        console.error("[SQC] Error processing resume file:", err);
        setStatus(statusDiv, 'bad', `Error parsing ${file.name}: ${err.message || 'Format error'}`);
        if (dropzoneTitle) dropzoneTitle.innerText = 'Click to Upload or Drag & Drop Resume File (.pdf, .docx, .txt)';
      }
    };

    // Click and drag & drop event listeners
    if (dropzone) {
      dropzone.addEventListener('click', (e) => {
        // Prevent double trigger if paste, download, or revert button was clicked
        if (e.target.closest('#sqc-btn-paste-clip-resume, #sqc-btn-modal-dl-file, #sqc-btn-clear-tailored')) return;
        fileInput?.click();
      });

      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput?.click();
        }
      });

      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('is-dragover');
        });
      });
      ['dragleave', 'dragend'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('is-dragover');
        });
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('is-dragover');
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          handleSelectedFile(dt.files[0]);
        }
      });
    }

    dlg.$('#sqc-btn-browse-file')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput?.click();
    });

    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleSelectedFile(fileInput.files[0]);
      }
      fileInput.value = '';
    });

    textarea?.addEventListener('input', () => {
      updateLiveSkills(textarea.value);
    });

    dlg.$('#sqc-btn-paste-clip-resume')?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && textarea) {
          textarea.value = text;
          updateLiveSkills(text);
          setStatus(statusDiv, 'ok', 'Pasted resume text from clipboard.');
        }
      } catch (_) {
        setStatus(statusDiv, 'warn', 'Clipboard blocked — click the box and press Ctrl+V.');
        textarea?.focus();
      }
    });

    dlg.$('#sqc-btn-modal-dl-file')?.addEventListener('click', () => {
      const val = textarea?.value?.trim();
      downloadResumeFile(val, p);
    });

    dlg.$('#sqc-btn-clear-tailored')?.addEventListener('click', () => {
      sessionStorage.removeItem('sqc_tailored_resume');
      sessionStorage.removeItem('sqc_tailored_resume_data');
      sessionStorage.removeItem('sqc_tailored_resume_filename');
      sessionStorage.removeItem('sqc_tailored_resume_file_b64');
      sessionStorage.removeItem('sqc_tailored_resume_file_type');
      window.__SQC_TAILORED_RESUME_DATA = null;
      activeTailoredFile = null;
      showToast("🔄 Reverted to base profile resume.");
      dlg.close();
      if (window.SubmissionCheckerCore) {
        window.SubmissionCheckerCore.runLiveCheck();
      }
    });

    dlg.$('#sqc-btn-save-profile-resume')?.addEventListener('click', () => {
      const val = textarea?.value?.trim();
      if (!val) {
        setStatus(statusDiv, 'bad', 'Please enter or upload resume content to save.');
        return;
      }
      if (currentProfile) {
        const updated = { ...currentProfile, resumeText: val };
        chrome.runtime.sendMessage({ type: "SAVE_PROFILE", profile: updated }, (res) => {
          if (res && res.success) {
            setStatus(statusDiv, 'ok', 'Saved permanently as candidate base resume.');
            showToast("💾 Base resume saved permanently to profile.");
          }
        });
      }
    });

    dlg.$('#sqc-resume-modal-apply')?.addEventListener('click', () => {
      const val = textarea?.value?.trim() || '';
      if (!val && !activeTailoredFile) {
        setStatus(statusDiv, 'bad', 'Please upload a resume file or enter resume text.');
        return;
      }

      // 1. Dynamic Skill Extraction & Inference
      let extractedSkills = null;
      if (val && typeof window !== 'undefined' && window.ResumeDocumentParser?.extractAndInferTechnicalSkills) {
        try {
          extractedSkills = window.ResumeDocumentParser.extractAndInferTechnicalSkills(val, val.toLowerCase());
        } catch (e) {
          console.warn("[SQC] Skill extraction notice:", e);
        }
      }

      // Store in memory & session storage
      window.__SQC_TAILORED_RESUME_DATA = extractedSkills ? { ...extractedSkills, text: val } : { text: val };
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('sqc_tailored_resume', val);
        if (extractedSkills) {
          sessionStorage.setItem('sqc_tailored_resume_data', JSON.stringify({ ...extractedSkills, text: val }));
        }
      }

      // 2. Attach Real File & Fill Textareas on Job Portal
      const attachRes = attachResumeToPortal(val, currentProfile, activeTailoredFile);

      const skillCount = extractedSkills?.primaryStackKeywords?.length || 0;
      const canonicalName = attachRes.filename || getCandidateCleanFileName(currentProfile);

      showToast(`✅ Upload successful! Resume "${canonicalName}" and ${skillCount} skills attached to context for autofill. You can go ahead with the application.`);
      dlg.close();

      if (window.SubmissionCheckerCore) {
        window.SubmissionCheckerCore.runLiveCheck();
      }
    });
  }

  // Paste ChatGPT answers dialog
  function openAiPasteModal() {
    const dlg = openDialog({
      tone: 'ai',
      iconName: 'sparkles',
      title: 'Paste AI answers',
      subtitle: 'Drop in ChatGPT\'s reply and we\'ll map each answer to the right question.',
      width: 600,
      body: `
        <ol class="sqc-steps">
          <li><span>1</span>Copy prompt</li>
          <li><span>2</span>Ask ChatGPT</li>
          <li class="is-current"><span>3</span>Paste reply here</li>
        </ol>
        <div class="sqc-row-between">
          <span class="sqc-meta">JSON (<code>{ "answers": [...] }</code>) or “Question: Answer” lines</span>
          <button class="sqc-btn sqc-btn-soft sqc-btn-sm" id="sqc-ai-modal-paste-clip">${icon('paste', 13)}Paste from clipboard</button>
        </div>
        <textarea id="sqc-ai-paste-textarea" class="sqc-textarea" spellcheck="false" placeholder="Paste ChatGPT output here…"></textarea>
        <div id="sqc-ai-modal-status" class="sqc-status-msg"></div>
      `,
      footer: `
        <button class="sqc-btn sqc-btn-ghost" id="sqc-ai-modal-cancel" data-sqc-close>Cancel</button>
        <button class="sqc-btn sqc-btn-ai" id="sqc-ai-modal-submit">${icon('wand', 14)}Auto-fill answers</button>
      `
    });

    const textarea = dlg.$('#sqc-ai-paste-textarea');
    const statusDiv = dlg.$('#sqc-ai-modal-status');

    setTimeout(() => { if (textarea) textarea.focus(); }, 80);

    dlg.$('#sqc-ai-modal-paste-clip')?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim() && textarea) {
          textarea.value = text.trim();
          setStatus(statusDiv, 'ok', 'Pasted from clipboard. Click “Auto-fill answers” to populate the form.');
        } else {
          setStatus(statusDiv, 'warn', 'Clipboard is empty — copy the ChatGPT response first.');
        }
      } catch (err) {
        setStatus(statusDiv, 'warn', 'Click the box below and press Ctrl+V (or Cmd+V) to paste.');
        if (textarea) textarea.focus();
      }
    });

    dlg.$('#sqc-ai-modal-submit')?.addEventListener('click', async () => {
      let val = textarea?.value?.trim();

      // If empty, attempt one-click clipboard read
      if (!val) {
        try {
          const clipText = await navigator.clipboard.readText();
          if (clipText && clipText.trim()) {
            val = clipText.trim();
            if (textarea) textarea.value = val;
          }
        } catch (_) {}
      }

      if (!val) {
        setStatus(statusDiv, 'bad', 'Paste the ChatGPT output first (Ctrl+V or “Paste from clipboard”).');
        return;
      }

      const res = JobFormExtractor.applyParsedAnswers(val);
      if (res && res.success) {
        showToast(`🎉 Auto-filled ${res.count} question${res.count === 1 ? '' : 's'} from ChatGPT.`);
        dlg.close();
        if (window.SubmissionCheckerCore) {
          window.SubmissionCheckerCore.runLiveCheck();
        }
      } else {
        setStatus(statusDiv, 'bad', res?.error || 'Could not match the answers to any form fields.');
      }
    });
  }

  function cleanPayloadForView(extractedData, profile) {
    if (!extractedData) return {};
    return {
      applier_id: currentSettings?.applierId || "Applier",
      profile_assigned: profile ? profile.fullName : "Unassigned",
      portal_job_id: extractedData.portal_job_id || "",
      job_id: extractedData.portal_job_id || extractedData.req_id || "",
      extracted_data: {
        candidate_name: extractedData.candidate_name,
        candidate_first_name: extractedData.candidate_first_name,
        candidate_last_name: extractedData.candidate_last_name,
        email_entered: extractedData.email_entered,
        phone_entered: extractedData.phone_entered,
        job_title: extractedData.job_title,
        company: extractedData.company,
        req_id: extractedData.req_id,
        portal_job_id: extractedData.portal_job_id || "",
        ats_domain: extractedData.ats_domain,
        resume_uploaded: extractedData.resume_uploaded,
        salary_expected: extractedData.salary_expected,
        total_fields_count: extractedData.total_fields_count,
        required_fields_count: extractedData.required_fields_count,
        optional_fields_count: extractedData.optional_fields_count,
        required_unanswered_count: extractedData.required_unanswered_count,
        screenshots_count: currentScreenshots.length,
        screening_answers: extractedData.screening_answers,
        all_entries: extractedData.all_entries
      },
      screenshots: currentScreenshots.map(s => ({
        id: s.id,
        step_label: s.step_label,
        trigger: s.trigger,
        answered_count: s.answered_count,
        captured_at: s.captured_at,
        data_url: s.data_url ? `${s.data_url.slice(0, 48)}... (${Math.round(s.data_url.length / 1024)}KB)` : ''
      })),
      timestamp: new Date().toISOString()
    };
  }

  function promptTailoredResumeIfNeeded() {
    if (window !== window.top) return;
    const p = currentProfile || {};
    if (p.tailoringMode !== 'tailored') return;

    const hasTailored = Boolean(
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sqc_tailored_resume')) ||
      (typeof window !== 'undefined' && window.__SQC_TAILORED_RESUME_DATA)
    );
    if (hasTailored) return;

    const currentUrlKey = window.location.origin + window.location.pathname;
    const promptKey = 'sqc_tailor_prompted_' + currentUrlKey;
    if (sessionStorage.getItem(promptKey)) return;
    sessionStorage.setItem(promptKey, '1');

    setTimeout(() => {
      openResumeModal();
      showToast(`✨ Tailored Profile: Candidate "${p.fullName}" requires a tailored resume for this job.`);
    }, 700);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    init,
    destroy,
    getActiveProfile,
    updateState,
    updateApplyFlowInfo,
    setQuickApplyStatus,
    updateScreenshots,
    showToast,
    showVerificationBanner,
    hideVerificationBanner,
    updateDrawer,
    setAlreadyApplied,
    clearAlreadyApplied,
    updateFieldHighlights,
    showBlockingModal,
    removeBlockingModal,
    toggleDrawer,
    openResumeModal,
    promptTailoredResumeIfNeeded,
    attachResumeToPortal,
    downloadResumeFile,
    base64ToFile
  };
})();
