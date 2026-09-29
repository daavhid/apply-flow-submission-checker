/**
 * Submission Quality Validator - Full 17-Category Profile Verification Engine
 * Validates entered job application form fields against the locked active candidate record.
 */

window.JobFormValidator = (function () {
  'use strict';

  const DIRTY_REGEX = /^([.\-_*#/\\!@$%^&+=]+|asdf|qwerty|nil|null|test|idk|same|blank|nothing|dummy)$/i;

  function getEffectiveStack(profile, activeStackKey = null, jobTitle = '') {
    if (!profile) return null;
    const stacks = profile.stacks || {};

    // 1. Explicit stack key (e.g. dotnet, python, php)
    if (activeStackKey && activeStackKey !== 'auto' && stacks[activeStackKey]) {
      return stacks[activeStackKey];
    }

    // 2. Auto-detect from job title if configured as 'auto' or unspecified
    if (jobTitle && typeof jobTitle === 'string') {
      const jLower = jobTitle.toLowerCase();
      for (const [key, stack] of Object.entries(stacks)) {
        const kws = stack.keywords || [];
        if (kws.some(kw => jLower.includes(kw))) {
          return stack;
        }
      }
    }

    // 3. Fallback to candidate's default active stack or first stack
    if (profile.activeStackKey && stacks[profile.activeStackKey]) {
      return stacks[profile.activeStackKey];
    }

    const firstKey = Object.keys(stacks)[0];
    if (firstKey && stacks[firstKey]) {
      return stacks[firstKey];
    }

    // Fallback to top-level fields
    return {
      stackTitle: profile.targetStack || 'General Software Engineering',
      keywords: profile.primaryStackKeywords || [],
      preferredBackend: profile.languagesFrameworks?.preferredBackend || '',
      preferredFrontend: profile.languagesFrameworks?.preferredFrontend || '',
      preferredDatabase: profile.languagesFrameworks?.preferredDatabase || '',
      comfortableLanguages: profile.languagesFrameworks?.comfortableLanguages || '',
      skillYears: profile.technicalExperience?.skillYears || {},
      scaledSystemDescription: profile.architectureScalability?.scaledSystemDescription || '',
      testingTools: profile.testingTools?.testingToolsList || ''
    };
  }

  function validate(data, activeProfile, settings = {}) {
    const errors = [];
    const warnings = [];
    const fieldErrorMap = new Map();

    // If the job is already applied on the ATS portal, mark as ALREADY_APPLIED and valid
    if (data && data.is_already_applied) {
      return {
        isValid: true,
        isAlreadyApplied: true,
        alreadyAppliedMessage: data.already_applied_message || "You've already applied for this job.",
        errorCount: 0,
        warningCount: 0,
        errors: [],
        warnings: [],
        fieldErrorMap: new Map()
      };
    }

    const profile = activeProfile || {
      fullName: "Carlton Johnson",
      legalName: "Carlton Johnson",
      firstName: "Carlton",
      lastName: "Johnson",
      primaryEmail: "carlton.johnson.dev@gmail.com",
      emailAliases: ["carlton.johnson.dev@gmail.com"],
      phone: "7276010870",
      formattedPhone: "(727) 601 0870",
      address: "32520 Midsummer Night Ln",
      city: "Wesley Chapel",
      state: "Florida",
      zip: "33543",
      country: "United States",
      linkedin: "linkedin.com/in/carl-j-108bb127/",
      salaryFloor: 120000,
      desiredSalary: 130000,
      targetStack: "Full Stack C# / .NET / Cloud"
    };

    const effectiveStack = getEffectiveStack(profile, settings.activeStackKey, data.job_title);
    const minScreeningLen = settings.minScreeningLength || 15;

    function addError(element, message, rule, isWarning = false) {
      if (isWarning) {
        warnings.push({ rule, message });
      } else {
        errors.push({ rule, message });
      }

      if (element) {
        if (!fieldErrorMap.has(element)) {
          fieldErrorMap.set(element, []);
        }
        fieldErrorMap.get(element).push({ message, isWarning });
      }
    }

    // =========================================================================
    // 1. IDENTITY, LEGAL NAME & PREFERRED NAME (Category 10)
    // =========================================================================
    const validFullNames = [
      profile.fullName,
      profile.legalName,
      profile.preferredName,
      profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : null,
      profile.legalFirstName && profile.legalLastName ? `${profile.legalFirstName} ${profile.legalLastName}` : null,
      profile.legalMiddleName && profile.legalLastName ? `${profile.legalMiddleName} ${profile.legalLastName}` : null,
      profile.preferredName && profile.lastName && !profile.preferredName.toLowerCase().includes(profile.lastName.toLowerCase()) ? `${profile.preferredName} ${profile.lastName}` : null,
      ...(profile.nameAliases || [])
    ].filter(Boolean).map(n => n.toLowerCase().trim());

    const validFirstNames = new Set([
      profile.firstName,
      profile.legalFirstName,
      profile.legalMiddleName,
      profile.preferredFirstName,
      profile.preferredName,
      (profile.legalName || '').split(' ')[0],
      (profile.legalName || '').split(' ')[1], // Middle name if present
      (profile.fullName || '').split(' ')[0],
      (profile.preferredName || '').split(' ')[0],
      ...(profile.nameAliases || []).map(n => n.split(' ')[0]),
      ...(profile.nameAliases || []).map(n => n.split(' ')[1]) // Middle tokens
    ].filter(Boolean).map(n => n.toLowerCase().trim()));

    const validLastNames = new Set([
      profile.lastName,
      profile.legalLastName,
      (profile.legalName || '').split(' ').pop(),
      (profile.fullName || '').split(' ').pop(),
      (profile.preferredName || '').split(' ').pop(),
      ...(profile.nameAliases || []).map(n => n.split(' ').pop())
    ].filter(Boolean).map(n => n.toLowerCase().trim()));

    const allNameTokens = new Set();
    validFullNames.forEach(fn => {
      fn.split(/\s+/).forEach(tok => {
        if (tok.length >= 2) allNameTokens.add(tok.toLowerCase());
      });
    });
    validFirstNames.forEach(fn => allNameTokens.add(fn));
    validLastNames.forEach(ln => allNameTokens.add(ln));

    // Full Name Check
    if (data.candidate_name) {
      const entered = data.candidate_name.toLowerCase().trim();
      const enteredTokens = entered.split(/\s+/).filter(t => t.length >= 2);

      const matchesFullName = validFullNames.some(vn => 
        vn === entered || vn.includes(entered) || entered.includes(vn)
      );

      const hasMatchingLast = Array.from(validLastNames).some(ln => entered.includes(ln));
      const hasMatchingFirst = Array.from(validFirstNames).some(fn => entered.includes(fn));
      const matchesTokenOverlap = (hasMatchingLast && hasMatchingFirst) || enteredTokens.filter(t => allNameTokens.has(t)).length >= 2;

      if (!matchesFullName && !matchesTokenOverlap) {
        addError(
          data._elements?.names?.full || data._elements?.names?.first || data._elements?.names?.last,
          `Identity Mismatch: Assigned to candidate "${profile.fullName}" (${profile.preferredName ? 'Preferred: ' + profile.preferredName : ''}), but entered "${data.candidate_name}".`,
          "IDENTITY_MISMATCH"
        );
      }
    }

    // First Name Check (Supports legal first name, legal middle name, preferred name, and aliases)
    if (data.candidate_first_name) {
      const first = data.candidate_first_name.toLowerCase().trim();
      const isFirstValid = Array.from(validFirstNames).some(v => 
        v === first || 
        v.includes(first) || 
        first.includes(v) ||
        (first.length >= 3 && (v.startsWith(first) || first.startsWith(v)))
      );

      if (!isFirstValid) {
        const allowedNames = Array.from(validFirstNames).map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(' / ');
        addError(
          data._elements?.names?.first,
          `First Name Mismatch: Entered "${data.candidate_first_name}", expected ${allowedNames}.`,
          "IDENTITY_MISMATCH"
        );
      }
    }

    // Last Name Check
    if (data.candidate_last_name) {
      const last = data.candidate_last_name.toLowerCase().trim();
      const isLastValid = Array.from(validLastNames).some(v => 
        v === last || v.includes(last) || last.includes(v)
      );

      if (!isLastValid) {
        addError(
          data._elements?.names?.last,
          `Last Name Mismatch: Entered "${data.candidate_last_name}", expected "${profile.lastName}".`,
          "IDENTITY_MISMATCH"
        );
      }
    }

    // Phone Number Check
    if (data.phone_entered && profile.phone) {
      const enteredDigits = data.phone_entered.replace(/\D/g, '');
      const profileDigits = String(profile.phone).replace(/\D/g, '');
      if (enteredDigits.length >= 7 && profileDigits.length >= 7 && enteredDigits !== profileDigits && !profileDigits.includes(enteredDigits) && !enteredDigits.includes(profileDigits)) {
        addError(data._elements?.phone, `Phone Mismatch: Entered "${data.phone_entered}", expected profile phone "${profile.formattedPhone || profile.phone}".`, "PHONE_MISMATCH");
      }
    }

    // Email Check
    if (data.email_entered) {
      const enteredEmail = data.email_entered.toLowerCase().trim();
      const aliases = (profile.emailAliases || [profile.primaryEmail]).map(e => e.toLowerCase().trim());
      const isExactAlias = aliases.some(alias => alias === enteredEmail || enteredEmail.endsWith('@' + alias.split('@')[1]));
      const containsCandidateTokens = Array.from(allNameTokens).some(tok => tok.length >= 3 && enteredEmail.includes(tok));

      if (!isExactAlias && !containsCandidateTokens) {
        addError(data._elements?.email, `Email Mismatch: "${data.email_entered}" does not belong to active profile "${profile.fullName}". Expected ${profile.primaryEmail}`, "EMAIL_MISMATCH");
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enteredEmail)) {
        addError(data._elements?.email, `Malformed email: "${data.email_entered}".`, "MALFORMED_EMAIL");
      } else if (enteredEmail.includes('@gmial.') || enteredEmail.includes('@gmai.') || enteredEmail.includes('@yaho.')) {
        addError(data._elements?.email, `Domain typo in email: "${data.email_entered}".`, "EMAIL_TYPO");
      }
    }

    // =========================================================================
    // 2. RESUME ATTACHMENT & STACK MATCH
    // =========================================================================
    if (!data.resume_uploaded || data.resume_uploaded === 'No file chosen') {
      if (data._elements?.resume) {
        addError(data._elements?.resume, "No resume attached! Candidate resume is required.", "MISSING_RESUME");
      }
    } else {
      const filename = data.resume_uploaded.toLowerCase();
      const isNameInResume = Array.from(allNameTokens).some(tok => tok.length >= 3 && filename.includes(tok));
      const isGenericResume = filename === 'pasted resume content' || 
                              filename.includes('resume attached') || 
                              filename.includes('resume uploaded') || 
                              filename.includes('uploaded file') || 
                              filename.includes('attachment') || 
                              filename.includes('success') || 
                              filename.includes('verified') ||
                              filename === 'success!' ||
                              filename === 'success';

      if (!isGenericResume && allNameTokens.size > 0 && !isNameInResume) {
        addError(data._elements?.resume, `Wrong Resume: "${data.resume_uploaded}" does not contain candidate name "${profile.fullName}" or "${profile.preferredName || ''}".`, "WRONG_RESUME_NAME");
      }

      // Dynamic Stack Check: Verify resume matches candidate's stack
      const candidateStackKeywords = (profile.primaryStackKeywords || []).map(k => k.toLowerCase());
      const isResumeGeneric = filename.includes('resume') || filename.includes('cv');
      
      const stackCategories = {
        dotnet: ['.net', 'c#', 'csharp', 'dotnet', 'asp.net'],
        python: ['python', 'django', 'fastapi', 'flask'],
        php: ['php', 'laravel', 'symfony', 'wordpress'],
        java: ['java', 'spring', 'springboot'],
        javascript: ['javascript', 'typescript', 'react', 'node', 'vue', 'angular']
      };

      // If candidate has declared stack, check for obvious mismatches in filename
      for (const [stackName, keywords] of Object.entries(stackCategories)) {
        const isCandidateStack = candidateStackKeywords.some(k => keywords.includes(k));
        const isResumeThisStack = keywords.some(k => filename.includes(k));

        if (!isCandidateStack && isResumeThisStack && !isResumeGeneric) {
          addError(data._elements?.resume, `Tech Stack Mismatch: Uploaded ${stackName.toUpperCase()} resume "${data.resume_uploaded}" for candidate assigned to "${profile.targetStack || 'another stack'}".`, "RESUME_STACK_MISMATCH");
        }
      }
    }

    // =========================================================================
    // 3. COMPREHENSIVE 17-CATEGORY SCREENING VERIFICATION ENGINE
    // =========================================================================
    const questions = data._elements?.questions || [];
    questions.forEach(q => {
      const qText = q.label || '';
      const qLower = qText.toLowerCase().trim();
      const aText = q.value || '';
      const aLower = aText.toLowerCase().trim();

      // Skip unanswered questions
      if (!aText || aLower === 'unanswered' || aLower === 'no file chosen' || aLower === 'no resume pasted') return;

      // 1. WORK AUTH & SPONSORSHIP (Category 1)
      if (/legally authorized to work|authorized to work in|permitted to work in/i.test(qLower)) {
        if (aLower === 'no' || aLower.includes('not authorized') || aLower === 'false') {
          addError(q.element, `Work Auth Mismatch: Answered "${aText}", but ${profile.fullName} is legally authorized to work in the US (Yes).`, "WORK_AUTH_MISMATCH");
        }
      }
      if (/work authorization type|work authorization status|immigration status|citizenship status|us citizen.*permanent resident/i.test(qLower)) {
        const expectedType = profile.workAuth?.workAuthType || profile.workAuthStatus || 'US Citizen';
        if (expectedType === 'US Citizen' && !aLower.includes('citizen') && !aLower.includes('us citizen')) {
          addError(q.element, `Work Auth Type Mismatch: Selected "${aText}", but candidate profile record is "${expectedType}".`, "PROFILE_RECORD_MISMATCH");
        }
      }
      if (/require.*sponsorship|need.*sponsorship|employment visa status.*h-1b/i.test(qLower)) {
        const requiresSpons = profile.workAuth?.requiresSponsorship || profile.requiresSponsorship || 'No';
        if (requiresSpons === 'No' && (aLower === 'yes' || aLower.includes('require sponsorship') || aLower === 'true')) {
          addError(q.element, `Sponsorship Error: Answered "Yes" to sponsorship, but ${profile.fullName} does NOT require visa sponsorship (expected "No").`, "WORK_AUTH_MISMATCH");
        }
      }

      // 2. AGE & BASIC ELIGIBILITY (Category 2)
      if (/at least 18|18 years of age|18 or older/i.test(qLower)) {
        if (aLower === 'no' || aLower === 'false') {
          addError(q.element, `Eligibility Error: Selected "No" on age 18+ verification.`, "ELIGIBILITY_MISMATCH");
        }
      }
      if (/meet.*minimum qualifications|meet.*requirements listed|essential functions/i.test(qLower)) {
        if (aLower === 'no' || aLower === 'false') {
          addError(q.element, `Eligibility Error: Selected "No" on job qualification/essential functions verification.`, "ELIGIBILITY_MISMATCH");
        }
      }

      // 3. LOCATION, REMOTE, HYBRID & TRAVEL (Category 3)
      if (profile.state && /(^|\s)state(\*|\s|:|$)/i.test(qLower) && !qLower.includes('statement') && !qLower.includes('status')) {
        if (aLower && !aLower.includes(profile.state.toLowerCase()) && !profile.state.toLowerCase().includes(aLower)) {
          addError(q.element, `State Mismatch: Selected "${aText}", candidate profile state is "${profile.state}".`, "LOCATION_MISMATCH");
        }
      }
      if (profile.city && /(^|\s)city(\*|\s|:|$)/i.test(qLower) && !qLower.includes('citizenship') && !qLower.includes('velocity')) {
        if (aLower && !aLower.includes(profile.city.toLowerCase()) && !profile.city.toLowerCase().includes(aLower)) {
          addError(q.element, `City Mismatch: Entered "${aText}", candidate profile city is "${profile.city}".`, "LOCATION_MISMATCH");
        }
      }
      if (profile.zip && /(^|\s)(zip|postal)(\*|\s|:|$)/i.test(qLower)) {
        if (aLower && !aLower.includes(profile.zip.toLowerCase()) && !profile.zip.toLowerCase().includes(aLower)) {
          addError(q.element, `Zip Mismatch: Entered "${aText}", candidate profile zip is "${profile.zip}".`, "LOCATION_MISMATCH");
        }
      }
      if (/willing to relocate/i.test(qLower)) {
        const expectedRelocate = profile.location?.willingToRelocate || 'No';
        if (expectedRelocate === 'No' && aLower === 'yes') {
          addError(q.element, `Relocation Mismatch: Selected "Yes", candidate record is "${expectedRelocate}".`, "LOCATION_MISMATCH", true);
        }
      }
      if (/work onsite.*two days|hybrid office requirements|occasional.*travel|final-stage onsite interview|perform overtime/i.test(qLower)) {
        if (aLower === 'no' || aLower === 'false') {
          addError(q.element, `Availability Mismatch: Answered "No" on travel/onsite/hybrid availability prompt.`, "AVAILABILITY_MISMATCH");
        }
      }

      // 5. CURRENT OR FORMER EMPLOYMENT WITH COMPANY (Category 5)
      if (/worked for this company before|previously been employed by this company|current employee|affiliated company|worked for accenture|conduent|xerox|inovalon|infor|baylor genetics/i.test(qLower)) {
        if (aLower === 'yes' || aLower.includes('currently employed')) {
          addError(q.element, `Employment Record Mismatch: Answered "Yes" to prior employment with company (expected "No").`, "PROFILE_RECORD_MISMATCH");
        }
      }

      // 6. REFERRALS, RELATIVES & CONFLICTS OF INTEREST (Category 6)
      if (/relatives.*employed by the company|relatives who currently work|relationship with anyone employed|conflicts? of interest|relatives.*infor|relatives.*koch/i.test(qLower)) {
        if (aLower === 'yes' || aLower.includes('aware of potential')) {
          addError(q.element, `Conflict Mismatch: Answered "Yes", but candidate profile has no relatives or conflicts at this company (expected "No").`, "PROFILE_RECORD_MISMATCH");
        }
      }

      // 7. RESTRICTIVE AGREEMENTS & NON-COMPETES (Category 7)
      if (/restrictive covenant|non-compete|non-solicitation|confidentiality obligations.*impact|agreement that could restrict/i.test(qLower)) {
        if (aLower === 'yes' || aLower.includes('subject to')) {
          addError(q.element, `Non-Compete Error: Answered "Yes" to restrictive agreements (candidate profile has none, expected "No").`, "PROFILE_RECORD_MISMATCH");
        }
      }

      // 8. BACKGROUND, CONDUCT & GOVERNMENT EMPLOYMENT (Category 8)
      if (/terminated or suspended|terminated for misconduct/i.test(qLower)) {
        if (aLower === 'yes' || aLower.includes('terminated')) {
          addError(q.element, `Background Mismatch: Answered "Yes" to termination for misconduct (expected "No").`, "PROFILE_RECORD_MISMATCH");
        }
      }
      if (/government employee|procurement official|registered with finra|foreign, federal, state.*government/i.test(qLower) && !qLower.includes('if you are')) {
        if (aLower === 'yes' || aLower.includes('current or former')) {
          addError(q.element, `Compliance Mismatch: Answered "Yes" to government/procurement/FINRA status (expected "No").`, "PROFILE_RECORD_MISMATCH");
        }
      }
      if (/highest.*education|schools attended/i.test(qLower)) {
        const expectedEd = profile.backgroundAndEducation?.education || profile.education || "Bachelor's";
        if (aLower.includes('high school') && !expectedEd.toLowerCase().includes('high school')) {
          addError(q.element, `Education Mismatch: Selected "${aText}", candidate profile holds "${expectedEd}".`, "PROFILE_RECORD_MISMATCH");
        }
      }

      // 9. EEOC & DEMOGRAPHICS (Category 9)
      if (/protected veteran|veteran status|military veteran/i.test(qLower)) {
        if (aLower.includes('i identify as one or more') || aLower === 'yes') {
          addError(q.element, `Veteran Status Mismatch: Selected protected veteran, candidate record is "I AM NOT A PROTECTED VETERAN".`, "PROFILE_RECORD_MISMATCH");
        }
      }

      // 10. SOCIAL / LINKEDIN (Category 10)
      if (profile.linkedin && /linkedin/i.test(qLower)) {
        const cleanEntered = aLower.replace(/https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
        const cleanExpected = profile.linkedin.toLowerCase().replace(/https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
        const pLast = (profile.lastName || '').toLowerCase();
        if (cleanEntered && !cleanEntered.includes(pLast) && !cleanEntered.includes(cleanExpected.split('/in/')[1] || 'none')) {
          addError(q.element, `LinkedIn Mismatch: Entered "${aText}", expected profile link "${profile.linkedin}".`, "PROFILE_RECORD_MISMATCH");
        }
      }

      // 12. SECURITY CLEARANCE & CREDENTIALS (Category 12)
      if (/security clearance/i.test(qLower)) {
        if (aLower === 'yes') {
          addError(q.element, `Clearance Mismatch: Answered "Yes" (candidate profile has no active clearance, expected "No").`, "PROFILE_RECORD_MISMATCH");
        }
      }
      if (/valid driver('s)? license/i.test(qLower)) {
        if (aLower === 'no' || aLower === 'false') {
          addError(q.element, `Credential Mismatch: Selected "No" on valid driver's license (expected "Yes").`, "PROFILE_RECORD_MISMATCH");
        }
      }
      if (/professional.*licenses|certifications/i.test(qLower)) {
        if (aLower === 'yes') {
          addError(q.element, `Credential Mismatch: Selected "Yes" (candidate record is "No").`, "PROFILE_RECORD_MISMATCH", true);
        }
      }
      if (/languages other than english/i.test(qLower)) {
        if (aLower === 'yes') {
          addError(q.element, `Language Record Mismatch: Selected "Yes" (candidate record is "No").`, "PROFILE_RECORD_MISMATCH", true);
        }
      }

      // 13-15. DYNAMIC TECHNICAL ENGINEERING & STACK MATCHING (Categories 13-15)
      // Dynamic Preferred Backend Language / Framework Check
      if (/preferred backend|primary backend language|backend language.*professional/i.test(qLower)) {
        const prefBackend = effectiveStack?.preferredBackend || profile.languagesFrameworks?.preferredBackend || '';
        if (prefBackend && aLower.length > 0) {
          const backendKeywords = prefBackend.toLowerCase().split(/[\s,/]+/).filter(w => w.length > 1 && w !== 'with' && w !== 'and');
          const matches = backendKeywords.some(kw => aLower.includes(kw));
          if (!matches) {
            addError(q.element, `Tech Stack Mismatch: Entered "${aText}", candidate preferred backend is "${prefBackend}".`, "EXPERIENCE_MISMATCH");
          }
        }
      }

      // Dynamic Preferred Frontend Framework Check
      if (/preferred frontend|primary frontend|frontend framework.*professional/i.test(qLower)) {
        const prefFrontend = effectiveStack?.preferredFrontend || profile.languagesFrameworks?.preferredFrontend || '';
        if (prefFrontend && aLower.length > 0) {
          const frontendKeywords = prefFrontend.toLowerCase().split(/[\s,/]+/).filter(w => w.length > 1 && w !== 'with' && w !== 'and');
          const matches = frontendKeywords.some(kw => aLower.includes(kw));
          if (!matches) {
            addError(q.element, `Tech Stack Mismatch: Entered "${aText}", candidate preferred frontend is "${prefFrontend}".`, "EXPERIENCE_MISMATCH");
          }
        }
      }

      // Dynamic Preferred Database Check
      if (/preferred database|primary database|database.*professional/i.test(qLower)) {
        const prefDb = effectiveStack?.preferredDatabase || profile.languagesFrameworks?.preferredDatabase || '';
        if (prefDb && aLower.length > 0) {
          const dbKeywords = prefDb.toLowerCase().split(/[\s,/()]+/).filter(w => w.length > 2 && w !== 'including' && w !== 'and');
          const matches = dbKeywords.some(kw => aLower.includes(kw));
          if (!matches) {
            addError(q.element, `Database Mismatch: Entered "${aText}", candidate preferred database is "${prefDb}".`, "EXPERIENCE_MISMATCH");
          }
        }
      }

      // Dynamic Years of Experience Check for languages / technologies
      const expMatch = qLower.match(/years of experience.*?(working with|in|using|with)?\s*([a-z#.+]+)/i);
      if (expMatch) {
        const queriedTech = expMatch[2]?.toLowerCase()?.trim();
        const skillYears = effectiveStack?.skillYears || profile.technicalExperience?.skillYears || {};
        for (const [skill, exp] of Object.entries(skillYears)) {
          if (queriedTech && (queriedTech.includes(skill.toLowerCase()) || skill.toLowerCase().includes(queriedTech))) {
            if (aLower.includes('0') || aLower.includes('none') || aLower.includes('less than 1') || aLower === '0') {
              addError(q.element, `Experience Mismatch on ${skill}: Entered "${aText}", candidate has ${exp} experience in active stack.`, "EXPERIENCE_MISMATCH");
            }
          }
        }
      }

      // Core Engineering Qualifications (Full-stack, ground up, code reviews)
      if (/full-stack.*software development|experience building.*ground up|code reviews and software design/i.test(qLower)) {
        if (aLower === 'no' || aLower === 'false') {
          addError(q.element, `Experience Mismatch: Answered "No" to core engineering qualifications (expected "Yes").`, "EXPERIENCE_MISMATCH");
        }
      }

      // Dynamic Testing Tools Check
      if (/tools have you used for (manual or )?automated testing|testing tools/i.test(qLower)) {
        const expectedTesting = effectiveStack?.testingTools || profile.testingTools?.testingToolsList || '';
        if (expectedTesting && aLower.length > 0) {
          const expectedKws = expectedTesting.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
          const hasAtLeastOne = expectedKws.some(kw => aLower.includes(kw));
          if (!hasAtLeastOne && aLower.length < 8) {
            addError(q.element, `Testing Tools Mismatch: Entered "${aText}", candidate testing toolset includes: "${expectedTesting}".`, "EXPERIENCE_MISMATCH", true);
          }
        }
      }

      // 17. INDUSTRY-SPECIFIC EXPERIENCE (Category 17)
      if (/wms|warehouse management|wcs|warehouse control|distribution, logistics, fulfillment/i.test(qLower)) {
        if (aLower === 'yes' || aLower === 'true') {
          addError(q.element, `Domain Experience Mismatch: Answered "Yes" (candidate record is "No").`, "EXPERIENCE_MISMATCH", true);
        }
      }

      // Qualitative Open Text Content Checks
      if (q.type === 'textarea' || q.type === 'text') {
        const isNaAllowed = /or n\/?a|or na|or none|if any|if applicable|if you have|optional|please specify/i.test(qText);
        const isNaAnswer = /^(n\/?a|na|none|no|not applicable|n\.a\.|nothing|\/)$/i.test(aText.trim());

        if (DIRTY_REGEX.test(aLower) && (!isNaAllowed || !isNaAnswer)) {
          addError(q.element, `Incomplete response on "${qText}": Entered placeholder "${aText}". Please provide full response.`, "DIRTY_SCREENING_ANSWER");
        }
        
        const isDescriptive = /describe|explain|experience with|why are you|tell us|projects/i.test(qText);
        if (isDescriptive && aText.length > 0 && aText.length < minScreeningLen) {
          if (!isNaAllowed || !isNaAnswer) {
            addError(q.element, `Answer too brief (${aText.length}/${minScreeningLen} chars) on prompt: "${qText}".`, "SHORT_SCREENING_ANSWER");
          }
        }
      }
    });

    // =========================================================================
    // 4. COMPENSATION & SALARY CONSTRAINTS (Category 4)
    // =========================================================================
    if (data.salary_numeric !== null && !isNaN(data.salary_numeric)) {
      const sal = data.salary_numeric;
      const floor = profile.compensation?.salaryFloor || profile.salaryFloor || 120000;

      if (sal <= 1) {
        addError(data._elements?.salary, `Invalid salary: $${sal}. Auto-rejected by ATS pay filters.`, "INVALID_SALARY_PLACEHOLDER");
      } else if (sal < floor && sal > 1000) {
        addError(data._elements?.salary, `Salary Warning: $${sal.toLocaleString()} is below candidate floor of $${floor.toLocaleString()}.`, "SALARY_BELOW_FLOOR", true);
      }
    }

    return {
      isValid: errors.length === 0,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors,
      warnings,
      fieldErrorMap
    };
  }

  return {
    validate
  };
})();
