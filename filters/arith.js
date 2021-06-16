import {Node, Atom, mainReg, StreamError} from '../base.js';

function regReducer(name, fun) {
  mainReg.register(name, {
    minArg: 2,
    eval: function(node, env) {
      const is = node.args
        .map(arg => arg.prepend(node.src).eval(env))
        .map(st => st instanceof Atom ? st.numValue : st);
      if(!is.map(i => typeof i === 'bigint').includes(false))
        return new Atom(is.reduce(fun));
      else {
        const iter = (function*() {
          for(;;) {
            const vs = [];
            for(const i of is)
              if(typeof i === 'bigint')
                vs.push(i);
              else {
                const {value: r, done} = i.next();
                if(done)
                  return;
                vs.push(r.evalNum(env));
              }
            yield new Atom(vs.reduce(fun));
          }
        }());
        iter.skip = c => {
          for(const i of is)
            if(typeof i !== 'bigint')
              i.skip(c);
        };
        return iter;
      }
    }
  });
}

regReducer('plus', (a, b) => a + b);
regReducer('minus', (a, b) => a - b);
regReducer('times', (a, b) => a * b);
regReducer('div', (a, b) => a / b);
