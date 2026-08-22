import { InputSensitivityMode } from '@/types';

type TAutomaticInputSensitivityState = {
  initialized: boolean;
  noiseFloorDb: number;
  ambientMedianDb: number;
  ambientUpperDb: number;
  thresholdDb: number;
  observationBuffer: number[];
  observationIndex: number;
  observationCount: number;
  observationSampleElapsedMs: number;
  calibrationElapsedMs: number;
  digitalSilenceElapsedMs: number;
  elevatedNoiseElapsedMs: number;
};

type TAutomaticInputSensitivityCalibration = {
  noiseFloorDb?: number;
  ambientMedianDb?: number;
  ambientUpperDb?: number;
  noiseCeilingDb?: number;
  ambientSpreadDb?: number;
  quietSpeechDb?: number;
};

type TAutomaticInputSensitivityResult = {
  state: TAutomaticInputSensitivityState;
  noiseFloorDb: number | null;
  ambientMedianDb: number | null;
  ambientUpperDb: number | null;
  thresholdDb: number;
  isSpeechLike: boolean;
  backgroundFrozen: boolean;
  digitalSilence: boolean;
};

type TAutomaticInputSensitivityUpdateOptions = {
  vad2SpeechActive?: boolean | null;
  vad3SpeechActive?: boolean | null;
  gateOpen?: boolean;
};

type TAutomaticHybridDecision = {
  snrDb: number | null;
  levelAboveAmbientDb: number | null;
  strongSpeechEvidence: boolean;
  speechEvidence: boolean;
  eligibleToOpen: boolean;
  backgroundFrozen: boolean;
  digitalSilence: boolean;
  hasTrustedBackground: boolean;
};

type TAutomaticHybridObserverState = {
  recentVad3Speech: boolean;
  timeSinceLastVad3SpeechMs: number | null;
  vad2OnlyDurationMs: number;
  candidateAuthenticatedSpeech: boolean;
  candidateStrictOpen: boolean;
  candidateDropoutElapsedMs: number;
  vad3Window: boolean[];
  vad3WindowIndex: number;
  vad3WindowCount: number;
  vad3Hits120Ms: number;
  vad3Hits200Ms: number;
  vad3ConsecutiveFrames: number;
  candidateBurstAAuthenticated: boolean;
  candidateBurstBAuthenticated: boolean;
  candidateBurstAOpen: boolean;
  candidateBurstBOpen: boolean;
  candidateBurstAOnsetMs: number | null;
  candidateBurstBOnsetMs: number | null;
  candidateBurstADropoutElapsedMs: number;
  candidateBurstBDropoutElapsedMs: number;
  utteranceActive: boolean;
  utteranceElapsedMs: number | null;
  maxVad3Hits120SinceReport: number;
  maxVad3Hits200SinceReport: number;
  burstATriggeredSinceReport: boolean;
  burstBTriggeredSinceReport: boolean;
};

type TMicrophoneInputMeterSource = 'idle' | 'settings' | 'test' | 'voice';

type TMicrophoneInputMeterSnapshot = {
  decibels: number;
  currentLevelDb: number;
  peakLevelDb: number;
  level: number;
  inputSensitivityMode: InputSensitivityMode;
  thresholdDb: number | null;
  noiseFloorDb: number | null;
  ambientUpperDb: number | null;
  gateOpen: boolean;
  vad2SpeechActive: boolean | null;
  vad3SpeechActive: boolean | null;
  snrDb: number | null;
  strongSpeechEvidence: boolean | null;
  speechEvidence: boolean | null;
  eligibleToOpen: boolean | null;
  recentVad3Speech: boolean | null;
  timeSinceLastVad3SpeechMs: number | null;
  vad2OnlyDurationMs: number | null;
  candidateAuthenticatedSpeech: boolean | null;
  candidateStrictOpen: boolean | null;
  vad3Hits120Ms: number | null;
  vad3Hits200Ms: number | null;
  vad3ConsecutiveFrames: number | null;
  candidateBurstAAuthenticated: boolean | null;
  candidateBurstBAuthenticated: boolean | null;
  candidateBurstAOpen: boolean | null;
  candidateBurstBOpen: boolean | null;
  candidateBurstAOnsetMs: number | null;
  candidateBurstBOnsetMs: number | null;
  utteranceActive: boolean | null;
  utteranceElapsedMs: number | null;
  maxVad3Hits120SinceReport: number | null;
  maxVad3Hits200SinceReport: number | null;
  burstATriggeredSinceReport: boolean | null;
  burstBTriggeredSinceReport: boolean | null;
  backgroundFrozen: boolean | null;
  digitalSilence: boolean | null;
  vadSampleRate: number | null;
  vadFrameMs: number | null;
  source: TMicrophoneInputMeterSource;
  updatedAt: number;
};

const MICROPHONE_LEVEL_METER_MIN_DB = -100;
const MICROPHONE_LEVEL_METER_MAX_DB = 0;
const MICROPHONE_GATE_DEFAULT_THRESHOLD_DB = -48;
const MICROPHONE_GATE_HYSTERESIS_DB = 6;
const MICROPHONE_GATE_OPEN_ATTACK_MS = 10;
const MICROPHONE_GATE_CLOSE_HOLD_MS = 250;
const MICROPHONE_GATE_RELEASE_MS = 120;
const MICROPHONE_TEST_LEVEL_SAMPLE_INTERVAL_MS = 20;
const MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS = 40;
const MICROPHONE_NOISE_GATE_WORKLET_NAME = 'sharkord-noise-gate';
const MICROPHONE_AUDIO_METER_WORKLET_NAME = 'sharkord-audio-meter';
const MICROPHONE_AUTO_NOISE_FLOOR_INITIAL_DB = -90;
const MICROPHONE_AUTO_NOISE_FLOOR_MAX_DB = -45;
const MICROPHONE_AUTO_THRESHOLD_MARGIN_DB = 12;
const MICROPHONE_AUTO_THRESHOLD_MIN_DB = -90;
const MICROPHONE_AUTO_THRESHOLD_MAX_DB = -24;
const MICROPHONE_AUTO_SPEECH_GUARD_DB = 16;
const MICROPHONE_AUTO_FLOOR_DOWN_TIME_CONSTANT_MS = 250;
const MICROPHONE_AUTO_FLOOR_UP_TIME_CONSTANT_MS = 8000;
const MICROPHONE_AUTO_THRESHOLD_TIME_CONSTANT_MS = 350;
const MICROPHONE_AUTO_DIGITAL_SILENCE_CUTOFF_DB = -88;
const MICROPHONE_AUTO_DIGITAL_SILENCE_RESET_MS = 600;
const MICROPHONE_AUTO_BOOTSTRAP_MS = 1200;
const MICROPHONE_AUTO_OBSERVATION_SAMPLE_INTERVAL_MS = 20;
const MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE = 64;
const MICROPHONE_AUTO_OBSERVATION_MIN_SAMPLES = 12;
const MICROPHONE_AUTO_NOISE_FLOOR_PERCENTILE = 0.25;
const MICROPHONE_AUTO_AMBIENT_MEDIAN_PERCENTILE = 0.5;
const MICROPHONE_AUTO_AMBIENT_UPPER_PERCENTILE = 0.85;
const MICROPHONE_AUTO_AMBIENT_GUARD_DB = 4;
const MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MS = 3000;
const MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_RISE_DB = 6;
const MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MAX_ABOVE_THRESHOLD_DB = 6;
const MICROPHONE_AUTO_STRONG_SPEECH_MIN_SNR_DB = 4;
const MICROPHONE_AUTO_STRONG_SPEECH_MIN_ABOVE_AMBIENT_DB = 1;
const MICROPHONE_AUTO_SPEECH_MIN_SNR_DB = 6;
const MICROPHONE_AUTO_SPEECH_MIN_ABOVE_AMBIENT_DB = 3;
const MICROPHONE_AUTO_OBSERVER_RECENT_VAD3_MS = 120;
const MICROPHONE_AUTO_OBSERVER_DROPOUT_GRACE_MS = 100;
const MICROPHONE_AUTO_OBSERVER_BURST_A_WINDOW_FRAMES = 6;
const MICROPHONE_AUTO_OBSERVER_BURST_A_MIN_VAD3_FRAMES = 2;
const MICROPHONE_AUTO_OBSERVER_BURST_B_WINDOW_FRAMES = 10;
const MICROPHONE_AUTO_OBSERVER_BURST_B_MIN_VAD3_FRAMES = 3;

type TAutomaticObservationStats = {
  noiseFloorDb: number;
  ambientMedianDb: number;
  ambientUpperDb: number;
};

type TMicrophoneGateState = {
  gateOpen: boolean;
  openConfirmationMs: number;
  closeHoldRemainingMs: number;
  releaseRemainingMs: number;
};

type TMicrophoneGateUpdateResult = {
  state: TMicrophoneGateState;
  openThresholdDb: number;
  closeThresholdDb: number;
  gateOpen: boolean;
};

const clampMicrophoneDecibels = (decibels: number) =>
  Math.max(
    MICROPHONE_LEVEL_METER_MIN_DB,
    Math.min(MICROPHONE_LEVEL_METER_MAX_DB, decibels)
  );

const clampAutomaticNoiseFloorDecibels = (decibels: number) =>
  Math.max(
    MICROPHONE_LEVEL_METER_MIN_DB,
    Math.min(MICROPHONE_AUTO_NOISE_FLOOR_MAX_DB, decibels)
  );

const clampAutomaticThresholdDecibels = (decibels: number) =>
  Math.max(
    MICROPHONE_AUTO_THRESHOLD_MIN_DB,
    Math.min(MICROPHONE_AUTO_THRESHOLD_MAX_DB, decibels)
  );

const microphoneDecibelsToPercent = (decibels: number) =>
  ((clampMicrophoneDecibels(decibels) - MICROPHONE_LEVEL_METER_MIN_DB) /
    (MICROPHONE_LEVEL_METER_MAX_DB - MICROPHONE_LEVEL_METER_MIN_DB)) *
  100;

const createMicrophoneGateState = (): TMicrophoneGateState => ({
  gateOpen: false,
  openConfirmationMs: 0,
  closeHoldRemainingMs: 0,
  releaseRemainingMs: 0
});

const getMicrophoneGateThresholds = (thresholdDb: number) => {
  const openThresholdDb = clampMicrophoneDecibels(thresholdDb);
  const closeThresholdDb = clampMicrophoneDecibels(
    openThresholdDb - MICROPHONE_GATE_HYSTERESIS_DB
  );

  return {
    openThresholdDb,
    closeThresholdDb
  };
};

const updateMicrophoneGateState = (
  state: TMicrophoneGateState,
  decibels: number,
  thresholdDb: number,
  elapsedMs: number
): TMicrophoneGateUpdateResult => {
  const clampedDecibels = clampMicrophoneDecibels(decibels);
  const { openThresholdDb, closeThresholdDb } =
    getMicrophoneGateThresholds(thresholdDb);

  if (clampedDecibels >= openThresholdDb) {
    const openConfirmationMs = state.gateOpen
      ? MICROPHONE_GATE_OPEN_ATTACK_MS
      : state.openConfirmationMs + Math.max(0, elapsedMs);
    const gateOpen =
      state.gateOpen || openConfirmationMs >= MICROPHONE_GATE_OPEN_ATTACK_MS;

    return {
      state: {
        gateOpen,
        openConfirmationMs,
        closeHoldRemainingMs: gateOpen
          ? MICROPHONE_GATE_CLOSE_HOLD_MS
          : state.closeHoldRemainingMs,
        releaseRemainingMs: gateOpen ? 0 : state.releaseRemainingMs
      },
      openThresholdDb,
      closeThresholdDb,
      gateOpen
    };
  }

  if (!state.gateOpen) {
    return {
      state: {
        gateOpen: false,
        openConfirmationMs: 0,
        closeHoldRemainingMs: 0,
        releaseRemainingMs: Math.max(
          0,
          state.releaseRemainingMs - Math.max(0, elapsedMs)
        )
      },
      openThresholdDb,
      closeThresholdDb,
      gateOpen: false
    };
  }

  const closeHoldRemainingMs =
    clampedDecibels >= closeThresholdDb
      ? MICROPHONE_GATE_CLOSE_HOLD_MS
      : Math.max(0, state.closeHoldRemainingMs - Math.max(0, elapsedMs));
  const gateOpen = closeHoldRemainingMs > 0;

  return {
    state: {
      gateOpen,
      openConfirmationMs: 0,
      closeHoldRemainingMs,
      releaseRemainingMs: gateOpen ? 0 : MICROPHONE_GATE_RELEASE_MS
    },
    openThresholdDb,
    closeThresholdDb,
    gateOpen
  };
};

const getSmoothingAlpha = (elapsedMs: number, timeConstantMs: number) => {
  if (elapsedMs <= 0) return 0;

  return 1 - Math.exp(-elapsedMs / timeConstantMs);
};

const getAutomaticDefaultThresholdDb = () =>
  clampAutomaticThresholdDecibels(MICROPHONE_GATE_DEFAULT_THRESHOLD_DB);

const getAutomaticThresholdDb = ({
  noiseFloorDb,
  ambientUpperDb
}: {
  noiseFloorDb: number;
  ambientUpperDb: number;
}) =>
  clampAutomaticThresholdDecibels(
    Math.max(
      noiseFloorDb + MICROPHONE_AUTO_THRESHOLD_MARGIN_DB,
      ambientUpperDb + MICROPHONE_AUTO_AMBIENT_GUARD_DB
    )
  );

const createAutomaticObservationBuffer = () =>
  Array<number>(MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE).fill(
    MICROPHONE_LEVEL_METER_MIN_DB
  );

const addAutomaticObservationSample = (
  state: TAutomaticInputSensitivityState,
  decibels: number,
  elapsedMs: number
): TAutomaticInputSensitivityState => {
  const observationSampleElapsedMs =
    state.observationSampleElapsedMs + Math.max(0, elapsedMs);

  if (
    observationSampleElapsedMs < MICROPHONE_AUTO_OBSERVATION_SAMPLE_INTERVAL_MS
  ) {
    return {
      ...state,
      observationSampleElapsedMs
    };
  }

  const observationBuffer = state.observationBuffer.slice();

  observationBuffer[state.observationIndex] = decibels;

  return {
    ...state,
    observationBuffer,
    observationIndex:
      (state.observationIndex + 1) % MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE,
    observationCount: Math.min(
      state.observationCount + 1,
      MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE
    ),
    observationSampleElapsedMs:
      observationSampleElapsedMs %
      MICROPHONE_AUTO_OBSERVATION_SAMPLE_INTERVAL_MS
  };
};

const resetAutomaticObservation = (
  state: TAutomaticInputSensitivityState
): TAutomaticInputSensitivityState => ({
  ...state,
  observationBuffer: createAutomaticObservationBuffer(),
  observationIndex: 0,
  observationCount: 0,
  observationSampleElapsedMs: 0,
  calibrationElapsedMs: 0,
  elevatedNoiseElapsedMs: 0
});

const getAutomaticPercentileValue = (sorted: number[], percentile: number) => {
  const percentileIndex = Math.floor((sorted.length - 1) * percentile);

  return clampMicrophoneDecibels(sorted[percentileIndex]);
};

const getAutomaticObservationStats = (
  state: TAutomaticInputSensitivityState
): TAutomaticObservationStats | null => {
  if (state.observationCount < MICROPHONE_AUTO_OBSERVATION_MIN_SAMPLES) {
    return null;
  }

  const sorted = state.observationBuffer
    .slice(0, state.observationCount)
    .sort((a, b) => a - b);

  return {
    noiseFloorDb: getAutomaticPercentileValue(
      sorted,
      MICROPHONE_AUTO_NOISE_FLOOR_PERCENTILE
    ),
    ambientMedianDb: getAutomaticPercentileValue(
      sorted,
      MICROPHONE_AUTO_AMBIENT_MEDIAN_PERCENTILE
    ),
    ambientUpperDb: getAutomaticPercentileValue(
      sorted,
      MICROPHONE_AUTO_AMBIENT_UPPER_PERCENTILE
    )
  };
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const createAutomaticInputSensitivityState = (
  calibration: TAutomaticInputSensitivityCalibration = {}
): TAutomaticInputSensitivityState => {
  const calibratedNoiseFloorDb = calibration.noiseFloorDb;
  const calibratedAmbientMedianDb = calibration.ambientMedianDb;
  const calibratedAmbientUpperDb = calibration.ambientUpperDb;
  const calibratedNoiseCeilingDb = calibration.noiseCeilingDb;
  const hasCalibratedNoiseFloor = isFiniteNumber(calibratedNoiseFloorDb);
  const noiseFloorDb = hasCalibratedNoiseFloor
    ? clampAutomaticNoiseFloorDecibels(calibratedNoiseFloorDb)
    : MICROPHONE_AUTO_NOISE_FLOOR_INITIAL_DB;
  const ambientMedianDb = isFiniteNumber(calibratedAmbientMedianDb)
    ? clampMicrophoneDecibels(calibratedAmbientMedianDb)
    : noiseFloorDb;
  const ambientUpperDb = isFiniteNumber(calibratedAmbientUpperDb)
    ? clampMicrophoneDecibels(calibratedAmbientUpperDb)
    : isFiniteNumber(calibratedNoiseCeilingDb)
      ? clampMicrophoneDecibels(calibratedNoiseCeilingDb)
      : noiseFloorDb;

  return {
    initialized: hasCalibratedNoiseFloor,
    noiseFloorDb,
    ambientMedianDb,
    ambientUpperDb,
    thresholdDb: hasCalibratedNoiseFloor
      ? getAutomaticThresholdDb({ noiseFloorDb, ambientUpperDb })
      : getAutomaticDefaultThresholdDb(),
    observationBuffer: createAutomaticObservationBuffer(),
    observationIndex: 0,
    observationCount: 0,
    observationSampleElapsedMs: 0,
    calibrationElapsedMs: hasCalibratedNoiseFloor
      ? MICROPHONE_AUTO_BOOTSTRAP_MS
      : 0,
    digitalSilenceElapsedMs: 0,
    elevatedNoiseElapsedMs: 0
  };
};

const getAutomaticInputSensitivityResult = (
  state: TAutomaticInputSensitivityState,
  isSpeechLike: boolean,
  {
    backgroundFrozen = false,
    digitalSilence = false
  }: {
    backgroundFrozen?: boolean;
    digitalSilence?: boolean;
  } = {}
): TAutomaticInputSensitivityResult => ({
  state,
  noiseFloorDb: state.initialized ? state.noiseFloorDb : null,
  ambientMedianDb: state.initialized ? state.ambientMedianDb : null,
  ambientUpperDb: state.initialized ? state.ambientUpperDb : null,
  thresholdDb: state.thresholdDb,
  isSpeechLike,
  backgroundFrozen,
  digitalSilence
});

const getDigitalSilenceAutomaticInputSensitivityState = (
  state: TAutomaticInputSensitivityState,
  digitalSilenceElapsedMs: number
): TAutomaticInputSensitivityState => ({
  ...resetAutomaticObservation(state),
  digitalSilenceElapsedMs
});

const hasVadSpeechEvidence = ({
  vad2SpeechActive,
  vad3SpeechActive
}: Pick<
  TAutomaticInputSensitivityUpdateOptions,
  'vad2SpeechActive' | 'vad3SpeechActive'
>) =>
  typeof vad2SpeechActive === 'boolean' &&
  typeof vad3SpeechActive === 'boolean';

const getAutomaticHybridDecision = ({
  decibels,
  noiseFloorDb,
  ambientUpperDb,
  gateOpen,
  vad2SpeechActive,
  vad3SpeechActive,
  candidateBurstAAuthenticated = null
}: {
  decibels: number;
  noiseFloorDb: number | null;
  ambientUpperDb: number | null;
  gateOpen: boolean;
  vad2SpeechActive: boolean | null;
  vad3SpeechActive: boolean | null;
  candidateBurstAAuthenticated?: boolean | null;
}): TAutomaticHybridDecision => {
  const clampedDecibels = clampMicrophoneDecibels(decibels);
  const strongSpeechEvidence = vad3SpeechActive === true;
  const speechEvidence = vad2SpeechActive === true;
  const digitalSilence =
    clampedDecibels <= MICROPHONE_AUTO_DIGITAL_SILENCE_CUTOFF_DB;
  const hasTrustedBackground =
    isFiniteNumber(noiseFloorDb) && isFiniteNumber(ambientUpperDb);
  const snrDb = hasTrustedBackground ? clampedDecibels - noiseFloorDb : null;
  const levelAboveAmbientDb = hasTrustedBackground
    ? clampedDecibels - ambientUpperDb
    : null;
  const hasStrongSpeechContext =
    snrDb !== null &&
    levelAboveAmbientDb !== null &&
    snrDb >= MICROPHONE_AUTO_STRONG_SPEECH_MIN_SNR_DB &&
    levelAboveAmbientDb >= MICROPHONE_AUTO_STRONG_SPEECH_MIN_ABOVE_AMBIENT_DB;
  const hasSpeechContext =
    snrDb !== null &&
    levelAboveAmbientDb !== null &&
    snrDb >= MICROPHONE_AUTO_SPEECH_MIN_SNR_DB &&
    levelAboveAmbientDb >= MICROPHONE_AUTO_SPEECH_MIN_ABOVE_AMBIENT_DB;
  const hasCandidateAState = typeof candidateBurstAAuthenticated === 'boolean';
  const legacyEligibleToOpen =
    (strongSpeechEvidence && hasStrongSpeechContext) ||
    (speechEvidence && hasSpeechContext);

  return {
    snrDb,
    levelAboveAmbientDb,
    strongSpeechEvidence,
    speechEvidence,
    eligibleToOpen:
      !digitalSilence &&
      (hasCandidateAState
        ? candidateBurstAAuthenticated
        : legacyEligibleToOpen),
    backgroundFrozen:
      digitalSilence || gateOpen || speechEvidence || strongSpeechEvidence,
    digitalSilence,
    hasTrustedBackground
  };
};

const getAutomaticHybridGateSignal = ({
  gateOpen,
  decision
}: {
  gateOpen: boolean;
  decision: TAutomaticHybridDecision;
}) =>
  gateOpen
    ? decision.speechEvidence || decision.strongSpeechEvidence
    : decision.eligibleToOpen;

const createAutomaticHybridObserverState =
  (): TAutomaticHybridObserverState => ({
    recentVad3Speech: false,
    timeSinceLastVad3SpeechMs: null,
    vad2OnlyDurationMs: 0,
    candidateAuthenticatedSpeech: false,
    candidateStrictOpen: false,
    candidateDropoutElapsedMs: 0,
    vad3Window: Array.from(
      { length: MICROPHONE_AUTO_OBSERVER_BURST_B_WINDOW_FRAMES },
      () => false
    ),
    vad3WindowIndex: 0,
    vad3WindowCount: 0,
    vad3Hits120Ms: 0,
    vad3Hits200Ms: 0,
    vad3ConsecutiveFrames: 0,
    candidateBurstAAuthenticated: false,
    candidateBurstBAuthenticated: false,
    candidateBurstAOpen: false,
    candidateBurstBOpen: false,
    candidateBurstAOnsetMs: null,
    candidateBurstBOnsetMs: null,
    candidateBurstADropoutElapsedMs: 0,
    candidateBurstBDropoutElapsedMs: 0,
    utteranceActive: false,
    utteranceElapsedMs: null,
    maxVad3Hits120SinceReport: 0,
    maxVad3Hits200SinceReport: 0,
    burstATriggeredSinceReport: false,
    burstBTriggeredSinceReport: false
  });

const getAutomaticHybridObserverVad3Hits = (
  vad3Window: boolean[],
  vad3WindowIndex: number,
  vad3WindowCount: number,
  windowFrames: number
) => {
  let hits = 0;
  const framesToRead = Math.min(vad3WindowCount, windowFrames);

  for (let offset = 0; offset < framesToRead; offset++) {
    const index =
      (vad3WindowIndex - 1 - offset + vad3Window.length) % vad3Window.length;

    if (vad3Window[index]) {
      hits += 1;
    }
  }

  return hits;
};

const updateAutomaticHybridObserverState = (
  state: TAutomaticHybridObserverState,
  elapsedMs: number,
  {
    vad2SpeechActive,
    vad3SpeechActive
  }: Pick<
    TAutomaticInputSensitivityUpdateOptions,
    'vad2SpeechActive' | 'vad3SpeechActive'
  >
): TAutomaticHybridObserverState => {
  const elapsed = Math.max(0, elapsedMs);
  const vad2Active = vad2SpeechActive === true;
  const vad3Active = vad3SpeechActive === true;
  const timeSinceLastVad3SpeechMs = vad3Active
    ? 0
    : state.timeSinceLastVad3SpeechMs === null
      ? null
      : state.timeSinceLastVad3SpeechMs + elapsed;
  const recentVad3Speech =
    timeSinceLastVad3SpeechMs !== null &&
    timeSinceLastVad3SpeechMs <= MICROPHONE_AUTO_OBSERVER_RECENT_VAD3_MS;
  let vad2OnlyDurationMs = state.vad2OnlyDurationMs;
  let candidateAuthenticatedSpeech = state.candidateAuthenticatedSpeech;
  let candidateDropoutElapsedMs = state.candidateDropoutElapsedMs;
  const vad3Window = [...state.vad3Window];
  const vad3WindowIndex =
    (state.vad3WindowIndex + 1) %
    MICROPHONE_AUTO_OBSERVER_BURST_B_WINDOW_FRAMES;
  const vad3WindowCount = Math.min(
    state.vad3WindowCount + 1,
    MICROPHONE_AUTO_OBSERVER_BURST_B_WINDOW_FRAMES
  );
  const speechLikeFrame = vad2Active || vad3Active;
  let utteranceActive = state.utteranceActive;
  let utteranceElapsedMs = state.utteranceElapsedMs;

  vad3Window[state.vad3WindowIndex] = vad3Active;

  const vad3Hits120Ms = getAutomaticHybridObserverVad3Hits(
    vad3Window,
    vad3WindowIndex,
    vad3WindowCount,
    MICROPHONE_AUTO_OBSERVER_BURST_A_WINDOW_FRAMES
  );
  const vad3Hits200Ms = getAutomaticHybridObserverVad3Hits(
    vad3Window,
    vad3WindowIndex,
    vad3WindowCount,
    MICROPHONE_AUTO_OBSERVER_BURST_B_WINDOW_FRAMES
  );
  const vad3ConsecutiveFrames = vad3Active
    ? state.vad3ConsecutiveFrames + 1
    : 0;

  if (utteranceActive) {
    utteranceElapsedMs = (utteranceElapsedMs ?? 0) + elapsed;
  } else if (speechLikeFrame) {
    utteranceActive = true;
    utteranceElapsedMs = 0;
  } else {
    utteranceElapsedMs = null;
  }

  if (!candidateAuthenticatedSpeech && !vad3Active) {
    vad2OnlyDurationMs =
      vad2Active && !vad3Active ? vad2OnlyDurationMs + elapsed : 0;
  }

  if (vad3Active) {
    candidateAuthenticatedSpeech = true;
    candidateDropoutElapsedMs = 0;
  } else if (candidateAuthenticatedSpeech && vad2Active) {
    candidateDropoutElapsedMs = 0;
  } else if (candidateAuthenticatedSpeech) {
    candidateDropoutElapsedMs += elapsed;

    if (candidateDropoutElapsedMs > MICROPHONE_AUTO_OBSERVER_DROPOUT_GRACE_MS) {
      candidateAuthenticatedSpeech = false;
      candidateDropoutElapsedMs = 0;
      vad2OnlyDurationMs = 0;
    }
  } else {
    candidateDropoutElapsedMs = 0;
  }

  let candidateBurstAAuthenticated = state.candidateBurstAAuthenticated;
  let candidateBurstBAuthenticated = state.candidateBurstBAuthenticated;
  let candidateBurstAOnsetMs = state.candidateBurstAOnsetMs;
  let candidateBurstBOnsetMs = state.candidateBurstBOnsetMs;
  let candidateBurstADropoutElapsedMs = state.candidateBurstADropoutElapsedMs;
  let candidateBurstBDropoutElapsedMs = state.candidateBurstBDropoutElapsedMs;
  const burstATriggered =
    !candidateBurstAAuthenticated &&
    vad3Active &&
    vad3Hits120Ms >= MICROPHONE_AUTO_OBSERVER_BURST_A_MIN_VAD3_FRAMES;
  const burstBTriggered =
    !candidateBurstBAuthenticated &&
    vad3Active &&
    vad3Hits200Ms >= MICROPHONE_AUTO_OBSERVER_BURST_B_MIN_VAD3_FRAMES;

  if (burstATriggered) {
    candidateBurstAAuthenticated = true;
    if (candidateBurstAOnsetMs === null) {
      candidateBurstAOnsetMs = utteranceElapsedMs ?? 0;
    }
    candidateBurstADropoutElapsedMs = 0;
  } else if (candidateBurstAAuthenticated && speechLikeFrame) {
    candidateBurstADropoutElapsedMs = 0;
  } else if (candidateBurstAAuthenticated) {
    candidateBurstADropoutElapsedMs += elapsed;

    if (
      candidateBurstADropoutElapsedMs >
      MICROPHONE_AUTO_OBSERVER_DROPOUT_GRACE_MS
    ) {
      candidateBurstAAuthenticated = false;
      candidateBurstADropoutElapsedMs = 0;
    }
  } else {
    candidateBurstADropoutElapsedMs = 0;
  }

  if (burstBTriggered) {
    candidateBurstBAuthenticated = true;
    if (candidateBurstBOnsetMs === null) {
      candidateBurstBOnsetMs = utteranceElapsedMs ?? 0;
    }
    candidateBurstBDropoutElapsedMs = 0;
  } else if (candidateBurstBAuthenticated && speechLikeFrame) {
    candidateBurstBDropoutElapsedMs = 0;
  } else if (candidateBurstBAuthenticated) {
    candidateBurstBDropoutElapsedMs += elapsed;

    if (
      candidateBurstBDropoutElapsedMs >
      MICROPHONE_AUTO_OBSERVER_DROPOUT_GRACE_MS
    ) {
      candidateBurstBAuthenticated = false;
      candidateBurstBDropoutElapsedMs = 0;
    }
  } else {
    candidateBurstBDropoutElapsedMs = 0;
  }

  if (
    !speechLikeFrame &&
    vad3Hits200Ms === 0 &&
    !candidateAuthenticatedSpeech &&
    !candidateBurstAAuthenticated &&
    !candidateBurstBAuthenticated
  ) {
    utteranceActive = false;
    utteranceElapsedMs = null;
    candidateBurstAOnsetMs = null;
    candidateBurstBOnsetMs = null;
  }

  return {
    recentVad3Speech,
    timeSinceLastVad3SpeechMs,
    vad2OnlyDurationMs,
    candidateAuthenticatedSpeech,
    candidateStrictOpen: candidateAuthenticatedSpeech,
    candidateDropoutElapsedMs,
    vad3Window,
    vad3WindowIndex,
    vad3WindowCount,
    vad3Hits120Ms,
    vad3Hits200Ms,
    vad3ConsecutiveFrames,
    candidateBurstAAuthenticated,
    candidateBurstBAuthenticated,
    candidateBurstAOpen: candidateBurstAAuthenticated,
    candidateBurstBOpen: candidateBurstBAuthenticated,
    candidateBurstAOnsetMs,
    candidateBurstBOnsetMs,
    candidateBurstADropoutElapsedMs,
    candidateBurstBDropoutElapsedMs,
    utteranceActive,
    utteranceElapsedMs,
    maxVad3Hits120SinceReport: Math.max(
      state.maxVad3Hits120SinceReport,
      vad3Hits120Ms
    ),
    maxVad3Hits200SinceReport: Math.max(
      state.maxVad3Hits200SinceReport,
      vad3Hits200Ms
    ),
    burstATriggeredSinceReport:
      state.burstATriggeredSinceReport || burstATriggered,
    burstBTriggeredSinceReport:
      state.burstBTriggeredSinceReport || burstBTriggered
  };
};

const resetAutomaticHybridObserverReportState = (
  state: TAutomaticHybridObserverState
): TAutomaticHybridObserverState => ({
  ...state,
  maxVad3Hits120SinceReport: 0,
  maxVad3Hits200SinceReport: 0,
  burstATriggeredSinceReport: false,
  burstBTriggeredSinceReport: false
});

const updateAutomaticInputSensitivity = (
  state: TAutomaticInputSensitivityState,
  decibels: number,
  elapsedMs: number,
  options: TAutomaticInputSensitivityUpdateOptions = {}
): TAutomaticInputSensitivityResult => {
  const clampedDecibels = clampMicrophoneDecibels(decibels);
  const elapsed = Math.max(0, elapsedMs);
  const isDigitalSilence =
    clampedDecibels <= MICROPHONE_AUTO_DIGITAL_SILENCE_CUTOFF_DB;
  const hasVadEvidence = hasVadSpeechEvidence(options);
  const vadSpeechActive =
    hasVadEvidence &&
    (options.vad2SpeechActive === true || options.vad3SpeechActive === true);
  const gateOpen = options.gateOpen === true;
  const backgroundFrozen =
    isDigitalSilence || (hasVadEvidence && (vadSpeechActive || gateOpen));

  if (isDigitalSilence) {
    const digitalSilenceElapsedMs = state.digitalSilenceElapsedMs + elapsed;
    const nextState =
      digitalSilenceElapsedMs >= MICROPHONE_AUTO_DIGITAL_SILENCE_RESET_MS
        ? getDigitalSilenceAutomaticInputSensitivityState(
            state,
            digitalSilenceElapsedMs
          )
        : {
            ...state,
            digitalSilenceElapsedMs
          };

    return getAutomaticInputSensitivityResult(nextState, false, {
      backgroundFrozen: true,
      digitalSilence: true
    });
  }

  let nextState = {
    ...state,
    digitalSilenceElapsedMs: 0
  };

  if (!nextState.initialized && !backgroundFrozen) {
    nextState = addAutomaticObservationSample(
      nextState,
      clampedDecibels,
      elapsed
    );
  }

  if (!nextState.initialized) {
    const calibrationElapsedMs = nextState.calibrationElapsedMs + elapsed;
    const observationStats = getAutomaticObservationStats(nextState);

    if (
      observationStats !== null &&
      calibrationElapsedMs >= MICROPHONE_AUTO_BOOTSTRAP_MS
    ) {
      const noiseFloorDb = clampAutomaticNoiseFloorDecibels(
        observationStats.noiseFloorDb
      );
      const ambientMedianDb = observationStats.ambientMedianDb;
      const ambientUpperDb = observationStats.ambientUpperDb;
      const thresholdDb = getAutomaticThresholdDb({
        noiseFloorDb,
        ambientUpperDb
      });

      nextState = {
        ...nextState,
        initialized: true,
        noiseFloorDb,
        ambientMedianDb,
        ambientUpperDb,
        thresholdDb,
        calibrationElapsedMs,
        elevatedNoiseElapsedMs: 0
      };

      return getAutomaticInputSensitivityResult(nextState, false, {
        backgroundFrozen
      });
    }

    nextState = {
      ...nextState,
      calibrationElapsedMs: backgroundFrozen
        ? nextState.calibrationElapsedMs
        : calibrationElapsedMs
    };

    return getAutomaticInputSensitivityResult(nextState, false, {
      backgroundFrozen
    });
  }

  const speechThresholdDb = Math.max(
    nextState.thresholdDb,
    nextState.noiseFloorDb + MICROPHONE_AUTO_SPEECH_GUARD_DB
  );
  const isSpeechLike = clampedDecibels >= speechThresholdDb;
  const shouldUpdateBackgroundModel = hasVadEvidence
    ? !backgroundFrozen
    : !isSpeechLike || clampedDecibels < nextState.noiseFloorDb;

  if (shouldUpdateBackgroundModel) {
    nextState = addAutomaticObservationSample(
      nextState,
      clampedDecibels,
      elapsed
    );
  }

  const observationStats = getAutomaticObservationStats(nextState);
  let noiseFloorDb = nextState.noiseFloorDb;
  let ambientMedianDb = nextState.ambientMedianDb;
  let ambientUpperDb = nextState.ambientUpperDb;
  const shouldRecoverElevatedNoise =
    shouldUpdateBackgroundModel &&
    observationStats !== null &&
    (observationStats.noiseFloorDb >
      nextState.noiseFloorDb + MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_RISE_DB ||
      observationStats.ambientUpperDb >
        nextState.ambientUpperDb +
          MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_RISE_DB) &&
    observationStats.ambientUpperDb <=
      nextState.thresholdDb +
        MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MAX_ABOVE_THRESHOLD_DB;

  if (
    shouldUpdateBackgroundModel &&
    observationStats !== null &&
    !shouldRecoverElevatedNoise
  ) {
    const timeConstantMs =
      observationStats.noiseFloorDb < noiseFloorDb
        ? MICROPHONE_AUTO_FLOOR_DOWN_TIME_CONSTANT_MS
        : MICROPHONE_AUTO_FLOOR_UP_TIME_CONSTANT_MS;
    const floorAlpha = getSmoothingAlpha(elapsed, timeConstantMs);
    const ambientAlpha = getSmoothingAlpha(
      elapsed,
      MICROPHONE_AUTO_THRESHOLD_TIME_CONSTANT_MS
    );

    noiseFloorDb = clampAutomaticNoiseFloorDecibels(
      noiseFloorDb + (observationStats.noiseFloorDb - noiseFloorDb) * floorAlpha
    );
    ambientMedianDb = clampMicrophoneDecibels(
      ambientMedianDb +
        (observationStats.ambientMedianDb - ambientMedianDb) * ambientAlpha
    );
    ambientUpperDb = clampMicrophoneDecibels(
      ambientUpperDb +
        (observationStats.ambientUpperDb - ambientUpperDb) * ambientAlpha
    );
  }

  let elevatedNoiseElapsedMs = shouldRecoverElevatedNoise
    ? nextState.elevatedNoiseElapsedMs + elapsed
    : 0;
  const recoveredElevatedNoise =
    elevatedNoiseElapsedMs >= MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MS &&
    observationStats !== null;

  if (recoveredElevatedNoise) {
    noiseFloorDb = clampAutomaticNoiseFloorDecibels(
      observationStats.noiseFloorDb
    );
    ambientMedianDb = observationStats.ambientMedianDb;
    ambientUpperDb = observationStats.ambientUpperDb;
    elevatedNoiseElapsedMs = 0;
  }

  const targetThresholdDb = getAutomaticThresholdDb({
    noiseFloorDb,
    ambientUpperDb
  });
  const thresholdAlpha = getSmoothingAlpha(
    elapsed,
    MICROPHONE_AUTO_THRESHOLD_TIME_CONSTANT_MS
  );
  const thresholdDb = recoveredElevatedNoise
    ? targetThresholdDb
    : clampAutomaticThresholdDecibels(
        nextState.thresholdDb +
          (targetThresholdDb - nextState.thresholdDb) * thresholdAlpha
      );

  nextState = {
    ...nextState,
    initialized: true,
    noiseFloorDb,
    ambientMedianDb,
    ambientUpperDb,
    thresholdDb,
    elevatedNoiseElapsedMs
  };

  return getAutomaticInputSensitivityResult(nextState, isSpeechLike, {
    backgroundFrozen
  });
};

const isInputSensitivityMode = (
  value: unknown
): value is InputSensitivityMode =>
  Object.values(InputSensitivityMode).includes(value as InputSensitivityMode);

const inputSensitivityModeUsesGate = (mode: InputSensitivityMode) =>
  mode !== InputSensitivityMode.OPEN;

const createMicrophoneInputMeterSnapshot = ({
  decibels,
  currentLevelDb = decibels,
  peakLevelDb = decibels,
  inputSensitivityMode,
  thresholdDb,
  noiseFloorDb = null,
  ambientUpperDb = null,
  gateOpen,
  vad2SpeechActive = null,
  vad3SpeechActive = null,
  snrDb = null,
  strongSpeechEvidence = null,
  speechEvidence = null,
  eligibleToOpen = null,
  recentVad3Speech = null,
  timeSinceLastVad3SpeechMs = null,
  vad2OnlyDurationMs = null,
  candidateAuthenticatedSpeech = null,
  candidateStrictOpen = null,
  vad3Hits120Ms = null,
  vad3Hits200Ms = null,
  vad3ConsecutiveFrames = null,
  candidateBurstAAuthenticated = null,
  candidateBurstBAuthenticated = null,
  candidateBurstAOpen = null,
  candidateBurstBOpen = null,
  candidateBurstAOnsetMs = null,
  candidateBurstBOnsetMs = null,
  utteranceActive = null,
  utteranceElapsedMs = null,
  maxVad3Hits120SinceReport = null,
  maxVad3Hits200SinceReport = null,
  burstATriggeredSinceReport = null,
  burstBTriggeredSinceReport = null,
  backgroundFrozen = null,
  digitalSilence = null,
  vadSampleRate = null,
  vadFrameMs = null,
  source
}: {
  decibels: number;
  currentLevelDb?: number;
  peakLevelDb?: number;
  inputSensitivityMode: InputSensitivityMode;
  thresholdDb?: number | null;
  noiseFloorDb?: number | null;
  ambientUpperDb?: number | null;
  gateOpen?: boolean;
  vad2SpeechActive?: boolean | null;
  vad3SpeechActive?: boolean | null;
  snrDb?: number | null;
  strongSpeechEvidence?: boolean | null;
  speechEvidence?: boolean | null;
  eligibleToOpen?: boolean | null;
  recentVad3Speech?: boolean | null;
  timeSinceLastVad3SpeechMs?: number | null;
  vad2OnlyDurationMs?: number | null;
  candidateAuthenticatedSpeech?: boolean | null;
  candidateStrictOpen?: boolean | null;
  vad3Hits120Ms?: number | null;
  vad3Hits200Ms?: number | null;
  vad3ConsecutiveFrames?: number | null;
  candidateBurstAAuthenticated?: boolean | null;
  candidateBurstBAuthenticated?: boolean | null;
  candidateBurstAOpen?: boolean | null;
  candidateBurstBOpen?: boolean | null;
  candidateBurstAOnsetMs?: number | null;
  candidateBurstBOnsetMs?: number | null;
  utteranceActive?: boolean | null;
  utteranceElapsedMs?: number | null;
  maxVad3Hits120SinceReport?: number | null;
  maxVad3Hits200SinceReport?: number | null;
  burstATriggeredSinceReport?: boolean | null;
  burstBTriggeredSinceReport?: boolean | null;
  backgroundFrozen?: boolean | null;
  digitalSilence?: boolean | null;
  vadSampleRate?: number | null;
  vadFrameMs?: number | null;
  source: TMicrophoneInputMeterSource;
}): TMicrophoneInputMeterSnapshot => {
  const clampedCurrentLevelDb = clampMicrophoneDecibels(currentLevelDb);
  const clampedPeakLevelDb = clampMicrophoneDecibels(peakLevelDb);
  const clampedThresholdDb =
    typeof thresholdDb === 'number'
      ? clampMicrophoneDecibels(thresholdDb)
      : null;
  const resolvedGateOpen =
    gateOpen ??
    (!inputSensitivityModeUsesGate(inputSensitivityMode) ||
      clampedThresholdDb === null ||
      clampedCurrentLevelDb >= clampedThresholdDb);

  return {
    decibels: clampedPeakLevelDb,
    currentLevelDb: clampedCurrentLevelDb,
    peakLevelDb: clampedPeakLevelDb,
    level: microphoneDecibelsToPercent(clampedPeakLevelDb),
    inputSensitivityMode,
    thresholdDb: clampedThresholdDb,
    noiseFloorDb,
    ambientUpperDb: isFiniteNumber(ambientUpperDb) ? ambientUpperDb : null,
    gateOpen: resolvedGateOpen,
    vad2SpeechActive:
      typeof vad2SpeechActive === 'boolean' ? vad2SpeechActive : null,
    vad3SpeechActive:
      typeof vad3SpeechActive === 'boolean' ? vad3SpeechActive : null,
    snrDb: isFiniteNumber(snrDb) ? snrDb : null,
    strongSpeechEvidence:
      typeof strongSpeechEvidence === 'boolean' ? strongSpeechEvidence : null,
    speechEvidence: typeof speechEvidence === 'boolean' ? speechEvidence : null,
    eligibleToOpen: typeof eligibleToOpen === 'boolean' ? eligibleToOpen : null,
    recentVad3Speech:
      typeof recentVad3Speech === 'boolean' ? recentVad3Speech : null,
    timeSinceLastVad3SpeechMs: isFiniteNumber(timeSinceLastVad3SpeechMs)
      ? timeSinceLastVad3SpeechMs
      : null,
    vad2OnlyDurationMs: isFiniteNumber(vad2OnlyDurationMs)
      ? vad2OnlyDurationMs
      : null,
    candidateAuthenticatedSpeech:
      typeof candidateAuthenticatedSpeech === 'boolean'
        ? candidateAuthenticatedSpeech
        : null,
    candidateStrictOpen:
      typeof candidateStrictOpen === 'boolean' ? candidateStrictOpen : null,
    vad3Hits120Ms: isFiniteNumber(vad3Hits120Ms) ? vad3Hits120Ms : null,
    vad3Hits200Ms: isFiniteNumber(vad3Hits200Ms) ? vad3Hits200Ms : null,
    vad3ConsecutiveFrames: isFiniteNumber(vad3ConsecutiveFrames)
      ? vad3ConsecutiveFrames
      : null,
    candidateBurstAAuthenticated:
      typeof candidateBurstAAuthenticated === 'boolean'
        ? candidateBurstAAuthenticated
        : null,
    candidateBurstBAuthenticated:
      typeof candidateBurstBAuthenticated === 'boolean'
        ? candidateBurstBAuthenticated
        : null,
    candidateBurstAOpen:
      typeof candidateBurstAOpen === 'boolean' ? candidateBurstAOpen : null,
    candidateBurstBOpen:
      typeof candidateBurstBOpen === 'boolean' ? candidateBurstBOpen : null,
    candidateBurstAOnsetMs: isFiniteNumber(candidateBurstAOnsetMs)
      ? candidateBurstAOnsetMs
      : null,
    candidateBurstBOnsetMs: isFiniteNumber(candidateBurstBOnsetMs)
      ? candidateBurstBOnsetMs
      : null,
    utteranceActive:
      typeof utteranceActive === 'boolean' ? utteranceActive : null,
    utteranceElapsedMs: isFiniteNumber(utteranceElapsedMs)
      ? utteranceElapsedMs
      : null,
    maxVad3Hits120SinceReport: isFiniteNumber(maxVad3Hits120SinceReport)
      ? maxVad3Hits120SinceReport
      : null,
    maxVad3Hits200SinceReport: isFiniteNumber(maxVad3Hits200SinceReport)
      ? maxVad3Hits200SinceReport
      : null,
    burstATriggeredSinceReport:
      typeof burstATriggeredSinceReport === 'boolean'
        ? burstATriggeredSinceReport
        : null,
    burstBTriggeredSinceReport:
      typeof burstBTriggeredSinceReport === 'boolean'
        ? burstBTriggeredSinceReport
        : null,
    backgroundFrozen:
      typeof backgroundFrozen === 'boolean' ? backgroundFrozen : null,
    digitalSilence: typeof digitalSilence === 'boolean' ? digitalSilence : null,
    vadSampleRate: isFiniteNumber(vadSampleRate) ? vadSampleRate : null,
    vadFrameMs: isFiniteNumber(vadFrameMs) ? vadFrameMs : null,
    source,
    updatedAt: Date.now()
  };
};

const getIdleMicrophoneInputMeterSnapshot = (): TMicrophoneInputMeterSnapshot =>
  createMicrophoneInputMeterSnapshot({
    decibels: MICROPHONE_LEVEL_METER_MIN_DB,
    inputSensitivityMode: InputSensitivityMode.OPEN,
    thresholdDb: null,
    gateOpen: true,
    source: 'idle'
  });

export {
  clampMicrophoneDecibels,
  createAutomaticHybridObserverState,
  createAutomaticInputSensitivityState,
  createMicrophoneGateState,
  createMicrophoneInputMeterSnapshot,
  getAutomaticHybridDecision,
  getAutomaticHybridGateSignal,
  getIdleMicrophoneInputMeterSnapshot,
  getMicrophoneGateThresholds,
  inputSensitivityModeUsesGate,
  isInputSensitivityMode,
  MICROPHONE_AUDIO_METER_WORKLET_NAME,
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
  MICROPHONE_AUTO_OBSERVER_BURST_A_MIN_VAD3_FRAMES,
  MICROPHONE_AUTO_OBSERVER_BURST_A_WINDOW_FRAMES,
  MICROPHONE_AUTO_OBSERVER_BURST_B_MIN_VAD3_FRAMES,
  MICROPHONE_AUTO_OBSERVER_BURST_B_WINDOW_FRAMES,
  MICROPHONE_AUTO_OBSERVER_DROPOUT_GRACE_MS,
  MICROPHONE_AUTO_OBSERVER_RECENT_VAD3_MS,
  MICROPHONE_AUTO_SPEECH_MIN_ABOVE_AMBIENT_DB,
  MICROPHONE_AUTO_SPEECH_MIN_SNR_DB,
  MICROPHONE_AUTO_STRONG_SPEECH_MIN_ABOVE_AMBIENT_DB,
  MICROPHONE_AUTO_STRONG_SPEECH_MIN_SNR_DB,
  MICROPHONE_AUTO_THRESHOLD_MARGIN_DB,
  MICROPHONE_GATE_CLOSE_HOLD_MS,
  MICROPHONE_GATE_DEFAULT_THRESHOLD_DB,
  MICROPHONE_GATE_HYSTERESIS_DB,
  MICROPHONE_GATE_OPEN_ATTACK_MS,
  MICROPHONE_GATE_RELEASE_MS,
  MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS,
  MICROPHONE_LEVEL_METER_MAX_DB,
  MICROPHONE_LEVEL_METER_MIN_DB,
  MICROPHONE_NOISE_GATE_WORKLET_NAME,
  MICROPHONE_TEST_LEVEL_SAMPLE_INTERVAL_MS,
  microphoneDecibelsToPercent,
  resetAutomaticHybridObserverReportState,
  updateAutomaticHybridObserverState,
  updateAutomaticInputSensitivity,
  updateMicrophoneGateState
};

export type {
  TAutomaticHybridDecision,
  TAutomaticHybridObserverState,
  TAutomaticInputSensitivityCalibration,
  TAutomaticInputSensitivityState,
  TAutomaticInputSensitivityUpdateOptions,
  TMicrophoneGateState,
  TMicrophoneGateUpdateResult,
  TMicrophoneInputMeterSnapshot,
  TMicrophoneInputMeterSource
};
