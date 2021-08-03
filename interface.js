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
import {formatText} from './help.js';
import {StreamError, TimeoutError, ParseError} from './errors.js';

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
      if(e instanceof ParseError || e instanceof StreamError || e instanceof TimeoutError)
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
        const record = mainReg.find(ident);
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
      if(node.ident === 'equal' && node.token.value === '=' && !node.src && node.args[0] && node.args[0].type === 'symbol')
        node = node.toAssign();
      const [pnode, ev, output] = node.timed(n => {
        const pnode = n.prepare({
          history: this.history,
          register: this.sessReg,
          seed: RNG.seed(),
          referrer: n});
        const ev = pnode.eval();
        const out = ev.type === 'stream' && opts.browse
          ? new StreamHandle(ev)
          : ev.writeout(opts.length);
        return [pnode, ev, out];
      }, opts.time);
      return {
        result: 'ok',
        input,
        output,
        histName: `$${this.history.add(pnode)}`,
        histRecord: pnode.toString(),
        regEvents,
        type: ev.type,
        outRaw: ev.isAtom ? ev.value.toString() : null
      };
    } catch(e) {
      if(e instanceof ParseError || e instanceof StreamError || e instanceof TimeoutError)
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
      const n = this.stm.timed(s => s.next().value?.eval());
      if(!n)
        return {result: 'ok'};
      else
        return {
          result: 'ok',
          input: n.toString(),
          output: n.timed(n => n.writeout(opts.length), opts.time),
          type: n.type,
          outRaw: n.isAtom ? n.value.toString() : null
        };
    } catch(e) {
      if(e instanceof ParseError || e instanceof StreamError || e instanceof TimeoutError)
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
