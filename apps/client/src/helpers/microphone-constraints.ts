import { NoiseSuppression } from '@/types';

type TGetMicrophoneAudioConstraintsParams = {
  microphoneId: string | undefined;
  autoGainControl: boolean;
  echoCancellation: boolean;
  noiseSuppression: NoiseSuppression;
  fallbackSampleRate?: number;
};

const DEFAULT_DEVICE_NAME = 'default';

const getMicrophoneAudioConstraints = ({
  microphoneId,
  autoGainControl,
  echoCancellation,
  noiseSuppression,
  fallbackSampleRate
}: TGetMicrophoneAudioConstraintsParams): MediaTrackConstraints => {
  const hasSpecificDevice =
    !!microphoneId && microphoneId !== DEFAULT_DEVICE_NAME;
  const useDtln = noiseSuppression === NoiseSuppression.DTLN;
  const useStandardNs = noiseSuppression === NoiseSuppression.STANDARD;

  return {
    deviceId: hasSpecificDevice ? { exact: microphoneId } : undefined,
    autoGainControl,
    echoCancellation,
    noiseSuppression: useStandardNs,
    sampleRate: useDtln ? 16000 : fallbackSampleRate,
    channelCount: 1
  };
};

export { getMicrophoneAudioConstraints };
