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

  eval(input, opts = {}) {
    try {
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
      let node = parse(input);
      if(node.ident === 'equal' && node.token.value === '=' && !node.src && node.args[0] && node.args[0].type === 'symbol')
        node = node.toAssign();
      const [pnode, output] = node.timed(n => {
        const pnode = n.prepare({
          history: this.history,
          register: this.sessReg,
          seed: RNG.seed(),
          referrer: n});
        const out = pnode.eval().writeout(opts.length);
        return [pnode, out];
      }, opts.time);
      return {
        result: 'ok',
        input,
        output,
        histName: `$${this.history.add(pnode)}`
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
        throw e;
    }
  }

  close() {
    return this.saveReg.dump();
  }
};
