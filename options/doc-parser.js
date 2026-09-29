/**
 * Apply-Flow Submission Quality Gatekeeper
 * Pure Client-Side PDF, DOCX, and Resume Text Extraction Engine
 * Zero external network dependencies. 100% offline & CSP-compliant.
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
   * Extract text from DOCX (PKZip containing word/document.xml)
   * @param {ArrayBuffer} buffer 
   * @returns {Promise<string>}
   */
  static async extractTextFromDocx(buffer) {
    try {
      const bytes = new Uint8Array(buffer);
      const xmlString = await this.unzipDocxDocumentXml(bytes);
      if (!xmlString) {
        // Fallback: raw regex extraction from binary if zip header parsing varies
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const raw = decoder.decode(bytes);
        const textNodes = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
        if (textNodes && textNodes.length > 0) {
          return textNodes.map(t => t.replace(/<[^>]+>/g, '')).join(' ');
        }
        throw new Error("Could not extract word/document.xml from DOCX");
      }

      // Parse XML nodes to preserve paragraph breaks and structure
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

      // Fallback text extraction
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
      // Local file header signature 0x04034b50 ("PK\x03\x04")
      if (view.getUint32(offset, true) === 0x04034b50) {
        const compMethod = view.getUint16(offset + 8, true);
        const compSize = view.getUint32(offset + 18, true);
        const uncompSize = view.getUint32(offset + 22, true);
        const fileNameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);

        const fileNameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLen);
        const fileName = new TextDecoder().decode(fileNameBytes);
        const dataOffset = offset + 30 + fileNameLen + extraLen;

        if (fileName === "word/document.xml") {
          const compData = bytes.subarray(dataOffset, dataOffset + compSize);
          if (compMethod === 0) {
            // Uncompressed
            return new TextDecoder().decode(compData);
          } else if (compMethod === 8) {
            // Deflated
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

  /**
   * Decompress raw deflate data using standard browser DecompressionStream
   */
  static async decompressRawDeflate(uint8Arr) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = new Response(uint8Arr).body.pipeThrough(new DecompressionStream('deflate-raw'));
        const buffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(buffer);
      } catch (_) {
        try {
          const stream2 = new Response(uint8Arr).body.pipeThrough(new DecompressionStream('deflate'));
          const buffer2 = await new Response(stream2).arrayBuffer();
          return new Uint8Array(buffer2);
        } catch (e2) {
          throw e2;
        }
      }
    }
    throw new Error("DecompressionStream is not supported in this browser");
  }

  /**
   * Extract text from PDF buffer
   * @param {ArrayBuffer} buffer 
   * @returns {Promise<string>}
   */
  static async extractTextFromPdf(buffer) {
    try {
      const bytes = new Uint8Array(buffer);
      const textDecoder = new TextDecoder('latin1');
      const rawPdf = textDecoder.decode(bytes);

      const extractedPieces = [];
      const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
      let streamMatch;

      while ((streamMatch = streamRegex.exec(rawPdf)) !== null) {
        const streamStartIndex = streamMatch.index + streamMatch[0].indexOf('\n') + 1;
        const streamRawStr = streamMatch[1];
        const streamBytes = bytes.subarray(streamStartIndex, streamStartIndex + streamRawStr.length);

        // Try extracting uncompressed BT ... ET text blocks
        const uncompressedText = this.parsePdfTextCommands(streamRawStr);
        if (uncompressedText) {
          extractedPieces.push(uncompressedText);
        } else {
          // Attempt Flate decompression
          try {
            const decomp = await this.decompressPdfFlate(streamBytes);
            if (decomp) {
              const decompStr = new TextDecoder('latin1').decode(decomp);
              const textFromDecomp = this.parsePdfTextCommands(decompStr);
              if (textFromDecomp) {
                extractedPieces.push(textFromDecomp);
              }
            }
          } catch (_) {
            // Non-deflate stream or image data
          }
        }
      }

      if (extractedPieces.length > 0) {
        const result = extractedPieces.join('\n').trim();
        if (result.length > 50) return result;
      }

      // Fallback: Scan raw text strings from PDF objects
      return this.fallbackPdfStringExtraction(rawPdf);
    } catch (err) {
      console.warn("[DocParser] PDF extraction error, attempting fallback:", err);
      return this.fallbackBinaryTextExtraction(buffer);
    }
  }

  /**
   * Parse PDF text commands (BT ... ET, Tj, TJ, ')
   */
  static parsePdfTextCommands(streamStr) {
    if (!streamStr || (!streamStr.includes('BT') && !streamStr.includes('Tj') && !streamStr.includes('TJ'))) {
      return '';
    }

    const lines = [];
    // Match text blocks
    const btRegex = /BT([\s\S]*?)ET/g;
    let btMatch;

    while ((btMatch = btRegex.exec(streamStr)) !== null) {
      const block = btMatch[1];
      let lineText = '';

      // Match Tj (string operand)
      // e.g. (Hello World) Tj or <48656c6c6f> Tj
      const tjRegex = /(?:\((.*?)\)|<([0-9A-Fa-f]+)>)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        if (tjMatch[1] !== undefined) {
          lineText += this.cleanPdfString(tjMatch[1]) + ' ';
        } else if (tjMatch[2] !== undefined) {
          lineText += this.hexToString(tjMatch[2]) + ' ';
        }
      }

      // Match TJ (array operand)
      // e.g. [(Hello) -10 (World)] TJ
      const tjArrRegex = /\[(.*?)\]\s*TJ/g;
      let arrMatch;
      while ((arrMatch = tjArrRegex.exec(block)) !== null) {
        const arrContent = arrMatch[1];
        const innerStrings = arrContent.match(/\((.*?)\)|<([0-9A-Fa-f]+)>/g) || [];
        for (const str of innerStrings) {
          if (str.startsWith('(') && str.endsWith(')')) {
            lineText += this.cleanPdfString(str.slice(1, -1));
          } else if (str.startsWith('<') && str.endsWith('>')) {
            lineText += this.hexToString(str.slice(1, -1));
          }
        }
        lineText += ' ';
      }

      if (lineText.trim()) {
        lines.push(lineText.trim());
      }
    }

    return lines.join('\n');
  }

  static cleanPdfString(str) {
    return str.replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t')
              .replace(/\\\(/g, '(')
              .replace(/\\\)/g, ')')
              .replace(/\\\\/g, '\\');
  }

  static hexToString(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16) || 32);
    }
    return str;
  }

  static async decompressPdfFlate(bytes) {
    if (!bytes || bytes.length < 4) return null;
    // Strip 2-byte zlib header if present (e.g. 0x78 0x9C)
    let payload = bytes;
    if (bytes[0] === 0x78) {
      payload = bytes.subarray(2);
    }
    return await this.decompressRawDeflate(payload);
  }

  static fallbackPdfStringExtraction(rawPdf) {
    const matches = rawPdf.match(/\(([^()]{3,})\)/g) || [];
    const validLines = [];
    for (const m of matches) {
      const clean = m.slice(1, -1).replace(/[^\x20-\x7E\t\n]/g, '').trim();
      if (clean.length > 2 && !clean.includes('%PDF') && !clean.includes('obj')) {
        validLines.push(clean);
      }
    }
    return validLines.join('\n');
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
      degreeLevel: "Bachelor's degree",
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

    // 4. Name Extraction
    let fullName = getRowValue(/^(?:full\s*name|candidate\s*name)[:\s\t]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    let legalFirst = getRowValue(/^(?:legal\s*first\s*name|first\s*name)[:\s\t]+([A-Za-z]+)/i);
    let legalMiddle = getRowValue(/^(?:legal\s*middle\s*name|middle\s*name)[:\s\t]+([A-Za-z]+)/i);
    let legalLast = getRowValue(/^(?:legal\s*last\s*name|last\s*name)[:\s\t]+([A-Za-z]+)/i);
    let preferredName = getRowValue(/^(?:preferred\s*name)[:\s\t]+([A-Za-z\s]+)/i);

    if (!fullName) {
      const genericNameMatch = rawText.match(/(?:full\s*name|candidate\s*name|name)[:\s\t]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
      if (genericNameMatch) {
        fullName = genericNameMatch[1].trim();
      } else {
        // First clean heading line
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          const l = lines[i];
          if (/^[A-Z][a-z]+\s+([A-Z][a-z]+\s+)?[A-Z][a-z]+$/.test(l) && l.split(' ').length >= 2 && l.split(' ').length <= 4 && !l.toLowerCase().includes('resume') && !l.toLowerCase().includes('curriculum')) {
            fullName = l;
            break;
          }
        }
      }
    }

    if (fullName) {
      result.fullName = fullName;
      const parts = fullName.split(' ');
      result.firstName = legalFirst || parts[0] || '';
      result.lastName = legalLast || parts.slice(1).join(' ') || '';
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
      result.degreeLevel = "Master's degree";
      result.degree = "Master of Science in Computer Science";
      result.extractedTags.push({ icon: '📜', label: `Master's (${result.school || 'University'})`, type: 'edu' });
    } else if (textLower.includes('bachelor') || textLower.includes('b.s.') || textLower.includes('b.a.') || textLower.includes('b.sc.')) {
      result.degreeLevel = "Bachelor's degree";
      result.degree = "Bachelor of Science in Computer Science";
      result.extractedTags.push({ icon: '📜', label: `Bachelor's (${result.school || 'University'})`, type: 'edu' });
    } else if (result.school) {
      result.extractedTags.push({ icon: '🏫', label: result.school, type: 'edu' });
    }

    // 9. Technical Skills & Track Alignment
    const hasPython = textLower.includes('python') || textLower.includes('django') || textLower.includes('fastapi') || textLower.includes('flask') || textLower.includes('pytorch');
    const hasDotNet = textLower.includes('.net') || textLower.includes('c#') || textLower.includes('csharp') || textLower.includes('asp.net') || textLower.includes('azure sql');
    const hasPhp = textLower.includes('php') || textLower.includes('laravel') || textLower.includes('symfony');
    const hasJava = textLower.includes('spring boot') || (textLower.includes('java ') && !textLower.includes('javascript'));

    if (hasPython && !hasDotNet) {
      result.targetStack = "Full Stack Python / AI / Cloud";
      result.primaryStackKeywords = ["python", "django", "fastapi", "aws", "postgresql", "react", "ai", "machine learning"];
      result.backendSkills = "Python with FastAPI and Django";
      result.frontendSkills = "React, TypeScript";
      result.dbCloudSkills = "PostgreSQL (including AWS RDS), Redis, Docker, AWS";
      result.extractedTags.push({ icon: '🐍', label: 'Full Stack Python / AI Track', type: 'stack' });
    } else if (hasDotNet) {
      result.targetStack = "Full Stack C# / .NET / Cloud";
      result.primaryStackKeywords = [".net", "c#", "csharp", "dotnet", "asp.net", "azure", "sql server", "cloud"];
      result.backendSkills = "C#, ASP.NET Core, .NET 8, Web API, Entity Framework";
      result.frontendSkills = "React, TypeScript, Angular";
      result.dbCloudSkills = "SQL Server (including Azure SQL), Redis, Azure, Docker";
      result.extractedTags.push({ icon: '🔷', label: 'Full Stack C# / .NET Track', type: 'stack' });
    } else if (hasPhp) {
      result.targetStack = "Full Stack PHP / Laravel / Cloud";
      result.primaryStackKeywords = ["php", "laravel", "symfony", "mysql", "vue", "react", "aws", "docker"];
      result.backendSkills = "PHP 8.x with Laravel, Symfony, REST APIs";
      result.frontendSkills = "Vue.js, Tailwind CSS, React";
      result.dbCloudSkills = "MySQL, PostgreSQL, Redis, AWS";
      result.extractedTags.push({ icon: '🐘', label: 'Full Stack PHP / Laravel Track', type: 'stack' });
    } else {
      result.targetStack = "Full Stack Python / AI / Cloud";
      result.primaryStackKeywords = ["python", "fastapi", "react", "postgresql", "aws", "docker"];
      result.backendSkills = "Python with FastAPI";
      result.frontendSkills = "React, TypeScript";
      result.dbCloudSkills = "PostgreSQL, Redis, AWS, Docker";
      result.extractedTags.push({ icon: '💻', label: 'Full Stack Software Engineer', type: 'stack' });
    }

    // Years of Experience calculation / detection
    const expMatch = rawText.match(/(\d+)\+?\s*years?\s*(?:of)?\s*(?:experience|software|engineering|dev)/i);
    if (expMatch) {
      result.yearsExperience = `${expMatch[1]}+ years`;
      result.extractedTags.push({ icon: '⏱️', label: `${result.yearsExperience} Experience`, type: 'exp' });
    }

    return result;
  }
}

if (typeof window !== 'undefined') {
  window.ResumeDocumentParser = ResumeDocumentParser;
}
