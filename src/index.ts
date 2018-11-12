import { channel, put, take, drain } from '@paybase/csp';

function isFunction(x: any): Boolean{
  return typeof x === 'function'
}

export type PoolOptions<Input, Output> = {
  poolSize?: number;
  handler?: (process: any, msg: Input) => Promise<Output>;
};

export type SyncProcess<Process> = {
  createProcess: () => Process;
};

export type AsyncProcess<Process> = {
  createAsyncProcess: () => Promise<Process>;
}

export type Pool<Input, Output> = {
  run: (value?: Input) => Promise<Output>;
  close: () => Promise<void>;
}

function createPool<Input, Output, Process>(opts: PoolOptions<Input, Output> & SyncProcess<Process>): Pool<Input, Output>;
function createPool<Input, Output, Process>(opts: PoolOptions<Input, Output> & AsyncProcess<Process>): Promise<Pool<Input, Output>>;
function createPool<Input, Output, Process>(opts: any = {}) {
  const {
    poolSize = 5,
    handler = (_: Process, x: Input) => Promise.resolve(x as any),
    createProcess,
    createAsyncProcess
  } = opts;

  const pool: number[] = Array(poolSize).fill(0);
  const processPool = channel<Process>();

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

  function run(value?: Input): Promise<any>{
    return new Promise(async (resolve, reject) => {
      let p: any = await take(processPool);
      try {
        const result = await handler(p, value);
        resolve(result as Output);
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