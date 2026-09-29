/**
 * Submission Quality Checker - Background Service Worker
 * Manages candidate profiles, submission audit logs, duplicate checks, and live webhook dispatching.
 */

// Default Initial Profiles
const DEFAULT_PROFILES = [
  {
    id: "candidate-1",
    fullName: "Carlton Johnson",
    legalName: "Carlton Johnson",
    firstName: "Carlton",
    lastName: "Johnson",
    preferredName: "Carlton Johnson",
    primaryEmail: "carlton.johnson.dev@gmail.com",
    emailAliases: [
      "carlton.johnson.dev@gmail.com",
      "carlton.j@techcraft.dev",
      "carlton.johnson@workmail.io"
    ],
    phone: "7276010870",
    formattedPhone: "(727) 601 0870",
    address: "32520 Midsummer Night Ln",
    city: "Wesley Chapel",
    state: "Florida",
    zip: "33543",
    country: "United States",
    linkedin: "linkedin.com/in/carl-j-108bb127/",
    smsOrWhatsApp: "No",

    workAuth: {
      authorizedInUS: "Yes",
      workAuthType: "US Citizen",
      requiresSponsorship: "No",
      expirationDate: "N/A"
    },

    eligibility: {
      age18OrOlder: "Yes",
      meetMinimumQualifications: "Yes",
      performEssentialFunctions: "Yes"
    },

    location: {
      resideState: "Florida",
      country: "United States",
      willingToRelocate: "No",
      onsiteTwoDaysWeek: "Yes",
      hybridCompliance: "Yes",
      occasionalTravel: "Yes",
      onsiteFinalInterview: "Yes",
      performOvertime: "Yes"
    },

    compensation: {
      salaryFloor: 120000,
      desiredSalary: 130000,
      noticePeriod: "2 weeks",
      availabilityStart: "Immediate",
      employmentContract: "Full-time W2",
      yearsExperience: "9+ years",
      preferredCurrency: "USD"
    },

    formerEmployment: {
      workedForCompanyBefore: "No",
      previousEmployee: "No",
      currentEmployee: "No",
      affiliatedCompany: "No"
    },

    referralsAndConflicts: {
      referredByEmployee: "No",
      employeeName: "N/A",
      relativesAtCompany: "No",
      inRelationshipWithEmployee: "No",
      conflictsOfInterest: "No"
    },

    restrictiveAgreements: {
      restrictiveCovenant: "No",
      nonCompeteOrNDA: "No",
      nonSolicitation: "No",
      confidentialityObligations: "No"
    },

    backgroundAndEducation: {
      terminatedOrSuspended: "No",
      terminatedForMisconduct: "No",
      governmentEmployee: "No",
      finraRegistered: "No",
      education: "Bachelor's Degree (B.S.) in Computer Science – Texas Tech University",
      degreeLevel: "Bachelor's degree",
      schoolsAttended: "Texas Tech University"
    },

    eeoc: {
      disability: "No",
      raceEthnicity: "Two or More Races",
      hispanicLatino: "No",
      veteranStatus: "I AM NOT A PROTECTED VETERAN",
      identifyAsMilitaryVeteran: "No"
    },

    howHeard: {
      howHeard: "Job platform",
      referred: "No"
    },

    credentials: {
      securityClearance: "No",
      validDriverLicense: "Yes",
      professionalLicenses: "No",
      languagesOtherThanEnglish: "No"
    },

    technicalExperience: {
      softwareEngineeringYears: "9+ years",
      csharpExperienceYears: "5+ years",
      fullStackExperience: "Yes",
      saasFullStackExperience: "Yes",
      remoteExperience: "Yes",
      builtFromGroundUp: "Yes",
      codeReviewsAndDesign: "Yes"
    },

    languagesFrameworks: {
      comfortableLanguages: "C# and the .NET ecosystem",
      preferredBackend: "C# with .NET",
      preferredFrontend: "React, Angular",
      preferredDatabase: "SQL Server (including Azure SQL)",
      dotNetFivePlusYears: "Yes",
      dotNetEightPlusYears: "Yes",
      mvcFivePlusYears: "Yes",
      oopDesignPatternsFivePlusYears: "Yes"
    },

    architectureScalability: {
      complexProjectsLeadingEightPlusYears: "Yes",
      enterpriseAppsFivePlusYears: "Yes",
      apiGatewaysAzureAPIM: "Yes",
      corporateETLPipelines: "Yes",
      scaledSystemDescription: "At Microsoft, architected modular .NET 8 microservices and ASP.NET Core APIs on Azure using DDD, CQRS, and Azure Service Bus."
    },

    testingTools: {
      testingToolsList: "xUnit, NUnit, MSTest, Moq, Jest, Playwright",
      workflowToolsList: "Technical design reviews, Architecture discussions, DDD, CQRS"
    },

    industryExperience: {
      saasExperience: "No",
      wmsExperience: "No",
      wcsExperience: "No",
      logisticsDistribution: "No"
    },

    salaryFloor: 120000,
    desiredSalary: 130000,
    workAuthStatus: "US Citizen",
    requiresSponsorship: "No",
    targetStack: "Full Stack C# / .NET / Cloud",
    primaryStackKeywords: [".net", "c#", "csharp", "dotnet", "asp.net", "azure", "sql server", "cloud"]
  },
  {
    "id": "candidate-2",
    "fullName": "Nicholas Adam Myers",
    "legalName": "Nicholas Adam Myers",
    "legalFirstName": "Nicholas",
    "legalMiddleName": "Adam",
    "legalLastName": "Myers",
    "preferredName": "Adam Myers",
    "firstName": "Nicholas",
    "lastName": "Myers",
    "nameAliases": [
      "Nicholas Adam Myers",
      "Nicholas Adams Myers",
      "Nicholas Myers",
      "Adam Myers",
      "Adams Myers",
      "Adams",
      "Adam",
      "Nicholas A. Myers"
    ],
    "primaryEmail": "adam.r.myers02@gmail.com",
    "emailAliases": [
      "adam.r.myers02@gmail.com",
      "adams.myers@techcraft.dev",
      "adamsmyers.work@gmail.com",
      "nicholas.myers@techcraft.dev"
    ],
    "phone": "6452417687",
    "formattedPhone": "(645) 241-7687",
    "address": "3780 Northwest 22nd Avenue",
    "city": "Miami",
    "state": "Florida",
    "zip": "33142",
    "country": "United States",
    "dob": "08/18/1988",
    "graduationDate": "5/18/2011",
    "linkedin": "linkedin.com/in/adam-myers-6ab405428",
    "smsOrWhatsApp": "No",

    "workAuth": {
      "authorizedInUS": "Yes",
      "workAuthType": "US Citizen",
      "requiresSponsorship": "No",
      "expirationDate": "N/A"
    },

    "eligibility": {
      "age18OrOlder": "Yes",
      "meetMinimumQualifications": "Yes",
      "performEssentialFunctions": "Yes"
    },

    "location": {
      "resideState": "Florida",
      "country": "United States",
      "willingToRelocate": "No",
      "onsiteTwoDaysWeek": "Yes",
      "hybridCompliance": "Yes",
      "occasionalTravel": "Yes",
      "onsiteFinalInterview": "Yes",
      "performOvertime": "Yes"
    },

    "compensation": {
      "salaryFloor": 120000,
      "desiredSalary": 125000,
      "noticePeriod": "2 weeks",
      "availabilityStart": "Immediate",
      "employmentContract": "Full-time W2",
      "yearsExperience": "8+ years",
      "preferredCurrency": "USD"
    },

    "formerEmployment": {
      "workedForCompanyBefore": "No",
      "previousEmployee": "No",
      "currentEmployee": "No",
      "affiliatedCompany": "No"
    },

    "referralsAndConflicts": {
      "referredByEmployee": "No",
      "employeeName": "N/A",
      "relativesAtCompany": "No",
      "inRelationshipWithEmployee": "No",
      "conflictsOfInterest": "No"
    },

    "restrictiveAgreements": {
      "restrictiveCovenant": "No",
      "nonCompeteOrNDA": "No",
      "nonSolicitation": "No",
      "confidentialityObligations": "No"
    },

    "backgroundAndEducation": {
      "terminatedOrSuspended": "No",
      "terminatedForMisconduct": "No",
      "governmentEmployee": "No",
      "finraRegistered": "No",
      "education": "Bachelor of Science in Computer Science – University of Notre Dame",
      "degreeLevel": "Bachelor's degree",
      "schoolsAttended": "University of Notre Dame"
    },

    "eeoc": {
      "disability": "No",
      "raceEthnicity": "Two or More Races",
      "hispanicLatino": "No",
      "veteranStatus": "I AM NOT A PROTECTED VETERAN",
      "identifyAsMilitaryVeteran": "No"
    },

    "howHeard": {
      "howHeard": "Job platform",
      "referred": "No"
    },

    "credentials": {
      "securityClearance": "No",
      "validDriverLicense": "Yes",
      "professionalLicenses": "No",
      "languagesOtherThanEnglish": "No"
    },

    "targetStack": "Full Stack Python / AI / Cloud",
    "primaryStackKeywords": ["python", "django", "fastapi", "aws", "postgresql", "react", "ai", "machine learning"],

    "technicalExperience": {
      "softwareEngineeringYears": "8+ years",
      "fullStackExperience": "Yes",
      "saasFullStackExperience": "Yes",
      "remoteExperience": "Yes",
      "builtFromGroundUp": "Yes",
      "codeReviewsAndDesign": "Yes",
      "skillYears": {
        "python": "6+ years",
        "django": "5+ years",
        "fastapi": "4+ years",
        "react": "4+ years",
        "postgresql": "6+ years",
        "aws": "5+ years"
      }
    },

    "languagesFrameworks": {
      "comfortableLanguages": "Python and modern web frameworks",
      "preferredBackend": "Python with FastAPI and Django",
      "preferredFrontend": "React, TypeScript",
      "preferredDatabase": "PostgreSQL (including AWS RDS)",
      "skills": ["Python", "FastAPI", "Django", "React", "TypeScript", "PostgreSQL", "AWS", "Docker", "Redis"]
    },

    "architectureScalability": {
      "complexProjectsLeadingEightPlusYears": "Yes",
      "enterpriseAppsFivePlusYears": "Yes",
      "apiGatewaysAzureAPIM": "Yes",
      "corporateETLPipelines": "Yes",
      "scaledSystemDescription": "Architected distributed asynchronous Python services with FastAPI, Celery, and PostgreSQL on AWS."
    },

    "testingTools": {
      "testingToolsList": "PyTest, Unittest, Mock, Playwright, Cypress",
      "workflowToolsList": "Technical design reviews, DDD, Microservices design"
    },

    "industryExperience": {
      "saasExperience": "No",
      "wmsExperience": "No",
      "wcsExperience": "No",
      "logisticsDistribution": "No"
    },

    "salaryFloor": 120000,
    "desiredSalary": 125000,
    "workAuthStatus": "US Citizen",
    "requiresSponsorship": "No"
  },
  {
    "id": "candidate-3",
    "fullName": "Marcus Vance",
    "legalName": "Marcus Ethan Vance",
    "firstName": "Marcus",
    "lastName": "Vance",
    "preferredName": "Marcus Vance",
    "primaryEmail": "marcus.vance.dev@gmail.com",
    "emailAliases": [
      "marcus.vance.dev@gmail.com",
      "marcus.v@cloudcore.dev"
    ],
    "phone": "5128901234",
    "formattedPhone": "(512) 890-1234",
    "address": "742 Evergreen Terrace",
    "city": "Austin",
    "state": "Texas",
    "zip": "78704",
    "country": "United States",
    "linkedin": "linkedin.com/in/marcus-vance-dev",
    "smsOrWhatsApp": "No",

    "workAuth": {
      "authorizedInUS": "Yes",
      "workAuthType": "US Citizen",
      "requiresSponsorship": "No",
      "expirationDate": "N/A"
    },

    "eligibility": {
      "age18OrOlder": "Yes",
      "meetMinimumQualifications": "Yes",
      "performEssentialFunctions": "Yes"
    },

    "location": {
      "resideState": "Texas",
      "country": "United States",
      "willingToRelocate": "No",
      "onsiteTwoDaysWeek": "Yes",
      "hybridCompliance": "Yes",
      "occasionalTravel": "Yes",
      "onsiteFinalInterview": "Yes",
      "performOvertime": "Yes"
    },

    "compensation": {
      "salaryFloor": 115000,
      "desiredSalary": 125000,
      "noticePeriod": "2 weeks",
      "availabilityStart": "Immediate",
      "employmentContract": "Full-time W2",
      "yearsExperience": "8+ years",
      "preferredCurrency": "USD"
    },

    "formerEmployment": {
      "workedForCompanyBefore": "No",
      "previousEmployee": "No",
      "currentEmployee": "No",
      "affiliatedCompany": "No"
    },

    "referralsAndConflicts": {
      "referredByEmployee": "No",
      "employeeName": "N/A",
      "relativesAtCompany": "No",
      "inRelationshipWithEmployee": "No",
      "conflictsOfInterest": "No"
    },

    "restrictiveAgreements": {
      "restrictiveCovenant": "No",
      "nonCompeteOrNDA": "No",
      "nonSolicitation": "No",
      "confidentialityObligations": "No"
    },

    "backgroundAndEducation": {
      "terminatedOrSuspended": "No",
      "terminatedForMisconduct": "No",
      "governmentEmployee": "No",
      "finraRegistered": "No",
      "education": "Bachelor's Degree in Software Engineering – University of Texas",
      "degreeLevel": "Bachelor's degree",
      "schoolsAttended": "University of Texas at Austin"
    },

    "eeoc": {
      "disability": "No",
      "raceEthnicity": "Two or More Races",
      "hispanicLatino": "No",
      "veteranStatus": "I AM NOT A PROTECTED VETERAN",
      "identifyAsMilitaryVeteran": "No"
    },

    "howHeard": {
      "howHeard": "Job platform",
      "referred": "No"
    },

    "credentials": {
      "securityClearance": "No",
      "validDriverLicense": "Yes",
      "professionalLicenses": "No",
      "languagesOtherThanEnglish": "No"
    },

    "targetStack": "Full Stack PHP / Laravel / Vue",
    "primaryStackKeywords": ["php", "laravel", "vue", "vue.js", "mysql", "redis", "docker", "gcp"],

    "technicalExperience": {
      "softwareEngineeringYears": "8+ years",
      "fullStackExperience": "Yes",
      "saasFullStackExperience": "Yes",
      "remoteExperience": "Yes",
      "builtFromGroundUp": "Yes",
      "codeReviewsAndDesign": "Yes",
      "skillYears": {
        "php": "7+ years",
        "laravel": "6+ years",
        "vue": "4+ years",
        "mysql": "7+ years",
        "docker": "4+ years"
      }
    },

    "languagesFrameworks": {
      "comfortableLanguages": "PHP and modern JavaScript/Vue",
      "preferredBackend": "PHP with Laravel",
      "preferredFrontend": "Vue.js, Tailwind CSS",
      "preferredDatabase": "MySQL (including AWS Aurora / GCP Cloud SQL)",
      "skills": ["PHP", "Laravel", "Vue.js", "MySQL", "Redis", "Docker", "REST APIs", "MVC"]
    },

    "architectureScalability": {
      "complexProjectsLeadingEightPlusYears": "Yes",
      "enterpriseAppsFivePlusYears": "Yes",
      "apiGatewaysAzureAPIM": "Yes",
      "corporateETLPipelines": "Yes",
      "scaledSystemDescription": "Architected high-throughput Laravel microservices handling queue workers, caching layers, and decoupled API endpoints."
    },

    "testingTools": {
      "testingToolsList": "PHPUnit, Pest, Mockery, Playwright",
      "workflowToolsList": "Technical design reviews, Architecture discussions"
    },

    "industryExperience": {
      "saasExperience": "No",
      "wmsExperience": "No",
      "wcsExperience": "No",
      "logisticsDistribution": "No"
    },

    "salaryFloor": 115000,
    "desiredSalary": 125000,
    "workAuthStatus": "US Citizen",
    "requiresSponsorship": "No"
  }
];

// Default Multi-Webhook Configuration
const DEFAULT_WEBHOOKS = [
  {
    id: "wh_primary",
    name: "Primary Backend Webhook",
    url: "http://localhost:3001/api/submissions/log",
    apiKey: "",
    isActive: true,
    sendLiveEvents: true
  },
  {
    id: "wh_applyflow",
    name: "Apply-Flow Dashboard & Webhook",
    url: "http://localhost:5000/api/submissions/webhook",
    apiKey: "",
    isActive: true,
    sendLiveEvents: false
  }
];

// Default Settings
const DEFAULT_SETTINGS = {
  applierId: "Applier-Primary",
  activeProfileId: "candidate-1",
  activeStackKey: "dotnet", // Active Tech Stack track assigned to this applier/user (e.g. dotnet, python, php, auto)
  isProfileLocked: true, // Candidate profile is locked to the applier by default
  adminPasskey: "1234567890", // Admin master passkey required to unlock or switch profiles
  interceptionMode: "active", // "active" (hard block) or "audit" (shadow passive logging)
  allowOverride: true, // Allow applier to bypass block after warning confirmation
  minScreeningLength: 15, // Min character length for open text technical prompts
  backendWebhookUrl: "http://localhost:3001/api/submissions/log", // Configurable webhook endpoint
  backendApiKey: "",
  webhooks: DEFAULT_WEBHOOKS,
  mockBackendSuccess: true, // If backend is not running yet, gracefully simulate success & log locally
  streamLiveEvents: true, // Stream live typing & form interactions
  autoDuplicateWindowDays: 14,
  autoDetectJobContext: true,
  autoAutofillOnPageLoad: true, // Automatically pre-fill form fields on page load ("Automate Everything Else")
  detectCaptchaAndAlert: true, // Highlight CAPTCHAs & notify applier to complete human checks manually
  autoFillDemographics: true, // Auto-populate EEOC surveys (gender, race, veteran, disability)
  autoFillCompensation: true, // Auto-populate salary floor / target
  autoFillCustomQuestions: true // Auto-populate dynamic custom screening Q&A
};

// Initialize Storage on install / update
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Submission Checker] Extension installed/updated.");
  
  const existing = await chrome.storage.local.get(["profiles", "settings", "submissionsHistory", "duplicateCache"]);
  
  // Only set default profiles if no profiles exist in storage
  if (!existing.profiles || existing.profiles.length === 0) {
    await chrome.storage.local.set({ profiles: DEFAULT_PROFILES });
  }
  
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  } else {
    const mergedSettings = { ...DEFAULT_SETTINGS, ...existing.settings };
    if (!mergedSettings.webhooks || mergedSettings.webhooks.length === 0) {
      mergedSettings.webhooks = DEFAULT_WEBHOOKS;
    }
    await chrome.storage.local.set({ settings: mergedSettings });
  }

  if (!existing.submissionsHistory) {
    await chrome.storage.local.set({ submissionsHistory: [] });
  }

  if (!existing.duplicateCache) {
    await chrome.storage.local.set({ duplicateCache: {} });
  }
});

// In-Memory Tab-Isolated Sessions Map (tabId -> SessionData)
const tabApplyFlowSessions = new Map();

// Clean up tab tracking when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabApplyFlowSessions.delete(tabId);
});

// Message Bus Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case "GET_CONFIG": {
        const data = await chrome.storage.local.get(["profiles", "settings", "latestApplyFlowSession"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        if (!settings.webhooks || settings.webhooks.length === 0) {
          settings.webhooks = DEFAULT_WEBHOOKS;
        }
        const profiles = data.profiles || [];
        const activeProfile = profiles.find(p => p.id === settings.activeProfileId) || profiles[0] || null;
        
        // Check active session for this tab or opener tab, fallback to latest global session
        let activeSession = null;
        const tabId = sender.tab?.id;
        const openerTabId = sender.tab?.openerTabId;

        if (tabId && tabApplyFlowSessions.has(tabId)) {
          activeSession = tabApplyFlowSessions.get(tabId);
        } else if (openerTabId && tabApplyFlowSessions.has(openerTabId)) {
          activeSession = tabApplyFlowSessions.get(openerTabId);
          if (tabId) tabApplyFlowSessions.set(tabId, activeSession);
        } else if (data.latestApplyFlowSession && (Date.now() - (data.latestApplyFlowSession.savedAt || 0) < 2 * 60 * 60 * 1000)) {
          // Within 2 hours
          activeSession = data.latestApplyFlowSession;
          if (tabId) tabApplyFlowSessions.set(tabId, activeSession);
        }

        return {
          success: true,
          profiles,
          settings,
          activeProfile,
          activeStackKey: settings.activeStackKey || activeProfile?.activeStackKey || 'dotnet',
          persistedSession: activeSession
        };
      }

      case "PERSIST_REDIRECT_TRACKING": {
        const { data: sessionData } = message;
        if (sessionData && (sessionData.jobId || sessionData.profileId)) {
          const sessionToSave = {
            ...sessionData,
            savedAt: Date.now()
          };
          const tabId = sender.tab?.id;
          if (tabId) {
            tabApplyFlowSessions.set(tabId, sessionToSave);
          }
          await chrome.storage.local.set({ latestApplyFlowSession: sessionToSave });
          return { success: true, session: sessionToSave };
        }
        return { success: false, error: "Invalid session tracking data" };
      }

      case "SAVE_PROFILE": {
        const { profile } = message;
        if (!profile || !profile.id) return { success: false, error: "Invalid profile data" };

        const data = await chrome.storage.local.get(["profiles", "settings"]);
        const profiles = data.profiles || [];
        const existingIdx = profiles.findIndex(p => p.id === profile.id);

        if (existingIdx >= 0) {
          // Deep merge with existing fields so nested objects and custom fields are preserved
          profiles[existingIdx] = {
            ...profiles[existingIdx],
            ...profile,
            workAuth: { ...(profiles[existingIdx].workAuth || {}), ...(profile.workAuth || {}) },
            compensation: { ...(profiles[existingIdx].compensation || {}), ...(profile.compensation || {}) },
            eeoc: { ...(profiles[existingIdx].eeoc || {}), ...(profile.eeoc || {}) },
            location: { ...(profiles[existingIdx].location || {}), ...(profile.location || {}) },
            technicalExperience: { ...(profiles[existingIdx].technicalExperience || {}), ...(profile.technicalExperience || {}) },
            customFields: profile.customFields || profiles[existingIdx].customFields || []
          };
        } else {
          profiles.push(profile);
        }

        await chrome.storage.local.set({ profiles });
        notifyTabsAboutStateChange();
        return { success: true, profiles, savedProfile: profiles[existingIdx >= 0 ? existingIdx : profiles.length - 1] };
      }

      case "DELETE_PROFILE": {
        const { profileId } = message;
        if (!profileId) return { success: false, error: "Missing profileId" };

        const data = await chrome.storage.local.get(["profiles", "settings"]);
        let profiles = data.profiles || [];
        profiles = profiles.filter(p => p.id !== profileId);

        const settings = data.settings || DEFAULT_SETTINGS;
        if (settings.activeProfileId === profileId && profiles.length > 0) {
          settings.activeProfileId = profiles[0].id;
        }

        await chrome.storage.local.set({ profiles, settings });
        notifyTabsAboutStateChange();
        return { success: true, profiles };
      }

      case "SAVE_SETTINGS": {
        const { settings: newSettings } = message;
        if (!newSettings) return { success: false, error: "Missing settings" };

        const data = await chrome.storage.local.get(["settings"]);
        const merged = { ...(data.settings || DEFAULT_SETTINGS), ...newSettings };
        await chrome.storage.local.set({ settings: merged });
        notifyTabsAboutStateChange();
        return { success: true, settings: merged };
      }

      case "SAVE_WEBHOOKS": {
        const { webhooks } = message;
        if (!Array.isArray(webhooks)) return { success: false, error: "Webhooks must be an array" };

        const data = await chrome.storage.local.get(["settings"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        settings.webhooks = webhooks;
        if (webhooks.length > 0 && webhooks[0].url) {
          settings.backendWebhookUrl = webhooks[0].url;
          settings.backendApiKey = webhooks[0].apiKey || "";
        }

        await chrome.storage.local.set({ settings });
        notifyTabsAboutStateChange();
        return { success: true, settings };
      }

      case "SET_ACTIVE_PROFILE": {
        const data = await chrome.storage.local.get(["settings", "profiles"]);
        const settings = data.settings || DEFAULT_SETTINGS;

        // If profile is locked, require valid admin token
        if (settings.isProfileLocked) {
          const expectedToken = settings.adminPasskey || "1234567890";
          if (!message.adminToken || message.adminToken.trim() !== expectedToken.trim()) {
            return {
              success: false,
              isLocked: true,
              error: "Candidate profile and stack track are locked to user. An Admin Token / Passkey is required to switch profile assignment."
            };
          }
        }

        if (message.profileId) settings.activeProfileId = message.profileId;
        if (message.activeStackKey) settings.activeStackKey = message.activeStackKey;
        await chrome.storage.local.set({ settings });
        
        notifyTabsAboutStateChange();
        return { success: true, settings };
      }

      case "ADMIN_UNLOCK_PROFILE": {
        const data = await chrome.storage.local.get(["settings", "profiles"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        const expectedToken = settings.adminPasskey || "1234567890";

        if (!message.adminToken || message.adminToken.trim() !== expectedToken.trim()) {
          return { success: false, error: "Invalid Admin Token / Passkey. Authorization rejected." };
        }

        if (message.profileId) {
          settings.activeProfileId = message.profileId;
        }
        if (message.activeStackKey) {
          settings.activeStackKey = message.activeStackKey;
        }
        if (typeof message.isProfileLocked === 'boolean') {
          settings.isProfileLocked = message.isProfileLocked;
        }

        await chrome.storage.local.set({ settings });
        notifyTabsAboutStateChange();
        return {
          success: true,
          message: "Profile and stack track reassigned successfully by Admin.",
          settings
        };
      }

      case "ADMIN_TOGGLE_LOCK": {
        const data = await chrome.storage.local.get(["settings"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        const expectedToken = settings.adminPasskey || "1234567890";

        if (!message.adminToken || message.adminToken.trim() !== expectedToken.trim()) {
          return { success: false, error: "Invalid Admin Token. Action rejected." };
        }

        settings.isProfileLocked = !settings.isProfileLocked;
        await chrome.storage.local.set({ settings });
        notifyTabsAboutStateChange();
        return { success: true, isProfileLocked: settings.isProfileLocked, settings };
      }

      case "SET_INTERCEPTION_MODE": {
        const data = await chrome.storage.local.get(["settings"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        settings.interceptionMode = message.mode; // 'active' or 'audit'
        await chrome.storage.local.set({ settings });
        notifyTabsAboutStateChange();
        return { success: true, settings };
      }

      case "CHECK_DUPLICATE": {
        const { candidateId, reqId, company, jobTitle } = message.payload;
        const { duplicateCache = {} } = await chrome.storage.local.get("duplicateCache");
        
        const candidateCache = duplicateCache[candidateId] || [];
        const now = Date.now();
        const windowMs = (message.windowDays || 14) * 24 * 60 * 60 * 1000;

        const matched = candidateCache.find(entry => {
          if (now - entry.timestamp > windowMs) return false;
          // Match by Req ID if present
          if (reqId && entry.reqId && entry.reqId.toLowerCase().trim() === reqId.toLowerCase().trim()) {
            return true;
          }
          // Match by Company + Job Title
          if (company && jobTitle && entry.company && entry.jobTitle) {
            const sameCompany = entry.company.toLowerCase().trim() === company.toLowerCase().trim();
            const sameJob = entry.jobTitle.toLowerCase().trim() === jobTitle.toLowerCase().trim();
            if (sameCompany && sameJob) return true;
          }
          return false;
        });

        return {
          isDuplicate: !!matched,
          duplicateRecord: matched || null
        };
      }

      case "LOG_SUBMISSION": {
        const record = message.payload;
        const timestamp = new Date().toISOString();
        const recordId = "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
        
        const enrichedRecord = {
          id: recordId,
          ...record,
          timestamp
        };

        // 1. Save to local submissions history
        const { submissionsHistory = [], duplicateCache = {}, settings = DEFAULT_SETTINGS } = await chrome.storage.local.get([
          "submissionsHistory",
          "duplicateCache",
          "settings"
        ]);

        const updatedHistory = [enrichedRecord, ...submissionsHistory.slice(0, 199)]; // Keep latest 200
        
        // Update duplicate cache if submitted successfully
        const candidateId = record.candidate_id || settings.activeProfileId;
        const candidateDuplicates = duplicateCache[candidateId] || [];
        candidateDuplicates.push({
          submissionId: recordId,
          reqId: record.extracted_data?.req_id || "",
          company: record.extracted_data?.company || "",
          jobTitle: record.extracted_data?.job_title || "",
          jobUrl: record.extracted_data?.job_url || "",
          timestamp: Date.now(),
          status: record.validation_status
        });
        duplicateCache[candidateId] = candidateDuplicates;

        await chrome.storage.local.set({
          submissionsHistory: updatedHistory,
          duplicateCache
        });

        // 2. Dispatch to remote backend webhook
        const webhookResult = await dispatchToBackend(enrichedRecord, settings);

        // 3. Show native notification if needed
        if (enrichedRecord.validation_status === "PASSED") {
          chrome.notifications?.create({
            type: "basic",
            iconUrl: "icons/icon48.png",
            title: "Submission Logged Successfully",
            message: `Applied for ${record.extracted_data?.job_title || 'Role'} at ${record.extracted_data?.company || 'Company'} for ${record.profile_assigned}`
          });
        }

        return {
          success: true,
          recordId,
          webhookResult
        };
      }

      case "DISPATCH_LIVE_FEEDBACK": {
        // Called when candidate is typing/pasting into form fields to stream live field snapshot
        const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
        const webhookUrl = settings.backendWebhookUrl || DEFAULT_SETTINGS.backendWebhookUrl;
        const streamEvents = settings.streamLiveEvents !== false;

        const payload = message.payload || {};
        const incomingData = payload.extracted_data || {};

        // If incoming data has no inputs filled, don't dispatch an empty update to overwrite real form data
        const hasValues = Boolean(
          incomingData.candidate_name ||
          incomingData.candidate_first_name ||
          incomingData.email_entered ||
          incomingData.phone_entered ||
          incomingData.salary_expected ||
          incomingData.resume_uploaded ||
          (incomingData.all_entries && incomingData.all_entries.some(e => Boolean(e.value)))
        );

        if (!hasValues) {
          return { success: true };
        }

        if (webhookUrl && streamEvents) {
          try {
            let liveEventUrl;
            try {
              const u = new URL(webhookUrl);
              liveEventUrl = `${u.origin}/api/submissions/live-event`;
            } catch (_) {
              liveEventUrl = webhookUrl.replace(/\/log$/, '') + '/live-event';
            }

            await fetch(liveEventUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
          } catch (e) {
            // Passive stream catch
          }
        }
        return { success: true };
      }

      case "CHECK_DUPLICATE_JOB": {
        const { candidateId, jobUrl, company, jobTitle, reqId } = message;
        const { duplicateCache = {}, settings = DEFAULT_SETTINGS } = await chrome.storage.local.get(["duplicateCache", "settings"]);

        // 1. Check local extension duplicate cache
        const localList = duplicateCache[candidateId] || [];
        const cleanUrl = jobUrl ? jobUrl.split('?')[0].split('#')[0].toLowerCase() : '';
        const cleanReq = reqId ? String(reqId).toLowerCase().trim() : '';

        const localMatch = localList.find(item => {
          const itemUrl = item.jobUrl ? item.jobUrl.split('?')[0].split('#')[0].toLowerCase() : '';
          const itemReq = item.reqId ? String(item.reqId).toLowerCase().trim() : '';
          if (cleanUrl && itemUrl && (cleanUrl === itemUrl || cleanUrl.includes(itemUrl) || itemUrl.includes(cleanUrl))) return true;
          if (cleanReq && itemReq && cleanReq === itemReq) return true;
          return false;
        });

        if (localMatch) {
          return {
            success: true,
            already_applied: true,
            existingRecord: localMatch
          };
        }

        // 2. Query remote backend server for duplicates
        const webhookUrl = settings.backendWebhookUrl || DEFAULT_SETTINGS.backendWebhookUrl;
        if (webhookUrl) {
          try {
            const u = new URL(webhookUrl);
            const checkUrl = new URL(`${u.origin}/api/submissions/check-duplicate`);
            if (candidateId) checkUrl.searchParams.set('candidate_id', candidateId);
            if (jobUrl) checkUrl.searchParams.set('job_url', jobUrl);
            if (company) checkUrl.searchParams.set('company', company);
            if (jobTitle) checkUrl.searchParams.set('job_title', jobTitle);
            if (reqId) checkUrl.searchParams.set('req_id', reqId);

            const res = await fetch(checkUrl.toString());
            if (res.ok) {
              const data = await res.json();
              if (data && data.already_applied) {
                return {
                  success: true,
                  already_applied: true,
                  existingRecord: data.existingRecord
                };
              }
            }
          } catch (_) {}
        }

        return {
          success: true,
          already_applied: false,
          existingRecord: null
        };
      }

      case "GET_HISTORY": {
        const { submissionsHistory = [] } = await chrome.storage.local.get("submissionsHistory");
        return { success: true, history: submissionsHistory };
      }

      case "CLEAR_HISTORY": {
        await chrome.storage.local.set({ submissionsHistory: [], duplicateCache: {} });
        return { success: true };
      }

      case "TEST_BACKEND_PING": {
        const { url, apiKey } = message;
        if (!url) return { success: false, error: "No URL provided" };
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          try {
            const res = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
              },
              body: JSON.stringify({ ping: true, timestamp: new Date().toISOString() }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok || res.status === 200 || res.status === 201 || res.status === 204) {
              return { success: true, status: res.status, statusText: `Online (HTTP ${res.status} ${res.statusText || 'OK'})` };
            }

            // If endpoint is reachable but returned 400/404/405, the host server is alive
            if (res.status === 400 || res.status === 404 || res.status === 405) {
              return { success: true, status: res.status, statusText: `Server Online (HTTP ${res.status})` };
            }

            return { success: false, status: res.status, error: `HTTP ${res.status}: ${res.statusText || 'Error'}` };
          } catch (postErr) {
            clearTimeout(timeoutId);
            // Fallback: Check if origin server or /api/health is up
            try {
              const origin = new URL(url).origin;
              const hRes = await fetch(`${origin}/api/health`, { method: "GET" });
              if (hRes.ok) {
                return { success: true, status: 200, statusText: `Online on ${origin} (/api/health)` };
              }
            } catch (_) {}

            try {
              const origin = new URL(url).origin;
              const rRes = await fetch(origin, { method: "GET" });
              if (rRes.ok || rRes.status < 500) {
                return { success: true, status: rRes.status, statusText: `Online on ${origin}` };
              }
            } catch (_) {}

            return { success: false, error: postErr.message || 'Endpoint unreachable' };
          }
        } catch (err) {
          return { success: false, error: err.message || 'Endpoint unreachable' };
        }
      }

      case "FETCH_APPLYFLOW_CONTEXT": {
        const { jobId, profileId } = message;
        if (!jobId && !profileId) return { success: false, error: "Missing jobId or profileId" };
        try {
          const url = new URL("http://localhost:5000/api/submissions/context");
          if (jobId) url.searchParams.set("job_id", jobId);
          if (profileId) url.searchParams.set("profile_id", profileId);

          const res = await fetch(url.toString(), { method: "GET" });
          if (res.ok) {
            const data = await res.json();
            return { success: true, data: data.data || data };
          }
          return { success: false, status: res.status };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }

      case "OPEN_OPTIONS": {
        chrome.runtime.openOptionsPage();
        return { success: true };
      }

      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  };

  handler()
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true; // Keep message channel open for async response
});

// Helper: Dispatches to all configured active webhook endpoints & Apply-Flow
async function dispatchToBackend(record, settings) {
  const webhooks = (settings.webhooks && settings.webhooks.length > 0)
    ? settings.webhooks.filter(w => w.isActive && w.url)
    : [];

  // Fallback to legacy URL if webhooks array is empty
  if (webhooks.length === 0 && settings.backendWebhookUrl) {
    webhooks.push({
      id: "wh_legacy",
      name: "Primary Webhook",
      url: settings.backendWebhookUrl,
      apiKey: settings.backendApiKey || "",
      isActive: true
    });
  }

  // Ensure Apply-Flow on port 5000 is included if not already present
  const applyFlowUrl = "http://localhost:5000/api/submissions/webhook";
  if (!webhooks.some(w => w.url === applyFlowUrl)) {
    webhooks.push({
      id: "wh_applyflow_auto",
      name: "Apply-Flow Auto Sync",
      url: applyFlowUrl,
      apiKey: "",
      isActive: true
    });
  }

  const results = await Promise.allSettled(webhooks.map(async (wh) => {
    try {
      const headers = { "Content-Type": "application/json" };
      if (wh.apiKey) {
        headers["Authorization"] = `Bearer ${wh.apiKey}`;
        headers["X-API-Key"] = wh.apiKey;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const response = await fetch(wh.url, {
        method: "POST",
        headers,
        body: JSON.stringify(record),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));
      return {
        id: wh.id,
        name: wh.name,
        url: wh.url,
        success: response.ok,
        status: response.status,
        data
      };
    } catch (error) {
      console.warn(`[Submission Checker] Webhook error for ${wh.name} (${wh.url}):`, error.message);
      return {
        id: wh.id,
        name: wh.name,
        url: wh.url,
        success: false,
        error: error.message
      };
    }
  }));

  const delivered = results.filter(r => r.status === 'fulfilled' && r.value.success);
  return {
    status: delivered.length > 0 ? "DELIVERED" : (settings.mockBackendSuccess ? "SIMULATED_LOCAL" : "FAILED"),
    totalWebhooks: webhooks.length,
    deliveredCount: delivered.length,
    details: results.map(r => r.value || { error: r.reason })
  };
}

function notifyTabsAboutStateChange() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATED" }).catch(() => {
          // Tab might not have content script injected
        });
      }
    });
  });
}
