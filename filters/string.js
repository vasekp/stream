import {StreamError} from '../errors.js';
import {Node, Atom, Block, Stream, checks, mainReg} from '../base.js';

const S = 'string';

mainReg.register('split', {
  source: true,
  maxArg: 1,
  eval: function() {
    const str = this.src.evalAtom(S);
    if(this.args[0]) {
      const ev = this.args[0].eval();
      if(!ev.isAtom)
        throw new StreamError(`expected number or string, got stream ${first.node.desc()}`);
      if(ev.type === S) {
        const sep = ev.value;
        const split = str.split(sep);
        return new Stream(this,
          (function*() {
            for(const c of split)
              yield new Atom(c);
          })(),
          {len: BigInt(split.length)}
        );
      } else if(ev.type === 'number') {
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
      } else
        throw new StreamError(`expected number or string, got ${first.type} ${first.value}`);
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
  eval: function() {
    if(this.args.length > 1) {
      const strs = this.args.map(arg => arg.evalAtom(S));
      return new Atom(strs.join(''));
    } else {
      if(!this.src)
        throw new StreamError('requires source');
      const strs = [...this.src.evalStream({finite: true})].map(a => a.evalAtom(S));
      const sep = this.args[0] ? this.args[0].evalAtom(S) : '';
      return new Atom(strs.join(sep));
    }
  }
});

mainReg.register('ord', {
  source: true,
  maxArg: 1,
  prepare: function(scope) {
    const nnode = this.prepareAll(scope);
    const c = nnode.src.evalAtom(S);
    if(nnode.args[0]) {
      const abc = [...nnode.args[0].evalStream({finite: true})].map(a => a.evalAtom(S));
      const ix = abc.indexOf(c);
      if(ix < 0)
        throw new StreamError(`character "${c}" not in list`);
      else
        return new Atom(ix + 1);
    } else {
      const cp = c.codePointAt(0);
      if(c !== String.fromCodePoint(cp))
        throw new StreamError(`expected single character, got "${c}"`);
      return new Atom(c.codePointAt(0));
    }
  }
});

mainReg.register('chr', {
  source: true,
  maxArg: 1,
  prepare: function(scope) {
    const nnode = this.prepareAll(scope);
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
  prepare: function(scope) {
    const nnode = this.prepareAll(scope);
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
  prepare: function(scope) {
    const str = this.prepareAll(scope).src.evalAtom(S);
    return new Atom(str.toLowerCase());
  }
});

mainReg.register('ucase', {
  source: true,
  numArg: 0,
  prepare: function() {
    const str = this.prepareAll(scope).src.evalAtom(S);
    return new Atom(str.toUpperCase());
  }
});

mainReg.register('abc', {
  source: false,
  numArg: 0,
  eval: function() {
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
