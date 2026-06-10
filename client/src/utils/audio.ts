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
  // Browsers create the context suspended until a user gesture; a suspended
  // context plays nothing, so alarms would silently fail. resume() succeeds
  // when called during a gesture and is a harmless no-op otherwise.
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
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
 * Play a pleasant rising chime - good for info notifications
 */
export const playChime = (): void => {
  const ctx = getAudioContext();
  const frequencies = [523, 659, 784]; // C5, E5, G5 - major chord

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.4);
    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.4);
  });
};

/**
 * Play a descending warning tone - signals caution
 */
export const playWarningTone = (): void => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
};

/**
 * Play a sonar ping - submarine style
 */
export const playSonarPing = (): void => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 1500;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
  osc.start();
  osc.stop(ctx.currentTime + 0.8);
};

/**
 * Play a ship's bell sound
 */
export const playBell = (): void => {
  const ctx = getAudioContext();

  // Main bell tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.frequency.value = 830;
  osc1.type = 'sine';
  gain1.gain.setValueAtTime(0.5, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);
  osc1.start();
  osc1.stop(ctx.currentTime + 1.0);

  // Overtone
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.frequency.value = 1660;
  osc2.type = 'sine';
  gain2.gain.setValueAtTime(0.2, ctx.currentTime);
  gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
  osc2.start();
  osc2.stop(ctx.currentTime + 0.6);
};

/**
 * Play an alternating siren - emergency alert
 */
export const playSiren = (): void => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  gain.gain.value = 0.25;

  // Alternate between two frequencies
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.setValueAtTime(800, now + 0.15);
  osc.frequency.setValueAtTime(600, now + 0.30);
  osc.frequency.setValueAtTime(800, now + 0.45);

  osc.start();
  osc.stop(now + 0.6);
};

/**
 * Play a gentle soft notification
 */
export const playGentleNotification = (): void => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 600;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
};

/**
 * Play rapid urgent beeps
 */
export const playUrgentBeeps = (): void => {
  const ctx = getAudioContext();

  for (let i = 0; i < 4; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1800;
    osc.type = 'square';
    gain.gain.value = 0.35;
    osc.start(ctx.currentTime + i * 0.12);
    osc.stop(ctx.currentTime + i * 0.12 + 0.06);
  }
};

/**
 * Play a foghorn sound - low warning
 */
export const playFoghorn = (): void => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 120;
  osc.type = 'sawtooth';
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);
  osc.start();
  osc.stop(ctx.currentTime + 1.0);
};

/**
 * Play a triple beep - attention getter
 */
export const playTripleBeep = (): void => {
  const ctx = getAudioContext();

  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1200;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start(ctx.currentTime + i * 0.18);
    osc.stop(ctx.currentTime + i * 0.18 + 0.1);
  }
};

/**
 * Play ascending alert - rising urgency
 */
export const playAscendingAlert = (): void => {
  const ctx = getAudioContext();
  const frequencies = [400, 600, 800, 1000];

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'square';
    gain.gain.value = 0.25;
    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.08);
  });
};

/**
 * Play a soft ding - minimal notification
 */
export const playSoftDing = (): void => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
};

/**
 * Play a short Man Overboard alarm burst - urgent, loud enough to alert
 * everyone, then auto-stops after a couple of seconds so it does not distract
 * during the rescue (deliberately NOT a persistent siren).
 */
export const playMobAlarm = (): void => {
  const stop = startRepeatingAlarm(450, playUrgentBeeps);
  setTimeout(stop, 2500);
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

// Map of all available alert sounds
export const ALERT_SOUNDS = {
  none: null,
  beep: () => playNotificationBeep(800, 0.15),
  notification: playNotificationBeep,
  alarm: playAlarmBeep,
  chime: playChime,
  warning: playWarningTone,
  sonar: playSonarPing,
  bell: playBell,
  siren: playSiren,
  gentle: playGentleNotification,
  urgent: playUrgentBeeps,
  foghorn: playFoghorn,
  triple: playTripleBeep,
  ascending: playAscendingAlert,
  ding: playSoftDing,
} as const;

export type AlertSoundType = keyof typeof ALERT_SOUNDS;
