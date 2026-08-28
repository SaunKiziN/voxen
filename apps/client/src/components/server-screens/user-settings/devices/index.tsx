import { useDevices } from '@/components/devices-provider/hooks/use-devices';
import { getVoiceControlsBridge } from '@/components/voice-provider/controls-bridge';
import { closeServerScreens } from '@/features/server-screens/actions';
import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { usePublicServerSettings } from '@/features/server/hooks';
import { useOwnVoiceState } from '@/features/server/voice/hooks';
import {
  MICROPHONE_GATE_DEFAULT_THRESHOLD_DB,
  clampMicrophoneDecibels,
  inputSensitivityModeUsesGate,
  isInputSensitivityMode
} from '@/helpers/audio-gate';
import {
  getNoiseGateWorkletAvailabilitySnapshot,
  subscribeNoiseGateWorkletAvailability
} from '@/helpers/audio-worklet/noise-gate-worklet';
import {
  getRestrictOwnAudioSupport,
  getSuppressLocalAudioPlaybackSupport
} from '@/helpers/get-display-media-support';
import {
  getVoiceMicrophoneInputActiveStream,
  getVoiceMicrophoneInputSnapshot,
  subscribeVoiceMicrophoneInputActiveStream,
  subscribeVoiceMicrophoneInputSnapshot
} from '@/helpers/voice-microphone-input';
import { useForm } from '@/hooks/use-form';
import {
  InputSensitivityMode,
  NoiseSuppression,
  Resolution,
  VideoCodec,
  type TDeviceSettings
} from '@/types';
import { DEFAULT_BITRATE } from '@sharkord/shared';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Label,
  LoadingCard,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Switch
} from '@sharkord/ui';
import { filesize } from 'filesize';
import { Info } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMicrophoneInputMeter } from './hooks/use-microphone-input-meter';
import { useMicrophoneTest } from './hooks/use-microphone-test';
import { useWebcamTest } from './hooks/use-webcam-test';
import { MicrophoneTestLevelBar } from './microphone-test-level-bar';
import { ResolutionFpsControl } from './resolution-fps-control';
import { RestrictOwnAudioAlert } from './restrict-own-audio-alert';
import { SuppressLocalAudioPlaybackAlert } from './suppress-local-audio-playback-alert';
import { SupressionHelp } from './supression-help';

const DEFAULT_NAME = 'default';

const Devices = memo(() => {
  const { t } = useTranslation('settings');
  const currentVoiceChannelId = useCurrentVoiceChannelId();
  const settings = usePublicServerSettings();
  const ownVoiceState = useOwnVoiceState();
  const {
    devices,
    saveDevices,
    loading: devicesLoading,
    inputDevices,
    playbackDevices,
    videoDevices,
    loadDevices
  } = useDevices();
  const { values, onChange, setValues } = useForm(devices);
  const noiseGateWorkletAvailability = useSyncExternalStore(
    subscribeNoiseGateWorkletAvailability,
    getNoiseGateWorkletAvailabilitySnapshot,
    getNoiseGateWorkletAvailabilitySnapshot
  );
  const activeVoiceMicrophoneInputStream = useSyncExternalStore(
    subscribeVoiceMicrophoneInputActiveStream,
    getVoiceMicrophoneInputActiveStream,
    getVoiceMicrophoneInputActiveStream
  );
  const isNoiseGateAvailable = noiseGateWorkletAvailability.available;
  const isRestrictOwnAudioSupported = useMemo(
    () => getRestrictOwnAudioSupport(),
    []
  );
  const isSuppressLocalAudioPlaybackSupported = useMemo(
    () => getSuppressLocalAudioPlaybackSupport(),
    []
  );
  const hasMicrophones = inputDevices.length > 0;
  const inputSensitivityMode = isInputSensitivityMode(
    values.inputSensitivityMode
  )
    ? values.inputSensitivityMode
    : InputSensitivityMode.AUTOMATIC;
  const manualNoiseGateThresholdDb = clampMicrophoneDecibels(
    values.noiseGateThresholdDb ?? MICROPHONE_GATE_DEFAULT_THRESHOLD_DB
  );
  const preserveFormOnSensitivityDevicesSyncRef = useRef(false);

  const {
    testAudioRef,
    permissionState,
    isTesting,
    getMeterSnapshot: getMicrophoneTestMeterSnapshot,
    error: microphoneTestError,
    requestPermission,
    startTest,
    stopTest
  } = useMicrophoneTest({
    microphoneId: values.microphoneId,
    playbackId: values.playbackId,
    autoGainControl: !!values.autoGainControl,
    echoCancellation: !!values.echoCancellation,
    noiseSuppression: values.noiseSuppression,
    inputSensitivityMode,
    noiseGateThresholdDb: manualNoiseGateThresholdDb
  });
  const shouldUseActiveVoiceMeter =
    !!currentVoiceChannelId &&
    !!activeVoiceMicrophoneInputStream &&
    isNoiseGateAvailable &&
    !isTesting;
  const shouldUseVoiceStreamFallbackMeter =
    !!currentVoiceChannelId &&
    !!activeVoiceMicrophoneInputStream &&
    !isNoiseGateAvailable &&
    !isTesting;
  const shouldUseSettingsMeter =
    !currentVoiceChannelId &&
    permissionState === 'granted' &&
    !isTesting &&
    hasMicrophones;
  const { getMeterSnapshot: getSettingsMeterSnapshot, error: inputMeterError } =
    useMicrophoneInputMeter({
      enabled: shouldUseSettingsMeter || shouldUseVoiceStreamFallbackMeter,
      sourceStream: shouldUseVoiceStreamFallbackMeter
        ? activeVoiceMicrophoneInputStream
        : undefined,
      microphoneId: values.microphoneId,
      autoGainControl: !!values.autoGainControl,
      echoCancellation: !!values.echoCancellation,
      noiseSuppression: values.noiseSuppression,
      inputSensitivityMode,
      noiseGateThresholdDb: manualNoiseGateThresholdDb
    });
  const {
    testVideoRef,
    isStarting: isVideoStarting,
    isTesting: isVideoTesting,
    isPreviewReady: isVideoPreviewReady,
    error: webcamTestError,
    startTest: startVideoTest,
    stopTest: stopVideoTest
  } = useWebcamTest({
    webcamId: values.webcamId,
    webcamResolution: values.webcamResolution,
    webcamFramerate: values.webcamFramerate
  });

  const saveDeviceSettings = useCallback(() => {
    saveDevices({
      ...values,
      inputSensitivityMode,
      noiseGateEnabled: inputSensitivityModeUsesGate(inputSensitivityMode),
      noiseGateThresholdDb: manualNoiseGateThresholdDb
    });
    toast.success(t('deviceSettingsSaved'));
  }, [
    saveDevices,
    values,
    inputSensitivityMode,
    manualNoiseGateThresholdDb,
    t
  ]);

  const saveInputSensitivitySettings = useCallback(
    (
      nextInputSensitivityMode: InputSensitivityMode,
      nextNoiseGateThresholdDb: number
    ) => {
      const nextDevices: TDeviceSettings = {
        ...devices,
        inputSensitivityMode: nextInputSensitivityMode,
        noiseGateEnabled: inputSensitivityModeUsesGate(
          nextInputSensitivityMode
        ),
        noiseGateThresholdDb: clampMicrophoneDecibels(nextNoiseGateThresholdDb)
      };

      preserveFormOnSensitivityDevicesSyncRef.current = true;
      saveDevices(nextDevices);
    },
    [devices, saveDevices]
  );
  const didPrimeDevicesOnGrantedRef = useRef(false);
  const mutedByTestRef = useRef<{
    previousMicMuted: boolean;
    previousSoundMuted: boolean;
  } | null>(null);
  const restoreVoiceStateAfterTestRef = useRef<() => Promise<void>>(
    async () => {}
  );

  const restoreVoiceStateAfterTest = useCallback(async () => {
    if (!currentVoiceChannelId) {
      mutedByTestRef.current = null;
      return;
    }

    const mutedByTest = mutedByTestRef.current;
    if (!mutedByTest) return;

    mutedByTestRef.current = null;

    const voiceControlsBridge = getVoiceControlsBridge();
    if (!voiceControlsBridge) {
      toast.error(t('voiceControlsUnavailable'));
      return;
    }

    await voiceControlsBridge.setMicMuted(mutedByTest.previousMicMuted);
    await voiceControlsBridge.setSoundMuted(mutedByTest.previousSoundMuted);
  }, [currentVoiceChannelId, t]);

  useEffect(() => {
    restoreVoiceStateAfterTestRef.current = restoreVoiceStateAfterTest;
  }, [restoreVoiceStateAfterTest]);

  useEffect(() => subscribeVoiceMicrophoneInputSnapshot(() => {}), []);

  const startMicrophoneTest = useCallback(async () => {
    if (currentVoiceChannelId) {
      const voiceControlsBridge = getVoiceControlsBridge();
      if (!voiceControlsBridge) {
        toast.error(t('voiceControlsUnavailable'));
        return;
      }

      mutedByTestRef.current = {
        previousMicMuted: ownVoiceState.micMuted,
        previousSoundMuted: ownVoiceState.soundMuted
      };

      await voiceControlsBridge.setMicMuted(true);
      await voiceControlsBridge.setSoundMuted(true);
    } else {
      mutedByTestRef.current = null;
    }

    const didStart = await startTest();

    if (!didStart) {
      await restoreVoiceStateAfterTest();
      return;
    }
  }, [
    currentVoiceChannelId,
    ownVoiceState.micMuted,
    ownVoiceState.soundMuted,
    startTest,
    restoreVoiceStateAfterTest,
    t
  ]);

  const stopMicrophoneTest = useCallback(async () => {
    stopTest();
    await restoreVoiceStateAfterTest();
  }, [stopTest, restoreVoiceStateAfterTest]);

  const requestMicrophonePermission = useCallback(async () => {
    await requestPermission();
    await loadDevices();
  }, [requestPermission, loadDevices]);

  const handleInputSensitivityModeChange = useCallback(
    (value: string) => {
      const mode = isInputSensitivityMode(value)
        ? value
        : InputSensitivityMode.AUTOMATIC;
      const noiseGateEnabled = inputSensitivityModeUsesGate(mode);

      setValues((prev) => ({
        ...prev,
        inputSensitivityMode: mode,
        noiseGateEnabled
      }));
      saveInputSensitivitySettings(mode, manualNoiseGateThresholdDb);
    },
    [manualNoiseGateThresholdDb, saveInputSensitivitySettings, setValues]
  );

  const handleManualThresholdChange = useCallback(
    (value: number) => {
      const thresholdDb = clampMicrophoneDecibels(value);

      setValues((prev) => ({
        ...prev,
        noiseGateThresholdDb: thresholdDb
      }));
      saveInputSensitivitySettings(inputSensitivityMode, thresholdDb);
    },
    [inputSensitivityMode, saveInputSensitivitySettings, setValues]
  );

  const getInputMeterSnapshot = useCallback(() => {
    if (isTesting) return getMicrophoneTestMeterSnapshot();
    if (shouldUseActiveVoiceMeter) return getVoiceMicrophoneInputSnapshot();

    return getSettingsMeterSnapshot();
  }, [
    isTesting,
    getMicrophoneTestMeterSnapshot,
    shouldUseActiveVoiceMeter,
    getSettingsMeterSnapshot
  ]);

  const startWebcamTest = useCallback(async () => {
    const didStart = await startVideoTest();
    if (!didStart) return;

    await loadDevices();
  }, [startVideoTest, loadDevices]);

  useEffect(() => {
    if (permissionState !== 'granted') {
      didPrimeDevicesOnGrantedRef.current = false;
      return;
    }

    if (didPrimeDevicesOnGrantedRef.current) return;
    didPrimeDevicesOnGrantedRef.current = true;

    void (async () => {
      await requestPermission({ silent: true });
      await loadDevices();
    })();
  }, [permissionState, requestPermission, loadDevices]);

  useEffect(() => {
    return () => {
      void restoreVoiceStateAfterTestRef.current();
    };
  }, []);

  const hasDefaultPlaybackOption = playbackDevices.some(
    (device) => device?.deviceId === DEFAULT_NAME
  );
  const hasDefaultVideoOption = videoDevices.some(
    (device) => device?.deviceId === DEFAULT_NAME
  );

  const maxBitrate = useMemo(
    () => (settings?.webRtcMaxBitrate ? settings.webRtcMaxBitrate / 1000 : 0),
    [settings?.webRtcMaxBitrate]
  );

  useEffect(() => {
    if (preserveFormOnSensitivityDevicesSyncRef.current) {
      preserveFormOnSensitivityDevicesSyncRef.current = false;
      setValues((prev) => ({
        ...prev,
        inputSensitivityMode: devices.inputSensitivityMode,
        noiseGateEnabled: devices.noiseGateEnabled,
        noiseGateThresholdDb: devices.noiseGateThresholdDb
      }));
      return;
    }

    setValues(devices);
  }, [devices, setValues]);

  if (devicesLoading) {
    return <LoadingCard className="h-[600px]" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('devicesTitle')}</CardTitle>
        <CardDescription>{t('devicesDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {currentVoiceChannelId && (
          <Alert variant="default">
            <Info />
            <AlertDescription>{t('voiceChannelActiveInfo')}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-6">
          <Group label={t('playbackLabel')}>
            <Select
              onValueChange={(value) => onChange('playbackId', value)}
              value={values.playbackId}
              disabled={playbackDevices.length === 0}
            >
              <SelectTrigger className="w-92">
                <SelectValue placeholder={t('playbackPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {!hasDefaultPlaybackOption && (
                    <SelectItem value={DEFAULT_NAME}>
                      {t('defaultOutput')}
                    </SelectItem>
                  )}
                  {playbackDevices.map((device) => (
                    <SelectItem
                      key={device?.deviceId}
                      value={device?.deviceId || DEFAULT_NAME}
                    >
                      {device?.label.trim() || t('defaultOutput')}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Group>

          <Group label={t('microphoneLabel')}>
            <Select
              onValueChange={(value) => onChange('microphoneId', value)}
              value={values.microphoneId}
              disabled={inputDevices.length === 0}
            >
              <SelectTrigger className="w-92">
                <SelectValue placeholder={t('microphonePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {inputDevices.map((device) => (
                    <SelectItem
                      key={device?.deviceId}
                      value={device?.deviceId || DEFAULT_NAME}
                    >
                      {device?.label.trim() || t('defaultMicrophone')}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Group label={t('inputSensitivityLabel')} className="my-4">
              <div className="max-w-xl space-y-3">
                <Select
                  value={inputSensitivityMode}
                  onValueChange={handleInputSensitivityModeChange}
                >
                  <SelectTrigger className="w-92">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={InputSensitivityMode.AUTOMATIC}>
                        {t('inputSensitivityAutomatic')}
                      </SelectItem>
                      <SelectItem value={InputSensitivityMode.MANUAL}>
                        {t('inputSensitivityManual')}
                      </SelectItem>
                      <SelectItem value={InputSensitivityMode.OPEN}>
                        {t('inputSensitivityOpen')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {permissionState !== 'granted' && (
                  <Button
                    variant="outline"
                    onClick={requestMicrophonePermission}
                  >
                    {t('permitMicAccess')}
                  </Button>
                )}

                <MicrophoneTestLevelBar
                  isActive={
                    isTesting ||
                    shouldUseActiveVoiceMeter ||
                    shouldUseSettingsMeter ||
                    shouldUseVoiceStreamFallbackMeter
                  }
                  inputSensitivityMode={inputSensitivityMode}
                  controlsDisabled={!isNoiseGateAvailable}
                  manualThresholdDb={manualNoiseGateThresholdDb}
                  onManualThresholdChange={handleManualThresholdChange}
                  getMeterSnapshot={getInputMeterSnapshot}
                />

                {!isNoiseGateAvailable && (
                  <p className="text-xs text-muted-foreground">
                    {t('inputSensitivityUnavailable')}
                    {noiseGateWorkletAvailability.reason
                      ? ` ${noiseGateWorkletAvailability.reason}`
                      : ''}
                  </p>
                )}

                {inputMeterError && (
                  <Alert variant="destructive">
                    <Info />
                    <AlertDescription>{inputMeterError}</AlertDescription>
                  </Alert>
                )}
              </div>
            </Group>

            <Group
              label={t('noiseSuppressionLabel')}
              className="my-4"
              help={<SupressionHelp />}
            >
              <Select
                value={values.noiseSuppression}
                onValueChange={(value) =>
                  onChange('noiseSuppression', value as NoiseSuppression)
                }
              >
                <SelectTrigger className="w-92">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NoiseSuppression.NONE}>
                      {t('noiseSuppressionNone')}
                    </SelectItem>
                    <SelectItem value={NoiseSuppression.STANDARD}>
                      {t('standard')}
                    </SelectItem>
                    <SelectItem value={NoiseSuppression.RNNOISE}>
                      RNNoise ({t('experimental')})
                    </SelectItem>
                    <SelectItem value={NoiseSuppression.DTLN}>
                      DTLN ({t('experimental')})
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Group>

            <div className="flex items-center gap-4">
              <Group label={t('echoCancellationLabel')}>
                <Switch
                  checked={!!values.echoCancellation}
                  onCheckedChange={(checked) =>
                    onChange('echoCancellation', checked)
                  }
                />
              </Group>

              <Group label={t('autoGainControlLabel')}>
                <Switch
                  checked={!!values.autoGainControl}
                  onCheckedChange={(checked) =>
                    onChange('autoGainControl', checked)
                  }
                />
              </Group>
            </div>
          </Group>

          <Group label={t('microphoneTestLabel')}>
            <div className="flex items-center gap-2">
              {!isTesting ? (
                <Button
                  variant="secondary"
                  onClick={() => void startMicrophoneTest()}
                  disabled={permissionState === 'denied' || !hasMicrophones}
                >
                  {t('startTestBtn')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => void stopMicrophoneTest()}
                >
                  {t('stopTestBtn')}
                </Button>
              )}
            </div>

            {currentVoiceChannelId && isTesting && (
              <p className="text-sm text-muted-foreground">
                {t('mutedDuringTest')}
              </p>
            )}

            {microphoneTestError && (
              <Alert variant="destructive">
                <Info />
                <AlertDescription>{microphoneTestError}</AlertDescription>
              </Alert>
            )}

            <audio ref={testAudioRef} className="hidden" />
          </Group>
        </div>

        <Separator />

        <div className="space-y-6">
          <Group label={t('webcamLabel')}>
            <div className="space-y-4">
              <Select
                onValueChange={(value) => onChange('webcamId', value)}
                value={values.webcamId}
              >
                <SelectTrigger className="w-full max-w-96">
                  <SelectValue placeholder={t('webcamPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {!hasDefaultVideoOption && (
                      <SelectItem value={DEFAULT_NAME}>
                        {t('defaultWebcam')}
                      </SelectItem>
                    )}
                    {videoDevices.map((device) => (
                      <SelectItem
                        key={device?.deviceId}
                        value={device?.deviceId || DEFAULT_NAME}
                      >
                        {device?.label.trim() || t('defaultWebcam')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <div className="group relative aspect-video w-full max-w-[28rem] overflow-hidden rounded-md border border-border bg-muted/40">
                <video
                  ref={testVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`h-full w-full object-cover transition-opacity duration-150 ${
                    values.mirrorOwnVideo ? '-scale-x-100' : ''
                  } ${isVideoTesting ? 'opacity-100' : 'opacity-0'}`}
                />

                {!isVideoTesting && !isVideoStarting && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Button
                      variant="secondary"
                      onClick={() => void startWebcamTest()}
                    >
                      {t('startVideoPreviewBtn')}
                    </Button>
                  </div>
                )}

                {(isVideoStarting ||
                  (isVideoTesting && !isVideoPreviewReady)) && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    {t('startingCamera')}
                  </div>
                )}

                {isVideoTesting && (
                  <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-3 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button
                      variant="secondary"
                      className="pointer-events-auto"
                      onClick={stopVideoTest}
                    >
                      {t('stopVideoPreviewBtn')}
                    </Button>
                  </div>
                )}
              </div>

              {webcamTestError && (
                <Alert variant="destructive">
                  <Info />
                  <AlertDescription>{webcamTestError}</AlertDescription>
                </Alert>
              )}

              <ResolutionFpsControl
                framerate={values.webcamFramerate}
                resolution={values.webcamResolution}
                onFramerateChange={(value) =>
                  onChange('webcamFramerate', value)
                }
                onResolutionChange={(value) =>
                  onChange('webcamResolution', value as Resolution)
                }
              />

              <Group label={t('mirrorOwnVideoLabel')}>
                <Switch
                  checked={!!values.mirrorOwnVideo}
                  onCheckedChange={(checked) =>
                    onChange('mirrorOwnVideo', checked)
                  }
                />
              </Group>
            </div>
          </Group>
        </div>

        <Separator />

        <div className="space-y-6">
          <Group
            label={t('simulcastUserLabel')}
            description={
              settings?.webRtcSimulcastEnabled
                ? t('simulcastUserDesc')
                : t('simulcastDisabledByServerDesc')
            }
          >
            <Switch
              checked={!!values.simulcastEnabled}
              disabled={!settings?.webRtcSimulcastEnabled}
              onCheckedChange={(checked) =>
                onChange('simulcastEnabled', checked)
              }
            />
          </Group>
          <Group label={t('screenSharingLabel')}>
            <div className="flex">
              <ResolutionFpsControl
                framerate={values.screenFramerate}
                resolution={values.screenResolution}
                onFramerateChange={(value) =>
                  onChange('screenFramerate', value)
                }
                onResolutionChange={(value) =>
                  onChange('screenResolution', value as Resolution)
                }
              />

              <div className="ml-2">
                <Select
                  value={values.screenCodec ?? VideoCodec.AUTO}
                  onValueChange={(value) =>
                    onChange('screenCodec', value as VideoCodec)
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder={t('selectCodecPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={VideoCodec.AUTO}>
                        {t('codecAutoLabel')}
                      </SelectItem>
                      <SelectItem value={VideoCodec.VP8}>VP8</SelectItem>
                      <SelectItem value={VideoCodec.VP9}>VP9</SelectItem>
                      <SelectItem value={VideoCodec.H264}>H264</SelectItem>
                      <SelectItem value={VideoCodec.AV1}>AV1</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t('maxBitrateLabel')}</Label>

              <Slider
                className="max-w-96"
                min={200}
                max={maxBitrate}
                step={100}
                value={[values.screenBitrate ?? DEFAULT_BITRATE]}
                onValueChange={([value]) => onChange('screenBitrate', value)}
                rightSlot={
                  <span className="text-sm text-muted-foreground w-20 text-right">
                    {filesize((values.screenBitrate ?? DEFAULT_BITRATE) * 125, {
                      bits: true
                    })}
                    /s
                  </span>
                }
              />
            </div>

            <Group
              label={t('shareSystemAudioLabel')}
              description={t('shareSystemAudioDesc')}
            >
              <Switch
                checked={!!values.shareSystemAudio}
                onCheckedChange={(checked) =>
                  onChange('shareSystemAudio', checked)
                }
              />
            </Group>

            <Group
              label={t('restrictOwnAudioLabel')}
              description={t('restrictOwnAudioDesc')}
            >
              {isRestrictOwnAudioSupported ? (
                <Switch
                  checked={!!values.restrictOwnAudio}
                  disabled={!isRestrictOwnAudioSupported}
                  onCheckedChange={(checked) =>
                    onChange('restrictOwnAudio', checked)
                  }
                />
              ) : (
                <RestrictOwnAudioAlert
                  isSupported={isRestrictOwnAudioSupported}
                />
              )}
            </Group>

            <Group
              label={t('suppressLocalAudioPlaybackLabel')}
              description={t('suppressLocalAudioPlaybackDesc')}
            >
              {isSuppressLocalAudioPlaybackSupported ? (
                <Switch
                  checked={!!values.suppressLocalAudioPlayback}
                  disabled={!isSuppressLocalAudioPlaybackSupported}
                  onCheckedChange={(checked) =>
                    onChange('suppressLocalAudioPlayback', checked)
                  }
                />
              ) : (
                <SuppressLocalAudioPlaybackAlert
                  isSupported={isSuppressLocalAudioPlaybackSupported}
                />
              )}
            </Group>

            <span className="text-sm text-muted-foreground">
              {t('screenSharingNote')}
            </span>
          </Group>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={closeServerScreens}>
            {t('cancel')}
          </Button>
          <Button onClick={saveDeviceSettings}>{t('saveChanges')}</Button>
        </div>
      </CardContent>
    </Card>
  );
});

export { Devices };
