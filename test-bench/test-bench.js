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
          all_entries: data.all_entries
        },
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

  // Reset forms
  document.getElementById('reset-all-forms')?.addEventListener('click', () => {
    document.querySelectorAll('form').forEach(f => f.reset());
    syncFormToBackend();
  });

  // Initial sync on load
  syncFormToBackend();
});
