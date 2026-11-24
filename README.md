# Full SQC + AI Q&A releases

`main` uses one native Chrome sidebar with **Overview**, **Resume** and **Q&A** tabs. The toolbar opens sign-in directly for disconnected accounts. After login, Overview displays the account and assigned profiles without requiring a job. A verified job loads its status and approved resume automatically; missing resumes open the Resume tab. Uploads parse and save automatically, then close the editor. There is no floating HUD or manual completion button.

Tracked job URLs activate from browser navigation/load events without depending on a detected form or an open sidebar. Job verification errors appear on every sidebar tab with the failing API/field and **Copy details**. Missing resume text does not deactivate an otherwise verified job. After reloading an extension update, refresh an already-open job tab once to load the new content scripts.

Version 1.6 separates candidate reference facts from actual job documents, supports hidden Attach controls and importing an existing portal resume, and names the target candidate for each tracked application. It detects stable closed/404/410 pages, pauses application actions and reports unavailable status without downgrading applied records. Live progress starts only with actual input. Idle autofill does not rewrite dropdowns or repeatedly retry failed answers; editing a control pauses automatic filling.

Job associations are retained per tab through URL changes, denied refreshes and worker restarts. New opener tabs can carry discovery hints; backend verification still controls every new route. A different job needs its own verified launch context. Completing a valid form, clicking Next, seeing a Confirmation heading, or manually invoking the old HUD method cannot mark a job submitted. The extension requires a visible definitive portal notice and an acknowledged ApplyFlow record before displaying completion.

Deployment settings live in [config/settings.json](config/settings.json). Edit that source, run `npm.cmd run build:all`, and reload/distribute the rebuilt extension. Main enforces these settings instead of asking appliers to choose them. Set `resume.mode` to `fixed` for an approved shared candidate resume or `tailored` for a separate job resume. An explicit backend tailoring requirement still applies. Keep passwords and API credentials out of this file; the saved workspace endpoint and email/password login remain separate.

Uploaded resumes are scoped to the assigned candidate and job (or candidate for fixed mode), renamed to the candidate's name with their original file extension, and parsed into skills and employment entries. Employment fills current/newest through oldest, keeping each employer, title, dates and description together. Manual edits are preserved; unsupported or ambiguous rows stay available for review. Successful attachment closes the resume editor and leaves the sidebar open.

Browser navigation captures launch identifiers before redirects and carries the application into Apply-created tabs, including tabs without an opener ID. Login, wrapper and later application pages retain the same job association without a predefined route list. Backend identity/version verification still precedes actions on new pages. Page answers are collected per application across steps and sent with confirmed submission evidence. A correlated committed `APPLIED` acknowledgement displays completion immediately, with a background status refresh.

Overview includes candidate copy controls, readiness steps and an **Already applied** acknowledgement shown only for a backend-confirmed duplicate. Candidate-wide matching across appliers needs ApplyFlow's `duplicateCheck` response described in the integration contract; a missing result does not prove that history was searched. Resume has original-file attach/download controls, expandable employment, skills and extracted text. Original attachment bytes stay unchanged. Main Q&A uses the versioned screening API, with per-answer copy/fill controls and **Fill ready answers** for reviewed or factual answers.

The standalone rollout branch **feat/ai-questions-only** remains available with no SQC login or HUD. See [release variants](docs/RELEASES.md) and [Q&A features](docs/QA-README.md).

| Command on main | Unpacked extension | ZIP |
| --- | --- | --- |
| `npm run build` / `npm run build:sqc` | `dist/extension` | `dist/submission-checker-extension.zip` |
| `npm run build:qa` | `dist/qa/extension` | `dist/qa/applyflow-qa-extension.zip` |
| `npm run build:all` | Both directories above | Both archives above |

Builds clean only their own output folder, so producing one release preserves the other. `npm test` checks both variants; `npm run test:browser` runs the standalone Q&A Chrome checks, and `npm run test:browser:sqc` checks the unified workspace.

# 🛡️ Submission Quality Checker & Live Gatekeeper (Chrome Extension MV3)

> ApplyFlow integration migration: Configure the endpoint, then sign in with your ApplyFlow applier email and password. SQC locks the candidate profile assigned to that applier and verifies each job against it. Temporary passwords can require a change before applying. The backend must implement [SQC contract version 2](docs/APPLYFLOW-INTEGRATION.txt), including authentication, profile assignment, context verification, AI screening answers, and event acknowledgements. Historical standalone examples below do not authenticate the integrated build.

For each job, use the approved ApplyFlow resume or upload a replacement in the sidebar. SQC uses that document for supported work-history rows, skills, and explicit experience numbers. Identity, contact details, authorization, and other approved profile facts continue to come from ApplyFlow's locked candidate profile.

**Questions and answers live in the same sidebar.** Supported fields are detected automatically, configured defaults resolve locally, and the applier can request grounded AI answers for the remaining questions. Matching supported controls can be filled while preserving existing entries. The backend must accept the local `resumeContext` envelope in the [integration contract](docs/APPLYFLOW-INTEGRATION.txt).

Build with `npm run build` and load `dist/extension`. Run `npm test` for the authentication, context isolation, and content autofill checks. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.


An intelligent, real-time ATS Quality Gatekeeper and DOM Extraction extension that intercepts job applications, prevents human error across all 6 core failure scenarios, provides a live floating HUD, and logs verified submission payloads directly to your backend.

---

## 🚀 Key Features & Interception Scenarios

1. **Identity & Profile Integrity Gate**
   - Injects active candidate assignment context into the page.
   - Live checks `first_name`, `last_name`, `fullName`, and `email` input fields.
   - **Hard Block:** Prevents submitting if an applier enters another candidate's autofilled details.

2. **Email & Domain Security / Verification Traps**
   - Validates entered email against candidate's verified aliases.
   - Flags typos (`@gmial.com`, `@yaho.com`).
   - Detects portal verification triggers ("Enter 6-digit PIN", "Magic Link") and warns the applier to retrieve the code before closing the tab.

3. **Resume & Tech Stack Alignment**
   - Detects missing file attachments on multi-step forms.
   - Validates that the uploaded resume filename belongs to the active candidate.
   - Flags stack mismatches (e.g. uploading a Python resume for a C# / .NET posting).

4. **Screening Questions & Dirty Answer Filtering**
   - Intercepts dirty shortcut answers (`.`, `-`, `na`, `n/a`, `asdf`).
   - Enforces minimum response length thresholds on qualitative technical prompts.
   - **Work Auth & Sponsorship Compliance:** Enforces candidate-specific authorization answers (e.g., flags answering "Yes" to requiring visa sponsorship when candidate is a US Citizen).

5. **Compensation & Salary Guard**
   - Flags $0, $1, or dirty placeholders that trigger ATS auto-rejection.
   - Warns if entered salary falls below candidate's approved salary floor.

6. **Duplicate Submission Detection**
   - Parses Requisition ID, Company, and Role Title from page DOM/URL.
   - Checks against local cache of past submissions to prevent duplicate submissions.

7. **⚡ "Automate Everything Else" & Granular Autofill Settings**
   - Configurable switches under Settings to auto-populate all standard candidate identity, contact, address, EEOC surveys, and screening answers on page load.
   - Preserves manual `⚡ Restore` functionality if preferred.

8. **💰 Context-Aware Compensation Targeting**
   - Detects posted salary budgets in Job Descriptions (`$140k - $175k/yr`, `$70 - $95/hr`).
   - If JD budget is higher than profile floor, dynamically targets the **upper-mid of the posted range** (~70% point) to maximize compensation.
   - Falls back safely to candidate desired/floor salary if no salary is listed.

9. **🤖 1-Click ChatGPT Prompt Generator & AI Auto-Fill Dialog**
   - **`🤖 AI Prompt`**: Bundles candidate profile, technical experience summary, key projects, job description excerpt, and unanswered questions into a standardized JSON prompt for ChatGPT.
   - **`📥 Paste`**: Opens an AI answers dialog that parses the JSON output from ChatGPT and automatically inputs tailored answers into corresponding textareas and form fields on the page.

10. **🛡️ Human Verification & CAPTCHA Assistance**
    - Detects Google reCAPTCHA, hCaptcha, Cloudflare Turnstile, and "I'm not a robot" prompts.
    - Visually highlights the widget with a glowing outline and displays a banner notifying the applier that all form fields are automated and only the human check requires manual completion.

---

## 📁 Architecture Overview

```
submission-checker/
├── manifest.json              # Chrome Manifest V3 configuration
├── background/
│   └── service-worker.js      # State management, webhook dispatcher, duplicate cache
├── content/
│   ├── extractor.js           # Multi-ATS DOM parsing engine (Workday, Greenhouse, Lever, etc.)
│   ├── validator.js           # Real-time rules engine for all 6 failure scenarios
│   ├── hud.js                 # Draggable floating HUD, badge, drawer & blocking modal
│   ├── content.js             # Event listeners & capture-phase submit interceptor
│   ├── hud.css                # HUD design system & glassmorphism styling
│   └── injector.css           # In-page glowing field error highlights & tooltips
├── popup/
│   ├── popup.html             # Compact application workspace
│   ├── popup.css              # Popup styling
│   └── popup.js               # Popup controller
├── options/
│   ├── options.html           # Preferences, Account & Connection, Audit History
│   ├── options.css            # Options UI styling
│   └── options.js             # Browser preferences, managed account, searchable audit history
├── test-bench/
│   ├── index.html             # Interactive ATS Simulator (Workday, Greenhouse, Lever)
│   ├── test-bench.css         # Simulator styling
│   └── test-bench.js          # One-click preset scenarios
└── icons/                     # Extension icons (16, 48, 128 px)
```

---

## 🚀 Quick Start (Local Backend & Extension)

### 1. Start the Local Test Backend Server
```bash
# In c:\Users\debby\Desktop\submission-checker
pnpm install
pnpm dev
```
- 🌐 **Backend Server:** `http://localhost:3001`
- 📡 **Live Webhook Endpoint:** `http://localhost:3001/api/submissions/log`
- 📊 **Real-time Monitoring Dashboard:** `http://localhost:3001/`
- ⚡ **Live SSE Typing Event Stream:** `http://localhost:3001/api/stream`

*(Note: If port 3000 or 3001 is already occupied by another app, the server will automatically detect it and try the next available port).*

### 2. Load Extension in Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select:
   ```
   c:\Users\debby\Desktop\submission-checker
   ```
4. The extension opens a centered setup page. Enter your ApplyFlow backend URL,
   sign in with your applier email and password, then review the candidate assigned
   to you. ApplyFlow can be open in a different Chrome profile; a website login
   in this profile is not required.
5. Continue to the workspace. It shows **Waiting for an application** until you
   open an assigned job in this browser. The floating HUD appears on job portals,
   and application actions require a server-verified candidate and job context.
   Click the extension icon to reopen the workspace, manage your account, or
   change protection preferences.


---

## 🧪 Testing with the Built-In ATS Simulator

1. Click the extension icon in Chrome or navigate to:
   ```
   chrome-extension://<EXTENSION_ID>/test-bench/index.html
   ```
   *(Or click "🧪 Open ATS Simulator" in the extension popup / options page)*
2. Try out the **Quick Scenario Presets**:
   - **Preset 1 (Perfect Valid Submission):** See all checks turn green (`Ready`) in the floating HUD.
   - **Preset 2 (Identity Mismatch):** Hit "Submit Application" and observe the **Hard Block Interception Modal**.
   - **Preset 3 (Resume Stack Mismatch):** See the resume field glow in red with a live mismatch tooltip.
   - **Preset 4 (Dirty Screening Answers):** See the textarea highlight with a warning to provide a meaningful response.
   - **Preset 5 (Salary Floor Trap):** Detects $0 / below-floor entries.
   - **Preset 6 (Inverted Work Auth):** Flags sponsorship discrepancies immediately.

---

## 📡 Backend Webhook Integration

When a submission is made, the extension dispatches a standardized JSON payload to your configured Webhook URL:

```json
{
  "applier_id": "Christian",
  "candidate_id": "candidate-1",
  "profile_assigned": "Adams Myers",
  "extracted_data": {
    "candidate_name": "Adams Myers",
    "email_entered": "adams.myers@techcraft.dev",
    "job_title": "Senior Full Stack C# .NET Engineer",
    "company": "HealthStream",
    "req_id": "R-84920",
    "ats_domain": "workday",
    "job_url": "https://healthstream.wd1.myworkdayjobs.com/...",
    "resume_uploaded": "Adams_Myers_Senior_DotNet_Resume.pdf",
    "salary_expected": "135000",
    "screening_qa": [
      {
        "type": "textarea",
        "q": "Describe your production experience with C# .NET Core and Azure microservices:",
        "a": "I have 7 years of senior experience architecting C# .NET 8 Web APIs..."
      },
      {
        "type": "radio",
        "q": "Are you legally authorized to work in the United States?",
        "a": "Yes"
      }
    ]
  },
  "validation_status": "PASSED",
  "validation_errors": [],
  "validation_warnings": [],
  "timestamp": "2026-09-24T19:00:00.000Z"
}
```

- **Offline / Local Simulation:** If your backend server is not yet running, the extension safely stores all logs in Chrome Local Storage so no submission history is lost.
- **Audit Mode vs Active Gate:** You can switch between *Active Gate* (blocks invalid submissions) and *Passive Audit* (logs in background without stopping the user) at any time from the popup or dashboard.
