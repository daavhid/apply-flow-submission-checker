/**
 * Submission Quality Checker - Options & Settings Controller
 * Full Profile Management, Dynamic Custom Fields, and Multi-Webhook Configuration
 */

document.addEventListener('DOMContentLoaded', async () => {
  let config = null;
  let historyData = [];

  // Navigation Tabs
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const tabTitle = document.getElementById('tab-title');
  const tabSubtitle = document.getElementById('tab-subtitle');

  const tabMeta = {
    candidates: {
      title: "Candidate Profiles",
      subtitle: "Manage candidate assignment profiles, verified identities, tech stacks, and custom screening answers."
    },
    webhooks: {
      title: "Webhooks & Endpoints",
      subtitle: "Configure and test multiple remote REST webhook endpoints receiving submission payloads."
    },
    rules: {
      title: "Validation Rules",
      subtitle: "Configure gatekeeper strictness, compliance thresholds, and duplicate detection."
    },
    history: {
      title: "Submissions Audit Log",
      subtitle: "Inspect, verify, and export all intercepted job application payloads."
    }
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      if (tabId === 'testbench') {
        chrome.tabs.create({ url: chrome.runtime.getURL('test-bench/index.html') });
        return;
      }

      navItems.forEach(n => n.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      document.getElementById(`tab-${tabId}`)?.classList.add('active');

      if (tabMeta[tabId]) {
        tabTitle.innerText = tabMeta[tabId].title;
        tabSubtitle.innerText = tabMeta[tabId].subtitle;
      }

      if (tabId === 'history') {
        loadHistory();
      }
    });
  });

  // Load Initial Config
  async function loadConfig() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_CONFIG" }, (res) => {
        config = res || {};
        if (!config.profiles || config.profiles.length === 0) {
          chrome.runtime.sendMessage({ type: "SYNC_DEFAULT_PROFILES" }, (syncRes) => {
            if (syncRes && syncRes.profiles) {
              config.profiles = syncRes.profiles;
            }
            renderCandidates();
            renderWebhooks();
            renderSettings();
            resolve();
          });
          return;
        }
        renderCandidates();
        renderWebhooks();
        renderSettings();
        resolve();
      });
    });
  }

  async function loadHistory() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (res) => {
        historyData = res.history || [];
        renderHistoryTable();
        resolve();
      });
    });
  }

  // ===========================================================================
  // CANDIDATE PROFILES & DYNAMIC CUSTOM FIELDS
  // ===========================================================================
  const candidatesGrid = document.getElementById('candidates-grid');
  const candidateCountChip = document.getElementById('candidate-count-chip');
  const profileModal = document.getElementById('profile-modal');
  const customFieldsTbody = document.getElementById('custom-fields-tbody');

  // Profile Modal Tab Switching
  const modalTabBtns = document.querySelectorAll('.modal-tab-btn');
  const modalPtabs = document.querySelectorAll('.modal-ptab');

  modalTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPtab = btn.dataset.ptab;
      modalTabBtns.forEach(b => b.classList.remove('active'));
      modalPtabs.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`ptab-${targetPtab}`)?.classList.add('active');
    });
  });

  function getInitials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  let directorySearchQuery = '';
  let directoryStackFilter = 'all';
  let directoryStatusFilter = 'active';

  // DOM Elements for Station Hub & Space-Managed Candidate Directory
  const stationSeatDisplay = document.getElementById('station-seat-display');
  const stationSeatInput = document.getElementById('station-seat-input');
  const btnEditStationName = document.getElementById('btn-edit-station-name');
  const btnToggleStationLock = document.getElementById('btn-toggle-station-lock');
  const adminLockStatusBadge = document.getElementById('admin-lock-status-badge');
  const heroAvatar = document.getElementById('hero-avatar');
  const heroName = document.getElementById('hero-name');
  const heroEmail = document.getElementById('hero-email');
  const heroRole = document.getElementById('hero-role');
  const heroSalary = document.getElementById('hero-salary');
  const heroLockIndicator = document.getElementById('hero-lock-indicator');
  const heroTailoringIndicator = document.getElementById('hero-tailoring-indicator');
  const adminActiveStack = document.getElementById('admin-active-stack');
  const trackLockHint = document.getElementById('track-lock-hint');
  const stationLockedBanner = document.getElementById('station-locked-banner');
  const lockedCandidateName = document.getElementById('locked-candidate-name');
  const stationAdminPanel = document.getElementById('station-admin-panel');
  const candidateDirectoryContainer = document.getElementById('candidate-directory-container');
  const candidatesTableTbody = document.getElementById('candidates-table-tbody');
  const candidateSearchInput = document.getElementById('candidate-search-input');
  const directoryStatusChips = document.getElementById('directory-status-chips');
  const directoryStackChips = document.getElementById('directory-stack-chips');
  const directoryEmptyMsg = document.getElementById('directory-empty-msg');

  // Modals
  const stationUnlockModal = document.getElementById('station-unlock-modal');
  const unlockPasskeyInput = document.getElementById('unlock-passkey-input');
  const btnToggleUnlockEye = document.getElementById('btn-toggle-unlock-eye');
  const unlockErrorMsg = document.getElementById('unlock-error-msg');
  const confirmStationUnlockBtn = document.getElementById('confirm-station-unlock-btn');
  const cancelStationUnlockBtn = document.getElementById('cancel-station-unlock-btn');
  const closeStationUnlockModal = document.getElementById('close-station-unlock-modal');

  const stationPasskeyModal = document.getElementById('station-passkey-modal');
  const btnOpenPasskeyModal = document.getElementById('btn-open-passkey-modal');
  const newPasskeyInput = document.getElementById('new-passkey-input');
  const confirmPasskeyInput = document.getElementById('confirm-passkey-input');
  const passkeyErrorMsg = document.getElementById('passkey-error-msg');
  const saveStationPasskeyBtn = document.getElementById('save-station-passkey-btn');
  const cancelStationPasskeyBtn = document.getElementById('cancel-station-passkey-btn');
  const closeStationPasskeyModal = document.getElementById('close-station-passkey-modal');

  function renderCandidates() {
    if (!config || !config.profiles) return;
    const profiles = config.profiles;
    const activeId = config.settings?.activeProfileId;
    const isLocked = config.settings?.isProfileLocked !== false;
    const activeProfile = profiles.find(p => p.id === activeId) || profiles[0] || {};
    const applierSeat = config.settings?.applierId || 'Applier-Primary';

    // 1. Station Seat & Lock Status Bar
    if (stationSeatDisplay) stationSeatDisplay.innerText = applierSeat;
    if (stationSeatInput) stationSeatInput.value = applierSeat;

    if (adminLockStatusBadge) {
      adminLockStatusBadge.className = `station-lock-badge ${isLocked ? 'locked' : 'unlocked'}`;
      adminLockStatusBadge.innerHTML = isLocked
        ? '<span class="lock-dot"></span><span class="lock-text">🔒 Station Locked</span>'
        : '<span class="lock-dot"></span><span class="lock-text">🔓 Admin Unlocked</span>';
    }

    if (btnToggleStationLock) {
      btnToggleStationLock.className = `btn btn-lock-toggle ${isLocked ? '' : 'is-unlocked-state'}`;
      btnToggleStationLock.innerHTML = isLocked
        ? '<span class="btn-lock-icon">🔑</span><span class="btn-lock-label">Unlock Station</span>'
        : '<span class="btn-lock-icon">🔒</span><span class="btn-lock-label">Lock Station Now</span>';
    }

    // 2. Active Candidate Hero Showcase
    if (activeProfile && activeProfile.id) {
      if (heroAvatar) heroAvatar.innerText = getInitials(activeProfile.fullName);
      if (heroName) heroName.innerText = activeProfile.fullName || 'Unassigned';
      if (heroEmail) heroEmail.innerText = activeProfile.primaryEmail || 'No email set';
      if (heroRole) heroRole.innerText = activeProfile.targetStack || 'Developer';

      const floorVal = activeProfile.salaryFloor || activeProfile.compensation?.salaryFloor || 0;
      if (heroSalary) heroSalary.innerText = floorVal > 0 ? `$${floorVal.toLocaleString()}/yr floor` : 'Flexible target';

      if (heroLockIndicator) {
        heroLockIndicator.innerText = isLocked ? '🔒 Protected' : '🔓 Reassignable';
      }
      if (heroTailoringIndicator) {
        const isTailored = activeProfile.tailoringMode === 'tailored';
        heroTailoringIndicator.className = `hero-tag-method ${isTailored ? 'is-tailored' : 'is-base'}`;
        heroTailoringIndicator.innerHTML = isTailored ? '✨ Tailoring Method' : '📄 Base Method';
        heroTailoringIndicator.title = isTailored 
          ? 'Requires custom tailored resume pasted per application'
          : 'Standard verified fixed resume used for all applications';
      }
      if (lockedCandidateName) {
        lockedCandidateName.innerText = activeProfile.fullName || 'Active Candidate';
      }
    }

    // Track selector in Hero
    if (adminActiveStack) {
      adminActiveStack.disabled = isLocked;
      if (config.settings?.activeStackKey) {
        adminActiveStack.value = config.settings.activeStackKey;
      }
    }
    if (trackLockHint) {
      trackLockHint.innerText = isLocked
        ? '🔒 Track locked by station policy'
        : '⚡ Active tech stack preference for tailoring';
    }

    // 3. Notice Banners & Admin Panel
    if (stationLockedBanner) {
      stationLockedBanner.style.display = isLocked ? 'flex' : 'none';
    }
    if (stationAdminPanel) {
      stationAdminPanel.style.display = isLocked ? 'none' : 'block';
    }

    // Reassign dropdown in admin panel
    const adminAssignmentSelect = document.getElementById('admin-active-assignment');
    if (adminAssignmentSelect) {
      adminAssignmentSelect.innerHTML = profiles.map(p => `
        <option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>
          ${escapeHtml(p.fullName)} (${escapeHtml(p.targetStack || 'Dev')})${p.archived ? ' — [Archived]' : ''}
        </option>
      `).join('');
    }

    // 4. Update Profile Count badges (Active vs Archived)
    const totalProfiles = profiles.length;
    const archivedCount = profiles.filter(p => p.archived).length;
    const activeCount = totalProfiles - archivedCount;
    const countActiveChip = document.getElementById('count-active-chip');
    const countArchivedChip = document.getElementById('count-archived-chip');
    if (countActiveChip) countActiveChip.innerText = activeCount;
    if (countArchivedChip) countArchivedChip.innerText = archivedCount;
    if (candidateCountChip) candidateCountChip.innerText = `${activeCount} Active (${totalProfiles} Total)`;

    // 5. Always keep Candidate Profiles Directory visible so users can add/parse/edit profiles anytime
    if (candidateDirectoryContainer) {
      candidateDirectoryContainer.style.display = 'block';
    }

    renderDirectoryTable();
  }

  function renderDirectoryTable() {
    if (!candidatesTableTbody || !config || !config.profiles) return;
    const profiles = config.profiles;
    const activeId = config.settings?.activeProfileId;
    const q = directorySearchQuery.toLowerCase().trim();

    const filtered = profiles.filter(p => {
      // Filter by status chip
      if (directoryStatusFilter === 'active' && p.archived) return false;
      if (directoryStatusFilter === 'archived' && !p.archived) return false;

      // Filter by stack chip
      if (directoryStackFilter !== 'all') {
        const stackStr = `${p.targetStack || ''} ${(p.primaryStackKeywords || []).join(' ')}`.toLowerCase();
        if (directoryStackFilter === 'dotnet' && !stackStr.includes('c#') && !stackStr.includes('.net') && !stackStr.includes('dotnet')) return false;
        if (directoryStackFilter === 'python' && !stackStr.includes('python') && !stackStr.includes('fastapi') && !stackStr.includes('django')) return false;
        if (directoryStackFilter === 'php' && !stackStr.includes('php') && !stackStr.includes('laravel')) return false;
      }

      // Filter by query
      if (q) {
        const searchStr = `${p.fullName || ''} ${p.primaryEmail || ''} ${p.targetStack || ''} ${(p.primaryStackKeywords || []).join(' ')} ${p.city || ''}`.toLowerCase();
        if (!searchStr.includes(q)) return false;
      }

      return true;
    });

    if (directoryEmptyMsg) {
      directoryEmptyMsg.style.display = filtered.length === 0 ? 'block' : 'none';
      if (filtered.length === 0) {
        directoryEmptyMsg.innerHTML = `
          <div style="padding: 32px 16px; text-align: center;">
            <div style="font-size: 28px; margin-bottom: 8px;">📂</div>
            <div style="font-weight: 600; color: #fff; font-size: 14px; margin-bottom: 6px;">No candidate profiles found</div>
            <div style="color: var(--text-muted); font-size: 12.5px; max-width: 420px; margin: 0 auto 16px;">
              ${q ? `No profiles match "${escapeHtml(q)}". Try clearing your search query.` : directoryStatusFilter === 'archived' ? 'You have no archived candidate profiles.' : 'Create your first candidate profile or auto-extract one directly from a resume document.'}
            </div>
            <div style="display: inline-flex; gap: 8px;">
              ${q || directoryStackFilter !== 'all' || directoryStatusFilter !== 'active' ? `
                <button type="button" class="btn btn-secondary btn-sm" id="btn-reset-filters">Clear All Filters</button>
              ` : ''}
              <button type="button" class="btn btn-primary btn-sm" id="btn-empty-add-candidate">+ Add Candidate</button>
            </div>
          </div>
        `;
        document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
          directorySearchQuery = '';
          directoryStackFilter = 'all';
          directoryStatusFilter = 'active';
          if (candidateSearchInput) candidateSearchInput.value = '';
          directoryStatusChips?.querySelectorAll('.chip-filter').forEach(c => c.classList.toggle('active', c.dataset.status === 'active'));
          directoryStackChips?.querySelectorAll('.chip-filter').forEach(c => c.classList.toggle('active', c.dataset.stack === 'all'));
          renderDirectoryTable();
        });
        document.getElementById('btn-empty-add-candidate')?.addEventListener('click', openAddCandidateModal);
      }
    }

    candidatesTableTbody.innerHTML = filtered.map(p => {
      const isAssigned = p.id === activeId;
      const isArchived = !!p.archived;
      const initials = getInitials(p.fullName);
      const floorVal = p.salaryFloor || p.compensation?.salaryFloor || 0;
      const formattedSalary = floorVal > 0 ? `$${floorVal.toLocaleString()}` : '—';
      const customCount = (p.customFields || []).length;

      let rowClass = '';
      if (isAssigned) rowClass = 'row-active-station';
      else if (isArchived) rowClass = 'row-archived-profile';

      return `
        <tr class="${rowClass}" data-id="${p.id}">
          <td>
            <div class="c-table-avatar-cell">
              <div class="c-table-avatar ${isArchived ? 'is-archived' : ''}">${escapeHtml(initials)}</div>
              <div>
                <div class="c-table-name">
                  ${escapeHtml(p.fullName)}
                  ${isArchived ? '<span class="c-archive-pill">Archived</span>' : ''}
                </div>
                <div class="c-table-email">${escapeHtml(p.primaryEmail)}${p.phone ? ' · ' + escapeHtml(p.phone) : ''}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
              <span class="c-badge">${escapeHtml(p.targetStack || 'Developer')}</span>
              ${p.tailoringMode === 'tailored' ? `
                <span class="c-method-chip is-tailored" title="Tailoring Method: Requires custom tailored resume per application">✨ Tailored Mode</span>
              ` : `
                <span class="c-method-chip is-base" title="Base Method: Standard verified fixed resume">📄 Base Mode</span>
              `}
            </div>
          </td>
          <td>
            <span class="c-salary-pill">${escapeHtml(formattedSalary)}</span>
          </td>
          <td>
            <span class="c-qa-pill">⚡ ${customCount} Q&A</span>
          </td>
          <td>
            ${isArchived ? `
              <span class="c-status-chip is-archived">
                📦 Archived
              </span>
            ` : (
              isAssigned ? `
                <span class="c-status-chip is-active">
                  ● Active Station
                </span>
              ` : `
                <span class="c-status-chip is-inactive">
                  ○ Ready
                </span>
              `
            )}
          </td>
          <td style="text-align:right;">
            <div style="display:inline-flex; gap:6px; align-items:center; justify-content: flex-end;">
              ${isArchived ? `
                <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-archive" data-id="${p.id}" title="Restore candidate profile from archive">
                  Unarchive
                </button>
              ` : (
          !isAssigned ? `
                  <button type="button" class="btn btn-primary btn-sm" data-action="set-active-candidate" data-id="${p.id}" title="Assign this candidate profile to browser workstation">
                    Assign
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-archive" data-id="${p.id}" title="Archive candidate profile">
                    📦
                  </button>
                ` : `
                  <span class="c-current-badge">✓ Active Seat</span>
                `
        )}
              <button type="button" class="btn btn-secondary btn-sm" data-action="edit-candidate" data-id="${p.id}" title="Edit profile details">✏️ Edit</button>
              <button type="button" class="btn btn-danger btn-sm" data-action="delete-candidate" data-id="${p.id}" title="Delete profile">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Table row action delegation
  candidatesTableTbody?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'edit-candidate') {
      editCandidate(id);
    } else if (action === 'delete-candidate') {
      deleteCandidate(id);
    } else if (action === 'set-active-candidate') {
      setActiveCandidate(id);
    } else if (action === 'toggle-archive') {
      toggleArchiveCandidate(id);
    }
  });

  const toggleArchiveCandidate = (profileId) => {
    const prof = (config.profiles || []).find(p => p.id === profileId);
    if (!prof) return;
    const willArchive = !prof.archived;
    const confirmMsg = willArchive
      ? `Archive "${prof.fullName}"? The profile will be preserved in your database but hidden from active station rotation.`
      : `Unarchive "${prof.fullName}" and restore to active profile rotation?`;
    if (!confirm(confirmMsg)) return;

    chrome.runtime.sendMessage({ type: "TOGGLE_ARCHIVE_PROFILE", profileId }, (res) => {
      if (res && res.success) {
        config.profiles = res.profiles;
        if (res.settings) config.settings = res.settings;
        renderCandidates();
        renderSettings();
      }
    });
  };

  document.getElementById('btn-edit-active-hero-candidate')?.addEventListener('click', () => {
    const activeId = config.settings?.activeProfileId;
    if (activeId) {
      editCandidate(activeId);
    }
  });

  const setActiveCandidate = (profileId) => {
    if (!config || !config.settings) return;
    const prof = (config.profiles || []).find(p => p.id === profileId);
    if (prof && prof.archived) {
      if (confirm(`"${prof.fullName}" is currently archived. Unarchive and assign to this workstation?`)) {
        chrome.runtime.sendMessage({ type: "TOGGLE_ARCHIVE_PROFILE", profileId, archived: false }, () => {
          doSetActiveCandidate(profileId);
        });
      }
      return;
    }
    doSetActiveCandidate(profileId);
  };

  const doSetActiveCandidate = (profileId) => {
    const updatedSettings = {
      ...config.settings,
      activeProfileId: profileId
    };
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: updatedSettings }, (res) => {
      if (res && res.success) {
        config.settings = res.settings;
        renderCandidates();
        renderSettings();
      }
    });
  };

  // Directory Search & Filter Listeners
  candidateSearchInput?.addEventListener('input', (e) => {
    directorySearchQuery = e.target.value || '';
    renderDirectoryTable();
  });

  directoryStatusChips?.querySelectorAll('.chip-filter').forEach(chip => {
    chip.addEventListener('click', () => {
      directoryStatusChips.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      directoryStatusFilter = chip.dataset.status || 'active';
      renderDirectoryTable();
    });
  });

  directoryStackChips?.querySelectorAll('.chip-filter').forEach(chip => {
    chip.addEventListener('click', () => {
      directoryStackChips.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      directoryStackFilter = chip.dataset.stack || 'all';
      renderDirectoryTable();
    });
  });

  // Lock / Unlock Handlers
  btnToggleStationLock?.addEventListener('click', () => {
    const isLocked = config.settings?.isProfileLocked !== false;
    if (isLocked) {
      // Open Unlock Modal
      if (unlockPasskeyInput) unlockPasskeyInput.value = '';
      if (unlockErrorMsg) unlockErrorMsg.style.display = 'none';
      if (stationUnlockModal) stationUnlockModal.style.display = 'flex';
      setTimeout(() => unlockPasskeyInput?.focus(), 60);
    } else {
      // Lock Station
      const updatedSettings = {
        ...config.settings,
        isProfileLocked: true
      };
      chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: updatedSettings }, (res) => {
        if (res && res.success) {
          config.settings = res.settings;
          renderCandidates();
          renderSettings();
        }
      });
    }
  });

  // Station Seat rename
  btnEditStationName?.addEventListener('click', () => {
    const isLocked = config.settings?.isProfileLocked !== false;
    if (isLocked) {
      if (unlockPasskeyInput) unlockPasskeyInput.value = '';
      if (unlockErrorMsg) unlockErrorMsg.style.display = 'none';
      if (stationUnlockModal) stationUnlockModal.style.display = 'flex';
      setTimeout(() => unlockPasskeyInput?.focus(), 60);
      return;
    }
    const currentName = config.settings?.applierId || 'Applier-Primary';
    const newName = prompt("Enter new workstation seat name / applier identifier:", currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      const updatedSettings = {
        ...config.settings,
        applierId: newName.trim()
      };
      chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: updatedSettings }, (res) => {
        if (res && res.success) {
          config.settings = res.settings;
          renderCandidates();
          renderSettings();
        }
      });
    }
  });

  stationSeatInput?.addEventListener('change', (e) => {
    const newName = e.target.value.trim();
    if (!newName) return;
    const updatedSettings = {
      ...config.settings,
      applierId: newName
    };
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: updatedSettings }, (res) => {
      if (res && res.success) {
        config.settings = res.settings;
        renderCandidates();
        renderSettings();
      }
    });
  });

  // Track select in Hero
  adminActiveStack?.addEventListener('change', (e) => {
    const val = e.target.value;
    const updatedSettings = {
      ...config.settings,
      activeStackKey: val
    };
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: updatedSettings }, (res) => {
      if (res && res.success) {
        config.settings = res.settings;
      }
    });
  });

  // Admin Assignment Dropdown in admin panel
  document.getElementById('admin-active-assignment')?.addEventListener('change', (e) => {
    setActiveCandidate(e.target.value);
  });

  // Unlock Modal Handlers
  confirmStationUnlockBtn?.addEventListener('click', () => {
    const entered = unlockPasskeyInput?.value?.trim();
    const master = config.settings?.adminPasskey || '1234567890';
    if (entered === master) {
      stationUnlockModal.style.display = 'none';
      const updatedSettings = {
        ...config.settings,
        isProfileLocked: false
      };
      chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: updatedSettings }, (res) => {
        if (res && res.success) {
          config.settings = res.settings;
          renderCandidates();
          renderSettings();
        }
      });
    } else {
      if (unlockErrorMsg) {
        unlockErrorMsg.innerText = "❌ Incorrect Master Passkey. Access Denied.";
        unlockErrorMsg.style.display = 'block';
      }
    }
  });

  unlockPasskeyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmStationUnlockBtn?.click();
  });

  btnToggleUnlockEye?.addEventListener('click', () => {
    if (!unlockPasskeyInput) return;
    unlockPasskeyInput.type = unlockPasskeyInput.type === 'password' ? 'text' : 'password';
  });

  closeStationUnlockModal?.addEventListener('click', () => { stationUnlockModal.style.display = 'none'; });
  cancelStationUnlockBtn?.addEventListener('click', () => { stationUnlockModal.style.display = 'none'; });

  // Master Passkey Change Modal Handlers
  btnOpenPasskeyModal?.addEventListener('click', () => {
    if (newPasskeyInput) newPasskeyInput.value = '';
    if (confirmPasskeyInput) confirmPasskeyInput.value = '';
    if (passkeyErrorMsg) passkeyErrorMsg.style.display = 'none';
    if (stationPasskeyModal) stationPasskeyModal.style.display = 'flex';
    setTimeout(() => newPasskeyInput?.focus(), 60);
  });

  saveStationPasskeyBtn?.addEventListener('click', () => {
    const n = newPasskeyInput?.value?.trim() || '';
    const c = confirmPasskeyInput?.value?.trim() || '';
    if (n.length < 6) {
      if (passkeyErrorMsg) {
        passkeyErrorMsg.innerText = "❌ Passkey must be at least 6 characters.";
        passkeyErrorMsg.style.display = 'block';
      }
      return;
    }
    if (n !== c) {
      if (passkeyErrorMsg) {
        passkeyErrorMsg.innerText = "❌ Passkeys do not match.";
        passkeyErrorMsg.style.display = 'block';
      }
      return;
    }

    const updatedSettings = {
      ...config.settings,
      adminPasskey: n
    };
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: updatedSettings }, (res) => {
      if (res && res.success) {
        config.settings = res.settings;
        stationPasskeyModal.style.display = 'none';
        alert("✅ Master Passkey updated successfully!");
      }
    });
  });

  closeStationPasskeyModal?.addEventListener('click', () => { stationPasskeyModal.style.display = 'none'; });
  cancelStationPasskeyBtn?.addEventListener('click', () => { stationPasskeyModal.style.display = 'none'; });

  function renderCustomFieldRows(customFields = []) {
    if (!customFieldsTbody) return;
    if (!customFields || customFields.length === 0) {
      customFieldsTbody.innerHTML = `
        <tr id="no-custom-fields-row">
          <td colspan="3" style="text-align:center; color:var(--text-dim); padding:16px;">
            No custom fields added yet. Click "+ Add Custom Field" to store answers to specific job application questions.
          </td>
        </tr>
      `;
      return;
    }

    customFieldsTbody.innerHTML = customFields.map((cf, idx) => `
      <tr class="cf-row" data-idx="${idx}">
        <td><input type="text" class="cf-label" value="${escapeHtml(cf.label || '')}" placeholder="e.g. Do you have DoD Clearance?" /></td>
        <td><input type="text" class="cf-value" value="${escapeHtml(cf.value || '')}" placeholder="e.g. Yes / 5+ years" /></td>
        <td style="text-align:center;"><button type="button" class="btn btn-danger btn-sm" data-action="remove-cf-row" title="Remove">✕</button></td>
      </tr>
    `).join('');
  }

  // Custom fields row removal delegation
  customFieldsTbody?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="remove-cf-row"]');
    if (!btn) return;
    btn.closest('tr')?.remove();
    if (customFieldsTbody.querySelectorAll('.cf-row').length === 0) {
      renderCustomFieldRows([]);
    }
  });

  document.getElementById('add-custom-field-btn')?.addEventListener('click', () => {
    const noRow = document.getElementById('no-custom-fields-row');
    if (noRow) noRow.remove();

    const tr = document.createElement('tr');
    tr.className = 'cf-row';
    tr.innerHTML = `
      <td><input type="text" class="cf-label" placeholder="e.g. Years of C# experience?" /></td>
      <td><input type="text" class="cf-value" placeholder="e.g. 8+ years" /></td>
      <td style="text-align:center;"><button type="button" class="btn btn-danger btn-sm" data-action="remove-cf-row" title="Remove">✕</button></td>
    `;
    customFieldsTbody.appendChild(tr);
    tr.querySelector('.cf-label')?.focus();
  });

  let currentProfileUploadedFileB64 = null;
  let currentProfileUploadedFileName = null;
  let currentProfileUploadedFileType = null;

  const editCandidate = (profileId) => {
    const p = config.profiles.find(x => x.id === profileId);
    if (!p) return;

    currentProfileUploadedFileB64 = p.resumeBase64 || null;
    currentProfileUploadedFileName = p.resumeFileName || null;
    currentProfileUploadedFileType = p.resumeFileType || null;

    document.getElementById('profile-modal-title').innerText = `Edit Profile: ${p.fullName}`;
    document.getElementById('edit-profile-id').value = p.id;
    const avatarEl = document.getElementById('modal-candidate-avatar');
    if (avatarEl) {
      avatarEl.innerText = getInitials(p.fullName);
    }

    // Contact
    const isArchivedSelect = document.getElementById('edit-is-archived');
    if (isArchivedSelect) isArchivedSelect.value = p.archived ? "true" : "false";
    const tailoringModeSelect = document.getElementById('edit-tailoring-mode');
    if (tailoringModeSelect) tailoringModeSelect.value = p.tailoringMode || 'base';

    document.getElementById('edit-full-name').value = p.fullName || '';
    document.getElementById('edit-primary-email').value = p.primaryEmail || '';
    document.getElementById('edit-first-name').value = p.legalFirstName || p.firstName || '';
    document.getElementById('edit-last-name').value = p.legalLastName || p.lastName || '';
    document.getElementById('edit-preferred-name').value = p.preferredName || '';
    document.getElementById('edit-phone').value = p.phone || p.formattedPhone || '';
    document.getElementById('edit-hiring-password').value = p.defaultHiringPassword || p.hiringPassword || 'qweQWE123!@#';
    document.getElementById('edit-dob').value = p.dob || '';
    document.getElementById('edit-grad-date').value = p.graduationDate || '';
    document.getElementById('edit-email-aliases').value = (p.emailAliases || []).join(', ');
    document.getElementById('edit-address').value = p.address || '';
    document.getElementById('edit-city').value = p.city || '';
    document.getElementById('edit-state').value = p.state || p.location?.resideState || '';
    document.getElementById('edit-zip').value = p.zip || '';
    document.getElementById('edit-country').value = p.country || 'United States';
    document.getElementById('edit-linkedin').value = p.linkedin || '';
    document.getElementById('edit-github').value = p.github || '';

    // Stack
    document.getElementById('edit-target-stack').value = p.targetStack || '';
    document.getElementById('edit-years-exp').value = p.technicalExperience?.softwareEngineeringYears || p.yearsExperience || '';
    document.getElementById('edit-stack-keywords').value = (p.primaryStackKeywords || []).join(', ');
    document.getElementById('edit-backend-lang').value = p.languagesFrameworks?.preferredBackend || '';
    document.getElementById('edit-frontend-lang').value = p.languagesFrameworks?.preferredFrontend || '';
    document.getElementById('edit-db-cloud').value = p.languagesFrameworks?.preferredDatabase || '';

    // Edu & Background
    document.getElementById('edit-school').value = p.backgroundAndEducation?.schoolsAttended || p.school || '';
    document.getElementById('edit-degree').value = p.backgroundAndEducation?.education || p.degree || '';
    document.getElementById('edit-education-level').value = p.degreeLevel || p.backgroundAndEducation?.degreeLevel || "Bachelor's Degree";
    document.getElementById('edit-how-heard').value = p.howHeard?.howHeard || p.howHeard || 'LinkedIn';
    document.getElementById('edit-former-employee').value = p.formerEmployment?.workedForCompanyBefore || 'No';

    // Compliance
    document.getElementById('edit-work-auth').value = p.workAuthStatus || p.workAuth?.workAuthType || 'US Citizen';
    document.getElementById('edit-auth-us').value = p.workAuth?.authorizedInUS || 'Yes';
    document.getElementById('edit-requires-sponsorship').value = p.requiresSponsorship || p.workAuth?.requiresSponsorship || 'No';
    document.getElementById('edit-clearance').value = p.credentials?.securityClearance || 'No';
    document.getElementById('edit-gender').value = p.eeoc?.gender || 'Male';
    document.getElementById('edit-race').value = p.eeoc?.raceEthnicity || 'Two or More Races';
    document.getElementById('edit-veteran').value = p.eeoc?.veteranStatus || 'I am not a protected veteran';
    document.getElementById('edit-disability').value = p.eeoc?.disability || 'No, I do not have a disability and have not had one in the past';

    // Comp & Resume
    document.getElementById('edit-salary-floor').value = p.salaryFloor || p.compensation?.salaryFloor || '120000';
    document.getElementById('edit-desired-salary').value = p.compensation?.desiredSalary || p.desiredSalary || '130000';
    document.getElementById('edit-resume-text').value = p.resumeText || p.baseResumeText || '';
    document.getElementById('edit-availability').value = p.compensation?.availabilityStart || 'Immediate';
    document.getElementById('edit-relocate').value = p.location?.willingToRelocate || 'No';

    // Custom Fields
    renderCustomFieldRows(p.customFields || []);

    // Load Ingestion Parser text
    const parserInput = document.getElementById('profile-resume-parser-input');
    if (parserInput) parserInput.value = p.resumeText || p.baseResumeText || '';

    if (p.resumeText || p.baseResumeText) {
      displayExtractedHudTags(p.resumeText || p.baseResumeText);
    } else {
      const hudCard = document.getElementById('extracted-hud-card');
      if (hudCard) hudCard.style.display = 'none';
    }

    // Default to Identity Tab when editing existing profile
    switchModalTab('p-contact');

    profileModal.style.display = 'flex';
  };

  const deleteCandidate = async (profileId) => {
    if (!confirm("Are you sure you want to delete this candidate profile?")) return;
    chrome.runtime.sendMessage({ type: "DELETE_PROFILE", profileId }, (res) => {
      if (res && res.success) {
        config.profiles = res.profiles;
        renderCandidates();
        renderSettings();
      }
    });
  };

  function resetProfileForm() {
    profileModal.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.id === 'edit-is-archived') el.value = "false";
      else if (el.id === 'edit-tailoring-mode') el.value = "base";
      else if (el.id === 'edit-salary-floor') el.value = "120000";
      else if (el.id === 'edit-desired-salary') el.value = "130000";
      else if (el.id === 'edit-country') el.value = "United States";
      else if (el.id === 'edit-work-auth') el.value = "US Citizen";
      else if (el.id === 'edit-auth-us') el.value = "Yes";
      else if (el.id === 'edit-requires-sponsorship') el.value = "No";
      else if (el.id === 'edit-education-level') el.value = "Bachelor's Degree";
      else if (el.id === 'edit-how-heard') el.value = "LinkedIn";
      else if (el.id === 'edit-former-employee') el.value = "No";
      else if (el.id === 'edit-hiring-password') el.value = "qweQWE123!@#";
      else if (el.id === 'edit-availability') el.value = "Immediate";
      else if (el.id === 'edit-relocate') el.value = "No";
      else el.value = "";
    });
    renderCustomFieldRows([]);
    const hudCard = document.getElementById('extracted-hud-card');
    if (hudCard) hudCard.style.display = 'none';
    const avatarEl = document.getElementById('modal-candidate-avatar');
    if (avatarEl) {
      avatarEl.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    }
  }

  function switchModalTab(targetTabId) {
    modalTabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.ptab === targetTabId);
    });
    modalPtabs.forEach(p => {
      p.classList.toggle('active', p.id === `ptab-${targetTabId}`);
    });
  }

  // Switch tab on click
  modalTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchModalTab(btn.dataset.ptab);
    });
  });

  document.getElementById('btn-goto-identity')?.addEventListener('click', () => {
    switchModalTab('p-contact');
  });

  function openAddCandidateModal() {
    document.getElementById('profile-modal-title').innerText = "Add New Candidate Profile";
    document.getElementById('edit-profile-id').value = "";
    resetProfileForm();
    switchModalTab('p-contact');
    profileModal.style.display = 'flex';
    setTimeout(() => document.getElementById('edit-full-name')?.focus(), 60);
  }

  function openBuildFromResumeModal() {
    document.getElementById('profile-modal-title').innerText = "⚡ Build Candidate Profile from Resume";
    document.getElementById('edit-profile-id').value = "";
    resetProfileForm();
    switchModalTab('p-ingest');
    profileModal.style.display = 'flex';
  }

  document.getElementById('add-candidate-btn')?.addEventListener('click', openAddCandidateModal);
  document.getElementById('top-add-candidate-btn')?.addEventListener('click', openAddCandidateModal);

  // Sync Standards button handler
  document.getElementById('sync-defaults-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: "SYNC_DEFAULT_PROFILES" }, (res) => {
      if (res && res.success) {
        config.profiles = res.profiles;
        renderCandidates();
        renderSettings();
        alert("✅ Default profiles successfully synchronized to verified standards (Nicholas Adam Myers C# and Python tracks updated)!");
      }
    });
  });

  // Export profiles as profiles.json
  document.getElementById('export-profiles-btn')?.addEventListener('click', () => {
    const profiles = config.profiles || [];
    if (profiles.length === 0) {
      alert("No profiles to export.");
      return;
    }
    const jsonStr = JSON.stringify(profiles, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "profiles.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Import profiles from file
  const importFileInput = document.getElementById('import-profiles-file');
  document.getElementById('import-profiles-btn')?.addEventListener('click', () => {
    importFileInput?.click();
  });

  // Save current webhooks as default
  document.getElementById('save-default-webhooks-btn')?.addEventListener('click', () => {
    const webhooks = config.settings?.webhooks || [];
    const backendUrl = config.settings?.backendWebhookUrl || (webhooks[0]?.url) || "http://localhost:3000/api/submissions/log";
    const exportSettings = {
      ...config.settings,
      backendWebhookUrl: backendUrl,
      webhooks
    };
    const jsonStr = JSON.stringify(exportSettings, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "default-settings.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(`⭐ Default API URL set to:\n${backendUrl}\n\nDownloaded "default-settings.json"! Running "node build-extension.js" will bundle this default API endpoint for all users so you never need to configure it again.`);
  });

  importFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedProfiles = Array.isArray(parsed) ? parsed : [parsed];
      if (importedProfiles.length === 0 || !importedProfiles[0].id) {
        alert("Invalid profiles JSON file format.");
        return;
      }
      await chrome.storage.local.set({ profiles: importedProfiles });
      config.profiles = importedProfiles;
      renderCandidates();
      renderSettings();
      alert(`✅ Successfully imported ${importedProfiles.length} candidate profile${importedProfiles.length > 1 ? 's' : ''}!`);
    } catch (err) {
      alert(`❌ Failed to parse profiles JSON: ${err.message}`);
    }
    importFileInput.value = '';
  });

  // Build Profile from Resume top-level buttons
  document.getElementById('build-from-resume-btn')?.addEventListener('click', openBuildFromResumeModal);
  document.getElementById('top-build-from-resume-btn')?.addEventListener('click', openBuildFromResumeModal);

  // Modal file browse & upload
  const modalResumeFileInput = document.getElementById('modal-resume-file');
  document.getElementById('btn-modal-browse-file')?.addEventListener('click', () => {
    modalResumeFileInput?.click();
  });

  modalResumeFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedResumeFile(file);
    modalResumeFileInput.value = '';
  });

  // Modal drag & drop
  const dropzoneEl = document.getElementById('resume-dropzone');
  if (dropzoneEl) {
    dropzoneEl.addEventListener('click', (e) => {
      if (e.target.closest('#btn-paste-clip-modal')) return;
      modalResumeFileInput?.click();
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropzoneEl.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzoneEl.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzoneEl.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzoneEl.classList.remove('dragover');
      });
    });

    dropzoneEl.addEventListener('drop', async (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        await processUploadedResumeFile(file);
      }
    });
  }

  async function processUploadedResumeFile(file) {
    try {
      const dropzoneTitle = dropzoneEl?.querySelector('.dropzone-title');
      if (dropzoneTitle) dropzoneTitle.innerText = `⏳ Parsing ${file.name} (Extracting text & skills)...`;

      let extractedText = '';
      if (window.ResumeDocumentParser) {
        extractedText = await ResumeDocumentParser.extractTextFromFile(file);
      } else {
        extractedText = await file.text();
      }

      if (!extractedText || extractedText.trim().length < 10) {
        alert("Could not extract legible text from this file. Please copy-paste the text directly.");
        if (dropzoneTitle) dropzoneTitle.innerText = `Drag & Drop Resume File (.pdf, .docx, .txt)`;
        return;
      }

      const parserInput = document.getElementById('profile-resume-parser-input');
      if (parserInput) parserInput.value = extractedText;

      parseAndPopulateProfileFromText(extractedText);

      // Retain original binary file payload
      try {
        const reader = new FileReader();
        reader.onload = () => {
          currentProfileUploadedFileB64 = reader.result;
          currentProfileUploadedFileName = file.name;
          currentProfileUploadedFileType = file.type;
        };
        reader.readAsDataURL(file);
      } catch (_) {}

      if (dropzoneTitle) {
        dropzoneTitle.innerText = `✅ Successfully Extracted: ${file.name}`;
      }
    } catch (err) {
      console.error("[Ingestion] Error parsing file:", err);
      alert(`Error extracting resume: ${err.message || 'Format error'}`);
    }
  }

  // Paste from clipboard
  document.getElementById('btn-modal-paste-clip')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        alert("Clipboard is empty or text could not be read.");
        return;
      }
      const parserInput = document.getElementById('profile-resume-parser-input');
      if (parserInput) parserInput.value = text;
      parseAndPopulateProfileFromText(text);
    } catch (_) {
      alert("Could not read clipboard. Please paste directly into the box below.");
    }
  });

  document.getElementById('btn-modal-parse-now')?.addEventListener('click', () => {
    const raw = document.getElementById('profile-resume-parser-input')?.value?.trim();
    if (!raw) {
      alert("Please enter or paste resume text before parsing.");
      return;
    }
    parseAndPopulateProfileFromText(raw);
  });

  // Auto-parse when user pastes into the raw ingestion textarea
  document.getElementById('profile-resume-parser-input')?.addEventListener('paste', () => {
    setTimeout(() => {
      const raw = document.getElementById('profile-resume-parser-input')?.value?.trim();
      if (raw && raw.length >= 20) {
        parseAndPopulateProfileFromText(raw);
      }
    }, 80);
  });

  function displayExtractedHudTags(rawText) {
    const parsed = window.ResumeDocumentParser
      ? ResumeDocumentParser.parseCandidateDetails(rawText)
      : null;

    if (!parsed) return;

    const hudCard = document.getElementById('extracted-hud-card');
    const tagsCloud = document.getElementById('extracted-tags-cloud');
    if (!hudCard || !tagsCloud) return;

    hudCard.style.display = 'block';
    tagsCloud.innerHTML = parsed.extractedTags.map(t => {
      let pillClass = 'extracted-pill';
      if (t.type === 'stack') pillClass += ' stack-pill';
      else if (t.type === 'edu') pillClass += ' edu-pill';
      else if (t.type === 'cred') pillClass += ' cred-pill';

      return `<span class="${pillClass}"><span>${t.icon}</span> <strong>${escapeHtml(t.label)}</strong></span>`;
    }).join('');
  }

  // Comprehensive Resume / Spreadsheet / Text Parser Functionality
  function parseAndPopulateProfileFromText(rawText) {
    if (!rawText) return;

    const parsed = window.ResumeDocumentParser
      ? ResumeDocumentParser.parseCandidateDetails(rawText)
      : null;

    if (!parsed) return;

    // Populate Form Inputs across all tabs
    if (parsed.fullName) document.getElementById('edit-full-name').value = parsed.fullName;
    if (parsed.primaryEmail) document.getElementById('edit-primary-email').value = parsed.primaryEmail;
    if (parsed.firstName) document.getElementById('edit-first-name').value = parsed.firstName;
    if (parsed.lastName) document.getElementById('edit-last-name').value = parsed.lastName;
    if (parsed.preferredName) document.getElementById('edit-preferred-name').value = parsed.preferredName;
    if (parsed.phone) document.getElementById('edit-phone').value = parsed.phone;
    if (parsed.hiringPassword) document.getElementById('edit-hiring-password').value = parsed.hiringPassword;
    if (parsed.dob) document.getElementById('edit-dob').value = parsed.dob;
    if (parsed.graduationDate) document.getElementById('edit-grad-date').value = parsed.graduationDate;
    if (parsed.emailAliases?.length) document.getElementById('edit-email-aliases').value = parsed.emailAliases.join(', ');
    if (parsed.address) document.getElementById('edit-address').value = parsed.address;
    if (parsed.city) document.getElementById('edit-city').value = parsed.city;
    if (parsed.state) document.getElementById('edit-state').value = parsed.state;
    if (parsed.zip) document.getElementById('edit-zip').value = parsed.zip;
    if (parsed.country) document.getElementById('edit-country').value = parsed.country;
    if (parsed.linkedin) document.getElementById('edit-linkedin').value = parsed.linkedin;
    if (parsed.github) document.getElementById('edit-github').value = parsed.github;

    // Stack
    if (parsed.targetStack) document.getElementById('edit-target-stack').value = parsed.targetStack;
    if (parsed.yearsExperience) document.getElementById('edit-years-exp').value = parsed.yearsExperience;
    if (parsed.primaryStackKeywords?.length) document.getElementById('edit-stack-keywords').value = parsed.primaryStackKeywords.join(', ');
    if (parsed.backendSkills) document.getElementById('edit-backend-lang').value = parsed.backendSkills;
    if (parsed.frontendSkills) document.getElementById('edit-frontend-lang').value = parsed.frontendSkills;
    if (parsed.dbCloudSkills) document.getElementById('edit-db-cloud').value = parsed.dbCloudSkills;

    // Edu & Background
    if (parsed.school) document.getElementById('edit-school').value = parsed.school;
    if (parsed.degree) document.getElementById('edit-degree').value = parsed.degree;
    if (parsed.degreeLevel) document.getElementById('edit-education-level').value = parsed.degreeLevel;

    // Set raw resume text
    document.getElementById('edit-resume-text').value = rawText;

    // Show extracted HUD
    displayExtractedHudTags(rawText);
  }

  // Quick Action: Re-Extract & Infer Skills directly from current resume
  document.getElementById('btn-reextract-skills')?.addEventListener('click', () => {
    const resumeText = document.getElementById('edit-resume-text')?.value ||
      document.getElementById('profile-resume-parser-input')?.value;
    if (!resumeText || !resumeText.trim()) {
      alert("No resume text found. Please upload or paste a resume in the 'Auto-Ingest Resume' tab first.");
      return;
    }
    const parsed = window.ResumeDocumentParser?.parseCandidateDetails(resumeText);
    if (parsed) {
      if (parsed.backendSkills) document.getElementById('edit-backend-lang').value = parsed.backendSkills;
      if (parsed.frontendSkills) document.getElementById('edit-frontend-lang').value = parsed.frontendSkills;
      if (parsed.dbCloudSkills) document.getElementById('edit-db-cloud').value = parsed.dbCloudSkills;
      if (parsed.primaryStackKeywords?.length) document.getElementById('edit-stack-keywords').value = parsed.primaryStackKeywords.join(', ');
      if (parsed.targetStack) document.getElementById('edit-target-stack').value = parsed.targetStack;
      displayExtractedHudTags(resumeText);
      alert("Skills successfully re-extracted and inferred from candidate resume!");
    }
  });

  document.getElementById('close-profile-modal')?.addEventListener('click', () => {
    profileModal.style.display = 'none';
  });
  document.getElementById('cancel-profile-btn')?.addEventListener('click', () => {
    profileModal.style.display = 'none';
  });

  document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
    const isNewProfile = !document.getElementById('edit-profile-id').value;
    const id = document.getElementById('edit-profile-id').value || `candidate_${Date.now()}`;
    let fullName = document.getElementById('edit-full-name').value.trim();
    let primaryEmail = document.getElementById('edit-primary-email').value.trim();

    if (!fullName || !primaryEmail) {
      const rawParserText = document.getElementById('profile-resume-parser-input')?.value?.trim();
      if (rawParserText) {
        parseAndPopulateProfileFromText(rawParserText, "Auto-Parsed on Save");
        fullName = document.getElementById('edit-full-name').value.trim();
        primaryEmail = document.getElementById('edit-primary-email').value.trim();
      }
    }

    if (!fullName || !primaryEmail) {
      switchModalTab('p-contact');
      if (!fullName) {
        document.getElementById('edit-full-name')?.focus();
      } else {
        document.getElementById('edit-primary-email')?.focus();
      }
      alert("Please enter both Full Name and Primary Email on the Identity & Contact tab.");
      return;
    }

    let firstName = document.getElementById('edit-first-name').value.trim();
    let lastName = document.getElementById('edit-last-name').value.trim();
    if (!firstName || !lastName) {
      const parts = fullName.split(' ');
      if (!firstName) firstName = parts[0] || '';
      if (!lastName) lastName = parts.slice(1).join(' ') || '';
    }

    const preferredName = document.getElementById('edit-preferred-name').value.trim() || fullName;
    const defaultHiringPassword = document.getElementById('edit-hiring-password').value.trim() || 'qweQWE123!@#';
    const dob = document.getElementById('edit-dob').value.trim();
    const graduationDate = document.getElementById('edit-grad-date').value.trim();

    const aliasesRaw = document.getElementById('edit-email-aliases').value;
    const aliases = aliasesRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (!aliases.includes(primaryEmail)) aliases.unshift(primaryEmail);

    const keywordsRaw = document.getElementById('edit-stack-keywords').value;
    const primaryStackKeywords = keywordsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    // Read custom fields table
    const customFields = [];
    customFieldsTbody.querySelectorAll('.cf-row').forEach(row => {
      const lbl = row.querySelector('.cf-label')?.value.trim();
      const val = row.querySelector('.cf-value')?.value.trim();
      if (lbl && val) {
        customFields.push({ label: lbl, value: val });
      }
    });

    const educationLevel = document.getElementById('edit-education-level').value;
    const howHeard = document.getElementById('edit-how-heard').value;
    const formerEmployee = document.getElementById('edit-former-employee').value;
    const resumeText = document.getElementById('edit-resume-text').value.trim();
    const archived = document.getElementById('edit-is-archived')?.value === 'true';
    const tailoringMode = document.getElementById('edit-tailoring-mode')?.value || 'base';

    const profileData = {
      id,
      archived,
      tailoringMode,
      fullName,
      firstName,
      lastName,
      preferredName,
      defaultHiringPassword,
      dob,
      graduationDate,
      primaryEmail,
      emailAliases: aliases,
      phone: document.getElementById('edit-phone').value.trim(),
      address: document.getElementById('edit-address').value.trim(),
      city: document.getElementById('edit-city').value.trim(),
      state: document.getElementById('edit-state').value.trim(),
      zip: document.getElementById('edit-zip').value.trim(),
      country: document.getElementById('edit-country').value.trim() || 'United States',
      linkedin: document.getElementById('edit-linkedin').value.trim(),
      github: document.getElementById('edit-github')?.value.trim() || '',

      targetStack: document.getElementById('edit-target-stack').value.trim(),
      salaryFloor: parseFloat(document.getElementById('edit-salary-floor').value) || 120000,
      desiredSalary: parseFloat(document.getElementById('edit-desired-salary').value) || 130000,
      primaryStackKeywords,
      resumeText,
      resumeBase64: currentProfileUploadedFileB64,
      resumeFileName: currentProfileUploadedFileName,
      resumeFileType: currentProfileUploadedFileType,
      degreeLevel: educationLevel,
      school: document.getElementById('edit-school').value.trim(),
      degree: document.getElementById('edit-degree').value.trim(),
      howHeard,

      workAuthStatus: document.getElementById('edit-work-auth').value,
      requiresSponsorship: document.getElementById('edit-requires-sponsorship').value,

      workAuth: {
        authorizedInUS: document.getElementById('edit-auth-us').value,
        workAuthType: document.getElementById('edit-work-auth').value,
        requiresSponsorship: document.getElementById('edit-requires-sponsorship').value
      },
      compensation: {
        salaryFloor: parseFloat(document.getElementById('edit-salary-floor').value) || 120000,
        desiredSalary: parseFloat(document.getElementById('edit-desired-salary').value) || 130000,
        availabilityStart: document.getElementById('edit-availability').value.trim() || 'Immediate'
      },
      location: {
        resideState: document.getElementById('edit-state').value.trim(),
        country: document.getElementById('edit-country').value.trim() || 'United States',
        willingToRelocate: document.getElementById('edit-relocate').value
      },
      formerEmployment: {
        workedForCompanyBefore: formerEmployee,
        previousEmployee: formerEmployee,
        currentEmployee: formerEmployee,
        affiliatedCompany: formerEmployee
      },
      howHeard: {
        howHeard,
        referred: "No"
      },
      eeoc: {
        gender: document.getElementById('edit-gender').value,
        raceEthnicity: document.getElementById('edit-race').value,
        veteranStatus: document.getElementById('edit-veteran').value,
        disability: document.getElementById('edit-disability').value
      },
      credentials: {
        securityClearance: document.getElementById('edit-clearance').value
      },
      backgroundAndEducation: {
        schoolsAttended: document.getElementById('edit-school').value.trim(),
        education: document.getElementById('edit-degree').value.trim(),
        degreeLevel: educationLevel
      },
      languagesFrameworks: {
        preferredBackend: document.getElementById('edit-backend-lang').value.trim(),
        preferredFrontend: document.getElementById('edit-frontend-lang').value.trim(),
        preferredDatabase: document.getElementById('edit-db-cloud').value.trim(),
        comfortableLanguages: `${document.getElementById('edit-backend-lang').value.trim()}, ${document.getElementById('edit-frontend-lang').value.trim()}`,
        skills: primaryStackKeywords.map(k => k.trim())
      },
      technicalExperience: {
        softwareEngineeringYears: document.getElementById('edit-years-exp').value.trim() || '8+ years'
      },
      customFields
    };

    chrome.runtime.sendMessage({ type: "SAVE_PROFILE", profile: profileData }, (res) => {
      if (res && res.success) {
        config.profiles = res.profiles;
        renderCandidates();
        renderSettings();
        profileModal.style.display = 'none';

        // If station is unlocked and it's a new profile, assign it as active
        const isLocked = config.settings?.isProfileLocked !== false;
        if (isNewProfile && !isLocked) {
          setActiveCandidate(id);
        }
      } else {
        alert(res?.error || "Error saving candidate profile. Please check that all required fields are filled.");
      }
    });
  });

  // ===========================================================================
  // MULTI-WEBHOOK MANAGEMENT
  // ===========================================================================
  const webhooksListEl = document.getElementById('webhooks-list');
  const webhookModal = document.getElementById('webhook-modal');

  function renderWebhooks() {
    if (!config || !config.settings) return;
    const webhooks = config.settings.webhooks || [];

    if (webhooks.length === 0) {
      webhooksListEl.innerHTML = `
        <div style="text-align:center; padding:24px; background:rgba(0,0,0,0.2); border-radius:8px; color:var(--text-muted);">
          No webhooks configured yet. Click "+ Add Webhook Endpoint" to configure your backend listener.
        </div>
      `;
      return;
    }

    webhooksListEl.innerHTML = webhooks.map(wh => `
      <div class="webhook-card" id="card-${wh.id}">
        <div class="webhook-info">
          <div class="webhook-title-row">
            <span class="webhook-name">${escapeHtml(wh.name)}</span>
            <span class="badge-status ${wh.isActive ? 'pass' : 'warn'}">${wh.isActive ? 'Active' : 'Disabled'}</span>
            ${wh.sendLiveEvents ? '<span class="counter-chip" style="font-size:10px;">⚡ Live Events</span>' : ''}
          </div>
          <div class="webhook-url">${escapeHtml(wh.url)}</div>
        </div>

        <div class="webhook-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="ping-webhook" data-id="${wh.id}">⚡ Ping</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="edit-webhook" data-id="${wh.id}">✏️ Edit</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="delete-webhook" data-id="${wh.id}">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  // Webhooks list event delegation (CSP-compliant)
  webhooksListEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'ping-webhook') {
      pingWebhook(id, btn);
    } else if (action === 'edit-webhook') {
      editWebhook(id);
    } else if (action === 'delete-webhook') {
      deleteWebhook(id);
    }
  });

  const pingWebhook = async (webhookId, triggerBtn) => {
    const wh = (config.settings.webhooks || []).find(w => w.id === webhookId);
    if (!wh) return;

    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerText = "⏳ Testing...";
    }

    chrome.runtime.sendMessage({
      type: "TEST_BACKEND_PING",
      url: wh.url,
      apiKey: wh.apiKey
    }, (res) => {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerText = "⚡ Ping";
      }
      if (res && res.success) {
        alert(`✅ Webhook "${wh.name}" is ONLINE!\nEndpoint: ${wh.url}\nStatus: ${res.statusText || 'OK'}`);
      } else {
        alert(`❌ Webhook "${wh.name}" unreachable:\nEndpoint: ${wh.url}\nError: ${res?.error || 'Connection Failed'}`);
      }
    });
  };

  const editWebhook = (webhookId) => {
    const wh = (config.settings.webhooks || []).find(w => w.id === webhookId);
    if (!wh) return;

    document.getElementById('webhook-modal-title').innerText = `Edit Webhook: ${wh.name}`;
    document.getElementById('edit-webhook-id').value = wh.id;
    document.getElementById('webhook-name').value = wh.name || '';
    document.getElementById('webhook-url').value = wh.url || '';
    document.getElementById('webhook-key').value = wh.apiKey || '';
    document.getElementById('webhook-active').checked = wh.isActive !== false;
    document.getElementById('webhook-live').checked = Boolean(wh.sendLiveEvents);
    document.getElementById('webhook-ping-status').style.display = 'none';

    webhookModal.style.display = 'flex';
  };

  const deleteWebhook = async (webhookId) => {
    if (!confirm("Delete this webhook endpoint?")) return;
    const webhooks = (config.settings.webhooks || []).filter(w => w.id !== webhookId);
    config.settings.webhooks = webhooks;
    await saveWebhooksToStorage(webhooks);
    renderWebhooks();
  };

  document.getElementById('add-webhook-btn')?.addEventListener('click', () => {
    document.getElementById('webhook-modal-title').innerText = "Add Webhook Endpoint";
    document.getElementById('edit-webhook-id').value = "";
    document.getElementById('webhook-name').value = "";
    document.getElementById('webhook-url').value = "";
    document.getElementById('webhook-key').value = "";
    document.getElementById('webhook-active').checked = true;
    document.getElementById('webhook-live').checked = false;
    document.getElementById('webhook-ping-status').style.display = 'none';

    webhookModal.style.display = 'flex';
  });

  document.getElementById('close-webhook-modal')?.addEventListener('click', () => { webhookModal.style.display = 'none'; });
  document.getElementById('cancel-webhook-btn')?.addEventListener('click', () => { webhookModal.style.display = 'none'; });

  document.getElementById('test-webhook-btn')?.addEventListener('click', () => {
    const url = document.getElementById('webhook-url').value.trim();
    const apiKey = document.getElementById('webhook-key').value.trim();
    const statusBox = document.getElementById('webhook-ping-status');

    if (!url) {
      alert("Please enter a Webhook URL first.");
      return;
    }

    statusBox.style.display = 'block';
    statusBox.innerText = "⏳ Testing ping connection...";
    statusBox.style.background = "rgba(59, 130, 246, 0.2)";
    statusBox.style.color = "#93c5fd";

    chrome.runtime.sendMessage({ type: "TEST_BACKEND_PING", url, apiKey }, (res) => {
      if (res && res.success) {
        statusBox.innerText = `✅ Server Online: ${res.statusText || 'HTTP 200'}`;
        statusBox.style.background = "rgba(16, 185, 129, 0.2)";
        statusBox.style.color = "#86efac";
      } else {
        statusBox.innerText = `❌ Error: ${res?.error || 'Unreachable'}`;
        statusBox.style.background = "rgba(239, 68, 68, 0.2)";
        statusBox.style.color = "#fca5a5";
      }
    });
  });

  document.getElementById('save-webhook-btn')?.addEventListener('click', async () => {
    const id = document.getElementById('edit-webhook-id').value || `wh_${Date.now()}`;
    const name = document.getElementById('webhook-name').value.trim() || 'Webhook Endpoint';
    const url = document.getElementById('webhook-url').value.trim();
    const apiKey = document.getElementById('webhook-key').value.trim();
    const isActive = document.getElementById('webhook-active').checked;
    const sendLiveEvents = document.getElementById('webhook-live').checked;

    if (!url) {
      alert("Please enter a valid Webhook URL.");
      return;
    }

    const webhooks = config.settings.webhooks || [];
    const existingIdx = webhooks.findIndex(w => w.id === id);

    const webhookObj = { id, name, url, apiKey, isActive, sendLiveEvents };

    if (existingIdx >= 0) {
      webhooks[existingIdx] = webhookObj;
    } else {
      webhooks.push(webhookObj);
    }

    config.settings.webhooks = webhooks;
    await saveWebhooksToStorage(webhooks);
    renderWebhooks();
    webhookModal.style.display = 'none';
  });

  async function saveWebhooksToStorage(webhooks) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "SAVE_WEBHOOKS", webhooks }, (res) => {
        if (res && res.success) {
          config.settings = res.settings;
        }
        resolve();
      });
    });
  }

  // ===========================================================================
  // SETTINGS & ADMIN SECURITY
  // ===========================================================================
  function renderSettings() {
    if (!config || !config.settings) return;
    const s = config.settings;
    const profiles = config.profiles || [];
    const isLocked = s.isProfileLocked !== false;

    const adminPasskeyInput = document.getElementById('admin-passkey-setting');
    const adminAssignmentSelect = document.getElementById('admin-active-assignment');
    const profileLockToggle = document.getElementById('profile-lock-toggle');
    const lockStatusBadge = document.getElementById('admin-lock-status-badge');

    if (adminPasskeyInput) adminPasskeyInput.value = s.adminPasskey || '1234567890';
    if (profileLockToggle) profileLockToggle.checked = isLocked;
    if (lockStatusBadge) {
      lockStatusBadge.innerText = isLocked ? "🔒 Locked" : "🔓 Unlocked";
      lockStatusBadge.style.background = isLocked ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)";
      lockStatusBadge.style.color = isLocked ? "#fca5a5" : "#86efac";
    }

    if (adminAssignmentSelect) {
      adminAssignmentSelect.innerHTML = profiles.map(p => `
        <option value="${p.id}" ${p.id === s.activeProfileId ? 'selected' : ''}>
          ${escapeHtml(p.fullName)} (${escapeHtml(p.targetStack || 'Dev')})
        </option>
      `).join('');
    }

    const adminStackSelect = document.getElementById('admin-active-stack');
    if (adminStackSelect && s.activeStackKey) {
      adminStackSelect.value = s.activeStackKey;
    }

    // Applier Settings
    const applierIdInput = document.getElementById('applier-id');
    const streamLiveToggle = document.getElementById('stream-live-toggle');
    const mockBackendToggle = document.getElementById('mock-backend-toggle');

    if (applierIdInput) applierIdInput.value = s.applierId || 'Applier-Primary';
    if (streamLiveToggle) streamLiveToggle.checked = s.streamLiveEvents !== false;
    if (mockBackendToggle) mockBackendToggle.checked = s.mockBackendSuccess !== false;

    // Rules & Enforcement
    const defaultModeSelect = document.getElementById('default-mode');
    const minScreeningInput = document.getElementById('min-screening-len');
    const duplicateDaysInput = document.getElementById('duplicate-days');
    const allowOverrideToggle = document.getElementById('allow-override-toggle');

    if (defaultModeSelect) defaultModeSelect.value = s.interceptionMode || 'active';
    if (minScreeningInput) minScreeningInput.value = s.minScreeningLength || 15;
    if (duplicateDaysInput) duplicateDaysInput.value = s.autoDuplicateWindowDays || 14;
    if (allowOverrideToggle) allowOverrideToggle.checked = s.allowOverride !== false;

    // Automation & Form Pre-Filling
    const autoAutofillToggle = document.getElementById('auto-autofill-toggle');
    const detectCaptchaToggle = document.getElementById('detect-captcha-toggle');
    const autofillEeocToggle = document.getElementById('autofill-eeoc-toggle');
    const autofillSalaryToggle = document.getElementById('autofill-salary-toggle');
    const autofillCustomQaToggle = document.getElementById('autofill-custom-qa-toggle');

    if (autoAutofillToggle) autoAutofillToggle.checked = s.autoAutofillOnPageLoad !== false;
    if (detectCaptchaToggle) detectCaptchaToggle.checked = s.detectCaptchaAndAlert !== false;
    if (autofillEeocToggle) autofillEeocToggle.checked = s.autoFillDemographics !== false;
    if (autofillSalaryToggle) autofillSalaryToggle.checked = s.autoFillCompensation !== false;
    if (autofillCustomQaToggle) autofillCustomQaToggle.checked = s.autoFillCustomQuestions !== false;
  }

  document.getElementById('save-all-btn')?.addEventListener('click', async () => {
    const updatedSettings = {
      ...config.settings,
      adminPasskey: document.getElementById('admin-passkey-setting')?.value.trim() || '1234567890',
      activeProfileId: document.getElementById('admin-active-assignment')?.value || config.settings.activeProfileId,
      activeStackKey: document.getElementById('admin-active-stack')?.value || 'dotnet',
      isProfileLocked: document.getElementById('profile-lock-toggle')?.checked !== false,
      applierId: document.getElementById('applier-id')?.value.trim() || 'Applier-Primary',
      streamLiveEvents: document.getElementById('stream-live-toggle')?.checked !== false,
      mockBackendSuccess: document.getElementById('mock-backend-toggle')?.checked !== false,
      interceptionMode: document.getElementById('default-mode')?.value || 'active',
      minScreeningLength: parseInt(document.getElementById('min-screening-len')?.value, 10) || 15,
      autoDuplicateWindowDays: parseInt(document.getElementById('duplicate-days')?.value, 10) || 14,
      allowOverride: document.getElementById('allow-override-toggle')?.checked !== false,
      autoAutofillOnPageLoad: document.getElementById('auto-autofill-toggle')?.checked !== false,
      detectCaptchaAndAlert: document.getElementById('detect-captcha-toggle')?.checked !== false,
      autoFillDemographics: document.getElementById('autofill-eeoc-toggle')?.checked !== false,
      autoFillCompensation: document.getElementById('autofill-salary-toggle')?.checked !== false,
      autoFillCustomQuestions: document.getElementById('autofill-custom-qa-toggle')?.checked !== false
    };

    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: updatedSettings }, (res) => {
      if (res && res.success) {
        config.settings = res.settings;
        renderCandidates();
        renderSettings();
        alert("✅ All settings and profile configurations saved successfully!");
      }
    });
  });

  // ===========================================================================
  // AUDIT LOG & SUBMISSIONS HISTORY
  // ===========================================================================
  const auditTableBody = document.getElementById('audit-table-body');
  const historySearch = document.getElementById('history-search');
  const payloadModal = document.getElementById('payload-modal');
  const payloadJsonCode = document.getElementById('payload-json-code');

  function renderHistoryTable() {
    if (!auditTableBody) return;
    const query = (historySearch?.value || '').toLowerCase().trim();

    const filtered = historyData.filter(item => {
      if (!query) return true;
      const cName = (item.profile_assigned || item.candidate_id || '').toLowerCase();
      const jobTitle = (item.extracted_data?.job_title || '').toLowerCase();
      const company = (item.extracted_data?.company || '').toLowerCase();
      const status = (item.validation_status || '').toLowerCase();
      return cName.includes(query) || jobTitle.includes(query) || company.includes(query) || status.includes(query);
    });

    if (filtered.length === 0) {
      auditTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; color:var(--text-muted); padding:32px;">
            No submission audit logs found. Completed job submissions will appear here live.
          </td>
        </tr>
      `;
      return;
    }

    auditTableBody.innerHTML = filtered.map((item, index) => {
      const isPass = item.validation_status === 'PASSED';
      const isWarn = item.validation_status?.includes('OVERRIDDEN') || item.validation_status?.includes('WARNING');
      const statusClass = isPass ? 'pass' : (isWarn ? 'warn' : 'fail');

      return `
        <tr>
          <td style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);">${new Date(item.timestamp).toLocaleString()}</td>
          <td><strong>${escapeHtml(item.profile_assigned || item.candidate_id || 'Unknown')}</strong></td>
          <td>${escapeHtml(item.extracted_data?.job_title || 'N/A')}</td>
          <td>${escapeHtml(item.extracted_data?.company || 'N/A')} <span style="font-size:10px; color:var(--text-dim);">(${escapeHtml(item.extracted_data?.ats_domain || 'ATS')})</span></td>
          <td>${escapeHtml(item.extracted_data?.resume_uploaded || 'None')}</td>
          <td><span class="badge-status ${statusClass}">${escapeHtml(item.validation_status || 'UNKNOWN')}</span></td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm" data-action="inspect-payload" data-index="${index}">👁️ Inspect</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // History audit table event delegation (CSP-compliant)
  auditTableBody?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="inspect-payload"]');
    if (!btn) return;
    const index = parseInt(btn.dataset.index, 10);
    viewPayload(index);
  });

  historySearch?.addEventListener('input', renderHistoryTable);

  const viewPayload = (index) => {
    const item = historyData[index];
    if (!item) return;
    payloadJsonCode.innerText = JSON.stringify(item, null, 2);
    payloadModal.style.display = 'flex';
  };

  document.getElementById('close-payload-modal')?.addEventListener('click', () => { payloadModal.style.display = 'none'; });
  document.getElementById('close-payload-btn')?.addEventListener('click', () => { payloadModal.style.display = 'none'; });

  document.getElementById('copy-json-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(payloadJsonCode.innerText);
    const btn = document.getElementById('copy-json-btn');
    if (btn) {
      btn.innerText = "✅ Copied!";
      setTimeout(() => { btn.innerText = "📋 Copy JSON"; }, 1500);
    }
  });

  document.getElementById('clear-history-btn')?.addEventListener('click', () => {
    if (!confirm("Are you sure you want to clear all submission logs?")) return;
    chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" }, () => {
      historyData = [];
      renderHistoryTable();
    });
  });

  document.getElementById('export-json-btn')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submission_audit_log_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    if (historyData.length === 0) {
      alert("No submissions to export.");
      return;
    }
    const headers = ["Timestamp", "Candidate", "Job Title", "Company", "ATS", "Resume", "Status", "Job ID", "Profile ID"];
    const rows = historyData.map(d => [
      d.timestamp,
      `"${(d.profile_assigned || '').replace(/"/g, '""')}"`,
      `"${(d.extracted_data?.job_title || '').replace(/"/g, '""')}"`,
      `"${(d.extracted_data?.company || '').replace(/"/g, '""')}"`,
      d.extracted_data?.ats_domain || '',
      `"${(d.extracted_data?.resume_uploaded || '').replace(/"/g, '""')}"`,
      d.validation_status || '',
      d.job_id || '',
      d.profile_id || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submission_audit_log_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Global Keyboard Shortcuts (Escape to close modals, Ctrl+S / Cmd+S to save)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (profileModal && profileModal.style.display !== 'none') {
        profileModal.style.display = 'none';
      } else if (webhookModal && webhookModal.style.display !== 'none') {
        webhookModal.style.display = 'none';
      } else if (payloadModal && payloadModal.style.display !== 'none') {
        payloadModal.style.display = 'none';
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (profileModal && profileModal.style.display !== 'none') {
        document.getElementById('save-profile-btn')?.click();
      } else {
        document.getElementById('save-all-btn')?.click();
      }
    }
  });

  // Initialize
  await loadConfig();
});

