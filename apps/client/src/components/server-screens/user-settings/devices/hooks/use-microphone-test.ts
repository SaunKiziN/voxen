import {
  clampMicrophoneDecibels,
  createAutomaticInputSensitivityState,
  createMicrophoneInputMeterSnapshot,
  isInputSensitivityMode,
  MICROPHONE_GATE_CLOSE_HOLD_MS,
  MICROPHONE_GATE_DEFAULT_THRESHOLD_DB,
  MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS,
  MICROPHONE_TEST_LEVEL_SAMPLE_INTERVAL_MS,
  updateAutomaticInputSensitivity,
  type TAutomaticInputSensitivityState,
  type TMicrophoneInputMeterSnapshot
} from '@/helpers/audio-gate';
import { applyAudioOutputDevice } from '@/helpers/audio-output';
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

type TPermissionState = 'unknown' | 'granted' | 'denied';

type TUseMicrophoneTestParams = {
  microphoneId: string | undefined;
  playbackId: string | undefined;
  autoGainControl: boolean;
  echoCancellation: boolean;
  noiseSuppression: NoiseSuppression;
  inputSensitivityMode: InputSensitivityMode;
  noiseGateThresholdDb: number;
};

type TRequestPermissionOptions = {
  silent?: boolean;
};

const LOOPBACK_DELAY_SECONDS = 0.12;
const ANALYZER_FFT_SIZE = 512;
const ANALYZER_SMOOTHING_TIME_CONSTANT = 0;
const ANALYZER_MIN_DECIBELS = -100;
const ANALYZER_MAX_DECIBELS = 0;
const isPermissionDeniedError = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');

const useMicrophoneTest = ({
  microphoneId,
  playbackId,
  autoGainControl,
  echoCancellation,
  noiseSuppression,
  inputSensitivityMode,
  noiseGateThresholdDb
}: TUseMicrophoneTestParams) => {
  const { t } = useTranslation('settings');
  const [permissionState, setPermissionState] =
    useState<TPermissionState>('unknown');
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nsAudioContextsRef = useRef<AudioContext[]>([]);
  const nsAudioNodesRef = useRef<AudioNode[]>([]);
  const meterIntervalRef = useRef<number | null>(null);
  const meterWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const noiseGateWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const isTestRequestedRef = useRef(false);
  const testRequestIdRef = useRef(0);
  const meterSnapshotRef = useRef<TMicrophoneInputMeterSnapshot>(
    createMicrophoneInputMeterSnapshot({
      decibels: -100,
      inputSensitivityMode,
      thresholdDb: null,
      gateOpen: true,
      source: 'test'
    })
  );
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

  const getMeterSnapshot = useCallback(() => meterSnapshotRef.current, []);

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
        source: 'test'
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
      source: 'test'
    });
  }, []);

  const getAudioConstraints = useCallback(
    (): MediaTrackConstraints =>
      getMicrophoneAudioConstraints({
        microphoneId,
        autoGainControl,
        echoCancellation,
        noiseSuppression,
        fallbackSampleRate: 48000
      }),
    [microphoneId, autoGainControl, echoCancellation, noiseSuppression]
  );

  const getMicrophoneErrorMessage = useCallback(
    (error: unknown) => {
      if (!(error instanceof DOMException)) {
        return t('microphoneAccessFailed');
      }

      switch (error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          return t('microphonePermissionDenied');
        case 'NotFoundError':
          return t('microphoneNotFound');
        case 'NotReadableError':
          return t('microphoneInUse');
        case 'OverconstrainedError':
          return t('microphoneUnavailable');
        default:
          return t('microphoneAccessFailed');
      }
    },
    [t]
  );

  const stopStreamTracks = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const cleanup = useCallback(() => {
    if (meterIntervalRef.current) {
      window.clearInterval(meterIntervalRef.current);

      meterIntervalRef.current = null;
    }

    stopStreamTracks(mediaStreamRef.current);
    mediaStreamRef.current = null;

    if (testAudioRef.current) {
      testAudioRef.current.pause();
      testAudioRef.current.srcObject = null;
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

    meterSnapshotRef.current = createMicrophoneInputMeterSnapshot({
      decibels: -100,
      inputSensitivityMode: inputSensitivityModeRef.current,
      thresholdDb: null,
      gateOpen: true,
      source: 'test'
    });
  }, [stopStreamTracks]);

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
          MICROPHONE_TEST_LEVEL_SAMPLE_INTERVAL_MS
        );
      };

      const intervalId = window.setInterval(
        updateMeter,
        MICROPHONE_TEST_LEVEL_SAMPLE_INTERVAL_MS
      );

      meterIntervalRef.current = intervalId;

      updateMeter();
    },
    [setMeterSnapshotFromDecibels]
  );

  const startTestPipeline = useCallback(
    async (requestId: number) => {
      cleanup();
      setError(undefined);

      let stream: MediaStream | null = null;
      let audioContext: AudioContext | null = null;
      let destination: MediaStreamAudioDestinationNode | null = null;
      let audioElement: HTMLAudioElement | null = null;
      let localMeterWorkletNode: AudioWorkletNode | null = null;
      let localNoiseGateWorkletNode: AudioWorkletNode | null = null;

      const isStaleRequest = () =>
        requestId !== testRequestIdRef.current || !isTestRequestedRef.current;

      const cleanupLocalResources = () => {
        stopStreamTracks(stream);

        if (
          audioElement &&
          destination &&
          audioElement.srcObject === destination.stream
        ) {
          audioElement.pause();
          audioElement.srcObject = null;
        }

        if (localNoiseGateWorkletNode) {
          destroyNoiseGateWorkletNode(localNoiseGateWorkletNode);
          localNoiseGateWorkletNode = null;
        } else if (noiseGateWorkletNodeRef.current) {
          destroyNoiseGateWorkletNode(noiseGateWorkletNodeRef.current);
          noiseGateWorkletNodeRef.current = null;
        }

        if (localMeterWorkletNode) {
          localMeterWorkletNode.port.onmessage = null;
          localMeterWorkletNode.disconnect();
          localMeterWorkletNode = null;
        } else if (meterWorkletNodeRef.current) {
          meterWorkletNodeRef.current.port.onmessage = null;
          meterWorkletNodeRef.current.disconnect();
          meterWorkletNodeRef.current = null;
        }

        if (audioContext) {
          audioContext.close();
        }

        nsAudioNodesRef.current.forEach((node) => node.disconnect());
        nsAudioNodesRef.current = [];

        nsAudioContextsRef.current.forEach((ctx) => ctx.close());
        nsAudioContextsRef.current = [];
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: false
        });

        if (isStaleRequest()) {
          cleanupLocalResources();

          return false;
        }

        let processedStream: MediaStream = stream;

        if (
          noiseSuppression === NoiseSuppression.DTLN ||
          noiseSuppression === NoiseSuppression.RNNOISE
        ) {
          try {
            const chain = await createNsChain(noiseSuppression, stream);

            nsAudioContextsRef.current = chain.contexts;
            nsAudioNodesRef.current = chain.nodes;

            processedStream = new MediaStream([chain.outputTrack]);
          } catch (nsError) {
            console.error('Noise suppression failed:', nsError);
          }
        }

        if (isStaleRequest()) {
          cleanupLocalResources();

          return false;
        }

        audioContext = new window.AudioContext();

        let source: AudioNode =
          audioContext.createMediaStreamSource(processedStream);

        // DTLN outputs mono; duplicate ch0 to ch1 so the loopback plays centred
        const needsMonoToStereo = noiseSuppression === NoiseSuppression.DTLN;

        if (needsMonoToStereo) {
          const splitter = audioContext.createChannelSplitter(2);
          const merger = audioContext.createChannelMerger(2);

          source.connect(splitter);

          splitter.connect(merger, 0, 0);
          splitter.connect(merger, 0, 1);

          source = merger;
        }

        const delay = audioContext.createDelay(1);

        let meterWorkletNode: AudioWorkletNode | null = null;
        let noiseGateWorkletNode: AudioWorkletNode | null = null;
        let analyser: AnalyserNode | null = null;

        destination = audioContext.createMediaStreamDestination();

        delay.delayTime.value = LOOPBACK_DELAY_SECONDS;

        const { available } = getNoiseGateWorkletAvailabilitySnapshot();

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
            localNoiseGateWorkletNode = noiseGateWorkletNode;
            noiseGateWorkletNode.port.onmessage = setMeterSnapshotFromStatus;
          } catch (error) {
            console.warn(
              'Noise gate AudioWorklet unavailable for mic test:',
              error
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
            localMeterWorkletNode = meterWorkletNode;
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
          } catch (error) {
            console.warn(
              'Audio meter AudioWorklet unavailable for mic test, using analyser fallback:',
              error
            );
          }
        }

        let currentAudioNode: AudioNode = source;

        if (noiseGateWorkletNode) {
          currentAudioNode.connect(noiseGateWorkletNode);
          currentAudioNode = noiseGateWorkletNode;
        } else if (meterWorkletNode) {
          currentAudioNode.connect(meterWorkletNode);
          currentAudioNode = meterWorkletNode;
        } else {
          analyser = audioContext.createAnalyser();
          analyser.fftSize = ANALYZER_FFT_SIZE;
          analyser.minDecibels = ANALYZER_MIN_DECIBELS;
          analyser.maxDecibels = ANALYZER_MAX_DECIBELS;
          analyser.smoothingTimeConstant = ANALYZER_SMOOTHING_TIME_CONSTANT;

          source.connect(analyser);
        }

        currentAudioNode.connect(delay);
        delay.connect(destination);

        if (testAudioRef.current) {
          audioElement = testAudioRef.current;
          audioElement.srcObject = destination.stream;

          await applyAudioOutputDevice(audioElement, playbackId);

          if (isStaleRequest()) {
            cleanupLocalResources();

            return false;
          }

          await audioElement.play();
        }

        if (isStaleRequest()) {
          cleanupLocalResources();

          return false;
        }

        mediaStreamRef.current = stream;
        audioContextRef.current = audioContext;
        meterWorkletNodeRef.current = meterWorkletNode;
        noiseGateWorkletNodeRef.current = noiseGateWorkletNode;

        setPermissionState('granted');

        if (analyser) {
          startAnalyserMeter(analyser);
        }

        setIsTesting(true);

        return true;
      } catch (error) {
        if (isStaleRequest()) {
          cleanupLocalResources();

          return false;
        }

        cleanupLocalResources();
        cleanup();
        setIsTesting(false);

        isTestRequestedRef.current = false;

        if (isPermissionDeniedError(error)) {
          setPermissionState('denied');
        }

        setError(getMicrophoneErrorMessage(error));

        return false;
      }
    },
    [
      cleanup,
      getAudioConstraints,
      getMicrophoneErrorMessage,
      noiseSuppression,
      playbackId,
      setMeterSnapshotFromDecibels,
      setMeterSnapshotFromStatus,
      startAnalyserMeter,
      stopStreamTracks,
      t
    ]
  );

  const requestPermission = useCallback(
    async ({ silent = false }: TRequestPermissionOptions = {}) => {
      if (!silent) {
        setError(undefined);
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: false
        });

        stopStreamTracks(stream);
        setPermissionState('granted');
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          setPermissionState('denied');
        }

        if (!silent) {
          setError(getMicrophoneErrorMessage(error));
        }
      }
    },
    [getAudioConstraints, getMicrophoneErrorMessage, stopStreamTracks]
  );

  const startTest = useCallback(async () => {
    isTestRequestedRef.current = true;
    testRequestIdRef.current += 1;

    return startTestPipeline(testRequestIdRef.current);
  }, [startTestPipeline]);

  const stopTest = useCallback(() => {
    isTestRequestedRef.current = false;
    testRequestIdRef.current += 1;

    setIsTesting(false);
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    inputSensitivityModeRef.current = inputSensitivityMode;

    if (inputSensitivityMode === InputSensitivityMode.AUTOMATIC) {
      automaticInputSensitivityStateRef.current =
        createAutomaticInputSensitivityState();
    }

    if (noiseGateWorkletNodeRef.current) {
      postNoiseGateWorkletConfig(noiseGateWorkletNodeRef.current, {
        mode: inputSensitivityMode
      });
    }
  }, [inputSensitivityMode]);

  useEffect(() => {
    const thresholdDb = clampMicrophoneDecibels(
      noiseGateThresholdDb ?? MICROPHONE_GATE_DEFAULT_THRESHOLD_DB
    );
    noiseGateThresholdDbRef.current = thresholdDb;

    if (noiseGateWorkletNodeRef.current) {
      postNoiseGateWorkletConfig(noiseGateWorkletNodeRef.current, {
        thresholdDb
      });
    }
  }, [noiseGateThresholdDb]);

  useEffect(() => {
    if (!navigator.permissions?.query) return;

    let mounted = true;
    let permissionStatus: PermissionStatus | null = null;

    const updatePermissionState = () => {
      if (!permissionStatus || !mounted) return;

      if (permissionStatus.state === 'granted') {
        setPermissionState('granted');
        return;
      }

      if (permissionStatus.state === 'denied') {
        setPermissionState('denied');
        return;
      }

      setPermissionState('unknown');
    };

    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        permissionStatus = status;
        updatePermissionState();
        permissionStatus.onchange = updatePermissionState;
      })
      .catch(() => {
        // ignore browsers that do not support this permission descriptor
      });

    return () => {
      mounted = false;

      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isTestRequestedRef.current) return;

    testRequestIdRef.current += 1;
    startTestPipeline(testRequestIdRef.current);
  }, [startTestPipeline]);

  useEffect(() => {
    return () => {
      isTestRequestedRef.current = false;
      testRequestIdRef.current += 1;
      cleanup();
    };
  }, [cleanup]);

  return useMemo(
    () => ({
      testAudioRef,
      permissionState,
      isTesting,
      getMeterSnapshot,
      error,
      requestPermission,
      startTest,
      stopTest
    }),
    [
      permissionState,
      isTesting,
      getMeterSnapshot,
      error,
      requestPermission,
      startTest,
      stopTest
    ]
  );
};

export { useMicrophoneTest };
