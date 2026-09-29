/**
 * Submission Quality Checker - Live Floating HUD & Visual UI Overlay
 * Segmented, uncluttered dashboard, clean blocking modal, field highlights, and toast notices.
 */

window.SubmissionHUD = (function () {
  'use strict';

  let containerEl = null;
  let pillEl = null;
  let drawerEl = null;
  let modalEl = null;
  let isDrawerOpen = false;
  let activeTab = 'checks'; // 'checks' | 'fields' | 'applyflow' | 'payload'
  let activeTooltips = [];

  let currentProfile = null;
  let currentSettings = null;
  let currentDuplicateRecord = null;
  let allProfiles = [];
  let currentApplyFlowParams = null;
  let currentApplyFlowContext = null;
  let quickApplyState = 'idle'; // 'idle' | 'pending' | 'submitted'

  // Initialize HUD in DOM (Only in TOP window to avoid duplicate floating buttons)
  function init(profiles, activeProfile, settings) {
    if (window !== window.top) return;

    allProfiles = profiles || [];
    currentProfile = activeProfile;
    currentSettings = settings;

    if (document.getElementById('sqc-hud-container')) {
      containerEl = document.getElementById('sqc-hud-container');
    } else {
      containerEl = document.createElement('div');
      containerEl.id = 'sqc-hud-container';
      document.body.appendChild(containerEl);
    }

    renderPill();
    setupDraggable(pillEl);
  }

  function updateState(profiles, activeProfile, settings, duplicateRecord) {
    allProfiles = profiles || allProfiles;
    currentProfile = activeProfile || currentProfile;
    currentSettings = settings || currentSettings;
    currentDuplicateRecord = duplicateRecord !== undefined ? duplicateRecord : currentDuplicateRecord;
  }

  function updateApplyFlowInfo(params, context) {
    currentApplyFlowParams = params || currentApplyFlowParams;
    currentApplyFlowContext = context || currentApplyFlowContext;
  }

  function setQuickApplyStatus(status, message) {
    quickApplyState = status || 'idle';
    renderPill();
    if (message) {
      showToast(message);
    }
  }

  // Render Draggable Floating Pill Badge
  function renderPill(validationResult = null, extractedData = null) {
    if (!containerEl) return;

    const errCount = validationResult ? validationResult.errorCount : 0;
    const warnCount = validationResult ? validationResult.warningCount : 0;
    const isAlreadyApplied = Boolean(validationResult?.isAlreadyApplied || currentDuplicateRecord);
    const hasCaptcha = Boolean(extractedData?.captcha_detected?.has_captcha);
    const candidateName = currentProfile ? currentProfile.fullName : "No Profile";
    const isAuditMode = currentSettings?.interceptionMode === 'audit';
    const isAfLinked = Boolean(currentApplyFlowParams?.jobId);

    const isAfSubmitted = ['SUBMITTED', 'APPLIED'].includes((currentApplyFlowContext?.status || currentApplyFlowContext?.job_status || '').toUpperCase());

    let dotClass = '';
    let badgeHtml = '';

    if (quickApplyState === 'pending') {
      dotClass = 'pending';
      badgeHtml = `<span class="sqc-badge-counter pending">⏳ Verifying...</span>`;
    } else if (quickApplyState === 'submitted' || isAfSubmitted) {
      dotClass = 'success';
      badgeHtml = `<span class="sqc-badge-counter success">Submitted ✓</span>`;
    } else if (isAlreadyApplied) {
      dotClass = 'warning';
      badgeHtml = `<span class="sqc-badge-counter warning">Already Applied</span>`;
    } else if (errCount > 0) {
      dotClass = 'danger';
      badgeHtml = `<span class="sqc-badge-counter danger">${errCount} Issue${errCount > 1 ? 's' : ''}</span>`;
    } else if (hasCaptcha) {
      dotClass = 'warning';
      badgeHtml = `<span class="sqc-badge-counter warning">🤖 CAPTCHA</span>`;
    } else if (warnCount > 0) {
      dotClass = 'warning';
      badgeHtml = `<span class="sqc-badge-counter warning">${warnCount} Warn</span>`;
    } else {
      dotClass = isAfLinked ? 'success' : 'warning';
      badgeHtml = `<span class="sqc-badge-counter success">${isAfLinked ? 'Ready' : 'Unlinked'}</span>`;
    }

    if (!pillEl) {
      pillEl = document.createElement('div');
      pillEl.className = 'sqc-pill';
      pillEl.addEventListener('click', (e) => {
        if (pillEl.dataset.isDragging === 'true') return;
        toggleDrawer();
      });
      containerEl.appendChild(pillEl);
    }

    pillEl.innerHTML = `
      <div class="sqc-status-dot ${dotClass}"></div>
      <div class="sqc-pill-text">${escapeHtml(candidateName)}</div>
      ${badgeHtml}
      ${isAfLinked ? '<span class="sqc-pill-af">⚡ AF</span>' : ''}
      ${isAuditMode ? '<span class="sqc-pill-audit">Audit</span>' : ''}
    `;
  }

  function toggleDrawer(forceOpen = null) {
    isDrawerOpen = forceOpen !== null ? forceOpen : !isDrawerOpen;
    if (isDrawerOpen) {
      if (!drawerEl) {
        drawerEl = document.createElement('div');
        drawerEl.className = 'sqc-drawer';
        containerEl.appendChild(drawerEl);
      }
      drawerEl.style.display = 'flex';
      if (window.SubmissionCheckerCore) {
        window.SubmissionCheckerCore.runLiveCheck();
      }
    } else if (drawerEl) {
      drawerEl.style.display = 'none';
    }
  }

  // Render Redesigned, Segmented, Non-Jampacked Drawer
  function updateDrawer(extractedData, validationResult) {
    renderPill(validationResult, extractedData);

    if (!isDrawerOpen || !drawerEl) return;

    const p = currentProfile || { fullName: 'Unassigned', primaryEmail: 'None' };
    const errs = validationResult?.errors || [];
    const warns = validationResult?.warnings || [];
    const isLocked = currentSettings?.isProfileLocked !== false;
    const isAlreadyApplied = Boolean(validationResult?.isAlreadyApplied || extractedData?.is_already_applied || currentDuplicateRecord);
    const afParams = currentApplyFlowParams || {};
    const afContext = currentApplyFlowContext || {};
    const afStatus = (afContext.status || afContext.job_status || '').toUpperCase();
    const isJobAlreadyMarkedSubmitted = ['SUBMITTED', 'APPLIED'].includes(afStatus);
    const hasAfJob = Boolean(afParams.jobId);
    const allEntries = extractedData?.all_entries || [];

    const profileOptions = allProfiles.map(prof => `
      <option value="${prof.id}" ${prof.id === p.id ? 'selected' : ''}>${escapeHtml(prof.fullName)} (${escapeHtml(prof.targetStack || 'Dev')})</option>
    `).join('');

    // --- Tab 1: Checks Content ---
    let checksTabHtml = '';

    if (extractedData?.captcha_detected?.has_captcha) {
      checksTabHtml += `
        <div class="sqc-captcha-banner">
          <span class="icon">🤖</span>
          <div>
            <strong>${escapeHtml(extractedData.captcha_detected.type || 'Human Verification')} Detected</strong>
            <p style="margin:2px 0 0 0; font-size:11px; opacity:0.9;">Form fields and screening answers have been automated. Please complete the CAPTCHA / human verification puzzle manually before submitting.</p>
          </div>
        </div>
      `;
    }
    if (isAlreadyApplied) {
      const alreadyAppliedMsg = validationResult?.alreadyAppliedMessage || extractedData?.already_applied_message || "Portal indicates you have already applied to this position.";
      
      if (isJobAlreadyMarkedSubmitted) {
        checksTabHtml += `
          <div class="sqc-banner success">
            <span>✅</span>
            <div>
              <strong>Application Submitted & Confirmed</strong><br>
              <span style="font-size:11px; opacity:0.9;">Apply-Flow queue status is verified as Applied. ${escapeHtml(alreadyAppliedMsg)}</span>
            </div>
          </div>
        `;
      } else {
        checksTabHtml += `
          <div class="sqc-banner warning" style="flex-direction:column; gap:8px;">
            <div style="display:flex; gap:8px; align-items:flex-start;">
              <span>⚠️</span>
              <div>
                <strong>Portal Shows Already Applied</strong><br>
                <span style="font-size:11px; opacity:0.9;">${escapeHtml(alreadyAppliedMsg)} Job in Apply-Flow is currently ${afStatus ? `"${escapeHtml(afStatus)}"` : 'pending'}.</span>
              </div>
            </div>
            <button class="sqc-btn sqc-btn-warning sqc-btn-sm" id="sqc-btn-mark-already-applied" style="align-self:flex-start; margin-top:2px;">
              📌 Update Status to "Already Applied" in Apply-Flow
            </button>
          </div>
        `;
      }
    }

    if (errs.length > 0 || warns.length > 0) {
      checksTabHtml += `
        <div class="sqc-issues-box">
          <div class="sqc-issues-header">
            <span>🚨 Active Validation Issues (${errs.length + warns.length})</span>
            <span class="sqc-badge-pill ${errs.length > 0 ? 'danger' : 'warning'}">${errs.length > 0 ? 'Hard Block' : 'Warning'}</span>
          </div>
          <div class="sqc-issues-list">
            ${errs.map(e => `
              <div class="sqc-issue-item danger">
                <span>🚫</span>
                <div>
                  <strong>${escapeHtml(e.rule || 'ERROR')}:</strong>
                  <span>${escapeHtml(e.message)}</span>
                </div>
              </div>
            `).join('')}
            ${warns.map(w => `
              <div class="sqc-issue-item warning">
                <span>⚠️</span>
                <div>
                  <strong>${escapeHtml(w.rule || 'WARN')}:</strong>
                  <span>${escapeHtml(w.message)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    checksTabHtml += `
      <div class="sqc-checklist">
        ${renderCheckItem("1. Identity & Name/Email Match", errs.find(e => e.rule.includes('IDENTITY') || e.rule.includes('EMAIL')), warns.find(w => w.rule.includes('EMAIL')), "Candidate identity matches active profile")}
        ${renderCheckItem("2. Resume Attachment & Stack", errs.find(e => e.rule.includes('RESUME')), null, `Uploaded: ${extractedData?.resume_uploaded || 'None detected'}`)}
        ${renderCheckItem("3. Screening Questions & Compliance", errs.find(e => e.rule.includes('SCREENING') || e.rule.includes('WORK_AUTH') || e.rule.includes('PROFILE_RECORD') || e.rule.includes('ELIGIBILITY')), null, "17-Category Profile Questions verified")}
        ${renderCheckItem(
          "4. Compensation & Salary Floor",
          errs.find(e => e.rule.includes('SALARY')),
          warns.find(w => w.rule.includes('SALARY')),
          extractedData?.jd_salary?.has_jd_salary
            ? `JD: ${extractedData.jd_salary.raw} → Auto-Target: $${Number(extractedData?.salary_expected || p.compensation?.desiredSalary || p.salaryFloor || 120000).toLocaleString()}`
            : `Default Base: $${(p.compensation?.desiredSalary || p.salaryFloor || 120000).toLocaleString()} (No JD salary listed)`
        )}
        ${hasAfJob 
          ? renderCheckItem("5. Apply-Flow Job Queue Sync", null, null, `Linked: ${afParams.jobId.slice(0, 14)}...`)
          : renderCheckItem("5. Apply-Flow Job Queue Sync", null, { message: "Untracked Job: Missing #job_id= in URL" }, "Missing tracking payload")}
      </div>
    `;

    // Unanswered / open screening questions count
    const unansweredEntries = allEntries.filter(e => {
      if (!e || !e.label) return false;
      const canon = e.label.toLowerCase();
      if (canon.includes('first name') || canon.includes('last name') || canon.includes('email') || canon.includes('phone') || canon.includes('resume')) return false;
      return e.unanswered || e.type === 'textarea' || e.required || e.is_required;
    });
    const unansweredCount = unansweredEntries.length;

    // --- Tab 2: Captured Fields Content ---
    let fieldsTabHtml = `
      <div class="sqc-ai-bar">
        <div class="sqc-ai-bar-title">
          <span>🤖</span>
          <span><strong>AI Answer Assistant</strong> (${unansweredCount} needed)</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="sqc-btn-ai" id="sqc-btn-copy-ai-prompt" title="Copy full prompt tailored with candidate resume, JD, and questions for ChatGPT">📋 Copy Prompt</button>
          <button class="sqc-btn-ai-outline" id="sqc-btn-paste-ai-answers" title="Paste response from ChatGPT to auto-fill form">📥 Paste Answers</button>
        </div>
      </div>

      <div class="sqc-fields-summary">
        <span>Captured Fields: <strong>${allEntries.length}</strong></span>
        <span style="color:#93c5fd;">Required: ${extractedData?.required_fields_count || 0}</span>
      </div>
      <div class="sqc-fields-list">
        ${allEntries.length === 0 ? '<div class="sqc-empty">No form fields detected yet.</div>' : allEntries.map(e => `
          <div class="sqc-field-row">
            <div class="sqc-field-label">
              <span>${escapeHtml(e.label)}</span>
              ${e.required || e.is_required ? '<span class="sqc-req-tag">*req</span>' : ''}
            </div>
            <div class="sqc-field-val ${e.unanswered ? 'unanswered' : ''}">
              ${escapeHtml(e.value || '(blank)')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // --- Tab 3: Apply-Flow Content ---
    let applyFlowTabHtml = `
      <div class="sqc-af-card ${hasAfJob ? 'linked' : 'unlinked'}">
        <div class="sqc-af-header">
          <div style="display:flex; align-items:center; gap:6px;">
            <div class="sqc-af-dot ${hasAfJob ? 'green' : 'orange'}"></div>
            <strong>${hasAfJob ? 'Apply-Flow Live Connected' : 'Apply-Flow Not Linked'}</strong>
          </div>
          <span class="sqc-af-pill">${hasAfJob ? '⚡ Synced' : 'Missing #job_id'}</span>
        </div>

        ${hasAfJob ? `
          <div class="sqc-af-row"><span class="k">Job ID:</span><span class="v mono">${escapeHtml(afParams.jobId)}</span></div>
          ${afParams.profileName ? `<div class="sqc-af-row"><span class="k">Candidate:</span><span class="v">${escapeHtml(afParams.profileName)}</span></div>` : ''}
          ${afContext.targetSalary ? `<div class="sqc-af-row"><span class="k">Target Salary:</span><span class="v" style="color:#fde047;">${escapeHtml(afContext.targetSalary)}</span></div>` : ''}
          ${afContext.techStack ? `<div class="sqc-tech-tags">${afContext.techStack.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        ` : `
          <p style="font-size:11px; color:#cbd5e1; margin:6px 0 10px 0;">URL does not contain <code>#job_id=...</code> query parameters from Apply-Flow.</p>
          <div class="sqc-af-attach-box">
            <input type="text" id="sqc-af-input-job-id" placeholder="Paste Apply-Flow Job ID..." />
            <button id="sqc-btn-attach-job-id">⚡ Link</button>
          </div>
        `}
      </div>

      <div class="sqc-card" style="margin-top:12px;">
        <div class="sqc-card-header"><span>Job Metadata</span></div>
        <div class="sqc-job-row"><span class="k">Job Title:</span><span class="v" title="${escapeHtml(extractedData.job_title)}">${escapeHtml(extractedData.job_title)}</span></div>
        <div class="sqc-job-row"><span class="k">Company:</span><span class="v" title="${escapeHtml(extractedData.company)}">${escapeHtml(extractedData.company)}</span></div>
        <div class="sqc-job-row"><span class="k">ATS Platform:</span><span class="v">${escapeHtml(extractedData.ats_domain)} ${extractedData.req_id ? '(' + escapeHtml(extractedData.req_id) + ')' : ''}</span></div>
        ${extractedData.jd_salary?.has_jd_salary ? `
          <div class="sqc-job-row"><span class="k">JD Pay Budget:</span><span class="v" style="color:#86efac; font-weight:600;">${escapeHtml(extractedData.jd_salary.raw)}</span></div>
        ` : ''}
      </div>
    `;

    // --- Tab 4: Raw JSON Payload ---
    let payloadTabHtml = `
      <div class="sqc-raw-json-container">
        <pre class="sqc-raw-json">${escapeHtml(JSON.stringify(cleanPayloadForView(extractedData, p), null, 2))}</pre>
      </div>
    `;

    drawerEl.innerHTML = `
      <!-- Top Header -->
      <div class="sqc-header">
        <div class="sqc-title">
          <span>🛡️</span>
          <span>Quality Gatekeeper</span>
          <span class="sqc-mode-tag">${currentSettings?.interceptionMode === 'audit' ? 'Audit' : 'Gate'}</span>
        </div>
        <button class="sqc-close-btn" id="sqc-drawer-close">✕</button>
      </div>

      <!-- Candidate Assignment Selector Bar -->
      <div class="sqc-candidate-bar">
        <div class="sqc-candidate-info">
          <div class="sqc-candidate-top">
            <span class="sqc-candidate-name">${escapeHtml(p.fullName)}</span>
            <span class="sqc-lock-tag ${isLocked ? 'locked' : 'unlocked'}">${isLocked ? '🔒 Locked' : '🔓 Unlocked'}</span>
          </div>
          <div class="sqc-candidate-sub">Floor: $${(p.salaryFloor || 0).toLocaleString()} | Stack: ${escapeHtml(p.targetStack || 'Dev')}</div>
        </div>
        <div class="sqc-candidate-actions">
          ${isLocked ? '<button class="sqc-btn-subtle" id="sqc-btn-hud-unlock">🔑 Admin</button>' : ''}
          <button class="sqc-btn-subtle" id="sqc-open-options">⚙️</button>
        </div>
      </div>

      <!-- Admin Unlock Box (Hidden by default) -->
      <div id="sqc-hud-admin-box" class="sqc-admin-box" style="display:none;">
        <div class="sqc-admin-title">🔑 Admin Candidate & Stack Reassignment</div>
        <select id="sqc-hud-target-profile" class="sqc-select-sm">${profileOptions}</select>
        <select id="sqc-hud-target-stack" class="sqc-select-sm">
          <option value="dotnet">Full Stack C# / .NET Track</option>
          <option value="python">Full Stack Python / FastAPI Track</option>
          <option value="php">Full Stack PHP / Laravel Track</option>
          <option value="auto">Auto-Detect Stack per Job</option>
        </select>
        <input type="password" id="sqc-hud-passkey" placeholder="Enter Admin Token..." class="sqc-input-sm" />
        <div id="sqc-hud-admin-err" class="sqc-err-sm" style="display:none;"></div>
        <div style="display:flex; gap:6px; margin-top:4px;">
          <button id="sqc-hud-cancel-admin" class="sqc-btn sqc-btn-secondary sqc-btn-sm">Cancel</button>
          <button id="sqc-hud-submit-admin" class="sqc-btn sqc-btn-primary sqc-btn-sm">Reassign</button>
        </div>
      </div>

      <!-- Segmented Navigation Tabs -->
      <div class="sqc-nav-tabs">
        <button class="sqc-tab-btn ${activeTab === 'checks' ? 'active' : ''}" data-tab="checks">
          <span>🛡️</span> Checks ${errs.length > 0 ? `<span class="sqc-tab-badge danger">${errs.length}</span>` : ''}
        </button>
        <button class="sqc-tab-btn ${activeTab === 'fields' ? 'active' : ''}" data-tab="fields">
          <span>📋</span> Fields (${allEntries.length})
        </button>
        <button class="sqc-tab-btn ${activeTab === 'applyflow' ? 'active' : ''}" data-tab="applyflow">
          <span>⚡</span> Apply-Flow
        </button>
        <button class="sqc-tab-btn ${activeTab === 'payload' ? 'active' : ''}" data-tab="payload">
          <span>🔍</span> Payload
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="sqc-body">
        <div class="sqc-tab-content ${activeTab === 'checks' ? 'active' : ''}" id="sqc-tab-checks">
          ${checksTabHtml}
        </div>
        <div class="sqc-tab-content ${activeTab === 'fields' ? 'active' : ''}" id="sqc-tab-fields">
          ${fieldsTabHtml}
        </div>
        <div class="sqc-tab-content ${activeTab === 'applyflow' ? 'active' : ''}" id="sqc-tab-applyflow">
          ${applyFlowTabHtml}
        </div>
        <div class="sqc-tab-content ${activeTab === 'payload' ? 'active' : ''}" id="sqc-tab-payload">
          ${payloadTabHtml}
        </div>
      </div>

      <!-- Actions Footer -->
      <div class="sqc-actions">
        <button class="sqc-btn sqc-btn-confirm-apply" id="sqc-btn-confirm-apply" title="Confirm that this 1-click / Quick Apply submission completed and log to Apply-Flow">⚡ Confirm</button>
        <button class="sqc-btn sqc-btn-autofill" id="sqc-btn-restore" title="Autofill blank inputs using candidate profile and custom fields">⚡ Restore</button>
        <button class="sqc-btn sqc-btn-ai" id="sqc-btn-copy-ai-footer" title="Copy tailored ChatGPT prompt with Candidate Resume, JD, and Questions">🤖 AI Prompt</button>
        <button class="sqc-btn sqc-btn-secondary" id="sqc-btn-paste-ai-footer" title="Paste JSON/answers from ChatGPT to auto-fill form">📥 Paste</button>
        <button class="sqc-btn sqc-btn-primary" id="sqc-btn-copy" title="Copy clean payload JSON">📋 JSON</button>
      </div>
    `;

    // Bind Tab Switching Events
    drawerEl.querySelectorAll('.sqc-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        drawerEl.querySelectorAll('.sqc-tab-btn').forEach(b => b.classList.remove('active'));
        drawerEl.querySelectorAll('.sqc-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        drawerEl.querySelector(`#sqc-tab-${activeTab}`)?.classList.add('active');
      });
    });

    drawerEl.querySelector('#sqc-drawer-close')?.addEventListener('click', () => toggleDrawer(false));
    drawerEl.querySelector('#sqc-open-options')?.addEventListener('click', () => chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }));

    // AI Prompt Copy Handlers
    const handleCopyAiPrompt = () => {
      try {
        const bundle = JobFormExtractor.generateChatGptPrompt(currentProfile, extractedData, null);
        if (bundle.questionCount === 0) {
          showToast("ℹ️ No open-ended questions detected on this page (standard fields are filled via ⚡ Restore).");
          return;
        }
        navigator.clipboard.writeText(bundle.prompt).then(() => {
          showToast(`📋 Copied ChatGPT Prompt with Resume, JD & ${bundle.questionCount} Open-Ended Question${bundle.questionCount === 1 ? '' : 's'}! Paste into ChatGPT.`);
        }).catch(() => {
          showToast("⚠️ Could not access clipboard.");
        });
      } catch (err) {
        console.error(err);
        showToast("⚠️ Notice: Error generating AI prompt.");
      }
    };
    drawerEl.querySelector('#sqc-btn-copy-ai-prompt')?.addEventListener('click', handleCopyAiPrompt);
    drawerEl.querySelector('#sqc-btn-copy-ai-footer')?.addEventListener('click', handleCopyAiPrompt);

    // AI Answers Paste Modal Handlers
    const handleOpenAiModal = () => {
      openAiPasteModal();
    };
    drawerEl.querySelector('#sqc-btn-paste-ai-answers')?.addEventListener('click', handleOpenAiModal);
    drawerEl.querySelector('#sqc-btn-paste-ai-footer')?.addEventListener('click', handleOpenAiModal);

    // Manual Confirm & Log Submission button
    drawerEl.querySelector('#sqc-btn-confirm-apply')?.addEventListener('click', async () => {
      if (window.SubmissionCheckerCore) {
        const btn = drawerEl.querySelector('#sqc-btn-confirm-apply');
        if (btn) btn.innerText = "⏳ Logging...";
        const res = await window.SubmissionCheckerCore.confirmAndLogSubmission();
        if (btn) btn.innerText = "⚡ Confirm";
        if (res && res.success) {
          showToast("🎉 Submission successfully logged to Apply-Flow!");
          toggleDrawer(false);
        } else {
          showToast("⚠️ Notice: Log recorded locally.");
        }
      }
    });

    // Mark as Already Applied button (for pending jobs)
    drawerEl.querySelector('#sqc-btn-mark-already-applied')?.addEventListener('click', async () => {
      if (window.SubmissionCheckerCore) {
        const btn = drawerEl.querySelector('#sqc-btn-mark-already-applied');
        if (btn) btn.innerText = "⏳ Updating...";
        const res = await window.SubmissionCheckerCore.markAsAlreadyApplied();
        if (btn) btn.innerText = "📌 Updated!";
        if (res && res.success) {
          toggleDrawer(false);
        }
      }
    });

    // Restore button
    drawerEl.querySelector('#sqc-btn-restore')?.addEventListener('click', () => {
      if (window.SubmissionCheckerCore) {
        const res = window.SubmissionCheckerCore.restoreForm();
        showToast(`⚡ Restored ${res?.count || 0} form fields from saved session / candidate profile!`);
      }
    });

    // Rescan button
    drawerEl.querySelector('#sqc-btn-rescan')?.addEventListener('click', () => {
      if (window.SubmissionCheckerCore) {
        window.SubmissionCheckerCore.runLiveCheck();
      }
    });

    // Copy button
    drawerEl.querySelector('#sqc-btn-copy')?.addEventListener('click', () => {
      const payload = cleanPayloadForView(extractedData, p);
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      const btn = drawerEl.querySelector('#sqc-btn-copy');
      if (btn) {
        btn.innerText = "✅ Copied!";
        setTimeout(() => { btn.innerText = "📋 Copy"; }, 1500);
      }
    });

    // Admin unlock toggle
    const adminBox = drawerEl.querySelector('#sqc-hud-admin-box');
    const adminErr = drawerEl.querySelector('#sqc-hud-admin-err');
    const passkeyInput = drawerEl.querySelector('#sqc-hud-passkey');

    drawerEl.querySelector('#sqc-btn-hud-unlock')?.addEventListener('click', () => {
      if (adminBox) {
        adminBox.style.display = adminBox.style.display === 'none' ? 'block' : 'none';
        if (adminBox.style.display === 'block') passkeyInput?.focus();
      }
    });

    drawerEl.querySelector('#sqc-hud-cancel-admin')?.addEventListener('click', () => {
      if (adminBox) adminBox.style.display = 'none';
    });

    drawerEl.querySelector('#sqc-hud-submit-admin')?.addEventListener('click', () => {
      const token = passkeyInput?.value?.trim();
      const targetProf = drawerEl.querySelector('#sqc-hud-target-profile')?.value;
      const targetStack = drawerEl.querySelector('#sqc-hud-target-stack')?.value || 'dotnet';

      if (!token) {
        if (adminErr) {
          adminErr.innerText = "Please enter Admin Token.";
          adminErr.style.display = 'block';
        }
        return;
      }

      chrome.runtime.sendMessage({
        type: "ADMIN_UNLOCK_PROFILE",
        adminToken: token,
        profileId: targetProf,
        activeStackKey: targetStack
      }, (res) => {
        if (res && res.success) {
          if (adminBox) adminBox.style.display = 'none';
          if (window.SubmissionCheckerCore) window.SubmissionCheckerCore.reloadConfig();
        } else {
          if (adminErr) {
            adminErr.innerText = res?.error || "Invalid Admin Token.";
            adminErr.style.display = 'block';
          }
        }
      });
    });

    drawerEl.querySelector('#sqc-btn-attach-job-id')?.addEventListener('click', () => {
      const val = drawerEl.querySelector('#sqc-af-input-job-id')?.value?.trim();
      if (!val) return alert("Please paste an Apply-Flow Job ID.");
      if (window.SubmissionCheckerCore) window.SubmissionCheckerCore.attachApplyFlowJobId(val);
    });
  }

  function showToast(message) {
    const existing = document.getElementById('sqc-toast-notice');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'sqc-toast-notice';
    toast.className = 'sqc-toast';
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    }, 3200);
  }

  function renderCheckItem(title, errObj, warnObj, defaultDesc) {
    const isFail = !!errObj;
    const isWarn = !errObj && !!warnObj;
    const statusClass = isFail ? 'fail' : (isWarn ? 'warn' : 'pass');
    const icon = isFail ? '❌' : (isWarn ? '⚠️' : '✅');
    const desc = errObj ? errObj.message : (warnObj ? warnObj.message : defaultDesc);

    return `
      <div class="sqc-check-item ${statusClass}">
        <div class="sqc-check-icon">${icon}</div>
        <div class="sqc-check-content">
          <div class="sqc-check-title">${escapeHtml(title)}</div>
          <div class="sqc-check-desc">${escapeHtml(desc)}</div>
        </div>
      </div>
    `;
  }

  // Update In-Page Outlines and Tooltips
  function updateFieldHighlights(fieldMap) {
    const currentElements = new Set();

    if (fieldMap) {
      fieldMap.forEach((errList, element) => {
        if (!element || !document.body.contains(element)) return;
        currentElements.add(element);

        const hasFatal = errList.some(e => !e.isWarning);
        element.classList.toggle('sqc-field-error', hasFatal);
        element.classList.toggle('sqc-field-warning', !hasFatal);

        const errorText = errList.map(e => e.message).join(' | ');

        let tooltip = element._sqcTooltip;
        if (!tooltip || !document.body.contains(tooltip)) {
          tooltip = document.createElement('div');
          tooltip.className = `sqc-field-tooltip ${hasFatal ? '' : 'warning'}`;
          document.body.appendChild(tooltip);
          element._sqcTooltip = tooltip;
          activeTooltips.push(tooltip);
        }

        if (tooltip.innerText !== errorText) {
          tooltip.innerText = errorText;
        }
        tooltip.className = `sqc-field-tooltip ${hasFatal ? '' : 'warning'}`;

        const rect = element.getBoundingClientRect();
        const top = `${rect.bottom + window.scrollY + 2}px`;
        const left = `${Math.max(10, rect.left + window.scrollX)}px`;

        if (tooltip.style.top !== top) tooltip.style.top = top;
        if (tooltip.style.left !== left) tooltip.style.left = left;
      });
    }

    for (let i = activeTooltips.length - 1; i >= 0; i--) {
      const tooltip = activeTooltips[i];
      let hasOwner = false;
      currentElements.forEach(el => {
        if (el._sqcTooltip === tooltip) hasOwner = true;
      });
      if (!hasOwner) {
        tooltip.remove();
        activeTooltips.splice(i, 1);
      }
    }

    document.querySelectorAll('.sqc-field-error, .sqc-field-warning').forEach(el => {
      if (!currentElements.has(el)) {
        el.classList.remove('sqc-field-error', 'sqc-field-warning');
        if (el._sqcTooltip) {
          el._sqcTooltip.remove();
          el._sqcTooltip = null;
        }
      }
    });
  }

  // Render Crisp, Non-Cluttered Blocking Modal on Submit
  function showBlockingModal(validationResult, onOverride) {
    removeBlockingModal();

    modalEl = document.createElement('div');
    modalEl.id = 'sqc-modal-overlay';

    const p = currentProfile || { fullName: 'Candidate' };
    const allowOverride = currentSettings?.allowOverride !== false;
    const errors = validationResult.errors || [];

    const errorItemsHtml = errors.map(err => `
      <div class="sqc-modal-err-item">
        <span class="sqc-modal-err-icon">🚫</span>
        <div>
          <strong class="sqc-modal-err-rule">${escapeHtml(err.rule || 'VALIDATION ERROR')}</strong>
          <div class="sqc-modal-err-msg">${escapeHtml(err.message)}</div>
        </div>
      </div>
    `).join('');

    modalEl.innerHTML = `
      <div class="sqc-modal-box">
        <div class="sqc-modal-header">
          <div class="sqc-modal-icon">🛑</div>
          <div>
            <div class="sqc-modal-title">Submission Blocked by Quality Gatekeeper</div>
            <div class="sqc-modal-subtitle">Candidate: <strong>${escapeHtml(p.fullName)}</strong></div>
          </div>
        </div>

        <div class="sqc-modal-body">
          <p class="sqc-modal-desc">
            The Gatekeeper prevented this application from submitting due to critical verification mismatches:
          </p>

          <div class="sqc-error-list">
            ${errorItemsHtml}
          </div>
        </div>

        <div class="sqc-modal-actions">
          <button class="sqc-btn sqc-btn-secondary" id="sqc-modal-fix">🔧 Review & Fix Form</button>
          ${allowOverride ? '<button class="sqc-btn sqc-btn-danger" id="sqc-modal-override">⚠️ Override & Submit Anyway</button>' : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    modalEl.querySelector('#sqc-modal-fix')?.addEventListener('click', () => {
      removeBlockingModal();
      toggleDrawer(true);
    });

    modalEl.querySelector('#sqc-modal-override')?.addEventListener('click', () => {
      removeBlockingModal();
      if (onOverride) onOverride();
    });
  }

  function removeBlockingModal() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
  }

  // Draggable logic for Floating Pill
  function setupDraggable(el) {
    if (!el) return;
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = containerEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      const onMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          isDragging = true;
          el.dataset.isDragging = 'true';
          containerEl.style.left = `${initialLeft + dx}px`;
          containerEl.style.top = `${initialTop + dy}px`;
          containerEl.style.right = 'auto';
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        setTimeout(() => {
          el.dataset.isDragging = 'false';
        }, 50);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  
  let aiModalEl = null;
  function openAiPasteModal() {
    if (aiModalEl) aiModalEl.remove();

    aiModalEl = document.createElement('div');
    aiModalEl.className = 'sqc-ai-modal-overlay';
    aiModalEl.innerHTML = `
      <div class="sqc-ai-modal-card">
        <div class="sqc-ai-modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:20px;">🤖</span>
            <div>
              <div style="font-weight:700; color:#fff; font-size:14px;">Paste ChatGPT Answers & Auto-Fill</div>
              <div style="font-size:11px; color:#c4b5fd;">Paste JSON or answer text from ChatGPT</div>
            </div>
          </div>
          <button class="sqc-close-btn" id="sqc-ai-modal-close" style="background:none; border:none; color:#cbd5e1; font-size:16px; cursor:pointer;">✕</button>
        </div>
        <div class="sqc-ai-modal-body">
          <p style="margin:0; font-size:12px; color:#cbd5e1; line-height:1.4;">
            Paste the response from ChatGPT below. The extension will map each answer to the corresponding question on the application page and auto-fill them.
          </p>
          <textarea id="sqc-ai-paste-textarea" class="sqc-ai-modal-textarea" placeholder="Paste ChatGPT JSON output here (e.g. { &quot;answers&quot;: [ ... ] } or Question: Answer format)..."></textarea>
          <div id="sqc-ai-modal-status" style="font-size:11px; display:none;"></div>
        </div>
        <div class="sqc-ai-modal-actions">
          <button class="sqc-btn sqc-btn-secondary" id="sqc-ai-modal-cancel" style="max-width:100px;">Cancel</button>
          <button class="sqc-btn sqc-btn-ai" id="sqc-ai-modal-submit" style="max-width:180px;">⚡ Auto-Fill</button>
        </div>
      </div>
    `;

    document.body.appendChild(aiModalEl);

    aiModalEl.querySelector('#sqc-ai-modal-close')?.addEventListener('click', () => aiModalEl?.remove());
    aiModalEl.querySelector('#sqc-ai-modal-cancel')?.addEventListener('click', () => aiModalEl?.remove());

    aiModalEl.querySelector('#sqc-ai-modal-submit')?.addEventListener('click', () => {
      const textarea = aiModalEl.querySelector('#sqc-ai-paste-textarea');
      const statusDiv = aiModalEl.querySelector('#sqc-ai-modal-status');
      const val = textarea?.value?.trim();

      if (!val) {
        if (statusDiv) {
          statusDiv.style.display = 'block';
          statusDiv.style.color = '#f87171';
          statusDiv.innerText = 'Please paste the ChatGPT output first.';
        }
        return;
      }

      const res = JobFormExtractor.applyParsedAnswers(val);
      if (res && res.success) {
        showToast(`🎉 Successfully auto-filled ${res.count} questions from ChatGPT!`);
        aiModalEl?.remove();
        if (window.SubmissionCheckerCore) {
          window.SubmissionCheckerCore.runLiveCheck();
        }
      } else {
        if (statusDiv) {
          statusDiv.style.display = 'block';
          statusDiv.style.color = '#f87171';
          statusDiv.innerText = res.error || 'Could not find matching form fields for the answers provided.';
        }
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
        screening_answers: extractedData.screening_answers,
        all_entries: extractedData.all_entries
      },
      timestamp: new Date().toISOString()
    };
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
    updateState,
    updateApplyFlowInfo,
    setQuickApplyStatus,
    showToast,
    updateDrawer,
    updateFieldHighlights,
    showBlockingModal,
    removeBlockingModal,
    toggleDrawer
  };
})();
