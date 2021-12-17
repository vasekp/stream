import './filters/lang.js';
import './filters/streams.js';
import './filters/numeric.js';
import './filters/string.js';
import './filters/combi.js';
import './filters/iface.js';

import mainReg from './register.js';
import History from './history.js';
import parse from './parser.js';
import RNG from './random.js';
import watchdog from './watchdog.js';
import {formatText} from './help.js';
import {BaseError} from './errors.js';

const helpRegex = /^\?\s*(\w+)?\s*$/d;

export default class StreamSession {
  constructor(savedVars) {
    this.history = new History();
    this.saveReg = mainReg.child(savedVars);
    this.sessReg = this.saveReg.child();
  }

  clearHist() {
    this.history.clear();
    return {result: 'ok'};
  }

  parse(input) {
    if(helpRegex.test(input))
      return {result: 'ok'};
    try {
      parse(input);
      return {result: 'ok'};
    } catch(e) {
      if(e instanceof BaseError)
        return {
          result: 'error',
          input,
          errPos: e.pos,
          errLen: e.len,
          errNode: e.desc,
          error: e.msg
        };
      else
        return {
          result: 'error',
          input,
          error: e.toString()
        };
    }
  }

  eval(input, opts = {}) {
    const regEvents = [];
    const regEvent = e => {
      regEvents.push({
        register: e.target === this.saveReg ? 'save' : 'session',
        ...e.detail
      });
    };
    this.sessReg.addEventListener('register', regEvent);
    this.saveReg.addEventListener('register', regEvent);
    try {
      /*** Test for ?help commands ***/
      const helpMatch = helpRegex.exec(input);
      if(helpMatch) {
        if(!helpMatch[1])
          return {result: 'help'};
        const ident = helpMatch[1];
        const record = mainReg.get(ident);
        if(record)
          return {
            result: 'help',
            ident,
            identCanon: record.aliases[0],
            get helpText() {
              return formatText(record);
            }
          };
        else
          return {
            result: 'error',
            input,
            errPos: helpMatch.indices[1][0],
            errLen: helpMatch.indices[1][1] - helpMatch.indices[1][0],
            error: `Help on ${ident} not found`
          };
      }

      /*** Normal command ***/
      let node = parse(input);
      if(node.ident === 'equal' && node.token.value === '=' && !node.src && node.args[0] && node.args[0].type === 'symbol' && !opts.browse)
        node = node.toAssign();
      node.check();
      return watchdog.timed(_ => {
        const result = node.prepare({
            history: this.history,
            register: this.sessReg,
            seed: RNG.seed(),
            referrer: node})
          .eval();
        if(result.type === 'stream' && opts.browse) {
          return {
            result: 'ok',
            input,
            handle: new StreamHandle(result)
          };
        } else {
          const output = result.writeout(opts.length);
          return {
            result: 'ok',
            input,
            output,
            histName: `$${this.history.add(result)}`,
            histRecord: result.toString(),
            regEvents,
            type: result.type,
            outRaw: result.isImm ? result.value.toString() : null
          };
        }
      }, opts.time);
    } catch(e) {
      if(e instanceof BaseError)
        return {
          result: 'error',
          input,
          errPos: e.pos,
          errLen: e.len,
          errNode: e.desc,
          error: e.msg
        };
      else {
        console.error(e);
        return {
          result: 'error',
          input,
          error: e.toString()
        };
      }
    } finally {
      this.sessReg.removeEventListener('register', regEvent);
      this.saveReg.removeEventListener('register', regEvent);
    }
  }

  close() {
    return this.saveReg.dump();
  }
};

class StreamHandle {
  constructor(stm) {
    this.stm = stm;
  }

  next(opts = {}) {
    try {
      const n = watchdog.timed(_ => this.stm.next().value?.eval(), opts.time);
      if(!n)
        return {result: 'ok'};
      else
        return {
          result: 'ok',
          input: n.toString(),
          output: watchdog.timed(_ => n.writeout(opts.length), opts.time),
          type: n.type,
          outRaw: n.isImm ? n.value.toString() : null
        };
    } catch(e) {
      if(e instanceof BaseError)
        return {
          result: 'error',
          input: this.stm.toString(),
          errPos: e.pos,
          errLen: e.len,
          errNode: e.desc,
          error: e.msg
        };
      else
        return {
          result: 'error',
          input: this.stm.toString(),
          error: e.toString()
        };
    }
  }
};
