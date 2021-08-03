import {TimeoutError} from './errors.js';

let timeEnd;
let counter = 0;

const DEFTIME = 1000;

export default {
  start(limit) {
    if(!timeEnd) {
      timeEnd = Date.now() + limit;
      counter = 0;
    } else
      throw new Error('Watchdog restarted without stopping');
  },

  stop() {
    timeEnd = null;
  },

  tick() {
    if((counter++ & 0xFFF) === 0)
      this.utick();
  },

  utick() {
    if(!timeEnd)
      throw new Error('Watchdog tick() called without start()');
    if(Date.now() > timeEnd) {
      throw new TimeoutError(counter);
    }
  },

  timed(func, limit = DEFTIME) {
    try {
      this.start(limit);
      return func();
    } finally {
      this.stop();
    }
  }
};
