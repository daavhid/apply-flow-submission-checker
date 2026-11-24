'use strict';
importScripts('../config/runtime.js');
globalThis.SQCDeployment=SQCDeploymentRuntime.create({url:chrome.runtime.getURL('config/settings.json'),fetch});
// Keep SQC verification and Q&A storage/message namespaces independent.
importScripts('service-worker.js', 'sidebar-context.js');
globalThis.SQCIntegrated=SQCSidebarContext.create({chrome,session:sqcApplyFlow,availability:sqcAvailability});
importScripts('../ai/worker.js');
