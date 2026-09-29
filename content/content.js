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
  let isSubmittingProgrammatically = false;
  let debounceTimer = null;

  async function init() {
    try {
      // Don't inject or run on the backend dashboard command center itself
      if (window.location.hostname === 'localhost' && (window.location.pathname === '/' || window.location.pathname === '/index.html')) {
        return;
      }

      await fetchConfig();

      // Attempt automated form restoration from saved session / candidate profile on refresh/load
      tryAutoRestore();

      // Run initial field extraction and staggered passes for dynamic SPA forms (Jobvite, Workday, Paylocity, etc.)
      runExtractionAndValidation();
      setTimeout(() => { tryAutoRestore(); runExtractionAndValidation(); }, 300);
      setTimeout(() => { tryAutoRestore(); runExtractionAndValidation(); }, 1000);
      setTimeout(() => { tryAutoRestore(); runExtractionAndValidation(); }, 2000);

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

  function tryAutoRestore() {
    if (!activeProfile) return;
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
    if (!activeProfile) return { count: 0 };
    const res = JobFormExtractor.restoreSavedForm(activeProfile, currentSettings);
    runExtractionAndValidation();
    return res;
  }

  async function fetchConfig() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_CONFIG" }, (res) => {
        if (res && res.success) {
          activeProfile = res.activeProfile;
          currentSettings = res.settings;
          allProfiles = res.profiles || [];
          if (res.persistedSession) {
            window.__SQC_PERSISTED_AF_SESSION = res.persistedSession;
          }
          SubmissionHUD.init(allProfiles, activeProfile, currentSettings);
        }
        resolve();
      });
    });
  }

  let duplicateCheckedUrl = null;
  let loggedAlreadyAppliedUrl = null;
  let applyFlowContext = null;
  let contextFetchedKey = null;

  function syncApplyFlowContext() {
    const params = JobFormExtractor.extractApplyFlowParams();
    const jobId = params.jobId || sessionStorage.getItem('applyflow_job_id') || window.__SQC_PERSISTED_AF_SESSION?.jobId || '';
    const profileId = params.profileId || sessionStorage.getItem('applyflow_profile_id') || window.__SQC_PERSISTED_AF_SESSION?.profileId || '';
    const profileName = params.profileName || sessionStorage.getItem('applyflow_profile_name') || window.__SQC_PERSISTED_AF_SESSION?.profileName || '';
    const applierId = params.applierId || sessionStorage.getItem('applyflow_applier_id') || window.__SQC_PERSISTED_AF_SESSION?.applierId || '';

    // If active params are detected on this page, immediately persist them to background storage
    if (jobId || profileId) {
      chrome.runtime.sendMessage({
        type: "PERSIST_REDIRECT_TRACKING",
        data: {
          jobId,
          profileId,
          profileName,
          applierId,
          sourceUrl: window.location.href,
          timestamp: Date.now()
        }
      }).catch(() => {});
    }

    SubmissionHUD.updateApplyFlowInfo(params, applyFlowContext);

    if (!jobId && !profileId) return;
    const key = `${jobId}_${profileId}`;
    if (contextFetchedKey === key) return;
    contextFetchedKey = key;

    chrome.runtime.sendMessage({
      type: "FETCH_APPLYFLOW_CONTEXT",
      jobId,
      profileId
    }, (res) => {
      if (res && res.success && res.data) {
        applyFlowContext = res.data;
        SubmissionHUD.updateApplyFlowInfo(params, applyFlowContext);
        SubmissionHUD.updateDrawer(currentExtractedData, currentValidation);
      }
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
    }).catch(() => {});

    contextFetchedKey = null;
    syncApplyFlowContext();
    runExtractionAndValidation();
  }

  function handleAlreadyAppliedNotice(data, val) {
    if (!data || !data.is_already_applied) return;
    // Do NOT automatically overwrite Apply-Flow status. 
    // State is passed to SubmissionHUD so the user can review and explicitly confirm if it's pending.
  }

  function checkDuplicateJob(data) {
    if (!data || !activeProfile) return;
    const currentUrl = window.location.href.split('?')[0];
    if (duplicateCheckedUrl === currentUrl) return;
    duplicateCheckedUrl = currentUrl;

    chrome.runtime.sendMessage({
      type: "CHECK_DUPLICATE_JOB",
      candidateId: activeProfile.id,
      jobUrl: window.location.href,
      company: data.company,
      jobTitle: data.job_title,
      reqId: data.req_id
    }, (res) => {
      if (res && res.already_applied) {
        SubmissionHUD.updateState(allProfiles, activeProfile, currentSettings, res.existingRecord);
        SubmissionHUD.updateDrawer(currentExtractedData, currentValidation);
      }
    });
  }

  // Synchronous extraction and validation
  function runExtractionAndValidation() {
    try {
      currentExtractedData = JobFormExtractor.extractAllFields();
      currentValidation = JobFormValidator.validate(currentExtractedData, activeProfile, currentSettings);

      // Sync Apply-Flow tracking & context
      syncApplyFlowContext();

      // Check for previously submitted duplicate in backend
      checkDuplicateJob(currentExtractedData);

      // Auto-sync already applied state to Apply-Flow backend if detected on portal
      handleAlreadyAppliedNotice(currentExtractedData, currentValidation);

      // Update Floating HUD
      SubmissionHUD.updateDrawer(currentExtractedData, currentValidation);

      // Update glowing outlines on page
      SubmissionHUD.updateFieldHighlights(currentValidation.fieldErrorMap);

      // Highlight CAPTCHAs & human checks
      highlightCaptchaChallenge(currentExtractedData?.captcha_detected);

      // Stream live field snapshot to backend
      streamLiveSnapshot(currentExtractedData, currentValidation);
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

    chrome.runtime.sendMessage({
      type: "DISPATCH_LIVE_FEEDBACK",
      payload: {
        applier_id: currentSettings?.applierId || "Applier",
        candidate_id: activeProfile?.id,
        profile_assigned: activeProfile?.fullName || "Unassigned",
        portal_job_id: data.portal_job_id || "",
        job_id: data.portal_job_id || data.req_id || "",
        job_status: data.is_already_applied ? "ALREADY_APPLIED" : (val?.isValid ? "READY" : "IN_PROGRESS"),
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
          all_entries: data.all_entries
        },
        is_valid: val?.isValid,
        error_count: val?.errors?.length || 0,
        timestamp: new Date().toISOString()
      }
    }).catch(() => {});
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
        scheduleLiveExtraction();
      }, true); // Capture phase ensures we hear it immediately
    });

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
    if (el.closest('#sqc-hud-container, #sqc-modal-overlay')) return false;

    // Quick Apply is handled separately by the verification watcher
    if (isQuickApplyTrigger(el)) return false;

    // 1. Text Content Analysis
    const text = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();

    // NEVER treat intermediate step buttons as final submit!
    if (/^(next|next step|continue|save & continue|save and continue|proceed|back|previous|prev|upload|choose file|browse)$/i.test(text)) {
      return false;
    }

    // 2. Explicit Submit button markers
    if (['submit application', 'submit', 'apply now', 'send application', 'complete application', 'submit profile', 'finish and submit'].includes(text)) {
      return true;
    }

    // 3. Automation IDs
    const autoId = (el.getAttribute('data-automation-id') || el.getAttribute('data-qa') || '').toLowerCase();
    if (autoId.includes('submit') || autoId.includes('apply-button') || autoId.includes('submitbutton')) {
      if (!autoId.includes('next') && !autoId.includes('continue')) return true;
    }

    // 4. Tag & type (only if text indicates submit or isn't next/continue)
    if ((el.tagName === 'BUTTON' || el.tagName === 'INPUT') && (el.type === 'submit')) {
      if (/submit|apply|send|finish/i.test(text) || !text) {
        return true;
      }
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
    // A. Intercept Clicks on Submit & Quick Apply Buttons
    window.addEventListener('click', (event) => {
      if (isSubmittingProgrammatically) return;

      const target = event.target;
      if (!target) return;

      // Handle Quick Apply / 1-Click Apply initiation
      if (isQuickApplyTrigger(target)) {
        console.log("[Submission Checker] Quick Apply button clicked. Initiating verification watcher...");
        runExtractionAndValidation();
        startQuickApplyVerificationWatcher();
        // Allow native event to proceed to open the dialog or trigger the platform's action
        return;
      }

      if (!isSubmitTarget(target)) return;

      const submitBtn = target.closest('button, input[type="submit"], [role="button"]') || target;

      // Synchronously extract and validate
      runExtractionAndValidation();

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

      // --- VALID SUBMISSION OR AUDIT MODE ---
      const status = currentValidation.isValid ? "PASSED" : "FLAGGED_IN_AUDIT";
      logPayloadToBackend(status, currentValidation);
    }, true);

    // B. Intercept Form Submit Events (e.g. Enter key inside input)
    document.addEventListener('submit', (event) => {
      if (isSubmittingProgrammatically) return;
      if (event.target && event.target.closest && event.target.closest('#sqc-hud-container, #sqc-modal-overlay')) return;

      runExtractionAndValidation();

      const isAuditMode = currentSettings?.interceptionMode === 'audit';

      if (!currentValidation.isValid && !isAuditMode) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        SubmissionHUD.showBlockingModal(currentValidation, async () => {
          await logPayloadToBackend("OVERRIDDEN_FAILED", currentValidation);
          isSubmittingProgrammatically = true;
          event.target.submit();
          setTimeout(() => { isSubmittingProgrammatically = false; }, 500);
        });

        return;
      }

      const status = currentValidation.isValid ? "PASSED" : "FLAGGED_IN_AUDIT";
      logPayloadToBackend(status, currentValidation);
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
    window.addEventListener('click', (event) => {
      const target = event.target;
      if (!target) return;

      const link = target.closest('a') || (target.tagName === 'A' ? target : null);
      if (!link || !link.href || link.href.startsWith('javascript:')) return;

      const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
      const effectiveJobId = applyFlowParams.jobId || sessionStorage.getItem('applyflow_job_id') || window.__SQC_PERSISTED_AF_SESSION?.jobId || "";
      const effectiveProfileId = applyFlowParams.profileId || sessionStorage.getItem('applyflow_profile_id') || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || "";
      const effectiveProfileName = applyFlowParams.profileName || sessionStorage.getItem('applyflow_profile_name') || window.__SQC_PERSISTED_AF_SESSION?.profileName || activeProfile?.fullName || "";
      const effectiveApplierId = applyFlowParams.applierId || sessionStorage.getItem('applyflow_applier_id') || window.__SQC_PERSISTED_AF_SESSION?.applierId || currentSettings?.applierId || "";

      if (effectiveJobId || effectiveProfileId) {
        // 1. Persist to Background Storage so new tabs / redirects have it
        chrome.runtime.sendMessage({
          type: "PERSIST_REDIRECT_TRACKING",
          data: {
            jobId: effectiveJobId,
            profileId: effectiveProfileId,
            profileName: effectiveProfileName,
            applierId: effectiveApplierId,
            company: currentExtractedData?.company || '',
            jobTitle: currentExtractedData?.job_title || '',
            sourceUrl: window.location.href,
            timestamp: Date.now()
          }
        }).catch(() => {});

        // 2. Append hash parameters directly to destination URL
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

  async function logPayloadToBackend(status, val) {
    const applyFlowParams = JobFormExtractor.extractApplyFlowParams();
    const effectiveJobId = sessionStorage.getItem('applyflow_job_id') || applyFlowParams.jobId || window.__SQC_PERSISTED_AF_SESSION?.jobId || currentExtractedData?.portal_job_id || currentExtractedData?.req_id || "";
    const effectiveProfileId = sessionStorage.getItem('applyflow_profile_id') || applyFlowParams.profileId || window.__SQC_PERSISTED_AF_SESSION?.profileId || activeProfile?.id || "";
    const effectiveApplierId = sessionStorage.getItem('applyflow_applier_id') || applyFlowParams.applierId || window.__SQC_PERSISTED_AF_SESSION?.applierId || currentSettings?.applierId || "Applier";
    const effectiveProfileName = applyFlowParams.profileName || window.__SQC_PERSISTED_AF_SESSION?.profileName || activeProfile?.fullName || "Candidate";

    const isAlreadyApplied = Boolean(currentExtractedData?.is_already_applied);
    const jobStatus = isAlreadyApplied ? "ALREADY_APPLIED" : (val?.isValid ? "SUBMITTED" : "REJECTED");
    const validationStatus = val?.isValid ? "PASSED" : (status.includes("OVERRIDDEN") ? "OVERRIDDEN_FAILED" : (status.includes("FLAGGED") ? "WARNING" : "FAILED"));

    const payload = {
      job_id: effectiveJobId,
      profile_id: effectiveProfileId,
      applier_id: effectiveApplierId,
      profile_name: effectiveProfileName,
      candidate_id: effectiveProfileId,

      // Apply-Flow Status: "SUBMITTED" (marks APPLIED), "ALREADY_APPLIED", or "REJECTED"
      job_status: jobStatus,
      validation_status: validationStatus,

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
        all_entries: currentExtractedData?.all_entries || []
      },

      // Custom screening Q&A captured from the form
      screening_answers: currentExtractedData?.screening_answers || {},
      screening_qa: currentExtractedData?.screening_qa || [],
      validation_errors: val?.errors || [],
      validation_warnings: val?.warnings || [],
      submission_notes: "Auto-verified by SQC Extension",
      timestamp: new Date().toISOString()
    };

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "LOG_SUBMISSION",
        payload
      }, (res) => {
        resolve(res);
      });
    });
  }

  async function confirmAndLogSubmissionManually() {
    runExtractionAndValidation();
    const currentUrl = window.location.href.split('#')[0];
    loggedSubmissionUrl = currentUrl;
    const res = await logPayloadToBackend("PASSED", currentValidation);
    SubmissionHUD.setQuickApplyStatus('submitted', "🎉 Submission successfully logged to Apply-Flow!");
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

  return {
    init,
    reloadConfig: fetchConfig,
    runLiveCheck: runExtractionAndValidation,
    attachApplyFlowJobId,
    restoreForm: restoreFormManually,
    confirmAndLogSubmission: confirmAndLogSubmissionManually,
    markAsAlreadyApplied: markAsAlreadyAppliedManually,
    reportBlockedStatus
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.SubmissionCheckerCore.init());
} else {
  window.SubmissionCheckerCore.init();
}
