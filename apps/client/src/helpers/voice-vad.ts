import { InputSensitivityMode } from '@/types';

type TVadDiagnosticSnapshot = {
  currentLevelDb: number;
  peakLevelDb: number;
  vad2SpeechActive: boolean;
  vad3SpeechActive: boolean;
  snrDb: number | null;
  strongSpeechEvidence: boolean;
  speechEvidence: boolean;
  eligibleToOpen: boolean;
  recentVad3Speech: boolean;
  timeSinceLastVad3SpeechMs: number | null;
  vad2OnlyDurationMs: number;
  candidateAuthenticatedSpeech: boolean;
  candidateStrictOpen: boolean;
  vad3Hits120Ms: number;
  vad3Hits200Ms: number;
  vad3ConsecutiveFrames: number;
  maxVad3Hits120SinceReport: number;
  maxVad3Hits200SinceReport: number;
  candidateBurstAAuthenticated: boolean;
  candidateBurstBAuthenticated: boolean;
  candidateBurstAOpen: boolean;
  candidateBurstBOpen: boolean;
  candidateBurstAOnsetMs: number | null;
  candidateBurstBOnsetMs: number | null;
  utteranceActive: boolean;
  utteranceElapsedMs: number | null;
  burstATriggeredSinceReport: boolean;
  burstBTriggeredSinceReport: boolean;
  gateOpen: boolean;
  automaticThresholdDb: number | null;
  noiseFloorDb: number | null;
  ambientUpperDb: number | null;
  backgroundFrozen: boolean;
  digitalSilence: boolean;
  vadSampleRate: number;
  vadFrameMs: number;
};

const MICROPHONE_VAD_WASM_URL = '/vad/fvad.wasm';
const MICROPHONE_VAD_WORKLET_URL = '/vad/fvad-worklet.js';
const MICROPHONE_VAD_SAMPLE_RATE = 16000;
const MICROPHONE_VAD_SOURCE_SAMPLE_RATE = 48000;
const MICROPHONE_VAD_FRAME_MS = 20;
const MICROPHONE_VAD_MODES = [2, 3] as const;
const MICROPHONE_VAD_DIAGNOSTIC_INTERVAL_MS = 250;
const MICROPHONE_VAD_FRAME_SIZE =
  (MICROPHONE_VAD_SAMPLE_RATE * MICROPHONE_VAD_FRAME_MS) / 1000;
const MICROPHONE_VAD_DOWNSAMPLE_FACTOR =
  MICROPHONE_VAD_SOURCE_SAMPLE_RATE / MICROPHONE_VAD_SAMPLE_RATE;

const inputSensitivityModeUsesVad = (mode: InputSensitivityMode) =>
  mode === InputSensitivityMode.AUTOMATIC;

const formatVadDiagnosticNumber = (value: number | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(1)
    : 'n/a';

const createVadDiagnosticMessage = ({
  currentLevelDb,
  peakLevelDb,
  vad2SpeechActive,
  vad3SpeechActive,
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
  maxVad3Hits120SinceReport,
  maxVad3Hits200SinceReport,
  candidateBurstAAuthenticated,
  candidateBurstBAuthenticated,
  candidateBurstAOpen,
  candidateBurstBOpen,
  candidateBurstAOnsetMs,
  candidateBurstBOnsetMs,
  utteranceActive,
  utteranceElapsedMs,
  burstATriggeredSinceReport,
  burstBTriggeredSinceReport,
  gateOpen,
  automaticThresholdDb,
  noiseFloorDb,
  ambientUpperDb,
  backgroundFrozen,
  digitalSilence,
  vadSampleRate,
  vadFrameMs
}: TVadDiagnosticSnapshot) =>
  `[VAD-DIAG] current=${formatVadDiagnosticNumber(currentLevelDb)} peak=${formatVadDiagnosticNumber(peakLevelDb)} vad2=${vad2SpeechActive} vad3=${vad3SpeechActive} snr=${formatVadDiagnosticNumber(snrDb)} strongSpeech=${strongSpeechEvidence} speechEvidence=${speechEvidence} eligibleToOpen=${eligibleToOpen} gate=${gateOpen} threshold=${formatVadDiagnosticNumber(automaticThresholdDb)} floor=${formatVadDiagnosticNumber(noiseFloorDb)} upper=${formatVadDiagnosticNumber(ambientUpperDb)} backgroundFrozen=${backgroundFrozen} digitalSilence=${digitalSilence} recentVad3=${recentVad3Speech} sinceVad3Ms=${formatVadDiagnosticNumber(timeSinceLastVad3SpeechMs)} vad2OnlyMs=${formatVadDiagnosticNumber(vad2OnlyDurationMs)} candidateAuthenticated=${candidateAuthenticatedSpeech} candidateStrictOpen=${candidateStrictOpen} v3_120=${vad3Hits120Ms} v3_200=${vad3Hits200Ms} v3run=${vad3ConsecutiveFrames} maxV3_120=${maxVad3Hits120SinceReport} maxV3_200=${maxVad3Hits200SinceReport} burstA=${candidateBurstAAuthenticated} burstB=${candidateBurstBAuthenticated} burstAOpen=${candidateBurstAOpen} burstBOpen=${candidateBurstBOpen} utteranceActive=${utteranceActive} utteranceMs=${formatVadDiagnosticNumber(utteranceElapsedMs)} burstATriggered=${burstATriggeredSinceReport} burstBTriggered=${burstBTriggeredSinceReport} onsetA=${formatVadDiagnosticNumber(candidateBurstAOnsetMs)} onsetB=${formatVadDiagnosticNumber(candidateBurstBOnsetMs)} frame=${vadFrameMs}ms rate=${vadSampleRate}`;

const downsample48KhzTo16KhzForVad = (samples: readonly number[]) => {
  const frame = new Int16Array(
    Math.floor(samples.length / MICROPHONE_VAD_DOWNSAMPLE_FACTOR)
  );
  let frameIndex = 0;

  for (
    let sampleIndex = 0;
    sampleIndex + MICROPHONE_VAD_DOWNSAMPLE_FACTOR <= samples.length;
    sampleIndex += MICROPHONE_VAD_DOWNSAMPLE_FACTOR
  ) {
    let sum = 0;

    for (let offset = 0; offset < MICROPHONE_VAD_DOWNSAMPLE_FACTOR; offset++) {
      sum += samples[sampleIndex + offset] ?? 0;
    }

    const averagedSample = Math.max(
      -1,
      Math.min(1, sum / MICROPHONE_VAD_DOWNSAMPLE_FACTOR)
    );

    frame[frameIndex] =
      averagedSample < 0
        ? Math.round(averagedSample * 0x8000)
        : Math.round(averagedSample * 0x7fff);
    frameIndex += 1;
  }

  return frame;
};

export {
  createVadDiagnosticMessage,
  downsample48KhzTo16KhzForVad,
  formatVadDiagnosticNumber,
  inputSensitivityModeUsesVad,
  MICROPHONE_VAD_DIAGNOSTIC_INTERVAL_MS,
  MICROPHONE_VAD_DOWNSAMPLE_FACTOR,
  MICROPHONE_VAD_FRAME_MS,
  MICROPHONE_VAD_FRAME_SIZE,
  MICROPHONE_VAD_MODES,
  MICROPHONE_VAD_SAMPLE_RATE,
  MICROPHONE_VAD_SOURCE_SAMPLE_RATE,
  MICROPHONE_VAD_WASM_URL,
  MICROPHONE_VAD_WORKLET_URL
};

export type { TVadDiagnosticSnapshot };
