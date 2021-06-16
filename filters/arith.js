import {Node, Atom, mainReg} from '../base.js';

function asnum(st, env) {
  const ev = st.eval(env);
  if(!(ev instanceof Atom))
    throw 'not atom';
  const v = ev.value;
  if(typeof v !== 'bigint')
    throw 'not number';
  return v;
}

function regReducer(name, fun) {
  mainReg.register(name, {
    minArg: 2,
    eval: function(src, args, env) {
      const is = args
        .map(arg => arg.prepend(src).eval(env))
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
                vs.push(asnum(r, env));
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
