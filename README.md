# ApplyFlow resume Q&A sidebar

Branch: `feat/ai-questions-only`. Click the toolbar icon to open Q&A beside the current application. No sign-in is required. The sidebar can now detect screening questions and apply exact choice selections to the active application.

1. Upload a PDF, DOCX or TXT resume (up to 10 MB), or paste its text.
2. Review the extracted text. Select **Use this resume**, or generate answers to save the reviewed text automatically.
3. Let the sidebar detect screening questions on the active application, then review the batch. You can also paste questions with **Add pasted questions** or use **Add a question**.
4. Select **Get answers** to process the batch asynchronously.
5. Review/edit answers. Supported linked fields can be filled automatically; **Copy answer** and **Copy all answers** remain available.

Supports open paragraphs, short text, Yes/No, radio and dropdown single choices, checkbox multiple choices, numbers, dates, email, URLs, and phone fields. Add exact options and optional character limits in the editor. For pasted choices, use a numbered question followed by dash-prefixed choices:

The standard answer-defaults template includes your requested race/ethnicity preference (**Two or more races**, falling back to a nondisclosure option), **Gender: Male**, **Hispanic/Latino: No**, **not a protected veteran**, and **no SMS application updates**. These extension defaults are active automatically across job tabs and newly loaded resumes; no activation checkbox is required. Existing saved templates and active defaults are preserved. Pronouns, sexual orientation and legal-gender identification remain unspecified. Missing matching options still need your input.

```text
1. Have you used Python?
- Yes
- No

2. Which languages do you use?
- Python
- SQL
```

Review the detected types; change the second question to **Checkbox / multiple choices** if appropriate. You can also enable automatic screening-question detection as described below.

A batch accepts up to 100 questions. It processes groups of ten with at most two concurrent AI calls and displays progress plus completed answers as they arrive. Successful groups remain available if another group fails or you stop. Results preserve question order; edits and Copy controls remain usable during processing. Choice answers must match supplied options exactly. Missing personal facts need manual input. Use **Copy answer** for one field or **Copy all answers** for the completed batch.

The selected resume text is sent to ApplyFlow with every question batch. Behavioral and situational questions receive a concise 2-3 sentence first-person STAR draft using the resume's real projects and technologies. The sidebar labels inferred scenarios for the applicant to confirm or edit. It does not invent quantified results or credentials. Missing factual declarations, including non-compete status, still require manual input. An incorrect behavioral refusal is retried once with the same resume and original question ID. There is no assigned profile, candidate lookup, authentication, auditing, form validation or submission blocking. Known answers can be applied to supported linked fields; inferred behavioral drafts must be marked reviewed before filling.

The sidebar shows a loader and Stop button during generation. **Remove resume** clears the stored text and displayed answers. Changing the resume invalidates answers generated from its previous version. Valid resume edits are saved automatically when you generate answers. Without a complete resume, the main action opens the resume section and explains what is required. Connection errors preserve your existing answers and scroll position.

## Detect questions and apply choice answers

Open an application page and click the extension toolbar icon. The extension requests persistent access to HTTP/HTTPS pages so new job tabs connect automatically, including different application sites. Keep Chrome's extension Site access set to **On all sites** and **Auto-detect application fields and questions** enabled. Switching tabs or finishing navigation refreshes detection immediately, with a three-second polling fallback for dynamic forms. If Chrome withholds site access, **Connect application page** remains available to restore that site's permission. Required flags, answer types, exact options, text limits, numeric constraints and accessible help text are carried with the question. Review or edit the batch before choosing **Get answers**. Detection alone makes no AI request.

Paylocity screening fields are supported through their paragraph/span question headings, `.multi-question` / `.text-question` containers and visible `(required)` markers, including textareas with unassociated labels. These are extracted from visible DOM controls; embedded application state or hidden answer metadata is not used. A zero-result scan includes control/label diagnostics under **Detection details**. The injected bridge is versioned so an updated detector replaces a stale bridge on the next scan.

Detection includes visible unanswered names, contact/address/profile URL fields, demographic questions and upload tasks, as well as screening questions. Names and contact answers must come from the selected resume or supplied facts; they are never shared defaults across different candidates. Passwords, security codes, government identifiers, legal-agreement boxes, hidden/disabled controls and fields already answered remain excluded. **Refresh page questions** rescans the page and restores dismissed detected fields. Uploads are detected as file tasks. Matching Resume/CV fields can receive the original file saved in the extension; other document uploads remain manual.

This detector works from form semantics rather than a fixed list of employers. It covers native controls, accessible ARIA choices, accessible frames and open shadow DOM, but cannot guarantee every company's custom widget or future platform change. Open an unsupported custom dropdown and refresh: when it exposes associated visible options, they are captured as exact choices. Closed or inaccessible dropdown choices remain manual, as do closed shadow roots, restricted frames and later steps that have not loaded. Use **Add questions manually** for anything still missing. Detection and filling never advance or submit an application.

Version 2.7 also detects short screening labels without question marks, headings outside nested field wrappers, and styled native choices with visible associated labels. Checkbox answers have individual toggles in the sidebar: select multiple answers without Ctrl/Cmd, then apply the edited selection to the page.

Under **Answer defaults**, **Load updated standard defaults** loads the current starter even if an older template is saved. It includes the requested authorization Yes (confirm the applicable country separately; the sponsorship default is No) and a salary preference for the posted upper base-pay boundary, with the midpoint also acceptable strictly above 100,000 annually. The applicable country, currency and other unspecified context still come from the current resume or saved overrides. A missing range or a range whose upper boundary does not exceed the threshold requires input. The extension does not infer a range that was not supplied with the questions or defaults.

**Apply matching radio, checkbox and dropdown answers** is on by default. Only the exact returned option(s) are selected, including multiple checked options when appropriate. This never means checking every available checkbox. Unknown or missing factual answers remain manual. The **Also fill supported written and numeric answers** toggle adds native textareas, text/number/date/email/URL/phone inputs and simple contenteditable textboxes. Inferred behavioral drafts wait until you choose **Mark reviewed**. Every linked answer also has an explicit apply/fill button, and Copy remains available. Existing applier edits, unsupported custom dropdowns, rich-text editors or answers outside field limits require manual handling.

Before selecting a choice, the extension checks the original tab/document, page URL, question text, control identity, options and current selection. It preserves changes made by the applier and refuses stale fields. No submission button is clicked and no form submission is intercepted. Supported controls include native inputs/selects, accessible ARIA radio/checkbox groups and open shadow roots. Plain editable custom textboxes are supported. Closed custom dropdowns are offered as copy-only questions when their labels are available; their hidden choices, inaccessible embedded cross-origin forms and closed shadow roots may require manual entry. A different site may require another toolbar click or a separate Connect approval. Permission, restricted-page and detector execution errors have distinct messages; expand **Detection details** when troubleshooting.

Screenshots and image input have been removed. Persistent HTTP/HTTPS host permissions allow automatic connection across job tabs once Chrome grants site access. The tabs permission identifies the active application URL. Detection runs while the sidebar is open; there is no persistent all-sites content script, auditing, page scoring or submission blocking.

## Answer defaults

Standard extension defaults are always active. No confirmation checkbox or per-resume activation is needed. Loading a different resume keeps these standard answers available automatically. Names, contact details, education and experience continue to come from the selected resume. Missing or conflicting facts still need input.

Open **Answer defaults** only to edit optional overrides. **Save resume overrides** applies those edits immediately for the current resume. **Reset to extension defaults** removes those overrides and restores the built-in defaults. Edits remain in the editor until saved. Saved templates are drafts for reuse; importing or loading one does not silently replace active answers.

Resume-specific overrides stay bound to their resume version and browser session, so they never transfer another candidate's facts to a new resume. Extension defaults remain available after overrides are cleared, the sidebar or worker restarts, or a different resume is loaded.

## Sidebar overview

The overview shows questions in the batch, answered questions, items needing review, and answers applied to the page. Click a count to jump to the batch or a filtered answer view. Each answer shows its input type and status: ready to copy, draft, needs input, reviewed, or applied. **Mark reviewed** records your own confirmation in the open sidebar; it is not an AI confidence score or application audit. Filters let you focus on drafts, review items or applied choices. Manual question entry is expandable to keep the main workspace compact.

## Named resume attachments

Upload the original PDF, DOCX or TXT to Resume context. The extension detects a candidate-name heading; an editable name field handles missing or ambiguous headings. Saving uses only that name plus the original extension, such as `Nicholas Ruiz.pdf`. It preserves the original bytes and format rather than generating a replacement document.

Matching empty Resume/CV upload inputs are attached automatically while the attachment toggle is enabled. **Attach resume to this application** saves the pending upload and attaches it directly without an AI request. Existing attachments and cover-letter fields are not replaced; incompatible formats or unsupported portal widgets remain manual. **Download named resume** supplies the same renamed original for those manual uploads. No submit button is clicked.

Original bytes stay in extension-local IndexedDB and are never sent to the AI endpoint. Only the current resume can be attached. Replacing a resume prunes old files, and **Remove resume** deletes the saved original. Session context still expires with the browser session; orphan files are cleared when an empty session is next read. Changing saved resume text without a new original upload drops its attachment binding.

Sponsorship questions asking whether sponsorship is needed now or in the future receive **No** by default, including plain text fields. Combined work-authorization questions and reversed wording still use the actual context instead of blindly inserting No.

## Servers

Both are embedded in `ai/config.js`:

- Default: `https://applyflow-api.jhproit.com/api/ai/chat`
- Local: `http://localhost:5000/api/ai/chat`

Select the server in the sidebar. Requests go only to that server and do not fall back automatically. API calls omit cookies and authentication headers. Provider secrets remain on ApplyFlow. See [the API payload](docs/APPLYFLOW-INTEGRATION.txt).

Resume text is stored in trusted extension session storage so it survives sidebar reloads and worker restarts during the browser session. It is cleared by **Remove resume**, extension reload/update/disable, or the end of the browser session. Questions and edited answers are not persisted. Raw uploaded documents stay local; only their extracted text and filename are sent with questions. Legacy SQC sources remain in the repository but are not loaded or packaged.

## Build and verify

- `npm test`: Q&A, resume persistence and stale-answer checks.
- `npm run test:browser`: isolated Chrome checks using a test API, including real PDF/DOCX/TXT parsing and the narrow sidebar layout. Set `CHROME_PATH` if needed.
- `npm run build`: creates `dist/extension` and `dist/applyflow-qa-extension.zip` containing only the manifest, Q&A code, parser libraries and icons.

In PowerShell, use `npm.cmd` if needed. Load `dist/extension` through Chrome's **Load unpacked**, or reload the extension after a build. Chrome 116 or newer is required. For local use, run ApplyFlow on port 5000 and select **Localhost :5000**.
