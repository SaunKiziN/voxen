const MICROPHONE_NOISE_GATE_WORKLET_NAME = 'sharkord-noise-gate';
const INPUT_SENSITIVITY_MODE_AUTOMATIC = 'automatic';
const INPUT_SENSITIVITY_MODE_MANUAL = 'manual';
const INPUT_SENSITIVITY_MODE_OPEN = 'open';
const MICROPHONE_LEVEL_METER_MIN_DB = -100;
const MICROPHONE_LEVEL_METER_MAX_DB = 0;
const MICROPHONE_GATE_DEFAULT_THRESHOLD_DB = -48;
const MICROPHONE_GATE_HYSTERESIS_DB = 6;
const MICROPHONE_GATE_OPEN_ATTACK_MS = 10;
const MICROPHONE_GATE_RELEASE_MS = 120;
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
const MICROPHONE_AUTO_PREROLL_MS = 40;
const MICROPHONE_VAD_FACTORY_GLOBAL = '__sharkordCreateFvadModule';
const MICROPHONE_VAD_SAMPLE_RATE = 16000;
const MICROPHONE_VAD_SOURCE_SAMPLE_RATE = 48000;
const MICROPHONE_VAD_FRAME_MS = 20;
const MICROPHONE_VAD_MODES = [2, 3];
const MICROPHONE_VAD_FRAME_SIZE =
  (MICROPHONE_VAD_SAMPLE_RATE * MICROPHONE_VAD_FRAME_MS) / 1000;
const MICROPHONE_VAD_DOWNSAMPLE_FACTOR =
  MICROPHONE_VAD_SOURCE_SAMPLE_RATE / MICROPHONE_VAD_SAMPLE_RATE;
const MICROPHONE_VAD_INPUT_BYTES = MICROPHONE_VAD_FRAME_SIZE * 2;
const MICROPHONE_VAD_TIMING_SAMPLE_INTERVAL_FRAMES = 25;
const MICROPHONE_VAD_TIMING_WINDOW_SIZE = 64;
const MICROPHONE_VAD_UNAVAILABLE_WARNING =
  'WebRTC VAD unavailable; Automatic will use level gate fallback.';

const clampDecibels = (decibels) =>
  Math.max(
    MICROPHONE_LEVEL_METER_MIN_DB,
    Math.min(MICROPHONE_LEVEL_METER_MAX_DB, decibels)
  );

const clampAutomaticNoiseFloorDecibels = (decibels) =>
  Math.max(
    MICROPHONE_LEVEL_METER_MIN_DB,
    Math.min(MICROPHONE_AUTO_NOISE_FLOOR_MAX_DB, decibels)
  );

const clampAutomaticThresholdDecibels = (decibels) =>
  Math.max(
    MICROPHONE_AUTO_THRESHOLD_MIN_DB,
    Math.min(MICROPHONE_AUTO_THRESHOLD_MAX_DB, decibels)
  );

const getGateCloseThresholdDb = (openThresholdDb) =>
  clampDecibels(openThresholdDb - MICROPHONE_GATE_HYSTERESIS_DB);

const getSmoothingAlpha = (elapsedMs, timeConstantMs) => {
  if (elapsedMs <= 0) return 0;

  return 1 - Math.exp(-elapsedMs / timeConstantMs);
};

const getAutomaticDefaultThresholdDb = () =>
  clampAutomaticThresholdDecibels(MICROPHONE_GATE_DEFAULT_THRESHOLD_DB);

const getAutomaticThresholdDb = (noiseFloorDb, ambientUpperDb) =>
  clampAutomaticThresholdDecibels(
    Math.max(
      noiseFloorDb + MICROPHONE_AUTO_THRESHOLD_MARGIN_DB,
      ambientUpperDb + MICROPHONE_AUTO_AMBIENT_GUARD_DB
    )
  );

const createAutomaticState = () => ({
  initialized: false,
  noiseFloorDb: MICROPHONE_AUTO_NOISE_FLOOR_INITIAL_DB,
  ambientMedianDb: MICROPHONE_AUTO_NOISE_FLOOR_INITIAL_DB,
  ambientUpperDb: MICROPHONE_AUTO_NOISE_FLOOR_INITIAL_DB,
  thresholdDb: getAutomaticDefaultThresholdDb(),
  observationBuffer: new Float32Array(MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE),
  sortBuffer: new Float32Array(MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE),
  observationIndex: 0,
  observationCount: 0,
  observationSampleElapsedMs: 0,
  calibrationElapsedMs: 0,
  digitalSilenceElapsedMs: 0,
  elevatedNoiseElapsedMs: 0
});

const resetAutomaticObservation = (state) => {
  state.observationIndex = 0;
  state.observationCount = 0;
  state.observationSampleElapsedMs = 0;
  state.calibrationElapsedMs = 0;
  state.elevatedNoiseElapsedMs = 0;
};

const freezeAutomaticStateForDigitalSilence = (
  state,
  digitalSilenceElapsedMs
) => {
  resetAutomaticObservation(state);
  state.digitalSilenceElapsedMs = digitalSilenceElapsedMs;
};

const addAutomaticObservationSample = (state, decibels, elapsedMs) => {
  state.observationSampleElapsedMs += Math.max(0, elapsedMs);

  if (
    state.observationSampleElapsedMs <
    MICROPHONE_AUTO_OBSERVATION_SAMPLE_INTERVAL_MS
  ) {
    return;
  }

  state.observationBuffer[state.observationIndex] = decibels;
  state.observationIndex =
    (state.observationIndex + 1) % MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE;
  state.observationCount = Math.min(
    state.observationCount + 1,
    MICROPHONE_AUTO_OBSERVATION_WINDOW_SIZE
  );
  state.observationSampleElapsedMs %=
    MICROPHONE_AUTO_OBSERVATION_SAMPLE_INTERVAL_MS;
};

const getAutomaticPercentileValue = (state, percentile) => {
  const percentileIndex = Math.floor((state.observationCount - 1) * percentile);

  return clampDecibels(state.sortBuffer[percentileIndex]);
};

const getAutomaticObservationStats = (state) => {
  if (state.observationCount < MICROPHONE_AUTO_OBSERVATION_MIN_SAMPLES) {
    return null;
  }

  for (let index = 0; index < state.observationCount; index++) {
    state.sortBuffer[index] = state.observationBuffer[index];
  }

  for (let index = 1; index < state.observationCount; index++) {
    const value = state.sortBuffer[index];
    let sortedIndex = index - 1;

    while (sortedIndex >= 0 && state.sortBuffer[sortedIndex] > value) {
      state.sortBuffer[sortedIndex + 1] = state.sortBuffer[sortedIndex];
      sortedIndex -= 1;
    }

    state.sortBuffer[sortedIndex + 1] = value;
  }

  return {
    noiseFloorDb: getAutomaticPercentileValue(
      state,
      MICROPHONE_AUTO_NOISE_FLOOR_PERCENTILE
    ),
    ambientMedianDb: getAutomaticPercentileValue(
      state,
      MICROPHONE_AUTO_AMBIENT_MEDIAN_PERCENTILE
    ),
    ambientUpperDb: getAutomaticPercentileValue(
      state,
      MICROPHONE_AUTO_AMBIENT_UPPER_PERCENTILE
    )
  };
};

const getHighResolutionTimeMs = () =>
  typeof performance !== 'undefined' &&
  performance &&
  typeof performance.now === 'function'
    ? performance.now()
    : null;

const getBenchmarkTimeMs = () =>
  getHighResolutionTimeMs() ??
  (typeof Date !== 'undefined' && typeof Date.now === 'function'
    ? Date.now()
    : 0);

const getTimingPercentile = (buffer, count, percentile) => {
  if (count <= 0) return null;

  const sorted = [];

  for (let index = 0; index < count; index++) {
    sorted.push(buffer[index]);
  }

  sorted.sort((a, b) => a - b);

  return sorted[Math.floor((sorted.length - 1) * percentile)] ?? null;
};

const hasVadSpeechEvidence = ({ vad2SpeechActive, vad3SpeechActive }) =>
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
}) => {
  const clampedDecibels = clampDecibels(decibels);
  const strongSpeechEvidence = vad3SpeechActive === true;
  const speechEvidence = vad2SpeechActive === true;
  const digitalSilence =
    clampedDecibels <= MICROPHONE_AUTO_DIGITAL_SILENCE_CUTOFF_DB;
  const hasTrustedBackground =
    typeof noiseFloorDb === 'number' &&
    Number.isFinite(noiseFloorDb) &&
    typeof ambientUpperDb === 'number' &&
    Number.isFinite(ambientUpperDb);
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

const getAutomaticHybridGateSignal = ({ gateOpen, decision }) =>
  gateOpen
    ? decision.speechEvidence || decision.strongSpeechEvidence
    : decision.eligibleToOpen;

const createAutomaticHybridObserverState = () => ({
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
  vad3Window,
  vad3WindowIndex,
  vad3WindowCount,
  windowFrames
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
  state,
  elapsedMs,
  { vad2SpeechActive, vad3SpeechActive }
) => {
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

const resetAutomaticHybridObserverReportState = (state) => ({
  ...state,
  maxVad3Hits120SinceReport: 0,
  maxVad3Hits200SinceReport: 0,
  burstATriggeredSinceReport: false,
  burstBTriggeredSinceReport: false
});

const updateAutomaticSensitivity = (
  state,
  decibels,
  elapsedMs,
  options = {}
) => {
  const clampedDecibels = clampDecibels(decibels);
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

    if (digitalSilenceElapsedMs >= MICROPHONE_AUTO_DIGITAL_SILENCE_RESET_MS) {
      freezeAutomaticStateForDigitalSilence(state, digitalSilenceElapsedMs);
    } else {
      state.digitalSilenceElapsedMs = digitalSilenceElapsedMs;
    }

    return {
      noiseFloorDb: state.initialized ? state.noiseFloorDb : null,
      ambientUpperDb: state.initialized ? state.ambientUpperDb : null,
      thresholdDb: state.thresholdDb,
      isSpeechLike: false,
      backgroundFrozen: true,
      digitalSilence: true
    };
  }

  state.digitalSilenceElapsedMs = 0;

  if (!state.initialized && !backgroundFrozen) {
    addAutomaticObservationSample(state, clampedDecibels, elapsed);
    state.calibrationElapsedMs += elapsed;

    const observationStats = getAutomaticObservationStats(state);

    if (
      observationStats !== null &&
      state.calibrationElapsedMs >= MICROPHONE_AUTO_BOOTSTRAP_MS
    ) {
      state.initialized = true;
      state.noiseFloorDb = clampAutomaticNoiseFloorDecibels(
        observationStats.noiseFloorDb
      );
      state.ambientMedianDb = observationStats.ambientMedianDb;
      state.ambientUpperDb = observationStats.ambientUpperDb;
      state.thresholdDb = getAutomaticThresholdDb(
        state.noiseFloorDb,
        state.ambientUpperDb
      );
      state.elevatedNoiseElapsedMs = 0;
    }

    return {
      noiseFloorDb: state.initialized ? state.noiseFloorDb : null,
      ambientUpperDb: state.initialized ? state.ambientUpperDb : null,
      thresholdDb: state.thresholdDb,
      isSpeechLike: false,
      backgroundFrozen,
      digitalSilence: false
    };
  }

  if (!state.initialized) {
    return {
      noiseFloorDb: null,
      ambientUpperDb: null,
      thresholdDb: state.thresholdDb,
      isSpeechLike: false,
      backgroundFrozen,
      digitalSilence: false
    };
  }

  const speechThresholdDb = Math.max(
    state.thresholdDb,
    state.noiseFloorDb + MICROPHONE_AUTO_SPEECH_GUARD_DB
  );
  const isSpeechLike = clampedDecibels >= speechThresholdDb;
  const shouldUpdateBackgroundModel = hasVadEvidence
    ? !backgroundFrozen
    : !isSpeechLike || clampedDecibels < state.noiseFloorDb;

  if (shouldUpdateBackgroundModel) {
    addAutomaticObservationSample(state, clampedDecibels, elapsed);
  }

  const observationStats = getAutomaticObservationStats(state);
  const shouldRecoverElevatedNoise =
    shouldUpdateBackgroundModel &&
    observationStats !== null &&
    (observationStats.noiseFloorDb >
      state.noiseFloorDb + MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_RISE_DB ||
      observationStats.ambientUpperDb >
        state.ambientUpperDb + MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_RISE_DB) &&
    observationStats.ambientUpperDb <=
      state.thresholdDb +
        MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MAX_ABOVE_THRESHOLD_DB;

  if (
    shouldUpdateBackgroundModel &&
    observationStats !== null &&
    !shouldRecoverElevatedNoise
  ) {
    const timeConstantMs =
      observationStats.noiseFloorDb < state.noiseFloorDb
        ? MICROPHONE_AUTO_FLOOR_DOWN_TIME_CONSTANT_MS
        : MICROPHONE_AUTO_FLOOR_UP_TIME_CONSTANT_MS;
    const floorAlpha = getSmoothingAlpha(elapsed, timeConstantMs);
    const ambientAlpha = getSmoothingAlpha(
      elapsed,
      MICROPHONE_AUTO_THRESHOLD_TIME_CONSTANT_MS
    );

    state.noiseFloorDb = clampAutomaticNoiseFloorDecibels(
      state.noiseFloorDb +
        (observationStats.noiseFloorDb - state.noiseFloorDb) * floorAlpha
    );
    state.ambientMedianDb = clampDecibels(
      state.ambientMedianDb +
        (observationStats.ambientMedianDb - state.ambientMedianDb) *
          ambientAlpha
    );
    state.ambientUpperDb = clampDecibels(
      state.ambientUpperDb +
        (observationStats.ambientUpperDb - state.ambientUpperDb) * ambientAlpha
    );
  }

  state.elevatedNoiseElapsedMs = shouldRecoverElevatedNoise
    ? state.elevatedNoiseElapsedMs + elapsed
    : 0;

  const recoveredElevatedNoise =
    state.elevatedNoiseElapsedMs >= MICROPHONE_AUTO_ENVIRONMENT_RECOVERY_MS &&
    observationStats !== null;

  if (recoveredElevatedNoise) {
    state.noiseFloorDb = clampAutomaticNoiseFloorDecibels(
      observationStats.noiseFloorDb
    );
    state.ambientMedianDb = observationStats.ambientMedianDb;
    state.ambientUpperDb = observationStats.ambientUpperDb;
    state.elevatedNoiseElapsedMs = 0;
  }

  const targetThresholdDb = getAutomaticThresholdDb(
    state.noiseFloorDb,
    state.ambientUpperDb
  );

  if (recoveredElevatedNoise) {
    state.thresholdDb = targetThresholdDb;
  } else {
    const thresholdAlpha = getSmoothingAlpha(
      elapsed,
      MICROPHONE_AUTO_THRESHOLD_TIME_CONSTANT_MS
    );

    state.thresholdDb = clampAutomaticThresholdDecibels(
      state.thresholdDb +
        (targetThresholdDb - state.thresholdDb) * thresholdAlpha
    );
  }

  return {
    noiseFloorDb: state.noiseFloorDb,
    ambientUpperDb: state.ambientUpperDb,
    thresholdDb: state.thresholdDb,
    isSpeechLike,
    backgroundFrozen,
    digitalSilence: false
  };
};

const isInputSensitivityMode = (mode) =>
  mode === INPUT_SENSITIVITY_MODE_AUTOMATIC ||
  mode === INPUT_SENSITIVITY_MODE_MANUAL ||
  mode === INPUT_SENSITIVITY_MODE_OPEN;

const freeVadHandles = (vadModule, vadHandles) => {
  for (let index = 0; index < vadHandles.length; index++) {
    const vadHandle = vadHandles[index];

    if (vadHandle) {
      vadModule._fvad_free(vadHandle);
      vadHandles[index] = 0;
    }
  }
};

class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.mode = INPUT_SENSITIVITY_MODE_MANUAL;
    this.thresholdDb = -48;
    this.holdMs = 250;
    this.reportStatus = false;
    this.statusUpdateIntervalMs = 40;
    this.framesSinceStatusReport = 0;
    this.peakDbSinceStatusReport = -Infinity;
    this.gateOpen = false;
    this.closeHoldRemainingFrames = 0;
    this.openConfirmationFrames = 0;
    this.releaseRemainingFrames = 0;
    this.releaseTotalFrames = 1;
    this.releaseStartGain = 0;
    this.currentGain = 1;
    this.automaticPrerollBuffers = [];
    this.automaticPrerollHistoryFrames = 0;
    this.automaticPrerollCapacityFrames = 0;
    this.automaticPrerollReadIndex = 0;
    this.automaticPrerollWriteIndex = 0;
    this.automaticPrerollFrameCount = 0;
    this.automaticPrerollReplayLatched = false;
    this.automaticPrerollDelayActive = false;
    this.automaticState = createAutomaticState();
    this.hybridObserverState = createAutomaticHybridObserverState();
    this.vadModule = null;
    this.vadInitializing = false;
    this.vadUnavailable = false;
    this.vadInitializationToken = 0;
    this.vadHandles = new Int32Array(MICROPHONE_VAD_MODES.length);
    this.vadInputPtr = 0;
    this.vadHeap16 = null;
    this.vadSpeechActiveByMode = Array.from(MICROPHONE_VAD_MODES, () => false);
    this.vadFrame = new Int16Array(MICROPHONE_VAD_FRAME_SIZE);
    this.vadFrameOffset = 0;
    this.vadDecimatorPhase = 0;
    this.vadDecimatorSum = 0;
    this.vadFrameSequence = 0;
    this.vadMeasureCurrentFrame = true;
    this.vadCurrentFrameDownsampleMs = 0;
    this.vadDownsampleTimingMs = new Float32Array(
      MICROPHONE_VAD_TIMING_WINDOW_SIZE
    );
    this.vadProcessTimingMs = new Float32Array(
      MICROPHONE_VAD_TIMING_WINDOW_SIZE
    );
    this.vadCombinedTimingMs = new Float32Array(
      MICROPHONE_VAD_TIMING_WINDOW_SIZE
    );
    this.vadTimingIndex = 0;
    this.vadTimingCount = 0;
    this.vadDownsampleAvgMs = null;
    this.vadDownsampleP95Ms = null;
    this.vadDownsampleP99Ms = null;
    this.vadProcessAvgMs = null;
    this.vadProcessP95Ms = null;
    this.vadProcessP99Ms = null;
    this.vadCombinedAvgMs = null;
    this.vadCombinedP95Ms = null;
    this.vadCombinedP99Ms = null;
    this.vadFailureWarned = false;
    this.vadErrorMessage = null;

    this.port.onmessage = (event) => {
      const data = event.data;

      if (!data || typeof data !== 'object') return;

      if (data.type === 'vad-wasm') {
        this.initializeVad(data.wasmBytes);
        return;
      }

      if (data.type === 'vad-unavailable') {
        this.setVadUnavailable();
        return;
      }

      if (data.type === 'destroy') {
        this.cleanupVad();
        return;
      }

      if (data.type === 'vad-benchmark') {
        this.runVadBenchmark(data);
        return;
      }

      if (data.type !== 'config') return;

      if (isInputSensitivityMode(data.mode)) {
        const previousMode = this.mode;

        this.mode = data.mode;

        if (
          this.mode === INPUT_SENSITIVITY_MODE_AUTOMATIC &&
          previousMode !== INPUT_SENSITIVITY_MODE_AUTOMATIC
        ) {
          this.automaticState = createAutomaticState();
          this.hybridObserverState = createAutomaticHybridObserverState();
          this.resetAutomaticPreroll();
        }

        if (this.mode !== INPUT_SENSITIVITY_MODE_AUTOMATIC) {
          this.resetVadSpeechState();
          this.resetVadAnalysisFrame();
          this.hybridObserverState = createAutomaticHybridObserverState();
          this.resetAutomaticPreroll();
        }

        if (this.mode === INPUT_SENSITIVITY_MODE_OPEN) {
          this.gateOpen = true;
          this.closeHoldRemainingFrames = 0;
          this.openConfirmationFrames = 0;
          this.releaseRemainingFrames = 0;
          this.releaseStartGain = 0;
          this.currentGain = 1;
        }
      }

      if (typeof data.enabled === 'boolean') {
        this.mode = data.enabled
          ? INPUT_SENSITIVITY_MODE_MANUAL
          : INPUT_SENSITIVITY_MODE_OPEN;

        this.resetVadSpeechState();
        this.resetVadAnalysisFrame();
        this.hybridObserverState = createAutomaticHybridObserverState();
        this.resetAutomaticPreroll();

        if (this.mode === INPUT_SENSITIVITY_MODE_OPEN) {
          this.gateOpen = true;
          this.closeHoldRemainingFrames = 0;
          this.openConfirmationFrames = 0;
          this.releaseRemainingFrames = 0;
          this.releaseStartGain = 0;
          this.currentGain = 1;
        }
      }

      if (
        typeof data.thresholdDb === 'number' &&
        Number.isFinite(data.thresholdDb)
      ) {
        this.thresholdDb = clampDecibels(data.thresholdDb);
      }

      if (typeof data.holdMs === 'number' && Number.isFinite(data.holdMs)) {
        this.holdMs = Math.max(0, data.holdMs);
      }

      if (typeof data.reportStatus === 'boolean') {
        this.reportStatus = data.reportStatus;
      }

      if (
        typeof data.statusUpdateIntervalMs === 'number' &&
        Number.isFinite(data.statusUpdateIntervalMs)
      ) {
        this.statusUpdateIntervalMs = Math.max(1, data.statusUpdateIntervalMs);
      }
    };
  }

  setVadUnavailable() {
    this.cleanupVad();
    this.vadUnavailable = true;
    this.vadInitializing = false;
    this.resetVadSpeechState();
    this.resetVadAnalysisFrame();
    this.hybridObserverState = createAutomaticHybridObserverState();
    this.resetAutomaticPreroll();
  }

  warnVadUnavailable(error) {
    if (this.vadFailureWarned) return;

    this.vadFailureWarned = true;
    console.warn(MICROPHONE_VAD_UNAVAILABLE_WARNING, error);
  }

  failVad(error) {
    const errorMessage =
      error instanceof Error ? error.message : 'WebRTC VAD failed.';

    this.cleanupVad();
    this.vadUnavailable = true;
    this.vadInitializing = false;
    this.resetVadSpeechState();
    this.vadErrorMessage = errorMessage;
    this.resetAutomaticPreroll();
    this.warnVadUnavailable(error);
  }

  cleanupVad() {
    this.vadInitializationToken += 1;

    if (this.vadModule && this.vadInputPtr) {
      this.vadModule._free(this.vadInputPtr);
    }

    if (this.vadModule) {
      freeVadHandles(this.vadModule, this.vadHandles);
    }

    this.vadModule = null;
    this.vadHandles.fill(0);
    this.vadInputPtr = 0;
    this.vadHeap16 = null;
    this.vadInitializing = false;
    this.resetVadSpeechState();
    this.vadErrorMessage = null;
    this.resetVadAnalysisFrame();
    this.resetAutomaticPreroll();
  }

  resetAutomaticPreroll() {
    this.automaticPrerollReadIndex = 0;
    this.automaticPrerollWriteIndex = 0;
    this.automaticPrerollFrameCount = 0;
    this.automaticPrerollReplayLatched = false;
    this.automaticPrerollDelayActive = false;
  }

  ensureAutomaticPrerollBuffers(channelCount) {
    const historyFrames = Math.max(
      1,
      Math.ceil((MICROPHONE_AUTO_PREROLL_MS / 1000) * sampleRate)
    );
    const capacityFrames =
      historyFrames +
      Math.max(
        0,
        Math.ceil((MICROPHONE_GATE_OPEN_ATTACK_MS / 1000) * sampleRate)
      );

    if (
      this.automaticPrerollHistoryFrames === historyFrames &&
      this.automaticPrerollCapacityFrames === capacityFrames &&
      this.automaticPrerollBuffers.length === channelCount
    ) {
      return;
    }

    this.automaticPrerollHistoryFrames = historyFrames;
    this.automaticPrerollCapacityFrames = capacityFrames;
    this.automaticPrerollBuffers = Array.from(
      { length: channelCount },
      () => new Float32Array(capacityFrames)
    );
    this.resetAutomaticPreroll();
  }

  getInputSample(input, channelIndex, sampleIndex) {
    const channel = input[channelIndex] ?? input[0];

    return channel ? (channel[sampleIndex] ?? 0) : 0;
  }

  appendAutomaticPrerollFrame(
    input,
    channelCount,
    sampleIndex,
    frameLimit = this.automaticPrerollHistoryFrames
  ) {
    if (this.automaticPrerollCapacityFrames <= 0) return;

    const writeIndex = this.automaticPrerollWriteIndex;
    const maxFrameCount = Math.max(
      1,
      Math.min(
        this.automaticPrerollCapacityFrames,
        frameLimit > 0 ? frameLimit : this.automaticPrerollCapacityFrames
      )
    );

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
      this.automaticPrerollBuffers[channelIndex][writeIndex] =
        this.getInputSample(input, channelIndex, sampleIndex);
    }

    if (this.automaticPrerollFrameCount >= maxFrameCount) {
      this.automaticPrerollReadIndex =
        (this.automaticPrerollReadIndex + 1) %
        this.automaticPrerollCapacityFrames;
    } else {
      this.automaticPrerollFrameCount += 1;
    }

    this.automaticPrerollWriteIndex =
      (writeIndex + 1) % this.automaticPrerollCapacityFrames;
  }

  writeDirectOutputFrame(input, output, sampleIndex, gain) {
    for (let channelIndex = 0; channelIndex < output.length; channelIndex++) {
      output[channelIndex][sampleIndex] =
        this.getInputSample(input, channelIndex, sampleIndex) * gain;
    }
  }

  writeSilentOutputFrame(output, sampleIndex) {
    for (let channelIndex = 0; channelIndex < output.length; channelIndex++) {
      output[channelIndex][sampleIndex] = 0;
    }
  }

  writeAutomaticPrerollOutputFrame(input, output, sampleIndex, gain) {
    const hasDelayedFrame = this.automaticPrerollFrameCount > 0;
    const readIndex = this.automaticPrerollReadIndex;

    for (let channelIndex = 0; channelIndex < output.length; channelIndex++) {
      const sample = hasDelayedFrame
        ? (this.automaticPrerollBuffers[channelIndex]?.[readIndex] ?? 0)
        : this.getInputSample(input, channelIndex, sampleIndex);

      output[channelIndex][sampleIndex] = sample * gain;
    }

    if (hasDelayedFrame) {
      this.automaticPrerollReadIndex =
        (readIndex + 1) % this.automaticPrerollCapacityFrames;
      this.automaticPrerollFrameCount -= 1;
    }

    this.appendAutomaticPrerollFrame(
      input,
      output.length,
      sampleIndex,
      this.automaticPrerollCapacityFrames
    );
  }

  resetVadSpeechState() {
    for (let index = 0; index < this.vadSpeechActiveByMode.length; index++) {
      this.vadSpeechActiveByMode[index] = false;
    }
  }

  isVadReady() {
    if (!this.vadModule || !this.vadInputPtr || !this.vadHeap16) {
      return false;
    }

    for (let index = 0; index < this.vadHandles.length; index++) {
      if (!this.vadHandles[index]) return false;
    }

    return true;
  }

  resetVadAnalysisFrame() {
    this.vadFrameOffset = 0;
    this.vadDecimatorPhase = 0;
    this.vadDecimatorSum = 0;
    this.vadCurrentFrameDownsampleMs = 0;
    this.vadMeasureCurrentFrame =
      this.vadFrameSequence % MICROPHONE_VAD_TIMING_SAMPLE_INTERVAL_FRAMES ===
      0;
  }

  initializeVad(wasmBytes) {
    if (
      this.vadModule ||
      this.vadInitializing ||
      this.vadUnavailable ||
      !wasmBytes
    ) {
      return;
    }

    this.vadInitializing = true;
    const vadInitializationToken = this.vadInitializationToken + 1;
    this.vadInitializationToken = vadInitializationToken;

    const createFvadModule = globalThis[MICROPHONE_VAD_FACTORY_GLOBAL];

    if (typeof createFvadModule !== 'function') {
      this.failVad(new Error('WebRTC VAD worklet module is not loaded.'));
      return;
    }

    createFvadModule({
      locateFile: (path) => path,
      wasmBinary: wasmBytes
    })
      .then((vadModule) => {
        const vadHandles = new Int32Array(MICROPHONE_VAD_MODES.length);
        let vadInputPtr = 0;

        try {
          for (
            let modeIndex = 0;
            modeIndex < MICROPHONE_VAD_MODES.length;
            modeIndex++
          ) {
            const vadHandle = vadModule._fvad_new();

            if (!vadHandle) {
              throw new Error('Failed to allocate WebRTC VAD instance.');
            }

            vadHandles[modeIndex] = vadHandle;

            if (
              vadModule._fvad_set_mode(
                vadHandle,
                MICROPHONE_VAD_MODES[modeIndex]
              ) !== 0
            ) {
              throw new Error('Failed to set WebRTC VAD mode.');
            }

            if (
              vadModule._fvad_set_sample_rate(
                vadHandle,
                MICROPHONE_VAD_SAMPLE_RATE
              ) !== 0
            ) {
              throw new Error('Failed to set WebRTC VAD sample rate.');
            }
          }

          vadInputPtr = vadModule._malloc(MICROPHONE_VAD_INPUT_BYTES);

          if (!vadInputPtr) {
            throw new Error('Failed to allocate WebRTC VAD input frame.');
          }

          if (this.vadInitializationToken !== vadInitializationToken) {
            freeVadHandles(vadModule, vadHandles);
            vadModule._free(vadInputPtr);
            return;
          }
        } catch (error) {
          freeVadHandles(vadModule, vadHandles);

          if (vadInputPtr) {
            vadModule._free(vadInputPtr);
          }

          throw error;
        }

        this.vadModule = vadModule;
        this.vadHandles = vadHandles;
        this.vadInputPtr = vadInputPtr;
        this.vadHeap16 = vadModule.HEAP16;
        this.vadInitializing = false;
        this.vadUnavailable = false;
        this.resetVadSpeechState();
        this.vadErrorMessage = null;
        this.resetVadAnalysisFrame();
      })
      .catch((error) => {
        this.failVad(error);
      });
  }

  shouldProcessVad() {
    return (
      this.mode === INPUT_SENSITIVITY_MODE_AUTOMATIC &&
      !this.vadUnavailable &&
      this.isVadReady() &&
      sampleRate === MICROPHONE_VAD_SOURCE_SAMPLE_RATE
    );
  }

  startNextVadFrame() {
    this.vadFrameSequence += 1;
    this.vadMeasureCurrentFrame =
      this.vadFrameSequence % MICROPHONE_VAD_TIMING_SAMPLE_INTERVAL_FRAMES ===
      0;
    this.vadCurrentFrameDownsampleMs = 0;
  }

  recordVadTiming({ downsampleMs, processMs }) {
    const index = this.vadTimingIndex;

    this.vadDownsampleTimingMs[index] = downsampleMs;
    this.vadProcessTimingMs[index] = processMs;
    this.vadCombinedTimingMs[index] = downsampleMs + processMs;
    this.vadTimingIndex = (index + 1) % MICROPHONE_VAD_TIMING_WINDOW_SIZE;
    this.vadTimingCount = Math.min(
      this.vadTimingCount + 1,
      MICROPHONE_VAD_TIMING_WINDOW_SIZE
    );

    let downsampleTotal = 0;
    let processTotal = 0;
    let combinedTotal = 0;

    for (
      let timingIndex = 0;
      timingIndex < this.vadTimingCount;
      timingIndex++
    ) {
      downsampleTotal += this.vadDownsampleTimingMs[timingIndex];
      processTotal += this.vadProcessTimingMs[timingIndex];
      combinedTotal += this.vadCombinedTimingMs[timingIndex];
    }

    this.vadDownsampleAvgMs = downsampleTotal / this.vadTimingCount;
    this.vadProcessAvgMs = processTotal / this.vadTimingCount;
    this.vadCombinedAvgMs = combinedTotal / this.vadTimingCount;
    this.vadDownsampleP95Ms = getTimingPercentile(
      this.vadDownsampleTimingMs,
      this.vadTimingCount,
      0.95
    );
    this.vadDownsampleP99Ms = getTimingPercentile(
      this.vadDownsampleTimingMs,
      this.vadTimingCount,
      0.99
    );
    this.vadProcessP95Ms = getTimingPercentile(
      this.vadProcessTimingMs,
      this.vadTimingCount,
      0.95
    );
    this.vadProcessP99Ms = getTimingPercentile(
      this.vadProcessTimingMs,
      this.vadTimingCount,
      0.99
    );
    this.vadCombinedP95Ms = getTimingPercentile(
      this.vadCombinedTimingMs,
      this.vadTimingCount,
      0.95
    );
    this.vadCombinedP99Ms = getTimingPercentile(
      this.vadCombinedTimingMs,
      this.vadTimingCount,
      0.99
    );
  }

  processVadFrame() {
    if (!this.isVadReady()) return;

    let processMs = 0;
    const shouldMeasure = this.vadMeasureCurrentFrame;
    const startMs = shouldMeasure ? getHighResolutionTimeMs() : null;

    try {
      this.vadHeap16.set(this.vadFrame, this.vadInputPtr >> 1);

      for (let index = 0; index < this.vadHandles.length; index++) {
        const result = this.vadModule._fvad_process(
          this.vadHandles[index],
          this.vadInputPtr,
          MICROPHONE_VAD_FRAME_SIZE
        );

        if (result < 0) {
          throw new Error('WebRTC VAD processing failed.');
        }

        this.vadSpeechActiveByMode[index] = result === 1;
      }

      this.hybridObserverState = updateAutomaticHybridObserverState(
        this.hybridObserverState,
        MICROPHONE_VAD_FRAME_MS,
        {
          vad2SpeechActive: this.vadSpeechActiveByMode[0],
          vad3SpeechActive: this.vadSpeechActiveByMode[1]
        }
      );

      if (shouldMeasure && startMs !== null) {
        processMs = getHighResolutionTimeMs() - startMs;
        this.recordVadTiming({
          downsampleMs: this.vadCurrentFrameDownsampleMs,
          processMs
        });
      }
    } catch (error) {
      this.failVad(error);
    }
  }

  processVadAnalysis(input, frameCount) {
    if (this.mode !== INPUT_SENSITIVITY_MODE_AUTOMATIC) return;

    if (!this.shouldProcessVad()) return;

    const channelCount = input.length;
    let downsampleStartMs = this.vadMeasureCurrentFrame
      ? getHighResolutionTimeMs()
      : null;

    try {
      for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex++) {
        let monoSample = 0;

        for (
          let channelIndex = 0;
          channelIndex < channelCount;
          channelIndex++
        ) {
          monoSample += input[channelIndex][sampleIndex] ?? 0;
        }

        monoSample /= Math.max(1, channelCount);
        this.vadDecimatorSum += monoSample;
        this.vadDecimatorPhase += 1;

        if (this.vadDecimatorPhase < MICROPHONE_VAD_DOWNSAMPLE_FACTOR) {
          continue;
        }

        const averagedSample = Math.max(
          -1,
          Math.min(1, this.vadDecimatorSum / MICROPHONE_VAD_DOWNSAMPLE_FACTOR)
        );

        this.vadFrame[this.vadFrameOffset] =
          averagedSample < 0
            ? Math.round(averagedSample * 0x8000)
            : Math.round(averagedSample * 0x7fff);
        this.vadFrameOffset += 1;
        this.vadDecimatorSum = 0;
        this.vadDecimatorPhase = 0;

        if (this.vadFrameOffset >= MICROPHONE_VAD_FRAME_SIZE) {
          if (this.vadMeasureCurrentFrame && downsampleStartMs !== null) {
            this.vadCurrentFrameDownsampleMs +=
              getHighResolutionTimeMs() - downsampleStartMs;
          }

          this.processVadFrame();
          this.vadFrameOffset = 0;
          this.startNextVadFrame();
          downsampleStartMs = this.vadMeasureCurrentFrame
            ? getHighResolutionTimeMs()
            : null;
        }
      }

      if (
        this.vadMeasureCurrentFrame &&
        this.vadFrameOffset > 0 &&
        downsampleStartMs !== null
      ) {
        this.vadCurrentFrameDownsampleMs +=
          getHighResolutionTimeMs() - downsampleStartMs;
      }
    } catch (error) {
      this.failVad(error);
    }
  }

  fillVadBenchmarkFrame(sourceFrame) {
    let frameOffset = 0;

    for (
      let sampleIndex = 0;
      sampleIndex + MICROPHONE_VAD_DOWNSAMPLE_FACTOR <= sourceFrame.length;
      sampleIndex += MICROPHONE_VAD_DOWNSAMPLE_FACTOR
    ) {
      let sum = 0;

      for (
        let offset = 0;
        offset < MICROPHONE_VAD_DOWNSAMPLE_FACTOR;
        offset++
      ) {
        sum += sourceFrame[sampleIndex + offset];
      }

      const averagedSample = Math.max(
        -1,
        Math.min(1, sum / MICROPHONE_VAD_DOWNSAMPLE_FACTOR)
      );

      this.vadFrame[frameOffset] =
        averagedSample < 0
          ? Math.round(averagedSample * 0x8000)
          : Math.round(averagedSample * 0x7fff);
      frameOffset += 1;
    }
  }

  runVadBenchmark(data) {
    if (!this.isVadReady()) {
      this.port.postMessage({
        type: 'vad-benchmark',
        error: 'WebRTC VAD is not ready.'
      });
      return;
    }

    const iterations =
      typeof data.iterations === 'number' && Number.isFinite(data.iterations)
        ? Math.max(1, Math.min(50000, Math.floor(data.iterations)))
        : 10000;
    const batchSize =
      typeof data.batchSize === 'number' && Number.isFinite(data.batchSize)
        ? Math.max(1, Math.min(1000, Math.floor(data.batchSize)))
        : 100;
    const sourceFrame = new Float32Array(
      MICROPHONE_VAD_SOURCE_SAMPLE_RATE * (MICROPHONE_VAD_FRAME_MS / 1000)
    );
    const batchCount = Math.ceil(iterations / batchSize);
    const downsampleTimes = new Float32Array(batchCount);
    const processTimes = new Float32Array(batchCount);
    const combinedTimes = new Float32Array(batchCount);

    for (let index = 0; index < sourceFrame.length; index++) {
      sourceFrame[index] =
        Math.sin(
          (2 * Math.PI * 220 * index) / MICROPHONE_VAD_SOURCE_SAMPLE_RATE
        ) * 0.08;
    }

    try {
      for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
        const batchIterations = Math.min(
          batchSize,
          iterations - batchIndex * batchSize
        );
        const downsampleStartMs = getBenchmarkTimeMs();

        for (let index = 0; index < batchIterations; index++) {
          this.fillVadBenchmarkFrame(sourceFrame);
        }

        const processStartMs = getBenchmarkTimeMs();

        for (let index = 0; index < batchIterations; index++) {
          this.vadHeap16.set(this.vadFrame, this.vadInputPtr >> 1);

          for (
            let modeIndex = 0;
            modeIndex < this.vadHandles.length;
            modeIndex++
          ) {
            const result = this.vadModule._fvad_process(
              this.vadHandles[modeIndex],
              this.vadInputPtr,
              MICROPHONE_VAD_FRAME_SIZE
            );

            if (result < 0) {
              throw new Error('WebRTC VAD processing failed.');
            }
          }
        }

        const processEndMs = getBenchmarkTimeMs();

        downsampleTimes[batchIndex] =
          (processStartMs - downsampleStartMs) / batchIterations;
        processTimes[batchIndex] =
          (processEndMs - processStartMs) / batchIterations;
        combinedTimes[batchIndex] =
          (processEndMs - downsampleStartMs) / batchIterations;
      }

      this.port.postMessage({
        type: 'vad-benchmark',
        iterations,
        batchSize,
        modes: MICROPHONE_VAD_MODES,
        modeCount: MICROPHONE_VAD_MODES.length,
        downsampleAvgMs: this.getVadBenchmarkAverage(downsampleTimes),
        downsampleP95Ms: getTimingPercentile(downsampleTimes, batchCount, 0.95),
        downsampleP99Ms: getTimingPercentile(downsampleTimes, batchCount, 0.99),
        processAvgMs: this.getVadBenchmarkAverage(processTimes),
        processP95Ms: getTimingPercentile(processTimes, batchCount, 0.95),
        processP99Ms: getTimingPercentile(processTimes, batchCount, 0.99),
        combinedAvgMs: this.getVadBenchmarkAverage(combinedTimes),
        combinedP95Ms: getTimingPercentile(combinedTimes, batchCount, 0.95),
        combinedP99Ms: getTimingPercentile(combinedTimes, batchCount, 0.99)
      });
    } catch (error) {
      this.port.postMessage({
        type: 'vad-benchmark',
        error: error instanceof Error ? error.message : 'Benchmark failed.'
      });
    }
  }

  getVadBenchmarkAverage(timings) {
    let total = 0;

    for (let index = 0; index < timings.length; index++) {
      total += timings[index];
    }

    return total / timings.length;
  }

  reportInputStatus({
    estimatedDecibels,
    effectiveThresholdDb,
    noiseFloorDb,
    ambientUpperDb,
    snrDb,
    strongSpeechEvidence,
    speechEvidence,
    eligibleToOpen,
    recentVad3Speech,
    timeSinceLastVad3SpeechMs,
    vad2OnlyDurationMs,
    candidateAuthenticatedSpeech,
    candidateStrictOpen,
    vad3Hits120Ms,
    vad3Hits200Ms,
    vad3ConsecutiveFrames,
    candidateBurstAAuthenticated,
    candidateBurstBAuthenticated,
    candidateBurstAOpen,
    candidateBurstBOpen,
    candidateBurstAOnsetMs,
    candidateBurstBOnsetMs,
    utteranceActive,
    utteranceElapsedMs,
    maxVad3Hits120SinceReport,
    maxVad3Hits200SinceReport,
    burstATriggeredSinceReport,
    burstBTriggeredSinceReport,
    backgroundFrozen,
    digitalSilence,
    gateOpen,
    frameCount
  }) {
    if (!this.reportStatus) return;

    const currentLevelDb = estimatedDecibels;
    this.peakDbSinceStatusReport = Math.max(
      this.peakDbSinceStatusReport,
      currentLevelDb
    );
    this.framesSinceStatusReport += frameCount;

    const reportIntervalFrames =
      (this.statusUpdateIntervalMs / 1000) * sampleRate;

    if (this.framesSinceStatusReport < reportIntervalFrames) return;

    const peakLevelDb = this.peakDbSinceStatusReport;

    this.port.postMessage({
      type: 'status',
      decibels: peakLevelDb,
      currentLevelDb,
      peakLevelDb,
      thresholdDb: effectiveThresholdDb,
      noiseFloorDb,
      ambientUpperDb,
      gateOpen,
      inputSensitivityMode: this.mode,
      vad2SpeechActive: this.vadSpeechActiveByMode[0],
      vad3SpeechActive: this.vadSpeechActiveByMode[1],
      snrDb,
      strongSpeechEvidence,
      speechEvidence,
      eligibleToOpen,
      recentVad3Speech,
      timeSinceLastVad3SpeechMs,
      vad2OnlyDurationMs,
      candidateAuthenticatedSpeech,
      candidateStrictOpen,
      vad3Hits120Ms,
      vad3Hits200Ms,
      vad3ConsecutiveFrames,
      candidateBurstAAuthenticated,
      candidateBurstBAuthenticated,
      candidateBurstAOpen,
      candidateBurstBOpen,
      candidateBurstAOnsetMs,
      candidateBurstBOnsetMs,
      utteranceActive,
      utteranceElapsedMs,
      maxVad3Hits120SinceReport,
      maxVad3Hits200SinceReport,
      burstATriggeredSinceReport,
      burstBTriggeredSinceReport,
      backgroundFrozen,
      digitalSilence,
      vadReady: this.isVadReady(),
      vadUnavailable: this.vadUnavailable,
      vadErrorMessage: this.vadErrorMessage,
      vadSourceSampleRate: sampleRate,
      vadSampleRate: MICROPHONE_VAD_SAMPLE_RATE,
      vadFrameMs: MICROPHONE_VAD_FRAME_MS,
      vadDownsampleAvgMs: this.vadDownsampleAvgMs,
      vadDownsampleP95Ms: this.vadDownsampleP95Ms,
      vadDownsampleP99Ms: this.vadDownsampleP99Ms,
      vadProcessAvgMs: this.vadProcessAvgMs,
      vadProcessP95Ms: this.vadProcessP95Ms,
      vadProcessP99Ms: this.vadProcessP99Ms,
      vadCombinedAvgMs: this.vadCombinedAvgMs,
      vadCombinedP95Ms: this.vadCombinedP95Ms,
      vadCombinedP99Ms: this.vadCombinedP99Ms
    });
    this.framesSinceStatusReport = 0;
    this.peakDbSinceStatusReport = -Infinity;
    this.hybridObserverState = resetAutomaticHybridObserverReportState(
      this.hybridObserverState
    );
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output || output.length === 0) {
      return true;
    }

    const frameCount = output[0]?.length ?? 0;

    if (!input || input.length === 0 || frameCount === 0) {
      for (let channelIndex = 0; channelIndex < output.length; channelIndex++) {
        output[channelIndex].fill(0);
      }

      return true;
    }

    let sum = 0;
    let samplesCount = 0;

    for (let channelIndex = 0; channelIndex < input.length; channelIndex++) {
      const channel = input[channelIndex];

      for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex++) {
        const sample = channel[sampleIndex];
        sum += sample * sample;
      }

      samplesCount += channel.length;
    }

    const rms = Math.sqrt(sum / Math.max(1, samplesCount));
    const estimatedDecibels = 20 * Math.log10(rms + 1e-8);
    const elapsedMs = (frameCount / sampleRate) * 1000;
    const holdFrames = (this.holdMs / 1000) * sampleRate;
    const attackFrames = (MICROPHONE_GATE_OPEN_ATTACK_MS / 1000) * sampleRate;
    const releaseFrames = Math.max(
      1,
      (MICROPHONE_GATE_RELEASE_MS / 1000) * sampleRate
    );
    let effectiveThresholdDb = null;
    let closeThresholdDb = null;
    let noiseFloorDb = null;
    let ambientUpperDb = null;
    let snrDb = null;
    let strongSpeechEvidence = false;
    let speechEvidence = false;
    let eligibleToOpen = false;
    let recentVad3Speech = false;
    let timeSinceLastVad3SpeechMs = null;
    let vad2OnlyDurationMs = 0;
    let candidateAuthenticatedSpeech = false;
    let candidateStrictOpen = false;
    let vad3Hits120Ms = 0;
    let vad3Hits200Ms = 0;
    let vad3ConsecutiveFrames = 0;
    let candidateBurstAAuthenticated = false;
    let candidateBurstBAuthenticated = false;
    let candidateBurstAOpen = false;
    let candidateBurstBOpen = false;
    let candidateBurstAOnsetMs = null;
    let candidateBurstBOnsetMs = null;
    let utteranceActive = false;
    let utteranceElapsedMs = null;
    let maxVad3Hits120SinceReport = 0;
    let maxVad3Hits200SinceReport = 0;
    let burstATriggeredSinceReport = false;
    let burstBTriggeredSinceReport = false;
    let backgroundFrozen = false;
    let digitalSilence = false;
    let automaticUsesVad = false;
    let automaticPrerollShouldLatch = false;
    const gateEnabled = this.mode !== INPUT_SENSITIVITY_MODE_OPEN;

    if (!gateEnabled) {
      this.gateOpen = true;
      this.closeHoldRemainingFrames = 0;
      this.openConfirmationFrames = 0;
      this.releaseRemainingFrames = 0;
      this.releaseStartGain = 0;
      this.currentGain = 1;
    } else if (this.mode === INPUT_SENSITIVITY_MODE_AUTOMATIC) {
      this.processVadAnalysis(input, frameCount);

      const vadReady = this.isVadReady();
      const vad2SpeechActive = vadReady ? this.vadSpeechActiveByMode[0] : null;
      const vad3SpeechActive = vadReady ? this.vadSpeechActiveByMode[1] : null;
      const automaticResult = updateAutomaticSensitivity(
        this.automaticState,
        estimatedDecibels,
        elapsedMs,
        vadReady
          ? {
              vad2SpeechActive,
              vad3SpeechActive,
              gateOpen: this.gateOpen
            }
          : {}
      );

      effectiveThresholdDb = automaticResult.thresholdDb;
      noiseFloorDb = automaticResult.noiseFloorDb;
      ambientUpperDb = automaticResult.ambientUpperDb;
      backgroundFrozen = automaticResult.backgroundFrozen;
      digitalSilence = automaticResult.digitalSilence;
      automaticUsesVad = vadReady;

      if (vadReady) {
        candidateBurstAAuthenticated =
          this.hybridObserverState.candidateBurstAAuthenticated;
        const automaticDecision = getAutomaticHybridDecision({
          decibels: estimatedDecibels,
          noiseFloorDb,
          ambientUpperDb,
          gateOpen: this.gateOpen,
          vad2SpeechActive,
          vad3SpeechActive,
          candidateBurstAAuthenticated
        });

        snrDb = automaticDecision.snrDb;
        strongSpeechEvidence = automaticDecision.strongSpeechEvidence;
        speechEvidence = automaticDecision.speechEvidence;
        eligibleToOpen = automaticDecision.eligibleToOpen;
        backgroundFrozen = automaticDecision.backgroundFrozen;
        digitalSilence = automaticDecision.digitalSilence;

        recentVad3Speech = this.hybridObserverState.recentVad3Speech;
        timeSinceLastVad3SpeechMs =
          this.hybridObserverState.timeSinceLastVad3SpeechMs;
        vad2OnlyDurationMs = this.hybridObserverState.vad2OnlyDurationMs;
        candidateAuthenticatedSpeech =
          this.hybridObserverState.candidateAuthenticatedSpeech;
        candidateStrictOpen = this.hybridObserverState.candidateStrictOpen;
        vad3Hits120Ms = this.hybridObserverState.vad3Hits120Ms;
        vad3Hits200Ms = this.hybridObserverState.vad3Hits200Ms;
        vad3ConsecutiveFrames = this.hybridObserverState.vad3ConsecutiveFrames;
        candidateBurstBAuthenticated =
          this.hybridObserverState.candidateBurstBAuthenticated;
        candidateBurstAOpen = this.hybridObserverState.candidateBurstAOpen;
        candidateBurstBOpen = this.hybridObserverState.candidateBurstBOpen;
        candidateBurstAOnsetMs =
          this.hybridObserverState.candidateBurstAOnsetMs;
        candidateBurstBOnsetMs =
          this.hybridObserverState.candidateBurstBOnsetMs;
        utteranceActive = this.hybridObserverState.utteranceActive;
        utteranceElapsedMs = this.hybridObserverState.utteranceElapsedMs;
        maxVad3Hits120SinceReport =
          this.hybridObserverState.maxVad3Hits120SinceReport;
        maxVad3Hits200SinceReport =
          this.hybridObserverState.maxVad3Hits200SinceReport;
        burstATriggeredSinceReport =
          this.hybridObserverState.burstATriggeredSinceReport;
        burstBTriggeredSinceReport =
          this.hybridObserverState.burstBTriggeredSinceReport;
      }
    } else {
      effectiveThresholdDb = this.thresholdDb;
    }

    if (this.mode === INPUT_SENSITIVITY_MODE_AUTOMATIC && digitalSilence) {
      this.gateOpen = false;
      this.closeHoldRemainingFrames = 0;
      this.openConfirmationFrames = 0;
      this.releaseRemainingFrames = 0;
      this.releaseStartGain = 0;
      this.currentGain = 0;
      this.resetAutomaticPreroll();
    } else if (gateEnabled && effectiveThresholdDb !== null) {
      closeThresholdDb = getGateCloseThresholdDb(effectiveThresholdDb);
      const shouldPassGate = automaticUsesVad
        ? getAutomaticHybridGateSignal({
            gateOpen: this.gateOpen,
            decision: {
              snrDb,
              levelAboveAmbientDb: null,
              strongSpeechEvidence,
              speechEvidence,
              eligibleToOpen,
              backgroundFrozen,
              digitalSilence,
              hasTrustedBackground: true
            }
          })
        : estimatedDecibels >= effectiveThresholdDb;

      if (shouldPassGate) {
        const wasGateOpen = this.gateOpen;

        if (automaticUsesVad && !wasGateOpen) {
          automaticPrerollShouldLatch = true;
        }

        this.openConfirmationFrames = wasGateOpen
          ? attackFrames
          : this.openConfirmationFrames + frameCount;

        if (wasGateOpen || this.openConfirmationFrames >= attackFrames) {
          this.gateOpen = true;
          this.closeHoldRemainingFrames = holdFrames;
          this.releaseRemainingFrames = 0;
          this.releaseStartGain = 0;
          this.currentGain = 1;
        }
      } else {
        this.openConfirmationFrames = 0;

        if (this.gateOpen) {
          if (!automaticUsesVad && estimatedDecibels >= closeThresholdDb) {
            this.closeHoldRemainingFrames = holdFrames;
          } else {
            this.closeHoldRemainingFrames = Math.max(
              0,
              this.closeHoldRemainingFrames - frameCount
            );

            if (this.closeHoldRemainingFrames <= 0) {
              this.gateOpen = false;
              this.releaseTotalFrames = releaseFrames;
              this.releaseRemainingFrames = releaseFrames;
              this.releaseStartGain = this.currentGain;
            }
          }
        }
      }
    }

    const isReleasing =
      gateEnabled && !this.gateOpen && this.releaseRemainingFrames > 0;
    const useAutomaticPreroll =
      automaticUsesVad && gateEnabled && !digitalSilence;

    if (useAutomaticPreroll) {
      this.ensureAutomaticPrerollBuffers(output.length);

      if (automaticPrerollShouldLatch && !this.automaticPrerollDelayActive) {
        this.automaticPrerollReplayLatched = true;
      }

      if (this.gateOpen || isReleasing) {
        this.automaticPrerollDelayActive = true;
      } else if (
        this.automaticPrerollDelayActive ||
        (this.automaticPrerollReplayLatched && !eligibleToOpen)
      ) {
        this.resetAutomaticPreroll();
      }
    } else {
      this.resetAutomaticPreroll();
    }

    this.reportInputStatus({
      estimatedDecibels,
      effectiveThresholdDb,
      noiseFloorDb,
      ambientUpperDb,
      snrDb,
      strongSpeechEvidence,
      speechEvidence,
      eligibleToOpen,
      recentVad3Speech,
      timeSinceLastVad3SpeechMs,
      vad2OnlyDurationMs,
      candidateAuthenticatedSpeech,
      candidateStrictOpen,
      vad3Hits120Ms,
      vad3Hits200Ms,
      vad3ConsecutiveFrames,
      candidateBurstAAuthenticated,
      candidateBurstBAuthenticated,
      candidateBurstAOpen,
      candidateBurstBOpen,
      candidateBurstAOnsetMs,
      candidateBurstBOnsetMs,
      utteranceActive,
      utteranceElapsedMs,
      maxVad3Hits120SinceReport,
      maxVad3Hits200SinceReport,
      burstATriggeredSinceReport,
      burstBTriggeredSinceReport,
      backgroundFrozen,
      digitalSilence,
      gateOpen: !gateEnabled || this.gateOpen || isReleasing,
      frameCount
    });

    for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex++) {
      let gain = 0;

      if (!gateEnabled || this.gateOpen) {
        gain = 1;
      } else if (this.releaseRemainingFrames > 0) {
        gain =
          this.releaseStartGain *
          (this.releaseRemainingFrames / this.releaseTotalFrames);
        this.releaseRemainingFrames = Math.max(
          0,
          this.releaseRemainingFrames - 1
        );
      }

      this.currentGain = gain;

      if (useAutomaticPreroll) {
        if (this.automaticPrerollDelayActive) {
          this.writeAutomaticPrerollOutputFrame(
            input,
            output,
            sampleIndex,
            gain
          );
        } else {
          this.appendAutomaticPrerollFrame(
            input,
            output.length,
            sampleIndex,
            this.automaticPrerollReplayLatched
              ? this.automaticPrerollCapacityFrames
              : this.automaticPrerollHistoryFrames
          );
          this.writeSilentOutputFrame(output, sampleIndex);
        }
      } else {
        this.writeDirectOutputFrame(input, output, sampleIndex, gain);
      }
    }

    if (
      useAutomaticPreroll &&
      this.automaticPrerollDelayActive &&
      !this.gateOpen &&
      this.releaseRemainingFrames <= 0
    ) {
      this.resetAutomaticPreroll();
    }

    return true;
  }
}

registerProcessor(MICROPHONE_NOISE_GATE_WORKLET_NAME, NoiseGateProcessor);
