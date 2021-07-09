import {StreamError} from '../errors.js';
import {Node, Atom, Block, Stream, types, debug, compareStreams} from '../base.js';
import {ord} from './string.js';
import R from '../register.js';
import {catg} from '../help.js';

R.register(['iota', 'seq'], {
  reqSource: false,
  maxArg: 2,
  eval() {
    const start = this.args[0] ? this.args[0].evalNum() : 1n;
    const step = this.args[1] ? this.args[1].evalNum() : 1n;
    let i = start;
    return new Stream(this,
      (function*() {
        for(;;) {
          yield new Atom(i);
          i += step;
        }
      })(),
      {
        skip: c => i += c * step,
        len: null
      }
    );
  },
  help: {
    en: ['A stream of consecutive numbers. If `from` or `step` are not given, they default to 1.'],
    cz: ['Posloupnost čísel s daným začátkem a krokem. Pokud `from` nebo `step` nejsou dány, výchozí hodnota pro obě je 1.'],
    cat: [catg.sources, catg.numbers],
    ex: [['iota', '[1,2,3,4,5,...]'], ['iota(0,2)', '[0,2,4,6,8,...]']],
    args: ['from?,step?']
  }
});

R.register(['range', 'ran', 'rng', 'r'], {
  reqSource: false,
  minArg: 1,
  maxArg: 3,
  eval() {
    const [min, max] = this.args[0] && this.args[1]
      ? [this.args[0].evalAtom([types.N, types.S]), this.args[1].evalAtom([types.N, types.S])]
      : [1n, this.args[0].evalNum()];
    const step = this.args[2] ? this.args[2].evalNum() : 1n;
    if(typeof min !== typeof max)
      throw new StreamError(`min ${Atom.format(min)}, max ${Atom.format(max)} of different types`);
    if(typeof min === 'bigint') {
      let i = min;
      return new Stream(this,
        (function*() {
          while(step >= 0n ? i <= max : i >= max) {
            yield new Atom(i);
            i += step;
          }
        })(),
        {
          skip: c => i += c * step,
          len: step !== 0n
            ? (a => a >= 0n ? a : 0n)((max - min) / step + 1n)
            : null
        }
      );
    } else {
      const minCP = BigInt(ord(min));
      const maxCP = BigInt(ord(max));
      let i = minCP;
      return new Stream(this,
        (function*() {
          while(step >= 0n ? i <= maxCP : i >= maxCP) {
            yield new Atom(String.fromCodePoint(Number(i)));
            i += step;
          }
        })(),
        {
          skip: c => i += c * step,
          len: step !== 0n
            ? (a => a >= 0n ? a : 0n)((maxCP - minCP) / step + 1n)
            : null
        }
      );
    }
  },
  help: {
    en: [
      'A finite stream of consecutive numbers. If `from` or `step` are not given, they default to 1.',
      '-If `to` is less (greater) than `from` with a positive (negative) `step`, the stream is empty. If `step` is 0, it is infinite.',
      '-Also works with single characters, in which case `from` can not be omitted. `step` is numeric. The sequence runs in Unicode code points.'],
    cz: [
      'Posloupnost čísel s daným začátkem, koncem a krokem. Pokud `from` nebo `step` nejsou dány, výchozí hodnota pro obě je 1.',
      '-Jestliže `to` je menší (větší) než `from` a `step` kladné (záporné), vrátí prázdný proud. Jestliže `step` je 0, nekonečný.',
      '-Také funguje se znaky místo čísel. `from` potom nesmí být vynecháno. `step` je číslo. Počítá se v Unicode kódových bodech.'],
    cat: [catg.sources, catg.strings, catg.numbers],
    ex: [['range(5)', '[1,2,3,4,5]'], ['range("α","γ")', '["α","β","γ"]'], ['range(5,1,-2)', '[5,3,1]']],
    args: 'from?,to,step?'
  }
});

R.register(['length', 'len'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    if(sIn.type === types.stream) {
      sIn.checkFinite();
      let len = 0n;
      if(typeof sIn.len === 'bigint')
        len = sIn.len;
      else {
        for(const i of sIn)
          len++;
      }
      return new Atom(len);
    } else if(sIn.type === types.S) {
      return new Atom(sIn.value.length);
    }
  },
  help: {
    en: ['Returns the number of elements in the source stream.',
      'Also works for strings, where it gives the number of characters.',
      '-For counting characters with a custom alphabet, use `"...".split(abc).length`.'],
    cz: ['Počet prvků vstupního proudu.',
      'Funguje také pro řetězce, kde vrátí počet znaků.',
      '-Pro počet znaků dle upravené abecedy použijte `"...".split(abc).length`.'],
    cat: [catg.streams, catg.strings],
    ex: [['`range`(1,10,3).length', '4'], ['"string".length', '6']]
  }
});

R.register('first', {
  reqSource: true,
  maxArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    if(this.args[0]) {
      const l = this.args[0].evalNum({min: 1n});
      let i = 0n;
      return new Stream(this,
        (function*() {
          while(i++ < l) {
            const r = sIn.next().value;
            if(!r)
              return;
            yield r;
          }
        })(),
        { len: sIn.len === undefined ? undefined
            : sIn.len === null ? l
            : sIn.len >= l ? l
            : sIn.len }
      );
    } else {
      const r = sIn.next().value;
      if(!r)
        throw new StreamError('empty stream');
      else
        return r.eval();
    }
  },
  help: {
    en: ['Returns the first element of the source stream.',
      'The 1-argument form returns `_count` first elements.'],
    cz: ['Vrátí první prvek vstupního proudu.',
      'Forma s argumentem vrátí `_count` prvních prvků.'],
    args: 'count?',
    cat: catg.streams,
    ex: [['`iota`.first', '1'], ['`primes`.first(5)', '[2,3,5,7,11]']],
    see: ['last', 'take', 'drop', 'prefix']
  }
});

R.register('last', {
  reqSource: true,
  maxArg: 1,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    if(this.args[0]) {
      const len = this.args[0].evalNum({min: 1n});
      let l = [];
      if(sIn.len === undefined) {
        for(const v of sIn) {
          l.push(v);
          if(l.length > len)
            l.shift();
        }
        return new Stream(this, l.values(), {len: BigInt(l.length)});
      } else if(sIn.len !== null) {
        if(sIn.len > len) {
          sIn.skip(sIn.len - len);
          sIn.len = len;
        }
        return sIn;
      } else if(sIn.len === null) {
        throw new Error('assertion failed');
      }
    } else {
      let l;
      if(sIn.len === undefined) {
        for(const v of sIn)
          l = v;
      } else if(sIn.len === null) {
        throw new Error('assertion failed');
      } else if(sIn.len !== 0n) {
        sIn.skip(sIn.len - 1n);
        ({value: l} = sIn.next());
      }
      if(!l)
        throw new StreamError('empty stream');
      else
        return l.eval();
    }
  },
  help: {
    en: ['Returns the last element of the source stream.',
      'The 1-argument form returns `_count` last elements.'],
    cz: ['Vrátí poslední prvek vstupního proudu.',
      'Forma s argumentem vrátí `_count` posledních prvků.'],
    args: 'count?',
    cat: catg.streams,
    ex: [
      ['`range`(1,10,4).last', '9'],
      ['range(100).last(3)', '[98,99,100]'],
      ['`pi`.last', '!infinite stream']],
    see: ['first', 'droplast', 'postfix']
  }
});

function takedrop(sIn, iter) {
  return (function*() {
    let take = true;
    for(const num of iter) {
      if(take) {
        for(let i = 0n; i < num; i++) {
          const r = sIn.next().value;
          if(!r)
            return;
          yield r;
        }
      } else
        sIn.skip(num);
      take = !take;
    }
    if(take)
      yield* sIn;
  })();
}

R.register(['take', 'takedrop', 'td'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom))
      return new Stream(this,
        takedrop(sIn, ins.map(i => i.numValue({min: 0n}))));
    else if(this.args.length > 1)
      throw new StreamError('required list of values or a single stream');
    return new Stream(this,
      takedrop(sIn, (function*() {
        for(const s of ins[0])
          yield s.evalNum({min: 0n});
      })())
    );
  },
  help: {
    en: ['Takes n1 elements, drops n2, etc.',
      'If the last instruction is take, terminates there, otherwise, leaves the rest of the stream.'],
    cz: ['Vypíše n1 prvků, pak n2 ignoruje atd.',
      'Jestliže poslední instrukce je brát, skončí po ní. Jestliže zahodit, vypíše i celý zbytek vstupu.'],
    cat: catg.streams,
    args: 'n1,n2,...',
    ex: [['`iota`.take(5)', '[1,2,3,4,5]'],
      ['iota.take(2,5)', '[1,2,8,9,10,11,...]'],
      ['iota.take([1,2].`cycle`)', '[1,4,7,10,...]']],
    see: 'drop'
  }
});

R.register(['drop', 'droptake', 'dt'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom))
      return new Stream(this,
        takedrop(sIn, [0n, ...ins.map(i => i.numValue({min: 0n}))]));
    else if(this.args.length > 1)
      throw new StreamError('required list of values or a single stream');
    return new Stream(this,
      takedrop(sIn, (function*() {
        yield 0n;
        for(const s of ins[0])
          yield s.evalNum({min: 0n});
      })())
    );
  },
  help: {
    en: ['Drops n1 elements, takes n2, etc.',
      'If the last instruction is take, terminates there, otherwise, leaves the rest of the stream.'],
    cz: ['Zahodí n1 prvků, pak n2 vypíše atd.',
      'Jestliže poslední instrukce je brát, skončí po ní. Jestliže zahodit, vypíše i celý zbytek vstupu.'],
    cat: catg.streams,
    args: 'n1,n2,...',
    ex: [['`iota`.drop(5)', '[6,7,8,9,10,...]'],
      ['`iota`.drop(5,2)', '[6,7]'],
      ['iota.drop([1,2].`cycle`)', '[2,3,5,6,8,...]']],
    see: ['take', 'droplast']
  }
});

R.register(['droplast', 'dl'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const num = this.args[0] ? this.args[0].evalNum({min: 1n}) : 1n;
    let l = [];
    return new Stream(this,
      (function*() {
        for(const v of sIn) {
          l.push(v);
          if(l.length > num)
            yield l.shift();
        }
      })(),
      {
        len: sIn.len === undefined ? undefined
          : sIn.len === null ? null
          : sIn.len >= num ? sIn.len - num
          : 0n
      });
  },
  help: {
    en: ['Drops `_count` last elements. If `_count` is not given, it defaults to 1.'],
    cz: ['Zahodí `_count` posledních prvků. Jestliže `_count` není uveden, zahodí jeden.'],
    args: 'count?',
    cat: catg.streams,
    ex: [['`range`(5).droplast', '[1,2,3,4]']],
    see: 'drop'
  }
});

R.register(['reverse', 'rev'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    if(sIn.type === types.stream) {
      sIn.checkFinite();
      const vals = [...sIn].reverse();
      return new Stream(this,
        vals.values(),
        {len: BigInt(vals.length)}
      );
    } else if(sIn.type === types.S) {
      return new Atom([...sIn.value].reverse().join(''));
    }
  },
  help: {
    en: ['Returns the input stream or string in reverse.'],
    cz: ['Vrátí vstupní proud nebo řetězec v obráceném pořadí.'],
    cat: [catg.streams, catg.strings],
    ex: [['1024.`todigits`.reverse', '[4,2,0,1]'], ['1024.`tobase`(10).reverse', '"4201"']]
  }
});

R.register(['repeat', 'rep'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const src = this.src;
    if(this.args[0]) {
      const num = this.args[0].evalNum({min: 0n});
      let i = 0n;
      return new Stream(this,
        (function*() { while(i++ < num) yield src; })(),
        {
          skip: c => i += c,
          len: num
        }
      );
    } else {
      return new Stream(this,
        (function*() { for(;;) yield src; })(),
        {
          skip: () => {},
          len: null
        }
      );
    }
  },
  help: {
    en: ['Returns a stream made of a finite or infinite number of copies of `_source`.'],
    cz: ['Vrátí proud konečně nebo nekonečně mnoha kopií `_source`'],
    cat: catg.streams,
    src: 'source',
    args: 'count?',
    ex: [['"a".repeat', '["a","a","a","a",...]'],
      ['[1,2].repeat(3)', '[[1,2],[1,2],[1,2]]']],
    see: 'cycle'
  }
});

R.register(['cycle', 'cc'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const src = this.src;
    if(this.args[0]) {
      const num = this.args[0].evalNum({min: 0n});
      const ev = src.evalStream();
      return new Stream(this,
        (function*() {
          for(let i = 0n; i < num; i++)
            yield* src.evalStream();
        })(),
        {
          len: ev.len === null ? null
            : ev.len === undefined ? undefined
            : ev.len * num
        }
      );
    } else {
      let ev = src.evalStream();
      return new Stream(this,
        (function*() {
          for(;;) {
            yield* ev;
            ev = src.evalStream();
          }
        })(),
        {
          len: ev.len === undefined ? undefined
            : ev.len === 0n ? 0n : null
        }
      );
    }
  },
  help: {
    en: ['Returns a stream obtained by reading `_source` repeatedly from beginning to end.'],
    cz: ['Vrátí proud vzniklý opakovaným čtením `_source` od začátku do konce.'],
    cat: catg.streams,
    src: 'source',
    args: 'count?',
    ex: [['[1,2].cycle', '[1,2,1,2,1,2,1,2,...]'],
      ['[1,2].cycle(3)', '[1,2,1,2,1,2]']],
    see: 'repeat'
  }
});

R.register(['group', 'g'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    let lFun;
    let len;
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom)) {
      if(this.args.length === 1) {
        const l = ins[0].numValue({min: 0n});
        lFun = (function*() { for(;;) yield l; })();
        len = sIn.len === null ? null
          : sIn.len === undefined ? undefined
          : l === 0n ? null
          : (sIn.len + l - 1n) / l;
      } else
        lFun = ins.map(i => i.numValue({min: 0n}));
    } else {
      if(this.args.length > 1)
        throw new StreamError('required list of values or a single stream');
      else {
        lFun = (function*() {
          for(const s of ins[0])
            yield s.evalNum({min: 0n});
        })();
      }
    }
    const token = this.token;
    return new Stream(this,
      (function*() {
        for(const len of lFun) {
          const arr = [];
          for(let i = 0n; i < len; i++) {
            const r = sIn.next().value;
            if(!r)
              break;
            arr.push(r);
          }
          // Yield empty group if asked to, but don't output trailing [] on EOI
          if(arr.length > 0n || len === 0n)
            yield new Node('array', token, null, arr, {});
          if(arr.length < len)
            break;
        }
      })(),
      {len}
    );
  },
  help: {
    en: [
      'Splits `_source` into groups of given lengths.',
      'One or more lengths may be given, or a stream.',
      '-If a list of lengths is given, the stream finishes after the last group.'],
    cz: [
      'Rozdělí `_source` na skupiny po daných počtech prvků.',
      'Specifikace může zahrnovat jeden nebo několik indexů, nebo sama být proudem.',
      '-Jestliže jsou délky dány seznamem, proud skončí po poslední skupině.'],
    cat: catg.streams,
    ex: [
      ['`iota`.group(3)', '[[1,2,3],[4,5,6],[7,8,9],...]'],
      ['iota.group(3,2)', '[[1,2,3],[4,5]]'],
      ['iota.group(iota)', '[[1],[2,3],[4,5,6],...]']],
    src: 'source'
  }
});

R.register(['flatten', 'fl'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const depth = this.args[0] ? this.args[0].evalNum() : null;
    const node = this;
    return new Stream(this,
      (function*() {
        const r = node.src.eval();
        if(r.isAtom)
          yield r;
        else for(const s of node.src.eval()) {
          if(s.isAtom || depth === 0n)
            yield s;
          else {
            const tmp = depth !== null
              ? new Node('flatten', node.token, s, [new Atom(depth - 1n)])
              : new Node('flatten', node.token, s);
            yield* tmp.eval();
          }
        }
      })()
    );
  },
  help: {
    en: ['Flattens all stream elements of `_source`.',
      'If `_depth` is given, flattens only up to that depth.'],
    cz: ['Zploští všechny prvky `_source`, které jsou samy proudy, do jednoho dlouhého proudu.',
      'Jestliže je dáno `_depth`, zploští vnořené proudy pouze do této hloubky.'],
    cat: catg.streams,
    ex: [['[1].`nest`([#]).flatten', '[1,1,1,1,1,1,...]'],
      ['[1].nest([#]).flatten(3)', '[1,1,1,[1],[[1]],...']]
  }
});

R.register(['padleft', 'pl'], {
  reqSource: true,
  numArg: 2,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    const len = this.args[0].evalNum({min: 0n});
    if(sIn.type === types.stream) {
      const arr = [];
      let i = 0n;
      for(const r of sIn) {
        arr.push(r);
        if(++i == len)
          break;
      }
      const fill = this.args[1];
      return new Stream(this,
        (function*() {
          for(; i < len; i++)
            yield fill;
          yield* arr;
          yield* sIn;
        })(),
        {
          len: typeof sIn.len === 'bigint' && sIn.len < len ? len : sIn.len
        }
      );
    } else {
      const fill = this.args[1].evalAtom(types.S);
      return new Atom(sIn.value.padStart(Number(len), fill));
    }
  },
  help: {
    en: ['If the input stream is shorter than `_length`, extends to this length by adding copies of `_pad` at the beginning.', 'Also works with strings.'],
    cz: ['Jestliže vstup je kratší než `_length`, rozšíří jej na tuto délku přidáním kopií `_pad` na začátek.', 'Funguje také s řetězci.'],
    cat: [catg.streams, catg.strings],
    args: 'length,pad',
    ex: [['`range`(3).padleft(5,0)', '[0,0,1,2,3]'],
      ['12.`str`.padleft(5," ")', '"   12"']]
  }
});

R.register(['padright', 'pr'], {
  reqSource: true,
  numArg: 2,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    const len = this.args[0].evalNum({min: 0n});
    const fill = this.args[1];
    if(sIn.type === types.stream) {
      return new Stream(this,
        (function*() {
          let i = 0n;
          for(const r of sIn) {
            yield r;
            i++;
          }
          for(; i < len; i++)
            yield fill;
        })(),
        {
          len: (typeof sIn.len === 'bigint' && sIn.len < len) ? len : sIn.len
        }
      );
    } else {
      const fillStr = fill.evalAtom(types.S);
      return new Atom(sIn.value.padEnd(Number(len), fillStr));
    }
  },
  help: {
    en: ['If the input stream is shorter than `_length`, extends to this length by adding copies of `_pad` at the end.', 'Also works with strings.'],
    cz: ['Jestliže vstup je kratší než `_length`, rozšíří jej na tuto délku přidáním kopií `_pad` na konec.', 'Funguje také s řetězci.'],
    cat: [catg.streams, catg.strings],
    args: 'length,pad',
    ex: [['`range`(5).`group`(3).padright(5,[])', '[[1,2,3],[4,5],[],[],[]]'],
      ['12.`str`.padright(5,"_")', '"12___"']]
  }
});

R.register(['prepend', 'prep'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const args = this.args.map(arg => arg.eval());
    args.push(this.src.eval());
    const lens = args.map(arg => arg.isAtom ? 1n : arg.len);
    const len = lens.some(len => len === undefined) ? undefined
      : lens.some(len => len === null) ? null
      : lens.reduce((a,b) => a+b);
    return new Stream(this,
      (function*() {
        for(const arg of args) {
          if(arg.isAtom)
            yield arg;
          else
            yield* arg;
        }
      })(),
      {len}
    );
  },
  help: {
    en: ['Returns a stream formed by concatenating all the arguments, followed by the input stream.', 'Non-stream values are treated the same way as in `join`.'],
    cz: ['Vrátí proud vzniklý navázáním všech argumentů a nakonec vstupu.', 'S argumenty, které nejsou proudy, nakládá stejně jako `join`.'],
    cat: catg.streams,
    ex: [['1.`nest`(#*2).prepend(0)', '[0,1,2,4,8,16,...]']],
    see: 'append'
  }
});

R.register(['append', 'app'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const args = this.args.map(arg => arg.eval());
    args.unshift(this.src.eval());
    const lens = args.map(arg => arg.isAtom ? 1n : arg.len);
    const len = lens.some(len => len === undefined) ? undefined
      : lens.some(len => len === null) ? null
      : lens.reduce((a,b) => a+b);
    return new Stream(this,
      (function*() {
        for(const arg of args) {
          if(arg.isAtom)
            yield arg;
          else
            yield* arg;
        }
      })(),
      {len}
    );
  },
  help: {
    en: ['Returns a stream formed by concatenating the input streams with all the arguments.', 'Non-stream values are treated the same way as in `join`.'],
    cz: ['Vrátí proud vzniklý navázáním vstupu a všech argumentů.', 'S argumenty, které nejsou proudy, nakládá stejně jako `join`.'],
    cat: catg.streams,
    ex: [['16.`nest`(#/2).`while`(#>0).append(0)', '[16,8,4,2,1,0]']],
    see: 'prepend'
  }
});

R.register('nest', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    let curr = this.src;
    const body = this.args[0].checkType([types.symbol, types.expr]);
    return new Stream(this,
      (function*() {
        for(;;) {
          yield curr;
          curr = body.prepare({src: curr});
        }
      })(),
      {len: null}
    );
  },
  help: {
    en: ['Returns the results of iterative applications of `_body` on `_init`.'],
    cz: ['Vrátí výsledky iterovaného použití `_body` na `_init`.'],
    cat: catg.streams,
    ex: [['10.nest(`if`(`odd`,3*#+1,#/2)) ;Collatz sequence', '[10,5,16,8,4,2,1,...]'],
      ['"caesar".nest(`shift`(1,`abc`))', '["caesar","dbftbs","ecguct",...]']],
    src: 'init',
    args: 'body'
  }
});

R.register('fold', {
  reqSource: true,
  minArg: 1,
  maxArg: 3,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const bodyMem = this.args[0].checkType([types.symbol, types.expr]);;
    const bodyOut = this.args.length === 3
      ? this.args[1].checkType([types.symbol, types.expr])
      : bodyMem;
    let curr;
    if(this.args.length > 1)
      curr = this.args[this.args.length - 1].prepare({src: this.src});
    return new Stream(this,
      (function*() {
        for(const next of sIn) {
          const val = curr ? bodyOut.apply([curr, next]) : next;
          curr = bodyMem === bodyOut ? val : bodyMem.apply([curr, next]);
          yield val;
        }
      })(),
      {len: sIn.len}
    );
  },
  help: {
    en: ['Returns the results of iterative applications of `_body` on the previous result and the next element of `_source`.',
      'If `_init` is given, it is used as the initial value rather than the first element of `_source`.',
      'If three arguments are given, the value of `_bodyOut` is output (but `_body` kept for subsequent evaluation).',
      '-The input values are used as arguments to `_body`. You can use a plain symbol or a block, where they are accessed as `#1`, `#2`.'],
    cz: ['Vrátí výsledky iterovaného použití `_body` na předchozí výsledek a nový prvek ze `_source`.',
      'Jestliže je dán argument `_init`, je použit jako počáteční hodnota, jinak je jí první prvek `_source`.',
      'Jestliže jsou dány tři argumenty, výstup tvoří hodnoty `_bodyOut` (ale pro další výpočet je použit výsledek `_body`).',
      '-Zpracovávané hodnoty jsou do `_body` vloženy jako argumenty. Můžete použít samotný symbol nebo blok, v němž jsou pak viditelné jako `#1`, `#2`.'],
    cat: catg.streams,
    ex: [['`iota`.fold(`times`)', '[1,2,6,24,120,...]'],
      ['iota.fold([#1,#2])', '[1,[1,2],[[1,2],3],...]']],
    src: 'source',
    args: 'body,bodyOut??,init?'
  }
});

/*R.register('xfold', {
  reqSource: true,
  numArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const body = this.args[0].checkType([types.symbol, types.expr]);;
    let curr = this.args[1].prepare({src: this.src});
    return new Stream(this,
      (function*() {
        for(const next of sIn) {
          const ret = body.apply([curr, next]).evalStream();
          const add = ret.next().value?.evalStream();
          curr = ret.next().value;
          if(!add || !curr || !ret.next().done)
            throw new StreamError('body must return in the format [[add...], mem]');
          yield* add;
        }
        yield curr;
      })()
    );
  }
});*/

/*R.register('xlate', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const body = this.args[0].checkType([types.symbol, types.expr]);;
    return new Stream(this,
      (function*() {
        for(const value of sIn) {
          const add = body.prepare({src: value}).evalStream();
          yield* add;
        }
      })()
    );
  },
  help: {
    en: ['Works like `foreach` but expects `_body` to return streams, which are concatenated in the output.'],
    cz: ['Funguje podobně jako `foreach`, ale `_body` musí vracet proudy. Ty jsou pak ve výstupu napojeny.'],
    cat: catg.streams,
    ex: [['iota.xlate(if(odd,[#,#,#],[]))', '[1,1,1,3,3,3,5,...]']],
    src: 'source',
    args: 'body'
  }
});*/

R.register('reduce', {
  reqSource: true,
  minArg: 1,
  maxArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const body = this.args[0].checkType([types.symbol, types.expr]);;
    let curr;
    if(this.args.length > 1)
      curr = this.args[this.args.length - 1].prepare({src: this.src});
    for(const next of sIn)
      curr = curr ? body.apply([curr, next]) : next;
    if(!curr)
      throw new StreamError('empty stream');
    return curr.eval();
  },
  help: {
    en: ['Returns the result of `_body(...(_body(_body(_init,_source[1]),_source[2]),...)`.',
      'Equivalent to `_source.fold(_body,_init?).last`.'],
    cz: ['Vrátí hodnotu `_body(...(_body(_body(_init,_source[1]),_source[2]),...)`.',
      'Ekvivalentní `_source.fold(_body,_init?).last`.'],
    cat: catg.streams,
    ex: [['`lt`.`over`([1,3,5],[2,4,5])', '[true,true,false]'],
      ['$.reduce(`and`)', 'false']],
    src: 'source',
    args: 'body,init?',
    see: ['total', 'product']
  }
});

R.register('recur', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const body = this.args[0].checkType([types.symbol, types.expr]);
    return new Stream(this,
      (function*() {
        let prev = [...sIn];
        yield* prev;
        prev = prev.reverse();
        for(;;) {
          const next = body.apply(prev);
          yield next;
          prev = prev.slice(0, -1);
          prev.unshift(next);
        }
      })(),
      {len: null}
    );
  },
  help: {
    en: ['Keeping n last entries, iteratively applies `_body` on them.',
      'Back-references are indexed in reverse: `#1` refers to the most recent entry.'],
    cz: ['Udržuje n posledních prvků a iterativně na ně aplikuje `_body`.',
      '`#1` odkazuje na aktuálně nejnovější prvek, `#2` jemu předchozí atd.'],
    cat: catg.streams,
    src: '[a1,a2,...,an]',
    args: 'body',
    ex: [['[1,1].recur(plus) ;Fibonacci', '[1,1,2,3,5,8,13,21,...]']]
  }
});

R.register('map2', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const body = this.args[0].checkType([types.symbol, types.expr]);
    return new Stream(this,
      (function*() {
        let prev;
        for(const curr of sIn) {
          if(!prev) {
            prev = curr;
            continue;
          }
          const val = body.apply([prev, curr]);
          prev = curr;
          yield val;
        }
      })(),
      {
        len: typeof sIn.len === 'bigint' && sIn.len > 0n ? sIn.len - 1n : sIn.len
      }
    );
  },
  help: {
    en: ['Applies `_body` on pairs of consecutive values from `_source` as arguments `#1`, `#2`.'],
    cz: ['Aplikuje `_body` na dvojice sousedních prvků `_source` jakožto argumenty `#1`, `#2`.'],
    cat: catg.streams,
    src: 'source',
    args: 'body',
    ex: [['[1,4,2,3].map2(`range`(#1,#2,`if`(#2>#1,1,-1)))', '[[1,2,3,4],[4,3,2],[2,3]]'],
      ['[1,5,9,7,2].map2(`lt`)', '[true,true,false,false]'],
      ['[1,10,20,60].map2(#2/#1)', '[10,2,3]']],
    see: 'diff'
  }
});

R.register('if', {
  numArg: 3,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    const pnode = this.modify({src, args}).check(scope.partial);
    if(scope.partial)
      return pnode;
    else {
      const val = pnode.args[0].prepare({...scope, src}).evalAtom('boolean');
      return pnode.args[val ? 1 : 2].prepare({...scope, src});
    }
  },
  help: {
    en: ['Evaluates first argument as a boolean value. If this produces `true`, returns second, if `false`, third argument.',
      '-The unused argument needs not give a valid stream.'],
    cz: ['Vyhodnotí první argument jako pravdivostní hodnotu. Jestliže je `true`, vrátí druhý argument, jestliže `false`, třetí.',
      '-Nepoužitý argument nemusí dávat validní proud.'],
    cat: catg.base,
    args: 'test,iftrue,iffalse',
    ex: [['[3,"a"]:if(`isnumber`,`range`(#),#.`ord`)', '[[1,2,3],97]']]
  }
});

R.register(['select', 'sel', 'filter', 'where'], {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const cond = this.args[0];
    return new Stream(this,
      (function*() {
        for(const value of sIn) {
          if(cond.prepare({src: value}).evalAtom('boolean'))
            yield value;
        }
      })()
    );
  },
  help: {
    en: ['Keeps only those entries of `_source` for which `_condition` evaluates to `true`.'],
    cz: ['Ponechá pouze ty prvky `_source`, pro které se podmínka `_condition` vyhodnotí na `true`.'],
    cat: catg.streams,
    src: 'source',
    args: 'condition',
    ex: [['`iota`.where(#.`factor`.`length`=2) ;products of two primes', '[4,6,9,10,14,15,21,...]'],
      ['"one two three".`split`.select(#<>" ").`cat`', '"onetwothree"']]
  }
});

R.register(['iwhere', 'ixwhere'], {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const cond = this.args[0];
    return new Stream(this,
      (function*() {
        let i = 1;
        for(const value of sIn) {
          if(cond.prepare({src: value}).evalAtom('boolean'))
            yield new Atom(i);
          ++i;
        }
      })()
    );
  },
  help: {
    en: ['Returns a sequence of positions of entries of `_source` for which `_condition` evaluates to `true`.'],
    cz: ['Vrátí posloupnost pozic prvků `_source`, pro které se podmínka `_condition` vyhodnotí na `true`.'],
    cat: catg.streams,
    src: 'source',
    args: 'condition',
    ex: [['"a1b2c3".`split`.iwhere(`isdigit`)', '[2,4,6]']]
  }
});

R.register('while', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const cond = this.args[0];
    return new Stream(this,
      (function*() {
        for(const value of sIn) {
          if(cond.prepare({src: value}).evalAtom('boolean'))
            yield value;
          else
            return;
        }
      })()
    );
  },
  help: {
    en: ['Returns elements of `_source` as long as `_condition` evaluates to `true`.'],
    cz: ['Vrací prvky `_source`, dokud se podmínka `_condition` vyhodnocuje na `true`.'],
    cat: catg.streams,
    src: 'source',
    args: 'condition',
    ex: [['primes.while(#<30)', '[2,3,5,7,11,13,17,19,23,29]']]
  }
});

function numCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const strCompare = Intl.Collator().compare;

function usort(arr, fn = x => x) {
  if(arr.length === 0)
    return arr;
  const first = fn(arr[0]).checkType([types.N, types.S]);
  if(first.type === types.N) {
    arr.forEach(a => fn(a).checkType(types.N));
    arr.sort((a, b) => numCompare(fn(a).value, fn(b).value));
  } else if(first.type === types.S) {
    arr.forEach(a => fn(a).checkType(types.S));
    arr.sort((a, b) => strCompare(fn(a).value, fn(b).value));
  }
}

R.register('sort', {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    if(this.args[0]) {
      const temp = [...sIn].map(s => [s, this.args[0].prepare({src: s}).eval()]);
      usort(temp, x => x[1]);
      const vals = temp.map(x => x[0]);
      return new Stream(this,
        vals.values(),
        {len: BigInt(vals.length)}
      );
    } else {
      const vals = [...sIn].map(s => s.eval());
      usort(vals);
      return new Stream(this,
        vals.values(),
        {len: BigInt(vals.length)}
      );
    }
  },
  help: {
    en: ['Loads the input stream in full and returns sorted.',
      'In the 1-argument form, the sorting key is obtained by applying `_body` on the elements of `_source`.',
      '!The values to be compared must be either all numeric or all strings.'],
    cz: ['Načte celý vstupní proud a vrátí seřazený.',
      'Pokud je poskytnuto `_body`, řadicí klíč se získá jeho použitím na každý prvek `_source`.',
      '!Řazené hodnoty musejí být buď všechny čísla nebo všechny řetězce.'],
    cat: [catg.streams, catg.strings, catg.numbers],
    src: 'source',
    args: 'body?',
    ex: [['[2,5,1,3].sort', '[1,2,3,5]'],
      ['"a bcd ef ghi".split(" ").sort(length)', '["a","ef","bcd","ghi"]']]
  }
});

R.register(['ddup', 'drep', 'dd'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    return new Stream(this,
      (function*() {
        let prev;
        for(const curr of sIn) {
          if(!prev || !compareStreams(curr, prev))
            yield curr;
          prev = curr;
        }
      })()
    );
  },
  help: {
    en: ['If the input stream contains repeated elements, outputs only one copy per run.'],
    cz: ['Jestliže vstupní proud obsahuje opakující se prvky, vypíše z každých takových po sobě jdoucích pouze jeden.'],
    cat: catg.streams,
    ex: [['[1,1,2,2,2,1].ddup', '[1,2,1]']],
    see: 'uniq'
  }
});

R.register('fixed', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    let prev;
    for(const curr of sIn) {
      if(prev && compareStreams(curr, prev))
        return curr.eval();
      prev = curr;
    }
    // not found
    throw new StreamError('no repeated element found');
  },
  help: {
    en: ['Scans the input stream for a direct repetition. Returns this repeated element.'],
    cz: ['Načítá vstupní proud, dokud se nenalezne stejná hodnota dvakrát za sebou. Tu pak vrátí.'],
    cat: catg.streams,
    ex: [['5.nest((#^2).mod(100000))', '[5,25,625,90625,90625,...]'],
      ['$.fixed', '90625']]
  }
});

R.register('index', {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    if(sIn.type === types.stream) {
      const ref = this.args[0];
      let i = 0;
      for(const r of sIn) {
        i++;
        if(compareStreams(r, ref))
          return new Atom(i);
      }
      // not found
      return new Atom(0);
    } else {
      const haystack = sIn.value;
      const needle = this.args[0].evalAtom(types.S);
      return new Atom(haystack.indexOf(needle) + 1);
    }
  },
  help: {
    en: ['Returns the position of the first entry of `_source` equal to `_value`, or 0 if not found.',
      '-If `_source` is a string, returns the position of the first substring `_value`.'],
    cz: ['Vrátí pozici prvního prvku `_source` rovného `_value`, nebo 0, pokud takový není nalezen.',
      '-`_source` také může být řetězec, pak vyhledá pozici výskytu podřetězce `_value`.'],
    cat: [catg.streams, catg.strings],
    src: 'source',
    args: 'value',
    ex: [['`primes`.index(17)', '7'],
      ['"abracadabra".index("cad")', '5'],
      ['"abc".index("z") ;not an error', '0']]
  }
});

R.register(['indexes', 'indices'], {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    if(sIn.type === types.stream) {
      const ref = this.args[0];
      return new Stream(this,
        (function*() {
          let i = 0;
          for(const r of sIn) {
            i++;
            if(compareStreams(r, ref))
              yield new Atom(i);
          }
        })()
      );
    } else {
      const haystack = sIn.value;
      const needle = this.args[0].evalAtom(types.S);
      return new Stream(this,
        (function*() {
          let start = 0;
          for(;;) {
            let curr = haystack.indexOf(needle, start);
            if(curr < 0)
              break;
            // else
            yield new Atom(curr + 1);
            start = curr + 1;
          }
        })()
      );
    }
  },
  help: {
    en: ['Returns a sequence of positions of entries of `_source` equal to `_value`.',
      '-If `_source` is a string, returns positions of substrings `_value`.'],
    cz: ['Vrátí posloupnost pozic prvků `_source` rovných `_value`.',
      '-`_source` také může být řetězec, pak vyhledá pozice výskytů podřetězce `_value`.'],
    cat: [catg.streams, catg.strings],
    src: 'source',
    args: 'value',
    ex: [['`pi`.indexes(0)', '[33,51,55,66,72,...]'],
      ['"test".indexes("t")', '[1,4]'],
      ['"aaaa".indexes("aa")', '[1,2,3]']]
  }
});

R.register('includes', {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const ref = this.args[0];
    let i = 0;
    for(const r of sIn) {
      i++;
      if(compareStreams(r, ref))
        return new Atom(true);
    }
    // not found
    return new Atom(false);
  },
  help: {
    en: ['Returns `true` if `_source` contains `_value`, `false` otherwise.'],
    cz: ['Vrátí `true`, pokud `_source` obsahuje `_value`, jinak `false`.'],
    cat: catg.streams,
    src: 'source',
    args: 'value',
    ex: [['"The quick brown fox".`lcase`.`split`.includes@["d","f"]', '[false,true]']],
    see: 'element'
  }
});

R.register('element', {
  reqSource: true,
  numArg: 1,
  eval() {
    const ref = this.src;
    const sArg = this.args[0].evalStream();
    let i = 0;
    for(const r of sArg) {
      i++;
      if(compareStreams(r, ref))
        return new Atom(true);
    }
    // not found
    return new Atom(false);
  },
  help: {
    en: ['Returns `true` if `_value` is found in `_stream`, `false` otherwise.'],
    cz: ['Vrátí `true`, pokud `_value` je nalezena ve `_stream`, jinak `false`.'],
    cat: catg.streams,
    src: 'value',
    args: 'stream',
    ex: [['"test string".`split`.`where`(element("aeiou".split))', '["e","i"]']],
    see: 'includes'
  }
});

R.register('count', {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const ref = this.args[0];
    let count = 0;
    for(const r of sIn) {
      if(compareStreams(r, ref))
        count++;
    }
    return new Atom(count);
  },
  help: {
    en: ['Returns the count of occurrences of `_value` in `_source`.'],
    cz: ['Vrátí počet výskytů prvku `_value` v proudu `_source`.'],
    cat: catg.streams,
    src: 'source',
    args: 'value',
    ex: [['"test string".`split`.count("t")', '3']]
  }
});

R.register(['counts', 'tally', 'freq'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const map = new Map();
    const fixed = (this.args.length !== 0);
    const vals = fixed ? [...this.args[0].evalStream({finite: true})] : [];
    const cnts = vals.map(_ => 0n);
    A: for(const r of sIn) {
      for(const ix of vals.keys())
        if(compareStreams(r, vals[ix])) {
          cnts[ix]++;
          continue A;
        }
      // not found
      if(!fixed) {
        vals.push(r);
        cnts.push(1n);
      }
    }
    const token = this.token;
    return new Stream(this,
      (function*() {
        for(const ix of vals.keys())
          yield new Node('array', token, null, [vals[ix], new Atom(cnts[ix])]);
      })(),
      {len: BigInt(vals.length)}
    );
  },
  help: {
    en: ['Counts occurrences of distinct elements in `_source`. Returns in the format `[[_value,_count],...]`.',
      'If a second argument is given, counts only those elements and returns them in the same order, otherwise in the order of first appearance.'],
    cz: ['Počítá výskyty různých prvků v `_source`. Vrací je ve formátu `[[hodnota,počet],...]`.',
      'Jestliže je poskytnut druhý argument, počítá pouze takové prvky, které se vyskytují v něm, a vrátí v daném pořadí. Jinak v pořadí prvního výskytu.'],
    cat: catg.streams,
    src: 'source',
    args: 'values?',
    ex: [['"abracadabra".`split`.counts', '[["a",5],["b",2],["r",2],["c",1],["d",1]]'],
      ['"abracadabra".split.counts(["a","b","c"])', '[["a",5],["b",2],["c",1]]']],
    see: 'unrle'
  }
});

R.register('uniq', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const set = new Set();
    return new Stream(this,
      (function*() {
        A: for(const r of sIn) {
          for(const s of set)
            if(compareStreams(r, s))
              continue A;
          // else
          set.add(r);
          yield r;
        }
      })()
    );
  },
  help: {
    en: ['Returns distinct elements from input stream, discarding any duplicities.'],
    cz: ['Vrátí pouze rozdílné prvky vstupního proudu, všechny duplicity jsou odstraněny.'],
    cat: catg.streams,
    ex: [['`binom`(7)', '[1,7,21,35,35,21,7,1]'],
      ['binom(7).uniq', '[1,7,21,35]']],
    see: 'ddup'
  }
});

R.register('rle', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    const token = this.token;
    return new Stream(this,
      (function*() {
        let prev;
        let count;
        for(const curr of sIn) {
          if(!prev) {
            count = 1;
          } else if(!compareStreams(curr, prev)) {
            yield new Node('array', token, null, [prev, new Atom(count)]);
            count = 1;
          } else
            count++;
          prev = curr;
        }
        yield new Node('array', token, null, [prev, new Atom(count)]);
      })()
    );
  },
  help: {
    en: ['Counts lengths of runs of equal elements of the input stream. Returns in the format `[[_value,_count],...]`.'],
    cz: ['Počítá délky segmentů opakování stejného prvku vstupního proudu. Vrací je ve formátu `[[hodnota,počet],...]`.'],
    cat: catg.streams,
    ex: [['[1,1,2,2,2,1].rle', '[[1,2],[2,3],[1,1]]'],
      ['10000.`factor`.rle', '[[2,4],[5,4]]']],
    see: 'unrle'
  }
});

R.register(['unrle', 'unfreq', 'untally'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    return new Stream(this,
      (function*() {
        for(const r of sIn) {
          const sInner = r.evalStream();
          const elm = sInner.next().value;
          const count = sInner.next().value.evalNum({min: 0n});
          const test = sInner.next().done;
          if(!test || !elm || count === undefined)
            throw new StreamError(`${r.toString}: not in RLE format`);
          for(let i = 0n; i < count; i++)
            yield elm;
        }
      })()
    );
  },
  help: {
    en: ['Expects the input in the format `[[_value,_count],...]`, as given by `counts` or `rle`. Repeats every `_value` `_count` times.'],
    cz: ['Očekává vstupní proud ve formátu `[[hodnota,počet],...]`, jak jej vrací `counts` nebo `rle`. Ve výstupu zopakuje každou `hodnotu` `počet`-krát.'],
    cat: catg.streams,
    ex: [['"abracadabra".`split`.`counts`("abc".split)', '[["a",5],["b",2],["c",1]]'],
      ['$.unrle.`cat`', '"aaaaabbc"']]
  }
});

R.register('isstream', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const c = nnode.src.eval();
    return new Atom(c.type === types.stream);
  },
  help: {
    en: ['Tests if `_input` is a stream. Returns `true` or `false`.'],
    cz: ['Testuje, zda `_input` je proudem. Vrací `true` nebo `false`.'],
    cat: catg.streams,
    src: 'input',
    ex: [['[1,[2,3,4],"abc"]:isstream', '[false,true,false]']]
  }
});

R.register('with', {
  minArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.slice();
    if(args.length) {
      const body = args.pop().prepare({...scope, src, register: undefined, partial: true});
      args.forEach((arg, ix) => {
        if(arg.token.value !== '=')
          throw new StreamError(`expected assignment, found ${arg.desc()}`);
        args[ix] = arg.toAssign().prepare({...scope, src, partial: true, expand: !scope.partial});
      });
      args.push(body);
    }
    const mod = {src: null, args};
    if(scope.register)
      mod.meta = {...this.meta, _register: scope.register};
    const pnode = this.modify(mod).check(scope.partial);
    if(debug)
      console.log(`prepare ${this.toString()} stage 1 => ${pnode.toString()}`);
    if(scope.partial)
      return pnode;
    else {
      const outerReg = pnode.meta._register;
      if(!outerReg)
        throw new Error('register not defined');
      const innerReg = outerReg.child();
      const args = pnode.args.slice();
      const body = args.pop();
      for(const arg of args)
        arg.prepare({register: innerReg}).eval();
      return body.prepare({...scope, register: innerReg});
    }
  },
  help: {
    en: ['Allows temporary assignments to be made for the scope of `_body`.',
      '-A symbol can refer to its outer value safely.',
      '-Useful for reusing a complicated subexpression or for binding the value of `#`, e.g., in `foreach`.'],
    cz: ['Umožňuje udělat dočasná přiřazení platná v rámci `_body`.',
      '-Symbol může bezpečně být předefinován pomocí své vnější hodnoty.',
      '-Užitečné pro stručné pojmenování komplikovaného podvýrazu nebo pro zachycení hodnoty `#`, například ve `foreach`.'],
    args: 'var=expr...,body',
    cat: catg.base,
    ex: [['[2,3,4]:with(a=#,[a,"abcdef".`split`(a)]) ;split(#) would not work here!', '[[2,["ab","cd","ef"]],[3,["abc","def"]],[4,["abcd","ef"]]]'],
      ['with(a=5,with(b=a*(a+1),c=a*(a-1),[b,c,b-c]))', '[30,20,10]']]
  }
});

/*R.register('longest', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    let maxS = null, maxL = -1n;
    for(const read of sIn) {
      const sRead = read.evalStream();
      let len = 0n;
      if(sRead.len === null) // infinite, auto winner
        return read.eval();
      else if(typeof sRead.len === 'bigint')
        len = sRead.len;
      else {
        for(const i of sRead)
          len++;
      }
      if(len > maxL) {
        maxL = len;
        maxS = read;
      }
    }
    if(maxS === null)
      throw new StreamError('empty stream');
    else
      return maxS.eval();
  },
  help: {
    en: ['Expects `_source` to be a stream of streams. Returns the longest of them. In case of a tie, the first of such length.'],
    cz: ['Očekává `_source` ve formě proudu tvořeného proudy. Vrátí nejdelší z nich. V případě více stejné délky, první z nich.'],
    src: 'source',
    cat: catg.streams,
  }
});

R.register('shortest', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    let minS = null, minL = null;
    for(const read of sIn) {
      const sRead = read.evalStream();
      let len = 0n;
      if(sRead.len === null)
        continue;
      else if(sRead.len === 0n) // can't be shorter
        return read.eval();
      else if(typeof sRead.len === 'bigint')
        len = sRead.len;
      else {
        for(const i of sRead)
          len++;
      }
      if(minL === null || len < minL) {
        minL = len;
        minS = read;
      }
    }
    if(minS === null)
      throw new StreamError('empty stream');
    else
      return minS.eval();
  }
});*/

R.register(['subs', 'subst', 'replace', 'repl'], {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const sSubs = this.args[0].evalStream({finite: true});
    const map = new Map();
    for(const r of sSubs) {
      const sTemp = r.evalStream();
      const key = sTemp.next().value;
      const val = sTemp.next().value;
      if(!key || !val || !(sTemp.next().done))
        throw new StreamError('substitutions not in the format [[a,b], ...]');
      if([...map.keys()].some(k => compareStreams(k, key)))
        throw new StreamError(`duplicate key ${key.toString()}`);
      map.set(key, val);
    }
    return new Stream(this,
      (function*() {
        A: for(const r of sIn) {
          for(const [key, val] of map)
            if(compareStreams(r, key)) {
              yield val;
              continue A;
            }
          // else
          yield r;
        }
      })(),
      {
        len: sIn.len,
        skip: sIn.skip
      }
    );
  },
  help: {
    en: ['Expects `_subs` in the format `[[_v1,_v2],...]`. Replaces occurrences of `_v1` by `_v2` in `_source`.',
      '-Character to character replacement in a string is easier using `tr`.'],
    cz: ['Očekává `_subs` ve formátu `[[_v1,_v2],...]`. Nahradí výskyty `_v1` v `_source` prvkem `_v2`.',
      '-Pro náhradu jednotlivých znaků v řetězci je snazší použít `tr`.'],
    cat: catg.streams,
    src: 'source',
    args: 'subs',
    ex: [['"abracadabra".`split`.subs([["a","aa"],["b",""]]).`cat`', '"aaraacaadaaraa"']],
    see: 'tr'
  }
});
