import {
  clampMicrophoneDecibels,
  createAutomaticInputSensitivityState,
  createMicrophoneInputMeterSnapshot,
  isInputSensitivityMode,
  MICROPHONE_GATE_CLOSE_HOLD_MS,
  MICROPHONE_GATE_DEFAULT_THRESHOLD_DB,
  MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS,
  MICROPHONE_LEVEL_METER_MIN_DB,
  updateAutomaticInputSensitivity,
  type TAutomaticInputSensitivityState,
  type TMicrophoneInputMeterSnapshot
} from '@/helpers/audio-gate';
import { createAudioMeterWorkletNode } from '@/helpers/audio-worklet/audio-meter-worklet';
import {
  createNoiseGateWorkletNode,
  destroyNoiseGateWorkletNode,
  getNoiseGateWorkletAvailabilitySnapshot,
  markNoiseGateWorkletUnavailable,
  postNoiseGateWorkletConfig
} from '@/helpers/audio-worklet/noise-gate-worklet';
import { createNsChain } from '@/helpers/audio-worklet/ns-worklet';
import { getMicrophoneAudioConstraints } from '@/helpers/microphone-constraints';
import { InputSensitivityMode, NoiseSuppression } from '@/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TUseMicrophoneInputMeterParams = {
  enabled: boolean;
  sourceStream?: MediaStream;
  microphoneId: string | undefined;
  autoGainControl: boolean;
  echoCancellation: boolean;
  noiseSuppression: NoiseSuppression;
  inputSensitivityMode: InputSensitivityMode;
  noiseGateThresholdDb: number;
};

const ANALYZER_FFT_SIZE = 512;
const ANALYZER_SMOOTHING_TIME_CONSTANT = 0;
const ANALYZER_MIN_DECIBELS = -100;
const ANALYZER_MAX_DECIBELS = 0;

const useMicrophoneInputMeter = ({
  enabled,
  sourceStream,
  microphoneId,
  autoGainControl,
  echoCancellation,
  noiseSuppression,
  inputSensitivityMode,
  noiseGateThresholdDb
}: TUseMicrophoneInputMeterParams) => {
  const { t } = useTranslation('settings');
  const [error, setError] = useState<string | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const ownsStreamRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterIntervalRef = useRef<number | null>(null);
  const meterWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const noiseGateWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const nsAudioContextsRef = useRef<AudioContext[]>([]);
  const nsAudioNodesRef = useRef<AudioNode[]>([]);
  const inputSensitivityModeRef = useRef(inputSensitivityMode);
  const noiseGateThresholdDbRef = useRef(
    clampMicrophoneDecibels(
      noiseGateThresholdDb ?? MICROPHONE_GATE_DEFAULT_THRESHOLD_DB
    )
  );
  const automaticInputSensitivityStateRef =
    useRef<TAutomaticInputSensitivityState>(
      createAutomaticInputSensitivityState()
    );
  const meterSnapshotRef = useRef<TMicrophoneInputMeterSnapshot>(
    createMicrophoneInputMeterSnapshot({
      decibels: MICROPHONE_LEVEL_METER_MIN_DB,
      inputSensitivityMode,
      thresholdDb: null,
      gateOpen: true,
      source: 'settings'
    })
  );

  const getMeterSnapshot = useCallback(() => meterSnapshotRef.current, []);

  const cleanup = useCallback(() => {
    if (meterIntervalRef.current) {
      window.clearInterval(meterIntervalRef.current);
      meterIntervalRef.current = null;
    }

    if (noiseGateWorkletNodeRef.current) {
      destroyNoiseGateWorkletNode(noiseGateWorkletNodeRef.current);
      noiseGateWorkletNodeRef.current = null;
    }

    if (meterWorkletNodeRef.current) {
      meterWorkletNodeRef.current.port.onmessage = null;
      meterWorkletNodeRef.current.disconnect();
      meterWorkletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    nsAudioNodesRef.current.forEach((node) => node.disconnect());
    nsAudioNodesRef.current = [];

    nsAudioContextsRef.current.forEach((ctx) => ctx.close());
    nsAudioContextsRef.current = [];

    if (ownsStreamRef.current) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    }

    streamRef.current = null;
    ownsStreamRef.current = false;
    meterSnapshotRef.current = createMicrophoneInputMeterSnapshot({
      decibels: MICROPHONE_LEVEL_METER_MIN_DB,
      inputSensitivityMode: inputSensitivityModeRef.current,
      thresholdDb: null,
      gateOpen: true,
      source: 'settings'
    });
  }, []);

  const getFallbackThresholdDb = useCallback(
    (estimatedDecibels: number, elapsedMs: number) => {
      if (inputSensitivityModeRef.current === InputSensitivityMode.OPEN) {
        return null;
      }

      if (inputSensitivityModeRef.current === InputSensitivityMode.MANUAL) {
        return noiseGateThresholdDbRef.current;
      }

      const result = updateAutomaticInputSensitivity(
        automaticInputSensitivityStateRef.current,
        estimatedDecibels,
        elapsedMs
      );

      automaticInputSensitivityStateRef.current = result.state;

      return result.thresholdDb;
    },
    []
  );

  const setMeterSnapshotFromDecibels = useCallback(
    (estimatedDecibels: number, elapsedMs: number) => {
      const thresholdDb = getFallbackThresholdDb(estimatedDecibels, elapsedMs);

      meterSnapshotRef.current = createMicrophoneInputMeterSnapshot({
        decibels: estimatedDecibels,
        inputSensitivityMode: inputSensitivityModeRef.current,
        thresholdDb,
        gateOpen:
          thresholdDb === null ||
          inputSensitivityModeRef.current === InputSensitivityMode.OPEN ||
          estimatedDecibels >= thresholdDb,
        source: 'settings'
      });
    },
    [getFallbackThresholdDb]
  );

  const setMeterSnapshotFromStatus = useCallback((event: MessageEvent) => {
    const data = event.data;

    if (!data || typeof data !== 'object' || data.type !== 'status') {
      return;
    }

    if (
      typeof data.decibels !== 'number' ||
      !Number.isFinite(data.decibels) ||
      !isInputSensitivityMode(data.inputSensitivityMode)
    ) {
      return;
    }

    const currentLevelDb =
      typeof data.currentLevelDb === 'number' &&
      Number.isFinite(data.currentLevelDb)
        ? data.currentLevelDb
        : data.decibels;
    const peakLevelDb =
      typeof data.peakLevelDb === 'number' && Number.isFinite(data.peakLevelDb)
        ? data.peakLevelDb
        : data.decibels;

    meterSnapshotRef.current = createMicrophoneInputMeterSnapshot({
      decibels: peakLevelDb,
      currentLevelDb,
      peakLevelDb,
      inputSensitivityMode: data.inputSensitivityMode,
      thresholdDb:
        typeof data.thresholdDb === 'number' &&
        Number.isFinite(data.thresholdDb)
          ? data.thresholdDb
          : null,
      noiseFloorDb:
        typeof data.noiseFloorDb === 'number' &&
        Number.isFinite(data.noiseFloorDb)
          ? data.noiseFloorDb
          : null,
      ambientUpperDb:
        typeof data.ambientUpperDb === 'number' &&
        Number.isFinite(data.ambientUpperDb)
          ? data.ambientUpperDb
          : null,
      gateOpen: typeof data.gateOpen === 'boolean' ? data.gateOpen : true,
      vad2SpeechActive:
        typeof data.vad2SpeechActive === 'boolean'
          ? data.vad2SpeechActive
          : null,
      vad3SpeechActive:
        typeof data.vad3SpeechActive === 'boolean'
          ? data.vad3SpeechActive
          : null,
      snrDb:
        typeof data.snrDb === 'number' && Number.isFinite(data.snrDb)
          ? data.snrDb
          : null,
      strongSpeechEvidence:
        typeof data.strongSpeechEvidence === 'boolean'
          ? data.strongSpeechEvidence
          : null,
      speechEvidence:
        typeof data.speechEvidence === 'boolean' ? data.speechEvidence : null,
      eligibleToOpen:
        typeof data.eligibleToOpen === 'boolean' ? data.eligibleToOpen : null,
      recentVad3Speech:
        typeof data.recentVad3Speech === 'boolean'
          ? data.recentVad3Speech
          : null,
      timeSinceLastVad3SpeechMs:
        typeof data.timeSinceLastVad3SpeechMs === 'number' &&
        Number.isFinite(data.timeSinceLastVad3SpeechMs)
          ? data.timeSinceLastVad3SpeechMs
          : null,
      vad2OnlyDurationMs:
        typeof data.vad2OnlyDurationMs === 'number' &&
        Number.isFinite(data.vad2OnlyDurationMs)
          ? data.vad2OnlyDurationMs
          : null,
      candidateAuthenticatedSpeech:
        typeof data.candidateAuthenticatedSpeech === 'boolean'
          ? data.candidateAuthenticatedSpeech
          : null,
      candidateStrictOpen:
        typeof data.candidateStrictOpen === 'boolean'
          ? data.candidateStrictOpen
          : null,
      vad3Hits120Ms:
        typeof data.vad3Hits120Ms === 'number' &&
        Number.isFinite(data.vad3Hits120Ms)
          ? data.vad3Hits120Ms
          : null,
      vad3Hits200Ms:
        typeof data.vad3Hits200Ms === 'number' &&
        Number.isFinite(data.vad3Hits200Ms)
          ? data.vad3Hits200Ms
          : null,
      vad3ConsecutiveFrames:
        typeof data.vad3ConsecutiveFrames === 'number' &&
        Number.isFinite(data.vad3ConsecutiveFrames)
          ? data.vad3ConsecutiveFrames
          : null,
      candidateBurstAAuthenticated:
        typeof data.candidateBurstAAuthenticated === 'boolean'
          ? data.candidateBurstAAuthenticated
          : null,
      candidateBurstBAuthenticated:
        typeof data.candidateBurstBAuthenticated === 'boolean'
          ? data.candidateBurstBAuthenticated
          : null,
      candidateBurstAOpen:
        typeof data.candidateBurstAOpen === 'boolean'
          ? data.candidateBurstAOpen
          : null,
      candidateBurstBOpen:
        typeof data.candidateBurstBOpen === 'boolean'
          ? data.candidateBurstBOpen
          : null,
      candidateBurstAOnsetMs:
        typeof data.candidateBurstAOnsetMs === 'number' &&
        Number.isFinite(data.candidateBurstAOnsetMs)
          ? data.candidateBurstAOnsetMs
          : null,
      candidateBurstBOnsetMs:
        typeof data.candidateBurstBOnsetMs === 'number' &&
        Number.isFinite(data.candidateBurstBOnsetMs)
          ? data.candidateBurstBOnsetMs
          : null,
      utteranceActive:
        typeof data.utteranceActive === 'boolean' ? data.utteranceActive : null,
      utteranceElapsedMs:
        typeof data.utteranceElapsedMs === 'number' &&
        Number.isFinite(data.utteranceElapsedMs)
          ? data.utteranceElapsedMs
          : null,
      maxVad3Hits120SinceReport:
        typeof data.maxVad3Hits120SinceReport === 'number' &&
        Number.isFinite(data.maxVad3Hits120SinceReport)
          ? data.maxVad3Hits120SinceReport
          : null,
      maxVad3Hits200SinceReport:
        typeof data.maxVad3Hits200SinceReport === 'number' &&
        Number.isFinite(data.maxVad3Hits200SinceReport)
          ? data.maxVad3Hits200SinceReport
          : null,
      burstATriggeredSinceReport:
        typeof data.burstATriggeredSinceReport === 'boolean'
          ? data.burstATriggeredSinceReport
          : null,
      burstBTriggeredSinceReport:
        typeof data.burstBTriggeredSinceReport === 'boolean'
          ? data.burstBTriggeredSinceReport
          : null,
      backgroundFrozen:
        typeof data.backgroundFrozen === 'boolean'
          ? data.backgroundFrozen
          : null,
      digitalSilence:
        typeof data.digitalSilence === 'boolean' ? data.digitalSilence : null,
      vadSampleRate:
        typeof data.vadSampleRate === 'number' &&
        Number.isFinite(data.vadSampleRate)
          ? data.vadSampleRate
          : null,
      vadFrameMs:
        typeof data.vadFrameMs === 'number' && Number.isFinite(data.vadFrameMs)
          ? data.vadFrameMs
          : null,
      source: 'settings'
    });
  }, []);

  const startAnalyserMeter = useCallback(
    (analyser: AnalyserNode) => {
      const floatDataArray = new Float32Array(analyser.fftSize);

      const updateMeter = () => {
        let sum = 0;

        analyser.getFloatTimeDomainData(floatDataArray);

        for (let index = 0; index < floatDataArray.length; index++) {
          const sample = floatDataArray[index]!;

          sum += sample * sample;
        }

        const rms = Math.sqrt(sum / floatDataArray.length);
        const estimatedDecibels = 20 * Math.log10(rms + 1e-8);

        setMeterSnapshotFromDecibels(
          estimatedDecibels,
          MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS
        );
      };

      meterIntervalRef.current = window.setInterval(
        updateMeter,
        MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS
      );

      updateMeter();
    },
    [setMeterSnapshotFromDecibels]
  );

  useEffect(() => {
    inputSensitivityModeRef.current = inputSensitivityMode;

    if (inputSensitivityMode === InputSensitivityMode.AUTOMATIC) {
      automaticInputSensitivityStateRef.current =
        createAutomaticInputSensitivityState();
    }

    if (!noiseGateWorkletNodeRef.current) return;

    postNoiseGateWorkletConfig(noiseGateWorkletNodeRef.current, {
      mode: inputSensitivityMode
    });
  }, [inputSensitivityMode]);

  useEffect(() => {
    const thresholdDb = clampMicrophoneDecibels(
      noiseGateThresholdDb ?? MICROPHONE_GATE_DEFAULT_THRESHOLD_DB
    );

    noiseGateThresholdDbRef.current = thresholdDb;

    if (!noiseGateWorkletNodeRef.current) return;

    postNoiseGateWorkletConfig(noiseGateWorkletNodeRef.current, {
      thresholdDb
    });
  }, [noiseGateThresholdDb]);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      setError(undefined);
      return;
    }

    let cancelled = false;

    const start = async () => {
      cleanup();
      setError(undefined);

      try {
        const stream =
          sourceStream ??
          (await navigator.mediaDevices.getUserMedia({
            audio: getMicrophoneAudioConstraints({
              microphoneId,
              autoGainControl,
              echoCancellation,
              noiseSuppression
            }),
            video: false
          }));

        if (cancelled) {
          if (!sourceStream) {
            stream.getTracks().forEach((track) => track.stop());
          }

          return;
        }

        let processingStream = stream;

        if (
          !sourceStream &&
          (noiseSuppression === NoiseSuppression.DTLN ||
            noiseSuppression === NoiseSuppression.RNNOISE)
        ) {
          try {
            const chain = await createNsChain(noiseSuppression, stream);

            if (cancelled) {
              chain.nodes.forEach((node) => node.disconnect());
              chain.contexts.forEach((ctx) => ctx.close());
              stream.getTracks().forEach((track) => track.stop());

              return;
            }

            nsAudioContextsRef.current = chain.contexts;
            nsAudioNodesRef.current = chain.nodes;
            processingStream = new MediaStream([chain.outputTrack]);
          } catch (nsError) {
            console.warn(
              'Noise suppression unavailable for input meter, using regular microphone stream:',
              nsError
            );
          }
        }

        const audioContext = new window.AudioContext();
        const source = audioContext.createMediaStreamSource(processingStream);
        const destination = audioContext.createMediaStreamDestination();
        const { available } = getNoiseGateWorkletAvailabilitySnapshot();
        let currentAudioNode: AudioNode = source;
        let analyser: AnalyserNode | null = null;
        let noiseGateWorkletNode: AudioWorkletNode | null = null;
        let meterWorkletNode: AudioWorkletNode | null = null;

        const cleanupStartResources = () => {
          if (noiseGateWorkletNode) {
            destroyNoiseGateWorkletNode(noiseGateWorkletNode);
          }

          meterWorkletNode?.disconnect();
          audioContext.close();
          nsAudioNodesRef.current.forEach((node) => node.disconnect());
          nsAudioNodesRef.current = [];
          nsAudioContextsRef.current.forEach((ctx) => ctx.close());
          nsAudioContextsRef.current = [];

          if (!sourceStream) {
            stream.getTracks().forEach((track) => track.stop());
          }
        };

        if (available) {
          try {
            noiseGateWorkletNode = await createNoiseGateWorkletNode(
              audioContext,
              {
                mode: inputSensitivityModeRef.current,
                thresholdDb: noiseGateThresholdDbRef.current,
                holdMs: MICROPHONE_GATE_CLOSE_HOLD_MS,
                reportStatus: true,
                statusUpdateIntervalMs:
                  MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS
              }
            );

            if (cancelled) {
              cleanupStartResources();
              return;
            }

            noiseGateWorkletNode.port.onmessage = setMeterSnapshotFromStatus;
            currentAudioNode.connect(noiseGateWorkletNode);
            currentAudioNode = noiseGateWorkletNode;
          } catch (workletError) {
            console.warn(
              'Noise gate AudioWorklet unavailable for input meter:',
              workletError
            );
            markNoiseGateWorkletUnavailable(t('noiseGateProcessorFailed'));
          }
        }

        if (!noiseGateWorkletNode) {
          try {
            meterWorkletNode = await createAudioMeterWorkletNode(audioContext, {
              enabled: true,
              updateIntervalMs: MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS
            });

            if (cancelled) {
              cleanupStartResources();
              return;
            }

            meterWorkletNode.port.onmessage = (event) => {
              const data = event.data;

              if (!data || typeof data !== 'object' || data.type !== 'meter') {
                return;
              }

              if (
                typeof data.decibels !== 'number' ||
                !Number.isFinite(data.decibels)
              ) {
                return;
              }

              setMeterSnapshotFromDecibels(
                data.decibels,
                MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS
              );
            };

            currentAudioNode.connect(meterWorkletNode);
            currentAudioNode = meterWorkletNode;
          } catch (meterError) {
            console.warn(
              'Audio meter AudioWorklet unavailable for input meter, using analyser fallback:',
              meterError
            );

            analyser = audioContext.createAnalyser();
            analyser.fftSize = ANALYZER_FFT_SIZE;
            analyser.minDecibels = ANALYZER_MIN_DECIBELS;
            analyser.maxDecibels = ANALYZER_MAX_DECIBELS;
            analyser.smoothingTimeConstant = ANALYZER_SMOOTHING_TIME_CONSTANT;
            source.connect(analyser);
          }
        }

        currentAudioNode.connect(destination);

        if (cancelled) {
          cleanupStartResources();
          return;
        }

        streamRef.current = stream;
        ownsStreamRef.current = !sourceStream;
        audioContextRef.current = audioContext;
        meterWorkletNodeRef.current = meterWorkletNode;
        noiseGateWorkletNodeRef.current = noiseGateWorkletNode;

        if (analyser) {
          startAnalyserMeter(analyser);
        }
      } catch (startError) {
        if (cancelled) return;

        cleanup();
        setError(
          startError instanceof DOMException &&
            startError.name === 'NotAllowedError'
            ? t('microphonePermissionDenied')
            : t('microphoneAccessFailed')
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [
    enabled,
    sourceStream,
    microphoneId,
    autoGainControl,
    echoCancellation,
    noiseSuppression,
    cleanup,
    setMeterSnapshotFromDecibels,
    setMeterSnapshotFromStatus,
    startAnalyserMeter,
    t
  ]);

  return useMemo(
    () => ({
      getMeterSnapshot,
      error
    }),
    [getMeterSnapshot, error]
  );
};

export { useMicrophoneInputMeter };
