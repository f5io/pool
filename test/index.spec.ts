import * as test from 'tape';
import createPool from '../src';

const msg = (() => {
  let i = 0;
  return () => ++i;
})();

test('[pool] errors', t => {
  // @ts-ignore
  const errorNoFn = () => createPool();
  // @ts-ignore
  const errorBothFn = () => createPool({ createProcess: () => {}, createAsyncProcess: () => Promise.resolve() });
  t.throws(errorNoFn, /Please provide a process creator/, 'should throw expected error');
  t.throws(errorBothFn, /Unable to create both a sync pool and an async pool, please choose one!/, 'should throw expected error');
  t.end();
});

test('[pool] return values sync', t => {
  const { run, close } = createPool<undefined, undefined, void>({ createProcess: () => {} });
  const runRes = run();
  const closeRes = close();
  t.ok(runRes instanceof Promise, 'should return an instance of a Promise');
  t.ok(closeRes instanceof Promise, 'should return an instance of a Promise');
  t.end();
});

test('[pool] return values async', t => {
  const pool = createPool({ createAsyncProcess: () => Promise.resolve() });
  t.ok(pool instanceof Promise, 'should return an instance of a Promise');
  pool.then(({ run, close }) => {
    const runRes = run();
    const closeRes = close();
    t.ok(runRes instanceof Promise, 'should return an instance of a Promise');
    t.ok(closeRes instanceof Promise, 'should return an instance of a Promise');
    t.end();
  });
});

test('[pool] default args', async t => {
  const { run } = createPool({ createProcess: () => {} });
  const inputs = Array(10).fill(0).map(msg);
  const result = await Promise.all(inputs.map(x => run(x)));
  t.deepEqual(inputs, result, 'should return the correct results');
  t.end();
});

test('[pool] supplied args', async t => {
  const { run } = createPool<number, number, number>({
    poolSize: 10,
    createProcess: () => 1,
    handler: (_, x: number) => Promise.resolve(x ** 2),
  });
  const inputs = Array(10).fill(0).map(msg);
  const expected = inputs.map(x => x**2);
  const result = await Promise.all(inputs.map(x => run(x)));
  t.deepEqual(expected, result, 'should return the correct results');
  t.end();
});

test('[pool] async pool', async t => {
  const { run } = await createPool<number, number, void>({
    poolSize: 10,
    createAsyncProcess: () => new Promise<void>(resolve => setTimeout(resolve, 10)),
    handler: (_, x) => Promise.resolve(x**2),
  });
  const inputs = Array(10).fill(0).map(msg);
  const expected = inputs.map(x => x**2);
  const result = await Promise.all(inputs.map(x => run(x)));
  t.deepEqual(expected, result, 'should return the correct results');
  t.end();
});

test('[pool] async process creation error handler', async t => {
  const err = new Error('foo');
  await createPool<object, object, object>({
    createAsyncProcess: () => Promise.reject(err),
    handler: x => x,
  }).catch(e => {
    t.equal(err, e, 'should throw the correct error');
    t.end();
  });
});

test('[pool] async error handler', async t => {
  const err = new Error('foo');
  const { run } = await createPool({
    createAsyncProcess: () => new Promise(resolve => setTimeout(resolve, 10)),
    handler: () => Promise.reject(err),
  });
  run('bar').catch(e => {
    t.equal(err, e, 'should throw the correct error');
    t.end();
  });
});

test('[pool] erroring handler', t => {
  const err = new Error('foo');
  const { run } = createPool({
    createProcess: () => {},
    handler: () => Promise.reject(err),
  });
  run('bar').catch(e => {
    t.equal(err, e, 'should throw the correct error');
    t.end();
  });
});


