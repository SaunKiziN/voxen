import noiseGateProcessorUrl from '@/audio-worklets/noise-gate-processor.js?url';
import {
  MICROPHONE_GATE_CLOSE_HOLD_MS,
  MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS,
  MICROPHONE_NOISE_GATE_WORKLET_NAME
} from '@/helpers/audio-gate';
import {
  inputSensitivityModeUsesVad,
  MICROPHONE_VAD_WASM_URL,
  MICROPHONE_VAD_WORKLET_URL
} from '@/helpers/voice-vad';
import { InputSensitivityMode } from '@/types';

type TNoiseGateWorkletConfig = {
  mode?: InputSensitivityMode;
  enabled?: boolean;
  thresholdDb?: number;
  holdMs?: number;
  reportStatus?: boolean;
  statusUpdateIntervalMs?: number;
};

type TNoiseGateWorkletAvailability = {
  available: boolean;
  reason?: string;
};

const workletLoadPromises = new WeakMap<BaseAudioContext, Promise<void>>();
const vadWorkletLoadPromises = new WeakMap<BaseAudioContext, Promise<void>>();
const noiseGateNodeAudioContexts = new WeakMap<
  AudioWorkletNode,
  AudioContext
>();
const availabilitySubscribers = new Set<() => void>();
let vadWasmBytesPromise: Promise<Uint8Array> | null = null;
let vadUnavailableWarningLogged = false;
let runtimeUnavailableReason: string | undefined;
let availabilitySnapshotCache: TNoiseGateWorkletAvailability | null = null;

const notifyAvailabilitySubscribers = () => {
  availabilitySubscribers.forEach((listener) => listener());
};

const isNoiseGateWorkletSupported = () => {
  if (typeof window === 'undefined') return false;

  return (
    typeof window.AudioWorkletNode !== 'undefined' &&
    typeof window.AudioContext !== 'undefined' &&
    'audioWorklet' in window.AudioContext.prototype
  );
};

const subscribeNoiseGateWorkletAvailability = (listener: () => void) => {
  availabilitySubscribers.add(listener);

  return () => {
    availabilitySubscribers.delete(listener);
  };
};

const getNoiseGateWorkletAvailabilitySnapshot =
  (): TNoiseGateWorkletAvailability => {
    const nextSnapshot: TNoiseGateWorkletAvailability =
      !isNoiseGateWorkletSupported()
        ? {
            available: false,
            reason: 'This browser does not support AudioWorklet.'
          }
        : runtimeUnavailableReason
          ? {
              available: false,
              reason: runtimeUnavailableReason
            }
          : { available: true };

    if (
      availabilitySnapshotCache &&
      availabilitySnapshotCache.available === nextSnapshot.available &&
      availabilitySnapshotCache.reason === nextSnapshot.reason
    ) {
      return availabilitySnapshotCache;
    }

    availabilitySnapshotCache = nextSnapshot;

    return availabilitySnapshotCache;
  };

const markNoiseGateWorkletUnavailable = (reason: string) => {
  if (runtimeUnavailableReason) return;

  runtimeUnavailableReason = reason;
  notifyAvailabilitySubscribers();
};

const getVadWasmBytes = async () => {
  if (!vadWasmBytesPromise) {
    vadWasmBytesPromise = fetch(MICROPHONE_VAD_WASM_URL).then(
      async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load VAD WASM: ${response.status}`);
        }

        return new Uint8Array(await response.arrayBuffer());
      }
    );
  }

  return vadWasmBytesPromise;
};

const ensureVadWorkletLoaded = async (audioContext: AudioContext) => {
  let loadPromise = vadWorkletLoadPromises.get(audioContext);

  if (!loadPromise) {
    loadPromise = audioContext.audioWorklet.addModule(
      MICROPHONE_VAD_WORKLET_URL
    );
    vadWorkletLoadPromises.set(audioContext, loadPromise);
  }

  await loadPromise;
};

const warnVadUnavailable = (error: unknown) => {
  if (vadUnavailableWarningLogged) return;

  vadUnavailableWarningLogged = true;
  console.warn(
    'WebRTC VAD unavailable; Automatic will use level gate fallback.',
    error
  );
};

const postVadWasmIfNeeded = (
  node: AudioWorkletNode,
  mode: InputSensitivityMode | undefined
) => {
  if (!mode || !inputSensitivityModeUsesVad(mode)) return;

  const audioContext = noiseGateNodeAudioContexts.get(node);

  if (!audioContext) {
    warnVadUnavailable(
      new Error('Noise gate AudioWorklet node is missing its audio context.')
    );
    node.port.postMessage({
      type: 'vad-unavailable'
    });
    return;
  }

  void Promise.all([ensureVadWorkletLoaded(audioContext), getVadWasmBytes()])
    .then(([, bytes]) => {
      const wasmBytes = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );

      node.port.postMessage(
        {
          type: 'vad-wasm',
          wasmBytes
        },
        [wasmBytes]
      );
    })
    .catch((error: unknown) => {
      vadWasmBytesPromise = null;
      warnVadUnavailable(error);
      node.port.postMessage({
        type: 'vad-unavailable'
      });
    });
};

const postNoiseGateWorkletConfig = (
  node: AudioWorkletNode,
  config: TNoiseGateWorkletConfig
) => {
  node.port.postMessage({
    type: 'config',
    mode: config.mode,
    enabled: config.enabled,
    thresholdDb: config.thresholdDb,
    holdMs: config.holdMs,
    reportStatus: config.reportStatus,
    statusUpdateIntervalMs: config.statusUpdateIntervalMs
  });
  postVadWasmIfNeeded(node, config.mode);
};

const destroyNoiseGateWorkletNode = (node: AudioWorkletNode) => {
  try {
    node.port.postMessage({
      type: 'destroy'
    });
  } catch (error) {
    console.warn('Failed to destroy noise gate AudioWorklet cleanly:', error);
  }

  node.port.onmessage = null;
  node.disconnect();
  noiseGateNodeAudioContexts.delete(node);
};

const ensureNoiseGateWorkletLoaded = async (audioContext: AudioContext) => {
  if (!isNoiseGateWorkletSupported()) {
    throw new Error('AudioWorklet is not supported in this browser.');
  }

  let loadPromise = workletLoadPromises.get(audioContext);

  if (!loadPromise) {
    loadPromise = audioContext.audioWorklet.addModule(noiseGateProcessorUrl);
    workletLoadPromises.set(audioContext, loadPromise);
  }

  await loadPromise;
};

const createNoiseGateWorkletNode = async (
  audioContext: AudioContext,
  config: TNoiseGateWorkletConfig
) => {
  await ensureNoiseGateWorkletLoaded(audioContext);

  const node = new AudioWorkletNode(
    audioContext,
    MICROPHONE_NOISE_GATE_WORKLET_NAME
  );

  noiseGateNodeAudioContexts.set(node, audioContext);

  postNoiseGateWorkletConfig(node, {
    holdMs: MICROPHONE_GATE_CLOSE_HOLD_MS,
    statusUpdateIntervalMs: MICROPHONE_INPUT_METER_UPDATE_INTERVAL_MS,
    ...config
  });

  return node;
};

export {
  createNoiseGateWorkletNode,
  destroyNoiseGateWorkletNode,
  getNoiseGateWorkletAvailabilitySnapshot,
  isNoiseGateWorkletSupported,
  markNoiseGateWorkletUnavailable,
  postNoiseGateWorkletConfig,
  subscribeNoiseGateWorkletAvailability
};
