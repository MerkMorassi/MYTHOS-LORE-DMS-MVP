/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as mammoth from 'mammoth';

/**
 * Supported file extensions for document ingestion
 */
export const SUPPORTED_FILE_EXTENSIONS = [
  '.txt', '.md', '.markdown',
  '.pdf',
  '.docx',
  '.csv', '.tsv',
  '.json', '.xml', '.html',
  '.py', '.js', '.ts', '.tsx', '.jsx',
  '.yaml', '.yml', '.sql', '.log'
];

export const ACCEPTED_FILE_TYPES_STRING = SUPPORTED_FILE_EXTENSIONS.join(',');

/**
 * Extracts plain text from a PDF file using pdfjs-dist.
 */
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  
  try {
    // Set worker URL using modern ES module worker location
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  } catch (e) {
    // Fallback CDN if relative URL fails in specific sandbox
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  const numPages = pdf.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ')
      .trim();

    if (numPages > 1) {
      fullText += `\n[--- Page ${pageNum} of ${numPages} ---]\n${pageText}\n`;
    } else {
      fullText += pageText + '\n';
    }
  }

  return fullText.trim();
}

/**
 * Extracts plain text from a Microsoft Word (.docx) file using mammoth.
 */
async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value || '').trim();
}

/**
 * Ingests and extracts clean, searchable text from any supported file format.
 */
export async function parseDocumentFile(file: File): Promise<string> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.pdf')) {
    const text = await extractPdfText(file);
    if (!text || text.trim().length === 0) {
      throw new Error("PDF contains no selectable text (may be a scanned image).");
    }
    return text;
  }

  if (lowerName.endsWith('.docx')) {
    const text = await extractDocxText(file);
    if (!text || text.trim().length === 0) {
      throw new Error("Word document contains no extractable text.");
    }
    return text;
  }

  // Plain text, Markdown, CSV, TSV, JSON, Code, etc.
  const rawText = await file.text();
  return rawText;
}
