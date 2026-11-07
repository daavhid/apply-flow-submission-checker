/**
 * Master Content Script - Live Form Tracker & Capture-Phase Submit Interceptor
 */

window.SubmissionCheckerCore = (function () {
  'use strict';

  let activeProfile = null;
  let currentSettings = null;
  let allProfiles = [];
  let currentValidation = { isValid: true, errors: [], warnings: [], fieldErrorMap: new Map() };
  let currentExtractedData = null;
  let currentDuplicateRecord = null;
  let lastIframeExtractedData = null;
  let isSubmittingProgrammatically = false;
  let debounceTimer = null;
  let sessionScreenshots = [];
  let screenshotDebounceTimer = null;
  let lastCapturedSignature = '';
  let isCapturingScreenshot = false;

  // Global initialization guard to prevent duplicate executions in the same frame
  if (window.__SQC_INITIALIZED) {
    return window.SubmissionCheckerCore || {};
  }
  window.__SQC_INITIALIZED = true;

  let isCoreActive = false;
  let isRouteWatcherBound = false;

  function bindRouteWatcher() {
    if (isRouteWatcherBound) return;
    isRouteWatcherBound = true;

    const handleRouteTransition = () => {
      const isEligible = window.JobFormExtractor ? window.JobFormExtractor.isJobApplicationPortal() : false;
      if (!isEligible) {
        if (window.JobFormExtractor) window.JobFormExtractor.cleanupNonJobSession();
        if (window.SubmissionHUD) window.SubmissionHUD.destroy();
        isCoreActive = false;
        return;
      }

      // If page is now an eligible job portal but checker was not active, initialize it
      if (!isCoreActive) {
        init();
        return;
      }

      setTimeout(() => {
        tryAutoRestore();
        runExtractionAndValidation();
      }, 200);
      setTimeout(() => {
        tryAutoRestore();
        runExtractionAndValidation();
        if (window.SubmissionHUD && window.SubmissionHUD.promptTailoredResumeIfNeeded) {
          window.SubmissionHUD.promptTailoredResumeIfNeeded();
        }
      }, 800);
    };

    window.addEventListener('popstate', handleRouteTransition);
    window.addEventListener('hashchange', handleRouteTransition);

    const origPush = history.pushState;
    history.pushState = function () {
      try { capturePreTransitionSnapshot(); } catch (_) {}
      origPush.apply(this, arguments);
      handleRouteTransition();
    };
    const origReplace = history.replaceState;
    history.replaceState = function () {
      try { capturePreTransitionSnapshot(); } catch (_) {}
      origReplace.apply(this, arguments);
      handleRouteTransition();
    };
  }

  async function init() {
    try {
      bindRouteWatcher();

      // Don't inject or run on the backend dashboard command center itself
      if (window.location.hostname === 'localhost' && (window.location.pathname === '/' || window.location.pathname === '/index.html')) {
        return;
      }

      // Strict Gate: Only activate on genuine ATS portals or pages with ApplyFlow tracking parameters
      const isEligible = window.JobFormExtractor ? window.JobFormExtractor.isJobApplicationPortal() : false;
      if (!isEligible) {
        if (window.JobFormExtractor) window.JobFormExtractor.cleanupNonJobSession();
        if (window.SubmissionHUD) window.SubmissionHUD.destroy();
        isCoreActive = false;
        return;
      }

      isCoreActive = true;
      await fetchConfig();

      // Check bound tab session right away to restore already applied state before any async calls
      try {
        const rawBound = sessionStorage.getItem('applyflow_bound_session');
        if (rawBound) {
          const bs = JSON.parse(rawBound);
          const currentCanon = window.JobFormExtractor?.getCanonicalJobPath ? window.JobFormExtractor.getCanonicalJobPath(window.location.href) : '';
          const isMatch = Boolean(
            (bs.canonicalPath && currentCanon && (bs.canonicalPath === currentCanon || currentCanon.startsWith(bs.canonicalPath) || bs.canonicalPath.startsWith(currentCanon))) ||
            (bs.jobId && window.location.href.includes(bs.jobId))
          );
          if (isMatch && bs && (bs.status === 'APPLIED' || bs.status === 'SUBMITTED' || bs.status === 'ALREADY_APPLIED')) {
            currentDuplicateRecord = {
              appliedAt: bs.appliedAt || new Date().toISOString(),
              status: bs.status,
              profile_assigned: bs.profileName || activeProfile?.fullName,
              applier_id: bs.applierId,
              message: `Candidate was already applied in Apply-Flow on ${bs.appliedAt ? new Date(bs.appliedAt).toLocaleDateString() : 'earlier date'}.`
            };
            currentValidation.isAlreadyApplied = true;
            currentValidation.errors = (currentValidation.errors || []).filter(
              e => e.rule !== 'REQUIRED_FIELD_UNANSWERED' && e.rule !== 'RESUME_MISSING'
            );
            currentValidation.isValid = currentValidation.errors.length === 0;
            SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, currentDuplicateRecord);
            if (typeof SubmissionHUD.setAlreadyApplied === 'function') {
              SubmissionHUD.setAlreadyApplied(currentDuplicateRecord);
            }
            restrictPortalInteractions(true, currentDuplicateRecord);
          } else if (!isMatch) {
            // Stale session from a previous job in this tab — clean it up!
            sessionStorage.removeItem('applyflow_bound_session');
            sessionStorage.removeItem('applyflow_job_id');
            sessionStorage.removeItem('applyflow_profile_id');
            sessionStorage.removeItem('applyflow_profile_name');
            sessionStorage.removeItem('applyflow_applier_id');
            sessionStorage.removeItem('applyflow_job_title');
            sessionStorage.removeItem('applyflow_company');
            sessionStorage.removeItem('applyflow_req_id');
            currentDuplicateRecord = null;
            currentValidation.isAlreadyApplied = false;
            restrictPortalInteractions(false);
          }
        }
      } catch (_) {}

      // Attempt automated form restoration once on initial load
      tryAutoRestore();

      // Cross-frame message handling: coordinates top window and child iframes seamlessly
      window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;

        // CHILD IFRAME: Received instructions or sync from Top Window
        if (window !== window.top) {
          if (event.data.type === 'SQC_SYNC_CONFIG') {
            if (event.data.activeProfile) {
              activeProfile = event.data.activeProfile;
              window.__SQC_ACTIVE_PROFILE = activeProfile;
            }
            if (event.data.currentSettings) currentSettings = event.data.currentSettings;
            if (event.data.allProfiles) allProfiles = event.data.allProfiles;
            if (event.data.persistedSession) window.__SQC_PERSISTED_AF_SESSION = event.data.persistedSession;
            if (event.data.applyFlowContext) {
              applyFlowContext = event.data.applyFlowContext;
              window.__SQC_APPLYFLOW_CONTEXT = applyFlowContext;
            }
            runExtractionAndValidation();
          } else if (event.data.type === 'SQC_RESTORE_FORM_TRIGGER') {
            if (event.data.profile) {
              activeProfile = event.data.profile;
              window.__SQC_ACTIVE_PROFILE = activeProfile;
            }
            if (event.data.settings) currentSettings = event.data.settings;
            try {
              const res = JobFormExtractor.restoreSavedForm(activeProfile, currentSettings);
              runExtractionAndValidation();
              try {
                window.top?.postMessage({
                  type: 'SQC_RESTORE_FORM_RESULT',
                  count: res?.count || 0
                }, '*');
              } catch (_) {}
            } catch (_) {}
          } else if (event.data.type === 'SQC_TRIGGER_EXTRACTION') {
            runExtractionAndValidation();
          }
          return;
        }

        // TOP WINDOW: Orchestrates HUD and merges data extracted inside child iframes
        if (window === window.top) {
          if (event.data.type === 'SQC_IFRAME_EXTRACTED_DATA') {
            const iframeData = event.data.data;
            if (iframeData && iframeData.total_fields_count > 0) {
              lastIframeExtractedData = iframeData;
              const currentCount = currentExtractedData?.total_fields_count || 0;
              // If iframe has more fields or current top window is an empty wrapper
              if (iframeData.total_fields_count >= currentCount || currentCount === 0) {
                currentExtractedData = iframeData;
                currentValidation = JobFormValidator.validate(currentExtractedData, activeProfile, currentSettings);
                SubmissionHUD.updateDrawer(currentExtractedData, currentValidation);
                SubmissionHUD.updateApplyFlowInfo(JobFormExtractor.extractApplyFlowParams(), applyFlowContext);
              }
            }
            // Send current activeProfile and settings back to child iframe
            try {
              event.source?.postMessage({
                type: 'SQC_SYNC_CONFIG',
                activeProfile,
                currentSettings,
                allProfiles,
                persistedSession: window.__SQC_PERSISTED_AF_SESSION,
                applyFlowContext
              }, '*');
            } catch (_) {}
          } else if (event.data.type === 'SQC_RESTORE_FORM_RESULT') {
            const count = event.data.count || 0;
            if (count > 0) {
              SubmissionHUD.showToast(`✨ Filled ${count} field${count === 1 ? '' : 's'} in application form!`);
              runExtractionAndValidation();
            }
          } else if (event.data.type === 'SQC_REQUEST_CONFIG') {
            try {
              event.source?.postMessage({
                type: 'SQC_SYNC_CONFIG',
                activeProfile,
                currentSettings,
                allProfiles,
                persistedSession: window.__SQC_PERSISTED_AF_SESSION,
                applyFlowContext
              }, '*');
            } catch (_) {}
          } else if (event.data.type === 'SQC_SHOW_TOAST') {
            SubmissionHUD.showToast(event.data.message);
          } else if (event.data.type === 'SQC_SHOW_BLOCKING_MODAL') {
            SubmissionHUD.showBlockingModal(event.data.validation, event.data.extractedData, event.data.reason);
          } else if (event.data.type === 'SQC_ATTACH_RESUME_TO_PORTAL') {
            const { filename, mimeType, base64, resumeText, profile } = event.data;
            if (window.SubmissionHUD?.attachResumeToPortal && window.SubmissionHUD?.base64ToFile) {
              const file = window.SubmissionHUD.base64ToFile(base64, filename);
              const res = window.SubmissionHUD.attachResumeToPortal(resumeText, profile || activeProfile, file);
              if (res && (res.fileInputsCount > 0 || res.triggerActivated)) {
                try {
                  window.top?.postMessage({
                    type: 'SQC_RESUME_ATTACH_SUCCESS',
                    filename,
                    count: res.fileInputsCount,
                    triggerActivated: res.triggerActivated
                  }, '*');
                } catch (_) {}
              }
            }
          } else if (event.data.type === 'SQC_RESUME_ATTACH_SUCCESS') {
            if (window === window.top) {
              SubmissionHUD.showToast(`🎉 Attached resume "${event.data.filename}" to portal form!`);
              runExtractionAndValidation();
            }
          }
        }
      });

      // If running inside a child frame, ask top window for the active candidate profile & config
      if (window !== window.top) {
        try {
          window.top.postMessage({ type: 'SQC_REQUEST_CONFIG' }, '*');
        } catch (_) {}
      }

      // Run initial field extraction and staggered passes for dynamic SPA forms (Jobvite, Workday, Paylocity, etc.)
      runExtractionAndValidation();
      setTimeout(() => { runExtractionAndValidation(); }, 400);
      setTimeout(() => {
        runExtractionAndValidation();
        if (window.SubmissionHUD && window.SubmissionHUD.promptTailoredResumeIfNeeded) {
          window.SubmissionHUD.promptTailoredResumeIfNeeded();
        }
      }, 1200);
      setTimeout(() => { runExtractionAndValidation(); }, 2500);

      // MutationObserver to catch dynamically rendered form wizard steps AND confirmation/success states
      let domObserverTimeout = null;
      const spaObserver = new MutationObserver((mutations) => {
        const hasRelevantNodes = mutations.some(m => {
          if (m.target && m.target.closest && m.target.closest('#sqc-hud-container, #sqc-modal-overlay')) return false;
          if (m.removedNodes.length > 0) return true;
          return Array.from(m.addedNodes).some(n => 
            n.nodeType === 1 && (
              n.matches?.('input, select, textarea, form, [role="combobox"], [class*="success"], [class*="confirm"], [class*="applied"], h1, h2, h3') ||
              n.querySelector?.('input, select, textarea, [class*="success"], [class*="confirm"], [class*="applied"]')
            )
          );
        });
        if (hasRelevantNodes) {
          clearTimeout(domObserverTimeout);
          domObserverTimeout = setTimeout(() => {
            runExtractionAndValidation();
          }, 300);
        }
      });
      spaObserver.observe(document.body, { childList: true, subtree: true });

      // Listen for all input/paste/change events across the entire page
      bindLiveFormTracking();

      // Bind capture-phase submit interception & Quick Apply watcher
      bindSubmitInterception();

      // Bind outbound link and redirect parameter preservation
      bindOutboundRedirectTracking();

      // Listen for state changes from popup/options or background
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === "STATE_UPDATED") {
          fetchConfig().then(() => {
            hasAlertedContextMismatch = false;
            duplicateCheckedUrl = null;
            loggedAlreadyAppliedJobKey = null;
            currentExtractedData = null;
            currentValidation = { isValid: true, errors: [], warnings: [], fieldErrorMap: new Map() };
            if (window.SubmissionHUD) {
              window.SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings);
            }
            // Purge any stale session storage keys from other candidate profiles
            try {
              for (let i = sessionStorage.length - 1; i >= 0; i--) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith('sqc_app_') && activeProfile && !k.startsWith(`sqc_app_${activeProfile.id}_`)) {
                  sessionStorage.removeItem(k);
                }
              }
            } catch (_) {}
            tryAutoRestore();
            runExtractionAndValidation();
          });
        } else if (msg.type === "RESTORE_FORM") {
          const res = restoreFormManually();
          sendResponse({ success: true, count: res?.count || 0 });
        }
      });
    } catch (err) {
      console.warn("[Submission Checker] Initialization notice:", err);
    }
  }

  let lastHighlightedCaptcha = null;
  function highlightCaptchaChallenge(captchaInfo) {
    if (lastHighlightedCaptcha && (!captchaInfo || !captchaInfo.has_captcha || lastHighlightedCaptcha !== captchaInfo.element)) {
      try {
        lastHighlightedCaptcha.classList.remove('sqc-captcha-highlight');
      } catch (_) {}
      lastHighlightedCaptcha = null;
    }

    if (currentSettings?.detectCaptchaAndAlert !== false && captchaInfo?.has_captcha && captchaInfo?.element) {
      try {
        captchaInfo.element.classList.add('sqc-captcha-highlight');
        lastHighlightedCaptcha = captchaInfo.element;
      } catch (_) {}
    }
  }

  function hasContextMismatchCheck() {
    const af = JobFormExtractor?.extractApplyFlowParams?.() || {};
    const targetName = (af.profileName || sessionStorage.getItem('applyflow_profile_name') || '').trim();
    const targetId = (af.profileId || sessionStorage.getItem('applyflow_profile_id') || '').trim();
    if (!targetName && !targetId) return false;
    if (!activeProfile) return true;

    const idMatch = Boolean(targetId && activeProfile.id && String(targetId).toLowerCase() === String(activeProfile.id).toLowerCase());
    let nameMatch = false;
    if (targetName) {
      const tLower = targetName.toLowerCase();
      const validNames = [
        activeProfile.fullName,
        activeProfile.legalName,
        activeProfile.preferredName,
        activeProfile.firstName && activeProfile.lastName ? `${activeProfile.firstName} ${activeProfile.lastName}` : null,
        ...(activeProfile.nameAliases || [])
      ].filter(Boolean).map(n => n.toLowerCase());
      nameMatch = validNames.some(vn => vn === tLower || vn.includes(tLower) || tLower.includes(vn));
    }
    return !idMatch && !nameMatch;
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

  // ── Portal Interaction Lock Barrier for Already-Applied Jobs ──
  let portalLockClickBlocker = null;

  function restrictPortalInteractions(isLocked, record = null) {
    const existingBanner = document.getElementById('sqc-portal-lock-banner');

    if (!isLocked) {
      if (existingBanner) existingBanner.remove();
      if (portalLockClickBlocker) {
        window.removeEventListener('click', portalLockClickBlocker, true);
        window.removeEventListener('keydown', portalLockClickBlocker, true);
        portalLockClickBlocker = null;
      }
      document.querySelectorAll('[data-sqc-locked="1"]').forEach(el => {
        el.removeAttribute('data-sqc-locked');
      });
      return;
    }

    // A. Inject Sticky Lock Banner across the top of page/portal if not already present
    if (!existingBanner) {
      const banner = document.createElement('div');
      banner.id = 'sqc-portal-lock-banner';
      banner.className = 'sqc-portal-lock-banner';

      const candName = record?.profile_assigned || record?.candidate?.profile_name || activeProfile?.fullName || 'this candidate';
      const appliedDate = record?.appliedAt ? new Date(record.appliedAt).toLocaleDateString() : '';
      const byUser = record?.applier_id || record?.candidate?.assigned_applier || '';
      const bannerDesc = record?.message || `Candidate ${candName} was already submitted to this job in Apply-Flow${appliedDate ? ` on ${appliedDate}` : ''}${byUser ? ` by ${byUser}` : ''}. Portal fields are locked to prevent duplicate submissions.`;

      banner.innerHTML = `
        <div class="sqc-lock-banner-left">
          <div class="sqc-lock-banner-icon">🔒</div>
          <div class="sqc-lock-banner-body">
            <div class="sqc-lock-banner-title">Job Already Applied · Form Locked</div>
            <div class="sqc-lock-banner-desc">${escapeHtml(bannerDesc)}</div>
          </div>
        </div>
        <div class="sqc-lock-banner-actions">
          <button type="button" class="sqc-lock-unlock-btn" id="sqc-btn-portal-manual-unlock">Manual Unlock</button>
        </div>
      `;

      try {
        if (document.body) {
          document.body.prepend(banner);
        } else {
          document.documentElement.prepend(banner);
        }
      } catch (_) {}

      const unlockBtn = banner.querySelector('#sqc-btn-portal-manual-unlock');
      if (unlockBtn) {
        unlockBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          restrictPortalInteractions(false);
          SubmissionHUD.showToast('🔓 Portal fields unlocked. Proceed with caution.');
        });
      }
    }

    // B. Find portal form inputs and submit buttons to lock
    try {
      const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select, [contenteditable="true"]');
      inputs.forEach(el => {
        if (el.closest('#sqc-hud-container, #sqc-modal-overlay, #sqc-portal-lock-banner')) return;
        el.setAttribute('data-sqc-locked', '1');
      });

      const buttons = document.querySelectorAll('button, input[type="submit"], [role="button"]');
      buttons.forEach(el => {
        if (el.closest('#sqc-hud-container, #sqc-modal-overlay, #sqc-portal-lock-banner')) return;
        const text = (el.innerText || el.value || '').toLowerCase();
        if (/apply|submit|send|finish|complete/i.test(text) || el.type === 'submit') {
          el.setAttribute('data-sqc-locked', '1');
        }
      });
    } catch (_) {}

    // C. Capture-phase blocker prevents clicks and keyboard entry into locked fields
    if (!portalLockClickBlocker) {
      portalLockClickBlocker = (e) => {
        const target = e.target;
        if (!target) return;
        if (target.closest && target.closest('#sqc-hud-container, #sqc-modal-overlay, #sqc-portal-lock-banner')) return;

        if (target.getAttribute?.('data-sqc-locked') === '1' || target.closest?.('[data-sqc-locked="1"]')) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          SubmissionHUD.showToast('🔒 Portal is locked: Candidate was already applied to this position in Apply-Flow.');
        }
      };
      window.addEventListener('click', portalLockClickBlocker, true);
      window.addEventListener('keydown', portalLockClickBlocker, true);
    }
  }

  function isJobAlreadyApplied() {
    let boundApplied = false;
    try {
      const bs = JSON.parse(sessionStorage.getItem('applyflow_bound_session') || '{}');
      const currentCanon = window.JobFormExtractor?.getCanonicalJobPath ? window.JobFormExtractor.getCanonicalJobPath(window.location.href) : '';
      const isMatch = Boolean(
        (bs.canonicalPath && currentCanon && (bs.canonicalPath === currentCanon || currentCanon.startsWith(bs.canonicalPath) || bs.canonicalPath.startsWith(currentCanon))) ||
        (bs.jobId && window.location.href.includes(bs.jobId))
      );
      if (isMatch && (bs.status === 'APPLIED' || bs.status === 'SUBMITTED' || bs.status === 'ALREADY_APPLIED')) {
        boundApplied = true;
      }
    } catch (_) {}

    return Boolean(
      boundApplied ||
      currentDuplicateRecord ||
      window.__SQC_APPLYFLOW_CONTEXT?.currentStatus === 'APPLIED' ||
      window.__SQC_APPLYFLOW_CONTEXT?.jobProfile?.status === 'APPLIED' ||
      window.__SQC_APPLYFLOW_CONTEXT?.status === 'APPLIED'
    );
  }

  function tryAutoRestore() {
    if (!activeProfile) return;
    if (hasContextMismatchCheck()) {
      console.warn("[Submission Checker] Auto-restore aborted: Context profile mismatch between URL and active workstation candidate.");
      return;
    }
    if (isJobAlreadyApplied()) {
      console.log("[Submission Checker] Auto-restore suppressed: Job is already applied in Apply-Flow.");
      return;
    }
    if (currentSettings && currentSettings.autoAutofillOnPageLoad === false) {
      return; // Respect user preference to disable automatic form filling on page load
    }
    try {
      const res = JobFormExtractor.restoreSavedForm(activeProfile, currentSettings);
      if (res && res.count > 0) {
        console.log(`[Submission Checker] Restored ${res.count} form fields from saved session / candidate profile.`);
      }
    } catch (err) {
      console.warn("[Submission Checker] Auto-restore notice:", err);
    }
  }

  function restoreFormManually() {
    let res = { count: 0 };
    if (hasContextMismatchCheck() || (currentValidation?.errors || []).some(e => e.rule === 'CONTEXT_PROFILE_MISMATCH')) {
      SubmissionHUD.showToast("🚫 Autofill blocked: Active profile does not match the candidate assigned to this job in Apply-Flow.");
      SubmissionHUD.toggleDrawer(true);
      return res;
    }
    if (isJobAlreadyApplied()) {
      SubmissionHUD.showToast(`🛡️ This job is already marked as APPLIED in Apply-Flow for ${activeProfile.fullName}. Autofill is suppressed to prevent duplicate submission.`);
      return res;
    }
    if (activeProfile) {
      res = JobFormExtractor.restoreSavedForm(activeProfile, currentSettings);
    }
    // Also broadcast restore trigger to any child iframes
    try {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(f => {
        f.contentWindow?.postMessage({
          type: 'SQC_RESTORE_FORM_TRIGGER',
          profile: activeProfile,
          settings: currentSettings
        }, '*');
      });
    } catch (_) {}
    runExtractionAndValidation();
    return res;
  }

  function checkFastAppliedFromStorage(appliedJobs) {
    if (!appliedJobs || typeof appliedJobs !== 'object') return;
    const currentUrl = window.location.href.split('?')[0].split('#')[0].toLowerCase()
      .replace(/\/(confirmation|confirm|thank-you|thanks|submitted|success|step\d+|form|review|apply)\b.*$/i, '')
      .replace(/\/[a-z]{2}(?:-[a-zA-Z]{2})?\//i, '/')
      .replace(/\/$/, '');
    
    const slugMatch = window.location.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const atsSlug = slugMatch ? slugMatch[0].toLowerCase() : '';
    const afParams = window.JobFormExtractor ? window.JobFormExtractor.extractApplyFlowParams() : {};
    const effectiveJobId = afParams.jobId || currentExtractedData?.portal_job_id || currentExtractedData?.req_id || '';

    const rec = (currentUrl && appliedJobs[currentUrl]) ||
                (atsSlug && appliedJobs[atsSlug]) ||
                (effectiveJobId && appliedJobs[effectiveJobId]);

    if (rec) {
      currentDuplicateRecord = rec;
      restrictPortalInteractions(true, rec);
      currentValidation.isAlreadyApplied = true;
      currentValidation.errors = (currentValidation.errors || []).filter(
        e => {
          const s = String(e.rule || '').toUpperCase();
          return !s.includes('REQUIRED') && !s.includes('EMPTY') && !s.includes('MISSING') && !s.includes('RESUME') && !s.includes('UNANSWERED') && !s.includes('FILE');
        }
      );
      currentValidation.isValid = currentValidation.errors.length === 0;

      if (!applyFlowContext) applyFlowContext = {};
      applyFlowContext.currentStatus = "APPLIED";
      applyFlowContext.status = "APPLIED";
      applyFlowContext.appliedAt = rec.appliedAt;

      SubmissionHUD.updateApplyFlowInfo(afParams, applyFlowContext);
      SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, currentDuplicateRecord);
      if (typeof SubmissionHUD.setAlreadyApplied === 'function') {
        SubmissionHUD.setAlreadyApplied(currentDuplicateRecord);
      }
      if (typeof SubmissionHUD.showVerificationBanner === 'function') {
        SubmissionHUD.showVerificationBanner({
          status: 'applied',
          candidateName: activeProfile?.fullName || rec.profile_assigned,
          appliedAt: rec.appliedAt,
          appliedBy: rec.applier_id,
          message: rec.message
        });
      }
      SubmissionHUD.updateDrawer(currentExtractedData, currentValidation);
    }
  }

  async function fetchConfig() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_CONFIG" }, (res) => {
        if (res && res.success) {
          activeProfile = res.activeProfile;
          window.__SQC_ACTIVE_PROFILE = activeProfile;
          currentSettings = res.settings;
          allProfiles = res.profiles || [];
          if (res.persistedSession) {
            const currentCanon = window.JobFormExtractor?.getCanonicalJobPath ? window.JobFormExtractor.getCanonicalJobPath(window.location.href) : '';
            const psCanon = res.persistedSession.sourceUrl && window.JobFormExtractor?.getCanonicalJobPath ? window.JobFormExtractor.getCanonicalJobPath(res.persistedSession.sourceUrl) : '';
            const isMatch = Boolean(
              (psCanon && currentCanon && (psCanon === currentCanon || currentCanon.startsWith(psCanon) || psCanon.startsWith(currentCanon))) ||
              (res.persistedSession.jobId && window.location.href.includes(res.persistedSession.jobId))
            );

            if (isMatch) {
              window.__SQC_PERSISTED_AF_SESSION = res.persistedSession;
              // Hydrate sessionStorage from persisted tab session if current page stripped params/context across a multi-page redirect
              try {
                const ps = res.persistedSession;
                if (ps.jobId && !sessionStorage.getItem('applyflow_job_id')) sessionStorage.setItem('applyflow_job_id', ps.jobId);
                if (ps.profileId && !sessionStorage.getItem('applyflow_profile_id')) sessionStorage.setItem('applyflow_profile_id', ps.profileId);
                if (ps.profileName && !sessionStorage.getItem('applyflow_profile_name')) sessionStorage.setItem('applyflow_profile_name', ps.profileName);
                if (ps.applierId && !sessionStorage.getItem('applyflow_applier_id')) sessionStorage.setItem('applyflow_applier_id', ps.applierId);
                if (ps.jobTitle && ps.jobTitle !== 'Application Role' && !sessionStorage.getItem('applyflow_job_title')) {
                  sessionStorage.setItem('applyflow_job_title', ps.jobTitle);
                }
                if (ps.company && ps.company !== 'Employer' && !sessionStorage.getItem('applyflow_company')) {
                  sessionStorage.setItem('applyflow_company', ps.company);
                }
                if (ps.reqId && !sessionStorage.getItem('applyflow_req_id')) {
                  sessionStorage.setItem('applyflow_req_id', ps.reqId);
                }
                if (ps.sourceUrl && !sessionStorage.getItem('applyflow_original_job_url')) {
                  sessionStorage.setItem('applyflow_original_job_url', ps.sourceUrl);
                }
                if (ps.jdSalary && ps.jdSalary.has_jd_salary && !sessionStorage.getItem('applyflow_jd_salary')) {
                  sessionStorage.setItem('applyflow_jd_salary', JSON.stringify(ps.jdSalary));
                }
                if (ps.jdText && !sessionStorage.getItem('applyflow_jd_text')) {
                  sessionStorage.setItem('applyflow_jd_text', ps.jdText);
                }
                if (Array.isArray(ps.screenshots) && ps.screenshots.length > 0) {
                  sessionScreenshots = ps.screenshots;
                }
              } catch (_) {}
            }
          }
          if (res.appliedJobs) {
            checkFastAppliedFromStorage(res.appliedJobs);
          }
          SubmissionHUD.init(allProfiles, activeProfile, currentSettings);
          if (SubmissionHUD.updateScreenshots) {
            SubmissionHUD.updateScreenshots(sessionScreenshots);
          }
        }
        resolve();
      });
    });
  }

  let duplicateCheckedUrl = null;
  let loggedAlreadyAppliedUrl = null;
  let applyFlowContext = null;
  let contextFetchedKey = null;

  // Snapshot the current job context and cumulative form state before the page/DOM changes state or navigates
  function capturePreTransitionSnapshot() {
    try {
      if (window.JobFormExtractor) {
        currentExtractedData = window.JobFormExtractor.extractAllFields();
      }
      const applyFlowParams = window.JobFormExtractor ? window.JobFormExtractor.extractApplyFlowParams() : {};
      const effectiveJobId = applyFlowParams.jobId || sessionStorage.getItem('applyflow_job_id') || window.__SQC_PERSISTED_AF_SESSION?.jobId || currentExtractedData?.portal_job_id || '';
      const effectiveProfileId = applyFlowParams.profileId || sessionStorage.getItem('applyflow_profile_id') || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || '';
      const effectiveProfileName = applyFlowParams.profileName || sessionStorage.getItem('applyflow_profile_name') || window.__SQC_PERSISTED_AF_SESSION?.profileName || activeProfile?.fullName || '';
      const effectiveApplierId = applyFlowParams.applierId || sessionStorage.getItem('applyflow_applier_id') || window.__SQC_PERSISTED_AF_SESSION?.applierId || currentSettings?.applierId || '';

      const jobTitle = currentExtractedData?.job_title || sessionStorage.getItem('applyflow_job_title') || '';
      const company = currentExtractedData?.company || sessionStorage.getItem('applyflow_company') || '';
      const reqId = currentExtractedData?.req_id || sessionStorage.getItem('applyflow_req_id') || '';
      const origUrl = sessionStorage.getItem('applyflow_original_job_url') || currentExtractedData?.job_url || window.location.href;
      const jdSalary = currentExtractedData?.jd_salary || null;
      const jdText = currentExtractedData?.jd_text || sessionStorage.getItem('applyflow_jd_text') || '';

      let savedFormState = null;
      if (currentExtractedData) {
        const serializableEntries = (currentExtractedData.all_entries || []).map(({ element, ...rest }) => rest);
        savedFormState = {
          candidate_id: effectiveProfileId,
          candidate_first_name: currentExtractedData.candidate_first_name || '',
          candidate_last_name: currentExtractedData.candidate_last_name || '',
          candidate_name: currentExtractedData.candidate_name || '',
          email_entered: currentExtractedData.email_entered || '',
          phone_entered: currentExtractedData.phone_entered || '',
          salary_expected: currentExtractedData.salary_expected || '',
          salary_numeric: currentExtractedData.salary_numeric ?? null,
          resume_uploaded: currentExtractedData.resume_uploaded || '',
          resume_size: currentExtractedData.resume_size ?? null,
          total_fields_count: currentExtractedData.total_fields_count || 0,
          required_fields_count: currentExtractedData.required_fields_count || 0,
          optional_fields_count: currentExtractedData.optional_fields_count || 0,
          required_unanswered_count: currentExtractedData.required_unanswered_count || 0,
          all_entries: serializableEntries,
          screening_answers: currentExtractedData.screening_answers || {},
          job_title: jobTitle,
          company: company,
          req_id: reqId,
          portal_job_id: effectiveJobId,
          job_url: origUrl,
          jd_salary: jdSalary,
          jd_text: jdText
        };
      }

      const sessionPayload = {
        jobId: effectiveJobId,
        profileId: effectiveProfileId,
        profileName: effectiveProfileName,
        applierId: effectiveApplierId,
        jobTitle,
        company,
        reqId,
        jdSalary,
        jdText,
        savedFormState,
        sourceUrl: origUrl,
        timestamp: Date.now()
      };

      window.__SQC_PERSISTED_AF_SESSION = {
        ...(window.__SQC_PERSISTED_AF_SESSION || {}),
        ...sessionPayload
      };

      chrome.runtime.sendMessage({
        type: "PERSIST_REDIRECT_TRACKING",
        data: sessionPayload
      }, () => { if (chrome.runtime.lastError) {} });
    } catch (_) {}
  }

  // Detect human-readable label for the current wizard step or form section
  function detectCurrentStepLabel() {
    try {
      // 1. Check active wizard step indicators
      const activeStep = document.querySelector(
        '.wizard-step.active, [aria-current="step"], [data-automation-id*="progressBarActiveStep"], .step-item.active, .stepper-item.active, [data-step-active="true"]'
      );
      if (activeStep) {
        const text = (activeStep.innerText || activeStep.textContent || '').replace(/\s+/g, ' ').trim();
        if (text && text.length <= 65) return text;
      }

      // 2. Check visible section or wizard headings
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, [data-automation-id="pageHeaderTitle"]'))
        .filter(el => !el.closest('#sqc-hud-container, #sqc-modal-overlay') && el.offsetParent !== null);
      for (const h of headings) {
        const t = (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim();
        if (/^(step\s*\d+|my information|personal information|my experience|work experience|application questions|screening questions|voluntary disclosures|self.?identification|review|review & submit|confirmation|thank you)/i.test(t)) {
          return t.slice(0, 65);
        }
      }

      // 3. Check scroll position bucket for long single-page forms
      const scrollY = Math.round(window.scrollY || document.documentElement.scrollTop || 0);
      const vh = Math.max(window.innerHeight || 800, 500);
      const sectionNum = Math.floor(scrollY / Math.round(vh * 0.75)) + 1;
      return sectionNum > 1 ? `Application Form (Section ${sectionNum})` : 'Application Form (Step 1)';
    } catch (_) {
      return 'Application Form';
    }
  }

  // Downscale high-DPI screenshots to <= 1280px width JPEG for fast webhook transport
  function downscaleScreenshotDataUrl(dataUrl, maxWidth = 1280, quality = 0.68) {
    return new Promise((resolve) => {
      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          if (img.width <= maxWidth && dataUrl.length < 180000) {
            resolve(dataUrl);
            return;
          }
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (_) {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Fallback visual form canvas renderer when chrome.tabs.captureVisibleTab is unavailable (e.g. standalone test bench or backgrounded tab)
  function renderFallbackFormCanvasSnapshot(stepLabel, trigger) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1100;
      canvas.height = 680;
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Top browser/portal header bar
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, 76);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
      const company = currentExtractedData?.company || sessionStorage.getItem('applyflow_company') || 'ATS Portal';
      const title = currentExtractedData?.job_title || sessionStorage.getItem('applyflow_job_title') || 'Job Application';
      const reqId = currentExtractedData?.req_id || sessionStorage.getItem('applyflow_req_id') || '';
      ctx.fillText(`${company} — ${title}${reqId ? ` (${reqId})` : ''}`, 28, 34);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.fillText(`Step: ${stepLabel}   |   Trigger: ${trigger}   |   URL: ${window.location.href.slice(0, 78)}`, 28, 58);

      // Badge on top right
      ctx.fillStyle = trigger === 'FINAL_SUBMIT' ? '#10b981' : '#6366f1';
      ctx.beginPath();
      ctx.roundRect(canvas.width - 230, 20, 200, 36, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(trigger === 'FINAL_SUBMIT' ? '✓ SUBMITTED SNAPSHOT' : `📸 ${trigger}`, canvas.width - 214, 43);

      // Card container
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(28, 96, canvas.width - 56, canvas.height - 124, 12);
      ctx.fill();

      // Step header inside card
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
      ctx.fillText(stepLabel, 52, 136);

      const entries = (currentExtractedData?.all_entries || []).filter(e => e.value && String(e.value).trim() !== '');
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`Captured ${entries.length} answered field(s) • Candidate: ${currentExtractedData?.candidate_name || activeProfile?.fullName || 'N/A'} • ${new Date().toLocaleTimeString()}`, 52, 160);

      // Divider
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(52, 174);
      ctx.lineTo(canvas.width - 52, 174);
      ctx.stroke();

      // Render 2-column grid of answered fields
      const maxItems = Math.min(entries.length, 12);
      const colWidth = (canvas.width - 130) / 2;
      for (let i = 0; i < maxItems; i++) {
        const entry = entries[i];
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 52 + col * (colWidth + 26);
        const y = 192 + row * 68;

        // Field box
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.roundRect(x, y, colWidth, 54, 6);
        ctx.fill();
        ctx.stroke();

        // Label
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        const lbl = String(entry.question || 'Field').slice(0, 52);
        ctx.fillText(lbl + (entry.required ? ' *' : ''), x + 12, y + 19);

        // Value
        ctx.fillStyle = '#0f172a';
        ctx.font = '13px system-ui, -apple-system, sans-serif';
        const valStr = String(entry.value || '').slice(0, 56);
        ctx.fillText(valStr, x + 12, y + 40);
      }

      if (entries.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '15px system-ui, -apple-system, sans-serif';
        ctx.fillText('Form page initialized — awaiting question answers.', 52, 230);
      }

      return canvas.toDataURL('image/jpeg', 0.82);
    } catch (_) {
      return null;
    }
  }

  // Capture a page screenshot and store it in the background tab session + local HUD gallery
  async function capturePageScreenshot(trigger = 'MANUAL', customLabel = '') {
    if (isCapturingScreenshot) return null;
    if (window !== window.top) return null; // Always capture from top window
    isCapturingScreenshot = true;

    const hudEl = document.getElementById('sqc-hud-container');
    const prevOpacity = hudEl ? hudEl.style.opacity : '';
    const prevTransition = hudEl ? hudEl.style.transition : '';

    try {
      const stepLabel = customLabel || detectCurrentStepLabel();
      const answeredCount = (currentExtractedData?.all_entries || []).filter(e => e.value && String(e.value).trim() !== '').length;
      const scrollY = Math.round(window.scrollY || document.documentElement.scrollTop || 0);

      // Briefly hide floating HUD so it never blocks form inputs in the screenshot
      if (hudEl && trigger !== 'FALLBACK_ONLY') {
        hudEl.style.transition = 'none';
        hudEl.style.opacity = '0';
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 35)));
      }

      const fallbackCanvasUrl = renderFallbackFormCanvasSnapshot(stepLabel, trigger);

      const res = await new Promise((resolve) => {
        if (!chrome?.runtime?.sendMessage) {
          resolve({ success: false });
          return;
        }
        chrome.runtime.sendMessage({
          type: 'CAPTURE_PAGE_SCREENSHOT',
          meta: {
            trigger,
            step_label: stepLabel,
            page_url: window.location.href,
            scroll_y: scrollY,
            answered_count: answeredCount,
            total_fields_count: currentExtractedData?.total_fields_count || 0,
            job_id: sessionStorage.getItem('applyflow_job_id') || currentExtractedData?.portal_job_id || '',
            profile_id: sessionStorage.getItem('applyflow_profile_id') || activeProfile?.id || '',
            job_title: currentExtractedData?.job_title || sessionStorage.getItem('applyflow_job_title') || '',
            company: currentExtractedData?.company || sessionStorage.getItem('applyflow_company') || '',
            preCapturedDataUrl: fallbackCanvasUrl
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: false });
          }
        });
      });

      // Restore HUD visibility immediately
      if (hudEl) {
        hudEl.style.opacity = prevOpacity || '1';
        setTimeout(() => { if (hudEl) hudEl.style.transition = prevTransition; }, 50);
      }

      if (res && res.success && res.screenshot) {
        // Downscale if native captureVisibleTab returned a large 2x Retina image
        if (res.screenshot.data_url && res.screenshot.data_url.length > 180000) {
          res.screenshot.data_url = await downscaleScreenshotDataUrl(res.screenshot.data_url);
        }
        const existingIdx = sessionScreenshots.findIndex(s => s.id === res.screenshot.id);
        if (existingIdx >= 0) {
          sessionScreenshots[existingIdx] = res.screenshot;
        } else {
          sessionScreenshots.push(res.screenshot);
          if (sessionScreenshots.length > 8) {
            sessionScreenshots = sessionScreenshots.slice(sessionScreenshots.length - 8);
          }
        }
      } else if (fallbackCanvasUrl) {
        // Standalone Test Bench fallback if service worker wasn't reachable
        const shotObj = {
          id: `shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          step_label: stepLabel,
          trigger,
          page_url: window.location.href,
          scroll_y: scrollY,
          answered_count: answeredCount,
          total_fields_count: currentExtractedData?.total_fields_count || 0,
          captured_at: new Date().toISOString(),
          data_url: fallbackCanvasUrl
        };
        sessionScreenshots.push(shotObj);
        if (sessionScreenshots.length > 8) {
          sessionScreenshots = sessionScreenshots.slice(sessionScreenshots.length - 8);
        }
      }

      if (window.SubmissionHUD && window.SubmissionHUD.updateScreenshots) {
        window.SubmissionHUD.updateScreenshots(sessionScreenshots);
      }
      if (trigger === 'MANUAL' && window.SubmissionHUD) {
        window.SubmissionHUD.showToast(`📸 Page screenshot captured (${stepLabel})!`);
      }
      return sessionScreenshots[sessionScreenshots.length - 1] || null;
    } catch (err) {
      if (hudEl) hudEl.style.opacity = prevOpacity || '1';
      console.warn('[Submission Checker] Screenshot capture notice:', err);
      return null;
    } finally {
      isCapturingScreenshot = false;
    }
  }

  function deleteScreenshot(screenshotId) {
    sessionScreenshots = sessionScreenshots.filter(s => s.id !== screenshotId);
    if (window.SubmissionHUD && window.SubmissionHUD.updateScreenshots) {
      window.SubmissionHUD.updateScreenshots(sessionScreenshots);
    }
    try {
      chrome.runtime.sendMessage({
        type: 'DELETE_SESSION_SCREENSHOT',
        screenshotId
      }, () => { if (chrome.runtime.lastError) {} });
    } catch (_) {}
  }

  // Automatically schedule a screenshot when questions on the current step/scroll view are answered
  function scheduleAutoScreenshotOnQuestionsAnswered() {
    if (window !== window.top) return;
    if (screenshotDebounceTimer) clearTimeout(screenshotDebounceTimer);
    screenshotDebounceTimer = setTimeout(() => {
      try {
        const entries = currentExtractedData?.all_entries || [];
        const answeredEntries = entries.filter(e => e.value && String(e.value).trim() !== '');
        if (answeredEntries.length === 0) return;

        const stepLabel = detectCurrentStepLabel();
        const scrollBucket = Math.floor((window.scrollY || 0) / 500);
        const signature = `${window.location.pathname}::${stepLabel}::${scrollBucket}::${answeredEntries.length}`;
        if (signature === lastCapturedSignature) return;
        lastCapturedSignature = signature;

        capturePageScreenshot('QUESTIONS_ANSWERED', stepLabel);
      } catch (_) {}
    }, 1400);
  }

  function syncApplyFlowContext() {
    const params = JobFormExtractor.extractApplyFlowParams();
    const jobId = params.jobId || sessionStorage.getItem('applyflow_job_id') || window.__SQC_PERSISTED_AF_SESSION?.jobId || '';
    const profileId = params.profileId || sessionStorage.getItem('applyflow_profile_id') || window.__SQC_PERSISTED_AF_SESSION?.profileId || '';
    const profileName = params.profileName || sessionStorage.getItem('applyflow_profile_name') || window.__SQC_PERSISTED_AF_SESSION?.profileName || '';
    const applierId = params.applierId || sessionStorage.getItem('applyflow_applier_id') || window.__SQC_PERSISTED_AF_SESSION?.applierId || '';

    params.jobId = jobId;
    params.profileId = profileId;
    params.profileName = profileName;
    params.applierId = applierId;

    // If active params or job context are detected on this page, persist them to background tab session
    if (jobId || profileId || currentExtractedData?.req_id || (currentExtractedData?.job_title && currentExtractedData?.job_title !== 'Application Role')) {
      try {
        chrome.runtime.sendMessage({
          type: "PERSIST_REDIRECT_TRACKING",
          data: {
            jobId,
            profileId: profileId || activeProfile?.id || '',
            profileName: profileName || activeProfile?.fullName || '',
            applierId: applierId || currentSettings?.applierId || '',
            jobTitle: currentExtractedData?.job_title || sessionStorage.getItem('applyflow_job_title') || '',
            company: currentExtractedData?.company || sessionStorage.getItem('applyflow_company') || '',
            reqId: currentExtractedData?.req_id || sessionStorage.getItem('applyflow_req_id') || '',
            jdSalary: currentExtractedData?.jd_salary || null,
            jdText: currentExtractedData?.jd_text || sessionStorage.getItem('applyflow_jd_text') || '',
            sourceUrl: sessionStorage.getItem('applyflow_original_job_url') || currentExtractedData?.job_url || window.location.href,
            timestamp: Date.now()
          }
        }, () => { if (chrome.runtime.lastError) {} });
      } catch (_) {}
    }

    SubmissionHUD.updateApplyFlowInfo(params, applyFlowContext);

    if (!jobId && !profileId && !window.location.href) return;
    const cleanJobUrl = window.location.href.split('?')[0].split('#')[0];
    const key = `${jobId || ''}_${profileId || activeProfile?.id || ''}_${cleanJobUrl}`;
    if (contextFetchedKey === key) return;
    contextFetchedKey = key;

    getApplyFlowServerUrl().then((serverUrl) => {
      chrome.runtime.sendMessage({
        type: "FETCH_APPLYFLOW_CONTEXT",
        serverUrl,
        jobId,
        profileId: profileId || activeProfile?.id || '',
        profileName: profileName || activeProfile?.fullName || '',
        url: window.location.href
      }, (res) => {
        if (res && res.success && res.data) {
          applyFlowContext = res.data;
          window.__SQC_APPLYFLOW_CONTEXT = applyFlowContext;
          if (applyFlowContext.jobTitle || applyFlowContext.title) {
            try { sessionStorage.setItem('applyflow_job_title', applyFlowContext.jobTitle || applyFlowContext.title); } catch (_) {}
          }
          if (applyFlowContext.company || applyFlowContext.companyName) {
            try { sessionStorage.setItem('applyflow_company', applyFlowContext.company || applyFlowContext.companyName); } catch (_) {}
          }

          const afStatus = (applyFlowContext.currentStatus || applyFlowContext.jobProfile?.status || applyFlowContext.status || applyFlowContext.job_status || '').toUpperCase();
          if (afStatus === 'APPLIED' || afStatus === 'SUBMITTED' || afStatus === 'ALREADY_APPLIED') {
            currentDuplicateRecord = {
              appliedAt: applyFlowContext.appliedAt || applyFlowContext.jobProfile?.appliedAt || new Date().toISOString(),
              status: afStatus,
              profile_assigned: applyFlowContext.profile?.name || applyFlowContext.profileName || activeProfile?.fullName,
              applier_id: applyFlowContext.applier?.id || applyFlowContext.assignedApplier?.id,
              message: `Candidate was already applied in Apply-Flow on ${applyFlowContext.appliedAt ? new Date(applyFlowContext.appliedAt).toLocaleDateString() : 'earlier date'}.`
            };

            currentValidation.isAlreadyApplied = true;
            currentValidation.errors = (currentValidation.errors || []).filter(
              e => e.rule !== 'REQUIRED_FIELD_UNANSWERED' && e.rule !== 'RESUME_MISSING'
            );
            currentValidation.isValid = currentValidation.errors.length === 0;

            try {
              const rawB = sessionStorage.getItem('applyflow_bound_session');
              const b = rawB ? JSON.parse(rawB) : {};
              b.status = afStatus;
              b.appliedAt = currentDuplicateRecord.appliedAt;
              b.profileName = currentDuplicateRecord.profile_assigned;
              if (applyFlowContext.jobId || applyFlowContext.job?.id) {
                b.jobId = applyFlowContext.jobId || applyFlowContext.job?.id;
              }
              sessionStorage.setItem('applyflow_bound_session', JSON.stringify(b));
            } catch (_) {}

            SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, currentDuplicateRecord);
            if (typeof SubmissionHUD.setAlreadyApplied === 'function') {
              SubmissionHUD.setAlreadyApplied(currentDuplicateRecord);
            }
          }

          SubmissionHUD.updateApplyFlowInfo(params, applyFlowContext);
          SubmissionHUD.updateDrawer(currentExtractedData, currentValidation);
        }
      });
    });
  }

  function attachApplyFlowJobId(input) {
    if (!input) return;
    let jobId = input.trim();
    let profileId = '';
    let profileName = '';
    let applierId = '';

    // If input is a full URL or hash string containing parameters
    if (input.includes('http') || input.includes('#') || input.includes('?')) {
      try {
        const u = new URL(input.startsWith('http') ? input : `https://dummy.com/${input.startsWith('/') ? '' : '/'}${input}`);
        const searchParams = u.searchParams;
        const rawHash = (u.hash || '').replace(/^#/, '');
        const hashQuery = rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : rawHash;
        const hashParams = new URLSearchParams(hashQuery);
        const getP = (k) => searchParams.get(k) || hashParams.get(k) || '';

        jobId = getP('job_id') || getP('sqc_job_id') || getP('portal_job_id') || jobId;
        profileId = getP('profile_id') || getP('sqc_profile_id') || getP('candidate_id') || '';
        profileName = getP('profile_name') || getP('candidate_name') || '';
        applierId = getP('applier_id') || getP('sqc_applier_id') || '';
      } catch (_) {}
    }

    if (jobId) sessionStorage.setItem('applyflow_job_id', jobId);
    if (profileId) sessionStorage.setItem('applyflow_profile_id', profileId);
    if (profileName) sessionStorage.setItem('applyflow_profile_name', profileName);
    if (applierId) sessionStorage.setItem('applyflow_applier_id', applierId);

    // Persist to background storage so all newly opened sub-tabs receive this context
    try {
      chrome.runtime.sendMessage({
        type: "PERSIST_REDIRECT_TRACKING",
        data: {
          jobId,
          profileId: profileId || activeProfile?.id || '',
          profileName: profileName || activeProfile?.fullName || '',
          applierId: applierId || currentSettings?.applierId || '',
          sourceUrl: window.location.href,
          timestamp: Date.now()
        }
      }, () => { if (chrome.runtime.lastError) {} });
    } catch (_) {}

    contextFetchedKey = null;
    syncApplyFlowContext();
    runExtractionAndValidation();
  }

  let loggedAlreadyAppliedJobKey = null;
  let loggedSuccessJobKey = null;

  async function handleSubmissionSuccessNotice(data, val) {
    if (!data || !data.is_submission_success) return;

    // Guard: intermediate wizard steps or active form inputs are NEVER submission success
    const intermediateCheck = JobFormExtractor.detectIntermediateWizardStep?.();
    if (intermediateCheck?.isIntermediate) return;
    if ((data?.total_fields_count || 0) > 2) return;

    const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
    const effectiveJobId = sessionStorage.getItem('applyflow_job_id') || applyFlowParams.jobId || window.__SQC_PERSISTED_AF_SESSION?.jobId || data.portal_job_id || data.req_id || "";
    const effectiveProfileId = sessionStorage.getItem('applyflow_profile_id') || applyFlowParams.profileId || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || "";
    const jobKey = `${effectiveJobId}_${effectiveProfileId}_${window.location.hostname}`;

    // Immediately update floating button to "Submitted"
    SubmissionHUD.setQuickApplyStatus('submitted');

    if (loggedSuccessJobKey === jobKey) return;
    loggedSuccessJobKey = jobKey;

    console.log("[Submission Checker] Verified submission confirmation on page! Logging to Apply-Flow...", data.submission_success_message);
    const res = await logPayloadToBackend("PASSED", val, false);
    SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, { status: "SUBMITTED", message: data.submission_success_message });
    SubmissionHUD.showToast(`🎉 Application submitted & logged to Apply-Flow! (${data.submission_success_message || 'Confirmed'})`);
  }

  async function handleAlreadyAppliedNotice(data, val) {
    if (!data || !data.is_already_applied) return;

    const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
    const effectiveJobId = sessionStorage.getItem('applyflow_job_id') || applyFlowParams.jobId || window.__SQC_PERSISTED_AF_SESSION?.jobId || data.portal_job_id || data.req_id || "";
    const effectiveProfileId = sessionStorage.getItem('applyflow_profile_id') || applyFlowParams.profileId || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || "";
    const jobKey = `${effectiveJobId}_${effectiveProfileId}_${window.location.hostname}`;

    if (loggedAlreadyAppliedJobKey === jobKey) return;

    // Protection check: If this job was already successfully SUBMITTED / APPLIED in Apply-Flow, do not downgrade
    const existingStatus = (applyFlowContext?.status || applyFlowContext?.job_status || '').toUpperCase();
    if (existingStatus === 'SUBMITTED' || existingStatus === 'APPLIED') {
      return;
    }

    loggedAlreadyAppliedJobKey = jobKey;

    const res = await logPayloadToBackend("ALREADY_APPLIED", val, false);
    SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, { status: "ALREADY_APPLIED", message: data.already_applied_message });
    SubmissionHUD.showToast("📌 Portal indicates you already applied: Status synced to Apply-Flow as Already Applied!");
  }

  let lastCheckedCompany = '';
  let lastCheckedTitle = '';

  function checkDuplicateJob(data) {
    if (!data || !activeProfile) return;
    const currentUrl = window.location.href.split('?')[0];
    const company = (data.company || '').trim();
    const jobTitle = (data.job_title || '').trim();

    // Check placeholder values
    const isPlaceholderCompany = !company || /^(employer|company|unknown)$/i.test(company);
    const isPlaceholderTitle = !jobTitle || /^(application role|job opening|position|role|job title)$/i.test(jobTitle);

    const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
    const effectiveJobId = applyFlowParams.jobId || data.portal_job_id || data.req_id || '';

    // GUARD: If we have NO genuine job identity (no jobId, and company or title is a placeholder),
    // DEFER verification! Do not ping ApplyFlow with dummy placeholders and get a false negative!
    if (!effectiveJobId && (isPlaceholderCompany || isPlaceholderTitle)) {
      console.log("[Submission Checker] Deferring duplicate check: DOM job metadata not settled yet (waiting for real company & title).");
      return;
    }

    const checkKey = `${currentUrl}_${activeProfile.id}_${isPlaceholderCompany ? '' : company}_${isPlaceholderTitle ? '' : jobTitle}_${effectiveJobId}`;

    if (duplicateCheckedUrl === checkKey) return;
    if (duplicateCheckedUrl && company === lastCheckedCompany && jobTitle === lastCheckedTitle && (company || jobTitle)) return;

    duplicateCheckedUrl = checkKey;
    lastCheckedCompany = company;
    lastCheckedTitle = jobTitle;

    // Surface verifying overlay as extension pings ApplyFlow
    if (window.SubmissionHUD?.showVerificationBanner) {
      SubmissionHUD.showVerificationBanner({
        status: 'verifying',
        candidateName: activeProfile.fullName
      });
    }

    getApplyFlowServerUrl().then((serverUrl) => {
      chrome.runtime.sendMessage({
        type: "CHECK_DUPLICATE_JOB",
        serverUrl,
        candidateId: activeProfile.id,
        candidateName: activeProfile.fullName,
        jobUrl: window.location.href,
        company: isPlaceholderCompany ? '' : company,
        jobTitle: isPlaceholderTitle ? '' : jobTitle,
        reqId: data.req_id,
        jobId: effectiveJobId
      }, (res) => {
        if (!res) return;

        // Persist matched ApplyFlow identifiers if returned
        if (res.job?.id && !sessionStorage.getItem('applyflow_job_id')) {
          sessionStorage.setItem('applyflow_job_id', res.job.id);
        }
        if (res.candidate?.profile_id && !sessionStorage.getItem('applyflow_profile_id')) {
          sessionStorage.setItem('applyflow_profile_id', res.candidate.profile_id);
        }
        if (res.candidate?.profile_name && !sessionStorage.getItem('applyflow_profile_name')) {
          sessionStorage.setItem('applyflow_profile_name', res.candidate.profile_name);
        }

        const isApplied = Boolean(
          res.already_applied ||
          res.has_applied ||
          res.can_apply === false ||
          res.jobStatus === 'APPLIED' ||
          res.status === 'APPLIED' ||
          res.candidate?.status_for_candidate === 'APPLIED'
        );

        if (isApplied) {
          currentDuplicateRecord = res.existingRecord || {
            appliedAt: res.candidate?.applied_at || res.appliedAt || new Date().toISOString(),
            applier_id: res.candidate?.assigned_applier || res.candidate?.applied_by || res.applier,
            profile_assigned: res.candidate?.profile_name || activeProfile?.fullName,
            candidate: res.candidate,
            job: res.job,
            message: res.message || `Already applied in Apply-Flow for ${activeProfile.fullName}`
          };

          currentValidation.isAlreadyApplied = true;
          currentValidation.errors = (currentValidation.errors || []).filter(
            e => e.rule !== 'REQUIRED_FIELD_UNANSWERED' && e.rule !== 'RESUME_MISSING'
          );
          currentValidation.isValid = currentValidation.errors.length === 0;

          try {
            const rawB = sessionStorage.getItem('applyflow_bound_session');
            const b = rawB ? JSON.parse(rawB) : {};
            b.status = 'APPLIED';
            b.appliedAt = currentDuplicateRecord.appliedAt;
            b.profileName = currentDuplicateRecord.profile_assigned;
            if (res.job?.id) b.jobId = res.job.id;
            sessionStorage.setItem('applyflow_bound_session', JSON.stringify(b));
          } catch (_) {}

          // Safeguard: Disable auto-fill on reload to prevent accidental duplicate submission
          if (currentSettings) {
            currentSettings.autoAutofillOnPageLoad = false;
          }

          if (!applyFlowContext) applyFlowContext = {};
          applyFlowContext.currentStatus = "APPLIED";
          applyFlowContext.status = "APPLIED";
          if (res.job) applyFlowContext.job = res.job;
          if (res.candidate) applyFlowContext.profile = res.candidate;
          applyFlowContext.appliedAt = currentDuplicateRecord.appliedAt;

          SubmissionHUD.updateApplyFlowInfo(JobFormExtractor.extractApplyFlowParams(), applyFlowContext);
          SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, currentDuplicateRecord);
          if (typeof SubmissionHUD.setAlreadyApplied === 'function') {
            SubmissionHUD.setAlreadyApplied(currentDuplicateRecord);
          }
          restrictPortalInteractions(true, currentDuplicateRecord);
          SubmissionHUD.updateDrawer(currentExtractedData, currentValidation);

          const dateStr = currentDuplicateRecord.appliedAt || '';
          const byUser = currentDuplicateRecord.applier_id || '';
          const candName = currentDuplicateRecord.profile_assigned || activeProfile?.fullName || 'Candidate';
          const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString() : '';
          const toastMsg = formattedDate
            ? `⚠️ ALREADY APPLIED on ${formattedDate}${byUser ? ` by ${byUser}` : ''} for ${candName}`
            : `⚠️ ALREADY APPLIED for ${candName}`;
          SubmissionHUD.showToast(toastMsg);

          if (window.SubmissionHUD?.showVerificationBanner) {
            SubmissionHUD.showVerificationBanner({
              status: 'applied',
              candidateName: activeProfile.fullName,
              appliedAt: currentDuplicateRecord.appliedAt,
              appliedBy: currentDuplicateRecord.applier_id,
              message: currentDuplicateRecord.message
            });
          }
        } else {
          // Connected & verified from ApplyFlow: job is available to apply
          currentDuplicateRecord = null;
          currentValidation.isAlreadyApplied = false;
          SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, null);
          if (typeof SubmissionHUD.clearAlreadyApplied === 'function') {
            SubmissionHUD.clearAlreadyApplied();
          }
          restrictPortalInteractions(false);

          if (window.SubmissionHUD?.showVerificationBanner) {
            SubmissionHUD.showVerificationBanner({
              status: 'verified',
              candidateName: activeProfile.fullName
            });
          }
          if (!applyFlowContext) {
            applyFlowContext = {
              job: res.job,
              jobId: res.job?.id,
              companyName: res.job?.company_name || company,
              roleTitle: res.job?.role_title || jobTitle,
              currentStatus: "PENDING",
              profile: res.candidate
            };
            SubmissionHUD.updateApplyFlowInfo(JobFormExtractor.extractApplyFlowParams(), applyFlowContext);
          }
        }
      });
    });
  }

  let hasAlertedContextMismatch = false;
  function checkAndAlertContextMismatch(val, data) {
    if (hasAlertedContextMismatch) return;
    const hasMismatch = Boolean((val?.errors || []).some(e => e.rule === 'CONTEXT_PROFILE_MISMATCH'));
    if (hasMismatch) {
      hasAlertedContextMismatch = true;
      const af = JobFormExtractor?.extractApplyFlowParams?.() || {};
      const targetName = af.profileName || data?.target_profile_name || sessionStorage.getItem('applyflow_profile_name') || 'assigned candidate';
      SubmissionHUD.showToast(`⚠️ Context Mismatch: Job is assigned to ${targetName}, but active station is ${activeProfile?.fullName || 'unassigned'}.`);
    }
  }

  // Synchronous extraction and validation
  function runExtractionAndValidation() {
    try {
      currentExtractedData = JobFormExtractor.extractAllFields();
      if (window === window.top) {
        if ((!currentExtractedData || currentExtractedData.total_fields_count === 0) && lastIframeExtractedData && lastIframeExtractedData.total_fields_count > 0) {
          currentExtractedData = lastIframeExtractedData;
        }
        // Tell child iframes to re-extract so dynamic form wizard steps update immediately
        try {
          document.querySelectorAll('iframe').forEach(f => {
            f.contentWindow?.postMessage({ type: 'SQC_TRIGGER_EXTRACTION' }, '*');
          });
        } catch (_) {}
      }
      currentValidation = JobFormValidator.validate(currentExtractedData, activeProfile, currentSettings);

      // Preserve already applied state across DOM mutation passes
      let boundApplied = false;
      try {
        const rawBound = sessionStorage.getItem('applyflow_bound_session');
        if (rawBound) {
          const bs = JSON.parse(rawBound);
          const currentCanon = window.JobFormExtractor?.getCanonicalJobPath ? window.JobFormExtractor.getCanonicalJobPath(window.location.href) : '';
          const isMatch = Boolean(
            (bs.canonicalPath && currentCanon && (bs.canonicalPath === currentCanon || currentCanon.startsWith(bs.canonicalPath) || bs.canonicalPath.startsWith(currentCanon))) ||
            (bs.jobId && window.location.href.includes(bs.jobId))
          );
          if (isMatch && bs && (bs.status === 'APPLIED' || bs.status === 'SUBMITTED' || bs.status === 'ALREADY_APPLIED')) {
            boundApplied = true;
            if (!currentDuplicateRecord) {
              currentDuplicateRecord = {
                appliedAt: bs.appliedAt || new Date().toISOString(),
                status: bs.status,
                profile_assigned: bs.profileName || activeProfile?.fullName,
                applier_id: bs.applierId,
                message: `Candidate was already applied in Apply-Flow on ${bs.appliedAt ? new Date(bs.appliedAt).toLocaleDateString() : 'earlier date'}.`
              };
            }
          }
        }
      } catch (_) {}

      const isAfApplied = Boolean(
        applyFlowContext && (
          applyFlowContext.currentStatus === 'APPLIED' ||
          applyFlowContext.status === 'APPLIED' ||
          applyFlowContext.jobProfile?.status === 'APPLIED'
        )
      );

      if (currentDuplicateRecord || currentValidation?.isAlreadyApplied || currentExtractedData?.is_already_applied || boundApplied || isAfApplied) {
        currentValidation.isAlreadyApplied = true;
        currentValidation.errors = (currentValidation.errors || []).filter(
          e => {
            const s = String(e.rule || '').toUpperCase();
            return !s.includes('REQUIRED') && !s.includes('EMPTY') && !s.includes('MISSING') && !s.includes('RESUME') && !s.includes('UNANSWERED') && !s.includes('FILE');
          }
        );
        currentValidation.isValid = currentValidation.errors.length === 0;
      }

      // Sync Apply-Flow tracking & context
      syncApplyFlowContext();

      // Check for previously submitted duplicate in backend
      checkDuplicateJob(currentExtractedData);

      // Auto-sync already applied state to Apply-Flow backend if detected on portal
      handleAlreadyAppliedNotice(currentExtractedData, currentValidation);

      // Auto-detect and handle confirmed submission (Rippling, Ashby, Greenhouse, Lever, Workday, etc.)
      handleSubmissionSuccessNotice(currentExtractedData, currentValidation);

      // Update Floating HUD
      SubmissionHUD.updateDrawer(currentExtractedData, currentValidation);

      // Alert applier immediately if there is a candidate context mismatch
      checkAndAlertContextMismatch(currentValidation, currentExtractedData);

      // Update glowing outlines on page
      SubmissionHUD.updateFieldHighlights(currentValidation.fieldErrorMap);

      // Highlight CAPTCHAs & human checks
      highlightCaptchaChallenge(currentExtractedData?.captcha_detected);

      // Stream live field snapshot to backend
      streamLiveSnapshot(currentExtractedData, currentValidation);

      // If running inside a child frame, relay extracted fields to top window for the unified HUD
      if (window !== window.top && currentExtractedData) {
        try {
          window.top.postMessage({
            type: 'SQC_IFRAME_EXTRACTED_DATA',
            data: currentExtractedData,
            validation: currentValidation
          }, '*');
        } catch (_) {}
      }
    } catch (err) {
      console.error("[Submission Checker] Extraction error:", err);
    }
  }

  function streamLiveSnapshot(data, val) {
    if (!data) return;

    // Stream snapshot if there are any detected form fields, candidate details, or already applied notice
    const hasData = Boolean(
      data.is_already_applied ||
      data.candidate_name ||
      data.candidate_first_name ||
      data.email_entered ||
      data.phone_entered ||
      data.salary_expected ||
      data.resume_uploaded ||
      (data.all_entries && data.all_entries.length > 0)
    );

    if (!hasData && window === window.top) {
      return; // Skip empty outer wrapper frames
    }

    try {
      chrome.runtime.sendMessage({
        type: "DISPATCH_LIVE_FEEDBACK",
        payload: {
          applier_id: currentSettings?.applierId || "Applier",
          candidate_id: activeProfile?.id,
          profile_assigned: activeProfile?.fullName || "Unassigned",
          portal_job_id: data.portal_job_id || "",
          job_id: data.portal_job_id || data.req_id || "",
          // Explicitly flag telemetry as PENDING (not a final submission)
          is_final_submission: false,
          job_status: data.is_already_applied ? "ALREADY_APPLIED" : "PENDING",
          validation_status: "IN_PROGRESS",
          extracted_data: {
            candidate_name: data.candidate_name,
            candidate_first_name: data.candidate_first_name,
            candidate_last_name: data.candidate_last_name,
            email_entered: data.email_entered,
            phone_entered: data.phone_entered,
            job_title: data.job_title,
            company: data.company,
            req_id: data.req_id,
            portal_job_id: data.portal_job_id || "",
            ats_domain: data.ats_domain,
            resume_uploaded: data.resume_uploaded,
            salary_expected: data.salary_expected,
            total_fields_count: data.total_fields_count,
            required_fields_count: data.required_fields_count,
            optional_fields_count: data.optional_fields_count,
            required_unanswered_count: data.required_unanswered_count,
            is_already_applied: data.is_already_applied,
            already_applied_message: data.already_applied_message,
            screenshots_count: sessionScreenshots.length,
            all_entries: data.all_entries
          },
          screenshots: sessionScreenshots,
          is_valid: val?.isValid,
          error_count: val?.errors?.length || 0,
          timestamp: new Date().toISOString()
        }
      }, () => { if (chrome.runtime.lastError) {} });
    } catch (_) {}
  }

  function scheduleLiveExtraction() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runExtractionAndValidation();
    }, 80);
  }

  // 1. BIND REAL-TIME FORM INPUT TRACKING
  function bindLiveFormTracking() {
    const events = ['input', 'change', 'paste', 'keyup', 'drop', 'blur'];
    events.forEach(evt => {
      window.addEventListener(evt, (e) => {
        // Ignore events inside our HUD
        if (e.target && e.target.closest && e.target.closest('#sqc-hud-container, #sqc-modal-overlay')) return;
        if (e.isTrusted && (evt === 'input' || evt === 'change') && e.target && e.target.dataset) {
          const val = typeof e.target.value === 'string' ? e.target.value.trim() : '';
          if (val === '' && e.target.type !== 'checkbox' && e.target.type !== 'radio' && e.target.type !== 'file') {
            e.target.dataset.sqcUserCleared = 'true';
          } else if (val !== '') {
            delete e.target.dataset.sqcUserCleared;
          }
        }
        scheduleLiveExtraction();
        if (evt === 'change' || evt === 'blur' || evt === 'drop') {
          scheduleAutoScreenshotOnQuestionsAnswered();
        }
      }, true); // Capture phase ensures we hear it immediately
    });

    // Also capture a new section screenshot when user scrolls down a long form after answering questions
    window.addEventListener('scroll', () => {
      if ((currentExtractedData?.total_fields_count || 0) > 0) {
        scheduleAutoScreenshotOnQuestionsAnswered();
      }
    }, { passive: true });

    // Auto-helper: When applier clicks "UPLOAD A RESUME/CV" on TTC Portals, Taleo, etc.
    window.addEventListener('click', (e) => {
      const target = e.target;
      if (!target || (target.closest && target.closest('#sqc-hud-container, #sqc-modal-overlay'))) return;
      const trigger = e.target.closest('button, a, label, [role="button"], div, li, span') || e.target;
      const text = (trigger.innerText || trigger.textContent || trigger.value || '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (/upload (a\s*)?(resume|cv)/i.test(text) ||
          /select\s*(a\s*)?(resume|cv|file)/i.test(text) ||
          /browse\s*(resume|file|document)?/i.test(text) ||
          (/\bupload\b.*\b(resume|cv)\b/i.test(text) && text.length < 50)) {
        console.log("[SQC] Portal resume upload option clicked:", text);
        const tailoredText = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sqc_tailored_resume') : null) || activeProfile?.resumeText || '';
        if (activeProfile && window.SubmissionHUD?.downloadResumeFile) {
          const candName = activeProfile.fullName || 'Candidate';
          const now = Date.now();
          const lastDl = parseInt(sessionStorage.getItem(`sqc_last_dl_${activeProfile.id}`) || '0', 10);
          if (now - lastDl > 8000) {
            sessionStorage.setItem(`sqc_last_dl_${activeProfile.id}`, String(now));
            window.SubmissionHUD.downloadResumeFile(tailoredText, activeProfile, { silent: true });
            SubmissionHUD.showToast(`📥 '${candName}.pdf' ready in your Downloads! Select it in the file dialog.`);
          }
        }
        if (window.SubmissionHUD?.attachResumeToPortal) {
          setTimeout(() => {
            window.SubmissionHUD.attachResumeToPortal(tailoredText, activeProfile);
          }, 300);
        }
      }
    }, true);

    // Observe DOM mutations (for dynamically added multi-step form pages)
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.target && m.target.closest && m.target.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
        if (m.addedNodes.length > 0) {
          scheduleLiveExtraction();
          break;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Quick Apply / Easy Apply Heuristic Detector
  function isQuickApplyTrigger(el) {
    if (!el) return false;
    if (el.closest('#sqc-hud-container, #sqc-modal-overlay')) return false;

    const text = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
    if (
      text.includes('quick apply') ||
      text.includes('easy apply') ||
      text.includes('apply with 1-click') ||
      text.includes('1-click apply') ||
      text.includes('one-click apply') ||
      text.includes('apply on ziprecruiter') ||
      text.includes('apply with indeed') ||
      text.includes('apply with linkedin')
    ) {
      return true;
    }

    const testId = (el.getAttribute('data-testid') || el.getAttribute('data-qa') || el.getAttribute('data-automation-id') || el.className || '').toLowerCase();
    if (testId.includes('quick-apply') || testId.includes('easy-apply') || testId.includes('one-click-apply')) {
      return true;
    }

    const parent = el.closest('button, [role="button"], a');
    if (parent && parent !== el) {
      return isQuickApplyTrigger(parent);
    }

    return false;
  }

  // Heuristic: Is this element a standard final form submit button?
  function isSubmitTarget(el) {
    if (!el) return false;
    if (el.closest('#sqc-hud-container, #sqc-modal-overlay, #sqc-portal-lock-banner')) return false;

    // Quick Apply is handled separately by the verification watcher
    if (isQuickApplyTrigger(el)) return false;

    // Intermediate wizard steps (e.g. Step 3 of 8) NEVER have a final submit target
    const intermediateCheck = JobFormExtractor.detectIntermediateWizardStep?.();
    if (intermediateCheck && intermediateCheck.isIntermediate) {
      return false;
    }

    const text = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();

    // Navigation, login, modal close, and step progression buttons are NEVER final submit
    if (/^(log in|login|sign in|signin|register|next|next step|continue|save & continue|save and continue|proceed|back|previous|prev|upload|choose file|browse|agree|i agree|accept|cancel|close|exit)$/i.test(text)) {
      return false;
    }

    // External job board links are NOT final form submits
    if (/apply\s+on\s+company\s+site|apply\s+externally|apply\s+on\s+website|apply\s+with\s+indeed|apply\s+on\s+ziprecruiter/i.test(text)) {
      return false;
    }

    // Heuristic: Is the user on an introductory step, terms & agreement, or modal wizard?
    const isIntroOrWizardStep = Boolean(
      document.querySelector('[aria-label*="terms" i], [class*="terms" i], [class*="modal" i] h1, [class*="modal" i] h2') ||
      /step\s+1\s+of|terms\s*&\s*agreement|welcome to the.*application/i.test(document.body?.innerText?.slice(0, 2000) || '')
    );
    if (isIntroOrWizardStep && /^(apply|apply now|start application|begin application)$/i.test(text)) {
      return false;
    }

    // Check if the candidate has actually entered meaningful info
    const hasCandidateInputs = Boolean(
      currentExtractedData?.email_entered ||
      currentExtractedData?.candidate_name ||
      currentExtractedData?.resume_uploaded ||
      (currentExtractedData?.all_entries && currentExtractedData.all_entries.some(e => e.value && String(e.value).trim().length > 0))
    );

    // Initial "Apply" or "Apply now" button that launches/opens the application form:
    // If no candidate info has been entered yet, clicking "Apply" is starting the application, NOT submitting it!
    if (/^(apply|apply now|start application|begin application|apply for this job|apply for job|apply to position)$/i.test(text)) {
      if (!hasCandidateInputs) {
        return false;
      }
    }

    // Explicit Final Submit button text markers:
    if (/^(submit application|submit|send application|complete application|submit profile|finish and submit|submit my application|confirm and submit|complete submission)$/i.test(text)) {
      return true;
    }

    // On pages WITH candidate inputs entered, "apply" at the bottom of the form IS the final submit (e.g. Dover, Rippling)
    if (hasCandidateInputs && /^(apply|apply now|apply for this job|apply for job)$/i.test(text)) {
      return true;
    }

    // Automation IDs
    const autoId = (el.getAttribute('data-automation-id') || el.getAttribute('data-qa') || el.id || '').toLowerCase();
    if (autoId.includes('submit-button') || autoId.includes('submitapplication') || autoId.includes('submitbtn') || autoId === 'submit') {
      if (!autoId.includes('next') && !autoId.includes('continue') && !autoId.includes('start') && !autoId.includes('login') && !autoId.includes('agree')) return true;
    }

    // Tag & type
    const btn = el.closest('button, [role="button"], input[type="submit"]') || el;
    const btnType = (btn.getAttribute('type') || '').toLowerCase();
    const btnText = (btn.innerText || btn.textContent || btn.value || '').trim().toLowerCase();
    if (btnType === 'submit' && !/^(next|continue|proceed|back|previous|prev|login|sign in|agree|save & continue|save and continue|save)/i.test(btnText)) {
      if (/submit|send|finish|complete/i.test(btnText)) return true;
      if (hasCandidateInputs && /apply/i.test(btnText)) return true;
    }

    // Check parent button wrapper
    const parentBtn = el.closest('button, [role="button"], input[type="submit"]');
    if (parentBtn && parentBtn !== el) {
      return isSubmitTarget(parentBtn);
    }

    return false;
  }

  // 2. SYNCHRONOUS CAPTURE-PHASE SUBMIT & QUICK APPLY INTERCEPTION
  let quickApplyWatcherTimer = null;
  let quickApplyPending = false;
  let loggedSubmissionUrl = null;

  function bindSubmitInterception() {
    // Detect if current page is a login / account activation / password reset page
    // These pages have submit buttons but are NOT job application submissions
    function isLoginOrActivationPage() {
      const url = window.location.href.toLowerCase();
      const path = window.location.pathname.toLowerCase();
      const title = (document.title || '').toLowerCase();
      const h1 = (document.querySelector('h1, h2')?.innerText || '').toLowerCase();

      // URL signals
      if (/\/(login|sign.?in|signin|activate|activation|account.?setup|set.?password|reset.?password|forgot.?password|create.?account|register|otp|verify|verification|auth|authenticate)(\?|\/|$)/i.test(url)) return true;
      // Page heading signals
      if (/^(sign in|candidate login|login|log in|account activation|activate your account|set your password|reset password|create account|create your account|verify email|email verification)/i.test(h1)) return true;
      // Title signals
      if (/candidate login|sign in|account activation|activate account|reset password/i.test(title)) return true;
      // Only email + password fields present (no name, no resume, no screening questions)
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])')).filter(i => !i.closest('#sqc-hud-container'));
      const hasPassword = inputs.some(i => i.type === 'password');
      const hasName = inputs.some(i => /name|first|last/i.test(i.name + i.id + i.placeholder));
      const hasResume = !!document.querySelector('input[type="file"]');
      if (hasPassword && !hasName && !hasResume && inputs.length <= 4) return true;

      return false;
    }

    // A. Intercept Clicks on Submit & Quick Apply Buttons
    window.addEventListener('click', (event) => {
      if (isSubmittingProgrammatically) return;

      // NEVER log submission on login / account activation / password reset pages
      if (isLoginOrActivationPage()) return;

      const target = event.target;
      if (!target) return;

      // Handle Quick Apply / 1-Click Apply initiation
      if (isQuickApplyTrigger(target)) {
        console.log("[Submission Checker] Quick Apply button clicked. Validating candidate context...");
        runExtractionAndValidation();

        const isAuditMode = currentSettings?.interceptionMode === 'audit';
        const fatalContextErr = (currentValidation?.errors || []).find(e => 
          e.rule === 'ACCOUNT_MISMATCH' || e.rule === 'CONTEXT_PROFILE_MISMATCH'
        );

        if (fatalContextErr && !isAuditMode) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          console.warn("[Submission Checker] 1-Click Apply BLOCKED:", fatalContextErr.message);
          SubmissionHUD.showToast(`⛔ 1-Click Apply Blocked: ${fatalContextErr.message}`);
          SubmissionHUD.showBlockingModal(currentValidation, () => {
            // Overridden by applier
            startQuickApplyVerificationWatcher();
            target.click();
          });
          return;
        }

        startQuickApplyVerificationWatcher();
        // Allow native event to proceed to open the dialog or trigger the platform's action
        return;
      }

      // Multi-step intermediate navigation check (Next, Continue, Save & Continue, Proceed)
      const clickedBtn = target.closest('button, input[type="submit"], input[type="button"], [role="button"]') || target;
      const clickedBtnText = (clickedBtn.innerText || clickedBtn.textContent || clickedBtn.value || '').trim().toLowerCase();
      const isIntermediateNav = /^(next|next step|continue|save & continue|save and continue|proceed)$/i.test(clickedBtnText);
      const isIntermediate = Boolean(JobFormExtractor.detectIntermediateWizardStep?.()?.isIntermediate);

      if (isIntermediateNav || (isIntermediate && !isSubmitTarget(target))) {
        // Validate current step fields (Gatekeeper check)
        runExtractionAndValidation();

        const isAuditMode = currentSettings?.interceptionMode === 'audit';
        if (!currentValidation.isValid && !isAuditMode) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          console.warn("[Submission Checker] Step transition blocked due to validation errors:", currentValidation.errors);
          SubmissionHUD.showBlockingModal(currentValidation, () => {
            triggerNativeSubmit(clickedBtn);
          });
          return;
        }

        // Current step is valid: allow native click to proceed to the next step.
        // DO NOT log to backend!
        capturePreTransitionSnapshot();
        capturePageScreenshot('STEP_TRANSITION', `${detectCurrentStepLabel()} (Completed)`);
        return;
      }

      if (!isSubmitTarget(target)) return;

      const submitBtn = target.closest('button, input[type="submit"], [role="button"]') || target;

      // Synchronously extract and validate
      runExtractionAndValidation();

      // Safeguard: Never log a submission if there are 0 form fields detected on the page
      const hasFormContext = (currentExtractedData?.total_fields_count || 0) > 0 || !!currentExtractedData?.email_entered || !!currentExtractedData?.candidate_name || !!currentExtractedData?.resume_uploaded;
      if (!hasFormContext) return;

      const isAuditMode = currentSettings?.interceptionMode === 'audit';

      // --- FATAL VALIDATION FAILURE IN ACTIVE GATEKEEPER MODE ---
      if (!currentValidation.isValid && !isAuditMode) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        console.warn("[Submission Checker] SUBMISSION INTERCEPTED & BLOCKED:", currentValidation.errors);

        SubmissionHUD.showBlockingModal(currentValidation, async () => {
          await logPayloadToBackend("OVERRIDDEN_FAILED", currentValidation);
          triggerNativeSubmit(submitBtn);
        });

        return;
      }

      // --- VALID FINAL SUBMISSION OR AUDIT MODE ---
      // Allow native submit to go through to portal, indicate submitting state on HUD,
      // and monitor for portal's actual confirmation page. DO NOT prematurely log to Apply-Flow!
      SubmissionHUD.setQuickApplyStatus('submitting', '⏳ Submitting application to portal...');
      startQuickApplyVerificationWatcher();
    }, true);

    // B. Intercept Form Submit Events (e.g. Enter key inside input)
    document.addEventListener('submit', (event) => {
      if (isSubmittingProgrammatically) return;
      if (event.target && event.target.closest && event.target.closest('#sqc-hud-container, #sqc-modal-overlay')) return;

      // NEVER log submission on login / account activation / password reset pages
      if (isLoginOrActivationPage()) return;

      const isIntermediate = Boolean(JobFormExtractor.detectIntermediateWizardStep?.()?.isIntermediate);

      runExtractionAndValidation();

      // Safeguard: Never log a submission if there are 0 form fields detected on the page
      const hasFormContext = (currentExtractedData?.total_fields_count || 0) > 0 || !!currentExtractedData?.email_entered || !!currentExtractedData?.candidate_name || !!currentExtractedData?.resume_uploaded;
      if (!hasFormContext) return;

      const isAuditMode = currentSettings?.interceptionMode === 'audit';

      if (!currentValidation.isValid && !isAuditMode) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        SubmissionHUD.showBlockingModal(currentValidation, async () => {
          if (!isIntermediate) {
            await logPayloadToBackend("OVERRIDDEN_FAILED", currentValidation);
          }
          isSubmittingProgrammatically = true;
          event.target.submit();
          setTimeout(() => { isSubmittingProgrammatically = false; }, 500);
        });

        return;
      }

      // If this is an intermediate step, allow submit to advance to next step without logging PASSED
      if (isIntermediate) {
        capturePreTransitionSnapshot();
        capturePageScreenshot('STEP_TRANSITION', `${detectCurrentStepLabel()} (Completed)`);
        return;
      }

      // For final form submit, allow native submit and start verification watcher
      SubmissionHUD.setQuickApplyStatus('submitting', '⏳ Submitting application to portal...');
      startQuickApplyVerificationWatcher();
    }, true);
  }

  // Active Quick Apply Verification Watcher (Polls for actual submitted confirmation state)
  function startQuickApplyVerificationWatcher() {
    if (quickApplyWatcherTimer) clearInterval(quickApplyWatcherTimer);
    quickApplyPending = true;
    SubmissionHUD.setQuickApplyStatus('pending', '⏳ Quick Apply initiated. Monitoring submission confirmation...');

    let attempts = 0;
    const maxAttempts = 120; // 60 seconds (every 500ms)

    quickApplyWatcherTimer = setInterval(() => {
      attempts++;
      runExtractionAndValidation();

      // Check if submission success or already applied is verified
      const successState = JobFormExtractor.detectSubmissionSuccess();
      const alreadyAppliedState = JobFormExtractor.detectAlreadyApplied();

      if (successState.is_success || alreadyAppliedState.is_already_applied) {
        clearInterval(quickApplyWatcherTimer);
        quickApplyPending = false;

        const currentUrl = window.location.href.split('#')[0];
        if (loggedSubmissionUrl !== currentUrl) {
          loggedSubmissionUrl = currentUrl;
          const status = alreadyAppliedState.is_already_applied ? "ALREADY_APPLIED" : "PASSED";
          logPayloadToBackend(status, currentValidation);
        }

        SubmissionHUD.setQuickApplyStatus('submitted', "🎉 Application verified & logged to Apply-Flow!");
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(quickApplyWatcherTimer);
        quickApplyPending = false;
        SubmissionHUD.setQuickApplyStatus('idle');
      }
    }, 500);
  }

  // Outbound Redirect & External Apply Link Parameter Preservation
  function isExternalApplyLink(el) {
    if (!el) return false;
    const link = el.closest('a') || (el.tagName === 'A' ? el : null);
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();

    if (
      text.includes('apply on company site') ||
      text.includes('apply externally') ||
      text.includes('employer website') ||
      text.includes('company site') ||
      text.includes('apply on website')
    ) {
      return true;
    }

    if (link && link.href && !link.href.startsWith('javascript:')) {
      try {
        const linkHost = new URL(link.href, window.location.href).hostname;
        if (linkHost && linkHost !== window.location.hostname && /apply|jobs|career|posting|req/i.test(link.href + ' ' + text)) {
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  function bindOutboundRedirectTracking() {
    // Capture full job & form snapshot before unload/pagehide during multi-page navigations
    window.addEventListener('beforeunload', () => {
      capturePreTransitionSnapshot();
    });
    window.addEventListener('pagehide', () => {
      capturePreTransitionSnapshot();
    });

    window.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || (target.closest && target.closest('#sqc-hud-container, #sqc-modal-overlay'))) return;

      const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
      const effectiveJobId = applyFlowParams.jobId || sessionStorage.getItem('applyflow_job_id') || window.__SQC_PERSISTED_AF_SESSION?.jobId || "";
      const effectiveProfileId = applyFlowParams.profileId || sessionStorage.getItem('applyflow_profile_id') || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || "";
      const effectiveProfileName = applyFlowParams.profileName || sessionStorage.getItem('applyflow_profile_name') || window.__SQC_PERSISTED_AF_SESSION?.profileName || activeProfile?.fullName || "";
      const effectiveApplierId = applyFlowParams.applierId || sessionStorage.getItem('applyflow_applier_id') || window.__SQC_PERSISTED_AF_SESSION?.applierId || currentSettings?.applierId || "";

      // 1. Multi-Step ATS Wizard & Apply Initiation Buttons (Apply, Apply Now, Next, Continue, Save & Continue, Review, Submit)
      const btn = target.closest('button, input[type="button"], input[type="submit"], a, [role="button"]');
      if (btn) {
        const text = (btn.innerText || btn.textContent || btn.value || '').trim();
        if (/^(apply|apply now|apply for this job|apply for job|apply manually|autofill with resume|use my last application|start application|start apply|apply on company site|apply externally|next|next step|continue|save & continue|save and continue|proceed|review|review and submit|submit|submit application|send application|finish|complete application)$/i.test(text) ||
            /\b(apply|next|continue|proceed|submit)\b/i.test(btn.getAttribute('data-automation-id') || btn.id || '')) {
          // Force instantaneous snapshot save to sessionStorage & background tab session BEFORE the page/DOM changes state
          capturePreTransitionSnapshot();
          // Also capture screenshot of the current wizard step before transitioning
          if (/^(next|next step|continue|save & continue|save and continue|proceed|review|review and submit)$/i.test(text) ||
              /\b(next|continue|proceed)\b/i.test(btn.getAttribute('data-automation-id') || btn.id || '')) {
            capturePageScreenshot('STEP_TRANSITION', `${detectCurrentStepLabel()} (Completed)`);
          }
        }
      }

      // 2. Anchor Links
      const link = target.closest('a') || (target.tagName === 'A' ? target : null);
      if (!link || !link.href || link.href.startsWith('javascript:')) return;

      if (effectiveJobId || effectiveProfileId || currentExtractedData?.req_id || currentExtractedData?.job_title) {
        // 1. Persist full snapshot to Background Storage so new tabs / redirects have it
        capturePreTransitionSnapshot();

        // 2. Append hash parameters directly to destination URL if Apply-Flow IDs exist
        if (effectiveJobId || effectiveProfileId) {
          try {
            const u = new URL(link.href, window.location.href);
            const rawHash = (u.hash || '').replace(/^#/, '');
            const hashObj = new URLSearchParams(rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : rawHash);
            
            if (effectiveJobId) {
              hashObj.set('job_id', effectiveJobId);
              hashObj.set('sqc_job_id', effectiveJobId);
              hashObj.set('portal_job_id', effectiveJobId);
            }
            if (effectiveProfileId) {
              hashObj.set('profile_id', effectiveProfileId);
              hashObj.set('candidate_id', effectiveProfileId);
              hashObj.set('sqc_profile_id', effectiveProfileId);
            }
            if (effectiveProfileName) hashObj.set('profile_name', effectiveProfileName);
            if (effectiveApplierId) hashObj.set('applier_id', effectiveApplierId);

            u.hash = hashObj.toString();
            link.href = u.toString();
          } catch (_) {}
        }
      }
    }, true);
  }

  function triggerNativeSubmit(buttonEl) {
    isSubmittingProgrammatically = true;
    try {
      buttonEl.click();
    } finally {
      setTimeout(() => { isSubmittingProgrammatically = false; }, 500);
    }
  }

  async function getApplyFlowServerUrl() {
    const params = JobFormExtractor.extractApplyFlowParams();
    if (params.apiUrl) return params.apiUrl;
    const sessionUrl = sessionStorage.getItem('applyflow_api_url');
    if (sessionUrl) return sessionUrl;
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.get(["applyflow_api_url", "manual_api_url", "settings"], (res) => {
          const stored = res?.applyflow_api_url || res?.manual_api_url || res?.settings?.backendWebhookUrl;
          if (stored) {
            try {
              const u = new URL(stored);
              resolve(u.origin);
              return;
            } catch (_) {
              resolve(stored);
              return;
            }
          }
          resolve("http://localhost:5000");
        });
      } catch (_) {
        resolve("http://localhost:5000");
      }
    });
  }

  async function logPayloadToBackend(status, val, isManualConfirm = false) {
    const serverUrl = await getApplyFlowServerUrl();
    const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
    const effectiveJobId = sessionStorage.getItem('applyflow_job_id') || applyFlowParams.jobId || window.__SQC_PERSISTED_AF_SESSION?.jobId || currentExtractedData?.portal_job_id || currentExtractedData?.req_id || "";
    const effectiveProfileId = sessionStorage.getItem('applyflow_profile_id') || applyFlowParams.profileId || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || "";
    const effectiveApplierId = sessionStorage.getItem('applyflow_applier_id') || applyFlowParams.applierId || window.__SQC_PERSISTED_AF_SESSION?.applierId || currentSettings?.applierId || "Applier";
    const effectiveProfileName = sessionStorage.getItem('applyflow_profile_name') || applyFlowParams.profileName || window.__SQC_PERSISTED_AF_SESSION?.profileName || activeProfile?.fullName || "Candidate";
    const effectiveApplierName = sessionStorage.getItem('applyflow_applier_name') || applyFlowParams.applierName || window.__SQC_PERSISTED_AF_SESSION?.applierName || currentSettings?.applierName || "";

    const isAlreadyApplied = Boolean(currentExtractedData?.is_already_applied);
    const isSubmissionSuccess = Boolean(currentExtractedData?.is_submission_success || val?.isSubmissionSuccess);
    const jobStatus = isAlreadyApplied ? "ALREADY_APPLIED" : ((val?.isValid || isSubmissionSuccess) ? "SUBMITTED" : "REJECTED");
    const validationStatus = isAlreadyApplied ? "ALREADY_APPLIED" : ((val?.isValid || isSubmissionSuccess) ? "PASSED" : (status.includes("OVERRIDDEN") ? "OVERRIDDEN_FAILED" : (status.includes("FLAGGED") ? "WARNING" : "FAILED")));

    // Safeguard 0: Intermediate wizard steps (e.g. Step 3 of 8) must NEVER be automatically logged as SUBMITTED / PASSED!
    if (!isManualConfirm && !isAlreadyApplied && JobFormExtractor.detectIntermediateWizardStep?.()?.isIntermediate) {
      console.warn("[Submission Checker] Suppressing premature submission log: candidate is currently on an intermediate wizard step.");
      return { success: false, reason: "INTERMEDIATE_STEP" };
    }

    // Safeguard: Do not log automatic form submission if 0 fields are filled and not manually confirmed, already applied, or confirmed successful
    const hasMeaningfulInputs = (currentExtractedData?.total_fields_count || 0) > 0 &&
      (Boolean(currentExtractedData?.email_entered) || Boolean(currentExtractedData?.candidate_name) || Boolean(currentExtractedData?.resume_uploaded));
    
    if (!isManualConfirm && !isAlreadyApplied && !isSubmissionSuccess && !hasMeaningfulInputs) {
      console.warn("[Submission Checker] Suppressing premature submission log: form has 0 filled inputs and was not manually confirmed.");
      return { success: false, reason: "NO_FORM_INPUTS_DETECTED" };
    }

    // Immediately show "Submitting..." state on the floating pill while dispatching
    SubmissionHUD.setQuickApplyStatus('submitting', '⏳ Submitting application to Apply-Flow...');

    // Automatically capture a final submission screenshot right before dispatching payload
    try {
      await capturePageScreenshot('FINAL_SUBMIT', `${detectCurrentStepLabel()} — Final Submission`);
    } catch (_) {}

    // Ensure we have at least one valid visual screenshot proof
    if (!Array.isArray(sessionScreenshots) || sessionScreenshots.length === 0) {
      try {
        const fallbackShot = renderFallbackFormCanvasSnapshot(`${detectCurrentStepLabel()} — Final Submission`, 'FINAL_SUBMIT');
        if (fallbackShot) {
          sessionScreenshots.push({
            id: `shot_final_${Date.now()}`,
            step_label: `${detectCurrentStepLabel()} — Final Submission`,
            trigger: 'FINAL_SUBMIT',
            page_url: window.location.href,
            captured_at: new Date().toISOString(),
            data_url: fallbackShot,
            image_url: fallbackShot,
            url: fallbackShot,
            base64: fallbackShot,
            image: fallbackShot,
            screenshot: fallbackShot
          });
        }
      } catch (_) {}
    }

    // Format all session screenshots with unique IDs, labels, and all dataUrl aliases for ApplyFlow
    const formattedScreenshots = (sessionScreenshots || []).map((shot, idx) => {
      const img = shot.data_url || shot.dataUrl || shot.image_url || shot.imageUrl || shot.url || shot.base64 || shot.image || shot.screenshot || "";
      const shotId = shot.id || `shot_${idx + 1}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const stepLabel = shot.step_label || shot.stepLabel || `Step ${idx + 1}`;
      const capturedAt = shot.captured_at || shot.capturedAt || new Date().toISOString();
      return {
        ...shot,
        id: shotId,
        step_label: stepLabel,
        trigger: shot.trigger || "AUTO",
        page_url: shot.page_url || window.location.href,
        answered_count: shot.answered_count !== undefined ? Number(shot.answered_count) : 0,
        total_fields_count: shot.total_fields_count !== undefined ? Number(shot.total_fields_count) : (currentExtractedData?.total_fields_count || 0),
        captured_at: capturedAt,
        data_url: img,
        image_url: img,
        url: img,
        base64: img,
        image: img,
        screenshot: img
      };
    }).filter(s => Boolean(s.data_url));

    const finalShotImg = (formattedScreenshots[formattedScreenshots.length - 1] || formattedScreenshots[0])?.data_url || "";

    const payload = {
      job_id: effectiveJobId,
      profile_id: effectiveProfileId,
      candidate_id: effectiveProfileId,
      applier_id: effectiveApplierId,
      profile_name: effectiveProfileName,
      applier_name: effectiveApplierName,
      serverUrl: serverUrl,
      sqc_api_url: serverUrl,

      // Primary screenshot for single-image ATS consumers / previews
      screenshot: finalShotImg,
      screenshot_url: finalShotImg,

      // Explicit Final Submission Flag
      is_final_submission: true,
      submission_confirmed_by: isManualConfirm ? "MANUAL_HUD_CONFIRM" : (isAlreadyApplied ? "AUTO_DETECTED_ALREADY_APPLIED_ON_PORTAL" : (isSubmissionSuccess ? "CONFIRMED_ON_PORTAL_SUCCESS_PAGE" : "VERIFIED_FORM_SUBMIT_EVENT")),

      // Apply-Flow Status: "SUBMITTED" (marks APPLIED), "ALREADY_APPLIED", or "REJECTED"
      job_status: jobStatus,
      validation_status: isAlreadyApplied ? "ALREADY_APPLIED" : validationStatus,

      extracted_data: {
        job_id: effectiveJobId,
        profile_id: effectiveProfileId,
        req_id: currentExtractedData?.req_id || "",
        job_title: currentExtractedData?.job_title || "Application Role",
        company: currentExtractedData?.company || "Employer",
        job_url: currentExtractedData?.job_url || window.location.href,
        email_entered: currentExtractedData?.email_entered || "",
        phone_entered: currentExtractedData?.phone_entered || "",
        candidate_name: currentExtractedData?.candidate_name || "",
        candidate_first_name: currentExtractedData?.candidate_first_name || "",
        candidate_last_name: currentExtractedData?.candidate_last_name || "",
        resume_uploaded: currentExtractedData?.resume_uploaded || "",
        salary_expected: currentExtractedData?.salary_expected || "",
        total_fields_count: currentExtractedData?.total_fields_count || 0,
        required_fields_count: currentExtractedData?.required_fields_count || 0,
        optional_fields_count: currentExtractedData?.optional_fields_count || 0,
        required_unanswered_count: currentExtractedData?.required_unanswered_count || 0,
        is_already_applied: currentExtractedData?.is_already_applied || false,
        already_applied_message: currentExtractedData?.already_applied_message || "",
        screenshots_count: formattedScreenshots.length,
        screenshots: formattedScreenshots,
        all_entries: currentExtractedData?.all_entries || []
      },

      // Captured page screenshots across steps / answered questions / final submit
      screenshots: formattedScreenshots,

      // Custom screening Q&A captured from the form
      screening_answers: currentExtractedData?.screening_answers || {},
      screening_qa: currentExtractedData?.screening_qa || [],
      validation_errors: val?.errors || [],
      validation_warnings: val?.warnings || [],
      submission_notes: isAlreadyApplied ? (currentExtractedData?.already_applied_message || "Portal indicates you have already applied to this position.") : (isSubmissionSuccess ? (currentExtractedData?.submission_success_message || "Verified submission confirmation on portal.") : (isManualConfirm ? "Confirmed via Apply-Flow Gatekeeper HUD" : "Auto-verified on Form Submit Event")),
      timestamp: new Date().toISOString()
    };

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "LOG_SUBMISSION",
        action: "APPLYFLOW_WEBHOOK",
        serverUrl: serverUrl,
        payload
      }, (res) => {
        const isOk = Boolean(res && (res.success || res.status === 200 || res.status === 201));
        if (isOk) {
          currentDuplicateRecord = {
            appliedAt: new Date().toISOString(),
            status: jobStatus === 'ALREADY_APPLIED' ? 'ALREADY_APPLIED' : 'APPLIED',
            profile_assigned: effectiveProfileName,
            applier_id: effectiveApplierId,
            message: `Application submitted & confirmed in Apply-Flow.`
          };
          try {
            const rawB = sessionStorage.getItem('applyflow_bound_session');
            if (rawB) {
              const b = JSON.parse(rawB);
              b.status = currentDuplicateRecord.status;
              b.appliedAt = currentDuplicateRecord.appliedAt;
              sessionStorage.setItem('applyflow_bound_session', JSON.stringify(b));
            }
          } catch (_) {}

          SubmissionHUD.setQuickApplyStatus('submitted', '🎉 Submitted successfully to Apply-Flow!');
          restrictPortalInteractions(true, currentDuplicateRecord);
        } else {
          SubmissionHUD.setQuickApplyStatus('idle');
          SubmissionHUD.showToast(`⚠️ Apply-Flow did not confirm submission: ${res?.error || 'Server error'}`);
        }
        resolve(res);
      });
    });
  }

  async function confirmAndLogSubmissionManually() {
    // ── GUARD 0: Context Profile Mismatch Guard ──
    runExtractionAndValidation();
    const hasMismatch = (currentValidation?.errors || []).some(e => e.rule === 'CONTEXT_PROFILE_MISMATCH') || hasContextMismatchCheck();
    if (hasMismatch) {
      SubmissionHUD.showToast("🚫 Submission blocked: Active profile does not match the candidate assigned to this job in Apply-Flow.");
      SubmissionHUD.toggleDrawer(true);
      return { success: false, reason: "CONTEXT_PROFILE_MISMATCH" };
    }

    // Visual feedback: immediately indicate submission in progress
    SubmissionHUD.setQuickApplyStatus('submitting', '⏳ Submitting to Apply-Flow...');
    SubmissionHUD.showToast('⏳ Submitting application to Apply-Flow...');

    const currentUrl = window.location.href.split('#')[0];
    loggedSubmissionUrl = currentUrl;
    const res = await logPayloadToBackend("PASSED", currentValidation, true);
    const isOk = Boolean(res && (res.success || res.status === 200 || res.status === 201));

    if (!isOk) {
      SubmissionHUD.setQuickApplyStatus('idle');
      SubmissionHUD.showToast(`⚠️ Could not confirm with Apply-Flow: ${res?.error || 'Server error'}`);
      return res;
    }

    currentDuplicateRecord = {
      appliedAt: new Date().toISOString(),
      status: 'APPLIED',
      profile_assigned: activeProfile?.fullName || 'Candidate',
      applier_id: currentSettings?.applierId || 'Applier',
      message: `Confirmed and logged to Apply-Flow on ${new Date().toLocaleDateString()}`
    };
    currentValidation.isAlreadyApplied = true;
    currentValidation.errors = (currentValidation.errors || []).filter(
      e => {
        const s = String(e.rule || '').toUpperCase();
        return !s.includes('REQUIRED') && !s.includes('EMPTY') && !s.includes('MISSING') && !s.includes('RESUME') && !s.includes('UNANSWERED') && !s.includes('FILE');
      }
    );
    currentValidation.isValid = currentValidation.errors.length === 0;

    try {
      const rawB = sessionStorage.getItem('applyflow_bound_session');
      const b = rawB ? JSON.parse(rawB) : {};
      b.status = 'APPLIED';
      b.appliedAt = currentDuplicateRecord.appliedAt;
      b.profileName = currentDuplicateRecord.profile_assigned;
      sessionStorage.setItem('applyflow_bound_session', JSON.stringify(b));
    } catch (_) {}

    SubmissionHUD.setQuickApplyStatus('submitted', "🎉 Submission successfully logged to Apply-Flow!");
    restrictPortalInteractions(true, currentDuplicateRecord);
    SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, currentDuplicateRecord);
    SubmissionHUD.updateDrawer(currentExtractedData, currentValidation);
    SubmissionHUD.showToast("🎉 Application successfully submitted & logged to Apply-Flow!");
    return res;
  }

  async function markAsAlreadyAppliedManually() {
    runExtractionAndValidation();
    const currentUrl = window.location.href.split('#')[0];
    loggedSubmissionUrl = currentUrl;

    // Protection check: If already submitted in ApplyFlow, prevent downgrade
    const existingStatus = (applyFlowContext?.status || applyFlowContext?.job_status || '').toUpperCase();
    if (existingStatus === 'SUBMITTED' || existingStatus === 'APPLIED') {
      SubmissionHUD.showToast("🛡️ Job is already marked as SUBMITTED in Apply-Flow. Status protected.");
      return { success: true, protected: true };
    }

    const res = await logPayloadToBackend("ALREADY_APPLIED", currentValidation);
    SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, { status: "ALREADY_APPLIED" });
    SubmissionHUD.showToast("📌 Status updated to 'Already Applied' in Apply-Flow!");
    return res;
  }

  async function markAsPortalFailedManually(reasonKey = 'PORTAL_ACCESS_FAILED', failCount = 1) {
    const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
    const effectiveJobId = sessionStorage.getItem('applyflow_job_id') || applyFlowParams.jobId || window.__SQC_PERSISTED_AF_SESSION?.jobId || currentExtractedData?.req_id || "";
    const effectiveProfileId = sessionStorage.getItem('applyflow_profile_id') || applyFlowParams.profileId || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || "";
    const effectiveApplierId = sessionStorage.getItem('applyflow_applier_id') || applyFlowParams.applierId || window.__SQC_PERSISTED_AF_SESSION?.applierId || currentSettings?.applierId || "Applier";
    const effectiveProfileName = applyFlowParams.profileName || window.__SQC_PERSISTED_AF_SESSION?.profileName || activeProfile?.fullName || "Candidate";

    const reasonLabels = {
      'PORTAL_ACCESS_FAILED': 'Portal login failed — could not access the application form',
      'LOGIN_FAILED': 'Portal login failed after multiple attempts',
      'CAPTCHA_BLOCKED': 'CAPTCHA verification failed — human intervention required',
      'ACCOUNT_LOCKED': 'Candidate portal account may be locked',
      'PORTAL_DOWN': 'Employer portal appears to be down or unreachable',
      'ACTIVATION_REQUIRED': 'Portal account activation required before application can proceed',
    };
    const humanReason = reasonLabels[reasonKey] || `Portal access failure: ${reasonKey}`;

    const payload = {
      job_id: effectiveJobId,
      profile_id: effectiveProfileId,
      applier_id: effectiveApplierId,
      profile_name: effectiveProfileName,
      candidate_id: effectiveProfileId,

      // Status for ApplyFlow to handle
      job_status: "PORTAL_ACCESS_FAILED",
      validation_status: "PORTAL_ACCESS_FAILED",
      block_reason: reasonKey,
      failure_count: failCount,
      is_final_submission: false,
      submission_confirmed_by: "MANUAL_HUD_FLAG",

      submission_notes: `${humanReason}. Attempted ${failCount} time(s). Manual intervention or re-attempt required.`,

      extracted_data: {
        job_id: effectiveJobId,
        profile_id: effectiveProfileId,
        req_id: currentExtractedData?.req_id || "",
        job_title: currentExtractedData?.job_title || "Application Role",
        company: currentExtractedData?.company || "Employer",
        job_url: currentExtractedData?.job_url || window.location.href,
        email_entered: currentExtractedData?.email_entered || activeProfile?.primaryEmail || "",
        candidate_name: currentExtractedData?.candidate_name || activeProfile?.fullName || "",
        resume_uploaded: "",
        total_fields_count: 0,
      },

      validation_errors: [],
      validation_warnings: [`Portal access failed after ${failCount} attempt(s). Job requires manual re-attempt or alternate portal login.`],
      timestamp: new Date().toISOString()
    };

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "LOG_SUBMISSION",
        payload
      }, (res) => {
        SubmissionHUD.showToast(`🔴 Portal access failure logged to Apply-Flow (${failCount} attempt${failCount > 1 ? 's' : ''}).`);
        resolve(res);
      });
    });
  }

  async function reportBlockedStatus(reasonKey, customMessage) {
    runExtractionAndValidation();
    const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
    const effectiveJobId = applyFlowParams.jobId || sessionStorage.getItem('applyflow_job_id') || window.__SQC_PERSISTED_AF_SESSION?.jobId || "";
    const effectiveProfileId = applyFlowParams.profileId || sessionStorage.getItem('applyflow_profile_id') || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || "";
    const effectiveApplierId = applyFlowParams.applierId || sessionStorage.getItem('applyflow_applier_id') || window.__SQC_PERSISTED_AF_SESSION?.applierId || currentSettings?.applierId || "Applier";
    const effectiveProfileName = applyFlowParams.profileName || sessionStorage.getItem('applyflow_profile_name') || window.__SQC_PERSISTED_AF_SESSION?.profileName || activeProfile?.fullName || "Candidate";

    const payload = {
      job_id: effectiveJobId,
      profile_id: effectiveProfileId,
      applier_id: effectiveApplierId,
      profile_name: effectiveProfileName,
      candidate_id: effectiveProfileId,
      job_status: "BLOCKED",
      validation_status: "BLOCKED",
      block_reason: reasonKey,
      submission_notes: customMessage || `Application blocked: ${reasonKey}`,
      extracted_data: {
        job_id: effectiveJobId,
        profile_id: effectiveProfileId,
        req_id: currentExtractedData?.req_id || "",
        job_title: currentExtractedData?.job_title || "Application Role",
        company: currentExtractedData?.company || "Employer",
        job_url: currentExtractedData?.job_url || window.location.href,
      },
      timestamp: new Date().toISOString()
    };

    chrome.runtime.sendMessage({
      type: "LOG_SUBMISSION",
      payload
    }, () => {});

    SubmissionHUD.showToast(`⚠️ Job flagged as '${reasonKey === "EMAIL_OTP_REQUIRED" ? "Needs Email OTP" : "Login Issue"}' in Apply-Flow!`);
  }

  async function rejectJobManually(reasonKey = 'UNMET_REQUIREMENT_GITHUB', customNotes = '') {
    runExtractionAndValidation();
    const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
    const effectiveJobId = sessionStorage.getItem('applyflow_job_id') || applyFlowParams.jobId || window.__SQC_PERSISTED_AF_SESSION?.jobId || currentExtractedData?.req_id || "";
    const effectiveProfileId = sessionStorage.getItem('applyflow_profile_id') || applyFlowParams.profileId || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || "";
    const effectiveApplierId = sessionStorage.getItem('applyflow_applier_id') || applyFlowParams.applierId || window.__SQC_PERSISTED_AF_SESSION?.applierId || currentSettings?.applierId || "Applier";
    const effectiveProfileName = applyFlowParams.profileName || window.__SQC_PERSISTED_AF_SESSION?.profileName || activeProfile?.fullName || "Candidate";

    const reasonDescriptions = {
      'UNMET_REQUIREMENT_GITHUB': 'Job strictly requires a GitHub Profile URL, but candidate has no GitHub profile configured.',
      'STRICT_REQUIREMENT_UNMET': 'Job requires strict qualifications or credentials not held by candidate.',
      'PORTAL_INELIGIBLE': 'Candidate does not meet strict eligibility criteria for this portal requisition.'
    };
    const defaultNotes = reasonDescriptions[reasonKey] || `Job application rejected due to unmet requirement: ${reasonKey}`;

    const payload = {
      job_id: effectiveJobId,
      profile_id: effectiveProfileId,
      applier_id: effectiveApplierId,
      profile_name: effectiveProfileName,
      candidate_id: effectiveProfileId,
      job_status: "REJECTED",
      validation_status: "INELIGIBLE_REQUIREMENT",
      block_reason: reasonKey,
      is_final_submission: false,
      submission_confirmed_by: "MANUAL_HUD_REJECT",
      submission_notes: customNotes || defaultNotes,
      extracted_data: {
        job_id: effectiveJobId,
        profile_id: effectiveProfileId,
        req_id: currentExtractedData?.req_id || "",
        job_title: currentExtractedData?.job_title || "Application Role",
        company: currentExtractedData?.company || "Employer",
        job_url: currentExtractedData?.job_url || window.location.href,
        email_entered: currentExtractedData?.email_entered || activeProfile?.primaryEmail || "",
        candidate_name: currentExtractedData?.candidate_name || activeProfile?.fullName || "",
        resume_uploaded: "",
        total_fields_count: currentExtractedData?.total_fields_count || 0
      },
      validation_errors: currentValidation.errors,
      validation_warnings: currentValidation.warnings,
      timestamp: new Date().toISOString()
    };

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "LOG_SUBMISSION",
        payload
      }, (res) => {
        SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, { status: "REJECTED", message: "Job marked as Ineligible / Rejected in Apply-Flow." });
        SubmissionHUD.showToast(`🚫 Job rejected in Apply-Flow: ${reasonKey}`);
        resolve(res);
      });
    });
  }

  return {
    init,
    reloadConfig: fetchConfig,
    runLiveCheck: runExtractionAndValidation,
    attachApplyFlowJobId,
    restoreForm: restoreFormManually,
    confirmAndLogSubmission: confirmAndLogSubmissionManually,
    markAsAlreadyApplied: markAsAlreadyAppliedManually,
    markAsPortalFailed: markAsPortalFailedManually,
    rejectJob: rejectJobManually,
    reportBlockedStatus,
    captureScreenshot: capturePageScreenshot,
    deleteScreenshot,
    getScreenshots: () => sessionScreenshots
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.SubmissionCheckerCore.init());
} else {
  window.SubmissionCheckerCore.init();
}
