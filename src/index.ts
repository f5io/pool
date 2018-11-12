import { channel, put, take, drain } from '@paybase/csp';

function isFunction(x: any): Boolean{
  return typeof x === 'function'
}

export type PoolOptions<I, O> = {
  poolSize?: number;
  handler?: (process: any, msg: I) => Promise<O>;
};

export type SyncProcess<P> = {
  createProcess: () => P;
};

export type AsyncProcess<P> = {
  createAsyncProcess: () => Promise<P>;
}

export type Pool<I, O> = {
  run: (value?: I) => Promise<O>;
  close: () => Promise<void>;
}


function createPool<I, O, P>(opts: PoolOptions<I, O> & P): Pool<I, O> | Promise<Pool<I, O>> {

  const {
    poolSize = 5,
    handler = (_: P, x: I) => Promise.resolve(x as any),
  } = opts || {};

  const {
    createProcess = undefined
  } = (opts as unknown as SyncProcess<any>) || {};

  const {
    createAsyncProcess = undefined
  } = (opts as unknown as AsyncProcess<any>) || {};
  

  const pool: number[] = Array(poolSize).fill(0);
  const processPool = channel<P>();

  if (!isFunction(createProcess) && !isFunction(createAsyncProcess))
    throw new Error(`Please provide a process creator`);

  if (isFunction(createProcess) && isFunction(createAsyncProcess))
    throw new Error(`Unable to create both a sync pool and an async pool, please choose one!`);
  
  const inflight: any[] = [];
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
  };

  function run(value?: I): Promise<any>{
    return new Promise(async (resolve, reject) => {
      let p: any = await take(processPool);
      try {
        const result = await handler(p, value);
        resolve(result as O);
        put(processPool, p);
      } catch(err) {
        reject(err);
        try { p.kill() } catch(e) {}
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
    procs.forEach((p: any) => {
      try { p.kill() } catch(e) {}
      p = null;
    });
  };

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

};

export { createPool };
export default createPool;