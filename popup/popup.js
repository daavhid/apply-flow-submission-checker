/**
 * Submission Quality Checker - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profileSelect = document.getElementById('profile-select');
  const profileEmail = document.getElementById('profile-email');
  const profileSalary = document.getElementById('profile-salary');
  const profileStack = document.getElementById('profile-stack');
  const modeActiveBtn = document.getElementById('mode-active');
  const modeAuditBtn = document.getElementById('mode-audit');
  const webhookUrl = document.getElementById('webhook-url');
  const submissionsList = document.getElementById('submissions-list');

  const lockBadge = document.getElementById('lock-badge');
  const btnAdminUnlock = document.getElementById('btn-admin-unlock');
  const adminAuthBox = document.getElementById('admin-auth-box');
  const adminTargetProfile = document.getElementById('admin-target-profile');
  const adminPasskeyInput = document.getElementById('admin-passkey-input');
  const adminAuthError = document.getElementById('admin-auth-error');
  const btnCancelAdmin = document.getElementById('btn-cancel-admin');
  const btnSubmitAdmin = document.getElementById('btn-submit-admin');

  let config = null;

  async function loadData() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_CONFIG" }, (res) => {
        config = res;
        render();
        resolve();
      });
    });
  }

  async function loadHistory() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (res) => {
        renderHistory(res.history || []);
        resolve();
      });
    });
  }

  function render() {
    if (!config) return;

    const { profiles, settings, activeProfile } = config;
    const isLocked = settings.isProfileLocked !== false;

    // Render Profiles Dropdown
    profileSelect.innerHTML = (profiles || []).map(p => `
      <option value="${p.id}" ${activeProfile && activeProfile.id === p.id ? 'selected' : ''}>
        ${p.fullName}
      </option>
    `).join('');

    // If locked, disable direct select
    profileSelect.disabled = isLocked;
    if (lockBadge) {
      lockBadge.innerText = isLocked ? "🔒 Locked" : "🔓 Unlocked";
      lockBadge.style.background = isLocked ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)";
      lockBadge.style.color = isLocked ? "#fca5a5" : "#86efac";
    }

    // Populate admin target dropdown
    if (adminTargetProfile) {
      adminTargetProfile.innerHTML = (profiles || []).map(p => `
        <option value="${p.id}" ${activeProfile && activeProfile.id === p.id ? 'selected' : ''}>
          ${p.fullName} (${p.targetStack || 'Dev'})
        </option>
      `).join('');
    }

    // Render Active Details
    if (activeProfile) {
      profileEmail.innerText = activeProfile.primaryEmail;
      profileSalary.innerText = `$${(activeProfile.salaryFloor || 0).toLocaleString()}`;
      profileStack.innerText = activeProfile.targetStack || 'General';
    }

    // Render Mode
    const isAudit = settings.interceptionMode === 'audit';
    modeActiveBtn.classList.toggle('active', !isAudit);
    modeAuditBtn.classList.toggle('active', isAudit);

    // Render Webhook URL
    webhookUrl.innerText = settings.backendWebhookUrl || "None (Local Only)";

    // Render Quick Automation Toggle
    const autoBadge = document.getElementById('toggle-autofill-quick');
    if (autoBadge) {
      const isAuto = settings.autoAutofillOnPageLoad !== false;
      autoBadge.innerText = isAuto ? "Auto: ON" : "Auto: OFF";
      autoBadge.style.background = isAuto ? "rgba(124, 58, 237, 0.25)" : "rgba(100, 116, 139, 0.25)";
      autoBadge.style.color = isAuto ? "#c4b5fd" : "#94a3b8";
      autoBadge.style.borderColor = isAuto ? "rgba(167, 139, 250, 0.5)" : "rgba(100, 116, 139, 0.4)";
    }

    // Detect Apply-Flow on Active Tab
    checkTabApplyFlow();
  }

  async function checkTabApplyFlow() {
    const afBadge = document.getElementById('af-status-badge');
    const afTabJob = document.getElementById('af-tab-job-id');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const tab = tabs[0];
      const urlStr = tab.url || '';

      try {
        const u = new URL(urlStr);
        const searchParams = u.searchParams;
        const rawHash = (u.hash || '').replace(/^#/, '');
        const hashQuery = rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : rawHash;
        const hashParams = new URLSearchParams(hashQuery);
        const getParam = (key) => searchParams.get(key) || hashParams.get(key);
        const jobId = getParam('job_id') || getParam('sqc_job_id') || getParam('portal_job_id');

        if (jobId) {
          if (afBadge) {
            afBadge.innerText = "🟢 Synced";
            afBadge.style.background = "rgba(34, 197, 94, 0.2)";
            afBadge.style.color = "#86efac";
            afBadge.style.borderColor = "rgba(34, 197, 94, 0.4)";
          }
          if (afTabJob) {
            afTabJob.innerText = jobId.slice(0, 16) + (jobId.length > 16 ? '...' : '');
            afTabJob.title = jobId;
          }
        } else {
          if (afBadge) {
            afBadge.innerText = "🟠 No Hash/Query";
            afBadge.style.background = "rgba(245, 158, 11, 0.2)";
            afBadge.style.color = "#fde68a";
            afBadge.style.borderColor = "rgba(245, 158, 11, 0.4)";
          }
          if (afTabJob) {
            afTabJob.innerText = "Untracked URL";
          }
        }
      } catch (e) {
        if (afBadge) afBadge.innerText = "Standby";
      }
    });
  }

  function renderHistory(history) {
    if (!history || history.length === 0) {
      submissionsList.innerHTML = '<div class="empty-state">No submissions recorded yet</div>';
      return;
    }

    const recent = history.slice(0, 5);
    submissionsList.innerHTML = recent.map(sub => {
      const data = sub.extracted_data || {};
      const status = sub.validation_status || "UNKNOWN";
      let tagClass = 'passed';
      if (status.includes('FAIL') || status.includes('BLOCK')) tagClass = 'blocked';
      if (status.includes('OVERRIDDEN')) tagClass = 'overridden';

      return `
        <div class="sub-item">
          <div class="sub-info">
            <span class="sub-job">${escapeHtml(data.job_title || 'Application')}</span>
            <span class="sub-company">${escapeHtml(data.company || 'Company')} • ${new Date(sub.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <span class="sub-status-tag ${tagClass}">${escapeHtml(status)}</span>
        </div>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  // Profile change when unlocked
  profileSelect.addEventListener('change', (e) => {
    const profileId = e.target.value;
    chrome.runtime.sendMessage({ type: "SET_ACTIVE_PROFILE", profileId }, (res) => {
      if (!res.success && res.isLocked) {
        alert("Profile is locked. Please use 'Admin Unlock & Reassign' with the Admin Token.");
      }
      loadData();
    });
  });

  // Admin Unlock Box controls
  btnAdminUnlock?.addEventListener('click', () => {
    adminAuthBox.style.display = adminAuthBox.style.display === 'none' ? 'block' : 'none';
    adminPasskeyInput.value = '';
    adminAuthError.style.display = 'none';
    if (adminAuthBox.style.display === 'block') {
      adminPasskeyInput.focus();
    }
  });

  btnCancelAdmin?.addEventListener('click', () => {
    adminAuthBox.style.display = 'none';
    adminPasskeyInput.value = '';
    adminAuthError.style.display = 'none';
  });

  btnSubmitAdmin?.addEventListener('click', () => {
    const token = adminPasskeyInput.value.trim();
    const profileId = adminTargetProfile.value;
    const activeStackKey = document.getElementById('admin-target-stack')?.value || 'dotnet';

    if (!token) {
      adminAuthError.innerText = "Please enter the Admin Token / Passkey.";
      adminAuthError.style.display = 'block';
      return;
    }

    chrome.runtime.sendMessage({
      type: "ADMIN_UNLOCK_PROFILE",
      adminToken: token,
      profileId: profileId,
      activeStackKey: activeStackKey
    }, (res) => {
      if (res && res.success) {
        adminAuthBox.style.display = 'none';
        adminPasskeyInput.value = '';
        adminAuthError.style.display = 'none';
        loadData();
      } else {
        adminAuthError.innerText = res?.error || "Incorrect Admin Token.";
        adminAuthError.style.display = 'block';
      }
    });
  });

  // Mode toggles
  modeActiveBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: "SET_INTERCEPTION_MODE", mode: "active" }, () => {
      loadData();
    });
  });

  modeAuditBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: "SET_INTERCEPTION_MODE", mode: "audit" }, () => {
      loadData();
    });
  });

  // Quick Automation toggle
  document.getElementById('toggle-autofill-quick')?.addEventListener('click', () => {
    if (!config || !config.settings) return;
    const current = config.settings.autoAutofillOnPageLoad !== false;
    const updated = !current;
    chrome.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: { ...config.settings, autoAutofillOnPageLoad: updated }
    }, (res) => {
      if (res && res.success) {
        config.settings = res.settings;
        render();
      }
    });
  });

  // Quick navigation buttons
  document.getElementById('open-options-btn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('open-full-dashboard')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('view-all-history')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('open-test-bench')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('test-bench/index.html') });
  });

  // Initial load
  await loadData();
  await loadHistory();
});
