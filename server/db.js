/**
 * Persistent Data Store for Local Backend
 * Stores submissions, candidates, and live typing events in local JSON store
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');
const CANDIDATES_FILE = path.join(DATA_DIR, 'candidates.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_CANDIDATES = [
  {
    id: "candidate-1",
    fullName: "Adams Myers",
    firstName: "Adams",
    lastName: "Myers",
    primaryEmail: "adams.myers@techcraft.dev",
    emailAliases: ["adams.myers@techcraft.dev", "adamsmyers.work@gmail.com", "adams@myersdev.io"],
    phone: "+1 (555) 234-8901",
    salaryFloor: 120000,
    preferredCurrency: "USD",
    targetStack: "Full Stack C# / .NET",
    primaryStackKeywords: [".net", "c#", "csharp", "dotnet", "asp.net", "azure", "sql server"],
    workAuthStatus: "US Citizen",
    requiresSponsorship: "No"
  },
  {
    id: "candidate-2",
    fullName: "Andre Brown",
    firstName: "Andre",
    lastName: "Brown",
    primaryEmail: "andre.brown@cloudcore.dev",
    emailAliases: ["andre.brown@cloudcore.dev", "andrebrown.eng@gmail.com"],
    phone: "+1 (555) 456-7890",
    salaryFloor: 135000,
    preferredCurrency: "USD",
    targetStack: "Python / AI / Backend",
    primaryStackKeywords: ["python", "django", "fastapi", "aws", "postgresql", "ai"],
    workAuthStatus: "Green Card",
    requiresSponsorship: "No"
  }
];

function readJsonFile(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return defaultValue;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
    return false;
  }
}

// Initial setup
if (!fs.existsSync(CANDIDATES_FILE)) {
  writeJsonFile(CANDIDATES_FILE, DEFAULT_CANDIDATES);
}
if (!fs.existsSync(SUBMISSIONS_FILE)) {
  writeJsonFile(SUBMISSIONS_FILE, []);
}

const db = {
  // Submissions
  getSubmissions() {
    return readJsonFile(SUBMISSIONS_FILE, []);
  },

  getSubmissionById(id) {
    const list = this.getSubmissions();
    return list.find(s => s.id === id) || null;
  },

  saveSubmission(record) {
    const list = this.getSubmissions();
    const id = record.id || `sub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const newRecord = {
      id,
      timestamp: new Date().toISOString(),
      ...record
    };
    list.unshift(newRecord);
    // Keep last 1000 records
    const trimmed = list.slice(0, 1000);
    writeJsonFile(SUBMISSIONS_FILE, trimmed);
    return newRecord;
  },

  clearSubmissions() {
    writeJsonFile(SUBMISSIONS_FILE, []);
    return true;
  },

  findDuplicateSubmission({ candidate_id, job_url, req_id, company, job_title }) {
    const list = this.getSubmissions();
    const cleanUrl = job_url ? job_url.split('?')[0].split('#')[0].toLowerCase().trim() : '';
    const cleanComp = company ? company.toLowerCase().trim() : '';
    const cleanTitle = job_title ? job_title.toLowerCase().trim() : '';
    const cleanReq = req_id ? String(req_id).toLowerCase().trim() : '';

    return list.find(s => {
      const sExt = s.extracted_data || {};
      const sCandId = s.candidate_id;
      const sUrl = sExt.job_url ? sExt.job_url.split('?')[0].split('#')[0].toLowerCase().trim() : '';
      const sComp = (sExt.company || '').toLowerCase().trim();
      const sTitle = (sExt.job_title || '').toLowerCase().trim();
      const sReq = String(sExt.req_id || '').toLowerCase().trim();

      // Check candidate match if provided
      const candidateMatch = !candidate_id || sCandId === candidate_id;
      if (!candidateMatch) return false;

      // Match 1: Exact or same job URL
      if (cleanUrl && sUrl && (cleanUrl === sUrl || cleanUrl.includes(sUrl) || sUrl.includes(cleanUrl))) {
        return true;
      }
      // Match 2: Same Requisition ID + Same Company
      if (cleanReq && sReq && cleanReq === sReq && cleanComp && sComp && (cleanComp.includes(sComp) || sComp.includes(cleanComp))) {
        return true;
      }
      // Match 3: Same Company + Same Job Title
      if (cleanComp && sComp && cleanTitle && sTitle && cleanComp === sComp && cleanTitle === sTitle) {
        return true;
      }

      return false;
    }) || null;
  },

  // Candidates
  getCandidates() {
    return readJsonFile(CANDIDATES_FILE, DEFAULT_CANDIDATES);
  },

  saveCandidate(candidate) {
    const list = this.getCandidates();
    const idx = list.findIndex(c => c.id === candidate.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...candidate };
    } else {
      list.push(candidate);
    }
    writeJsonFile(CANDIDATES_FILE, list);
    return candidate;
  },

  deleteCandidate(id) {
    const list = this.getCandidates().filter(c => c.id !== id);
    writeJsonFile(CANDIDATES_FILE, list);
    return true;
  },

  // Stats & Metrics
  getMetrics() {
    const list = this.getSubmissions();
    const total = list.length;
    const passed = list.filter(s => s.validation_status === 'PASSED').length;
    const blocked = list.filter(s => (s.validation_status || '').includes('BLOCK') || (s.validation_status || '').includes('FAIL')).length;
    const overridden = list.filter(s => (s.validation_status || '').includes('OVERRIDDEN')).length;
    const flagged = list.filter(s => (s.validation_status || '').includes('FLAGGED')).length;

    // Failure reason breakdown
    const failureCategories = {};
    list.forEach(s => {
      (s.validation_errors || []).forEach(err => {
        const rule = err.rule || 'UNKNOWN';
        failureCategories[rule] = (failureCategories[rule] || 0) + 1;
      });
    });

    return {
      total,
      passed,
      blocked,
      overridden,
      flagged,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 100,
      failureCategories
    };
  }
};

module.exports = db;
