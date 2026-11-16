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
        ? chrome.runtime.getURL('ai/lib/pdf.min.mjs')
        : './lib/pdf.min.mjs';
      const module = await import(pdfUrl);
      if (typeof window !== 'undefined') {
        window.pdfjsLib = module;
      }
      if (module.GlobalWorkerOptions) {
        module.GlobalWorkerOptions.workerSrc = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
          ? chrome.runtime.getURL('ai/lib/pdf.worker.min.mjs')
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
        throw new Error("PDF.js engine is not available. Please verify ai/lib/pdf.min.mjs is present.");
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

}
window.ResumeDocumentParser = ResumeDocumentParser;
