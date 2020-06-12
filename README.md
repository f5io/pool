# @f5io/pool

A highly flexible process pooling library for Node.js. Built with [@f5io/csp](https://github.com/f5io/csp).

[![npm version](https://badge.fury.io/js/%40f5io%2Fpool.svg)](https://badge.fury.io/js/%40f5io%2Fpool)

## Installation

```
$ npm install --save @f5io/pool
```

or

```
$ yarn add @f5io/pool
```

## API

This library exposes a single factory method for creating pools.

### `createPool({ poolSize = 5, createProcess, createAsyncProcess, handler })` -> `Pool|Promise<Pool>`

The pool factory takes an options object containing 3 of 4 properties:

- `poolSize` - defaults to 5, determines the size of the pool
- `createProcess` - defines a `process` factory function which can return anything
- `createAsyncProcess` - defines an async `process` factory which can return anything, useful if your process requires time to become active.
- `handler(process, input)` -> `Promise` - defines a function which handles a unit of work. The handler must return a `Promise` and receives a `process` (as defined by the `process` factory) and the `input` from a call to `run` on the pool

You must supply only one of `createProcess` or `createAsyncProcess`! If you supply `createAsyncProcess` the return value of the `createPool` factory will be a `Promise<Pool>`.

A returned `Pool` exposes 2 methods:

- `Pool.run(input)` -> `Promise` - The interface defined to run against the pool of processes, supplied input can be of any type as the handler supplied at `pool` creation defines how the input interacts which the underlying process
- `Pool.close` -> `Promise` - A mechanism for destroying the `pool` when it is no longer needed

## Example Usage

### Network I/O parallelisation

By defining our process as a plain `Symbol`, or `true` for that matter, we can limit request parallelisation to the size of the pool.

```javascript
const assert = require('assert');
const fetch = require('node-fetch');
const createPool = require('@f5io/pool');

const { run, close } = createPool({
  poolSize: 2,
  createProcess: () => Symbol('process'),
  handler: (_, query) => {
    console.log(`🚀  running request with query: ${query}`);
    return fetch(`https://postman-echo.com/get?q=${query}`)
      .then(res => res.json())
      .then(res => assert.equal(res.args.q, query))
      .then(_ => console.log(`👌  request completed successfully`));
  }
});

(async () => {
  const queries = Array.from({ length: 20 }, (_, i) => run(`${++i}`));
  await Promise.all(queries);
  close();
})();
```

![request parallelisation](/assets/pool.request.gif?raw=true)

### Child process pooling

For spawning multiple child processes and spreading work across processes in the pool.

```javascript
const assert = require('assert');
const { spawn } = require('child_process');
const createPool = require('@f5io/pool');

const { run, close } = createPool({
  poolSize: 10,
  createProcess: () => {
    const p = spawn('cat', [ '-' ]);
    p.stdin.setEncoding('utf-8');
    p.stdout.setEncoding('utf-8'); 
    return p;
  },
  handler: (p, input) =>
    new Promise(resolve => {
      p.stdout.once('data', d => {
        assert(d, input);
        console.log(`👌  received data: ${d.trim()} from pid: ${p.pid}`);
        resolve(d);
      });
      console.log(`🚀  sending data: ${input.trim()} to pid: ${p.pid}`);
      p.stdin.write(input);
    }),   
});

(async () => {
  const inputs = Array.from({ length: 100 }, (_, i) => run(`${++i}\n`));
  await Promise.all(inputs);
  close();
})();
```

![child process pool](/assets/pool.spawn.gif?raw=true)

## Contributions

Contributions are welcomed and appreciated!

1. Fork this repository.
1. Make your changes, documenting your new code with comments.
1. Submit a pull request with a sane commit message.

Feel free to get in touch if you have any questions.

## License

Please see the `LICENSE` file for more information.
