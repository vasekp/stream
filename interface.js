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
import {StreamError, TimeoutError, ParseError} from './errors.js';

export default class StreamSession {
  constructor(savedVars) {
    this.history = new History();
    this.saveReg = mainReg.child(savedVars);
    this.sessReg = this.saveReg.child();
  }

  eval(cmdLine, opts = {}) {
    try {
      let node = parse(cmdLine);
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
        output,
        histName: `$${this.history.add(pnode)}`
      };
    } catch(e) {
      if(e instanceof ParseError || e instanceof StreamError || e instanceof TimeoutError)
        return {
          result: 'error',
          input: cmdLine,
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
