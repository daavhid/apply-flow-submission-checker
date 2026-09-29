# 🛡️ Submission Quality Checker & Live Gatekeeper (Chrome Extension MV3)

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
│   ├── popup.html             # Quick candidate selector & mode toggle
│   ├── popup.css              # Popup styling
│   └── popup.js               # Popup controller
├── options/
│   ├── options.html           # Full Management Dashboard & Settings
│   ├── options.css            # Options UI styling
│   └── options.js             # Profiles CRUD, Webhook settings & Audit History table
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
4. Click the extension icon in Chrome or open the built-in simulator:
   - File path: `test-bench/index.html` (or click *"🧪 Open ATS Simulator"* in popup)


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
