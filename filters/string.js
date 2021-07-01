import {StreamError} from '../errors.js';
import {Node, Atom, Block, Stream, types} from '../base.js';
import R from '../register.js';

R.register('split', {
  reqSource: true,
  maxArg: 1,
  eval() {
    const str = this.src.evalAtom(types.S);
    if(this.args[0]) {
      const ev = this.args[0].eval().checkType([types.N, types.S]);
      if(ev.type === types.S) {
        const sep = ev.value;
        const split = str.split(sep);
        return new Stream(this,
          (function*() {
            for(const c of split)
              yield new Atom(c);
          })(),
          {len: BigInt(split.length)}
        );
      } else if(ev.type === types.N) {
        const l = ev.value;
        const re = new RegExp(`.{1,${l}}`, 'ug');
        const split = [...str.match(re)];
        return new Stream(this,
          (function*() {
            for(const c of split)
              yield new Atom(c);
          })(),
          {len: BigInt(split.length)}
        );
      }
    } else {
      const chars = [...str];
      return new Stream(this,
        (function*() {
          for(const c of chars)
            yield new Atom(c);
        })(),
        {len: BigInt(chars.length)}
      );
    }
  }
});

R.register('cat', {
  sourceOrArgs: 2,
  eval() {
    if(this.args.length > 1) {
      const strs = this.args.map(arg => arg.evalAtom(types.S));
      return new Atom(strs.join(''));
    } else {
      const strs = [...this.src.evalStream({finite: true})].map(a => a.evalAtom(types.S));
      const sep = this.args[0] ? this.args[0].evalAtom(types.S) : '';
      return new Atom(strs.join(sep));
    }
  }
});

export function ord(c) {
  const cp = c.codePointAt(0);
  if(c !== String.fromCodePoint(cp))
    throw new StreamError(`expected single character, got "${c}"`);
  return cp;
}

export function isSingleChar(c) {
  return c === String.fromCodePoint(c.codePointAt(0));
}

R.register('ord', {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const c = nnode.src.evalAtom(types.S);
    if(nnode.args[0]) {
      const abc = [...nnode.args[0].evalStream({finite: true})].map(a => a.evalAtom(types.S));
      const ix = abc.indexOf(c);
      if(ix < 0)
        throw new StreamError(`character "${c}" not in list`);
      else
        return new Atom(ix + 1);
    } else
      return new Atom(ord(c));
  }
});

R.register('chr', {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    if(nnode.args[0]) {
      const ix = nnode.src.evalNum({min: 1n});
      const abc = nnode.args[0].evalStream({finite: true});
      abc.skip(ix - 1n);
      const {value, done} = abc.next();
      if(done)
        throw new StreamError(`index ${ix} beyond end`);
      else
        return value.eval();
    } else {
      const cp = nnode.src.evalNum({min: 0n});
      return new Atom(String.fromCodePoint(Number(cp)));
    }
  }
});

R.register('chrm', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    let ix = nnode.src.evalNum() - 1n;
    const abc = nnode.args[0].evalStream({finite: true});
    if(typeof abc.len === 'bigint' && abc.len !== 0n) {
      ix %= abc.len;
      if(ix < 0n) ix += abc.len;
      abc.skip(ix);
      const {value} = abc.next();
      return value.eval();
    } else {
      const abcEval = [...abc];
      if(!abcEval.length)
        throw new StreamError('empty alphabet');
      ix = Number(ix) % abcEval.length;
      if(ix < 0n) ix += abcEval.length;
      return abcEval[ix].eval();
    }
  }
});

R.register('chars', {
  reqSource: true,
  numArg: 1,
  eval() {
    const str = this.src.evalAtom(types.S);
    const abc = [...this.args[0].evalStream({finite: true})].map(s => s.evalAtom(types.S));
    return new Stream(this,
      (function*() {
        let ix = 0;
        while(ix < str.length) {
          let best = '';
          for(const ch of abc) {
            if(ch.length <= best.length)
              continue;
            if(str.startsWith(ch, ix))
              best = ch;
          }
          if(best) {
            yield new Atom(best);
            ix += best.length;
          } else
            throw new StreamError(`no match for "...${str.substring(ix)}" in alphabet`);
        }
      })()
    );
  }
});

R.register('ords', {
  reqSource: true,
  numArg: 1,
  eval() {
    const str = this.src.evalAtom(types.S);
    const abc = [...this.args[0].evalStream({finite: true})].map(s => s.evalAtom(types.S));
    return new Stream(this,
      (function*() {
        let ix = 0;
        while(ix < str.length) {
          let bestLen = 0;
          let bestIx;
          for(let i = 0; i < abc.length; i++) {
            const ch = abc[i];
            if(ch.length <= bestLen)
              continue;
            if(str.startsWith(ch, ix)) {
              bestLen = ch.length;
              bestIx = i;
            }
          }
          if(bestLen) {
            yield new Atom(bestIx + 1);
            ix += bestLen;
          } else
            throw new StreamError(`no match for "...${str.substring(ix)}" in alphabet`);
        }
      })()
    );
  }
});

R.register(['lcase', 'lc'], {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const pnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const str = pnode.src.evalAtom(types.S);
    return new Atom(str.toLowerCase());
  }
});

R.register(['ucase', 'uc'], {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const pnode = this.prepareAll(scope);
    if(scope.partial)
      return pnode;
    const str = pnode.src.evalAtom(types.S);
    return new Atom(str.toUpperCase());
  }
});

R.register('abc', {
  reqSource: false,
  numArg: 0,
  eval() {
    const ucase = this.ident === 'ABC';
    const base = ucase ? 65 : 97;
    let i = base;
    return new Stream(this,
      (function*() { while(i < base + 26) yield new Atom(String.fromCharCode(i++)); })(),
      {
        skip: c => i += Number(c),
        len: 26n
      }
    );
  }
});

R.register(['isstring', 'isstr'], {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const c = nnode.src.eval();
    return new Atom(c.type === types.S);
  }
});

R.register('isdigit', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const r = nnode.src.eval();
    if(r.type !== types.S)
      return new Atom(false);
    const c = r.value;
    return new Atom(isSingleChar(c) && c >= '0' && c <= '9');
  }
});

R.register('isletter', {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const r = nnode.src.eval();
    if(r.type !== types.S)
      return new Atom(false);
    const c = r.value;
    if(nnode.args[0]) {
      const abc = [...nnode.args[0]
        .evalStream({finite: true})]
        .map(a => a.evalAtom(types.S).toLowerCase());
      return new Atom(abc.includes(c.toLowerCase()));
    } else
      return new Atom(isSingleChar(c) && (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'));
  }
});

R.register(['isupper', 'isucase', 'isuc'], {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const r = nnode.src.eval();
    if(r.type !== types.S)
      return new Atom(false);
    const c = r.value;
    if(nnode.args[0]) {
      const abc = [...nnode.args[0]
        .evalStream({finite: true})]
        .map(a => a.evalAtom(types.S).toUpperCase());
      return new Atom(abc.includes(c));
    } else
      return new Atom(isSingleChar(c) && c >= 'A' && c <= 'Z');
  }
});

R.register(['islower', 'islcase', 'islc'], {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const r = nnode.src.eval();
    if(r.type !== types.S)
      return new Atom(false);
    const c = r.value;
    if(nnode.args[0]) {
      const abc = [...nnode.args[0]
        .evalStream({finite: true})]
        .map(a => a.evalAtom(types.S).toLowerCase());
      return new Atom(abc.includes(c));
    } else
      return new Atom(isSingleChar(c) && c >= 'a' && c <= 'z');
  }
});

R.register('prefix', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const str = nnode.src.evalAtom(types.S);
    const len = nnode.args[0].evalNum();
    return new Atom(str.slice(0, Number(len))); // works for ≥ 0 as well as < 0
  }
});

R.register('postfix', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const str = nnode.src.evalAtom(types.S);
    const len = nnode.args[0].evalNum();
    return len === 0n ? new Atom("") : new Atom(str.slice(Number(-len)));
  }
});

R.register('ends', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const str = nnode.src.evalAtom(types.S);
    const pfx = nnode.args[0].evalAtom(types.S);
    return new Atom(str.endsWith(pfx));
  }
});

R.register('starts', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const str = nnode.src.evalAtom(types.S);
    const pfx = nnode.args[0].evalAtom(types.S);
    return new Atom(str.startsWith(pfx));
  }
});

R.register('shift', {
  reqSource: true,
  numArg: 2,
  eval() {
    const str = this.src.evalAtom(types.S);
    let shift = this.args[0].evalNum();
    const abc = [...this.args[1].evalStream({finite: true})].map(s => s.evalAtom(types.S));
    shift = Number(shift % BigInt(abc.length));
    if(shift < 0)
      shift += abc.length;
    let ix = 0;
    let ret = '';
    while(ix < str.length) {
      let bestLen = 0;
      let bestIx;
      for(let i = 0; i < abc.length; i++) {
        const ch = abc[i];
        if(ch.length <= bestLen)
          continue;
        if(str.startsWith(ch, ix)) {
          bestLen = ch.length;
          bestIx = i;
        }
      }
      if(bestLen) {
        ret += abc[(bestIx + shift) % abc.length];
        ix += bestLen;
      } else {
        const ch = String.fromCodePoint(str.codePointAt(ix));
        ret += ch;
        ix += ch.length;
      }
    }
    return new Atom(ret);
  }
});
