import {Node, Atom, mainReg} from '../base.js';

mainReg.register('plus', {
  minArg: 2,
  eval: function(src, args, env) {
    const is = args.map(arg => arg.prepend(src).eval(env));
    if(is.map(i => i instanceof Atom).includes(false)
        || is.map(i => typeof i.value === 'bigint').includes(false))
      throw 'input not numeric';
    const res = is.map(i => i.value).reduce((a, b) => a + b);
    return new Atom(res);
  }
});

mainReg.register('minus', {
  minArg: 2,
  eval: function(src, args, env) {
    const is = args.map(arg => arg.prepend(src).eval(env));
    if(is.map(i => i instanceof Atom).includes(false)
        || is.map(i => typeof i.value === 'bigint').includes(false))
      throw 'input not numeric';
    const res = is.map(i => i.value).reduce((a, b) => a - b);
    return new Atom(res);
  }
});

mainReg.register('times', {
  minArg: 2,
  eval: function(src, args, env) {
    const is = args.map(arg => arg.prepend(src).eval(env));
    if(is.map(i => i instanceof Atom).includes(false)
        || is.map(i => typeof i.value === 'bigint').includes(false))
      throw 'input not numeric';
    const res = is.map(i => i.value).reduce((a, b) => a * b);
    return new Atom(res);
  }
});

mainReg.register('div', {
  minArg: 2,
  eval: function(src, args, env) {
    const is = args.map(arg => arg.prepend(src).eval(env));
    if(is.map(i => i instanceof Atom).includes(false)
        || is.map(i => typeof i.value === 'bigint').includes(false))
      throw 'input not numeric';
    const res = is.map(i => i.value).reduce((a, b) => a / b);
    return new Atom(res);
  }
});
