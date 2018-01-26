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
        put(processPool, createProcess());
      }
    });

  const close = async () => {
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
    return Promise.all(pool.map(() => createAsyncProcess()))
      .then(ps => ps.forEach(p => put(processPool, p)))
      .then(() => ({ run, close }));
  }

};

exports.createPool = createPool;
module.exports = createPool;
