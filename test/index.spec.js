const test = require('tape');
const createPool = require('../');

const msg = (() => {
  let i = 0;
  return () => ++i;
})();

test('[pool] return values', t => {
  const { run, close } = createPool();
  const runRes = run();
  const closeRes = close();
  t.ok(runRes instanceof Promise, 'should return an instance of a Promise');
  t.ok(closeRes instanceof Promise, 'should return an instance of a Promise');
  t.end();
});

test('[pool] default args', async t => {
  const { run, close } = createPool();
  const inputs = Array(10).fill(0).map(msg);
  const result = await Promise.all(inputs.map(x => run(x)));
  t.deepEqual(inputs, result, 'should return the correct results');
  t.end();
});

test('[pool] supplied args', async t => {
  const { run, close } = createPool({
    poolSize: 10,
    createProcess: x => x,
    handler: (_, x) => Promise.resolve(x**2),
  });
  const inputs = Array(10).fill(0).map(msg);
  const expected = inputs.map(x => x**2);
  const result = await Promise.all(inputs.map(x => run(x)));
  t.deepEqual(expected, result, 'should return the correct results');
  t.end();
});

test('[pool] erroring handler', t => {
  const err = new Error('foo');
  const { run, close } = createPool({
    handler: () => Promise.reject(err),
  });
  run('bar').catch(e => {
    t.equal(err, e, 'should throw the correct error');
    t.end();
  });
});


