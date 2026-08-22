import { InputSensitivityMode } from '@/types';
import { describe, expect, test } from 'bun:test';
import {
  createVadDiagnosticMessage,
  downsample48KhzTo16KhzForVad,
  inputSensitivityModeUsesVad,
  MICROPHONE_VAD_DOWNSAMPLE_FACTOR,
  MICROPHONE_VAD_FRAME_MS,
  MICROPHONE_VAD_FRAME_SIZE,
  MICROPHONE_VAD_MODES,
  MICROPHONE_VAD_SAMPLE_RATE,
  MICROPHONE_VAD_SOURCE_SAMPLE_RATE
} from '../voice-vad';

describe('voice VAD helpers', () => {
  test('only Automatic mode uses VAD', () => {
    expect(inputSensitivityModeUsesVad(InputSensitivityMode.AUTOMATIC)).toBe(
      true
    );
    expect(inputSensitivityModeUsesVad(InputSensitivityMode.MANUAL)).toBe(
      false
    );
    expect(inputSensitivityModeUsesVad(InputSensitivityMode.OPEN)).toBe(false);
  });

  test('uses the initial classic WebRTC VAD frame format', () => {
    expect(MICROPHONE_VAD_SOURCE_SAMPLE_RATE).toBe(48000);
    expect(MICROPHONE_VAD_SAMPLE_RATE).toBe(16000);
    expect(MICROPHONE_VAD_DOWNSAMPLE_FACTOR).toBe(3);
    expect(MICROPHONE_VAD_FRAME_MS).toBe(20);
    expect(MICROPHONE_VAD_FRAME_SIZE).toBe(320);
    expect(MICROPHONE_VAD_MODES).toEqual([2, 3]);
  });

  test('downsamples one 48 kHz 20 ms frame into one 16 kHz VAD frame', () => {
    const sourceSamples = Array(960).fill(0.25);
    const vadFrame = downsample48KhzTo16KhzForVad(sourceSamples);

    expect(vadFrame).toHaveLength(MICROPHONE_VAD_FRAME_SIZE);
  });

  test('uses a three-sample boxcar before decimating', () => {
    const vadFrame = downsample48KhzTo16KhzForVad([1, 0, 0, 0, 0, 0]);

    expect(vadFrame).toHaveLength(2);
    expect(vadFrame[0]).toBe(Math.round((1 / 3) * 0x7fff));
    expect(vadFrame[0]).not.toBe(0x7fff);
    expect(vadFrame[1]).toBe(0);
  });

  test('handles digital silence as a zero PCM analysis frame', () => {
    const vadFrame = downsample48KhzTo16KhzForVad(Array(960).fill(0));

    expect(vadFrame.every((sample) => sample === 0)).toBe(true);
  });

  test('formats throttled diagnostics with the requested fields', () => {
    expect(
      createVadDiagnosticMessage({
        currentLevelDb: -59.64,
        peakLevelDb: -43.84,
        vad2SpeechActive: true,
        vad3SpeechActive: false,
        snrDb: 11.4,
        strongSpeechEvidence: false,
        speechEvidence: true,
        eligibleToOpen: true,
        recentVad3Speech: true,
        timeSinceLastVad3SpeechMs: 40,
        vad2OnlyDurationMs: 120,
        candidateAuthenticatedSpeech: true,
        candidateStrictOpen: true,
        vad3Hits120Ms: 2,
        vad3Hits200Ms: 3,
        vad3ConsecutiveFrames: 0,
        maxVad3Hits120SinceReport: 2,
        maxVad3Hits200SinceReport: 3,
        candidateBurstAAuthenticated: true,
        candidateBurstBAuthenticated: true,
        candidateBurstAOpen: true,
        candidateBurstBOpen: true,
        candidateBurstAOnsetMs: 20,
        candidateBurstBOnsetMs: null,
        utteranceActive: true,
        utteranceElapsedMs: 120,
        burstATriggeredSinceReport: true,
        burstBTriggeredSinceReport: false,
        gateOpen: false,
        automaticThresholdDb: -48,
        noiseFloorDb: -71,
        ambientUpperDb: -62.9,
        backgroundFrozen: true,
        digitalSilence: false,
        vadSampleRate: MICROPHONE_VAD_SAMPLE_RATE,
        vadFrameMs: MICROPHONE_VAD_FRAME_MS
      })
    ).toBe(
      '[VAD-DIAG] current=-59.6 peak=-43.8 vad2=true vad3=false snr=11.4 strongSpeech=false speechEvidence=true eligibleToOpen=true gate=false threshold=-48.0 floor=-71.0 upper=-62.9 backgroundFrozen=true digitalSilence=false recentVad3=true sinceVad3Ms=40.0 vad2OnlyMs=120.0 candidateAuthenticated=true candidateStrictOpen=true v3_120=2 v3_200=3 v3run=0 maxV3_120=2 maxV3_200=3 burstA=true burstB=true burstAOpen=true burstBOpen=true utteranceActive=true utteranceMs=120.0 burstATriggered=true burstBTriggered=false onsetA=20.0 onsetB=n/a frame=20ms rate=16000'
    );
  });
});
