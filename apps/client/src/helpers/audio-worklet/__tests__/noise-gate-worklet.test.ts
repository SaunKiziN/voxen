import { InputSensitivityMode } from '@/types';
import { afterEach, describe, expect, mock, test } from 'bun:test';

mock.module('@/audio-worklets/noise-gate-processor.js?url', () => ({
  default: '/noise-gate-processor.js'
}));

const {
  createNoiseGateWorkletNode,
  destroyNoiseGateWorkletNode,
  postNoiseGateWorkletConfig
} = await import('../noise-gate-worklet');

type TPostedMessage = {
  message: Record<string, unknown>;
  transfer?: Transferable[];
};

type TMockWorkletNode = AudioWorkletNode & {
  disconnectMock: ReturnType<typeof mock>;
  messages: TPostedMessage[];
};

const originalAudioWorkletNodeDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'AudioWorkletNode'
);
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'window'
);

const waitForWorkletMessages = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const restoreGlobalProperty = (
  name: 'AudioWorkletNode' | 'window',
  descriptor: PropertyDescriptor | undefined
) => {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, name);
};

const createMockNoiseGateNode = () => {
  const messages: TPostedMessage[] = [];
  const disconnect = mock(() => {});
  const node = {
    disconnect,
    port: {
      onmessage: mock(() => {}),
      postMessage: mock(
        (message: Record<string, unknown>, transfer?: Transferable[]) => {
          messages.push({
            message,
            transfer
          });
        }
      )
    }
  } as unknown as TMockWorkletNode;

  node.disconnectMock = disconnect;
  node.messages = messages;

  return node;
};

const installMockAudioWorkletEnvironment = () => {
  const addModule = mock(async (_url: string) => {});
  const createdNodes: TMockWorkletNode[] = [];

  class MockAudioContext {}

  Object.defineProperty(MockAudioContext.prototype, 'audioWorklet', {
    configurable: true,
    value: {
      addModule
    }
  });

  class MockAudioWorkletNode {
    public disconnectMock: ReturnType<typeof mock>;
    public messages: TPostedMessage[];
    public port: TMockWorkletNode['port'];

    public constructor() {
      const node = createMockNoiseGateNode();

      this.disconnectMock = node.disconnectMock;
      this.messages = node.messages;
      this.port = node.port;
      createdNodes.push(this as unknown as TMockWorkletNode);
    }

    public disconnect() {
      this.disconnectMock();
    }
  }

  const fakeWindow = {
    AudioContext: MockAudioContext,
    AudioWorkletNode: MockAudioWorkletNode
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow
  });
  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    configurable: true,
    value: MockAudioWorkletNode
  });

  return {
    addModule,
    audioContext: new MockAudioContext() as unknown as AudioContext,
    createdNodes
  };
};

describe('noise gate VAD bridge', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    restoreGlobalProperty(
      'AudioWorkletNode',
      originalAudioWorkletNodeDescriptor
    );
    restoreGlobalProperty('window', originalWindowDescriptor);
  });

  test('VAD fetch failure falls back through a worklet message', async () => {
    const { audioContext, createdNodes } = installMockAudioWorkletEnvironment();
    const fetchMock = mock(async () => {
      throw new Error('missing wasm');
    });
    const warnMock = mock(() => {});

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    console.warn = warnMock as unknown as typeof console.warn;

    const node = await createNoiseGateWorkletNode(audioContext, {
      mode: InputSensitivityMode.AUTOMATIC
    });

    await waitForWorkletMessages();

    expect(createdNodes).toContain(node as TMockWorkletNode);
    expect(
      (node as TMockWorkletNode).messages.map(({ message }) => message.type)
    ).toEqual(['config', 'vad-unavailable']);
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  test('Manual and Open mode do not load or post VAD assets', async () => {
    const { addModule, audioContext } = installMockAudioWorkletEnvironment();
    const fetchMock = mock(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    console.warn = mock(() => {}) as unknown as typeof console.warn;

    const node = (await createNoiseGateWorkletNode(audioContext, {
      mode: InputSensitivityMode.MANUAL
    })) as TMockWorkletNode;

    postNoiseGateWorkletConfig(node, {
      mode: InputSensitivityMode.OPEN
    });
    await waitForWorkletMessages();

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(addModule.mock.calls.map(([url]) => url)).toEqual([
      '/noise-gate-processor.js'
    ]);
    expect(node.messages.map(({ message }) => message.type)).toEqual([
      'config',
      'config'
    ]);
  });

  test('Automatic mode loads VAD assets and posts WASM to the worklet', async () => {
    const { addModule, audioContext } = installMockAudioWorkletEnvironment();
    const fetchMock = mock(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    console.warn = mock(() => {}) as unknown as typeof console.warn;

    const node = (await createNoiseGateWorkletNode(audioContext, {
      mode: InputSensitivityMode.AUTOMATIC
    })) as TMockWorkletNode;

    await waitForWorkletMessages();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(addModule.mock.calls.map(([url]) => url)).toEqual([
      '/noise-gate-processor.js',
      '/vad/fvad-worklet.js'
    ]);
    expect(node.messages.map(({ message }) => message.type)).toEqual([
      'config',
      'vad-wasm'
    ]);
    expect(node.messages.at(-1)?.message.wasmBytes).toBeInstanceOf(ArrayBuffer);
    expect(node.messages.at(-1)?.transfer).toHaveLength(1);
  });

  test('destroy posts cleanup and disconnects the worklet node', () => {
    const node = createMockNoiseGateNode();

    destroyNoiseGateWorkletNode(node);

    expect(node.messages.map(({ message }) => message.type)).toEqual([
      'destroy'
    ]);
    expect(node.port.onmessage).toBeNull();
    expect(node.disconnectMock).toHaveBeenCalledTimes(1);
  });
});
