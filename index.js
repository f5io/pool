const { channel, put, take, drain } = require('@paybase/csp');

const isFunction = x => typeof x === 'function';

const createPool = ({
  poolSize = 5,
  createProcess,
  createAsyncProcess,
  handler = (_, x) => Promise.resolve(x),
} = {}) => {
  const pool = Array(poolSize).fill(0);
  const processPool = channel();
  
  if (!isFunction(createProcess) && !isFunction(createAsyncProcess))
    throw new Error(`Please provide a process creator`);

  if (isFunction(createProcess) && isFunction(createAsyncProcess))
    throw new Error(`Unable to create both a sync pool and an async pool, please choose one!`);
  
  const inflight = [];
  const spawnAsyncProcess = () => {
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

  const run = (value) =>
    new Promise(async (resolve, reject) => {
      let p = await take(processPool);
      try {
        const result = await handler(p, value);
        resolve(result);
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

  const close = async () => {
    await Promise.all(inflight);
    const procs = await drain(processPool);
    procs.forEach(p => {
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

exports.createPool = createPool;
module.exports = createPool;
