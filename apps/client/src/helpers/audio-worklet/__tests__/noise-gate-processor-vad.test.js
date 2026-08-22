import { afterEach, describe, expect, mock, test } from 'bun:test';

const originalAudioWorkletProcessorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'AudioWorkletProcessor'
);
const originalRegisterProcessorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'registerProcessor'
);
const originalSampleRateDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'sampleRate'
);
const originalVadFactoryDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  '__sharkordCreateFvadModule'
);

const restoreGlobalProperty = (name, descriptor) => {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, name);
};

const waitForMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const getFrameForDecibels = (decibels, frameLength = 960) => {
  const frame = new Float32Array(frameLength);
  const amplitude = Math.max(0, 10 ** (decibels / 20) - 1e-8);

  frame.fill(amplitude);

  return frame;
};

const getConstantFrame = (sample, frameLength = 960) => {
  const frame = new Float32Array(frameLength);

  frame.fill(sample);

  return frame;
};

const expectFrameSamples = (frame, sample, frameLength = 960) => {
  expect(frame.length).toBe(frameLength);
  expect(frame[0]).toBeCloseTo(sample, 6);
  expect(frame[Math.floor((frameLength - 1) / 2)]).toBeCloseTo(sample, 6);
  expect(frame[frameLength - 1]).toBeCloseTo(sample, 6);
};

const expectSilentFrame = (frame, frameLength = 960) => {
  expectFrameSamples(frame, 0, frameLength);
};

const processDecibels = (processor, decibels, frameLength = 960) => {
  const inputFrame = getFrameForDecibels(decibels, frameLength);
  const outputFrame = new Float32Array(inputFrame.length);

  processor.process([[inputFrame]], [[outputFrame]]);

  return outputFrame;
};

const processConstant = (processor, sample, frameLength = 960) => {
  const inputFrame = getConstantFrame(sample, frameLength);
  const outputFrame = new Float32Array(inputFrame.length);

  processor.process([[inputFrame]], [[outputFrame]]);

  return outputFrame;
};

const setHybridAutomaticBaseline = (
  processor,
  { noiseFloorDb = -60, ambientUpperDb = -55, thresholdDb = -48 } = {}
) => {
  processor.automaticState.initialized = true;
  processor.automaticState.noiseFloorDb = noiseFloorDb;
  processor.automaticState.ambientMedianDb = ambientUpperDb;
  processor.automaticState.ambientUpperDb = ambientUpperDb;
  processor.automaticState.thresholdDb = thresholdDb;
  processor.automaticState.observationIndex = 0;
  processor.automaticState.observationCount = 0;
  processor.automaticState.observationSampleElapsedMs = 0;
  processor.automaticState.digitalSilenceElapsedMs = 0;
  processor.automaticState.elevatedNoiseElapsedMs = 0;
};

const resetProcessorGate = (processor) => {
  processor.gateOpen = false;
  processor.closeHoldRemainingFrames = 0;
  processor.openConfirmationFrames = 0;
  processor.releaseRemainingFrames = 0;
  processor.releaseStartGain = 0;
  processor.currentGain = 0;
};

const installAudioWorkletGlobals = () => {
  const postedMessages = [];
  let ProcessorConstructor = null;

  class MockAudioWorkletProcessor {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: mock((message) => {
          postedMessages.push(message);
        })
      };
    }
  }

  Object.defineProperty(globalThis, 'AudioWorkletProcessor', {
    configurable: true,
    value: MockAudioWorkletProcessor
  });
  Object.defineProperty(globalThis, 'sampleRate', {
    configurable: true,
    value: 48000
  });
  Object.defineProperty(globalThis, 'registerProcessor', {
    configurable: true,
    value: mock((_name, constructor) => {
      ProcessorConstructor = constructor;
    })
  });

  return {
    getProcessorConstructor: () => ProcessorConstructor,
    postedMessages
  };
};

describe('noise gate processor VAD observer', () => {
  afterEach(() => {
    restoreGlobalProperty(
      'AudioWorkletProcessor',
      originalAudioWorkletProcessorDescriptor
    );
    restoreGlobalProperty(
      'registerProcessor',
      originalRegisterProcessorDescriptor
    );
    restoreGlobalProperty('sampleRate', originalSampleRateDescriptor);
    restoreGlobalProperty(
      '__sharkordCreateFvadModule',
      originalVadFactoryDescriptor
    );
  });

  test('processes one shared PCM analysis frame through VAD modes 2 and 3', async () => {
    const { getProcessorConstructor, postedMessages } =
      installAudioWorkletGlobals();
    const processCalls = [];
    const freedHandles = [];
    const vadResultsByFrame = [];
    const vadModesByHandle = new Map();
    const heap16 = new Int16Array(4096);
    let nextHandle = 101;

    const vadModule = {
      HEAP16: heap16,
      _fvad_new: mock(() => nextHandle++),
      _fvad_set_mode: mock((handle, mode) => {
        vadModesByHandle.set(handle, mode);

        return 0;
      }),
      _fvad_set_sample_rate: mock(() => 0),
      _malloc: mock(() => 64),
      _free: mock(() => {}),
      _fvad_free: mock((handle) => {
        freedHandles.push(handle);
      }),
      _fvad_process: mock((handle, inputPtr, frameSize) => {
        const frameIndex = Math.floor(processCalls.length / 2);
        const vadResult = vadResultsByFrame[frameIndex] ?? {};
        const mode = vadModesByHandle.get(handle);

        processCalls.push({
          handle,
          inputPtr,
          frameSize,
          firstSample: heap16[inputPtr >> 1]
        });

        return vadResult[mode] === true ? 1 : 0;
      })
    };

    Object.defineProperty(globalThis, '__sharkordCreateFvadModule', {
      configurable: true,
      value: mock(async () => vadModule)
    });

    await import('../../../audio-worklets/noise-gate-processor.js');

    const ProcessorConstructor = getProcessorConstructor();
    expect(typeof ProcessorConstructor).toBe('function');

    const processor = new ProcessorConstructor();

    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'automatic',
        reportStatus: true,
        statusUpdateIntervalMs: 1
      }
    });
    processor.port.onmessage({
      data: {
        type: 'vad-wasm',
        wasmBytes: new ArrayBuffer(1)
      }
    });

    await waitForMicrotasks();

    expect(vadModule._fvad_new).toHaveBeenCalledTimes(2);
    expect(vadModule._fvad_set_mode.mock.calls).toEqual([
      [101, 2],
      [102, 3]
    ]);
    expect(vadModule._fvad_set_sample_rate.mock.calls).toEqual([
      [101, 16000],
      [102, 16000]
    ]);
    expect(vadModule._malloc.mock.calls).toEqual([[640]]);

    const inputFrame = new Float32Array(960);
    const outputFrame = new Float32Array(960);

    inputFrame.fill(0.25);

    vadResultsByFrame.push({ 2: false, 3: true });
    processor.process([[inputFrame]], [[outputFrame]]);

    expectSilentFrame(outputFrame);
    expect(processCalls.map(({ handle }) => handle)).toEqual([101, 102]);
    expect(new Set(processCalls.map(({ inputPtr }) => inputPtr)).size).toBe(1);
    expect(processCalls.map(({ frameSize }) => frameSize)).toEqual([320, 320]);
    expect(processCalls.map(({ firstSample }) => firstSample)).toEqual([
      8192, 8192
    ]);
    expect(postedMessages.at(-1)).toMatchObject({
      type: 'status',
      currentLevelDb: expect.any(Number),
      peakLevelDb: expect.any(Number),
      vad2SpeechActive: false,
      vad3SpeechActive: true,
      speechEvidence: false,
      strongSpeechEvidence: true,
      recentVad3Speech: true,
      timeSinceLastVad3SpeechMs: 0,
      vad2OnlyDurationMs: 0,
      candidateAuthenticatedSpeech: true,
      candidateStrictOpen: true,
      vad3Hits120Ms: 1,
      vad3Hits200Ms: 1,
      vad3ConsecutiveFrames: 1,
      candidateBurstAAuthenticated: false,
      candidateBurstBAuthenticated: false,
      candidateBurstAOpen: false,
      candidateBurstBOpen: false,
      utteranceActive: true,
      utteranceElapsedMs: 0,
      eligibleToOpen: false,
      maxVad3Hits120SinceReport: 1,
      maxVad3Hits200SinceReport: 1,
      burstATriggeredSinceReport: false,
      burstBTriggeredSinceReport: false,
      backgroundFrozen: true,
      digitalSilence: false,
      gateOpen: false
    });
    expect(processor.gateOpen).toBe(false);

    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'manual'
      }
    });
    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'automatic',
        reportStatus: true,
        statusUpdateIntervalMs: 1
      }
    });

    setHybridAutomaticBaseline(processor);
    resetProcessorGate(processor);
    vadResultsByFrame.push({ 2: true, 3: false });

    const vad2OnlyOutput = processDecibels(processor, -40);

    expectSilentFrame(vad2OnlyOutput);
    expect(postedMessages.at(-1)).toMatchObject({
      type: 'status',
      vad2SpeechActive: true,
      vad3SpeechActive: false,
      eligibleToOpen: false,
      candidateBurstAAuthenticated: false,
      gateOpen: false
    });
    expect(processor.gateOpen).toBe(false);

    vadResultsByFrame.push({ 2: true, 3: true });

    const isolatedVad3Output = processDecibels(processor, -40);

    expectSilentFrame(isolatedVad3Output);
    expect(postedMessages.at(-1)).toMatchObject({
      type: 'status',
      vad2SpeechActive: true,
      vad3SpeechActive: true,
      eligibleToOpen: false,
      vad3Hits120Ms: 1,
      candidateBurstAAuthenticated: false,
      gateOpen: false
    });
    expect(processor.gateOpen).toBe(false);

    vadResultsByFrame.push({ 2: true, 3: true });
    processDecibels(processor, -40);

    const openedStatus = postedMessages.at(-1);

    expect(openedStatus).toMatchObject({
      type: 'status',
      vad2SpeechActive: true,
      vad3SpeechActive: true,
      eligibleToOpen: true,
      candidateAuthenticatedSpeech: true,
      candidateStrictOpen: true,
      vad3Hits120Ms: 2,
      vad3Hits200Ms: 2,
      candidateBurstAAuthenticated: true,
      candidateBurstAOpen: true,
      candidateBurstBAuthenticated: false,
      candidateBurstBOpen: false,
      candidateBurstAOnsetMs: 40,
      utteranceActive: true,
      utteranceElapsedMs: 40,
      burstATriggeredSinceReport: true,
      gateOpen: true
    });
    expect(processor.gateOpen).toBe(true);

    vadResultsByFrame.push({ 2: false, 3: false });
    processDecibels(processor, -40);

    expect(postedMessages.at(-1)).toMatchObject({
      type: 'status',
      vad2SpeechActive: false,
      vad3SpeechActive: false,
      eligibleToOpen: true,
      candidateAuthenticatedSpeech: true,
      candidateStrictOpen: true,
      candidateBurstAAuthenticated: true,
      candidateBurstAOpen: true,
      candidateBurstAOnsetMs: 40,
      utteranceActive: true,
      gateOpen: true
    });
    expect(processor.gateOpen).toBe(true);

    const holdAfterDropout = processor.closeHoldRemainingFrames;

    vadResultsByFrame.push({ 2: true, 3: false });
    processDecibels(processor, -40);

    expect(postedMessages.at(-1)).toMatchObject({
      type: 'status',
      vad2SpeechActive: true,
      vad3SpeechActive: false,
      gateOpen: true
    });
    expect(processor.closeHoldRemainingFrames).toBeGreaterThan(
      holdAfterDropout
    );

    setHybridAutomaticBaseline(processor);
    resetProcessorGate(processor);
    vadResultsByFrame.push({ 2: true, 3: true });
    processDecibels(processor, -40);

    expect(processor.gateOpen).toBe(true);

    vadResultsByFrame.push(
      ...Array.from({ length: 25 }, () => ({ 2: false, 3: false }))
    );

    for (let index = 0; index < 25; index++) {
      processDecibels(processor, -53);
    }

    const finalAmbientStatus = postedMessages.at(-1);

    expect(finalAmbientStatus).toMatchObject({
      type: 'status',
      vad2SpeechActive: false,
      vad3SpeechActive: false,
      eligibleToOpen: false,
      candidateAuthenticatedSpeech: false,
      candidateStrictOpen: false,
      candidateBurstAAuthenticated: false,
      candidateBurstBAuthenticated: false,
      candidateBurstAOpen: false,
      candidateBurstBOpen: false,
      utteranceActive: false,
      utteranceElapsedMs: null,
      candidateBurstAOnsetMs: null,
      candidateBurstBOnsetMs: null,
      gateOpen: false
    });
    expect(finalAmbientStatus.currentLevelDb).toBeCloseTo(-53, 1);
    expect(processor.gateOpen).toBe(false);

    setHybridAutomaticBaseline(processor);
    resetProcessorGate(processor);
    vadResultsByFrame.push({ 2: true, 3: false });
    processDecibels(processor, -40);

    expect(postedMessages.at(-1)).toMatchObject({
      type: 'status',
      vad2SpeechActive: true,
      vad3SpeechActive: false,
      eligibleToOpen: false,
      candidateBurstAAuthenticated: false,
      gateOpen: false
    });
    expect(processor.gateOpen).toBe(false);

    vadResultsByFrame.push({ 2: true, 3: true });
    processDecibels(processor, -40);

    expect(postedMessages.at(-1)).toMatchObject({
      type: 'status',
      vad2SpeechActive: true,
      vad3SpeechActive: true,
      eligibleToOpen: false,
      candidateBurstAAuthenticated: false,
      gateOpen: false
    });
    expect(processor.gateOpen).toBe(false);

    vadResultsByFrame.push({ 2: true, 3: true });
    processDecibels(processor, -40);

    expect(postedMessages.at(-1)).toMatchObject({
      type: 'status',
      vad2SpeechActive: true,
      vad3SpeechActive: true,
      eligibleToOpen: true,
      candidateBurstAAuthenticated: true,
      candidateBurstBAuthenticated: false,
      gateOpen: true
    });
    expect(processor.gateOpen).toBe(true);

    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'manual'
      }
    });
    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'automatic',
        reportStatus: true,
        statusUpdateIntervalMs: 80
      }
    });
    setHybridAutomaticBaseline(processor);
    resetProcessorGate(processor);
    processor.framesSinceStatusReport = 0;
    processor.peakDbSinceStatusReport = -Infinity;
    vadResultsByFrame.push(
      { 2: true, 3: true },
      { 2: true, 3: true },
      { 2: false, 3: false },
      { 2: false, 3: false }
    );

    const statusCountBeforeBurst = postedMessages.length;

    for (let index = 0; index < 4; index++) {
      processDecibels(processor, -40);
    }

    const burstStatus = postedMessages.at(-1);

    expect(postedMessages).toHaveLength(statusCountBeforeBurst + 1);
    expect(burstStatus).toMatchObject({
      type: 'status',
      vad2SpeechActive: false,
      vad3SpeechActive: false,
      vad3Hits120Ms: 2,
      maxVad3Hits120SinceReport: 2,
      candidateBurstAAuthenticated: true,
      candidateBurstAOpen: true,
      candidateBurstAOnsetMs: 20,
      utteranceActive: true,
      burstATriggeredSinceReport: true
    });
    expect(processor.hybridObserverState.maxVad3Hits120SinceReport).toBe(0);
    expect(processor.hybridObserverState.burstATriggeredSinceReport).toBe(
      false
    );

    setHybridAutomaticBaseline(processor, {
      noiseFloorDb: -71,
      ambientUpperDb: -62.9,
      thresholdDb: -58.9
    });
    resetProcessorGate(processor);
    processor.framesSinceStatusReport = 0;
    processor.peakDbSinceStatusReport = -Infinity;
    processor.statusUpdateIntervalMs = 40;
    vadResultsByFrame.push({ 2: false, 3: false }, { 2: false, 3: false });

    const statusCountBeforeTelemetry = postedMessages.length;

    processDecibels(processor, -43.8);

    expect(postedMessages).toHaveLength(statusCountBeforeTelemetry);

    processDecibels(processor, -59.6);

    const telemetryStatus = postedMessages.at(-1);

    expect(telemetryStatus.currentLevelDb).toBeCloseTo(-59.6, 1);
    expect(telemetryStatus.peakLevelDb).toBeCloseTo(-43.8, 1);
    expect(telemetryStatus.decibels).toBeCloseTo(-43.8, 1);
    expect(telemetryStatus.snrDb).toBeCloseTo(11.4, 1);
    expect(telemetryStatus.noiseFloorDb).toBe(-71);

    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'manual'
      }
    });
    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'automatic',
        reportStatus: true,
        statusUpdateIntervalMs: 1
      }
    });
    setHybridAutomaticBaseline(processor);
    resetProcessorGate(processor);

    vadResultsByFrame.push({ 2: true, 3: false });
    const privateVad2OnlyOutput = processConstant(processor, 0.01);

    expectSilentFrame(privateVad2OnlyOutput);
    expect(processor.gateOpen).toBe(false);

    vadResultsByFrame.push({ 2: true, 3: true });
    const privateFirstVad3Output = processConstant(processor, 0.02);

    expectSilentFrame(privateFirstVad3Output);
    expect(processor.gateOpen).toBe(false);

    vadResultsByFrame.push({ 2: true, 3: true });
    const authenticatedOutput = processConstant(processor, 0.03);

    expect(processor.gateOpen).toBe(true);
    expect(processor.automaticPrerollHistoryFrames).toBe(1920);
    expectFrameSamples(authenticatedOutput, 0.01);

    vadResultsByFrame.push({ 2: true, 3: false });
    const firstContinuationOutput = processConstant(processor, 0.04);

    expectFrameSamples(firstContinuationOutput, 0.02);

    vadResultsByFrame.push({ 2: true, 3: false });
    const secondContinuationOutput = processConstant(processor, 0.05);

    expectFrameSamples(secondContinuationOutput, 0.03);

    vadResultsByFrame.push(
      ...Array.from({ length: 25 }, () => ({ 2: false, 3: false }))
    );

    for (let index = 0; index < 25; index++) {
      processConstant(processor, 0.001);
    }

    expect(processor.gateOpen).toBe(false);
    expect(processor.releaseRemainingFrames).toBe(0);
    expect(processor.automaticPrerollFrameCount).toBeLessThanOrEqual(
      processor.automaticPrerollCapacityFrames
    );
    expect(processor.automaticPrerollDelayActive).toBe(false);

    vadResultsByFrame.push({ 2: true, 3: false });
    const staleVad2OnlyOutput = processConstant(processor, 0.06);

    expectSilentFrame(staleVad2OnlyOutput);
    expect(processor.gateOpen).toBe(false);

    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'manual'
      }
    });
    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'automatic',
        reportStatus: true,
        statusUpdateIntervalMs: 1
      }
    });
    setHybridAutomaticBaseline(processor);
    resetProcessorGate(processor);
    vadResultsByFrame.push(
      ...Array.from({ length: 8 }, () => ({ 2: false, 3: false }))
    );

    const renderQuantumFrames = 128;

    for (let index = 0; index < 4; index++) {
      expectSilentFrame(
        processConstant(processor, 0.11, renderQuantumFrames),
        renderQuantumFrames
      );
    }

    for (let index = 0; index < 11; index++) {
      expectSilentFrame(
        processConstant(processor, 0.12, renderQuantumFrames),
        renderQuantumFrames
      );
    }

    expect(processor.automaticPrerollHistoryFrames).toBe(1920);
    expect(processor.automaticPrerollFrameCount).toBe(1920);

    processor.hybridObserverState.candidateBurstAAuthenticated = true;

    for (let index = 0; index < 3; index++) {
      expectSilentFrame(
        processConstant(processor, 0.13, renderQuantumFrames),
        renderQuantumFrames
      );
      expect(processor.gateOpen).toBe(false);
    }

    const openAfterAttackOutput = processConstant(
      processor,
      0.13,
      renderQuantumFrames
    );

    expect(processor.gateOpen).toBe(true);
    expect(processor.automaticPrerollDelayActive).toBe(true);
    expect(processor.automaticPrerollFrameCount).toBe(2304);
    expectFrameSamples(openAfterAttackOutput, 0.11, renderQuantumFrames);

    for (let index = 0; index < 3; index++) {
      expectFrameSamples(
        processConstant(processor, 0.14, renderQuantumFrames),
        0.11,
        renderQuantumFrames
      );
    }

    for (let index = 0; index < 11; index++) {
      expectFrameSamples(
        processConstant(processor, 0.14, renderQuantumFrames),
        0.12,
        renderQuantumFrames
      );
    }

    expectFrameSamples(
      processConstant(processor, 0.14, renderQuantumFrames),
      0.13,
      renderQuantumFrames
    );

    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'manual'
      }
    });
    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'automatic',
        reportStatus: true,
        statusUpdateIntervalMs: 1
      }
    });
    setHybridAutomaticBaseline(processor);
    resetProcessorGate(processor);

    vadResultsByFrame.push({ 2: true, 3: true });
    expectSilentFrame(processConstant(processor, 0.07));
    processor.hybridObserverState.candidateBurstAAuthenticated = true;
    vadResultsByFrame.push({ 2: false, 3: false });

    const digitalSilenceOutput = processDecibels(processor, -100);

    expectSilentFrame(digitalSilenceOutput);
    expect(processor.gateOpen).toBe(false);
    expect(processor.automaticPrerollFrameCount).toBe(0);

    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'manual'
      }
    });

    const callsBeforeManual = processCalls.length;

    const manualOutput = processConstant(processor, 0.08);

    expect(processCalls).toHaveLength(callsBeforeManual);
    expectFrameSamples(manualOutput, 0.08);

    processor.port.onmessage({
      data: {
        type: 'config',
        mode: 'open'
      }
    });

    const openOutput = processConstant(processor, 0.09);

    expect(processCalls).toHaveLength(callsBeforeManual);
    expectFrameSamples(openOutput, 0.09);

    processor.port.onmessage({
      data: {
        type: 'destroy'
      }
    });

    expect(freedHandles).toEqual([101, 102]);
    expect(vadModule._free.mock.calls).toEqual([[64]]);

    const fallbackProcessor = new ProcessorConstructor();

    fallbackProcessor.port.onmessage({
      data: {
        type: 'config',
        mode: 'automatic'
      }
    });
    setHybridAutomaticBaseline(fallbackProcessor);
    resetProcessorGate(fallbackProcessor);

    const fallbackOutput = processConstant(fallbackProcessor, 0.1);

    expectFrameSamples(fallbackOutput, 0.1);
    expect(fallbackProcessor.gateOpen).toBe(true);
    expect(fallbackProcessor.automaticPrerollFrameCount).toBe(0);
  });
});
