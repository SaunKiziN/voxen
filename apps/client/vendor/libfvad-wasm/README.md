# libfvad WASM vendor notes

This directory vendors the minimal classic WebRTC/libfvad voice activity
detector source used by the VOXEN Automatic input-sensitivity POC.

## Provenance

- WASM wrapper/source package: `@echogarden/fvad-wasm` source repository
  `https://github.com/echogarden-project/fvad-wasm`
- Vendored commit: `83dbdab67a2424ded4423c376702fd775cae86d3`
- Package version used for generated assets: `@echogarden/fvad-wasm@0.2.0`
- Underlying library: `libfvad`, a standalone extraction of the classic WebRTC
  VAD
- Upstream libfvad commit inspected for license/IP notices:
  `532ab666c20d3cfda38bca63abbb0f152706c369`

The generated runtime assets checked into `apps/client/public/vad/` are:

- `fvad.js`
- `fvad-worklet.js`
- `fvad.wasm`

## License

The VAD source is BSD-3-Clause. Keep `LICENSE`, `AUTHORS`, and `PATENTS` with
this vendored source when redistributing or regenerating the WASM.

## Rebuild

The checked-in `Makefile` is intentionally tiny and uses Emscripten:

```bash
cd apps/client/vendor/libfvad-wasm
emcc -v
make clean
make
```

Copy the generated `fvad.js` and `fvad.wasm` to:

```text
apps/client/public/vad/fvad.js
apps/client/public/vad/fvad-worklet.js
apps/client/public/vad/fvad.wasm
```

This repository does not currently install Emscripten as a dependency. The
checked-in generated assets are kept so normal VOXEN development does not
require a C/WASM toolchain.
