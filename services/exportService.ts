/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatMessage, MessageSender, LocalFile, AppSettings } from '../types';

export interface ExportMarkdownOptions {
  chatMessages: ChatMessage[];
  files?: LocalFile[];
  groupName?: string;
  appSettings?: AppSettings;
}

/**
 * Calculates approximate word count for a given text.
 */
function getWordCount(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Generates a comprehensive Markdown document containing:
 * 1. Export & Session Metadata (Collection, Personas, Timestamps, Voice settings)
 * 2. Document Context Summaries & File Metadata (Name, Focus Status, Word Count, Character Count, Summary, and Excerpts)
 * 3. Complete Conversation Transcript (Timestamps, Senders, Tags, Pins, Reactions, Text, and Citations)
 */
export function generateChatExportMarkdown(options: ExportMarkdownOptions): string {
  const { chatMessages, files = [], groupName = 'Default Knowledge Base', appSettings } = options;

  const now = new Date();
  const formattedDate = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const focusedFiles = files.filter(f => f.inFocus !== false);
  const totalFileWords = files.reduce((acc, f) => acc + getWordCount(f.content || ''), 0);
  const totalFileChars = files.reduce((acc, f) => acc + (f.content?.length || 0), 0);

  let md = `# 💬 Chat Export & Knowledge Base Dossier\n\n`;

  // Section 1: Executive Session Metadata
  md += `## 📋 Session & Environment Metadata\n\n`;
  md += `- **Export Generated:** ${formattedDate} at ${formattedTime}\n`;
  md += `- **Knowledge Base Collection:** ${groupName}\n`;
  md += `- **Total Documents Attached:** ${files.length} (${focusedFiles.length} active in RAG focus)\n`;
  md += `- **Knowledge Base Volume:** ${totalFileWords.toLocaleString()} words / ${totalFileChars.toLocaleString()} characters\n`;
  md += `- **Total Chat Messages:** ${chatMessages.length}\n`;

  if (appSettings) {
    if (appSettings.systemPersona) {
      md += `- **System / RAG Persona:** ${appSettings.systemPersona}\n`;
    }
    if (appSettings.userPersona) {
      md += `- **User Background Context:** ${appSettings.userPersona}\n`;
    }
    if (appSettings.voiceName) {
      const voiceDetail = appSettings.voiceName === 'Browser' 
        ? `Browser Native Speech (${appSettings.browserVoiceURI || 'Default Voice'})`
        : `Gemini Neural Voice (${appSettings.voiceName})`;
      md += `- **Voice Engine Configuration:** ${voiceDetail}\n`;
    }
  }

  md += `\n---\n\n`;

  // Section 2: Document Context Summaries & File Metadata
  md += `## 📚 Knowledge Base Documents & Context Summaries\n\n`;

  if (files.length === 0) {
    md += `*No documents were attached to this knowledge base collection at the time of export.*\n\n`;
  } else {
    md += `### Quick Overview Table\n\n`;
    md += `| Document Name | RAG Focus Status | Words | Characters | Summary Preview |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    files.forEach(f => {
      const isFocused = f.inFocus !== false;
      const statusBadge = isFocused ? '✅ In Focus' : '⚪ Excluded';
      const words = getWordCount(f.content || '');
      const chars = (f.content || '').length;
      const summaryText = f.summary ? f.summary.replace(/\n+/g, ' ').slice(0, 80) + '...' : 'No summary generated';
      md += `| **${f.name}** | ${statusBadge} | ${words.toLocaleString()} | ${chars.toLocaleString()} | ${summaryText} |\n`;
    });

    md += `\n### Detailed Document Summaries & Metadata\n\n`;

    files.forEach((f, idx) => {
      const isFocused = f.inFocus !== false;
      const words = getWordCount(f.content || '');
      const chars = (f.content || '').length;

      md += `#### ${idx + 1}. 📄 ${f.name}\n\n`;
      md += `- **RAG Focus Status:** ${isFocused ? '✅ Active in RAG Grounding Focus' : '⚪ Excluded from Grounding Focus'}\n`;
      md += `- **Document Size:** ${words.toLocaleString()} words (${chars.toLocaleString()} characters)\n`;
      
      if (f.summary && f.summary.trim()) {
        md += `- **Document Summary:**\n\n> ${f.summary.trim().replace(/\n/g, '\n> ')}\n\n`;
      } else {
        md += `- **Document Summary:** *No automated summary generated yet.*\n\n`;
      }

      // Preview Excerpt (up to 400 chars)
      if (f.content && f.content.trim()) {
        const cleanContent = f.content.trim().slice(0, 400);
        md += `**Document Beginning Excerpt:**\n\`\`\`text\n${cleanContent}${f.content.length > 400 ? '\n...[content continues]' : ''}\n\`\`\`\n\n`;
      }
    });
  }

  md += `---\n\n`;

  // Section 3: Conversation History & Messages
  md += `## 💬 Conversation Transcript\n\n`;

  if (chatMessages.length === 0) {
    md += `*No conversation messages recorded.*\n`;
  } else {
    chatMessages.forEach((msg, idx) => {
      const senderLabel = msg.sender === MessageSender.USER
        ? 'User'
        : (msg.sender === MessageSender.MODEL ? 'Assistant (AI Agent)' : 'System');

      const timeString = new Date(msg.timestamp).toLocaleString();
      const pinLabel = msg.isPinned ? ' 📌 [PINNED]' : '';

      md += `### ${idx + 1}. [${timeString}] ${senderLabel}${pinLabel}\n\n`;

      if (msg.tags && msg.tags.length > 0) {
        md += `> **Tags:** ${msg.tags.join(', ')}\n\n`;
      }

      if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        const reactionStr = Object.entries(msg.reactions)
          .map(([emoji, count]) => `${emoji} ${count}`)
          .join(' · ');
        md += `> **Reactions:** ${reactionStr}\n\n`;
      }

      md += `${msg.text || '*Empty message*'}\n\n`;

      // Citations / Grounded Sources
      if (msg.citations && msg.citations.length > 0) {
        md += `#### 📖 Grounded Source Excerpts\n`;
        msg.citations.forEach((cit, cIdx) => {
          const citNum = cit.id || cIdx + 1;
          const fileName = cit.fileName || cit.title || `Document ${citNum}`;
          md += `- **[${citNum}] ${fileName}**:\n  > "${(cit.snippet || '').trim().replace(/\n/g, '\n  > ')}"\n`;
        });
        md += `\n`;
      }

      // Retrieved URL Context
      if (msg.urlContext && msg.urlContext.length > 0) {
        md += `#### 🌐 Grounded Web References\n`;
        msg.urlContext.forEach(u => {
          md += `- [${u.title || u.retrievedUrl}](${u.retrievedUrl})\n`;
        });
        md += `\n`;
      }

      md += `---\n\n`;
    });
  }

  return md;
}
