/**
 * Submission Quality Checker - Local Test Backend Server
 * Receives live extension webhooks, tracks real-time typing events, and provides monitoring dashboard.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// SSE Client Connections for Live Streaming
let sseClients = [];

function broadcastSSE(type, payload) {
  const data = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  sseClients.forEach(client => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch (e) {
      // Ignore write errors
    }
  });
}

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request Logger with Timestamp & Status Colors
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const time = new Date().toLocaleTimeString();
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : res.statusCode >= 300 ? '\x1b[33m' : '\x1b[32m';
    console.log(`[${time}] ${req.method} ${req.url} ${statusColor}${res.statusCode}\x1b[0m (${duration}ms)`);
  });
  next();
});

// Serve Public Web Dashboard
app.use(express.static(path.join(__dirname, 'public')));
app.use('/simulator', express.static(path.join(__dirname, '..', 'test-bench')));
app.use('/test-bench', express.static(path.join(__dirname, '..', 'test-bench')));

// =============================================================================
// API ROUTES
// =============================================================================

// Health / Ping Route
app.all(['/api/health', '/api/ping'], (req, res) => {
  res.json({
    status: 'OK',
    server: 'Submission Quality Checker Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// SSE Live Stream Endpoint
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send initial connection packet
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE stream connected', clientId })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// 1. Live Typing / Form Interaction Stream (Real-Time Field Feedback)
app.post(['/api/submissions/live-event', '/api/live-event'], (req, res) => {
  const eventData = req.body;
  
  if (eventData?.extracted_data?.is_already_applied) {
    console.log(`[ALREADY APPLIED DETECTED] Candidate: ${eventData.profile_assigned} | Job: ${eventData.extracted_data?.job_title} @ ${eventData.extracted_data?.company}`);
  }

  // Broadcast live snapshot to any open dashboards/listeners
  broadcastSSE('LIVE_TYPING_EVENT', eventData);

  res.json({ success: true, receivedAt: new Date().toISOString() });
});

// 1b. Check for Existing / Duplicate Submission
app.get(['/api/submissions/check-duplicate', '/api/check-duplicate'], (req, res) => {
  const { candidate_id, job_url, req_id, company, job_title } = req.query;
  const duplicate = db.findDuplicateSubmission({ candidate_id, job_url, req_id, company, job_title });

  if (duplicate) {
    return res.json({
      already_applied: true,
      existingRecord: duplicate,
      appliedAt: duplicate.timestamp,
      applier: duplicate.applier_id || 'Unknown Applier',
      candidate: duplicate.profile_assigned || 'Active Profile',
      status: duplicate.validation_status || 'SUBMITTED'
    });
  }

  return res.json({
    already_applied: false,
    existingRecord: null
  });
});

// 2. Final Submission Logging Endpoint (Webhook Target)
app.post(['/api/submissions/log', '/api/submissions'], (req, res) => {
  const submissionPayload = req.body;

  if (submissionPayload && (submissionPayload.ping === true || submissionPayload.ping === 'true')) {
    return res.status(200).json({
      success: true,
      status: 'OK',
      message: 'Webhook ping successful! Server is actively listening.',
      timestamp: new Date().toISOString()
    });
  }

  if (!submissionPayload || (!submissionPayload.extracted_data && !submissionPayload.profile_assigned)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload. Expected extracted_data or profile_assigned in body.'
    });
  }

  // Save to persistent local DB
  const savedRecord = db.saveSubmission(submissionPayload);

  // Pretty print to terminal
  console.log('\n======================================================');
  console.log('📥 NEW SUBMISSION INTERCEPTED & LOGGED');
  console.log(`👤 Candidate: ${savedRecord.profile_assigned || 'Unknown'}`);
  console.log(`💼 Job:       ${savedRecord.extracted_data?.job_title || 'N/A'}`);
  console.log(`🏢 Company:   ${savedRecord.extracted_data?.company || 'N/A'} (${savedRecord.extracted_data?.ats_domain || 'generic'})`);
  console.log(`📄 Resume:    ${savedRecord.extracted_data?.resume_uploaded || 'None'}`);
  console.log(`💰 Salary:    $${savedRecord.extracted_data?.salary_expected || '0'}`);
  console.log(`🚦 Status:    ${savedRecord.validation_status === 'PASSED' ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31m' + savedRecord.validation_status + '\x1b[0m'}`);
  if (savedRecord.validation_errors && savedRecord.validation_errors.length > 0) {
    console.log(`⚠️ Errors (${savedRecord.validation_errors.length}):`, savedRecord.validation_errors.map(e => e.message).join(' | '));
  }
  console.log('======================================================\n');

  // Broadcast to live SSE stream
  broadcastSSE('NEW_SUBMISSION', savedRecord);

  res.status(201).json({
    success: true,
    message: 'Submission successfully logged to backend',
    recordId: savedRecord.id,
    record: savedRecord
  });
});

// 3. Get All Submissions (with query filters)
app.get('/api/submissions', (req, res) => {
  let list = db.getSubmissions();
  const { candidate_id, status, query, limit } = req.query;

  if (candidate_id) {
    list = list.filter(s => s.candidate_id === candidate_id);
  }
  if (status) {
    list = list.filter(s => s.validation_status === status);
  }
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(s => {
      const data = s.extracted_data || {};
      return (
        (s.profile_assigned || '').toLowerCase().includes(q) ||
        (data.job_title || '').toLowerCase().includes(q) ||
        (data.company || '').toLowerCase().includes(q)
      );
    });
  }

  if (limit) {
    list = list.slice(0, parseInt(limit, 10));
  }

  res.json({
    success: true,
    count: list.length,
    submissions: list
  });
});

// 4. Get Single Submission Record
app.get('/api/submissions/:id', (req, res) => {
  const record = db.getSubmissionById(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, error: 'Submission not found' });
  }
  res.json({ success: true, submission: record });
});

// 5. Clear All Submissions
app.delete('/api/submissions', (req, res) => {
  db.clearSubmissions();
  broadcastSSE('SUBMISSIONS_CLEARED', {});
  res.json({ success: true, message: 'All submissions cleared' });
});

// 6. Candidates CRUD
app.get('/api/candidates', (req, res) => {
  res.json({ success: true, candidates: db.getCandidates() });
});

app.post('/api/candidates', (req, res) => {
  const candidate = req.body;
  if (!candidate.fullName || !candidate.primaryEmail) {
    return res.status(400).json({ success: false, error: 'fullName and primaryEmail are required' });
  }
  const saved = db.saveCandidate(candidate);
  broadcastSSE('CANDIDATES_UPDATED', saved);
  res.status(201).json({ success: true, candidate: saved });
});

app.delete('/api/candidates/:id', (req, res) => {
  db.deleteCandidate(req.params.id);
  broadcastSSE('CANDIDATES_UPDATED', {});
  res.json({ success: true, message: 'Candidate deleted' });
});

// 7. System Metrics
app.get('/api/metrics', (req, res) => {
  res.json({ success: true, metrics: db.getMetrics() });
});

// Start Server with Auto-Port Fallback
function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    console.log('\n======================================================');
    console.log('🚀 SUBMISSION QUALITY CHECKER - BACKEND READY');
    console.log(`🌐 Server Running At:    http://localhost:${portToTry}`);
    console.log(`📡 Webhook Endpoint:     http://localhost:${portToTry}/api/submissions/log`);
    console.log(`📊 Live Web Dashboard:   http://localhost:${portToTry}/`);
    console.log(`⚡ Live Event Stream:    http://localhost:${portToTry}/api/stream`);
    console.log('======================================================\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${portToTry} is already in use. Retrying on port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error("Server error:", err);
    }
  });
}

const DEFAULT_PORT = parseInt(process.env.PORT || 3001, 10);
startServer(DEFAULT_PORT);

