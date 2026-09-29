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

  function renderCandidates() {
    if (!config || !config.profiles) return;
    const profiles = config.profiles;
    const activeId = config.settings?.activeProfileId;

    if (candidateCountChip) {
      candidateCountChip.innerText = `${profiles.length} Profile${profiles.length !== 1 ? 's' : ''}`;
    }

    candidatesGrid.innerHTML = profiles.map(p => {
      const isAssigned = p.id === activeId;
      const customCount = (p.customFields || []).length;

      return `
        <div class="candidate-card ${isAssigned ? 'active-assigned' : ''}">
          <div class="candidate-card-header">
            <div>
              <div class="c-name">${escapeHtml(p.fullName)} ${isAssigned ? '<span style="font-size:10px; background:#2563eb; color:#fff; padding:2px 6px; border-radius:4px; vertical-align:middle;">Active</span>' : ''}</div>
              <div class="c-email">📧 ${escapeHtml(p.primaryEmail)}</div>
            </div>
            <span class="c-badge">${escapeHtml(p.targetStack || 'Developer')}</span>
          </div>

          <div class="c-details">
            <div class="c-row"><span class="k">Salary Floor:</span><span class="v">$${(p.salaryFloor || p.compensation?.salaryFloor || 0).toLocaleString()}</span></div>
            <div class="c-row"><span class="k">Work Auth:</span><span class="v">${escapeHtml(p.workAuthStatus || p.workAuth?.workAuthType || 'US Citizen')}</span></div>
            <div class="c-row"><span class="k">Location:</span><span class="v">${escapeHtml(p.city || '')}${p.city && p.state ? ', ' : ''}${escapeHtml(p.state || 'FL')}</span></div>
            <div class="c-row"><span class="k">Aliases:</span><span class="v">${(p.emailAliases || []).length} registered</span></div>
            ${customCount > 0 ? `<div class="c-row"><span class="k">Custom Q&A:</span><span class="v" style="color:#93c5fd;">⚡ ${customCount} saved field${customCount > 1 ? 's' : ''}</span></div>` : ''}
          </div>

          <div class="c-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-candidate" data-id="${p.id}">✏️ Edit Profile</button>
            <button type="button" class="btn btn-danger btn-sm" data-action="delete-candidate" data-id="${p.id}">🗑️ Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Candidate grid event delegation (CSP-compliant)
  candidatesGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'edit-candidate') {
      editCandidate(id);
    } else if (action === 'delete-candidate') {
      deleteCandidate(id);
    }
  });

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

  const editCandidate = (profileId) => {
    const p = config.profiles.find(x => x.id === profileId);
    if (!p) return;

    document.getElementById('profile-modal-title').innerText = `Edit Profile: ${p.fullName}`;
    document.getElementById('edit-profile-id').value = p.id;
    
    // Contact
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
      if (el.id === 'edit-salary-floor') el.value = "120000";
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

  document.getElementById('add-candidate-btn')?.addEventListener('click', () => {
    document.getElementById('profile-modal-title').innerText = "Add New Candidate Profile";
    document.getElementById('edit-profile-id').value = "";
    resetProfileForm();
    switchModalTab('p-contact');
    profileModal.style.display = 'flex';
  });

  // Sync Standards button handler
  document.getElementById('sync-defaults-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: "SYNC_DEFAULT_PROFILES" }, (res) => {
      if (res && res.success) {
        config.profiles = res.profiles;
        renderCandidates();
        renderSettings();
        alert("✅ Default profiles successfully synchronized to verified standards (Nicholas Adam Myers Python/AI Track & Notre Dame updated)!");
      }
    });
  });

  // Build Profile from Resume top-level button
  document.getElementById('build-from-resume-btn')?.addEventListener('click', () => {
    document.getElementById('profile-modal-title').innerText = "⚡ Build Candidate Profile from Resume";
    document.getElementById('edit-profile-id').value = "";
    resetProfileForm();
    switchModalTab('p-ingest');
    profileModal.style.display = 'flex';
  });

  // Modal file browse & upload
  const modalResumeFileInput = document.getElementById('modal-resume-file');
  document.getElementById('btn-modal-browse-file')?.addEventListener('click', () => {
    modalResumeFileInput?.click();
  });

  modalResumeFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedResumeFile(file);
  });

  // Modal drag & drop
  const dropzoneEl = document.getElementById('resume-dropzone');
  if (dropzoneEl) {
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

  document.getElementById('close-profile-modal')?.addEventListener('click', () => {
    profileModal.style.display = 'none';
  });
  document.getElementById('cancel-profile-btn')?.addEventListener('click', () => {
    profileModal.style.display = 'none';
  });

  document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
    const id = document.getElementById('edit-profile-id').value || `candidate_${Date.now()}`;
    const fullName = document.getElementById('edit-full-name').value.trim();
    const primaryEmail = document.getElementById('edit-primary-email').value.trim();

    if (!fullName || !primaryEmail) {
      alert("Please enter both Full Name and Primary Email.");
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

    const profileData = {
      id,
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

  // Initialize
  await loadConfig();
});
