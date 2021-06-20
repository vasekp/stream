import {Node, Atom, Block, Stream, StreamError, checks, mainReg} from '../base.js';

const S = 'string';

mainReg.register('split', {
  source: true,
  maxArg: 1,
  eval: function() {
    const str = this.src.evalAtom(S);
    if(this.args[0]) {
      const sep = this.args[0].evalAtom(S);
      return new Stream(this,
        (function*() {
          for(const c of str.split(sep))
            yield new Atom(c);
        })()
      );
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

mainReg.register('cat', {
  source: true,
  maxArg: 1,
  eval: function() {
    const strs = [...this.src.evalStream({finite: true})].map(a => a.evalAtom(S));
    const sep = this.args[0] ? this.args[0].evalAtom(S) : '';
    return new Atom(strs.join(sep));
  }
});

mainReg.register('ord', {
  source: true,
  maxArg: 1,
  prepare: function() {
    const nnode = Node.prototype.prepare.call(this);
    const c = nnode.src.evalAtom(S);
    if(nnode.args[0]) {
      const abc = [...nnode.args[0].evalStream({finite: true})].map(a => a.evalAtom(S));
      const ix = abc.indexOf(c);
      if(ix < 0)
        throw new StreamError(`character "${c}" not in list`);
      else
        return new Atom(ix + 1);
    } else {
      if(c.codePointAt(1) !== undefined)
        throw new StreamError(`expected single character, got "${c}"`);
      return new Atom(c.codePointAt(0));
    }
  }
});

mainReg.register('chr', {
  source: true,
  maxArg: 1,
  prepare: function() {
    const nnode = Node.prototype.prepare.call(this);
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

mainReg.register('chrm', {
  source: true,
  numArg: 1,
  prepare: function() {
    const nnode = Node.prototype.prepare.call(this);
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

mainReg.register('chars', {
  source: true,
  numArg: 1,
  eval: function() {
    const str = this.src.evalAtom(S);
    const abc = [...this.args[0].evalStream({finite: true})].map(s => s.evalAtom(S));
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

mainReg.register('ords', {
  source: true,
  numArg: 1,
  eval: function() {
    const str = this.src.evalAtom(S);
    const abc = [...this.args[0].evalStream({finite: true})].map(s => s.evalAtom(S));
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

mainReg.register('lcase', {
  source: true,
  numArg: 0,
  prepare: function() {
    this.checkArgs(this.src, this.args);
    const str = this.src.prepare().evalAtom(S);
    return new Atom(str.toLowerCase());
  }
});

mainReg.register('ucase', {
  source: true,
  numArg: 0,
  prepare: function() {
    this.checkArgs(this.src, this.args);
    const str = this.src.prepare().evalAtom(S);
    return new Atom(str.toUpperCase());
  }
});

mainReg.register('abc', {
  source: false,
  numArg: 0,
  eval: function() {
    let i = 97;
    return new Stream(this,
      (function*() { while(i < 97+26) yield new Atom(String.fromCharCode(i++)); })(),
      {
        skip: c => i += Number(c),
        len: 26n
      }
    );
  }
});

mainReg.register('ABC', {
  source: false,
  numArg: 0,
  eval: function() {
    let i = 65;
    return new Stream(this,
      (function*() { while(i < 65+26) yield new Atom(String.fromCharCode(i++)); })(),
      {
        skip: c => i += Number(c),
        len: 26n
      }
    );
  }
});
