import { InputSensitivityMode } from '@/types';
import { describe, expect, test } from 'bun:test';
import {
  clampMicrophoneDecibels,
  createAutomaticHybridObserverState,
  createAutomaticInputSensitivityState,
  createMicrophoneGateState,
  createMicrophoneInputMeterSnapshot,
  getAutomaticHybridDecision,
  getAutomaticHybridGateSignal,
  getMicrophoneGateThresholds,
  inputSensitivityModeUsesGate,
  MICROPHONE_AUTO_AMBIENT_GUARD_DB,
  MICROPHONE_AUTO_AMBIENT_MEDIAN_PERCENTILE,
  MICROPHONE_AUTO_AMBIENT_UPPER_PERCENTILE,
  MICROPHONE_AUTO_BOOTSTRAP_MS,
  MICROPHONE_AUTO_DIGITAL_SILENCE_CUTOFF_DB,
  MICROPHONE_AUTO_DIGITAL_SILENCE_RESET_MS,
  MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MS,
  MICROPHONE_AUTO_NOISE_FLOOR_PERCENTILE,
  MICROPHONE_AUTO_OBSERVATION_SAMPLE_INTERVAL_MS,
  MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE,
  MICROPHONE_AUTO_OBSERVER_DROPOUT_GRACE_MS,
  MICROPHONE_AUTO_SPEECH_MIN_ABOVE_AMBIENT_DB,
  MICROPHONE_AUTO_SPEECH_MIN_SNR_DB,
  MICROPHONE_AUTO_STRONG_SPEECH_MIN_ABOVE_AMBIENT_DB,
  MICROPHONE_AUTO_STRONG_SPEECH_MIN_SNR_DB,
  MICROPHONE_AUTO_THRESHOLD_MARGIN_DB,
  MICROPHONE_GATE_CLOSE_HOLD_MS,
  MICROPHONE_GATE_HYSTERESIS_DB,
  MICROPHONE_GATE_OPEN_ATTACK_MS,
  MICROPHONE_GATE_RELEASE_MS,
  microphoneDecibelsToPercent,
  resetAutomaticHybridObserverReportState,
  updateAutomaticHybridObserverState,
  updateAutomaticInputSensitivity,
  updateMicrophoneGateState
} from '../audio-gate';

const updateAutomaticRepeatedly = (
  state: ReturnType<typeof createAutomaticInputSensitivityState>,
  decibels: number,
  count: number,
  elapsedMs = 40
) => {
  let result: ReturnType<typeof updateAutomaticInputSensitivity> | undefined;

  for (let index = 0; index < count; index++) {
    result = updateAutomaticInputSensitivity(
      result?.state ?? state,
      decibels,
      elapsedMs
    );
  }

  if (!result) {
    throw new Error('automatic sensitivity test did not run any updates');
  }

  return result;
};

const updateAutomaticWithSamples = (
  state: ReturnType<typeof createAutomaticInputSensitivityState>,
  samples: number[],
  count: number,
  elapsedMs = 40
) => {
  let result: ReturnType<typeof updateAutomaticInputSensitivity> | undefined;

  for (let index = 0; index < count; index++) {
    result = updateAutomaticInputSensitivity(
      result?.state ?? state,
      samples[index % samples.length],
      elapsedMs
    );
  }

  if (!result) {
    throw new Error('automatic sensitivity test did not run any updates');
  }

  return result;
};

const bootstrapAutomaticInputSensitivity = (decibels: number, elapsedMs = 40) =>
  updateAutomaticRepeatedly(
    createAutomaticInputSensitivityState(),
    decibels,
    Math.ceil(MICROPHONE_AUTO_BOOTSTRAP_MS / elapsedMs),
    elapsedMs
  );

const bootstrapAutomaticInputSensitivityDistribution = (
  samples: number[],
  elapsedMs = 40
) =>
  updateAutomaticWithSamples(
    createAutomaticInputSensitivityState(),
    samples,
    Math.ceil(MICROPHONE_AUTO_BOOTSTRAP_MS / elapsedMs),
    elapsedMs
  );

type TObserverVadFrame = {
  vad2SpeechActive?: boolean;
  vad3SpeechActive?: boolean;
  elapsedMs?: number;
};

const updateObserverFrames = (frames: TObserverVadFrame[]) => {
  const observer = createAutomaticHybridObserverState();

  return updateExistingObserverFrames(observer, frames);
};

const updateExistingObserverFrames = (
  initialObserver: ReturnType<typeof createAutomaticHybridObserverState>,
  frames: TObserverVadFrame[]
) => {
  let observer = initialObserver;

  for (const frame of frames) {
    observer = updateAutomaticHybridObserverState(
      observer,
      frame.elapsedMs ?? 20,
      {
        vad2SpeechActive: frame.vad2SpeechActive === true,
        vad3SpeechActive: frame.vad3SpeechActive === true
      }
    );
  }

  return observer;
};

describe('audio gate helpers', () => {
  test('maps the supported microphone meter range', () => {
    expect(clampMicrophoneDecibels(-120)).toBe(-100);
    expect(clampMicrophoneDecibels(6)).toBe(0);
    expect(microphoneDecibelsToPercent(-100)).toBe(0);
    expect(microphoneDecibelsToPercent(-50)).toBe(50);
    expect(microphoneDecibelsToPercent(0)).toBe(100);
  });

  test('carries hybrid VAD observer results in meter snapshots', () => {
    const snapshot = createMicrophoneInputMeterSnapshot({
      decibels: -42,
      currentLevelDb: -44,
      peakLevelDb: -42,
      inputSensitivityMode: InputSensitivityMode.AUTOMATIC,
      thresholdDb: -50,
      gateOpen: true,
      vad2SpeechActive: false,
      vad3SpeechActive: true,
      snrDb: 18,
      strongSpeechEvidence: true,
      speechEvidence: false,
      eligibleToOpen: true,
      recentVad3Speech: true,
      timeSinceLastVad3SpeechMs: 40,
      vad2OnlyDurationMs: 120,
      candidateAuthenticatedSpeech: true,
      candidateStrictOpen: true,
      vad3Hits120Ms: 2,
      vad3Hits200Ms: 3,
      vad3ConsecutiveFrames: 1,
      candidateBurstAAuthenticated: true,
      candidateBurstBAuthenticated: true,
      candidateBurstAOpen: true,
      candidateBurstBOpen: true,
      candidateBurstAOnsetMs: 20,
      candidateBurstBOnsetMs: 60,
      utteranceActive: true,
      utteranceElapsedMs: 120,
      maxVad3Hits120SinceReport: 2,
      maxVad3Hits200SinceReport: 3,
      burstATriggeredSinceReport: true,
      burstBTriggeredSinceReport: true,
      backgroundFrozen: true,
      digitalSilence: false,
      vadSampleRate: 16000,
      vadFrameMs: 20,
      source: 'settings'
    });

    expect(snapshot.vad2SpeechActive).toBe(false);
    expect(snapshot.vad3SpeechActive).toBe(true);
    expect(snapshot.decibels).toBe(-42);
    expect(snapshot.currentLevelDb).toBe(-44);
    expect(snapshot.peakLevelDb).toBe(-42);
    expect(snapshot.snrDb).toBe(18);
    expect(snapshot.strongSpeechEvidence).toBe(true);
    expect(snapshot.speechEvidence).toBe(false);
    expect(snapshot.eligibleToOpen).toBe(true);
    expect(snapshot.recentVad3Speech).toBe(true);
    expect(snapshot.timeSinceLastVad3SpeechMs).toBe(40);
    expect(snapshot.vad2OnlyDurationMs).toBe(120);
    expect(snapshot.candidateAuthenticatedSpeech).toBe(true);
    expect(snapshot.candidateStrictOpen).toBe(true);
    expect(snapshot.vad3Hits120Ms).toBe(2);
    expect(snapshot.vad3Hits200Ms).toBe(3);
    expect(snapshot.vad3ConsecutiveFrames).toBe(1);
    expect(snapshot.candidateBurstAAuthenticated).toBe(true);
    expect(snapshot.candidateBurstBAuthenticated).toBe(true);
    expect(snapshot.candidateBurstAOpen).toBe(true);
    expect(snapshot.candidateBurstBOpen).toBe(true);
    expect(snapshot.candidateBurstAOnsetMs).toBe(20);
    expect(snapshot.candidateBurstBOnsetMs).toBe(60);
    expect(snapshot.utteranceActive).toBe(true);
    expect(snapshot.utteranceElapsedMs).toBe(120);
    expect(snapshot.maxVad3Hits120SinceReport).toBe(2);
    expect(snapshot.maxVad3Hits200SinceReport).toBe(3);
    expect(snapshot.burstATriggeredSinceReport).toBe(true);
    expect(snapshot.burstBTriggeredSinceReport).toBe(true);
    expect(snapshot.backgroundFrozen).toBe(true);
    expect(snapshot.digitalSilence).toBe(false);
    expect(snapshot.vadSampleRate).toBe(16000);
    expect(snapshot.vadFrameMs).toBe(20);
  });

  test('keeps normal background closed and available for learning', () => {
    const state = createAutomaticInputSensitivityState({
      noiseFloorDb: -60,
      ambientUpperDb: -57
    });
    const decision = getAutomaticHybridDecision({
      decibels: -59,
      noiseFloorDb: state.noiseFloorDb,
      ambientUpperDb: state.ambientUpperDb,
      gateOpen: false,
      vad2SpeechActive: false,
      vad3SpeechActive: false
    });
    const result = updateAutomaticInputSensitivity(state, -59, 40, {
      vad2SpeechActive: false,
      vad3SpeechActive: false,
      gateOpen: false
    });

    expect(decision.eligibleToOpen).toBe(false);
    expect(decision.backgroundFrozen).toBe(false);
    expect(result.backgroundFrozen).toBe(false);
    expect(result.state.observationCount).toBe(1);
  });

  test('allows strong mode-3 speech evidence to open with sane background context', () => {
    const decision = getAutomaticHybridDecision({
      decibels: -56,
      noiseFloorDb: -60,
      ambientUpperDb: -58,
      gateOpen: false,
      vad2SpeechActive: false,
      vad3SpeechActive: true
    });

    expect(MICROPHONE_AUTO_STRONG_SPEECH_MIN_SNR_DB).toBe(4);
    expect(MICROPHONE_AUTO_STRONG_SPEECH_MIN_ABOVE_AMBIENT_DB).toBe(1);
    expect(decision.snrDb).toBe(4);
    expect(decision.strongSpeechEvidence).toBe(true);
    expect(decision.eligibleToOpen).toBe(true);
  });

  test('rejects a weak mode-2-only keyboard-like false positive', () => {
    const decision = getAutomaticHybridDecision({
      decibels: -56,
      noiseFloorDb: -60,
      ambientUpperDb: -58,
      gateOpen: false,
      vad2SpeechActive: true,
      vad3SpeechActive: false
    });

    expect(decision.speechEvidence).toBe(true);
    expect(decision.strongSpeechEvidence).toBe(false);
    expect(decision.eligibleToOpen).toBe(false);
  });

  test('allows mode-2 quiet speech when relative background evidence is meaningful', () => {
    const decision = getAutomaticHybridDecision({
      decibels: -54,
      noiseFloorDb: -60,
      ambientUpperDb: -57,
      gateOpen: false,
      vad2SpeechActive: true,
      vad3SpeechActive: false
    });

    expect(MICROPHONE_AUTO_SPEECH_MIN_SNR_DB).toBe(6);
    expect(MICROPHONE_AUTO_SPEECH_MIN_ABOVE_AMBIENT_DB).toBe(3);
    expect(decision.snrDb).toBe(6);
    expect(decision.levelAboveAmbientDb).toBe(3);
    expect(decision.eligibleToOpen).toBe(true);
  });

  test('requires Candidate A to open VAD-ready Automatic from a closed gate', () => {
    const vad2HighSnrDecision = getAutomaticHybridDecision({
      decibels: -40,
      noiseFloorDb: -70,
      ambientUpperDb: -60,
      gateOpen: false,
      vad2SpeechActive: true,
      vad3SpeechActive: false,
      candidateBurstAAuthenticated: false
    });
    const isolatedVad3Decision = getAutomaticHybridDecision({
      decibels: -40,
      noiseFloorDb: -70,
      ambientUpperDb: -60,
      gateOpen: false,
      vad2SpeechActive: false,
      vad3SpeechActive: true,
      candidateBurstAAuthenticated: false
    });
    const candidateADecision = getAutomaticHybridDecision({
      decibels: -70,
      noiseFloorDb: -70,
      ambientUpperDb: -60,
      gateOpen: false,
      vad2SpeechActive: true,
      vad3SpeechActive: true,
      candidateBurstAAuthenticated: true
    });

    expect(vad2HighSnrDecision.speechEvidence).toBe(true);
    expect(vad2HighSnrDecision.snrDb).toBe(30);
    expect(vad2HighSnrDecision.eligibleToOpen).toBe(false);
    expect(
      getAutomaticHybridGateSignal({
        gateOpen: false,
        decision: vad2HighSnrDecision
      })
    ).toBe(false);
    expect(isolatedVad3Decision.strongSpeechEvidence).toBe(true);
    expect(isolatedVad3Decision.eligibleToOpen).toBe(false);
    expect(candidateADecision.eligibleToOpen).toBe(true);
    expect(
      getAutomaticHybridGateSignal({
        gateOpen: false,
        decision: candidateADecision
      })
    ).toBe(true);
  });

  test('does not require Candidate B to open and does not let Candidate B open alone', () => {
    const candidateAOnlyDecision = getAutomaticHybridDecision({
      decibels: -70,
      noiseFloorDb: -70,
      ambientUpperDb: -60,
      gateOpen: false,
      vad2SpeechActive: true,
      vad3SpeechActive: true,
      candidateBurstAAuthenticated: true
    });
    const candidateBOnlyDecision = getAutomaticHybridDecision({
      decibels: -40,
      noiseFloorDb: -70,
      ambientUpperDb: -60,
      gateOpen: false,
      vad2SpeechActive: true,
      vad3SpeechActive: true,
      candidateBurstAAuthenticated: false
    });

    expect(candidateAOnlyDecision.eligibleToOpen).toBe(true);
    const candidateBOnlyObserver = {
      ...createAutomaticHybridObserverState(),
      candidateBurstBAuthenticated: true,
      candidateBurstBOpen: true
    };

    expect(candidateBOnlyObserver.candidateBurstBAuthenticated).toBe(true);
    expect(candidateBOnlyDecision.eligibleToOpen).toBe(false);
  });

  test('does not let Candidate A bypass digital silence', () => {
    const decision = getAutomaticHybridDecision({
      decibels: MICROPHONE_AUTO_DIGITAL_SILENCE_CUTOFF_DB - 1,
      noiseFloorDb: -70,
      ambientUpperDb: -60,
      gateOpen: false,
      vad2SpeechActive: true,
      vad3SpeechActive: true,
      candidateBurstAAuthenticated: true
    });

    expect(decision.digitalSilence).toBe(true);
    expect(decision.eligibleToOpen).toBe(false);
    expect(
      getAutomaticHybridGateSignal({
        gateOpen: false,
        decision
      })
    ).toBe(false);
  });

  test('keeps an already-open gate alive on mode-2 continuation evidence', () => {
    const decision = getAutomaticHybridDecision({
      decibels: -56,
      noiseFloorDb: -60,
      ambientUpperDb: -57,
      gateOpen: true,
      vad2SpeechActive: true,
      vad3SpeechActive: false,
      candidateBurstAAuthenticated: false
    });

    expect(decision.eligibleToOpen).toBe(false);
    expect(
      getAutomaticHybridGateSignal({
        gateOpen: true,
        decision
      })
    ).toBe(true);
  });

  test('does not treat close-threshold ambient as hybrid continuation evidence', () => {
    const decision = getAutomaticHybridDecision({
      decibels: -53,
      noiseFloorDb: -60,
      ambientUpperDb: -55,
      gateOpen: true,
      vad2SpeechActive: false,
      vad3SpeechActive: false
    });

    expect(decision.speechEvidence).toBe(false);
    expect(decision.strongSpeechEvidence).toBe(false);
    expect(decision.eligibleToOpen).toBe(false);
    expect(
      getAutomaticHybridGateSignal({
        gateOpen: true,
        decision
      })
    ).toBe(false);
  });

  test('authenticates the observer quickly from mode-3 evidence', () => {
    const observer = updateAutomaticHybridObserverState(
      createAutomaticHybridObserverState(),
      20,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: true
      }
    );

    expect(observer.recentVad3Speech).toBe(true);
    expect(observer.timeSinceLastVad3SpeechMs).toBe(0);
    expect(observer.vad2OnlyDurationMs).toBe(0);
    expect(observer.candidateAuthenticatedSpeech).toBe(true);
    expect(observer.candidateStrictOpen).toBe(true);
    expect(observer.vad3Hits120Ms).toBe(1);
    expect(observer.vad3Hits200Ms).toBe(1);
    expect(observer.vad3ConsecutiveFrames).toBe(1);
    expect(observer.candidateBurstAAuthenticated).toBe(false);
    expect(observer.candidateBurstBAuthenticated).toBe(false);
    expect(observer.candidateBurstAOpen).toBe(false);
    expect(observer.candidateBurstBOpen).toBe(false);
  });

  test('keeps observer authentication alive with mode-2 continuation', () => {
    let observer = updateAutomaticHybridObserverState(
      createAutomaticHybridObserverState(),
      20,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: true
      }
    );

    observer = updateAutomaticHybridObserverState(observer, 40, {
      vad2SpeechActive: true,
      vad3SpeechActive: false
    });

    expect(observer.recentVad3Speech).toBe(true);
    expect(observer.timeSinceLastVad3SpeechMs).toBe(40);
    expect(observer.candidateAuthenticatedSpeech).toBe(true);
    expect(observer.candidateStrictOpen).toBe(true);
  });

  test('keeps observer authentication through a short dropout', () => {
    let observer = updateAutomaticHybridObserverState(
      createAutomaticHybridObserverState(),
      20,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: true
      }
    );

    observer = updateAutomaticHybridObserverState(
      observer,
      MICROPHONE_AUTO_OBSERVER_DROPOUT_GRACE_MS - 20,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: false
      }
    );

    expect(observer.candidateAuthenticatedSpeech).toBe(true);
    expect(observer.candidateStrictOpen).toBe(true);
  });

  test('clears observer authentication after sustained no-speech', () => {
    let observer = updateAutomaticHybridObserverState(
      createAutomaticHybridObserverState(),
      20,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: true
      }
    );

    observer = updateAutomaticHybridObserverState(
      observer,
      MICROPHONE_AUTO_OBSERVER_DROPOUT_GRACE_MS + 40,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: false
      }
    );

    expect(observer.recentVad3Speech).toBe(false);
    expect(observer.candidateAuthenticatedSpeech).toBe(false);
    expect(observer.candidateStrictOpen).toBe(false);
    expect(observer.vad2OnlyDurationMs).toBe(0);
  });

  test('does not authenticate a mode-2-only observer sequence', () => {
    let observer = createAutomaticHybridObserverState();

    for (let index = 0; index < 6; index++) {
      observer = updateAutomaticHybridObserverState(observer, 40, {
        vad2SpeechActive: true,
        vad3SpeechActive: false
      });
    }

    expect(observer.recentVad3Speech).toBe(false);
    expect(observer.timeSinceLastVad3SpeechMs).toBeNull();
    expect(observer.vad2OnlyDurationMs).toBe(240);
    expect(observer.candidateAuthenticatedSpeech).toBe(false);
    expect(observer.candidateStrictOpen).toBe(false);
  });

  test('preserves initial mode-2-only observer duration after mode-3 authentication', () => {
    let observer = createAutomaticHybridObserverState();

    observer = updateAutomaticHybridObserverState(observer, 80, {
      vad2SpeechActive: true,
      vad3SpeechActive: false
    });
    observer = updateAutomaticHybridObserverState(observer, 20, {
      vad2SpeechActive: true,
      vad3SpeechActive: true
    });

    expect(observer.vad2OnlyDurationMs).toBe(80);
    expect(observer.candidateAuthenticatedSpeech).toBe(true);
    expect(observer.candidateStrictOpen).toBe(true);
  });

  test('does not authenticate burst candidates from one isolated mode-3 hit plus long mode-2', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 120 }, () => ({
        vad2SpeechActive: true,
        vad3SpeechActive: false
      }))
    ]);

    expect(observer.candidateAuthenticatedSpeech).toBe(true);
    expect(observer.candidateBurstAAuthenticated).toBe(false);
    expect(observer.candidateBurstBAuthenticated).toBe(false);
    expect(observer.candidateBurstAOpen).toBe(false);
    expect(observer.candidateBurstBOpen).toBe(false);
    expect(observer.maxVad3Hits120SinceReport).toBe(1);
    expect(observer.maxVad3Hits200SinceReport).toBe(1);
    expect(observer.burstATriggeredSinceReport).toBe(false);
    expect(observer.burstBTriggeredSinceReport).toBe(false);
  });

  test('authenticates burst candidate A from two mode-3 hits inside 120 ms', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    expect(observer.vad3Hits120Ms).toBe(2);
    expect(observer.vad3Hits200Ms).toBe(2);
    expect(observer.vad3ConsecutiveFrames).toBe(2);
    expect(observer.candidateBurstAAuthenticated).toBe(true);
    expect(observer.candidateBurstAOpen).toBe(true);
    expect(observer.candidateBurstAOnsetMs).toBe(20);
    expect(observer.burstATriggeredSinceReport).toBe(true);
  });

  test('does not authenticate burst candidate B from only two mode-3 hits inside 200 ms', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 7 }, () => ({
        vad2SpeechActive: false,
        vad3SpeechActive: false
      })),
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    expect(observer.vad3Hits120Ms).toBe(1);
    expect(observer.vad3Hits200Ms).toBe(2);
    expect(observer.candidateBurstBAuthenticated).toBe(false);
    expect(observer.candidateBurstBOpen).toBe(false);
    expect(observer.burstBTriggeredSinceReport).toBe(false);
  });

  test('authenticates burst candidate B from three mode-3 hits inside 200 ms', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 3 }, () => ({
        vad2SpeechActive: false,
        vad3SpeechActive: false
      })),
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 4 }, () => ({
        vad2SpeechActive: false,
        vad3SpeechActive: false
      })),
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    expect(observer.vad3Hits200Ms).toBe(3);
    expect(observer.candidateBurstBAuthenticated).toBe(true);
    expect(observer.candidateBurstBOpen).toBe(true);
    expect(observer.candidateBurstBOnsetMs).toBe(180);
    expect(observer.burstBTriggeredSinceReport).toBe(true);
  });

  test('latches candidate A onset for a fresh utterance', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    expect(observer.utteranceActive).toBe(true);
    expect(observer.utteranceElapsedMs).toBe(20);
    expect(observer.candidateBurstAAuthenticated).toBe(true);
    expect(observer.candidateBurstAOnsetMs).toBe(20);
  });

  test('does not let candidate A onset increase during same-utterance continuation', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 180 }, () => ({
        vad2SpeechActive: true,
        vad3SpeechActive: false
      }))
    ]);

    expect(observer.utteranceElapsedMs).toBe(3620);
    expect(observer.candidateBurstAAuthenticated).toBe(true);
    expect(observer.candidateBurstAOnsetMs).toBe(20);
  });

  test('does not let candidate B onset increase during same-utterance continuation', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 180 }, () => ({
        vad2SpeechActive: true,
        vad3SpeechActive: false
      }))
    ]);

    expect(observer.utteranceElapsedMs).toBe(3640);
    expect(observer.candidateBurstBAuthenticated).toBe(true);
    expect(observer.candidateBurstBOnsetMs).toBe(40);
  });

  test('maintains authenticated burst candidates with mode-2 continuation', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 5 }, () => ({
        vad2SpeechActive: true,
        vad3SpeechActive: false
      }))
    ]);

    expect(observer.candidateBurstAAuthenticated).toBe(true);
    expect(observer.candidateBurstBAuthenticated).toBe(true);
    expect(observer.candidateBurstAOpen).toBe(true);
    expect(observer.candidateBurstBOpen).toBe(true);
    expect(observer.candidateBurstAOnsetMs).toBe(20);
    expect(observer.candidateBurstBOnsetMs).toBe(40);
  });

  test('keeps authenticated burst candidates through a short dropout', () => {
    let observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    observer = updateAutomaticHybridObserverState(
      observer,
      MICROPHONE_AUTO_OBSERVER_DROPOUT_GRACE_MS - 20,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: false
      }
    );

    expect(observer.candidateBurstAAuthenticated).toBe(true);
    expect(observer.candidateBurstBAuthenticated).toBe(true);
    expect(observer.candidateBurstAOpen).toBe(true);
    expect(observer.candidateBurstBOpen).toBe(true);
    expect(observer.candidateBurstAOnsetMs).toBe(20);
    expect(observer.candidateBurstBOnsetMs).toBe(40);
  });

  test('does not recompute latched onset when a same-utterance burst reauthenticates', () => {
    let observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    observer = updateExistingObserverFrames(observer, [
      ...Array.from({ length: 6 }, () => ({
        vad2SpeechActive: false,
        vad3SpeechActive: false
      })),
      { vad2SpeechActive: true, vad3SpeechActive: false },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    expect(observer.utteranceActive).toBe(true);
    expect(observer.candidateBurstAAuthenticated).toBe(true);
    expect(observer.candidateBurstBAuthenticated).toBe(true);
    expect(observer.candidateBurstAOnsetMs).toBe(20);
    expect(observer.candidateBurstBOnsetMs).toBe(40);
  });

  test('clears authenticated burst candidates after sustained no-speech', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 10 }, () => ({
        vad2SpeechActive: false,
        vad3SpeechActive: false
      }))
    ]);

    expect(observer.candidateBurstAAuthenticated).toBe(false);
    expect(observer.candidateBurstBAuthenticated).toBe(false);
    expect(observer.candidateBurstAOpen).toBe(false);
    expect(observer.candidateBurstBOpen).toBe(false);
    expect(observer.utteranceActive).toBe(false);
    expect(observer.utteranceElapsedMs).toBeNull();
    expect(observer.candidateBurstAOnsetMs).toBeNull();
    expect(observer.candidateBurstBOnsetMs).toBeNull();
  });

  test('uses a new independent onset after full utterance expiry', () => {
    let observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 10 }, () => ({
        vad2SpeechActive: false,
        vad3SpeechActive: false
      }))
    ]);

    expect(observer.utteranceActive).toBe(false);
    expect(observer.candidateBurstAOnsetMs).toBeNull();
    expect(observer.candidateBurstBOnsetMs).toBeNull();

    observer = updateExistingObserverFrames(observer, [
      { vad2SpeechActive: true, vad3SpeechActive: false },
      { vad2SpeechActive: true, vad3SpeechActive: false },
      { vad2SpeechActive: true, vad3SpeechActive: false },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    expect(observer.utteranceActive).toBe(true);
    expect(observer.candidateBurstAOnsetMs).toBe(80);
    expect(observer.candidateBurstBOnsetMs).toBe(100);
  });

  test('keeps clean candidate A and B onset ordering consistent', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    expect(observer.candidateBurstAOnsetMs).toBe(20);
    expect(observer.candidateBurstBOnsetMs).toBe(40);
    expect(
      (observer.candidateBurstAOnsetMs ?? Infinity) <=
        (observer.candidateBurstBOnsetMs ?? -Infinity)
    ).toBe(true);
  });

  test('expires old mode-3 hits from the burst windows', () => {
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      ...Array.from({ length: 10 }, () => ({
        vad2SpeechActive: false,
        vad3SpeechActive: false
      }))
    ]);

    expect(observer.vad3Hits120Ms).toBe(0);
    expect(observer.vad3Hits200Ms).toBe(0);
    expect(observer.vad3ConsecutiveFrames).toBe(0);
    expect(observer.recentVad3Speech).toBe(false);
  });

  test('latches burst telemetry that happens between status reports', () => {
    let observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: false, vad3SpeechActive: false }
    ]);

    expect(observer.vad3Hits120Ms).toBe(2);
    expect(observer.maxVad3Hits120SinceReport).toBe(2);
    expect(observer.burstATriggeredSinceReport).toBe(true);

    observer = resetAutomaticHybridObserverReportState(observer);

    expect(observer.maxVad3Hits120SinceReport).toBe(0);
    expect(observer.maxVad3Hits200SinceReport).toBe(0);
    expect(observer.burstATriggeredSinceReport).toBe(false);
    expect(observer.burstBTriggeredSinceReport).toBe(false);
  });

  test('does not let burst observer state affect the real hybrid gate result', () => {
    const decision = getAutomaticHybridDecision({
      decibels: -80,
      noiseFloorDb: -60,
      ambientUpperDb: -57,
      gateOpen: false,
      vad2SpeechActive: false,
      vad3SpeechActive: false
    });
    const observer = updateObserverFrames([
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true },
      { vad2SpeechActive: true, vad3SpeechActive: true }
    ]);

    expect(decision.eligibleToOpen).toBe(false);
    expect(observer.candidateBurstAOpen).toBe(true);
    expect(observer.candidateBurstBOpen).toBe(true);
    expect(
      getAutomaticHybridGateSignal({
        gateOpen: false,
        decision
      })
    ).toBe(false);
  });

  test('lets existing hold/release cover a short mode-2 dropout', () => {
    const decision = getAutomaticHybridDecision({
      decibels: -70,
      noiseFloorDb: -60,
      ambientUpperDb: -57,
      gateOpen: true,
      vad2SpeechActive: false,
      vad3SpeechActive: false
    });
    const gate = updateMicrophoneGateState(
      {
        gateOpen: true,
        openConfirmationMs: MICROPHONE_GATE_OPEN_ATTACK_MS,
        closeHoldRemainingMs: MICROPHONE_GATE_CLOSE_HOLD_MS,
        releaseRemainingMs: 0
      },
      getAutomaticHybridGateSignal({
        gateOpen: true,
        decision
      })
        ? -48
        : -70,
      -48,
      40
    );

    expect(decision.speechEvidence).toBe(false);
    expect(gate.gateOpen).toBe(true);
    expect(gate.state.closeHoldRemainingMs).toBe(
      MICROPHONE_GATE_CLOSE_HOLD_MS - 40
    );
  });

  test('freezes background learning while VAD reports speech', () => {
    const state = createAutomaticInputSensitivityState({
      noiseFloorDb: -60,
      ambientUpperDb: -57
    });
    const result = updateAutomaticInputSensitivity(state, -35, 40, {
      vad2SpeechActive: true,
      vad3SpeechActive: false,
      gateOpen: false
    });

    expect(result.backgroundFrozen).toBe(true);
    expect(result.state.observationCount).toBe(0);
    expect(result.noiseFloorDb).toBe(-60);
    expect(result.ambientUpperDb).toBe(-57);
  });

  test('updates background from trusted non-speech', () => {
    const state = createAutomaticInputSensitivityState({
      noiseFloorDb: -60,
      ambientUpperDb: -57
    });
    const result = updateAutomaticInputSensitivity(state, -59, 40, {
      vad2SpeechActive: false,
      vad3SpeechActive: false,
      gateOpen: false
    });

    expect(result.backgroundFrozen).toBe(false);
    expect(result.state.observationCount).toBe(1);
  });

  test('preserves a trusted baseline through hardware mute and long mute', () => {
    let result = updateAutomaticInputSensitivity(
      createAutomaticInputSensitivityState({
        noiseFloorDb: -60,
        ambientUpperDb: -57
      }),
      -95,
      MICROPHONE_AUTO_DIGITAL_SILENCE_RESET_MS + 200,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: false,
        gateOpen: true
      }
    );

    expect(result.digitalSilence).toBe(true);
    expect(result.backgroundFrozen).toBe(true);
    expect(result.state.initialized).toBe(true);
    expect(result.noiseFloorDb).toBe(-60);
    expect(result.ambientUpperDb).toBe(-57);

    result = updateAutomaticInputSensitivity(result.state, -95, 5000, {
      vad2SpeechActive: false,
      vad3SpeechActive: false,
      gateOpen: false
    });

    expect(result.state.initialized).toBe(true);
    expect(result.noiseFloorDb).toBe(-60);
    expect(result.ambientUpperDb).toBe(-57);
  });

  test('resumes background adaptation after silent unmute', () => {
    const muted = updateAutomaticInputSensitivity(
      createAutomaticInputSensitivityState({
        noiseFloorDb: -60,
        ambientUpperDb: -57
      }),
      -95,
      MICROPHONE_AUTO_DIGITAL_SILENCE_RESET_MS + 40,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: false,
        gateOpen: false
      }
    );
    const unmuted = updateAutomaticInputSensitivity(muted.state, -59, 40, {
      vad2SpeechActive: false,
      vad3SpeechActive: false,
      gateOpen: false
    });

    expect(unmuted.digitalSilence).toBe(false);
    expect(unmuted.backgroundFrozen).toBe(false);
    expect(unmuted.noiseFloorDb).toBe(-60);
    expect(unmuted.state.observationCount).toBe(1);
  });

  test('does not learn speech when unmuting while already speaking', () => {
    const muted = updateAutomaticInputSensitivity(
      createAutomaticInputSensitivityState({
        noiseFloorDb: -60,
        ambientUpperDb: -57
      }),
      -95,
      MICROPHONE_AUTO_DIGITAL_SILENCE_RESET_MS + 40,
      {
        vad2SpeechActive: false,
        vad3SpeechActive: false,
        gateOpen: false
      }
    );
    const speaking = updateAutomaticInputSensitivity(muted.state, -30, 40, {
      vad2SpeechActive: true,
      vad3SpeechActive: true,
      gateOpen: false
    });

    expect(speaking.backgroundFrozen).toBe(true);
    expect(speaking.noiseFloorDb).toBe(-60);
    expect(speaking.ambientUpperDb).toBe(-57);
    expect(speaking.state.observationCount).toBe(0);
  });

  test('falls back to existing level behavior when VAD evidence is unavailable', () => {
    const state = createAutomaticInputSensitivityState({
      noiseFloorDb: -60,
      ambientUpperDb: -57
    });
    const result = updateAutomaticInputSensitivity(state, -59, 40);

    expect(result.backgroundFrozen).toBe(false);
    expect(result.state.observationCount).toBe(1);
  });

  test('leaves Manual and Open Microphone mode gate ownership unchanged', () => {
    expect(inputSensitivityModeUsesGate(InputSensitivityMode.MANUAL)).toBe(
      true
    );
    expect(inputSensitivityModeUsesGate(InputSensitivityMode.OPEN)).toBe(false);
  });

  test('does not trust sustained digital silence as an acoustic floor', () => {
    const result = updateAutomaticRepeatedly(
      createAutomaticInputSensitivityState(),
      -95,
      Math.ceil(MICROPHONE_AUTO_DIGITAL_SILENCE_RESET_MS / 40) + 4
    );

    expect(result.state.initialized).toBe(false);
    expect(result.noiseFloorDb).toBeNull();
    expect(result.thresholdDb).toBe(-48);
    expect(result.thresholdDb).toBeGreaterThan(
      MICROPHONE_AUTO_DIGITAL_SILENCE_CUTOFF_DB
    );
  });

  test('bootstraps automatic threshold from a real quiet ambient level', () => {
    const result = bootstrapAutomaticInputSensitivity(-58);

    expect(result.state.initialized).toBe(true);
    expect(result.noiseFloorDb).toBe(-58);
    expect(result.thresholdDb).toBe(-46);
    expect(result.thresholdDb - result.noiseFloorDb!).toBe(
      MICROPHONE_AUTO_THRESHOLD_MARGIN_DB
    );
  });

  test('uses a lower-percentile bootstrap instead of a peak or average', () => {
    const levels = [-60, -57, -53, -59, -49, -56];
    let result: ReturnType<typeof updateAutomaticInputSensitivity> | undefined;

    for (let index = 0; index < 36; index++) {
      result = updateAutomaticInputSensitivity(
        result?.state ?? createAutomaticInputSensitivityState(),
        levels[index % levels.length],
        40
      );
    }

    expect(MICROPHONE_AUTO_NOISE_FLOOR_PERCENTILE).toBe(0.25);
    expect(MICROPHONE_AUTO_AMBIENT_MEDIAN_PERCENTILE).toBe(0.5);
    expect(MICROPHONE_AUTO_AMBIENT_UPPER_PERCENTILE).toBe(0.85);
    expect(MICROPHONE_AUTO_AMBIENT_GUARD_DB).toBe(4);
    expect(MICROPHONE_AUTO_OBSERVATION_SAMPLE_INTERVAL_MS).toBe(20);
    expect(MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE).toBe(64);
    expect(result?.noiseFloorDb).toBeLessThanOrEqual(-57);
    expect(result?.ambientUpperDb).toBeLessThanOrEqual(-53);
    expect(result?.thresholdDb).toBeLessThanOrEqual(-45);
  });

  test('keeps variable quiet background below the automatic threshold', () => {
    const background = [-60, -59, -57, -55, -53, -51, -49];
    const result = updateAutomaticWithSamples(
      createAutomaticInputSensitivityState(),
      background,
      Math.ceil((MICROPHONE_AUTO_BOOTSTRAP_MS + 3000) / 40)
    );

    expect(result.state.initialized).toBe(true);
    expect(result.noiseFloorDb).toBeLessThanOrEqual(-58);
    expect(result.ambientMedianDb).toBeCloseTo(-55, 1);
    expect(result.ambientUpperDb).toBeLessThanOrEqual(-51);
    expect(result.thresholdDb).toBeGreaterThan(Math.max(...background));
    expect(result.thresholdDb).toBeGreaterThanOrEqual(
      result.ambientUpperDb! + MICROPHONE_AUTO_AMBIENT_GUARD_DB - 1
    );
  });

  test('keeps one transient from redefining the ambient upper envelope', () => {
    const background = [-58, -57, -56, -55, -54, -53, -52];
    let result = bootstrapAutomaticInputSensitivityDistribution(background);
    const thresholdBeforeTransient = result.thresholdDb;
    const upperBeforeTransient = result.ambientUpperDb!;

    result = updateAutomaticInputSensitivity(result.state, -30, 40);
    result = updateAutomaticWithSamples(result.state, background, 12);

    expect(result.ambientUpperDb).toBeCloseTo(upperBeforeTransient, 1);
    expect(result.thresholdDb).toBeLessThanOrEqual(
      thresholdBeforeTransient + 1
    );
  });

  test('opens reliably for speech above the calibrated background region', () => {
    const background = [-58, -57, -56, -55, -54, -53, -52];
    const calibrated =
      bootstrapAutomaticInputSensitivityDistribution(background);
    const gate = updateMicrophoneGateState(
      createMicrophoneGateState(),
      -40,
      calibrated.thresholdDb,
      MICROPHONE_GATE_OPEN_ATTACK_MS
    );
    const speech = updateAutomaticInputSensitivity(calibrated.state, -40, 40);

    expect(calibrated.thresholdDb).toBeLessThanOrEqual(-44);
    expect(gate.gateOpen).toBe(true);
    expect(speech.isSpeechLike).toBe(true);
  });

  test('recalibrates after hardware mute returns to real microphone signal', () => {
    let result = updateAutomaticRepeatedly(
      createAutomaticInputSensitivityState(),
      -95,
      Math.ceil(MICROPHONE_AUTO_DIGITAL_SILENCE_RESET_MS / 40) + 20
    );

    expect(result.state.initialized).toBe(false);

    result = updateAutomaticRepeatedly(
      result.state,
      -55,
      Math.ceil(MICROPHONE_AUTO_BOOTSTRAP_MS / 40) + 4
    );

    expect(result.state.initialized).toBe(true);
    expect(result.noiseFloorDb).toBe(-55);
    expect(result.ambientMedianDb).toBe(-55);
    expect(result.ambientUpperDb).toBe(-55);
    expect(result.thresholdDb).toBe(-43);
    expect(result.thresholdDb).toBeGreaterThan(-80);
  });

  test('does not chase speech upward', () => {
    const ambient = createAutomaticInputSensitivityState({
      noiseFloorDb: -60
    });
    const speech = updateAutomaticRepeatedly(
      ambient,
      -28,
      Math.ceil(MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MS / 40) + 20
    );

    expect(speech.isSpeechLike).toBe(true);
    expect(speech.noiseFloorDb).toBeCloseTo(-60, 1);
    expect(speech.thresholdDb).toBeCloseTo(-48, 1);
  });

  test('recovers when the background level persistently rises', () => {
    const result = createAutomaticInputSensitivityState({
      noiseFloorDb: -60
    });

    const recovered = updateAutomaticRepeatedly(
      result,
      -50,
      Math.ceil(MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MS / 40) + 20
    );

    expect(recovered.noiseFloorDb).toBeCloseTo(-50, 1);
    expect(recovered.ambientMedianDb).toBeCloseTo(-50, 1);
    expect(recovered.ambientUpperDb).toBeCloseTo(-50, 1);
    expect(recovered.thresholdDb).toBeCloseTo(-38, 1);
  });

  test('recovers both baseline and ambient envelope after an environment shift', () => {
    const initialBackground = [-60, -59, -58, -57, -56, -55, -54];
    const shiftedBackground = [-52, -51, -50, -49, -48, -47, -46];
    const calibrated =
      bootstrapAutomaticInputSensitivityDistribution(initialBackground);

    const recovered = updateAutomaticWithSamples(
      calibrated.state,
      shiftedBackground,
      Math.ceil(MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MS / 40) +
        MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE +
        8
    );

    expect(recovered.noiseFloorDb).toBeCloseTo(-51, 1);
    expect(recovered.ambientMedianDb).toBeCloseTo(-49, 1);
    expect(recovered.ambientUpperDb).toBeCloseTo(-47, 1);
    expect(recovered.thresholdDb).toBeGreaterThanOrEqual(-43);
  });

  test('keeps a short loud transient from redefining the floor', () => {
    let result = bootstrapAutomaticInputSensitivity(-60);

    result = updateAutomaticInputSensitivity(result.state, -30, 40);
    result = updateAutomaticInputSensitivity(result.state, -60, 40);

    expect(result.noiseFloorDb).toBeCloseTo(-60, 1);
    expect(result.thresholdDb).toBeCloseTo(-48, 1);
  });

  test('clamps automatic threshold to the supported range', () => {
    const quiet = createAutomaticInputSensitivityState({
      noiseFloorDb: -140,
      ambientUpperDb: -120
    });
    const noisy = createAutomaticInputSensitivityState({
      noiseFloorDb: -60,
      ambientUpperDb: -20
    });
    const loud = createAutomaticInputSensitivityState({ noiseFloorDb: -20 });

    expect(quiet.noiseFloorDb).toBe(-100);
    expect(quiet.thresholdDb).toBe(-88);
    expect(noisy.ambientUpperDb).toBe(-20);
    expect(noisy.thresholdDb).toBe(-24);
    expect(loud.noiseFloorDb).toBe(-45);
    expect(loud.thresholdDb).toBe(-33);
  });

  test('keeps short near-threshold peaks from pulling the floor upward', () => {
    let result = createAutomaticInputSensitivityState({ noiseFloorDb: -60 });

    for (let index = 0; index < 5; index++) {
      const next = updateAutomaticInputSensitivity(result, -49, 3);
      result = next.state;
    }

    expect(result.noiseFloorDb).toBeCloseTo(-60, 1);
    expect(result.thresholdDb).toBeGreaterThanOrEqual(-48);
  });

  test('calculates gate hysteresis from the opening threshold', () => {
    const thresholds = getMicrophoneGateThresholds(-48);

    expect(thresholds.openThresholdDb).toBe(-48);
    expect(thresholds.closeThresholdDb).toBe(
      -48 - MICROPHONE_GATE_HYSTERESIS_DB
    );
  });

  test('requires the attack window before opening from a closed gate', () => {
    let result = updateMicrophoneGateState(
      createMicrophoneGateState(),
      -47,
      -48,
      MICROPHONE_GATE_OPEN_ATTACK_MS - 1
    );

    expect(result.gateOpen).toBe(false);

    result = updateMicrophoneGateState(result.state, -47, -48, 1);

    expect(result.gateOpen).toBe(true);
  });

  test('hysteresis does not open a closed gate but can sustain an open gate', () => {
    let result = updateMicrophoneGateState(
      createMicrophoneGateState(),
      -52,
      -48,
      MICROPHONE_GATE_OPEN_ATTACK_MS
    );

    expect(result.gateOpen).toBe(false);

    result = updateMicrophoneGateState(
      result.state,
      -40,
      -48,
      MICROPHONE_GATE_OPEN_ATTACK_MS
    );

    expect(result.gateOpen).toBe(true);

    result = updateMicrophoneGateState(result.state, -52, -48, 40);

    expect(result.gateOpen).toBe(true);
  });

  test('holds and releases after the close threshold is crossed', () => {
    let result = updateMicrophoneGateState(
      createMicrophoneGateState(),
      -40,
      -48,
      MICROPHONE_GATE_OPEN_ATTACK_MS
    );

    expect(result.gateOpen).toBe(true);

    result = updateMicrophoneGateState(result.state, -52, -48, 40);
    expect(result.gateOpen).toBe(true);

    result = updateMicrophoneGateState(
      result.state,
      -70,
      -48,
      MICROPHONE_GATE_CLOSE_HOLD_MS - 1
    );
    expect(result.gateOpen).toBe(true);

    result = updateMicrophoneGateState(result.state, -70, -48, 1);
    expect(result.gateOpen).toBe(false);
    expect(result.state.releaseRemainingMs).toBe(MICROPHONE_GATE_RELEASE_MS);
  });
});
