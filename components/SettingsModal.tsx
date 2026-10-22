/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, Volume2, Sparkles, Check, Play, Loader2, RotateCcw, 
  Key, Eye, EyeOff, ShieldCheck, AlertCircle, Trash2, Plus, 
  ExternalLink, CheckCircle2, BarChart2, Radio, Database,
  Globe, Laptop
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AppSettings, GeminiVoiceName, AppVoiceName, ApiKeyEntry } from '../types';
import { generateTts, validateGeminiApiKey } from '../services/geminiService';
import { playGeminiAudio, stopCurrentAudio, speakBrowserText } from '../services/audioPlayer';
import { loadApiKeys, saveApiKey, deleteApiKey, setActiveApiKeyInDB } from '../services/dbService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  totalDocuments?: number;
  estimatedTokens?: number;
  onActiveApiKeyChange?: (key: string | null) => void;
}

const GEMINI_VOICE_OPTIONS: { id: GeminiVoiceName; name: string; desc: string; tone: string }[] = [
  { id: 'Aoede', name: 'Aoede', desc: 'Melodic, clear, and engaging neural voice', tone: 'Clear & Natural' },
  { id: 'Kore', name: 'Kore', desc: 'Warm, reassuring, and pleasant neural voice', tone: 'Warm & Friendly' },
  { id: 'Puck', name: 'Puck', desc: 'Lively, energetic, and expressive neural voice', tone: 'Dynamic & Bright' },
  { id: 'Charon', name: 'Charon', desc: 'Deep, steady, and authoritative neural voice', tone: 'Deep & Calm' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Crisp, articulate, and focused neural voice', tone: 'Crisp & Direct' },
  { id: 'Zephyr', name: 'Zephyr', desc: 'Gentle, smooth, and conversational neural voice', tone: 'Smooth & Relaxed' },
];

export const DEFAULT_CHROME_VOICES: { name: string; lang: string; voiceURI: string }[] = [
  { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English' },
  { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'Google UK English Female' },
  { name: 'Google UK English Male', lang: 'en-GB', voiceURI: 'Google UK English Male' },
  { name: 'Google español', lang: 'es-ES', voiceURI: 'Google español' },
  { name: 'Google français', lang: 'fr-FR', voiceURI: 'Google français' },
  { name: 'Google Deutsch', lang: 'de-DE', voiceURI: 'Google Deutsch' },
  { name: 'Google italiano', lang: 'it-IT', voiceURI: 'Google italiano' },
  { name: 'Google हिन्दी', lang: 'hi-IN', voiceURI: 'Google हिन्दी' },
  { name: 'Google 日本語', lang: 'ja-JP', voiceURI: 'Google 日本語' },
  { name: 'Google 한국어', lang: 'ko-KR', voiceURI: 'Google 한국어' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  voiceName: 'Browser',
  browserVoiceURI: 'Google UK English Female',
  systemPersona: 'You are an intelligent RAG knowledge base assistant. Answer questions thoroughly and accurately using the provided documents in focus. Ground all factual assertions in the referenced texts.',
  userPersona: 'I am a technical researcher exploring knowledge bases and documentation.',
  autoPlayTts: false,
};

const maskApiKey = (key: string): string => {
  if (!key || key.length < 8) return '••••••••';
  const prefix = key.substring(0, 6);
  const suffix = key.substring(Math.max(key.length - 4, 6));
  return `${prefix}••••••••${suffix}`;
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  totalDocuments = 0,
  estimatedTokens = 0,
  onActiveApiKeyChange,
}) => {
  type TabType = 'keys' | 'voice' | 'persona' | 'overview';
  const [activeTab, setActiveTab] = useState<TabType>('keys');

  // Voice & Persona States
  const [selectedVoice, setSelectedVoice] = useState<AppVoiceName>(settings.voiceName || 'Browser');
  const [browserVoiceURI, setBrowserVoiceURI] = useState<string>(settings.browserVoiceURI || '');
  const [availableBrowserVoices, setAvailableBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [persona, setPersona] = useState<string>(settings.systemPersona || DEFAULT_SETTINGS.systemPersona);
  const [userPersona, setUserPersona] = useState<string>(settings.userPersona || DEFAULT_SETTINGS.userPersona);
  const [autoPlay, setAutoPlay] = useState<boolean>(settings.autoPlayTts || false);
  const [testingVoice, setTestingVoice] = useState<string | null>(null);

  // Sync settings whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedVoice(settings.voiceName || 'Browser');
      setBrowserVoiceURI(settings.browserVoiceURI || DEFAULT_SETTINGS.browserVoiceURI || '');
      setPersona(settings.systemPersona || DEFAULT_SETTINGS.systemPersona);
      setUserPersona(settings.userPersona || DEFAULT_SETTINGS.userPersona);
      setAutoPlay(settings.autoPlayTts || false);
    }
  }, [isOpen, settings]);

  // Enumerate browser speech voices (handles Chrome asynchronous voice loading)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const updateVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          setAvailableBrowserVoices(voices);
        }
      };

      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;

      // Chrome frequently populates voices asynchronously without firing onvoiceschanged immediately
      const t1 = setTimeout(updateVoices, 100);
      const t2 = setTimeout(updateVoices, 400);
      const t3 = setTimeout(updateVoices, 1200);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        if (window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, [isOpen]);

  // Gemini API Keys State (Stored in IndexedDB)
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [inputKey, setInputKey] = useState<string>('');
  const [inputLabel, setInputLabel] = useState<string>('');
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);
  const [revalidatingId, setRevalidatingId] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(settings.activeApiKeyId || null);

  // Load API Keys from IndexedDB whenever modal opens
  useEffect(() => {
    if (isOpen) {
      loadKeysFromDb();
      setValidationError(null);
      setValidationSuccess(null);
    }
  }, [isOpen]);

  const loadKeysFromDb = async () => {
    try {
      const storedKeys = await loadApiKeys();
      setApiKeys(storedKeys);
      const active = storedKeys.find(k => k.isActive);
      if (active) {
        setSelectedKeyId(active.id);
      } else if (settings.activeApiKeyId) {
        setSelectedKeyId(settings.activeApiKeyId);
      } else {
        setSelectedKeyId(null);
      }
    } catch (err) {
      console.error("Failed to load API keys from IndexedDB", err);
    }
  };

  if (!isOpen) return null;

  // Add & Validate Key Handler
  const handleValidateAndSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = inputKey.trim();
    if (!cleanKey) {
      setValidationError("Please enter a Gemini API Key.");
      return;
    }

    setIsValidating(true);
    setValidationError(null);
    setValidationSuccess(null);

    try {
      const res = await validateGeminiApiKey(cleanKey);
      if (res.valid) {
        const newEntry: ApiKeyEntry = {
          id: `gemini-key-${Date.now()}`,
          label: inputLabel.trim() || `Gemini Key ${apiKeys.length + 1}`,
          key: cleanKey,
          createdAt: new Date().toISOString(),
          lastValidated: new Date().toISOString(),
          isValid: true,
          isActive: true,
        };

        // Persist to IndexedDB
        await saveApiKey(newEntry);
        await setActiveApiKeyInDB(newEntry.id);

        const updatedKeys = await loadApiKeys();
        setApiKeys(updatedKeys);
        setSelectedKeyId(newEntry.id);

        // Notify parent application
        if (onActiveApiKeyChange) {
          onActiveApiKeyChange(newEntry.key);
        }

        setInputKey('');
        setInputLabel('');
        setValidationSuccess(`API Key "${newEntry.label}" validated successfully and saved to IndexedDB!`);
      } else {
        setValidationError(res.error || "API Key validation failed. Please check that your key is valid and has Gemini API enabled.");
      }
    } catch (err: any) {
      setValidationError(err?.message || "Failed to reach validation service. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  // Switch Active Key
  const handleSetActiveKey = async (keyId: string | null) => {
    try {
      setSelectedKeyId(keyId);
      await setActiveApiKeyInDB(keyId);
      const updatedKeys = await loadApiKeys();
      setApiKeys(updatedKeys);

      const activeEntry = updatedKeys.find(k => k.id === keyId);
      if (onActiveApiKeyChange) {
        onActiveApiKeyChange(activeEntry ? activeEntry.key : null);
      }
    } catch (err) {
      console.error("Failed to update active key in IndexedDB", err);
    }
  };

  // Re-verify existing key
  const handleRevalidateKey = async (entry: ApiKeyEntry) => {
    setRevalidatingId(entry.id);
    try {
      const res = await validateGeminiApiKey(entry.key);
      const updatedEntry: ApiKeyEntry = {
        ...entry,
        isValid: res.valid,
        lastValidated: new Date().toISOString(),
      };
      await saveApiKey(updatedEntry);
      const updatedKeys = await loadApiKeys();
      setApiKeys(updatedKeys);
    } catch (err) {
      console.error("Revalidation failed", err);
    } finally {
      setRevalidatingId(null);
    }
  };

  // Delete Key from IndexedDB
  const handleDeleteKey = async (id: string) => {
    try {
      await deleteApiKey(id);
      const updatedKeys = await loadApiKeys();
      setApiKeys(updatedKeys);
      if (selectedKeyId === id) {
        setSelectedKeyId(null);
        await setActiveApiKeyInDB(null);
        if (onActiveApiKeyChange) {
          onActiveApiKeyChange(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete key from IndexedDB", err);
    }
  };

  const handleTestVoice = async (voice: AppVoiceName, customVoiceURI?: string) => {
    if (testingVoice) {
      stopCurrentAudio();
      setTestingVoice(null);
      return;
    }

    setTestingVoice(voice);
    try {
      if (voice === 'Browser') {
        const sampleText = "Hello, I am your AI assistant.";
        await speakBrowserText(sampleText, customVoiceURI || browserVoiceURI);
      } else {
        const sampleText = `Hello! I am ${voice}, your Gemini neural voice assistant. I am ready to explore your knowledge base.`;
        const res = await generateTts(sampleText, voice);
        if (res.audio) {
          await playGeminiAudio(res.audio, res.mimeType);
        }
      }
    } catch (err) {
      console.warn("Test voice failed, using browser synthesis fallback", err);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utt = new SpeechSynthesisUtterance("Hello, I am your AI assistant.");
        window.speechSynthesis.speak(utt);
      }
    } finally {
      setTestingVoice(null);
    }
  };

  const handleSave = () => {
    stopCurrentAudio();
    onSaveSettings({
      voiceName: selectedVoice,
      browserVoiceURI: browserVoiceURI || undefined,
      systemPersona: persona,
      userPersona: userPersona,
      autoPlayTts: autoPlay,
      activeApiKeyId: selectedKeyId || undefined,
    });
    onClose();
  };

  const handleReset = () => {
    setSelectedVoice(DEFAULT_SETTINGS.voiceName);
    setBrowserVoiceURI('');
    setPersona(DEFAULT_SETTINGS.systemPersona);
    setUserPersona(DEFAULT_SETTINGS.userPersona);
    setAutoPlay(DEFAULT_SETTINGS.autoPlayTts);
  };

  const activeKeyEntry = apiKeys.find(k => k.id === selectedKeyId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 bg-black/80 backdrop-blur-md">
      <div className="bg-[#1C1C1C] w-full h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">App Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-[#A8ABB4] hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar Tabs */}
            <div className="w-64 border-r border-white/10 flex flex-col p-2 space-y-1">
                <button
                    type="button"
                    onClick={() => setActiveTab('keys')}
                    className={`py-3 px-4 text-sm font-medium rounded-lg transition-colors flex items-center gap-3 ${
                    activeTab === 'keys'
                        ? 'bg-[#79B8FF]/10 text-[#79B8FF]'
                        : 'text-[#A8ABB4] hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Key size={16} />
                    <span>Gemini API Keys</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('voice')}
                    className={`py-3 px-4 text-sm font-medium rounded-lg transition-colors flex items-center gap-3 ${
                    activeTab === 'voice'
                        ? 'bg-[#79B8FF]/10 text-[#79B8FF]'
                        : 'text-[#A8ABB4] hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Volume2 size={16} />
                    <span>AI Voice & Audio</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('persona')}
                    className={`py-3 px-4 text-sm font-medium rounded-lg transition-colors flex items-center gap-3 ${
                    activeTab === 'persona'
                        ? 'bg-[#79B8FF]/10 text-[#79B8FF]'
                        : 'text-[#A8ABB4] hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Sparkles size={16} />
                    <span>RAG Persona</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className={`py-3 px-4 text-sm font-medium rounded-lg transition-colors flex items-center gap-3 ${
                    activeTab === 'overview'
                        ? 'bg-[#79B8FF]/10 text-[#79B8FF]'
                        : 'text-[#A8ABB4] hover:text-white hover:bg-white/5'
                    }`}
                >
                    <BarChart2 size={16} />
                    <span>Overview & Stats</span>
                </button>
            </div>
            
            {/* Tab Body */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1 text-sm text-[#E2E2E2]">
          
          {/* TAB 1: GEMINI API KEYS & CREDENTIALS */}
          {activeTab === 'keys' && (
            <div className="space-y-5">
              {/* Active Key Status Card */}
              <div className="p-3.5 rounded-xl border bg-[#252525] border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    activeKeyEntry ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[#79B8FF]/20 text-[#79B8FF] border border-[#79B8FF]/30'
                  }`}>
                    <Key size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">Active Gemini Credential:</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        activeKeyEntry ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {activeKeyEntry ? 'User Custom Key (IndexedDB)' : 'System Environment Default'}
                      </span>
                    </div>
                    <p className="text-xs text-[#A8ABB4] mt-0.5">
                      {activeKeyEntry 
                        ? `Using "${activeKeyEntry.label}" (${maskApiKey(activeKeyEntry.key)}) for RAG generation and voice.`
                        : 'Using default backend API credentials. Add your own key below to use custom quota.'}
                    </p>
                  </div>
                </div>

                {activeKeyEntry && (
                  <button
                    type="button"
                    onClick={() => handleSetActiveKey(null)}
                    className="text-xs px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-[#A8ABB4] hover:text-white border border-white/10 transition-colors shrink-0"
                    title="Switch back to system environment default key"
                  >
                    Use System Default
                  </button>
                )}
              </div>

              {/* Add New Gemini API Key Form */}
              <form onSubmit={handleValidateAndSaveKey} className="bg-[#262626] border border-white/10 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus size={16} className="text-[#79B8FF]" />
                    <h4 className="font-semibold text-xs text-white uppercase tracking-wider">
                      Add & Validate Gemini API Key
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#A8ABB4]">
                    <Database size={12} className="text-[#79B8FF]" />
                    <span>Stored locally in IndexedDB</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white mb-1">
                    Gemini API Key <span className="text-[#79B8FF]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeyInput ? "text" : "password"}
                      value={inputKey}
                      onChange={(e) => {
                        setInputKey(e.target.value);
                        if (validationError) setValidationError(null);
                        if (validationSuccess) setValidationSuccess(null);
                      }}
                      placeholder="AIzaSy..."
                      className="w-full pr-20 pl-3 py-2.5 bg-[#1E1E1E] border border-white/15 rounded-lg text-xs text-white placeholder-[#777] focus:ring-1 focus:ring-[#79B8FF] focus:border-[#79B8FF] outline-none font-mono"
                      autoComplete="off"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[#A8ABB4]">
                      <button
                        type="button"
                        onClick={() => setShowKeyInput(!showKeyInput)}
                        className="p-1 hover:text-white rounded transition-colors"
                        title={showKeyInput ? "Hide API Key" : "Show API Key"}
                      >
                        {showKeyInput ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      {inputKey && (
                        <button
                          type="button"
                          onClick={() => setInputKey('')}
                          className="p-1 hover:text-white rounded transition-colors"
                          title="Clear field"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white mb-1">
                    Key Label / Identifier (Optional)
                  </label>
                  <input
                    type="text"
                    value={inputLabel}
                    onChange={(e) => setInputLabel(e.target.value)}
                    placeholder="e.g., Personal AI Studio Pro, Barb Research Key"
                    className="w-full px-3 py-2 bg-[#1E1E1E] border border-white/15 rounded-lg text-xs text-white placeholder-[#777] focus:ring-1 focus:ring-[#79B8FF] focus:border-[#79B8FF] outline-none"
                  />
                </div>

                {/* Validation Feedback Messages */}
                {validationError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                    <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
                    <div>
                      <span className="font-semibold">Validation Failed: </span>
                      <span>{validationError}</span>
                    </div>
                  </div>
                )}

                {validationSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-400" />
                    <div>
                      <span className="font-semibold">Success: </span>
                      <span>{validationSuccess}</span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-1">
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#79B8FF] hover:underline flex items-center gap-1"
                  >
                    <span>Get a Gemini API Key</span>
                    <ExternalLink size={12} />
                  </a>

                  <button
                    type="submit"
                    disabled={isValidating || !inputKey.trim()}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                      isValidating || !inputKey.trim()
                        ? 'bg-white/10 text-white/40 cursor-not-allowed'
                        : 'bg-[#79B8FF] hover:bg-[#68a7f0] text-black shadow-sm'
                    }`}
                  >
                    {isValidating ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Validating with Google AI...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={14} />
                        <span>Validate & Save Key</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Saved Keys List */}
              <div>
                <h4 className="font-semibold text-xs text-[#A8ABB4] uppercase tracking-wider mb-2.5 flex items-center justify-between">
                  <span>Saved Keys in IndexedDB ({apiKeys.length})</span>
                  <span className="text-[11px] font-normal normal-case text-[#A8ABB4]/80">
                    Click radio to set active key
                  </span>
                </h4>

                {apiKeys.length === 0 ? (
                  <div className="p-5 rounded-xl border border-dashed border-white/10 text-center text-xs text-[#A8ABB4] bg-[#222]">
                    <Key size={24} className="mx-auto mb-2 text-[#79B8FF]/60" />
                    <p className="font-medium text-white mb-0.5">No custom Gemini API keys saved yet</p>
                    <p>Enter and validate a key above. It will be stored in your browser's IndexedDB.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Option to use default */}
                    <div
                      onClick={() => handleSetActiveKey(null)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                        selectedKeyId === null
                          ? 'border-[#79B8FF] bg-[#79B8FF]/10 text-white shadow-xs'
                          : 'border-white/5 bg-[#252525] hover:bg-[#2A2A2A] text-[#A8ABB4]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          selectedKeyId === null ? 'border-[#79B8FF] bg-[#79B8FF]' : 'border-[#666]'
                        }`}>
                          {selectedKeyId === null && <Check size={12} className="text-black stroke-[3]" />}
                        </div>
                        <div>
                          <div className="font-medium text-xs text-white">System Default Credentials</div>
                          <div className="text-[11px] text-[#A8ABB4]">Use server-provided environment API key</div>
                        </div>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-[#A8ABB4]">
                        Default
                      </span>
                    </div>

                    {/* Saved Keys */}
                    {apiKeys.map((entry) => {
                      const isSelected = selectedKeyId === entry.id;
                      const isTesting = revalidatingId === entry.id;

                      return (
                        <div
                          key={entry.id}
                          onClick={() => handleSetActiveKey(entry.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-[#79B8FF] bg-[#79B8FF]/10 text-white shadow-xs'
                              : 'border-white/5 bg-[#252525] hover:bg-[#2A2A2A] text-[#E2E2E2]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-[#79B8FF] bg-[#79B8FF]' : 'border-[#666]'
                            }`}>
                              {isSelected && <Check size={12} className="text-black stroke-[3]" />}
                            </div>

                            <div className="min-w-0">
                              <div className="font-medium text-xs text-white flex items-center gap-2">
                                <span className="truncate">{entry.label}</span>
                                {entry.isValid && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-medium shrink-0 flex items-center gap-1">
                                    <Check size={10} /> Valid
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-[#A8ABB4] truncate mt-0.5">
                                {maskApiKey(entry.key)}
                              </div>
                              <div className="text-[10px] text-[#A8ABB4]/60 mt-0.5">
                                Added {new Date(entry.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleRevalidateKey(entry)}
                              disabled={isTesting}
                              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-xs text-white transition-colors flex items-center gap-1"
                              title="Re-verify this key against Google AI"
                            >
                              {isTesting ? (
                                <Loader2 size={12} className="animate-spin text-[#79B8FF]" />
                              ) : (
                                <ShieldCheck size={12} className="text-[#79B8FF]" />
                              )}
                              <span className="hidden sm:inline">Test</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteKey(entry.id)}
                              className="p-1.5 rounded hover:bg-red-500/20 text-[#A8ABB4] hover:text-red-400 transition-colors"
                              title="Delete key from IndexedDB"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AI VOICE & AUDIO */}
          {activeTab === 'voice' && (
            <div className="space-y-5">
              <div>
                <label className="font-medium text-sm text-white flex items-center gap-1.5 mb-1">
                  <span>Voice Engine & Persona</span>
                  <span className="text-xs text-[#79B8FF] font-normal">Active for Read Aloud & Answers</span>
                </label>
                <p className="text-xs text-[#A8ABB4] mb-3">
                  Choose between your native browser voice (default, instant, and offline-capable) or cloud-synthesized Gemini neural voices.
                </p>

                <div className="grid grid-cols-1 gap-2.5">
                  {/* OPTION 1: BROWSER VOICE (DEFAULT ENGINE & CHROME VOICES DROPDOWN) */}
                  <div
                    onClick={() => setSelectedVoice('Browser')}
                    className={`p-3.5 sm:p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedVoice === 'Browser'
                        ? 'border-[#79B8FF] bg-[#79B8FF]/10 text-white shadow-xs'
                        : 'border-[rgba(255,255,255,0.06)] bg-[#2C2C2C] hover:bg-[#343434] text-[#E2E2E2]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                          selectedVoice === 'Browser' ? 'border-[#79B8FF] bg-[#79B8FF]' : 'border-[#666]'
                        }`}>
                          {selectedVoice === 'Browser' && <Check size={12} className="text-black stroke-[3]" />}
                        </div>
                        <div>
                          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                            <span>Browser Voice</span>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                              Default Native Engine
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-white/10 text-[#A8ABB4]">
                              Zero Quota · Instant Playback
                            </span>
                          </div>
                          <p className="text-xs text-[#A8ABB4] mt-1">
                            Plays aloud using Google Chrome's built-in Web Speech API without API costs, tokens, or latency.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestVoice('Browser');
                        }}
                        className="px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium text-[#E2E2E2] flex items-center gap-1.5 transition-colors shrink-0"
                        title="Preview browser voice sample audio"
                      >
                        {testingVoice === 'Browser' ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-[#79B8FF]" />
                            <span>Speaking</span>
                          </>
                        ) : (
                          <>
                            <Play size={13} className="text-[#79B8FF]" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* SELECTABLE DROPDOWN LIST FOR DEFAULT BROWSER VOICES IN CHROME */}
                    <div 
                      className="mt-3.5 pt-3.5 border-t border-white/10 space-y-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <label 
                          htmlFor="chrome-voice-select" 
                          className="text-xs text-[#E2E2E2] flex items-center gap-1.5 font-medium"
                        >
                          <Laptop size={13} className="text-[#79B8FF]" />
                          <span>Default Chrome Browser Voices:</span>
                        </label>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#A8ABB4]">
                            {availableBrowserVoices.length > 0
                              ? `${availableBrowserVoices.length} voices available`
                              : 'Chrome standard voices'}
                          </span>
                          {typeof window !== 'undefined' && 'speechSynthesis' in window && (
                            <button
                              type="button"
                              onClick={() => {
                                const voices = window.speechSynthesis.getVoices();
                                if (voices && voices.length > 0) {
                                  setAvailableBrowserVoices(voices);
                                }
                              }}
                              className="text-[11px] text-[#79B8FF] hover:text-white flex items-center gap-1 p-0.5 rounded hover:bg-white/10 transition-colors"
                              title="Re-scan browser voices"
                            >
                              <RotateCcw size={11} />
                              <span>Refresh</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          id="chrome-voice-select"
                          value={browserVoiceURI || 'Google UK English Female'}
                          onChange={(e) => {
                            setBrowserVoiceURI(e.target.value);
                            setSelectedVoice('Browser');
                          }}
                          className="bg-[#1F1F1F] text-xs text-white border border-white/20 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#79B8FF] focus:border-[#79B8FF] outline-hidden flex-1 min-w-0 cursor-pointer transition-colors"
                        >
                          <option value="Google UK English Female">
                            ★ Google UK English Female (System Default)
                          </option>

                          {availableBrowserVoices.length > 0 ? (
                            <>
                              {/* Female Browser voices */}
                              {availableBrowserVoices.some(v => v.name.toLowerCase().includes('female')) && (
                                <optgroup label="Female Browser Voices">
                                  {availableBrowserVoices
                                    .filter(v => v.name.toLowerCase().includes('female'))
                                    .map((voice) => (
                                      <option key={voice.voiceURI} value={voice.voiceURI}>
                                        {voice.name} ({voice.lang})
                                      </option>
                                    ))}
                                </optgroup>
                              )}
                            </>
                          ) : (
                            <optgroup label="Standard Chrome Voices">
                              {DEFAULT_CHROME_VOICES.filter(v => v.name.toLowerCase().includes('female')).map((voice) => (
                                <option key={voice.voiceURI} value={voice.voiceURI}>
                                  {voice.name} ({voice.lang})
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTestVoice('Browser', browserVoiceURI);
                          }}
                          className="px-3 py-2 rounded-lg bg-[#79B8FF]/20 hover:bg-[#79B8FF]/30 text-xs font-medium text-[#79B8FF] hover:text-white border border-[#79B8FF]/40 flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs"
                          title="Test selected browser voice with a short sample phrase"
                        >
                          {testingVoice === 'Browser' ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-[#79B8FF]" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <Play size={13} className="text-[#79B8FF]" />
                              <span>Test</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#A8ABB4] pt-0.5">
                        <span className="truncate max-w-[320px]">
                          {browserVoiceURI ? (
                            <>
                              Active: <span className="text-[#E2E2E2] font-medium">{browserVoiceURI}</span>
                            </>
                          ) : (
                            'Active: Chrome System Default'
                          )}
                        </span>
                        {browserVoiceURI && (
                          <button
                            type="button"
                            onClick={() => {
                              setBrowserVoiceURI('');
                              setSelectedVoice('Browser');
                            }}
                            className="text-[#79B8FF] hover:underline shrink-0 ml-2"
                          >
                            Reset to Default
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* DIVIDER / SECTION LABEL FOR GEMINI NEURAL VOICES */}
                  <div className="pt-2">
                    <span className="text-[11px] font-semibold text-[#A8ABB4] uppercase tracking-wider">
                      Gemini Neural Studio Voices
                    </span>
                  </div>

                  {/* GEMINI VOICES LIST */}
                  {GEMINI_VOICE_OPTIONS.map((v) => {
                    const isSelected = selectedVoice === v.id;
                    const isTesting = testingVoice === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVoice(v.id)}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-[#79B8FF] bg-[#79B8FF]/10 text-white shadow-xs'
                            : 'border-[rgba(255,255,255,0.06)] bg-[#2C2C2C] hover:bg-[#343434] text-[#E2E2E2]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-[#79B8FF] bg-[#79B8FF]' : 'border-[#666]'}`}>
                            {isSelected && <Check size={12} className="text-black stroke-[3]" />}
                          </div>
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              <span>{v.name}</span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-[#A8ABB4]">
                                {v.tone}
                              </span>
                            </div>
                            <p className="text-xs text-[#A8ABB4] mt-0.5">{v.desc}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTestVoice(v.id);
                          }}
                          className="px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium text-[#E2E2E2] flex items-center gap-1.5 transition-colors shrink-0"
                          title="Preview sample audio"
                        >
                          {isTesting ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-[#79B8FF]" />
                              <span>Playing</span>
                            </>
                          ) : (
                            <>
                              <Play size={13} className="text-[#79B8FF]" />
                              <span>Preview</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Auto-Play Option */}
              <div className="flex items-center justify-between p-3.5 bg-[#2C2C2C] border border-[rgba(255,255,255,0.06)] rounded-lg">
                <div>
                  <span className="font-medium text-sm text-white">Auto-Read AI Replies</span>
                  <p className="text-xs text-[#A8ABB4] mt-0.5">
                    Automatically speak incoming written answers aloud in the selected voice.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoPlay(!autoPlay)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${autoPlay ? 'bg-[#79B8FF]' : 'bg-[#4A4A4A]'}`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${autoPlay ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SYSTEM PERSONA & PROMPT */}
          {activeTab === 'persona' && (
            <div className="space-y-5">
              {/* RAG Persona / System Prompt */}
              <div>
                <label className="block font-medium text-sm text-white mb-1">
                  RAG Knowledge Base Persona / Instructions
                </label>
                <p className="text-xs text-[#A8ABB4] mb-2">
                  Custom instructions guiding how the agent analyzes and cites your active documents.
                </p>
                <textarea
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  rows={4}
                  className="w-full p-3 bg-[#2C2C2C] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-[#E2E2E2] placeholder-[#777] focus:ring-1 focus:ring-[#79B8FF] focus:border-[#79B8FF] outline-none transition-colors"
                  placeholder="e.g., You are a meticulous technical documentation assistant..."
                />
              </div>

              {/* User Persona / Background Metadata Field */}
              <div>
                <label className="block font-medium text-sm text-white mb-1">
                  User Persona / Background (Dedicated Metadata Field)
                </label>
                <p className="text-xs text-[#A8ABB4] mb-2">
                  Persistent user background context sent with every request so the agent tailors responses to your role.
                </p>
                <textarea
                  value={userPersona}
                  onChange={(e) => setUserPersona(e.target.value)}
                  rows={3}
                  className="w-full p-3 bg-[#2C2C2C] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-[#E2E2E2] placeholder-[#777] focus:ring-1 focus:ring-[#79B8FF] focus:border-[#79B8FF] outline-none transition-colors"
                  placeholder="e.g., Senior Software Architect specializing in distributed systems..."
                />
              </div>
            </div>
          )}

          {/* TAB 4: SESSION SUMMARY & STATS */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="bg-[#252525] border border-[rgba(255,255,255,0.08)] rounded-xl p-4">
                <h4 className="font-semibold text-xs text-[#A8ABB4] uppercase tracking-wider mb-3">
                  Session Summary Dashboard
                </h4>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-[#1E1E1E] p-3.5 rounded-lg border border-white/5">
                    <span className="text-2xl font-bold text-white">{totalDocuments}</span>
                    <p className="text-xs text-[#A8ABB4] mt-0.5">Documents Processed</p>
                  </div>
                  <div className="bg-[#1E1E1E] p-3.5 rounded-lg border border-white/5">
                    <span className="text-2xl font-bold text-[#79B8FF]">{estimatedTokens.toLocaleString()}</span>
                    <p className="text-xs text-[#A8ABB4] mt-0.5">Est. Tokens Used</p>
                  </div>
                </div>
                
                {/* Token Usage Gauge */}
                <div className="h-40 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Used', value: estimatedTokens },
                          { name: 'Remaining', value: Math.max(0, 100000 - estimatedTokens) }
                        ]}
                        cx="50%"
                        cy="100%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#79B8FF" />
                        <Cell fill="#333" />
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#1E1E1E', border: 'none', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-center text-xs text-[#A8ABB4] -mt-6">
                  {Math.min(100, Math.round((estimatedTokens / 100000) * 100))}% of context limit
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/5 bg-[#252525] space-y-2 text-xs text-[#A8ABB4]">
                <div className="font-semibold text-white">Browser Local Storage Architecture</div>
                <p>• Knowledge base document groups are saved persistently in IndexedDB.</p>
                <p>• Past chat sessions and message history are indexed in IndexedDB.</p>
                <p>• Gemini API keys are validated against Google AI endpoints and stored locally in IndexedDB.</p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[rgba(255,255,255,0.08)] bg-[#252525] flex justify-between items-center">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 text-xs text-[#A8ABB4] hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw size={14} />
            <span>Reset Defaults</span>
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                stopCurrentAudio();
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-[#3A3A3A] hover:bg-[#454545] text-xs font-medium text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-[#79B8FF] hover:bg-[#68a7f0] text-xs font-semibold text-black transition-colors"
            >
              Save Preferences
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
