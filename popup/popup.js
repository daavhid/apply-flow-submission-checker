/**
 * Submission Quality Checker - Executive Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profileSelect = document.getElementById('profile-select');
  const profileEmail = document.getElementById('profile-email');
  const profileSalary = document.getElementById('profile-salary');
  const profileStack = document.getElementById('profile-stack');
  const modeActiveBtn = document.getElementById('mode-active');
  const modeAuditBtn = document.getElementById('mode-audit');
  const webhookUrl = document.getElementById('webhook-url');
  const webhookStatus = document.getElementById('webhook-status');

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

  function render() {
    if (!config) return;

    const { profiles, settings, activeProfile } = config;
    const isLocked = settings.isProfileLocked !== false;

    // Render Profiles Dropdown
    if (profileSelect) {
      const visibleProfiles = (profiles || []).filter(p => !p.archived || (activeProfile && activeProfile.id === p.id));
      profileSelect.innerHTML = visibleProfiles.map(p => `
        <option value="${p.id}" ${activeProfile && activeProfile.id === p.id ? 'selected' : ''}>
          ${escapeHtml(p.fullName)}${p.archived ? ' [Archived]' : ''}
        </option>
      `).join('');
      profileSelect.disabled = isLocked;
    }

    if (lockBadge) {
      lockBadge.innerText = isLocked ? "🔒 Locked" : "🔓 Unlocked";
      lockBadge.style.background = isLocked ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)";
      lockBadge.style.color = isLocked ? "#fca5a5" : "#86efac";
    }

    // Populate admin target dropdown
    if (adminTargetProfile) {
      adminTargetProfile.innerHTML = (profiles || []).map(p => `
        <option value="${p.id}" ${activeProfile && activeProfile.id === p.id ? 'selected' : ''}>
          ${escapeHtml(p.fullName)} (${escapeHtml(p.targetStack || 'Dev')})${p.archived ? ' [Archived]' : ''}
        </option>
      `).join('');
    }

    // Render Active Details
    if (activeProfile) {
      if (profileEmail) profileEmail.innerText = activeProfile.primaryEmail || 'None';
      if (profileSalary) profileSalary.innerText = `$${(activeProfile.salaryFloor || 0).toLocaleString()}`;
      if (profileStack) profileStack.innerText = activeProfile.targetStack || 'General Track';
      const profileStrategy = document.getElementById('profile-strategy');
      if (profileStrategy) {
        const isTailored = activeProfile.tailoringMode === 'tailored';
        profileStrategy.innerText = isTailored ? '✨ Tailoring Method' : '📄 Base Method';
        profileStrategy.style.color = isTailored ? '#c084fc' : '#93c5fd';
        profileStrategy.style.fontWeight = '600';
      }
    }

    // Render Interception Mode
    const isAudit = settings.interceptionMode === 'audit';
    if (modeActiveBtn) modeActiveBtn.classList.toggle('active', !isAudit);
    if (modeAuditBtn) modeAuditBtn.classList.toggle('active', isAudit);

    // Render Webhook URL & Status
    if (webhookUrl) {
      webhookUrl.innerText = settings.backendWebhookUrl || "None (Local Audit Only)";
    }
    if (webhookStatus) {
      const isConfigured = !!settings.backendWebhookUrl && !settings.backendWebhookUrl.includes('localhost');
      webhookStatus.innerText = isConfigured ? "Live Target" : "Local Logging";
      webhookStatus.style.background = isConfigured ? "rgba(34, 197, 94, 0.2)" : "rgba(100, 116, 139, 0.2)";
      webhookStatus.style.color = isConfigured ? "#86efac" : "#94a3b8";
    }

    // Render Quick Automation Toggle
    const autoFillText = document.getElementById('auto-fill-text');
    if (autoFillText) {
      const isAuto = settings.autoAutofillOnPageLoad !== false;
      autoFillText.innerText = isAuto ? "Auto: ON" : "Auto: OFF";
    }

    // Detect Apply-Flow on Active Tab
    checkTabApplyFlow();
  }

  async function checkTabApplyFlow() {
    const afBadge = document.getElementById('af-status-badge');
    const afDot = document.getElementById('af-status-dot');

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
          if (afBadge) afBadge.innerText = `Synced (${jobId.slice(0, 12)}...)`;
          if (afDot) {
            afDot.className = "status-dot green";
          }
        } else {
          if (afBadge) afBadge.innerText = "Standalone / Untracked";
          if (afDot) {
            afDot.className = "status-dot amber";
          }
        }
      } catch (e) {
        if (afBadge) afBadge.innerText = "Standby";
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  // Profile change when unlocked
  profileSelect?.addEventListener('change', (e) => {
    const profileId = e.target.value;
    chrome.runtime.sendMessage({ type: "SET_ACTIVE_PROFILE", profileId }, (res) => {
      if (!res.success && res.isLocked) {
        alert("Profile is locked. Please use 'Admin Unlock & Reassign' with the Admin Passkey.");
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
      adminAuthError.innerText = "Please enter the Admin Passkey (Default: 1234567890).";
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
        adminAuthError.innerText = res?.error || "Incorrect Admin Passkey.";
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

  // Navigation buttons
  document.getElementById('open-options-btn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('open-full-dashboard')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('open-test-bench')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('test-bench/index.html') });
  });

  // Initial load
  await loadData();
});
