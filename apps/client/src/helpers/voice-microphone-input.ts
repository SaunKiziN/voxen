import {
  getIdleMicrophoneInputMeterSnapshot,
  type TMicrophoneInputMeterSnapshot
} from './audio-gate';

let voiceMicrophoneInputSnapshot = getIdleMicrophoneInputMeterSnapshot();
let voiceMicrophoneInputActiveStream: MediaStream | undefined;

const snapshotSubscribers = new Set<() => void>();
const activeStreamSubscribers = new Set<() => void>();
const meterSubscriberListeners = new Set<() => void>();
let meterSubscriberCount = 0;

const notifySnapshotSubscribers = () => {
  snapshotSubscribers.forEach((listener) => listener());
};

const notifyActiveStreamSubscribers = () => {
  activeStreamSubscribers.forEach((listener) => listener());
};

const notifyMeterSubscriberListeners = () => {
  meterSubscriberListeners.forEach((listener) => listener());
};

const getVoiceMicrophoneInputSnapshot = () => voiceMicrophoneInputSnapshot;

const setVoiceMicrophoneInputSnapshot = (
  snapshot: TMicrophoneInputMeterSnapshot
) => {
  voiceMicrophoneInputSnapshot = snapshot;
  notifySnapshotSubscribers();
};

const resetVoiceMicrophoneInputSnapshot = () => {
  voiceMicrophoneInputSnapshot = getIdleMicrophoneInputMeterSnapshot();
  notifySnapshotSubscribers();
};

const getVoiceMicrophoneInputActiveStream = () =>
  voiceMicrophoneInputActiveStream;

const setVoiceMicrophoneInputActiveStream = (
  stream: MediaStream | undefined
) => {
  if (voiceMicrophoneInputActiveStream === stream) return;

  voiceMicrophoneInputActiveStream = stream;
  notifyActiveStreamSubscribers();
};

const subscribeVoiceMicrophoneInputSnapshot = (listener: () => void) => {
  const previousSize = snapshotSubscribers.size;

  snapshotSubscribers.add(listener);

  if (snapshotSubscribers.size > previousSize) {
    meterSubscriberCount += 1;
    notifyMeterSubscriberListeners();
  }

  return () => {
    const deleted = snapshotSubscribers.delete(listener);

    if (!deleted) return;

    meterSubscriberCount = Math.max(0, meterSubscriberCount - 1);
    notifyMeterSubscriberListeners();
  };
};

const subscribeVoiceMicrophoneInputActiveStream = (listener: () => void) => {
  activeStreamSubscribers.add(listener);

  return () => {
    activeStreamSubscribers.delete(listener);
  };
};

const hasVoiceMicrophoneInputMeterSubscribers = () => meterSubscriberCount > 0;

const subscribeVoiceMicrophoneInputMeterSubscribers = (
  listener: () => void
) => {
  meterSubscriberListeners.add(listener);

  return () => {
    meterSubscriberListeners.delete(listener);
  };
};

export {
  getVoiceMicrophoneInputActiveStream,
  getVoiceMicrophoneInputSnapshot,
  hasVoiceMicrophoneInputMeterSubscribers,
  resetVoiceMicrophoneInputSnapshot,
  setVoiceMicrophoneInputActiveStream,
  setVoiceMicrophoneInputSnapshot,
  subscribeVoiceMicrophoneInputActiveStream,
  subscribeVoiceMicrophoneInputMeterSubscribers,
  subscribeVoiceMicrophoneInputSnapshot
};
