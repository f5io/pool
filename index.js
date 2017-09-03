const { channel, put, take, drain } = require('@paybase/csp');

const createPool = ({
  poolSize = 5,
  createProcess = () => {},
  handler = (_, x) => Promise.resolve(x),
} = {}) => {
  const processPool = channel();
  
  Array(poolSize).fill(0)
    .forEach(() => put(processPool, createProcess()));

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

  return { run, close };
};

exports.createPool = createPool;
module.exports = createPool;
