/**
 * Audio playback helper for Gemini TTS and Web Audio PCM streams.
 */

let currentAudio: HTMLAudioElement | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentAudioCtx: AudioContext | null = null;

export const stopCurrentAudio = () => {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {}
    currentAudio = null;
  }
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
    } catch (e) {}
    currentSourceNode = null;
  }
  if (currentAudioCtx && currentAudioCtx.state !== 'closed') {
    try {
      currentAudioCtx.close().catch(() => {});
    } catch (e) {}
    currentAudioCtx = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app_audio_stopped'));
  }
};

/**
 * Speaks text using the browser's built-in Web Speech API (speechSynthesis).
 * Allows specifying a voiceURI or uses the browser default voice.
 */
export const speakBrowserText = (text: string, voiceURI?: string): Promise<void> => {
  stopCurrentAudio();

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return reject(new Error('Web Speech Synthesis is not supported in this browser.'));
    }

    try {
      // Resume if paused
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(text);

      if (voiceURI) {
        const voices = window.speechSynthesis.getVoices();
        const matched = voices.find(v => v.voiceURI === voiceURI || v.name === voiceURI);
        if (matched) {
          utterance.voice = matched;
        }
      }

      utterance.onend = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('app_audio_stopped'));
        }
        resolve();
      };

      utterance.onerror = (e) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('app_audio_stopped'));
        }
        // If canceled explicitly, resolve gracefully
        if (e.error === 'canceled' || e.error === 'interrupted') {
          resolve();
        } else {
          console.warn('Browser speech synthesis error:', e);
          resolve();
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Failed to speak via browser synthesis:', err);
      reject(err);
    }
  });
};

export const playGeminiAudio = async (base64Data: string, mimeType = 'audio/mp3'): Promise<void> => {
  stopCurrentAudio();

  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio(`data:${mimeType};base64,${base64Data}`);
      currentAudio = audio;

      audio.onended = () => {
        currentAudio = null;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('app_audio_stopped'));
        }
        resolve();
      };

      audio.onerror = () => {
        // Fallback to PCM audio decoding if HTML5 Audio fails
        playPcmAudio(base64Data).then(resolve).catch(reject);
      };

      audio.play().catch(() => {
        playPcmAudio(base64Data).then(resolve).catch(reject);
      });
    } catch (err) {
      playPcmAudio(base64Data).then(resolve).catch(reject);
    }
  });
};

export const playPcmAudio = async (base64Pcm: string, sampleRate = 24000): Promise<void> => {
  stopCurrentAudio();

  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtxClass) throw new Error("AudioContext not supported");

  const ctx = new AudioCtxClass({ sampleRate });
  currentAudioCtx = ctx;

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  try {
    const binary = atob(base64Pcm);
    const f32 = new Float32Array(binary.length / 2);
    for (let i = 0; i < f32.length; i++) {
      const int = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      const signed = int >= 32768 ? int - 65536 : int;
      f32[i] = signed / 32768;
    }

    const buffer = ctx.createBuffer(1, f32.length, sampleRate);
    buffer.getChannelData(0).set(f32);

    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      currentSourceNode = source;
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        currentSourceNode = null;
        ctx.close().catch(() => {});
        resolve();
      };
      source.start();
    });
  } catch (err) {
    ctx.close().catch(() => {});
    throw err;
  }
};
