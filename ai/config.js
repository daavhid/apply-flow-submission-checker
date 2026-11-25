/* Internal deployment configuration. Configure the server URL, never provider secrets. */
globalThis.SQC_AI_CONFIG = Object.freeze({
  endpoint: 'https://applyflow-api.jhproit.com/api/ai/chat',
  localEndpoint: 'http://localhost:5000/api/ai/chat',
  timeoutMs: 600000
});
