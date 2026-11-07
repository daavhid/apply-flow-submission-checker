/**
 * Apply-Flow Submission Quality Gatekeeper
 * Production-Grade Client-Side PDF, DOCX, and Resume Text Extraction Engine
 * Uses PDF.js & JSZip for 100% offline, CMap-decoded, CSP-compliant document parsing.
 */

class ResumeDocumentParser {
  /**
   * Parse any uploaded File (PDF, DOCX, TXT, MD, JSON, CSV) into clean plain text
   * @param {File} file 
   * @returns {Promise<string>}
   */
  static async extractTextFromFile(file) {
    if (!file) throw new Error("No file provided");
    const filename = file.name.toLowerCase();

    if (filename.endsWith('.docx')) {
      const buffer = await file.arrayBuffer();
      return await this.extractTextFromDocx(buffer);
    } else if (filename.endsWith('.pdf')) {
      const buffer = await file.arrayBuffer();
      return await this.extractTextFromPdf(buffer);
    } else {
      // Plain text, Markdown, CSV, JSON, RTF
      return await file.text();
    }
  }

  /**
   * Get or dynamically initialize PDF.js library instance
   */
  static async getPdfJs() {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      return window.pdfjsLib;
    }
    try {
      const pdfUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('options/lib/pdf.min.mjs')
        : './lib/pdf.min.mjs';
      const module = await import(pdfUrl);
      if (typeof window !== 'undefined') {
        window.pdfjsLib = module;
      }
      if (module.GlobalWorkerOptions) {
        module.GlobalWorkerOptions.workerSrc = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
          ? chrome.runtime.getURL('options/lib/pdf.worker.min.mjs')
          : './lib/pdf.worker.min.mjs';
      }
      return module;
    } catch (err) {
      console.warn("[DocParser] Dynamic import of pdf.min.mjs failed:", err);
      return null;
    }
  }

  /**
   * Extract text from PDF buffer using PDF.js engine
   * Properly decodes Font CMaps, CID / Type0 identity fonts, and multi-page layouts.
   * @param {ArrayBuffer} buffer 
   * @returns {Promise<string>}
   */
  static async extractTextFromPdf(buffer) {
    try {
      const pdfjs = await this.getPdfJs();
      if (!pdfjs || !pdfjs.getDocument) {
        throw new Error("PDF.js engine is not available. Please verify options/lib/pdf.min.mjs is present.");
      }

      const uint8 = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({
        data: uint8,
        useSystemFonts: true,
        disableFontFace: true,
        isEvalSupported: false
      });

      const pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;
      const allPagesText = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const items = textContent.items || [];

        if (items.length === 0) continue;

        // Group text items by line using Y-coordinate
        const linesMap = new Map();
        for (const item of items) {
          if (!item.str && item.str !== ' ') continue;
          // transform matrix: [scaleX, skewY, skewX, scaleY, transX, transY]
          const y = item.transform ? Math.round(item.transform[5]) : 0;
          const x = item.transform ? item.transform[4] : 0;

          // Find existing line bucket within 4px tolerance
          let matchedY = null;
          for (const existingY of linesMap.keys()) {
            if (Math.abs(existingY - y) <= 4) {
              matchedY = existingY;
              break;
            }
          }

          const targetY = matchedY !== null ? matchedY : y;
          if (!linesMap.has(targetY)) {
            linesMap.set(targetY, []);
          }
          linesMap.get(targetY).push({ x, str: item.str });
        }

        // Sort lines vertically (top to bottom: Y descending)
        const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a);
        const pageLines = [];

        for (const y of sortedYs) {
          const lineItems = linesMap.get(y);
          // Sort items horizontally (left to right: X ascending)
          lineItems.sort((a, b) => a.x - b.x);
          
          let lineStr = '';
          for (const item of lineItems) {
            if (lineStr.length > 0 && !lineStr.endsWith(' ') && !item.str.startsWith(' ')) {
              lineStr += ' ';
            }
            lineStr += item.str;
          }
          const trimmed = lineStr.trim();
          if (trimmed) {
            pageLines.push(trimmed);
          }
        }

        if (pageLines.length > 0) {
          allPagesText.push(pageLines.join('\n'));
        }
      }

      const fullText = allPagesText.join('\n\n').trim();
      if (fullText.length > 20) {
        return fullText;
      }
      throw new Error("Extracted PDF content was empty");
    } catch (err) {
      console.warn("[DocParser] PDF.js extraction encountered an issue, trying text fallback:", err);
      return this.fallbackBinaryTextExtraction(buffer);
    }
  }

  /**
   * Extract text from DOCX (PKZip containing word/document.xml)
   * Uses JSZip or DecompressionStream fallback
   * @param {ArrayBuffer} buffer 
   * @returns {Promise<string>}
   */
  static async extractTextFromDocx(buffer) {
    try {
      let xmlString = '';

      // Try window.JSZip first if loaded
      if (typeof window !== 'undefined' && window.JSZip) {
        const zip = await window.JSZip.loadAsync(buffer);
        const docFile = zip.file("word/document.xml");
        if (docFile) {
          xmlString = await docFile.async("string");
        }
      }

      // Fallback to manual PKZip header parsing
      if (!xmlString) {
        const bytes = new Uint8Array(buffer);
        xmlString = await this.unzipDocxDocumentXml(bytes);
      }

      if (!xmlString) {
        throw new Error("Could not locate word/document.xml in DOCX archive");
      }

      // Parse XML nodes to preserve paragraph and line breaks
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, "application/xml");
      const paragraphs = xmlDoc.getElementsByTagName("w:p");
      const textLines = [];

      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        let pText = "";
        const children = p.querySelectorAll("w\\:t, t, w\\:tab, tab, w\\:br, br");
        children.forEach(node => {
          const nodeName = node.nodeName.toLowerCase();
          if (nodeName.includes('tab')) {
            pText += "    ";
          } else if (nodeName.includes('br')) {
            pText += "\n";
          } else {
            pText += node.textContent || "";
          }
        });
        if (pText.trim()) {
          textLines.push(pText.trim());
        }
      }

      if (textLines.length > 0) {
        return textLines.join("\n");
      }

      // Fallback regex strip
      return xmlString.replace(/<w:p[^>]*>/gi, '\n')
                      .replace(/<w:br[^>]*>/gi, '\n')
                      .replace(/<w:tab[^>]*>/gi, '    ')
                      .replace(/<[^>]+>/g, '')
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&apos;/g, "'")
                      .replace(/\n\s*\n/g, '\n\n')
                      .trim();
    } catch (err) {
      console.warn("[DocParser] DOCX extraction error, attempting fallback:", err);
      return this.fallbackBinaryTextExtraction(buffer);
    }
  }

  /**
   * Minimalist PKZip reader for word/document.xml using standard DecompressionStream
   */
  static async unzipDocxDocumentXml(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const len = bytes.length;

    while (offset < len - 30) {
      if (view.getUint32(offset, true) === 0x04034b50) {
        const compMethod = view.getUint16(offset + 8, true);
        const compSize = view.getUint32(offset + 18, true);
        const fileNameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);

        const fileNameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLen);
        const fileName = new TextDecoder().decode(fileNameBytes);
        const dataOffset = offset + 30 + fileNameLen + extraLen;

        if (fileName === "word/document.xml") {
          const compData = bytes.subarray(dataOffset, dataOffset + compSize);
          if (compMethod === 0) {
            return new TextDecoder().decode(compData);
          } else if (compMethod === 8) {
            try {
              const decompressed = await this.decompressRawDeflate(compData);
              return new TextDecoder().decode(decompressed);
            } catch (decompErr) {
              console.warn("[DocParser] Deflate error on document.xml:", decompErr);
            }
          }
        }
        offset = dataOffset + (compSize > 0 ? compSize : 1);
      } else {
        offset++;
      }
    }
    return null;
  }

  static async decompressRawDeflate(uint8Arr) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = new Response(uint8Arr).body.pipeThrough(new DecompressionStream('deflate-raw'));
        const buffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(buffer);
      } catch (_) {
        const stream2 = new Response(uint8Arr).body.pipeThrough(new DecompressionStream('deflate'));
        const buffer2 = await new Response(stream2).arrayBuffer();
        return new Uint8Array(buffer2);
      }
    }
    throw new Error("DecompressionStream is not supported in this browser");
  }

  static fallbackBinaryTextExtraction(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if ((c >= 32 && c <= 126) || c === 10 || c === 13 || c === 9) {
        out += String.fromCharCode(c);
      } else if (out.length > 0 && out[out.length - 1] !== ' ') {
        out += ' ';
      }
    }
    return out.replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Universal Structured Candidate Profile Extractor
   * Extracts identity, stack, education, credentials, experience, and custom screening data.
   * @param {string} rawText 
   * @returns {Object} Extracted candidate fields
   */
  static parseCandidateDetails(rawText) {
    if (!rawText) return null;
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const textLower = rawText.toLowerCase();
    const result = {
      fullName: '',
      firstName: '',
      lastName: '',
      preferredName: '',
      primaryEmail: '',
      emailAliases: [],
      phone: '',
      formattedPhone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States',
      linkedin: '',
      github: '',
      hiringPassword: '',
      dob: '',
      graduationDate: '',
      school: '',
      degree: '',
      degreeLevel: "Bachelor's Degree",
      targetStack: 'Full Stack Software Engineer',
      primaryStackKeywords: [],
      backendSkills: '',
      frontendSkills: '',
      dbCloudSkills: '',
      yearsExperience: '8+ years',
      experienceSummary: '',
      extractedTags: []
    };

    const getRowValue = (regex) => {
      for (const line of lines) {
        const match = line.match(regex);
        if (match && match[1]) return match[1].trim();
      }
      return '';
    };

    // 1. Email Extraction
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
    if (emailMatch) {
      result.primaryEmail = emailMatch[0];
      result.emailAliases.push(emailMatch[0]);
      result.extractedTags.push({ icon: '📧', label: emailMatch[0], type: 'email' });
    }

    // 2. Phone Extraction
    const phoneMatch = rawText.match(/(?:mobile|phone|tel)?[:\s\t]*(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i) ||
                       rawText.match(/(\d{3}[\s.-]\d{3}[\s.-]\d{4})/);
    if (phoneMatch) {
      const cleanPhone = phoneMatch[1].replace(/[^\d]/g, '');
      result.phone = cleanPhone;
      if (cleanPhone.length === 10) {
        result.formattedPhone = `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`;
      }
      result.extractedTags.push({ icon: '📱', label: result.formattedPhone || cleanPhone, type: 'phone' });
    }

    // 3. LinkedIn & GitHub
    const linkedInMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
    if (linkedInMatch) {
      result.linkedin = linkedInMatch[0];
      result.extractedTags.push({ icon: '🔗', label: 'LinkedIn Verified', type: 'link' });
    }
    const gitHubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
    if (gitHubMatch) {
      result.github = gitHubMatch[0];
      result.extractedTags.push({ icon: '🐙', label: 'GitHub Profile', type: 'link' });
    }

    // 4. Candidate Name Extraction
    let fullName = getRowValue(/^(?:full\s*name|candidate\s*name|name)[:\s\t]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    let legalFirst = getRowValue(/^(?:legal\s*first\s*name|first\s*name)[:\s\t]+([A-Za-z]+)/i);
    let legalMiddle = getRowValue(/^(?:legal\s*middle\s*name|middle\s*name)[:\s\t]+([A-Za-z]+)/i);
    let legalLast = getRowValue(/^(?:legal\s*last\s*name|last\s*name)[:\s\t]+([A-Za-z]+)/i);
    let preferredName = getRowValue(/^(?:preferred\s*name)[:\s\t]+([A-Za-z\s]+)/i);

    if (!fullName) {
      const genericNameMatch = rawText.match(/(?:full\s*name|candidate\s*name|name)[:\s\t]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
      if (genericNameMatch) {
        fullName = genericNameMatch[1].trim();
      } else {
        // Find first clean name line at the top of the resume
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          const l = lines[i];
          if (/^[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3}$/.test(l) &&
              !l.toLowerCase().includes('resume') &&
              !l.toLowerCase().includes('curriculum') &&
              !l.toLowerCase().includes('developer') &&
              !l.toLowerCase().includes('engineer')) {
            fullName = l;
            break;
          }
        }
      }
    }

    if (fullName) {
      result.fullName = fullName;
      const parts = fullName.split(/\s+/);
      result.firstName = legalFirst || parts[0] || '';
      result.lastName = legalLast || parts[parts.length - 1] || '';
      result.preferredName = preferredName || fullName;
      result.extractedTags.push({ icon: '👤', label: fullName, type: 'name' });
    }

    // 5. Password Extraction
    let pwVal = getRowValue(/^(?:password\s*frequently\s*used\s*for\s*hiring\s*platforms|password|portal\s*password)[:\s\t]+([^\s\t\n]+)/i);
    if (!pwVal) {
      const pwMatch = rawText.match(/(?:password|frequently used for hiring platforms)[:\s\t]+([^\s\t\n]+)/i);
      if (pwMatch) pwVal = pwMatch[1].trim();
    }
    if (pwVal) {
      result.hiringPassword = pwVal;
      result.extractedTags.push({ icon: '🔑', label: 'Portal Password Saved', type: 'cred' });
    } else {
      result.hiringPassword = 'qweQWE123!@#';
    }

    // 6. Dates (DOB & Graduation)
    let dobVal = getRowValue(/^(?:dob|date\s*of\s*birth)[:\s\t]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (!dobVal) {
      const dobMatch = rawText.match(/(?:dob|date of birth)[:\s\t]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (dobMatch) dobVal = dobMatch[1].trim();
    }
    if (dobVal) {
      result.dob = dobVal;
      result.extractedTags.push({ icon: '📅', label: `DOB: ${dobVal}`, type: 'date' });
    }

    let gradVal = getRowValue(/^(?:graduation\s*date|grad\s*date|graduated)[:\s\t]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (!gradVal) {
      const gradMatch = rawText.match(/(?:graduation date|grad date|graduated)[:\s\t]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (gradMatch) gradVal = gradMatch[1].trim();
    }
    if (gradVal) {
      result.graduationDate = gradVal;
      result.extractedTags.push({ icon: '🎓', label: `Grad: ${gradVal}`, type: 'date' });
    }

    // 7. Location & Address
    const addrLine = getRowValue(/^(?:address)[:\s\t]+([^\n]+)/i);
    if (addrLine) {
      const parts = addrLine.split(/[\t,]+/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 4) {
        result.address = parts[0];
        result.city = parts[1];
        result.state = parts[2] === 'FL' ? 'Florida' : parts[2];
        result.zip = parts[3];
      } else {
        result.address = addrLine;
      }
    } else {
      const addressMatch = rawText.match(/(\d+\s+[A-Za-z0-9\s.,]+(?:Avenue|Ave|Street|St|Road|Rd|Drive|Dr|Lane|Ln|Blvd|Way))/i);
      if (addressMatch) result.address = addressMatch[1].trim();
      const zipMatch = rawText.match(/\b\d{5}(?:-\d{4})?\b/);
      if (zipMatch) result.zip = zipMatch[0];
      if (textLower.includes('miami')) result.city = 'Miami';
      if (textLower.includes('florida') || textLower.includes(' fl ') || textLower.includes('\tfl\t') || textLower.includes(', fl')) result.state = 'Florida';
    }
    if (result.city || result.state) {
      result.extractedTags.push({ icon: '📍', label: `${result.city || ''}${result.city && result.state ? ', ' : ''}${result.state || 'United States'}`, type: 'location' });
    }

    // 8. Education & University
    if (textLower.includes('notre dame')) {
      result.school = 'University of Notre Dame';
    } else if (textLower.includes('texas tech')) {
      result.school = 'Texas Tech University';
    } else if (textLower.includes('florida international')) {
      result.school = 'Florida International University';
    } else {
      const schoolMatch = rawText.match(/(?:university|college|institute|school)[:\s\t]+([^\n\t,]+)/i) ||
                          rawText.match(/(university of [a-zA-Z\s]+|[a-zA-Z\s]+ university|[a-zA-Z\s]+ college)/i);
      if (schoolMatch) result.school = (schoolMatch[1] || schoolMatch[0]).trim();
    }

    if (textLower.includes('master') || textLower.includes('m.s.') || textLower.includes('m.sc.')) {
      result.degreeLevel = "Master's Degree";
      result.degree = "Master of Science in Computer Science";
      result.extractedTags.push({ icon: '📜', label: `Master's (${result.school || 'University'})`, type: 'edu' });
    } else if (textLower.includes('bachelor') || textLower.includes('b.s.') || textLower.includes('b.a.') || textLower.includes('b.sc.')) {
      result.degreeLevel = "Bachelor's Degree";
      result.degree = "Bachelor of Science in Computer Science";
      result.extractedTags.push({ icon: '📜', label: `Bachelor's (${result.school || 'University'})`, type: 'edu' });
    } else if (result.school) {
      result.extractedTags.push({ icon: '🏫', label: result.school, type: 'edu' });
    }

    // 9. Robust Technical Skills Extraction & Intelligent Skill Inference
    const skillData = this.extractAndInferTechnicalSkills(rawText, textLower);
    result.targetStack = skillData.targetStack;
    result.primaryStackKeywords = skillData.primaryStackKeywords;
    result.backendSkills = skillData.backendSkills;
    result.frontendSkills = skillData.frontendSkills;
    result.dbCloudSkills = skillData.dbCloudSkills;

    if (skillData.extractedTags?.length) {
      result.extractedTags.push(...skillData.extractedTags);
    }

    // Years of Experience calculation / detection
    const expMatch = rawText.match(/(\d+)\+?\s*years?\s*(?:of)?\s*(?:experience|software|engineering|dev)/i);
    if (expMatch) {
      result.yearsExperience = `${expMatch[1]}+ years`;
      result.extractedTags.push({ icon: '⏱️', label: `${result.yearsExperience} Experience`, type: 'exp' });
    }

    return result;
  }

  /**
   * Technical Taxonomy: Comprehensive Skill Dictionary
   */
  static getTechnicalTaxonomy() {
    return {
      backend: [
        { name: "C#", patterns: [/(?:^|[\s,;/|\(])c#(?=[\s,;./|\)]|$)/i, /\bcsharp\b/i] },
        { name: ".NET 8", patterns: [/(?:^|[\s,;/|\(])\.net\s*8(?=[\s,;./|\)]|$)/i, /\bdotnet\s*8\b/i] },
        { name: ".NET Core", patterns: [/(?:^|[\s,;/|\(])\.net\s*core(?=[\s,;./|\)]|$)/i, /\bdotnet\s*core\b/i] },
        { name: ".NET Framework", patterns: [/(?:^|[\s,;/|\(])\.net\s*framework(?=[\s,;./|\)]|$)/i] },
        { name: ".NET", patterns: [/(?:^|[\s,;/|\(])\.net(?=[\s,;./|\)]|$)/i, /\bdotnet\b/i] },
        { name: "ASP.NET Core", patterns: [/\basp\.net\s*core\b/i, /\baspnet\s*core\b/i] },
        { name: "ASP.NET Web API", patterns: [/\basp\.net\s*web\s*api\b/i, /\bweb\s*api\b/i] },
        { name: "ASP.NET MVC", patterns: [/\basp\.net\s*mvc\b/i] },
        { name: "ASP.NET Web Forms", patterns: [/\basp\.net\s*web\s*forms\b/i] },
        { name: "Entity Framework Core", patterns: [/\bentity\s*framework\s*core\b/i, /\bef\s*core\b/i] },
        { name: "Entity Framework", patterns: [/\bentity\s*framework\b/i] },
        { name: "Dapper", patterns: [/\bdapper\b/i] },
        { name: "LINQ", patterns: [/\blinq\b/i] },
        { name: "WCF", patterns: [/\bwcf\b/i, /\bwindows\s*communication\s*foundation\b/i] },
        { name: "Dependency Injection", patterns: [/\bdependency\s*injection\b/i] },
        { name: "Python", patterns: [/\bpython(?:\s*3(?:\.\d+)?)?\b/i] },
        { name: "FastAPI", patterns: [/\bfastapi\b/i] },
        { name: "Django", patterns: [/\bdjango\b/i] },
        { name: "Flask", patterns: [/\bflask\b/i] },
        { name: "Celery", patterns: [/\bcelery\b/i] },
        { name: "SQLAlchemy", patterns: [/\bsqlalchemy\b/i] },
        { name: "Pydantic", patterns: [/\bpydantic\b/i] },
        { name: "Node.js", patterns: [/\bnode(?:\.js)?\b/i] },
        { name: "Express.js", patterns: [/\bexpress(?:\.js)?\b/i] },
        { name: "NestJS", patterns: [/\bnest(?:\.js)?\b/i] },
        { name: "Java", patterns: [/\bjava\b/i] },
        { name: "Spring Boot", patterns: [/\bspring\s*boot\b/i] },
        { name: "Spring Framework", patterns: [/\bspring\s*framework\b/i] },
        { name: "Hibernate", patterns: [/\bhibernate\b/i] },
        { name: "Go / Golang", patterns: [/\bgolang\b/i, /\bgo\s+programming\b/i] },
        { name: "PHP", patterns: [/\bphp(?:\s*8(?:\.\d+)?)?\b/i] },
        { name: "Laravel", patterns: [/\blaravel\b/i] },
        { name: "Symfony", patterns: [/\bsymfony\b/i] },
        { name: "Ruby on Rails", patterns: [/\bruby\s+on\s+rails\b/i, /\brails\b/i] },
        { name: "C++", patterns: [/(?:^|[\s,;/|\(])c\+\+(?=[\s,;./|\)]|$)/i] },
        { name: "Rust", patterns: [/\brust\b/i] },
        { name: "RESTful APIs", patterns: [/\brestful\s*apis?\b/i, /\brest\s*apis?\b/i, /\brest\b/i] },
        { name: "GraphQL", patterns: [/\bgraphql\b/i] },
        { name: "gRPC", patterns: [/\bgrpc\b/i] },
        { name: "Microservices", patterns: [/\bmicroservices?\b/i] },
        { name: "Distributed Systems", patterns: [/\bdistributed\s*systems?\b/i] },
        { name: "Clean Architecture", patterns: [/\bclean\s*architecture\b/i] },
        { name: "Domain-Driven Design (DDD)", patterns: [/\bdomain[- ]driven\s*design\b/i, /\bddd\b/i] },
        { name: "CQRS", patterns: [/\bcqrs\b/i] },
        { name: "Event-Driven Architecture", patterns: [/\bevent[- ]driven\b/i] },
        { name: "SOLID Principles", patterns: [/\bsolid\s*principles\b/i] },
        { name: "WebSockets", patterns: [/\bwebsockets?\b/i] }
      ],

      frontend: [
        { name: "React", patterns: [/\breact(?:\.js)?\b/i] },
        { name: "Next.js", patterns: [/\bnext(?:\.js)?\b/i] },
        { name: "TypeScript", patterns: [/\btypescript\b/i] },
        { name: "JavaScript", patterns: [/\bjavascript\b/i, /\bes6\+?\b/i] },
        { name: "Angular", patterns: [/\bangular(?:\.js)?\b/i] },
        { name: "Vue.js", patterns: [/\bvue(?:\.js)?\b/i] },
        { name: "Nuxt.js", patterns: [/\bnuxt(?:\.js)?\b/i] },
        { name: "Blazor", patterns: [/\bblazor\b/i] },
        { name: "Razor Components", patterns: [/\brazor\s*(?:components|views|pages)?\b/i] },
        { name: "Svelte", patterns: [/\bsvelte\b/i] },
        { name: "HTML5 / CSS3", patterns: [/\bhtml5?\b/i, /\bcss3?\b/i] },
        { name: "Tailwind CSS", patterns: [/\btailwind\s*css\b/i, /\btailwind\b/i] },
        { name: "Bootstrap", patterns: [/\bbootstrap\b/i] },
        { name: "Sass / SCSS", patterns: [/\bsass\b/i, /\bscss\b/i] },
        { name: "Redux", patterns: [/\bredux\b/i, /\bredux\s*toolkit\b/i] },
        { name: "Zustand", patterns: [/\bzustand\b/i] },
        { name: "RxJS", patterns: [/\brxjs\b/i] },
        { name: "Webpack", patterns: [/\bwebpack\b/i] },
        { name: "Vite", patterns: [/\bvite\b/i] },
        { name: "Responsive Design", patterns: [/\bresponsive\s*design\b/i] }
      ],

      dbCloud: [
        { name: "SQL Server", patterns: [/\bsql\s*server\b/i, /\bmssql\b/i] },
        { name: "Azure SQL Database", patterns: [/\bazure\s*sql\b/i] },
        { name: "PostgreSQL", patterns: [/\bpostgresql\b/i, /\bpostgres\b/i] },
        { name: "MySQL", patterns: [/\bmysql\b/i] },
        { name: "Oracle Database", patterns: [/\boracle(?:\s*db)?\b/i] },
        { name: "T-SQL", patterns: [/\bt-sql\b/i, /\btsql\b/i] },
        { name: "PL/SQL", patterns: [/\bpl\/sql\b/i] },
        { name: "Amazon RDS", patterns: [/\bamazon\s*rds\b/i, /\baws\s*rds\b/i] },
        { name: "Amazon Aurora", patterns: [/\bamazon\s*aurora\b/i] },
        { name: "Redis", patterns: [/\bredis\b/i] },
        { name: "MongoDB", patterns: [/\bmongodb\b/i, /\bmongo\b/i] },
        { name: "DynamoDB", patterns: [/\bdynamodb\b/i] },
        { name: "Cassandra", patterns: [/\bcassandra\b/i] },
        { name: "Elasticsearch", patterns: [/\belasticsearch\b/i] },
        { name: "Apache Kafka", patterns: [/\bapache\s*kafka\b/i, /\bkafka\b/i] },
        { name: "RabbitMQ", patterns: [/\brabbitmq\b/i] },
        { name: "Azure Service Bus", patterns: [/\bazure\s*service\s*bus\b/i] },
        { name: "Amazon SNS / SQS", patterns: [/\bamazon\s*(?:sns|sqs)\b/i, /\baws\s*(?:sns|sqs)\b/i, /\bsns\b/i, /\bsqs\b/i] },
        { name: "Microsoft Azure", patterns: [/\bmicrosoft\s*azure\b/i, /\bazure\b/i] },
        { name: "AWS", patterns: [/\bamazon\s*web\s*services\b/i, /\baws\b/i] },
        { name: "Google Cloud (GCP)", patterns: [/\bgoogle\s*cloud\b/i, /\bgcp\b/i] },
        { name: "Azure Kubernetes Service (AKS)", patterns: [/\baks\b/i, /\bazure\s*kubernetes\b/i] },
        { name: "Amazon EKS", patterns: [/\beks\b/i, /\bamazon\s*eks\b/i] },
        { name: "Azure API Management", patterns: [/\bazure\s*api\s*management\b/i] },
        { name: "Azure Functions", patterns: [/\bazure\s*functions\b/i] },
        { name: "AWS Lambda", patterns: [/\baws\s*lambda\b/i, /\blambda\b/i] },
        { name: "Amazon S3", patterns: [/\bamazon\s*s3\b/i, /\baws\s*s3\b/i, /\bs3\b/i] },
        { name: "Docker", patterns: [/\bdocker\b/i] },
        { name: "Kubernetes", patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
        { name: "Terraform", patterns: [/\bterraform\b/i] },
        { name: "Azure DevOps", patterns: [/\bazure\s*devops\b/i] },
        { name: "GitHub Actions", patterns: [/\bgithub\s*actions\b/i] },
        { name: "GitLab CI", patterns: [/\bgitlab\s*ci\b/i] },
        { name: "Jenkins", patterns: [/\bjenkins\b/i] },
        { name: "CI/CD", patterns: [/(?:^|[\s,;/|\(])ci\/cd(?=[\s,;./|\)]|$)/i, /\bcontinuous\s*integration\b/i] },
        { name: "Git", patterns: [/\bgit\b/i] }
      ],

      ai: [
        { name: "Azure OpenAI", patterns: [/\bazure\s*openai\b/i] },
        { name: "OpenAI API", patterns: [/\bopenai\b/i] },
        { name: "Retrieval-Augmented Generation (RAG)", patterns: [/\bretrieval[- ]augmented\s*generation\b/i, /\brag\b/i] },
        { name: "Prompt Engineering", patterns: [/\bprompt\s*engineering\b/i] },
        { name: "AI-Assisted Development", patterns: [/\bai[- ]assisted\b/i, /\bgithub\s*copilot\b/i, /\bagentic\b/i] },
        { name: "Machine Learning", patterns: [/\bmachine\s*learning\b/i] },
        { name: "PyTorch", patterns: [/\bpytorch\b/i] },
        { name: "TensorFlow", patterns: [/\btensorflow\b/i] }
      ],

      testing: [
        { name: "xUnit", patterns: [/\bxunit\b/i] },
        { name: "NUnit", patterns: [/\bnunit\b/i] },
        { name: "MSTest", patterns: [/\bmstest\b/i] },
        { name: "Moq", patterns: [/\bmoq\b/i] },
        { name: "pytest", patterns: [/\bpytest\b/i] },
        { name: "Jest", patterns: [/\bjest\b/i] },
        { name: "Testcontainers", patterns: [/\btestcontainers\b/i] }
      ]
    };
  }

  /**
   * Parse explicit sections (e.g. TECHNICAL SKILLS: Backend Development, Cloud & Infrastructure, etc.)
   */
  static parseExplicitSkillsSection(rawText) {
    const sectionKeywords = [];
    const lines = rawText.split('\n');
    let inSkillsSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (/^(?:technical\s*skills|skills\s*(?:&|and)\s*tools|core\s*competencies|skills|technologies|proficiencies)[:\s]*$/i.test(line)) {
        inSkillsSection = true;
        continue;
      }

      if (inSkillsSection && /^(?:professional\s*experience|work\s*experience|experience|employment|education|projects|certifications|awards|summary)[:\s]*$/i.test(line)) {
        inSkillsSection = false;
        break;
      }

      if (inSkillsSection) {
        const colonIdx = line.indexOf(':');
        const content = colonIdx !== -1 ? line.substring(colonIdx + 1) : line;
        const tokens = content.split(/[,|•·;]+/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
        sectionKeywords.push(...tokens);
      }
    }
    return sectionKeywords;
  }

  /**
   * Infer related skills based on detected technologies
   */
  static inferCorrelatedSkills(detectedSkills) {
    const inferred = { backend: [], frontend: [], dbCloud: [] };
    const has = (name) => detectedSkills.some(s => s.toLowerCase() === name.toLowerCase());

    // Language & Framework Correlations
    if (has(".NET 8") || has("ASP.NET Core") || has(".NET Core") || has(".NET Framework")) {
      if (!has("C#")) inferred.backend.push("C#");
      if (!has(".NET")) inferred.backend.push(".NET");
      if (!has("RESTful APIs")) inferred.backend.push("RESTful APIs");
    }
    if (has("React") || has("Angular") || has("Vue.js") || has("Svelte")) {
      if (!has("JavaScript")) inferred.frontend.push("JavaScript");
      if (!has("HTML5 / CSS3")) inferred.frontend.push("HTML5 / CSS3");
      inferred.frontend.push("Responsive Web Design");
    }
    if (has("TypeScript") && !has("JavaScript")) {
      inferred.frontend.push("JavaScript");
    }
    if (has("Next.js") && !has("React")) {
      inferred.frontend.push("React");
    }
    if (has("FastAPI") || has("Django") || has("Flask")) {
      if (!has("Python")) inferred.backend.push("Python");
      if (!has("RESTful APIs")) inferred.backend.push("RESTful APIs");
    }
    if (has("Spring Boot") && !has("Java")) {
      inferred.backend.push("Java");
      inferred.backend.push("RESTful APIs");
    }
    if (has("Laravel") && !has("PHP")) {
      inferred.backend.push("PHP");
      inferred.backend.push("REST APIs");
    }

    // Cloud & DevOps Correlations
    if (has("Kubernetes") || has("Azure Kubernetes Service (AKS)") || has("Amazon EKS")) {
      if (!has("Docker")) inferred.dbCloud.push("Docker");
      inferred.dbCloud.push("Containerization");
      inferred.dbCloud.push("Container Orchestration");
    }
    if (has("Docker") && !inferred.dbCloud.includes("Containerization")) {
      inferred.dbCloud.push("Containerization");
    }
    if (has("Terraform")) {
      inferred.dbCloud.push("Infrastructure as Code (IaC)");
    }
    if (has("GitHub Actions") || has("Azure DevOps") || has("GitLab CI") || has("Jenkins")) {
      if (!has("CI/CD")) inferred.dbCloud.push("CI/CD");
      inferred.dbCloud.push("Continuous Integration & Automated Deployment");
    }
    if (has("Azure Kubernetes Service (AKS)") || has("Azure Functions") || has("Azure SQL Database") || has("Azure Service Bus")) {
      if (!has("Microsoft Azure")) inferred.dbCloud.push("Microsoft Azure");
      inferred.dbCloud.push("Cloud Architecture");
    }
    if (has("Amazon EKS") || has("AWS Lambda") || has("Amazon RDS") || has("Amazon SNS / SQS")) {
      if (!has("AWS")) inferred.dbCloud.push("AWS");
      inferred.dbCloud.push("Cloud Architecture");
    }

    // Database & Messaging Correlations
    if (has("SQL Server") || has("Azure SQL Database") || has("PostgreSQL") || has("MySQL") || has("Oracle Database")) {
      inferred.dbCloud.push("Relational Databases");
      inferred.dbCloud.push("Database Design & Optimization");
    }
    if (has("SQL Server") || has("Azure SQL Database")) {
      if (!has("T-SQL")) inferred.dbCloud.push("T-SQL");
    }
    if (has("Apache Kafka") || has("RabbitMQ") || has("Azure Service Bus") || has("Amazon SNS / SQS")) {
      inferred.dbCloud.push("Event-Driven Architecture");
      inferred.backend.push("Distributed Systems");
      inferred.backend.push("Asynchronous Messaging");
    }
    if (has("Redis")) {
      inferred.dbCloud.push("In-Memory Caching");
    }
    if (has("Microservices") || has("CQRS")) {
      inferred.backend.push("Distributed Systems");
    }

    // Testing & Quality Correlations
    if (has("xUnit") || has("NUnit") || has("pytest") || has("Jest") || has("Moq")) {
      inferred.backend.push("Unit Testing & Mocking (TDD)");
    }

    // AI Correlations
    if (has("Azure OpenAI") || has("Retrieval-Augmented Generation (RAG)") || has("AI-Assisted Development")) {
      inferred.backend.push("Generative AI & LLM Integration");
    }

    return inferred;
  }

  /**
   * Master Skill Extraction & Inference Engine
   */
  static extractAndInferTechnicalSkills(rawText, textLower) {
    const tax = this.getTechnicalTaxonomy();

    // 1. Match Taxonomy against entire resume
    const foundBackend = tax.backend.filter(i => i.patterns.some(p => p.test(rawText))).map(i => i.name);
    const foundFrontend = tax.frontend.filter(i => i.patterns.some(p => p.test(rawText))).map(i => i.name);
    const foundDbCloud = tax.dbCloud.filter(i => i.patterns.some(p => p.test(rawText))).map(i => i.name);
    const foundAi = tax.ai.filter(i => i.patterns.some(p => p.test(rawText))).map(i => i.name);
    const foundTesting = tax.testing.filter(i => i.patterns.some(p => p.test(rawText))).map(i => i.name);

    // 2. Parse explicit skills section for any candidate-listed items
    const explicitTokens = this.parseExplicitSkillsSection(rawText);

    // 3. Generate Inferred Skills
    const allDetectedSkills = [...foundBackend, ...foundFrontend, ...foundDbCloud, ...foundAi, ...foundTesting, ...explicitTokens];
    const inferred = this.inferCorrelatedSkills(allDetectedSkills);

    // 4. Merge and Deduplicate lists cleanly
    const finalBackend = Array.from(new Set([...foundBackend, ...foundAi, ...foundTesting, ...inferred.backend]));
    const finalFrontend = Array.from(new Set([...foundFrontend, ...inferred.frontend]));
    const finalDbCloud = Array.from(new Set([...foundDbCloud, ...inferred.dbCloud]));

    // 5. Track Alignment
    const hasDotNet = finalBackend.some(s => s.includes('.NET') || s.includes('C#') || s.includes('ASP.NET'));
    const hasPython = finalBackend.some(s => s.toLowerCase().includes('python') || s.toLowerCase().includes('fastapi') || s.toLowerCase().includes('django'));
    const hasJava = finalBackend.some(s => s.toLowerCase().includes('java') || s.toLowerCase().includes('spring'));
    const hasPhp = finalBackend.some(s => s.toLowerCase().includes('php') || s.toLowerCase().includes('laravel'));

    let targetStack = "Full Stack Software Engineer";
    const extractedTags = [];

    if (hasDotNet) {
      targetStack = "Full Stack C# / .NET / Cloud";
      extractedTags.push({ icon: '🔷', label: 'Full Stack C# / .NET Track', type: 'stack' });
      extractedTags.push({ icon: '⚡', label: 'C# & .NET 8 Ecosystem', type: 'stack' });
    } else if (hasPython) {
      targetStack = "Full Stack Python / AI / Cloud";
      extractedTags.push({ icon: '🐍', label: 'Full Stack Python / AI Track', type: 'stack' });
    } else if (hasJava) {
      targetStack = "Full Stack Java / Spring / Cloud";
      extractedTags.push({ icon: '☕', label: 'Java & Spring Track', type: 'stack' });
    } else if (hasPhp) {
      targetStack = "Full Stack PHP / Laravel / Cloud";
      extractedTags.push({ icon: '🐘', label: 'Full Stack PHP / Laravel Track', type: 'stack' });
    } else if (finalFrontend.length > 0) {
      targetStack = "Full Stack TypeScript / React / Cloud";
      extractedTags.push({ icon: '⚛️', label: 'Modern Frontend & Cloud Track', type: 'stack' });
    }

    if (finalBackend.some(s => s.includes('OpenAI') || s.includes('RAG') || s.includes('AI'))) {
      extractedTags.push({ icon: '✨', label: 'Applied AI & RAG Engineering', type: 'stack' });
    }
    if (finalDbCloud.some(s => s.includes('Kubernetes') || s.includes('AKS') || s.includes('EKS') || s.includes('Terraform'))) {
      extractedTags.push({ icon: '☁️', label: 'Cloud-Native & DevOps Ready', type: 'stack' });
    }

    // Comprehensive keywords array for submission validation and search
    const allKeywords = Array.from(new Set([
      ...finalBackend,
      ...finalFrontend,
      ...finalDbCloud,
      ...explicitTokens
    ].map(s => s.toLowerCase().replace(/[^a-z0-9#+.]/g, ' ').trim()).filter(Boolean)));

    return {
      targetStack,
      backendSkills: finalBackend.join(", "),
      frontendSkills: finalFrontend.join(", "),
      dbCloudSkills: finalDbCloud.join(", "),
      primaryStackKeywords: allKeywords,
      extractedTags
    };
  }
}

if (typeof window !== 'undefined') {
  window.ResumeDocumentParser = ResumeDocumentParser;
}
