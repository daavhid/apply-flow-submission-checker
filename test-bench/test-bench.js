/**
 * ATS Simulator & Test Bench Controller
 * Real-time event streaming and guaranteed webhook submission logging.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Portal Tab Switching
  const portalTabs = document.querySelectorAll('.portal-tab');
  const portalViews = document.querySelectorAll('.portal-view');

  portalTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const portalId = tab.dataset.portal;
      portalTabs.forEach(t => t.classList.remove('active'));
      portalViews.forEach(v => v.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`portal-${portalId}`)?.classList.add('active');

      syncFormToBackend();
    });
  });

  // Active form data extractor
  function getActiveFormData() {
    const activeView = document.querySelector('.portal-view.active') || document.querySelector('.portal-view');
    if (!activeView) return null;

    const portalId = activeView.id.replace('portal-', '');
    let jobTitle = 'Senior Full Stack C# .NET Engineer';
    let company = 'HealthStream';
    let reqId = 'R-84920';
    let atsDomain = portalId || 'workday';

    let firstName = '';
    let lastName = '';
    let fullName = '';
    let email = '';
    let phone = '';
    let salary = '';
    let resume = '';
    const allEntries = [];

    if (portalId === 'workday') {
      firstName = document.getElementById('wd-first-name')?.value || '';
      lastName = document.getElementById('wd-last-name')?.value || '';
      fullName = `${firstName} ${lastName}`.trim();
      email = document.getElementById('wd-email')?.value || '';
      phone = document.getElementById('wd-phone')?.value || '';
      salary = document.getElementById('wd-salary')?.value || '';
      
      const fileInput = document.getElementById('wd-resume');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        resume = fileInput.files[0].name;
      } else if (fileInput && fileInput.dataset.fileName) {
        resume = fileInput.dataset.fileName;
      }

      const exp = document.getElementById('wd-q-experience')?.value || '';
      const auth = document.querySelector('input[name="wd-auth"]:checked')?.value || 'Yes';
      const sponsor = document.querySelector('input[name="wd-sponsor"]:checked')?.value || 'No';

      allEntries.push({ label: 'First Name', type: 'text', value: firstName });
      allEntries.push({ label: 'Last Name', type: 'text', value: lastName });
      allEntries.push({ label: 'Email', type: 'email', value: email });
      allEntries.push({ label: 'Phone', type: 'tel', value: phone });
      allEntries.push({ label: 'Desired Salary', type: 'text', value: salary });
      allEntries.push({ label: 'Resume', type: 'file', value: resume });
      allEntries.push({ label: 'Technical Experience (.NET / Azure)', type: 'textarea', value: exp });
      allEntries.push({ label: 'US Work Authorization', type: 'radio', value: auth });
      allEntries.push({ label: 'Requires Sponsorship', type: 'radio', value: sponsor });
    } else if (portalId === 'greenhouse') {
      jobTitle = 'Lead Backend Engineer (Python / Distributed Systems)';
      company = 'TechCraft Labs';
      atsDomain = 'greenhouse';
      reqId = 'GH-9021';

      fullName = document.getElementById('gh-name')?.value || '';
      email = document.getElementById('gh-email')?.value || '';
      salary = document.getElementById('gh-salary')?.value || '';
      const fileInput = document.getElementById('gh-resume');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        resume = fileInput.files[0].name;
      } else if (fileInput && fileInput.dataset.fileName) {
        resume = fileInput.dataset.fileName;
      }

      const q1 = document.getElementById('gh-q1')?.value || '';
      const auth = document.getElementById('gh-work-auth')?.value || '';

      allEntries.push({ label: 'Full Name', type: 'text', value: fullName });
      allEntries.push({ label: 'Email', type: 'email', value: email });
      allEntries.push({ label: 'Resume', type: 'file', value: resume });
      allEntries.push({ label: 'Desired Salary', type: 'text', value: salary });
      allEntries.push({ label: 'Why TechCraft Labs?', type: 'textarea', value: q1 });
      allEntries.push({ label: 'Work Auth', type: 'select', value: auth });
    } else if (portalId === 'lever') {
      jobTitle = 'Senior Cloud Platform Architect';
      company = 'CloudCore Systems';
      atsDomain = 'lever';
      reqId = 'LEV-4819';

      fullName = document.getElementById('lev-name')?.value || '';
      email = document.getElementById('lev-email')?.value || '';
      salary = document.getElementById('lev-salary')?.value || '';
      const fileInput = document.getElementById('lev-resume');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        resume = fileInput.files[0].name;
      } else if (fileInput && fileInput.dataset.fileName) {
        resume = fileInput.dataset.fileName;
      }

      const q1 = document.getElementById('lev-q1')?.value || '';
      allEntries.push({ label: 'Full Name', type: 'text', value: fullName });
      allEntries.push({ label: 'Email', type: 'email', value: email });
      allEntries.push({ label: 'Resume', type: 'file', value: resume });
      allEntries.push({ label: 'Compensation', type: 'text', value: salary });
      allEntries.push({ label: 'Kubernetes Experience', type: 'textarea', value: q1 });
    }

    return {
      jobTitle,
      company,
      reqId,
      atsDomain,
      candidate_first_name: firstName,
      candidate_last_name: lastName,
      candidate_name: fullName,
      email_entered: email,
      phone_entered: phone,
      salary_expected: salary,
      resume_uploaded: resume,
      all_entries: allEntries
    };
  }

  // Dynamic backend base URL (works on file:/// and http://localhost:3001)
  const BACKEND_BASE = (window.location.protocol.startsWith('http')) ? window.location.origin : 'http://localhost:3001';

  // Real-time live streaming to backend on typing
  let streamTimer = null;
  function syncFormToBackend() {
    if (streamTimer) clearTimeout(streamTimer);
    streamTimer = setTimeout(async () => {
      const form = getActiveFormData();
      if (!form) return;

      const payload = {
        applier_id: "Christian (Applier)",
        candidate_id: "candidate-1",
        profile_assigned: "Adams Myers",
        extracted_data: {
          candidate_name: form.candidate_name,
          candidate_first_name: form.candidate_first_name,
          candidate_last_name: form.candidate_last_name,
          email_entered: form.email_entered,
          phone_entered: form.phone_entered,
          job_title: form.jobTitle,
          company: form.company,
          req_id: form.reqId,
          ats_domain: form.atsDomain,
          resume_uploaded: form.resume_uploaded,
          salary_expected: form.salary_expected,
          all_entries: form.all_entries
        },
        is_valid: Boolean(form.candidate_name && !form.candidate_name.includes('Andre') && form.email_entered && !form.email_entered.includes('andre')),
        timestamp: new Date().toISOString()
      };

      try {
        await fetch(`${BACKEND_BASE}/api/submissions/live-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        // Ignore offline catch
      }
    }, 100);
  }

  // Helper to simulate file upload on input[type="file"]
  function simulateFileUpload(inputEl, fileName) {
    if (!inputEl) return;
    inputEl.dataset.fileName = fileName;
    try {
      const file = new File(["dummy content"], fileName, { type: "application/pdf" });
      const dt = new DataTransfer();
      dt.items.add(file);
      inputEl.files = dt.files;
    } catch (_) {}
    dispatchInputEvents(inputEl);
  }

  // Trigger input events to notify both direct stream and content script
  function dispatchInputEvents(element) {
    if (!element) return;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    syncFormToBackend();
  }

  // Attach live input listeners to all forms in simulator
  document.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', syncFormToBackend);
    el.addEventListener('change', syncFormToBackend);
  });

  // Submit Handler for Forms in Simulator
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = getActiveFormData();
      if (!data) return;

      // Validation check against Adams Myers
      const errors = [];
      const enteredName = (data.candidate_name || '').toLowerCase();
      const enteredEmail = (data.email_entered || '').toLowerCase();

      if (enteredName && !enteredName.includes('adams') && !enteredName.includes('myers')) {
        errors.push({ rule: "IDENTITY_MISMATCH", message: `Identity Mismatch: Assigned to Adams Myers, but entered "${data.candidate_name}".` });
      }
      if (enteredEmail && !enteredEmail.includes('adams') && !enteredEmail.includes('techcraft.dev')) {
        errors.push({ rule: "EMAIL_MISMATCH", message: `Email Mismatch: "${data.email_entered}" does not belong to Adams Myers.` });
      }
      if (data.salary_expected === '0') {
        errors.push({ rule: "INVALID_SALARY", message: "Invalid salary: $0 entered." });
      }

      const isValid = errors.length === 0;
      const status = isValid ? "PASSED" : "FLAGGED_IN_AUDIT";

      // Capture final submission screenshot before dispatching payload
      await captureSimulatorScreenshot(`${currentWizardStepLabel} — Final Submission`, 'FINAL_SUBMIT');

      const mergedScreenshots = (window.SubmissionCheckerCore?.getScreenshots && window.SubmissionCheckerCore.getScreenshots().length > 0)
        ? window.SubmissionCheckerCore.getScreenshots()
        : testBenchScreenshots;

      const payload = {
        applier_id: "Christian",
        candidate_id: "candidate-1",
        profile_assigned: "Adams Myers",
        extracted_data: {
          candidate_name: data.candidate_name,
          candidate_first_name: data.candidate_first_name,
          candidate_last_name: data.candidate_last_name,
          email_entered: data.email_entered,
          phone_entered: data.phone_entered,
          job_title: data.jobTitle,
          company: data.company,
          req_id: data.reqId,
          ats_domain: data.atsDomain,
          resume_uploaded: data.resume_uploaded,
          salary_expected: data.salary_expected,
          screenshots_count: mergedScreenshots.length,
          all_entries: data.all_entries
        },
        screenshots: mergedScreenshots,
        validation_status: status,
        validation_errors: errors,
        validation_warnings: [],
        timestamp: new Date().toISOString()
      };

      try {
        const res = await fetch(`${BACKEND_BASE}/api/submissions/log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const resData = await res.json();
        
        showNotification(
          isValid ? `✅ Application Submitted & Logged! (Status: PASSED)` : `⚠️ Application Logged with Quality Flags (${errors.length} issues)`
        );
      } catch (err) {
        showNotification(`❌ Error logging: ${err.message}`, true);
      }
    });
  });

  function showNotification(msg, isError = false) {
    let notif = document.getElementById('sim-notification');
    if (!notif) {
      notif = document.createElement('div');
      notif.id = 'sim-notification';
      notif.style.position = 'fixed';
      notif.style.bottom = '24px';
      notif.style.right = '24px';
      notif.style.padding = '14px 20px';
      notif.style.borderRadius = '10px';
      notif.style.color = '#fff';
      notif.style.fontSize = '14px';
      notif.style.fontWeight = '700';
      notif.style.zIndex = '999999';
      notif.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
      document.body.appendChild(notif);
    }

    notif.style.background = isError ? '#dc2626' : '#10b981';
    notif.innerText = msg;
    notif.style.display = 'block';

    setTimeout(() => {
      notif.style.display = 'none';
    }, 3500);
  }

  // ===========================================================================
  // PRESET 1: PERFECT VALID SUBMISSION (Adams Myers - C# / .NET)
  // ===========================================================================
  document.getElementById('preset-valid')?.addEventListener('click', () => {
    document.querySelector('.portal-tab[data-portal="workday"]')?.click();

    document.getElementById('wd-first-name').value = "Adams";
    document.getElementById('wd-last-name').value = "Myers";
    document.getElementById('wd-email').value = "adams.myers@techcraft.dev";
    document.getElementById('wd-phone').value = "+1 (555) 234-8901";
    document.getElementById('wd-salary').value = "135000";
    document.getElementById('wd-q-experience').value = "I have 7 years of senior experience architecting C# .NET 8 Web APIs, Entity Framework Core, SQL Server, and microservices in Azure.";

    const authRadios = document.getElementsByName('wd-auth');
    if (authRadios[0]) authRadios[0].checked = true;

    const sponsorRadios = document.getElementsByName('wd-sponsor');
    if (sponsorRadios[0]) sponsorRadios[0].checked = true;

    simulateFileUpload(document.getElementById('wd-resume'), "Adams_Myers_Senior_DotNet_Resume.pdf");

    [
      document.getElementById('wd-first-name'),
      document.getElementById('wd-last-name'),
      document.getElementById('wd-email'),
      document.getElementById('wd-phone'),
      document.getElementById('wd-salary'),
      document.getElementById('wd-q-experience')
    ].forEach(dispatchInputEvents);
  });

  // ===========================================================================
  // PRESET 2: IDENTITY MISMATCH (Applier assigned to Adams, enters Andre)
  // ===========================================================================
  document.getElementById('preset-identity-mismatch')?.addEventListener('click', () => {
    document.querySelector('.portal-tab[data-portal="workday"]')?.click();

    document.getElementById('wd-first-name').value = "Andre";
    document.getElementById('wd-last-name').value = "Brown";
    document.getElementById('wd-email').value = "andre.brown@cloudcore.dev";
    document.getElementById('wd-phone').value = "+1 (555) 456-7890";
    document.getElementById('wd-salary').value = "130000";
    document.getElementById('wd-q-experience').value = "Extensive experience building robust scalable enterprise applications.";

    simulateFileUpload(document.getElementById('wd-resume'), "Adams_Myers_Resume.pdf");

    [
      document.getElementById('wd-first-name'),
      document.getElementById('wd-last-name'),
      document.getElementById('wd-email'),
      document.getElementById('wd-salary'),
      document.getElementById('wd-q-experience')
    ].forEach(dispatchInputEvents);
  });

  // ===========================================================================
  // PRESET 3: RESUME STACK MISMATCH (Python resume for C# job)
  // ===========================================================================
  document.getElementById('preset-stack-mismatch')?.addEventListener('click', () => {
    document.querySelector('.portal-tab[data-portal="workday"]')?.click();

    document.getElementById('wd-first-name').value = "Adams";
    document.getElementById('wd-last-name').value = "Myers";
    document.getElementById('wd-email').value = "adams.myers@techcraft.dev";
    document.getElementById('wd-salary').value = "130000";
    document.getElementById('wd-q-experience').value = "I have 6 years experience with backend systems.";

    simulateFileUpload(document.getElementById('wd-resume'), "Adams_Myers_Python_AI_Resume.pdf");

    [
      document.getElementById('wd-first-name'),
      document.getElementById('wd-last-name'),
      document.getElementById('wd-email'),
      document.getElementById('wd-salary'),
      document.getElementById('wd-q-experience')
    ].forEach(dispatchInputEvents);
  });

  // ===========================================================================
  // PRESET 4: DIRTY SCREENING ANSWERS ('.', 'na', single-char shortcuts)
  // ===========================================================================
  document.getElementById('preset-dirty-answers')?.addEventListener('click', () => {
    document.querySelector('.portal-tab[data-portal="workday"]')?.click();

    document.getElementById('wd-first-name').value = "Adams";
    document.getElementById('wd-last-name').value = "Myers";
    document.getElementById('wd-email').value = "adams.myers@techcraft.dev";
    document.getElementById('wd-salary').value = "130000";
    document.getElementById('wd-q-experience').value = ".";

    simulateFileUpload(document.getElementById('wd-resume'), "Adams_Myers_Senior_DotNet_Resume.pdf");

    [
      document.getElementById('wd-first-name'),
      document.getElementById('wd-last-name'),
      document.getElementById('wd-email'),
      document.getElementById('wd-salary'),
      document.getElementById('wd-q-experience')
    ].forEach(dispatchInputEvents);
  });

  // ===========================================================================
  // PRESET 5: SALARY FLOOR TRAP ($0 or below floor rate)
  // ===========================================================================
  document.getElementById('preset-salary-trap')?.addEventListener('click', () => {
    document.querySelector('.portal-tab[data-portal="workday"]')?.click();

    document.getElementById('wd-first-name').value = "Adams";
    document.getElementById('wd-last-name').value = "Myers";
    document.getElementById('wd-email').value = "adams.myers@techcraft.dev";
    document.getElementById('wd-salary').value = "0";
    document.getElementById('wd-q-experience').value = "Over 6 years of production C# development.";

    simulateFileUpload(document.getElementById('wd-resume'), "Adams_Myers_Senior_DotNet_Resume.pdf");

    [
      document.getElementById('wd-first-name'),
      document.getElementById('wd-last-name'),
      document.getElementById('wd-email'),
      document.getElementById('wd-salary'),
      document.getElementById('wd-q-experience')
    ].forEach(dispatchInputEvents);
  });

  // ===========================================================================
  // PRESET 6: INVERTED WORK AUTH & SPONSORSHIP ERROR
  // ===========================================================================
  document.getElementById('preset-work-auth')?.addEventListener('click', () => {
    document.querySelector('.portal-tab[data-portal="workday"]')?.click();

    document.getElementById('wd-first-name').value = "Adams";
    document.getElementById('wd-last-name').value = "Myers";
    document.getElementById('wd-email').value = "adams.myers@techcraft.dev";
    document.getElementById('wd-salary').value = "135000";
    document.getElementById('wd-q-experience').value = "Full stack C# .NET engineering background.";

    const sponsorRadios = document.getElementsByName('wd-sponsor');
    if (sponsorRadios[1]) sponsorRadios[1].checked = true;

    simulateFileUpload(document.getElementById('wd-resume'), "Adams_Myers_Senior_DotNet_Resume.pdf");

    [
      document.getElementById('wd-first-name'),
      document.getElementById('wd-last-name'),
      document.getElementById('wd-email'),
      document.getElementById('wd-salary'),
      document.getElementById('wd-q-experience')
    ].forEach(dispatchInputEvents);
  });

  // ===========================================================================
  // PRESET 7: INJECT APPLY-FLOW HASH (#job_id=cmub9842...)
  // ===========================================================================
  document.getElementById('preset-af-hash')?.addEventListener('click', () => {
    window.location.hash = "#job_id=cmub98421000108l4f6932a9z&profile_id=adams_1&profile_name=Nicholas%20Adam%20Myers&applier_id=debby_lead";
    if (window.SubmissionCheckerCore) {
      window.SubmissionCheckerCore.runLiveCheck();
    }
  });

  // ===========================================================================
  // PRESET 8: CLEAR APPLY-FLOW HASH (UNTRACKED)
  // ===========================================================================
  document.getElementById('preset-clear-hash')?.addEventListener('click', () => {
    sessionStorage.removeItem('applyflow_job_id');
    sessionStorage.removeItem('applyflow_profile_id');
    sessionStorage.removeItem('applyflow_profile_name');
    sessionStorage.removeItem('applyflow_applier_id');
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
    if (window.SubmissionCheckerCore) {
      window.SubmissionCheckerCore.runLiveCheck();
    }
  });

  // ===========================================================================
  // PRESET 9: TEST AI PROMPT & AUTO-FILL
  // ===========================================================================
  document.getElementById('preset-ai-prompt')?.addEventListener('click', () => {
    document.querySelector('.portal-tab[data-portal="workday"]')?.click();
    // Clear experience question to demonstrate AI filling
    const expField = document.getElementById('wd-q-experience');
    if (expField) expField.value = "";
    dispatchInputEvents(expField);

    // Trigger AI answer applier simulation
    if (window.JobFormExtractor) {
      const mockAiOutput = {
        answers: [
          {
            question: "Describe your production experience with C# .NET Core and Azure microservices",
            answer: "Over the past 7+ years, I have architected and deployed enterprise-grade C# .NET 8 microservices deployed on Azure Kubernetes Service (AKS). I designed event-driven architectures utilizing Azure Service Bus, Kafka, and Redis caching that scaled to handle 35,000+ RPS with 99.99% SLA."
          }
        ]
      };
      const res = window.JobFormExtractor.applyParsedAnswers(mockAiOutput);
      showToast(`🤖 Auto-filled ${res.count} answers via AI Simulation!`);
      if (window.SubmissionCheckerCore) {
        window.SubmissionCheckerCore.runLiveCheck();
      }
    }
  });

  // ===========================================================================
  // PRESET 10: TEST CONTEXT-AWARE SALARY TARGETING ($145k - $175k)
  // ===========================================================================
  document.getElementById('preset-jd-salary')?.addEventListener('click', () => {
    document.querySelector('.portal-tab[data-portal="workday"]')?.click();
    if (window.JobFormExtractor && window.SubmissionHUD) {
      const jdSalary = { has_jd_salary: true, min: 145000, max: 175000, isHourly: false, raw: "$145,000 - $175,000 / year" };
      const opt = window.JobFormExtractor.computeOptimalSalary({ compensation: { salaryFloor: 120000, desiredSalary: 130000 } }, jdSalary);
      const salaryInput = document.getElementById('wd-salary');
      if (salaryInput) {
        salaryInput.value = opt.target;
        dispatchInputEvents(salaryInput);
        showToast(`💰 Context Salary computed: $${Number(opt.target).toLocaleString()} (${opt.strategy})`);
      }
    }
  });

  // ===========================================================================
  // MULTI-PAGE WIZARD & SCREENSHOT CAPTURE ENGINE (SIMULATOR + EXTENSION)
  // ===========================================================================
  let testBenchScreenshots = [];
  let currentWizardStep = 1;
  let currentWizardStepLabel = 'Step 1: My Information';

  function renderSimulatorCanvasShot(stepLabel, trigger) {
    const data = getActiveFormData() || {};
    const canvas = document.createElement('canvas');
    canvas.width = 1100;
    canvas.height = 660;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, 76);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${data.company || 'HealthStream'} — ${data.jobTitle || 'Senior Full Stack C# .NET Engineer'} (${data.reqId || 'R-84920'})`, 28, 34);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Step: ${stepLabel}   |   Trigger: ${trigger}   |   Preserved Context: Active`, 28, 58);

    // Badge
    ctx.fillStyle = trigger === 'FINAL_SUBMIT' ? '#10b981' : '#6366f1';
    ctx.beginPath();
    ctx.roundRect(canvas.width - 230, 20, 200, 36, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(trigger === 'FINAL_SUBMIT' ? '✓ SUBMITTED SNAPSHOT' : `📸 ${trigger}`, canvas.width - 214, 43);

    // Form card
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(28, 96, canvas.width - 56, canvas.height - 124, 12);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(stepLabel, 52, 136);

    const answered = (data.all_entries || []).filter(e => e.value && String(e.value).trim() !== '');
    ctx.fillStyle = '#64748b';
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Candidate: ${data.candidate_name || 'Adams Myers'} (${data.email_entered || 'adams.myers@techcraft.dev'}) • ${answered.length} field(s) answered • ${new Date().toLocaleTimeString()}`, 52, 160);

    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(52, 174);
    ctx.lineTo(canvas.width - 52, 174);
    ctx.stroke();

    const colWidth = (canvas.width - 130) / 2;
    answered.slice(0, 10).forEach((entry, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 52 + col * (colWidth + 26);
      const y = 192 + row * 68;

      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.roundRect(x, y, colWidth, 54, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillText(String(entry.label || 'Field').slice(0, 50), x + 12, y + 19);

      ctx.fillStyle = '#0f172a';
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.fillText(String(entry.value || '').slice(0, 54), x + 12, y + 40);
    });

    return canvas.toDataURL('image/jpeg', 0.84);
  }

  async function captureSimulatorScreenshot(stepLabel, trigger = 'STEP_TRANSITION') {
    let shotObj = null;
    if (window.SubmissionCheckerCore?.captureScreenshot) {
      shotObj = await window.SubmissionCheckerCore.captureScreenshot(trigger, stepLabel);
    }
    if (!shotObj) {
      const data = getActiveFormData() || {};
      const answeredCount = (data.all_entries || []).filter(e => e.value && String(e.value).trim() !== '').length;
      shotObj = {
        id: `sim_shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        step_label: stepLabel,
        trigger,
        page_url: window.location.href,
        answered_count: answeredCount,
        total_fields_count: (data.all_entries || []).length,
        captured_at: new Date().toISOString(),
        data_url: renderSimulatorCanvasShot(stepLabel, trigger)
      };
    }

    const existingIdx = testBenchScreenshots.findIndex(s => s.step_label === shotObj.step_label && s.trigger === shotObj.trigger);
    if (existingIdx >= 0) {
      testBenchScreenshots[existingIdx] = shotObj;
    } else {
      testBenchScreenshots.push(shotObj);
    }

    renderSimulatorScreenshotStrip();
    syncFormToBackend();
    return shotObj;
  }

  function renderSimulatorScreenshotStrip() {
    const panel = document.getElementById('wd-screenshots-panel');
    const strip = document.getElementById('wd-screenshots-strip');
    const title = document.getElementById('wd-screenshots-title');
    if (!panel || !strip) return;

    if (testBenchScreenshots.length === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';
    if (title) {
      title.innerText = `📸 Captured Step & Submission Screenshots (${testBenchScreenshots.length})`;
    }

    strip.innerHTML = testBenchScreenshots.map((s, idx) => `
      <div style="flex: 0 0 185px; background: #1e293b; border: 1px solid #38bdf8; border-radius: 8px; overflow: hidden;">
        <div style="height: 98px; background: #020617; position: relative; overflow: hidden;">
          <img src="${s.data_url}" style="width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block;" />
          <span style="position: absolute; top: 5px; right: 5px; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(15,23,42,0.9); color: #38bdf8; border: 1px solid rgba(56,189,248,0.4);">
            ${s.trigger === 'FINAL_SUBMIT' ? 'SUBMIT' : s.trigger === 'STEP_TRANSITION' ? 'STEP' : 'SNAP'}
          </span>
        </div>
        <div style="padding: 6px 8px;">
          <div style="font-size: 11px; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.step_label || `Step ${idx + 1}`}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">${s.answered_count || 0} answered • ${new Date(s.captured_at).toLocaleTimeString()}</div>
        </div>
      </div>
    `).join('');
  }

  function setWorkdayWizardStep(stepNum) {
    currentWizardStep = stepNum;
    const stepLabels = {
      1: 'Step 1: My Information',
      2: 'Step 2: Application Questions',
      3: 'Step 3: Review & Submit'
    };
    currentWizardStepLabel = stepLabels[stepNum] || `Step ${stepNum}`;

    document.querySelectorAll('#wd-wizard-bar .wizard-step').forEach(btn => {
      const s = Number(btn.dataset.wdStep);
      const isActive = s === stepNum;
      btn.classList.toggle('active', isActive);
      btn.style.background = isActive ? '#0284c7' : '#1e293b';
      btn.style.borderColor = isActive ? '#38bdf8' : '#475569';
      btn.style.color = isActive ? '#fff' : '#cbd5e1';
    });

    // Simulate multi-page DOM transition: on Steps 2 and 3, hide the original JD box and change the header to a generic wizard step title!
    const jdBox = document.getElementById('wd-job-desc-box');
    const jobHeader = document.getElementById('wd-job-header');
    const contextBadge = document.getElementById('wd-context-status-badge');

    if (stepNum === 1) {
      if (jdBox) jdBox.style.display = 'block';
      if (jobHeader) jobHeader.innerText = 'Senior Full Stack C# .NET Engineer';
      if (contextBadge) contextBadge.innerText = '🛡️ Page 1: Caching Job Context (Senior Full Stack C# .NET Engineer @ HealthStream)';
    } else {
      if (jdBox) jdBox.style.display = 'none';
      if (jobHeader) jobHeader.innerText = currentWizardStepLabel;
      if (contextBadge) contextBadge.innerText = `🛡️ JD Removed on ${currentWizardStepLabel} — Original Job Context Preserved in Session!`;
    }

    // Highlight active step sections
    document.querySelectorAll('#form-workday .form-section[data-step-section]').forEach(sec => {
      const secStep = Number(sec.dataset.stepSection);
      sec.style.opacity = secStep === stepNum ? '1' : '0.55';
      sec.style.borderLeft = secStep === stepNum ? '3px solid #38bdf8' : 'none';
      sec.style.paddingLeft = secStep === stepNum ? '12px' : '0';
    });

    if (window.SubmissionCheckerCore) {
      window.SubmissionCheckerCore.runLiveCheck();
    }
  }

  document.querySelectorAll('#wd-wizard-bar .wizard-step').forEach(btn => {
    btn.addEventListener('click', () => {
      setWorkdayWizardStep(Number(btn.dataset.wdStep));
    });
  });

  document.getElementById('wd-btn-snap-now')?.addEventListener('click', async () => {
    await captureSimulatorScreenshot(currentWizardStepLabel, 'MANUAL');
    showNotification(`📸 Captured screenshot for ${currentWizardStepLabel}`);
  });

  document.getElementById('wd-btn-next-step')?.addEventListener('click', async () => {
    await captureSimulatorScreenshot(`${currentWizardStepLabel} (Completed)`, 'STEP_TRANSITION');
    const nextStep = currentWizardStep < 3 ? currentWizardStep + 1 : 1;
    setWorkdayWizardStep(nextStep);
    showNotification(`📸 Step screenshot saved → Advanced to ${currentWizardStepLabel}`);
  });

  // ===========================================================================
  // PRESET 11: MULTI-PAGE WIZARD + SCREENSHOT CAPTURE AUTOMATED DEMO
  // ===========================================================================
  document.getElementById('preset-multipage-screenshots')?.addEventListener('click', async () => {
    document.querySelector('.portal-tab[data-portal="workday"]')?.click();
    testBenchScreenshots = [];

    // Step 1: Fill Identity & Resume on Page 1 (while JD is visible)
    setWorkdayWizardStep(1);
    document.getElementById('wd-first-name').value = "Adams";
    document.getElementById('wd-last-name').value = "Myers";
    document.getElementById('wd-email').value = "adams.myers@techcraft.dev";
    document.getElementById('wd-phone').value = "+1 (555) 234-8901";
    simulateFileUpload(document.getElementById('wd-resume'), "Adams_Myers_Senior_DotNet_Resume.pdf");
    [
      document.getElementById('wd-first-name'),
      document.getElementById('wd-last-name'),
      document.getElementById('wd-email'),
      document.getElementById('wd-phone')
    ].forEach(dispatchInputEvents);

    showNotification("⏳ Step 1/3: Filled Identity & Resume — Capturing Step 1 Screenshot...");
    await new Promise(r => setTimeout(r, 450));
    await captureSimulatorScreenshot("Step 1: My Information & Resume", "STEP_TRANSITION");

    // Step 2: Transition to Page 2 (JD is removed from DOM, Screening Questions answered)
    setWorkdayWizardStep(2);
    document.getElementById('wd-q-experience').value = "I have 7+ years of production experience building high-throughput C# .NET 8 microservices, Azure Kubernetes Service (AKS), Entity Framework Core, and Kafka event pipelines.";
    const authRadios = document.getElementsByName('wd-auth');
    if (authRadios[0]) authRadios[0].checked = true;
    const sponsorRadios = document.getElementsByName('wd-sponsor');
    if (sponsorRadios[0]) sponsorRadios[0].checked = true;
    dispatchInputEvents(document.getElementById('wd-q-experience'));

    showNotification("⏳ Step 2/3: Answered Screening Questions (JD hidden) — Capturing Step 2 Screenshot...");
    await new Promise(r => setTimeout(r, 550));
    await captureSimulatorScreenshot("Step 2: Application Questions Answered", "QUESTIONS_ANSWERED");

    // Step 3: Transition to Page 3 (Compensation & Final Submit)
    setWorkdayWizardStep(3);
    document.getElementById('wd-salary').value = "155000";
    dispatchInputEvents(document.getElementById('wd-salary'));

    showNotification("⏳ Step 3/3: Entered Target Salary ($155,000) — Submitting & Sending 3 Screenshots to Apply-Flow...");
    await new Promise(r => setTimeout(r, 550));

    // Trigger form submit (which captures Screenshot #3 FINAL_SUBMIT and posts to /api/submissions/log)
    document.getElementById('form-workday')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  // Reset forms
  document.getElementById('reset-all-forms')?.addEventListener('click', () => {
    document.querySelectorAll('form').forEach(f => f.reset());
    testBenchScreenshots = [];
    setWorkdayWizardStep(1);
    renderSimulatorScreenshotStrip();
    syncFormToBackend();
  });

  // Initial sync on load
  syncFormToBackend();
});
