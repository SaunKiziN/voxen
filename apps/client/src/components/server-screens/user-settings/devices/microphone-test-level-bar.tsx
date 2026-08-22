import {
  clampMicrophoneDecibels,
  MICROPHONE_GATE_DEFAULT_THRESHOLD_DB,
  MICROPHONE_LEVEL_METER_MAX_DB,
  MICROPHONE_LEVEL_METER_MIN_DB,
  microphoneDecibelsToPercent,
  type TMicrophoneInputMeterSnapshot
} from '@/helpers/audio-gate';
import {
  createVadDiagnosticMessage,
  MICROPHONE_VAD_DIAGNOSTIC_INTERVAL_MS,
  MICROPHONE_VAD_FRAME_MS,
  MICROPHONE_VAD_SAMPLE_RATE
} from '@/helpers/voice-vad';
import { InputSensitivityMode } from '@/types';
import { Slider } from '@sharkord/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TMicrophoneTestLevelBarProps = {
  isActive: boolean;
  inputSensitivityMode: InputSensitivityMode;
  controlsDisabled?: boolean;
  manualThresholdDb: number | undefined;
  onManualThresholdChange: (value: number) => void;
  getMeterSnapshot: () => TMicrophoneInputMeterSnapshot;
};

const PEAK_HOLD_MS = 2500;
const PEAK_DECAY_PER_MS = 0.22;

const MicrophoneTestLevelBar = memo(
  ({
    isActive,
    inputSensitivityMode,
    controlsDisabled = false,
    manualThresholdDb,
    onManualThresholdChange,
    getMeterSnapshot
  }: TMicrophoneTestLevelBarProps) => {
    const { t } = useTranslation('settings');
    const [meterSnapshot, setMeterSnapshot] = useState(() =>
      getMeterSnapshot()
    );
    const [audioLevel, setAudioLevel] = useState(() => meterSnapshot.level);
    const [peakLevel, setPeakLevel] = useState(0);
    const animationFrameRef = useRef<number | null>(null);
    const lastDisplayKeyRef = useRef('');
    const lastRoundedLevelRef = useRef(Math.round(meterSnapshot.level));
    const lastRoundedPeakLevelRef = useRef(0);
    const smoothedLevelRef = useRef(meterSnapshot.level);
    const peakLevelRef = useRef(0);
    const peakHoldUntilRef = useRef(0);
    const lastFrameTimeRef = useRef<number | null>(null);
    const lastVadDiagnosticAtRef = useRef(0);
    const clampedManualThresholdDb = clampMicrophoneDecibels(
      manualThresholdDb ?? MICROPHONE_GATE_DEFAULT_THRESHOLD_DB
    );

    const handleManualThresholdChange = useCallback(
      ([value]: number[]) => {
        if (typeof value !== 'number') return;

        onManualThresholdChange(value);
      },
      [onManualThresholdChange]
    );

    useEffect(() => {
      const syncFromSnapshot = () => {
        const snapshot = getMeterSnapshot();
        const rounded = Math.round(snapshot.level);

        smoothedLevelRef.current = snapshot.level;
        peakLevelRef.current = snapshot.level;
        lastRoundedPeakLevelRef.current = Math.round(snapshot.level);
        peakHoldUntilRef.current = 0;
        lastFrameTimeRef.current = null;
        lastRoundedLevelRef.current = rounded;
        lastDisplayKeyRef.current = '';
        setMeterSnapshot(snapshot);
        setAudioLevel(snapshot.level);
        setPeakLevel(snapshot.level);
      };

      if (!isActive) {
        syncFromSnapshot();
        return;
      }

      const update = (frameTime: number) => {
        const snapshot = getMeterSnapshot();
        const targetLevel = snapshot.level;
        const vad2SpeechActive = snapshot.vad2SpeechActive;
        const vad3SpeechActive = snapshot.vad3SpeechActive;
        const strongSpeechEvidence = snapshot.strongSpeechEvidence;
        const speechEvidence = snapshot.speechEvidence;
        const eligibleToOpen = snapshot.eligibleToOpen;
        const recentVad3Speech = snapshot.recentVad3Speech;
        const timeSinceLastVad3SpeechMs = snapshot.timeSinceLastVad3SpeechMs;
        const vad2OnlyDurationMs = snapshot.vad2OnlyDurationMs;
        const candidateAuthenticatedSpeech =
          snapshot.candidateAuthenticatedSpeech;
        const candidateStrictOpen = snapshot.candidateStrictOpen;
        const vad3Hits120Ms = snapshot.vad3Hits120Ms;
        const vad3Hits200Ms = snapshot.vad3Hits200Ms;
        const vad3ConsecutiveFrames = snapshot.vad3ConsecutiveFrames;
        const maxVad3Hits120SinceReport = snapshot.maxVad3Hits120SinceReport;
        const maxVad3Hits200SinceReport = snapshot.maxVad3Hits200SinceReport;
        const candidateBurstAAuthenticated =
          snapshot.candidateBurstAAuthenticated;
        const candidateBurstBAuthenticated =
          snapshot.candidateBurstBAuthenticated;
        const candidateBurstAOpen = snapshot.candidateBurstAOpen;
        const candidateBurstBOpen = snapshot.candidateBurstBOpen;
        const candidateBurstAOnsetMs = snapshot.candidateBurstAOnsetMs;
        const candidateBurstBOnsetMs = snapshot.candidateBurstBOnsetMs;
        const utteranceActive = snapshot.utteranceActive;
        const utteranceElapsedMs = snapshot.utteranceElapsedMs;
        const burstATriggeredSinceReport = snapshot.burstATriggeredSinceReport;
        const burstBTriggeredSinceReport = snapshot.burstBTriggeredSinceReport;
        const backgroundFrozen = snapshot.backgroundFrozen;
        const digitalSilence = snapshot.digitalSilence;
        const shouldLogVadDiagnostic =
          snapshot.inputSensitivityMode === InputSensitivityMode.AUTOMATIC &&
          typeof vad2SpeechActive === 'boolean' &&
          typeof vad3SpeechActive === 'boolean' &&
          typeof strongSpeechEvidence === 'boolean' &&
          typeof speechEvidence === 'boolean' &&
          typeof eligibleToOpen === 'boolean' &&
          typeof recentVad3Speech === 'boolean' &&
          (timeSinceLastVad3SpeechMs === null ||
            (typeof timeSinceLastVad3SpeechMs === 'number' &&
              Number.isFinite(timeSinceLastVad3SpeechMs))) &&
          typeof vad2OnlyDurationMs === 'number' &&
          Number.isFinite(vad2OnlyDurationMs) &&
          typeof candidateAuthenticatedSpeech === 'boolean' &&
          typeof candidateStrictOpen === 'boolean' &&
          typeof vad3Hits120Ms === 'number' &&
          Number.isFinite(vad3Hits120Ms) &&
          typeof vad3Hits200Ms === 'number' &&
          Number.isFinite(vad3Hits200Ms) &&
          typeof vad3ConsecutiveFrames === 'number' &&
          Number.isFinite(vad3ConsecutiveFrames) &&
          typeof maxVad3Hits120SinceReport === 'number' &&
          Number.isFinite(maxVad3Hits120SinceReport) &&
          typeof maxVad3Hits200SinceReport === 'number' &&
          Number.isFinite(maxVad3Hits200SinceReport) &&
          typeof candidateBurstAAuthenticated === 'boolean' &&
          typeof candidateBurstBAuthenticated === 'boolean' &&
          typeof candidateBurstAOpen === 'boolean' &&
          typeof candidateBurstBOpen === 'boolean' &&
          (candidateBurstAOnsetMs === null ||
            (typeof candidateBurstAOnsetMs === 'number' &&
              Number.isFinite(candidateBurstAOnsetMs))) &&
          (candidateBurstBOnsetMs === null ||
            (typeof candidateBurstBOnsetMs === 'number' &&
              Number.isFinite(candidateBurstBOnsetMs))) &&
          typeof utteranceActive === 'boolean' &&
          (utteranceElapsedMs === null ||
            (typeof utteranceElapsedMs === 'number' &&
              Number.isFinite(utteranceElapsedMs))) &&
          typeof burstATriggeredSinceReport === 'boolean' &&
          typeof burstBTriggeredSinceReport === 'boolean' &&
          typeof backgroundFrozen === 'boolean' &&
          typeof digitalSilence === 'boolean' &&
          frameTime - lastVadDiagnosticAtRef.current >=
            MICROPHONE_VAD_DIAGNOSTIC_INTERVAL_MS;

        if (shouldLogVadDiagnostic) {
          lastVadDiagnosticAtRef.current = frameTime;
          console.debug(
            createVadDiagnosticMessage({
              currentLevelDb: snapshot.currentLevelDb,
              peakLevelDb: snapshot.peakLevelDb,
              vad2SpeechActive,
              vad3SpeechActive,
              snrDb: snapshot.snrDb,
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
              gateOpen: snapshot.gateOpen,
              automaticThresholdDb: snapshot.thresholdDb,
              noiseFloorDb: snapshot.noiseFloorDb,
              ambientUpperDb: snapshot.ambientUpperDb,
              backgroundFrozen,
              digitalSilence,
              vadSampleRate:
                snapshot.vadSampleRate ?? MICROPHONE_VAD_SAMPLE_RATE,
              vadFrameMs: snapshot.vadFrameMs ?? MICROPHONE_VAD_FRAME_MS
            })
          );
        }

        const currentLevel = smoothedLevelRef.current;
        const smoothingFactor = targetLevel > currentLevel ? 0.5 : 0.22;
        const nextLevel =
          currentLevel + (targetLevel - currentLevel) * smoothingFactor;
        const snappedLevel =
          Math.abs(targetLevel - nextLevel) < 0.1 ? targetLevel : nextLevel;
        const rounded = Math.round(snappedLevel);

        if (rounded !== lastRoundedLevelRef.current) {
          lastRoundedLevelRef.current = rounded;
          setAudioLevel(snappedLevel);
        }

        smoothedLevelRef.current = snappedLevel;

        const previousFrameTime = lastFrameTimeRef.current ?? frameTime;
        const deltaMs = Math.max(0, frameTime - previousFrameTime);
        lastFrameTimeRef.current = frameTime;

        let nextPeakLevel = peakLevelRef.current;

        // Peak marker tracks the raw meter value; the filled bar is the smoothed display.
        if (targetLevel >= nextPeakLevel) {
          nextPeakLevel = targetLevel;
          peakHoldUntilRef.current = frameTime + PEAK_HOLD_MS;
        } else if (frameTime > peakHoldUntilRef.current) {
          nextPeakLevel = Math.max(
            snappedLevel,
            nextPeakLevel - deltaMs * PEAK_DECAY_PER_MS
          );
        }

        peakLevelRef.current = nextPeakLevel;

        const roundedPeak = Math.round(nextPeakLevel);
        const thresholdDisplayValue =
          snapshot.thresholdDb === null
            ? 'none'
            : Math.round(snapshot.thresholdDb);
        const displayKey = [
          rounded,
          roundedPeak,
          Math.round(snapshot.decibels),
          thresholdDisplayValue,
          snapshot.gateOpen,
          snapshot.inputSensitivityMode
        ].join(':');

        if (roundedPeak !== lastRoundedPeakLevelRef.current) {
          lastRoundedPeakLevelRef.current = roundedPeak;
          setPeakLevel(nextPeakLevel);
        }

        if (displayKey !== lastDisplayKeyRef.current) {
          lastDisplayKeyRef.current = displayKey;
          setMeterSnapshot(snapshot);
        }

        animationFrameRef.current = requestAnimationFrame(update);
      };

      animationFrameRef.current = requestAnimationFrame(update);

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }, [isActive, getMeterSnapshot]);

    const hasThreshold =
      inputSensitivityMode !== InputSensitivityMode.OPEN &&
      meterSnapshot.thresholdDb !== null;
    const thresholdDb = meterSnapshot.thresholdDb ?? clampedManualThresholdDb;
    const thresholdPercent = microphoneDecibelsToPercent(thresholdDb);
    const isGateOpen = !hasThreshold || meterSnapshot.gateOpen;

    const meterFillColorClass =
      hasThreshold && !isGateOpen
        ? 'bg-yellow-500'
        : audioLevel >= 66
          ? 'bg-green-600'
          : audioLevel >= 33
            ? 'bg-green-500'
            : 'bg-green-300';
    const showManualSlider =
      inputSensitivityMode === InputSensitivityMode.MANUAL;
    const gateStateText =
      inputSensitivityMode === InputSensitivityMode.OPEN
        ? t('inputSensitivityOpenGate')
        : isGateOpen
          ? t('inputAboveGate')
          : t('inputBelowGate');
    const thresholdText =
      inputSensitivityMode === InputSensitivityMode.AUTOMATIC
        ? t('inputSensitivityAutomaticThresholdValue', {
            value: Math.round(thresholdDb)
          })
        : t('inputSensitivityManualThresholdValue', {
            value: Math.round(thresholdDb)
          });

    return (
      <div className="space-y-2">
        <div className="relative h-3 w-full">
          <div className="absolute inset-0 overflow-hidden rounded-full">
            {hasThreshold ? (
              <div className="absolute inset-0 flex">
                <div
                  className="bg-yellow-200/70"
                  style={{ width: `${thresholdPercent}%` }}
                />
                <div className="flex-1 bg-muted" />
              </div>
            ) : (
              <div className="absolute inset-0 bg-muted" />
            )}

            <div
              className={`absolute inset-y-0 left-0 ${meterFillColorClass} transition-[background-color] duration-75`}
              style={{ width: `${audioLevel}%` }}
            />

            <div
              className="absolute inset-y-0 w-[2px] -translate-x-1/2 rounded-full bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
              style={{ left: `${peakLevel}%` }}
            />

            {hasThreshold && !showManualSlider && (
              <div
                className="absolute inset-y-0 w-[2px] -translate-x-1/2 rounded-full bg-yellow-500 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                style={{ left: `${thresholdPercent}%` }}
              />
            )}
          </div>

          {showManualSlider && (
            <Slider
              aria-label={t('inputSensitivityManualThresholdLabel')}
              className="absolute inset-0 z-10 [&_[data-slot=slider-track]]:h-full [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-thumb]]:size-[26px] [&_[data-slot=slider-thumb]]:border-yellow-500 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:shadow-sm"
              min={MICROPHONE_LEVEL_METER_MIN_DB}
              max={MICROPHONE_LEVEL_METER_MAX_DB}
              step={1}
              value={[clampedManualThresholdDb]}
              disabled={controlsDisabled}
              onValueChange={handleManualThresholdChange}
            />
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{MICROPHONE_LEVEL_METER_MIN_DB} dB</span>
          <span>
            {t('inputLevelValue', {
              value: Math.round(meterSnapshot.decibels)
            })}
          </span>
          <span>{MICROPHONE_LEVEL_METER_MAX_DB} dB</span>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {hasThreshold ? thresholdText : t('inputSensitivityNoGate')}
          </span>
          <span
            className={
              hasThreshold && !isGateOpen ? 'text-yellow-600' : 'text-green-600'
            }
          >
            {gateStateText}
          </span>
        </div>
      </div>
    );
  }
);
MicrophoneTestLevelBar.displayName = 'MicrophoneTestLevelBar';

export { MicrophoneTestLevelBar };
