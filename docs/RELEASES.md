# Release variants and branch workflow

`main` contains the full SQC extension and the current Q&A sources. The standalone branch `feat/ai-questions-only` is preserved for the Q&A rollout. The older `feat/ai` branch is already an ancestor of main; the current Q&A work is on `feat/ai-questions-only`.

| Variant | Manifest | Runtime | Entry point |
| --- | --- | --- | --- |
| Full SQC + Q&A | `manifest.json` | `background/integrated-worker.js` | Existing SQC popup; ready workspace opens Q&A sidebar |
| Standalone Q&A | `manifests/qa.json` | `ai/worker.js` | Toolbar opens Q&A directly |

The integrated worker loads both services. `QA_` messages are handled only by the Q&A listener; all SQC auth, assignments, HUD behavior and submission checks remain with the original service. SQC and Q&A use separate storage keys and contexts. Uploading a sidebar resume cannot change the SQC assigned profile or authorize a job. The full release keeps the popup rather than changing the toolbar to open the sidebar directly.

On main:

```powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run build:all
```

Load `dist/extension` for the full release or `dist/qa/extension` for standalone Q&A. The ZIPs are `dist/submission-checker-extension.zip` and `dist/qa/applyflow-qa-extension.zip`. Each build replaces only its own unpacked folder and archive. On the original standalone branch, its existing default build still produces `dist/extension` and `dist/applyflow-qa-extension.zip`.

For later Q&A changes, keep working on `feat/ai-questions-only`, commit them, then merge that branch into main. Preserve the full main manifest and build profiles when resolving release-file conflicts; carry Q&A manifest changes into `manifests/qa.json`. Shared Q&A code lives in `ai/`. The main worker adapter resolves those imports from extension-root URLs and chooses toolbar behavior from the manifest, so both packages can use it. Do not replace main's popup, assigned-profile service, or HUD with the standalone manifest.

Keep the dedicated API documents separate: `APPLYFLOW-INTEGRATION.txt` is the full SQC backend contract; `QA-INTEGRATION.txt` is the resume-only Q&A contract. Run all unit checks, Chrome Q&A checks and both builds after each merge. Verify the full package contains SQC and Q&A assets and the standalone package contains only Q&A assets. Publish either release independently when ready; a local merge does not publish or push it.
