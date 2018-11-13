import { channel, put, take, drain } from '@paybase/csp';

function isFunction(x: any): boolean {
  return typeof x === 'function';
}

type PoolOptions<I, O, P> = {
  poolSize?: number;
  handler?: (process: P, msg: I) => Promise<O>;
};

type SyncProcess<P> = {
  createProcess: () => P;
};

type AsyncProcess<P> = {
  createAsyncProcess: () => Promise<P>;
};

type Pool<I, O> = {
  run: (value?: I) => Promise<O>;
  close: () => Promise<void>;
};

function createPool<I, O, P>(options?: PoolOptions<I, O, P> & SyncProcess<P>): Pool<I, O>;
function createPool<I, O, P>(options?: PoolOptions<I, O, P> & AsyncProcess<P>): Promise<Pool<I, O>>;
function createPool<I, O, P>(options?: PoolOptions<I, O, P> & (SyncProcess<P> | AsyncProcess<P>)): Promise<Pool<I, O>> | Pool<I, O> {
  const opts = options || {};
  const {
    poolSize = 5,
    handler = (_: P, x: I) => Promise.resolve(x as any as O),
  } = (opts as PoolOptions<I, O, P>);

  const { createProcess } = (opts as SyncProcess<P>);

  const { createAsyncProcess } = (opts as AsyncProcess<P>);

  const pool = Array(poolSize).fill(0);
  const processPool = channel<P>();

  if (!isFunction(createProcess) && !isFunction(createAsyncProcess))
    throw new Error('Please provide a process creator');

  if (isFunction(createProcess) && isFunction(createAsyncProcess))
    throw new Error('Unable to create both a sync pool and an async pool, please choose one!');

  const inflight: Promise<P>[] = [];
  function spawnAsyncProcess(): Promise<void> {
    const proc = createAsyncProcess();
    inflight.push(proc);
    return Promise.resolve(proc)
      .then(p => {
        inflight.splice(inflight.indexOf(proc), 1);
        put(processPool, p);
      })
      .catch(e => {
        inflight.splice(inflight.indexOf(proc), 1);
        throw e;
      });
  }

  function run(value?: I): Promise<O> {
    return new Promise(async (resolve, reject) => {
      let p = await take(processPool);
      try {
        const result = await handler(p, value);
        resolve(result);
        put(processPool, p);
      } catch(err) {
        reject(err);
        try { (p as { kill?: () => void }).kill(); } catch(e) {}
        p = null;
        if (createProcess) {
          put(processPool, createProcess());
        } else {
          spawnAsyncProcess();
        }
      }
    });
  }

  async function close(): Promise<void> {
    await Promise.all(inflight);
    const procs = await drain(processPool);
    procs.forEach(p => {
      try { (p as { kill?: () => void }).kill(); } catch(e) {}
      p = null;
    });
  }

  if (createProcess) {
    pool.forEach(() => put(processPool, createProcess()));
    return { run, close };
  } else {
    return Promise.race(pool.map(() => spawnAsyncProcess()))
      .then(() => ({ run, close }))
      .catch(err => {
        close();
        throw err;
      });
  }

}

export = createPool;
