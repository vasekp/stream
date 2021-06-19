import {Node, Atom, mainReg, StreamError} from '../base.js';

/*function regReducer(name, sign, fun) {
  mainReg.register(name, {
    minArg: 2,
    eval: function(node, env) {
      const is = node.args
        .map(arg => arg.prepend(node.src).eval(env))
        .map(st => st instanceof Atom ? st.numValue : st);
      if(is.every(i => typeof i === 'bigint'))
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
    },
    desc: function(node) {
      let ret = '';
      if(node.src)
        ret = node.src.desc() + '.';
      ret += '(';
      ret += node.args.map(n => n.desc()).join(sign);
      ret += ')';
      return ret;
    }
  });
}

regReducer('plus', '+', (a, b) => a + b);
regReducer('minus', '-', (a, b) => a - b);
regReducer('times', '*', (a, b) => a * b);
regReducer('div', '/', (a, b) => a / b);

mainReg.register('min', {
  eval: function(node, env) {
    if(node.args.length > 0) {
      const ins = node.args.map(arg => arg.prepend(node.src).evalNum(env));
      const min = ins.reduce((a, b) => b < a ? b : a);
      return new Atom(min);
    } else {
      if(!node.src)
        throw new StreamError(null, 'requires source');
      const str = node.src.evalStream(env, {finite: true});
      const iter = (function*() {
        for(const s of str)
          yield s.evalNum(env);
      })();
      const {value, done} = iter.next();
      if(done)
        throw new StreamError(null, 'empty stream');
      let min = value;
      for(const v of iter)
        if(v < min)
          min = v;
      return new Atom(min);
    }
  }
});

mainReg.register('max', {
  eval: function(node, env) {
    if(node.args.length > 0) {
      const ins = node.args.map(arg => arg.prepend(node.src).evalNum(env));
      const max = ins.reduce((a, b) => b > a ? b : a);
      return new Atom(max);
    } else {
      if(!node.src)
        throw new StreamError(null, 'requires source');
      const str = node.src.evalStream(env, {finite: true});
      const iter = (function*() {
        for(const s of str)
          yield s.evalNum(env);
      })();
      const {value, done} = iter.next();
      if(done)
        throw new StreamError(null, 'empty stream');
      let max = value;
      for(const v of iter)
        if(v > max)
          max = v;
      return new Atom(max);
    }
  }
});

mainReg.register(['total', 'tot'], {
  source: true,
  maxArg: 0,
  eval: function(node, env) {
    const str = node.src.evalStream(env, {finite: true});
    let tot = 0n;
    for(const s of str)
      tot += s.evalNum(env);
    return new Atom(tot);
  }
});

mainReg.register('diff', {
  source: true,
  maxArg: 0,
  eval: function(node, env) {
    const sIn = node.src.evalStream(env);
    const iter = (function*() {
      const {value, done} = sIn.next();
      if(done)
        return;
      let prev = value.evalNum(env);
      for(const next of sIn) {
        const curr = next.evalNum(env);
        yield new Atom(curr - prev);
        prev = curr;
      }
    })();
    switch(sIn.len) {
      case undefined:
        break;
      case null:
        iter.len = null;
        break;
      case 0n:
        iter.len = 0n;
        break;
      default:
        iter.len = sIn.len - 1n;
        break;
    }
    return iter;
  }
});

mainReg.register('pow', {
  minArg: 1,
  maxArg: 2,
  eval: function(node, env) {
    if(node.args.length === 1) {
      if(!node.src)
        throw new StreamError('needs source');
      const base = node.src.evalNum(env);
      const pow = node.args[0].prepend(node.src).evalNum(env, {min: 0n});
      return new Atom(base ** pow);
    } else {
      const base = node.args[0].prepend(node.src).evalNum(env);
      const pow = node.args[1].prepend(node.src).evalNum(env, {min: 0n});
      return new Atom(base ** pow);
    }
  }
});

mainReg.register('mod', {
  source: true,
  minArg: 1,
  maxArg: 2,
  eval: function(node, env) {
    const inp = node.src.evalNum(env);
    const mod = node.args[0].prepend(node.src).evalNum(env, {min: 1n});
    const base = node.args[1] ? node.args[1].prepend(node.src).evalNum(env) : 0n;
    const res0 = (inp - base) % mod;
    const res = (res0 >= 0n ? res0 : res0 + mod) + base;
    return new Atom(res);
  }
});*/
