// Audio utilities for alarms and notifications

let audioContext: AudioContext | null = null;

/**
 * Get or create the shared AudioContext instance
 */
const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
  }
  return audioContext;
};

/**
 * Play a double-beep alarm sound for depth/shallow water alerts
 */
export const playAlarmBeep = (): void => {
  const ctx = getAudioContext();

  // First beep - lower pitch
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.frequency.value = 2500;
  osc1.type = 'square';
  gain1.gain.value = 0.4;
  osc1.start();
  osc1.stop(ctx.currentTime + 0.1);

  // Second beep - higher pitch, after delay
  setTimeout(() => {
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 3200;
    osc2.type = 'square';
    gain2.gain.value = 0.4;
    osc2.start();
    osc2.stop(ctx.currentTime + 0.1);
  }, 120);
};

/**
 * Play a single notification beep
 */
export const playNotificationBeep = (frequency = 1000, duration = 0.1): void => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  osc.type = 'sine';
  gain.gain.value = 0.3;
  osc.start();
  osc.stop(ctx.currentTime + duration);
};

/**
 * Create a repeating alarm interval that plays beeps
 * @returns A function to stop the alarm
 */
export const startRepeatingAlarm = (
  intervalMs = 500,
  playFn = playAlarmBeep
): (() => void) => {
  playFn();
  const interval = setInterval(playFn, intervalMs);
  return () => clearInterval(interval);
};
