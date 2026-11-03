'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ort = require('onnxruntime-node');

test('bundled ONNX CPU runtime decodes and executes an Identity model', async () => {
  // Serialized ONNX: IR 8, opset 13, Identity(x -> y), float32 tensors of shape [1].
  const model = Buffer.from(
    '08084202100d3a410a100a017812017922084964656e74697479' +
    '120b63695f6964656e74697479' +
    '5a0f0a0178120a0a08080112040a020801' +
    '620f0a0179120a0a08080112040a020801',
    'hex',
  );
  const session = await ort.InferenceSession.create(model, { executionProviders: ['cpu'] });
  try {
    const output = await session.run({ x: new ort.Tensor('float32', Float32Array.of(7), [1]) });
    assert.deepEqual(Array.from(output.y.data), [7]);
    assert.deepEqual(output.y.dims, [1]);
  } finally {
    await session.release();
  }
});
