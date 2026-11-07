/**
 * Command Center Dashboard Controller
 * Connects to SSE /api/stream and renders real-time typing events and logged submissions.
 */

document.addEventListener('DOMContentLoaded', () => {
  let submissions = [];
  let sse = null;

  // DOM Elements
  const statTotal = document.getElementById('stat-total');
  const statPassed = document.getElementById('stat-passed');
  const statBlocked = document.getElementById('stat-blocked');
  const sseStatus = document.getElementById('sse-status');

  const liveIdleState = document.getElementById('live-idle-state');
  const liveActiveState = document.getElementById('live-active-state');
  const liveTime = document.getElementById('live-time');
  const liveCandidateName = document.getElementById('live-candidate-name');
  const liveStatusPill = document.getElementById('live-status-pill');
  const liveJobTitle = document.getElementById('live-job-title');
  const liveCompany = document.getElementById('live-company');
  const liveAts = document.getElementById('live-ats');
  const liveReqId = document.getElementById('live-req-id');

  const liveEnteredName = document.getElementById('live-entered-name');
  const liveEnteredEmail = document.getElementById('live-entered-email');
  const liveEnteredPhone = document.getElementById('live-entered-phone');
  const liveEnteredResume = document.getElementById('live-entered-resume');
  const liveEnteredSalary = document.getElementById('live-entered-salary');
  const liveQaCount = document.getElementById('live-qa-count');
  const liveQaList = document.getElementById('live-qa-list');

  const historyCount = document.getElementById('history-count');
  const submissionsContainer = document.getElementById('submissions-container');

  const jsonModal = document.getElementById('json-modal');
  const jsonCode = document.getElementById('modal-json-content');

  // 1. Fetch initial submissions & metrics
  async function loadInitialData() {
    try {
      const res = await fetch('/api/submissions');
      const data = await res.json();
      submissions = data.submissions || [];
      renderSubmissions();
      updateMetrics();
    } catch (e) {
      console.warn("Could not load initial data:", e);
    }
  }

  function updateMetrics() {
    statTotal.innerText = submissions.length;
    const passed = submissions.filter(s => s.validation_status === 'PASSED').length;
    const blocked = submissions.filter(s => (s.validation_status || '').includes('FAIL') || (s.validation_status || '').includes('BLOCK')).length;

    statPassed.innerText = passed;
    statBlocked.innerText = blocked;
    historyCount.innerText = `${submissions.length} Records`;
  }

  // 2. Render Submissions History Feed
  function renderSubmissions() {
    if (submissions.length === 0) {
      submissionsContainer.innerHTML = `
        <div class="empty-state">
          <div style="font-size:32px; margin-bottom:8px;">📥</div>
          <h3>No Submissions Logged Yet</h3>
          <p>Click "Submit Application" on any job form or the ATS Simulator to test the capture gatekeeper!</p>
        </div>
      `;
      return;
    }

    submissionsContainer.innerHTML = submissions.map(sub => {
      const d = sub.extracted_data || {};
      const status = sub.validation_status || 'PASSED';
      let badgeClass = 'passed';
      if (status.includes('FAIL') || status.includes('BLOCK')) badgeClass = 'failed';
      if (status.includes('OVERRIDDEN')) badgeClass = 'overridden';

      const timeStr = new Date(sub.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const shots = Array.isArray(sub.screenshots) ? sub.screenshots : [];
      const shotsHtml = shots.length > 0 ? `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
          <div style="font-size: 11px; font-weight: 700; color: #38bdf8; margin-bottom: 6px;">
            📸 Captured Page Evidence (${shots.length} Screenshot${shots.length === 1 ? '' : 's'})
          </div>
          <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;">
            ${shots.map((s, idx) => `
              <div onclick="window.openScreenshotLightbox('${escapeHtml(sub.id)}', ${idx})"
                   style="cursor: pointer; flex: 0 0 135px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; overflow: hidden; transition: border-color 0.15s;"
                   title="Click to enlarge: ${escapeHtml(s.step_label || 'Step ' + (idx + 1))}">
                <div style="height: 74px; overflow: hidden; background: #020617; position: relative;">
                  <img src="${escapeHtml(s.data_url)}" style="width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block;" />
                  <span style="position: absolute; top: 4px; right: 4px; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: rgba(15,23,42,0.88); color: #38bdf8; border: 1px solid rgba(56,189,248,0.4);">
                    ${escapeHtml(s.trigger === 'FINAL_SUBMIT' ? 'SUBMIT' : s.trigger === 'STEP_TRANSITION' ? 'STEP' : 'Q&A')}
                  </span>
                </div>
                <div style="padding: 4px 6px; font-size: 10px; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${escapeHtml(s.step_label || `Page ${idx + 1}`)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '';

      return `
        <div class="sub-item-card">
          <div class="sub-top">
            <div>
              <div class="sub-candidate">${escapeHtml(sub.profile_assigned || 'Candidate')}</div>
              <div class="sub-time">🕒 ${timeStr} • ${escapeHtml(d.ats_domain || 'generic')}</div>
            </div>
            <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
          </div>

          <div class="sub-details">
            <div><strong>Role:</strong> ${escapeHtml(d.job_title || 'N/A')}</div>
            <div><strong>Company:</strong> ${escapeHtml(d.company || 'N/A')} ${d.req_id ? '(' + escapeHtml(d.req_id) + ')' : ''}</div>
            <div><strong>Email:</strong> ${escapeHtml(d.email_entered || 'None')} | <strong>Salary:</strong> $${escapeHtml(d.salary_expected || '0')}</div>
            <div><strong>Resume:</strong> <span style="color:#38bdf8;">${escapeHtml(d.resume_uploaded || 'None')}</span></div>
            ${shotsHtml}
          </div>

          <div class="sub-actions">
            <span style="font-size:11px; color:#94a3b8;">${(sub.validation_errors || []).length} errors, ${(sub.validation_warnings || []).length} warnings • 📸 ${shots.length} shot${shots.length === 1 ? '' : 's'}</span>
            <button class="btn btn-secondary btn-sm" onclick="window.inspectSubmission('${sub.id}')">🔍 View JSON Payload</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Render Live Typing Event
  function updateLiveFormState(payload) {
    if (!payload) return;
    const d = payload.extracted_data || {};

    liveIdleState.style.display = 'none';
    liveActiveState.style.display = 'block';
    liveTime.innerText = `Last update: ${new Date().toLocaleTimeString()}`;

    liveCandidateName.innerText = payload.profile_assigned || 'Active Profile';
    liveJobTitle.innerText = d.job_title || 'Unidentified Role';
    liveCompany.innerText = d.company || 'Unidentified Company';
    liveAts.innerText = d.ats_domain || 'generic';
    liveReqId.innerText = d.portal_job_id ? `${d.portal_job_id} (Req: ${d.req_id || 'N/A'})` : (d.req_id || 'N/A');

    liveEnteredName.innerText = d.candidate_name || d.candidate_first_name || '(Empty)';
    liveEnteredEmail.innerText = d.email_entered || '(Empty)';
    liveEnteredPhone.innerText = d.phone_entered || '(Empty)';
    liveEnteredResume.innerText = d.resume_uploaded || 'No file attached';
    liveEnteredSalary.innerText = d.salary_expected ? `$${d.salary_expected}` : '(Empty)';

    // Count unanswered fields across all screening entries
    const allEntries = d.all_entries || [];
    const unansweredEntries = allEntries.filter(e => !isFieldAnswered(e.value, e.type));
    const unansweredCount = unansweredEntries.length;
    const hasCoreInfo = Boolean((d.candidate_name || d.candidate_first_name) && d.email_entered);
    const isAlreadyApplied = Boolean(d.is_already_applied || payload.job_status === 'ALREADY_APPLIED');

    if (isAlreadyApplied) {
      liveStatusPill.className = 'status-pill info';
      liveStatusPill.style.background = 'rgba(59, 130, 246, 0.15)';
      liveStatusPill.style.color = '#60a5fa';
      liveStatusPill.style.border = '1px solid #3b82f6';
      liveStatusPill.innerText = '🔵 Already Applied';

      if (!d.candidate_name && !d.email_entered) {
        liveEnteredName.innerText = '(Application On File)';
        liveEnteredEmail.innerText = '(Application On File)';
      }
    } else if (payload.is_valid === false || payload.error_count > 0) {
      liveStatusPill.className = 'status-pill fail';
      liveStatusPill.style.background = 'rgba(239, 68, 68, 0.15)';
      liveStatusPill.style.color = '#ef4444';
      liveStatusPill.style.border = '1px solid #ef4444';
      liveStatusPill.innerText = `❌ ${payload.error_count || 1} Issue(s)`;
    } else if (unansweredCount > 0 || !hasCoreInfo) {
      liveStatusPill.className = 'status-pill warn';
      liveStatusPill.style.background = 'rgba(245, 158, 11, 0.15)';
      liveStatusPill.style.color = '#f59e0b';
      liveStatusPill.style.border = '1px solid #f59e0b';
      liveStatusPill.innerText = unansweredCount > 0 
        ? `🟡 In Progress (${unansweredCount} Unanswered)` 
        : '🟡 Form In Progress';
    } else {
      liveStatusPill.className = 'status-pill pass';
      liveStatusPill.style.background = 'rgba(16, 185, 129, 0.15)';
      liveStatusPill.style.color = '#10b981';
      liveStatusPill.style.border = '1px solid #10b981';
      liveStatusPill.innerText = '✅ Ready to Submit';
    }

    // Render Q&A fields
    liveQaCount.innerText = allEntries.length;

    let errorsHeaderHtml = '';
    const errList = payload.validation_errors || [];
    const warnList = payload.validation_warnings || [];
    if (errList.length > 0 || warnList.length > 0) {
      const errorBoxes = [
        ...errList.map(err => `
          <div style="background:rgba(239,68,68,0.15); border-left:3px solid #ef4444; border-radius:4px; padding:6px 8px; margin-bottom:4px; font-size:11px;">
            <strong style="color:#fca5a5;">🚫 ${escapeHtml(err.rule || 'ERROR')}:</strong>
            <span style="color:#cbd5e1;">${escapeHtml(err.message)}</span>
          </div>
        `),
        ...warnList.map(w => `
          <div style="background:rgba(245,158,11,0.15); border-left:3px solid #f59e0b; border-radius:4px; padding:6px 8px; margin-bottom:4px; font-size:11px;">
            <strong style="color:#fde68a;">⚠️ ${escapeHtml(w.rule || 'WARN')}:</strong>
            <span style="color:#cbd5e1;">${escapeHtml(w.message)}</span>
          </div>
        `)
      ].join('');

      errorsHeaderHtml = `
        <div style="background:#1e1b2e; border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:10px; margin-bottom:12px;">
          <div style="font-size:12px; font-weight:700; color:#fca5a5; margin-bottom:6px;">
            🚨 Active Form Issues (${errList.length + warnList.length})
          </div>
          ${errorBoxes}
        </div>
      `;
    }

    if (isAlreadyApplied) {
      liveQaList.innerHTML = `
        <div style="background:rgba(59, 130, 246, 0.1); border:1px solid #3b82f6; border-radius:6px; padding:12px; color:#93c5fd; font-size:12px;">
          <strong style="font-size:13px; color:#60a5fa;">🔵 Job Application Previously Submitted</strong><br>
          <div style="margin-top:4px; color:#cbd5e1;">${escapeHtml(d.already_applied_message || "This job application is already recorded as submitted on this ATS portal.")}</div>
        </div>
      `;
    } else if (allEntries.length === 0) {
      liveQaList.innerHTML = errorsHeaderHtml + '<div style="color:#64748b; font-size:12px; padding:8px;">No form fields detected yet</div>';
    } else {
      liveQaList.innerHTML = errorsHeaderHtml + allEntries.map(e => {
        const val = e.value;
        const labelText = e.label || 'Screening Question';
        const isReq = Boolean(e.required || e.is_required || (labelText && labelText.includes('*')));
        const isAnswered = isFieldAnswered(val, e.type);

        const reqBadge = isReq 
          ? `<span style="display:inline-block; font-size:10px; font-weight:700; color:#ef4444; background:rgba(239,68,68,0.12); padding:1px 6px; border-radius:4px; margin-left:6px; border:1px solid rgba(239,68,68,0.25);">* Required</span>` 
          : `<span style="display:inline-block; font-size:10px; color:#64748b; background:rgba(100,116,139,0.1); padding:1px 6px; border-radius:4px; margin-left:6px;">Optional</span>`;

        const valDisplay = isAnswered 
          ? `<span style="color:#10b981; font-weight:600;">${escapeHtml(val)}</span>`
          : (isReq 
              ? `<span style="color:#ef4444; font-weight:700; font-style:italic;">Missing Required Field</span>` 
              : `<span style="color:#f59e0b; font-style:italic;">Unanswered (Optional)</span>`);

        const borderStyle = isAnswered 
          ? 'border-left: 3px solid #10b981;' 
          : (isReq 
              ? 'border-left: 3px solid #ef4444; background: rgba(239, 68, 68, 0.05);' 
              : 'border-left: 3px solid #f59e0b; background: rgba(245, 158, 11, 0.03);');

        return `
        <div class="qa-card" style="${borderStyle}">
          <div class="qa-q">${escapeHtml(labelText)} <span style="font-size:10px; color:#64748b;">(${escapeHtml(e.type)})</span> ${reqBadge}</div>
          <div class="qa-a">${valDisplay}</div>
        </div>
      `;
      }).join('');
    }
  }

  function isFieldAnswered(val, type) {
    if (!val) return false;
    const s = String(val).trim().toLowerCase();
    if (['', 'unanswered', 'no file chosen', 'unselected', '(empty)', '(blank)', 'null', 'undefined', 'no answer', '-- no answer --', '- no answer -', 'not specified', '-- not specified --', 'please select', '-- select --', '- select -', 'select one', '-- select one --', 'select an option', '-- select an option --', 'select...', 'choose...', 'choose an option'].includes(s)) {
      return false;
    }
    if (/^(--|-)?\s*(select|choose|please select|select one|select an option|no answer|not specified)\s*(--|-)?$/i.test(s)) {
      return false;
    }
    if (type === 'checkbox' && s === 'unchecked (no)') {
      return false;
    }
    return true;
  }

  // 4. Connect SSE Stream
  function initSSE() {
    sse = new EventSource('/api/stream');

    sse.onopen = () => {
      sseStatus.innerText = 'Live Stream Connected';
    };

    sse.onerror = () => {
      sseStatus.innerText = 'Reconnecting...';
    };

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'LIVE_TYPING_EVENT') {
          updateLiveFormState(data.payload);
        } else if (data.type === 'NEW_SUBMISSION') {
          submissions.unshift(data.payload);
          renderSubmissions();
          updateMetrics();
        } else if (data.type === 'SUBMISSIONS_CLEARED') {
          submissions = [];
          renderSubmissions();
          updateMetrics();
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };
  }

  // 5. Inspect JSON Payload Modal
  window.inspectSubmission = (id) => {
    const item = submissions.find(s => s.id === id);
    if (!item) return;

    jsonCode.innerText = JSON.stringify(item, null, 2);
    jsonModal.style.display = 'flex';
  };

  window.openScreenshotLightbox = (submissionId, shotIndex) => {
    const item = submissions.find(s => s.id === submissionId);
    const shot = item?.screenshots?.[shotIndex];
    if (!shot) return;

    let lb = document.getElementById('sqc-dash-lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'sqc-dash-lightbox';
      lb.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(2,6,23,0.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;';
      lb.addEventListener('click', (e) => { if (e.target === lb) lb.style.display = 'none'; });
      document.body.appendChild(lb);
    }
    lb.innerHTML = `
      <div style="background:#0f172a;border:1px solid #334155;border-radius:14px;max-width:960px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.7);">
        <div style="padding:14px 18px;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:15px;font-weight:700;color:#f8fafc;">📸 ${escapeHtml(shot.step_label || 'Captured Page Screenshot')}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:2px;">Trigger: ${escapeHtml(shot.trigger || 'AUTO')} • ${shot.answered_count || 0} answered field(s) • ${shot.captured_at ? new Date(shot.captured_at).toLocaleString() : ''}</div>
          </div>
          <button onclick="document.getElementById('sqc-dash-lightbox').style.display='none'" class="btn btn-secondary btn-sm">✕ Close</button>
        </div>
        <div style="padding:16px;overflow-y:auto;background:#020617;text-align:center;">
          <img src="${escapeHtml(shot.data_url)}" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #1e293b;" />
        </div>
      </div>
    `;
    lb.style.display = 'flex';
  };

  document.getElementById('close-modal-btn')?.addEventListener('click', () => { jsonModal.style.display = 'none'; });
  document.getElementById('modal-close-btn-2')?.addEventListener('click', () => { jsonModal.style.display = 'none'; });

  document.getElementById('modal-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(jsonCode.innerText);
    const btn = document.getElementById('modal-copy-btn');
    btn.innerText = "✅ Copied!";
    setTimeout(() => { btn.innerText = "📋 Copy JSON"; }, 1500);
  });

  document.getElementById('clear-btn')?.addEventListener('click', async () => {
    if (!confirm("Clear all submission records in backend?")) return;
    await fetch('/api/submissions', { method: 'DELETE' });
    submissions = [];
    renderSubmissions();
    updateMetrics();
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  loadInitialData();
  initSSE();
});
