import {StreamError} from '../errors.js';
import {Node, Imm, Block, Stream, INF, types, debug, compareStreams} from '../base.js';
import {ord} from './string.js';
import R from '../register.js';
import {catg} from '../help.js';

R.register(['iota', 'seq'], {
  reqSource: false,
  maxArg: 2,
  eval() {
    const start = this.args[0] ? this.cast(this.args[0].eval(), types.N) : 1n;
    const step = this.args[1] ? this.cast(this.args[1].eval(), types.N) : 1n;
    return new Stream(this,
      _ => {
        let i = start;
        return [
          (function*() {
            for(;;) {
              yield new Imm(i);
              i += step;
            }
          })(),
          c => i += c * step
        ];
      },
      INF
    );
  },
  help: {
    en: ['A stream of consecutive numbers. If `from` or `step` are not given, they default to 1.'],
    cs: ['Posloupnost čísel s daným začátkem a krokem. Pokud `from` nebo `step` nejsou dány, výchozí hodnota pro obě je 1.'],
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
      ? [this.cast(this.args[0].eval(), [types.N, types.S]), this.cast(this.args[1].eval(), [types.N, types.S])]
      : [1n, this.cast(this.args[0].eval(), types.N)];
    const step = this.args[2] ? this.cast(this.args[2].eval(), types.N) : 1n;
    if(typeof min !== typeof max)
      throw new StreamError(`min ${Imm.format(min)}, max ${Imm.format(max)} of different types`);
    if(typeof min === 'bigint') {
      const length = step === 0n ? INF
        : (x => x >= 0n ? x : 0n)((max - min) / step + 1n);
      return new Stream(this,
        _ => {
          let i = min;
          return [
            (function*() {
              while(step >= 0n ? i <= max : i >= max) {
                yield new Imm(i);
                i += step;
              }
            })(),
            c => i += c * step
          ];
        },
        length
      );
    } else {
      const minCP = BigInt(ord(min));
      const maxCP = BigInt(ord(max));
      const length = step === 0n ? INF
        : (x => x >= 0n ? x : 0n)((maxCP - minCP) / step + 1n);
      return new Stream(this,
        _ => {
          let i = minCP;
          return [
            (function*() {
              while(step >= 0n ? i <= maxCP : i >= maxCP) {
                yield new Imm(String.fromCodePoint(Number(i)));
                i += step;
              }
            })(),
            c => i += c * step
          ];
        },
        length
      );
    }
  },
  help: {
    en: [
      'A finite stream of consecutive numbers. If `from` or `step` are not given, they default to 1.',
      '-If `to` is less (greater) than `from` with a positive (negative) `step`, the stream is empty. If `step` is 0, it is infinite.',
      '-Also works with single characters, in which case `from` can not be omitted. `step` is numeric. The sequence runs in Unicode code points.'],
    cs: [
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
    const src = this.cast0(this.src.eval(), [types.stream, types.S]);
    if(src.type === types.stream) {
      this.cast0(src, types.stream, {finite: true});
      let length = 0n;
      if(typeof src.length === 'bigint')
        length = src.length;
      else {
        for(const i of src.read())
          length++;
      }
      return new Imm(length);
    } else if(src.type === types.S) {
      return new Imm(src.value.length);
    }
  },
  help: {
    en: ['Returns the number of elements in the source stream.',
      'Also works for strings, where it gives the number of characters.',
      '-For counting characters with a custom alphabet, use `"...".split(_alphabet).length`.'],
    cs: ['Počet prvků vstupního proudu.',
      'Funguje také pro řetězce, kde vrátí počet znaků.',
      '-Pro počet znaků dle upravené abecedy použijte `"...".split(_alphabet).length`.'],
    cat: [catg.streams, catg.strings],
    ex: [['range(1,10,3).length', '4'], ['"string".length', '6'],
      ['"abc567def".split.select(isdigit).length', '3', {en: 'count elements with a given property', cs: 'spočítat prvky s danou vlastností'}]]
  }
});

R.register('first', {
  reqSource: true,
  maxArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    if(this.args[0]) {
      const count = this.cast(this.args[0].eval(), types.N, {min: 1n});
      const length = src.length === undefined ? undefined
        : src.length === INF ? count
        : src.length >= count ? count
        : src.length;
      return new Stream(this,
        _ => {
          const stm = src.read();
          let i = 0n;
          return [
            (function*() {
              while(i++ < count) {
                const val = stm.next().value;
                if(val)
                  yield val;
                else
                  return;
              }
            })(),
            c => {
              stm.skip(c);
              i += c;
            }
          ];
        },
        length
      );
    } else {
      const val = src.read().next().value;
      if(val)
        return val;
      else
        throw new StreamError('empty stream');
    }
  },
  help: {
    en: ['Returns the first element of the source stream.',
      'The 1-argument form returns `_count` first elements.'],
    cs: ['Vrátí první prvek vstupního proudu.',
      'Forma s argumentem vrátí `_count` prvních prvků.'],
    args: 'count?',
    cat: catg.streams,
    ex: [['iota.first', '1'], ['primes.first(5)', '[2,3,5,7,11]'],
      ['iota(1,3).select(isprime).first', '7', {en: 'first element with a given property', cs: 'první s danou vlastností'}]],
    see: ['last', 'take', 'drop', 'prefix']
  }
});

R.register('last', {
  reqSource: true,
  maxArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream, {finite: true});
    if(this.args[0]) {
      const count = this.cast(this.args[0].eval(), types.N, {min: 1n});
      const length = src.length === undefined ? undefined
        : src.length === INF ? count
        : src.length >= count ? count
        : src.length;
      const mem = [];
      if(src.length === undefined) {
        for(const v of src.read()) {
          mem.push(v);
          if(mem.length > count)
            mem.shift();
        }
        return Stream.fromArray(mem);
      } else if(src.length > count) {
        return new Stream(this,
          _ => {
            const stm = src.read();
            stm.skip(src.length - count);
            return stm;
          },
          count
        );
      } else
        return src;
    } else {
      if(src.length === undefined) {
        let last;
        for(const val of src.read())
          last = val;
        return last;
      } else if(src.length > 0n) {
        const stm = src.read();
        stm.skip(src.length - 1n);
        return stm.next().value;
      } else
        throw new StreamError('empty stream');
    }
  },
  help: {
    en: ['Returns the last element of the source stream.',
      'The 1-argument form returns `_count` last elements.'],
    cs: ['Vrátí poslední prvek vstupního proudu.',
      'Forma s argumentem vrátí `_count` posledních prvků.'],
    args: 'count?',
    cat: catg.streams,
    ex: [
      ['range(1,10,4).last', '9'],
      ['range(100).last(3)', '[98,99,100]'],
      ['pi.last', '!infinite stream']],
    see: ['first', 'droplast', 'postfix']
  }
});

function* takedrop(src, gen) {
  const stm = src.read();
  let take = true;
  for(const num of gen) {
    if(take) {
      for(let i = 0n; i < num; i++) {
        const val = stm.next().value;
        if(!val)
          return;
        yield val;
      }
    } else
      stm.skip(num);
    take = !take;
  }
  if(take)
    yield* stm;
}

R.register(['take', 'takedrop', 'td'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isImm))
      return new Stream(this,
        _ => takedrop(src, ins.map(i => this.cast(i, types.N, {min: 0n}))));
    else if(this.args.length === 1)
      return new Stream(this,
        _ => takedrop(src, ins[0].adapt(r => this.cast(r, types.N, {min: 0n}))));
    else
      throw new StreamError('required list of values or a single stream');
  },
  help: {
    en: ['Takes n1 elements, drops n2, etc.',
      'If the last instruction is take, terminates there, otherwise, leaves the rest of the stream.'],
    cs: ['Vypíše n1 prvků, pak n2 ignoruje atd.',
      'Jestliže poslední instrukce je brát, skončí po ní. Jestliže zahodit, vypíše i celý zbytek vstupu.'],
    cat: catg.streams,
    args: 'n1,n2,...',
    ex: [['iota.take(5)', '[1,2,3,4,5]'],
      ['iota.take(2,5)', '[1,2,8,9,10,11,...]'],
      ['iota.take([1,2].cycle)', '[1,4,7,10,...]']],
    see: 'drop'
  }
});

R.register(['drop', 'droptake', 'dt'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isImm))
      return new Stream(this,
        _ => takedrop(src, [0n, ...ins.map(i => this.cast(i, types.N, {min: 0n}))]));
    else if(this.args.length === 1)
      return new Stream(this,
        _ => takedrop(src, (function*(self) {
          yield 0n;
          yield* ins[0].adapt(r => self.cast(r, types.N, {min: 0n}));
        })(this))
      );
    else
      throw new StreamError('required list of values or a single stream');
  },
  help: {
    en: ['Drops n1 elements, takes n2, etc.',
      'If the last instruction is take, terminates there, otherwise, leaves the rest of the stream.'],
    cs: ['Zahodí n1 prvků, pak n2 vypíše atd.',
      'Jestliže poslední instrukce je brát, skončí po ní. Jestliže zahodit, vypíše i celý zbytek vstupu.'],
    cat: catg.streams,
    args: 'n1,n2,...',
    ex: [['iota.drop(5)', '[6,7,8,9,10,...]'],
      ['iota.drop(5,2)', '[6,7]'],
      ['iota.drop([1,2].cycle)', '[2,3,5,6,8,...]']],
    see: ['take', 'droplast']
  }
});

R.register(['droplast', 'dl'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream, {finite: true});
    const count = this.args[0] ? this.cast(this.args[0].eval(), types.N, {min: 1n}) : 1n;
    if(src.length === undefined) {
      return new Stream(this,
        function*() {
          let l = [];
          for(const v of src) {
            l.push(v);
            if(l.length > count)
              yield l.shift();
          }
        }
      );
    } else if(src.length > count) {
      const length = src.length - count;
      return new Stream(this,
        _ => {
          const stm = src.read();
          let i = 0n;
          return [
            (function*() {
              for(; i < length; i++)
                yield stm.next().value;
            })(),
            c => {
              i += c;
              stm.skip(c);
            }
          ];
        },
        length
      );
    } else
      return Stream.fromArray([]);
  },
  help: {
    en: ['Drops `_count` last elements. If `_count` is not given, it defaults to 1.'],
    cs: ['Zahodí `_count` posledních prvků. Jestliže `_count` není uveden, zahodí jeden.'],
    args: 'count?',
    cat: catg.streams,
    ex: [['range(5).droplast', '[1,2,3,4]']],
    see: 'drop'
  }
});

R.register(['reverse', 'rev'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const src = this.cast0(this.src.eval(), [types.stream, types.S]);
    if(src.type === types.stream) {
      this.cast0(src, types.stream, {finite: true});
      const vals = [...src.read()].reverse();
      return Stream.fromArray(vals);
    } else if(src.type === types.S) {
      return new Imm([...src.value].reverse().join(''));
    }
  },
  help: {
    en: ['Returns the input stream or string in reverse.'],
    cs: ['Vrátí vstupní proud nebo řetězec v obráceném pořadí.'],
    cat: [catg.streams, catg.strings],
    ex: [['1024.todigits.reverse', '[4,2,0,1]'], ['1024.tobase(10).reverse', '"4201"']]
  }
});

R.register(['repeat', 'rep'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const src = this.src.eval();
    if(this.args[0]) {
      const count = this.cast(this.args[0].eval(), types.N, {min: 0n});
      return new Stream(this,
        _ => {
          let i = 0n;
          return [
            (function*() {
              while(i++ < count)
                yield src;
            })(),
            c => i += c
          ];
        },
        count
      );
    } else {
      return new Stream(this,
        function*() { for(;;) yield src; },
        INF
      );
    }
  },
  help: {
    en: ['Returns a stream made of a finite or infinite number of copies of `_source`.'],
    cs: ['Vrátí proud konečně nebo nekonečně mnoha kopií `_source`'],
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
    const src = this.cast0(this.src.eval(), types.stream, {finite: true});
    if(this.args[0]) {
      const count = this.cast(this.args[0].eval(), types.N, {min: 0n});
      const length = src.length === undefined ? undefined
        : src.length * count;
      return new Stream(this,
        function*() {
          for(let i = 0n; i < count; i++)
            yield* src.read();
        },
        length
      );
    } else {
      const length = src.length === undefined ? undefined
        : src.length === 0n ? 0n : INF;
      return new Stream(this,
        function*() {
          for(;;)
            yield* src.read();
        },
        length
      );
    }
  },
  help: {
    en: ['Returns a stream obtained by reading `_source` repeatedly from beginning to end.'],
    cs: ['Vrátí proud vzniklý opakovaným čtením `_source` od začátku do konce.'],
    cat: catg.streams,
    src: 'source',
    args: 'count?',
    ex: [['[1,2].cycle', '[1,2,1,2,1,2,1,2,...]'],
      ['[1,2].cycle(3)', '[1,2,1,2,1,2]']],
    see: 'repeat'
  }
});

function* group(src, gen) {
  const stm = src.read();
  for(const size of gen) {
    if(size === 0n) {
      yield Stream.fromArray([]);
      continue;
    }
    const arr = [];
    for(let i = 0n; i < size; i++) {
      const val = stm.next().value;
      if(val)
        arr.push(val);
      else
        break;
    }
    if(arr.length > 0n)
      yield Stream.fromArray(arr);
    else
      break;
  }
}

R.register(['group', 'g'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isImm)) {
      if(this.args.length === 1) {
        const size = this.cast(ins[0], types.N, {min: 1n});
        const length = src.length === INF ? INF
          : src.length === undefined ? undefined
          : (src.length + size - 1n) / size;
        return new Stream(this,
          _ => group(src, (function*() { for(;;) yield size; })()),
          length
        );
      } else {
        const length = src.length === INF ? BigInt(ins.length) : undefined;
        return new Stream(this,
          _ => group(src, ins.map(i => this.cast(i, types.N, {min: 0n}))),
          length
        );
      }
    } else if(this.args.length === 1) {
      const length = src.length === INF ? ins[0].length : undefined;
      return new Stream(this,
        _ => group(src, ins[0].adapt(r => this.cast(r, types.N, {min: 0n}))),
        length
      );
    } else
      throw new StreamError('required list of values or a single stream');
  },
  help: {
    en: [
      'Splits `_source` into groups of given lengths.',
      'One or more lengths may be given, or a stream.',
      '-If a list of lengths is given, the stream finishes after the last group.'],
    cs: [
      'Rozdělí `_source` na skupiny po daných počtech prvků.',
      'Specifikace může zahrnovat jeden nebo několik indexů, nebo sama být proudem.',
      '-Jestliže jsou délky dány seznamem, proud skončí po poslední skupině.'],
    cat: catg.streams,
    ex: [
      ['iota.group(3)', '[[1,2,3],[4,5,6],[7,8,9],...]'],
      ['iota.group(3,2)', '[[1,2,3],[4,5]]'],
      ['iota.group(iota)', '[[1],[2,3],[4,5,6],...]']],
    src: 'source'
  }
});

function* flatten(src, depth = INF) {
  for(const val of src.read()) {
    if(val.isImm)
      yield val;
    else if(depth === INF)
      yield* flatten(val, INF);
    else if(depth > 0n)
      yield* flatten(val, depth - 1n);
    else
      yield val;
  }
}

R.register(['flatten', 'fl'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const depth = this.args[0] ? this.cast(this.args[0].eval(), types.N) : INF;
    return new Stream(this,
      _ => flatten(src, depth));
  },
  help: {
    en: ['Flattens all stream elements of `_source`.',
      'If `_depth` is given, flattens only up to that depth.'],
    cs: ['Zploští všechny prvky `_source`, které jsou samy proudy, do jednoho dlouhého proudu.',
      'Jestliže je dáno `_depth`, zploští vnořené proudy pouze do této hloubky.'],
    cat: catg.streams,
    src: 'source',
    args: 'depth?',
    ex: [['[1].nest([#]).flatten', '[1,1,1,1,1,1,...]'],
      ['[1].nest([#]).flatten(3)', '[1,1,1,[1],[[1]],...]']]
  }
});

R.register(['padleft', 'pl'], {
  reqSource: true,
  numArg: 2,
  eval() {
    const src = this.cast0(this.src.eval(), [types.stream, types.S]);
    const length = this.cast(this.args[0].eval(), types.N, {min: 0n});
    if(src.type === types.stream) {
      if(src.length === INF || src.length >= length)
        return src;
      const fill = this.args[1].eval();
      if(src.length < length)
        return new Stream(this,
          function*() {
            for(let i = src.length; i < length; i++)
              yield fill;
            yield* src.read();
          },
          length
        );
      else { // src.length === undefined
        const arr = [];
        let i = 0n;
        for(const val of src.read()) {
          arr.push(val);
          if(++i == length)
            return src;
        }
        return new Stream(this,
          function*() {
            for(let i = BigInt(arr.length); i < length; i++)
              yield fill;
            yield* arr;
          },
          length
        );
      }
    } else {
      const fill = this.cast(this.args[1].eval(), types.S);
      return new Imm(src.value.padStart(Number(length), fill));
    }
  },
  help: {
    en: ['If the input stream is shorter than `_length`, extends to this length by adding copies of `_pad` at the beginning.', 'Also works with strings.'],
    cs: ['Jestliže vstup je kratší než `_length`, rozšíří jej na tuto délku přidáním kopií `_pad` na začátek.', 'Funguje také s řetězci.'],
    cat: [catg.streams, catg.strings],
    args: 'length,pad',
    ex: [['range(3).padleft(5,0)', '[0,0,1,2,3]'],
      ['12.str.padleft(5," ")', '"   12"']]
  }
});

R.register(['padright', 'pr'], {
  reqSource: true,
  numArg: 2,
  eval() {
    const src = this.cast0(this.src.eval(), [types.stream, types.S]);
    const length = this.cast(this.args[0].eval(), types.N, {min: 0n});
    if(src.type === types.stream) {
      if(src.length === INF || src.length >= length)
        return src;
      const fill = this.args[1].eval();
      if(src.length < length)
        return new Stream(this,
          function*() {
            yield* src.read();
            for(let i = src.length; i < length; i++)
              yield fill;
          },
          length
        );
      else { // src.length === undefined
        return new Stream(this,
          function*() {
            let i = 0n;
            for(const val of src.read()) {
              yield val;
              i++;
            }
            for(; i < length; i++)
              yield fill;
          },
          length
        );
      }
    } else {
      const fillStr = this.cast(this.args[1].eval(), types.S);
      return new Imm(src.value.padEnd(Number(length), fillStr));
    }
  },
  help: {
    en: ['If the input stream is shorter than `_length`, extends to this length by adding copies of `_pad` at the end.', 'Also works with strings.'],
    cs: ['Jestliže vstup je kratší než `_length`, rozšíří jej na tuto délku přidáním kopií `_pad` na konec.', 'Funguje také s řetězci.'],
    cat: [catg.streams, catg.strings],
    args: 'length,pad',
    ex: [['range(5).group(3).padright(5,[])', '[[1,2,3],[4,5],[],[],[]]'],
      ['12.str.padright(5,"_")', '"12___"']]
  }
});

R.register(['prepend', 'prep'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const args = this.args.map(arg => arg.eval());
    args.push(this.src.eval());
    const lens = args.map(arg => arg.isImm ? 1n : arg.length);
    const length = lens.some(len => len === undefined) ? undefined
      : lens.some(len => len === INF) ? INF
      : lens.reduce((a, b) => a + b);
    return new Stream(this,
      function*() {
        for(const arg of args) {
          if(arg.isImm)
            yield arg;
          else
            yield* arg.read();
        }
      },
      length
    );
  },
  help: {
    en: ['Returns a stream formed by concatenating all the arguments, followed by the input stream.', 'Non-stream values are treated the same way as in `join`.'],
    cs: ['Vrátí proud vzniklý navázáním všech argumentů a nakonec vstupu.', 'S argumenty, které nejsou proudy, nakládá stejně jako `join`.'],
    cat: catg.streams,
    ex: [['1.nest(#*2).prepend(0)', '[0,1,2,4,8,16,...]']],
    see: 'append'
  }
});

R.register(['append', 'app'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const args = this.args.map(arg => arg.eval());
    args.unshift(this.src.eval());
    const lens = args.map(arg => arg.isImm ? 1n : arg.length);
    const length = lens.some(len => len === undefined) ? undefined
      : lens.some(len => len === INF) ? INF
      : lens.reduce((a,b) => a+b);
    return new Stream(this,
      function*() {
        for(const arg of args) {
          if(arg.isImm)
            yield arg;
          else
            yield* arg.read();
        }
      },
      length
    );
  },
  help: {
    en: ['Returns a stream formed by concatenating the input streams with all the arguments.', 'Non-stream values are treated the same way as in `join`.'],
    cs: ['Vrátí proud vzniklý navázáním vstupu a všech argumentů.', 'S argumenty, které nejsou proudy, nakládá stejně jako `join`.'],
    cat: catg.streams,
    ex: [['16.nest(#/2).while(#>0).append(0)', '[16,8,4,2,1,0]']],
    see: 'prepend'
  }
});

R.register('nest', {
  reqSource: true,
  numArg: 1,
  prepare: Node.prototype.prepareForeach,
  checkArgs(srcPromise) {
    this.args[0].check(true);
  },
  eval() {
    const body = this.cast0(this.args[0], [types.symbol, types.expr]);
    return new Stream(this,
      function*() {
        let curr = this.src.eval();
        for(;;) {
          yield curr;
          curr = body.applySrc(curr);
        }
      },
      INF
    );
  },
  help: {
    en: ['Returns the results of iterative applications of `_body` on `_init`.'],
    cs: ['Vrátí výsledky iterovaného použití `_body` na `_init`.'],
    cat: catg.streams,
    ex: [['10.nest(if(#.odd,3*#+1,#/2))', '[10,5,16,8,4,2,1,...]', {en: 'Collatz sequence', cs: 'Collatzova posloupnost'}],
      ['"caesar".nest(shift(1,abc))', '["caesar","dbftbs","ecguct",...]']],
    src: 'init',
    args: 'body'
  }
});

R.register('fold', {
  reqSource: true,
  minArg: 1,
  maxArg: 3,
  prepare(scope) {
    return this.prepareFold(scope, this.args.length > 1);
  },
  checkArgs(srcPromise) {
    const numArgs = this.args.length;
    this.args.forEach((arg, ix) => arg.check(false,
      (ix < numArgs - 1 || numArgs === 1) && arg.bare ? 2 : 0));
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const bodyMem = this.cast0(this.args[0], [types.symbol, types.expr]);;
    const bodyOut = this.args.length === 3
      ? this.cast0(this.args[1], [types.symbol, types.expr])
      : bodyMem;
    return new Stream(this,
      function*() {
        let curr;
        if(this.args.length > 1)
          curr = this.args[this.args.length - 1].applySrc(src);
        for(const next of src.read()) {
          const val = curr ? bodyOut.applyArgsAuto([curr, next]) : next;
          curr = bodyMem === bodyOut ? val : bodyMem.applyArgsAuto([curr, next]);
          yield val;
        }
      },
      src.length
    );
  },
  help: {
    en: ['Returns the results of iterative applications of `_body` on the previous result and the next element of `_source`.',
      'If `_init` is given, it is used as the initial value rather than the first element of `_source`.',
      'If three arguments are given, the value of `_bodyOut` is output (but `_body` kept for subsequent evaluation).',
      '-The input values are used as arguments to `_body`. You can use a plain symbol or a block, where they are accessed as `#1`, `#2`.'],
    cs: ['Vrátí výsledky iterovaného použití `_body` na předchozí výsledek a nový prvek ze `_source`.',
      'Jestliže je dán argument `_init`, je použit jako počáteční hodnota, jinak je jí první prvek `_source`.',
      'Jestliže jsou dány tři argumenty, výstup tvoří hodnoty `_bodyOut` (ale pro další výpočet je použit výsledek `_body`).',
      '-Zpracovávané hodnoty jsou do `_body` vloženy jako argumenty. Můžete použít samotný symbol nebo blok, v němž jsou pak viditelné jako `#1`, `#2`.'],
    cat: catg.streams,
    ex: [['iota.fold(times)', '[1,2,6,24,120,...]'],
      ['iota.fold([#1,#2])', '[1,[1,2],[[1,2],3],...]']],
    src: 'source',
    args: 'body,bodyOut??,init?'
  }
});

R.register('reduce', {
  reqSource: true,
  minArg: 1,
  maxArg: 2,
  prepare(scope) {
    return this.prepareFold(scope, this.args.length === 2);
  },
  checkArgs(srcPromise) {
    const numArgs = this.args.length;
    this.args.forEach((arg, ix) => arg.check(false,
      ix === 0 && arg.bare ? 2 : 0));
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream, {finite: true});
    const body = this.cast0(this.args[0], [types.symbol, types.expr]);;
    let curr;
    if(this.args.length > 1)
      curr = this.args[this.args.length - 1].applySrc(src);
    for(const next of src.read())
      curr = curr ? body.applyArgsAuto([curr, next]) : next;
    if(!curr)
      throw new StreamError('empty stream');
    return curr;
  },
  help: {
    en: ['Returns the result of `_body(...(_body(_body(_init,_source[1]),_source[2]),...)`.',
      'Equivalent to `_source.fold(_body,_init?).last`.'],
    cs: ['Vrátí hodnotu `_body(...(_body(_body(_init,_source[1]),_source[2]),...)`.',
      'Ekvivalentní `_source.fold(_body,_init?).last`.'],
    cat: catg.streams,
    ex: [['lt.over([1,3,5],[2,4,5])', '[true,true,false]'],
      ['$.reduce(and)', 'false']],
    src: 'source',
    args: 'body,init?',
    see: ['total', 'product']
  }
});

R.register('recur', {
  reqSource: false,
  minArg: 2,
  prepare: Node.prototype.prepareFold,
  checkArgs(srcPromise) {
    this.args.forEach((arg, ix, arr) => {
      if(ix < arr.length - 1)
        arg.check();
      else
        arg.check(false, arg.bare ? arr.length - 1 : 0);
    });
  },
  eval() {
    const body = this.cast0(this.args[this.args.length - 1], [types.symbol, types.expr]);
    return new Stream(this,
      function*() {
        const prev = this.args.slice(0, -1).map(arg => arg.eval());
        yield* prev;
        for(;;) {
          const next = body.applyArgsAuto(prev.slice());
          yield next;
          prev.shift();
          prev.push(next);
        }
      },
      INF
    );
  },
  help: {
    en: ['Keeping n last entries, iteratively applies `_body` on them.'],
    cs: ['Udržuje n posledních prvků a iterativně na ně aplikuje `_body`.'],
    cat: catg.streams,
    args: 'a1,...,an,body',
    ex: [['recur(1,1,plus)', '[1,1,2,3,5,8,13,21,...]', {en: 'Fibonacci', cs: 'Fibonacci'}]]
  }
});

R.register('map2', {
  reqSource: true,
  numArg: 1,
  prepare: Node.prototype.prepareFold,
  checkArgs(srcPromise) {
    this.args[0].check(false, this.args[0].bare ? 2 : 0);
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const body = this.cast0(this.args[0], [types.symbol, types.expr]);
    const length = src.length === undefined ? undefined
      : src.length === INF ? INF
      : src.length > 0n ? src.length - 1n
      : src.length;
    return new Stream(this,
      function*() {
        let prev;
        for(const curr of src.read()) {
          if(!prev) {
            prev = curr;
            continue;
          }
          const val = body.applyArgsAuto([prev, curr]);
          prev = curr;
          yield val;
        }
      },
      length
    );
  },
  help: {
    en: ['Applies `_body` on pairs of consecutive values from `_source` as arguments `#1`, `#2`.'],
    cs: ['Aplikuje `_body` na dvojice sousedních prvků `_source` jakožto argumenty `#1`, `#2`.'],
    cat: catg.streams,
    src: 'source',
    args: 'body',
    ex: [['[1,4,2,3].map2(range(#1,#2,if(#2>#1,1,-1)))', '[[1,2,3,4],[4,3,2],[2,3]]'],
      ['[1,5,9,7,2].map2(lt)', '[true,true,false,false]'],
      ['[1,10,20,60].map2(#2/#1)', '[10,2,3]'],
      ['primes.map2([#1,#2]).select(#[2]-#[1]=2)', '[[3,5],[5,7],[11,13],[17,19],...]', {en: 'twin primes', cs: 'prvočíselná dvojčata'}]],
    see: 'diff'
  }
});

R.register('if', {
  numArg: 3,
  prepare(scope) {
    return this.prepareBase(scope, {}, {partial: true});
  },
  eval() {
    const val = this.cast(this.args[0].prepare({}).eval(), types.B);
    return this.args[val ? 1 : 2].prepare({}).eval();
  },
  help: {
    en: ['Evaluates first argument as a boolean value. If this produces `true`, returns second, if `false`, third argument.',
      '-The unused argument needs not give a valid stream.'],
    cs: ['Vyhodnotí první argument jako pravdivostní hodnotu. Jestliže je `true`, vrátí druhý argument, jestliže `false`, třetí.',
      '-Nepoužitý argument nemusí dávat validní proud.'],
    cat: catg.base,
    args: 'test,iftrue,iffalse',
    ex: [['[3,"a"]:if(#.isnumber,range(#),#.ord)', '[[1,2,3],97]']]
  }
});

R.register(['select', 'sel', 'filter', 'where'], {
  reqSource: true,
  numArg: 1,
  prepare: Node.prototype.prepareForeach,
  checkArgs(srcPromise) {
    this.args[0].check(true);
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const cond = this.args[0];
    return new Stream(this,
      function*() {
        for(const value of src.read()) {
          if(this.cast(cond.applySrc(value), types.B))
            yield value;
        }
      }
    );
  },
  help: {
    en: ['Keeps only those entries of `_source` for which `_condition` evaluates to `true`.'],
    cs: ['Ponechá pouze ty prvky `_source`, pro které se podmínka `_condition` vyhodnotí na `true`.'],
    cat: catg.streams,
    src: 'source',
    args: 'condition',
    ex: [['iota.where(#.factor.length=2)', '[4,6,9,10,14,15,21,...]', {en: 'products of two primes', cs: 'součiny dvojic prvočísel'}],
      ['"one two three".split.select(#<>" ").cat', '"onetwothree"'],
      ['"abc567def".split.select(isdigit).length', '3', {en: 'count elements with a given property', cs: 'spočítat prvky s danou vlastností'}]]
  }
});

R.register(['iwhere', 'ixwhere'], {
  reqSource: true,
  numArg: 1,
  prepare: Node.prototype.prepareForeach,
  checkArgs(srcPromise) {
    this.args[0].check(true);
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const cond = this.args[0];
    return new Stream(this,
      function*() {
        let i = 1;
        for(const value of src.read()) {
          if(this.cast(cond.applySrc(value), types.B))
            yield new Imm(i);
          ++i;
        }
      }
    );
  },
  help: {
    en: ['Returns a sequence of positions of entries of `_source` for which `_condition` evaluates to `true`.'],
    cs: ['Vrátí posloupnost pozic prvků `_source`, pro které se podmínka `_condition` vyhodnotí na `true`.'],
    cat: catg.streams,
    src: 'source',
    args: 'condition',
    ex: [['"a1b2c3".split.iwhere(isdigit)', '[2,4,6]']]
  }
});

R.register('while', {
  reqSource: true,
  numArg: 1,
  prepare: Node.prototype.prepareForeach,
  checkArgs(srcPromise) {
    this.args[0].check(true);
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const cond = this.args[0];
    return new Stream(this,
      function*() {
        for(const value of src.read()) {
          if(this.cast(cond.applySrc(value), types.B))
            yield value;
          else
            return;
        }
      }
    );
  },
  help: {
    en: ['Returns elements of `_source` as long as `_condition` evaluates to `true`.'],
    cs: ['Vrací prvky `_source`, dokud se podmínka `_condition` vyhodnocuje na `true`.'],
    cat: catg.streams,
    src: 'source',
    args: 'condition',
    ex: [['primes.while(#<30)', '[2,3,5,7,11,13,17,19,23,29]']]
  }
});

R.register(['groupby', 'gby'], {
  reqSource: true,
  numArg: 1,
  prepare: Node.prototype.prepareForeach,
  checkArgs(srcPromise) {
    this.args[0].check(true);
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const body = this.cast0(this.args[0], [types.symbol, types.expr]);
    return new Stream(this,
      function*() {
        let prev = null;
        const arr = [];
        for(const value of src.read()) {
          const curr = body.applySrc(value);
          if(prev === null)
            prev = curr;
          else if(!compareStreams(prev, curr)) {
            yield Stream.fromArray(arr);
            arr.splice(0);
            prev = curr;
          }
          arr.push(value);
        }
        if(arr.length > 0)
          yield Stream.fromArray(arr);
      }
    );
  },
  help: {
    en: ['Returns groups of successive elements which evaluate to the same result when `_body` is applied.'],
    cs: ['Čte proud `_source` a vrací skupiny po sobě jdoucích jeho prvků, které dávají stejný výsledek při aplikaci `_body`.'],
    cat: catg.streams,
    src: 'source',
    args: 'body',
    ex: [['range(1,101,10).groupby(dlog)', '[[1],[11,21,31,41,51,61,71,81,91],[101]]', {en: 'group by digit count', cs: 'sdružovat podle počtu číslic'}],
      ['"abc12def".split.groupby(isletter):cat', '["abc","12","def"]', {en: 'group by a property', cs: 'třídit podle vlastnosti'}],
      ['"this is a test".split(" ").groupby(length)', '[["this"],["is"],["a"],["test"]]', {en: 'only groups successive elements!', cs: 'slučuje jen po sobě jdoucí prvky!'}],
      ['"this is a test".split(" ").sort(length).groupby(length)', '[["a"],["is"],["this","test"]]', {en: 'use `sort` to identify all matches', cs: 'použijte `sort`, pokud chcete najít všechny shody'}],
      ['iota.groupby(#<5)', '[[1,2,3,4],...?]', {en: 'groupby must be able to determine where the individual parts end', cs: 'groupby musí umět rozhodnout, kde jednotlivé části končí'}]],
  }
});

R.register(['selmax', 'selmin'], {
  reqSource: true,
  numArg: 1,
  prepare: Node.prototype.prepareForeach,
  checkArgs(srcPromise) {
    this.args[0].check(true);
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream, {finite: true});
    const func = this.args[0];
    const max = this.ident === 'selmax';
    let prev = null;
    const ret = [];
    for(const value of src.read()) {
      const curr = this.cast(func.applySrc(value), types.N);
      if(curr === prev)
        ret.push(value);
      else if(prev === null || (max ? curr > prev : curr < prev)) {
        ret.splice(0);
        ret.push(value);
        prev = curr;
      }
    }
    return Stream.fromArray(ret);
  },
  help: {
    en: ['Evaluates `_function` on each element of `_source` and returns those for which it results in the maximal numeric value.',
      '`_selmin` works the same but finding the minimal value.'],
    cs: ['Vyhodnocuje `_function` na všech prvcích `_source` a vrátí ty, pro které dává nejvyšší číselnou hodnotu.',
      '`_selmin` funguje stejně, ale hledá nejmenší hodnotu.'],
    cat: catg.streams,
    src: 'source',
    args: 'function',
    ex: [['"this is a test".split(" ").selmax(length)', '["this","test"]']],
    see: ['max', 'min']
  }
});


R.register('splitat', {
  reqSource: true,
  minArg: 1,
  maxArg: 2,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const div = this.args[0];
    const count = this.args[1] ? this.cast(this.args[1].eval(), types.N, {min: 1n}) : 0n;
    const self = this;
    return new Stream(this,
      function*() {
        let lastDiv = -1n;
        let ix = 0n;
        let ctr = 0n;
        const arr = [];
        for(const val of src.read()) {
          if(compareStreams(val, div)) {
            yield Stream.fromArray(arr);
            arr.splice(0);
            lastDiv = ix;
            if(++ctr === count) {
              yield (new Node('droptake', self.token, self.src, [new Imm(lastDiv + 1n)])).eval();
              return;
            }
          } else
            arr.push(val);
          ix++;
        }
        if(arr.length > 0)
          yield Stream.fromArray(arr);
      }
    );
  },
  help: {
    en: ['Splits the input stream to substreams on occurrences of `_divider`. These do not appear in any substream.',
      'If `_count` is given, stops looking for `_divider` after `_count` substreams have been output and returns the rest.',
      '-If two occurrences appear next to each other, an empty array is output between them.',
      '-If `_divider` appears as the first or last element of input, the output will start or end with `[]`, respectively.'],
    cs: ['Rozdělí vstupní proud na části podle výskytů `_divider`. Ty nejsou zařazeny do žádné z částí.',
      'Jestliže je dáno `_count`, přestane po vypsání `_count` částí hledat další výskyty `_divider` a vydá zbytek vstupu nezměněn.',
      '-Jestliže se ve vstupu `_divider` vyskytuje dvakrát za sebou, ve výstupu na odpovídajícím místě bude `[]`.',
      '-Jestliže `_divider` je prvním nebo posledním prvkem vstupu, výstup bude začínat, resp. končit `[]`.'],
    cat: catg.streams,
    src: 'source',
    args: 'divider,count?',
    ex: [['range(8).splitat(3)', '[[1,2],[4,5,6,7,8]]'],
      ['iota.splitat(3)', '[[1,2],...?]', {en: 'splitat must be able to determine where the individual parts end', cs: 'splitat musí umět rozhodnout, kde jednotlivé části končí'}],
      ['iota.splitat(3,1)', '[[1,2],[4,5,6,7,...]]', {en: 'this can be fixed by giving count', cs: 'může být napraveno poskytnutím count', skipTest: true}]],
    see: 'split'
  }
});


function numCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const strCompare = Intl.Collator().compare;

R.register(['sort', 'rsort'], {
  reqSource: true,
  maxArg: 1,
  prepare: Node.prototype.prepareForeach,
  checkArgs(srcPromise) {
    this.args[0]?.check(true);
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream, {finite: true});
    if(this.args[0]) {
      const temp = [...src.read()].map(s => [s, this.args[0].applySrc(s)]);
      this.usort(temp, x => x[1]);
      const vals = temp.map(x => x[0]);
      if(this.ident === 'rsort')
        vals.reverse();
      return Stream.fromArray(vals);
    } else {
      const vals = [...src.read()].map(s => s.eval());
      this.usort(vals, x => x);
      if(this.ident === 'rsort')
        vals.reverse();
      return Stream.fromArray(vals);
    }
  },
  usort(arr, fn = x => x) {
    if(arr.length === 0)
      return arr;
    const first = this.cast0(fn(arr[0]), [types.N, types.S]);
    if(first.type === types.N) {
      arr.forEach(a => this.cast0(fn(a), types.N));
      arr.sort((a, b) => numCompare(fn(a).value, fn(b).value));
    } else if(first.type === types.S) {
      arr.forEach(a => this.cast0(fn(a), types.S));
      arr.sort((a, b) => strCompare(fn(a).value, fn(b).value));
    }
  },
  help: {
    en: ['Loads the input stream in full and returns sorted.',
      'In the 1-argument form, the sorting key is obtained by applying `_body` on the elements of `_source`.',
      '`_rsort` sorts the values in reverse order.',
      '!The values to be compared must be either all numeric or all strings.'],
    cs: ['Načte celý vstupní proud a vrátí seřazený.',
      'Pokud je poskytnuto `_body`, řadicí klíč se získá jeho použitím na každý prvek `_source`.',
      '`_rsort` řadí hodnoty v obráceném pořadí.',
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
    const src = this.cast0(this.src.eval(), types.stream);
    return new Stream(this,
      function*() {
        let prev;
        for(const curr of src.read()) {
          if(!prev || !compareStreams(curr, prev))
            yield curr;
          prev = curr;
        }
      }
    );
  },
  help: {
    en: ['If the input stream contains repeated elements, outputs only one copy per run.'],
    cs: ['Jestliže vstupní proud obsahuje opakující se prvky, vypíše z každých takových po sobě jdoucích pouze jeden.'],
    cat: catg.streams,
    ex: [['[1,1,2,2,2,1].ddup', '[1,2,1]']],
    see: 'uniq'
  }
});

R.register('fixed', {
  reqSource: true,
  numArg: 0,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    let prev;
    for(const curr of src.read()) {
      if(prev && compareStreams(curr, prev))
        return curr;
      prev = curr;
    }
    // not found
    throw new StreamError('no repeated element found');
  },
  help: {
    en: ['Scans the input stream for a direct repetition. Returns this repeated element.'],
    cs: ['Načítá vstupní proud, dokud se nenalezne stejná hodnota dvakrát za sebou. Tu pak vrátí.'],
    cat: catg.streams,
    ex: [['5.nest((#^2).mod(100000))', '[5,25,625,90625,90625,...]'],
      ['$.fixed', '90625']]
  }
});

R.register('index', {
  reqSource: true,
  numArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), [types.stream, types.S]);
    if(src.type === types.stream) {
      const ref = this.args[0];
      let i = 0;
      for(const val of src.read()) {
        i++;
        if(compareStreams(val, ref))
          return new Imm(i);
      }
      // not found
      return new Imm(0);
    } else {
      const haystack = src.value.toLowerCase();
      const needle = this.cast(this.args[0].eval(), types.S).toLowerCase();
      return new Imm(haystack.indexOf(needle) + 1);
    }
  },
  help: {
    en: ['Returns the position of the first entry of `_source` equal to `_value`, or 0 if not found.',
      '-If `_source` is a string, returns the position of the first substring `_value`, case insensitive.'],
    cs: ['Vrátí pozici prvního prvku `_source` rovného `_value`, nebo 0, pokud takový není nalezen.',
      '-`_source` také může být řetězec, pak vyhledá pozici výskytu podřetězce `_value`, bez ohledu na velká a malá písmena.'],
    cat: [catg.streams, catg.strings],
    src: 'source',
    args: 'value',
    ex: [['primes.index(17)', '7'],
      ['"abracadabra".index("cad")', '5'],
      ['"abc".index("z")', '0', {en: 'not an error', cs: 'není chybou'}]]
  }
});

R.register(['indexes', 'indices'], {
  reqSource: true,
  numArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), [types.stream, types.S]);
    if(src.type === types.stream) {
      const ref = this.args[0];
      return new Stream(this,
        function*() {
          let i = 0;
          for(const r of src.read()) {
            i++;
            if(compareStreams(r, ref))
              yield new Imm(i);
          }
        }
      );
    } else {
      const haystack = src.value.toLowerCase();
      const needle = this.cast(this.args[0].eval(), types.S).toLowerCase();
      return new Stream(this,
        function*() {
          let start = 0;
          for(;;) {
            let curr = haystack.indexOf(needle, start);
            if(curr < 0)
              break;
            // else
            yield new Imm(curr + 1);
            start = curr + 1;
          }
        }
      );
    }
  },
  help: {
    en: ['Returns a sequence of positions of entries of `_source` equal to `_value`.',
      '-If `_source` is a string, returns positions of substrings `_value`, case insensitive.'],
    cs: ['Vrátí posloupnost pozic prvků `_source` rovných `_value`.',
      '-`_source` také může být řetězec, pak vyhledá pozice výskytů podřetězce `_value`, bez ohledu na malá a velká písmena.'],
    cat: [catg.streams, catg.strings],
    src: 'source',
    args: 'value',
    ex: [['pi.indexes(0)', '[33,51,55,66,72,...]'],
      ['"test".indexes("t")', '[1,4]'],
      ['"aaaa".indexes("aa")', '[1,2,3]']]
  }
});

R.register('includes', {
  reqSource: true,
  numArg: 1,
  eval() {
    const sArr = this.cast0(this.src.eval(), types.stream);
    const ref = this.args[0];
    for(const r of sArr.read())
      if(compareStreams(r, ref))
        return new Imm(true);
    // not found
    return new Imm(false);
  },
  help: {
    en: ['Returns `true` if `_source` contains `_value`, `false` otherwise.'],
    cs: ['Vrátí `true`, pokud `_source` obsahuje `_value`, jinak `false`.'],
    cat: catg.streams,
    src: 'source',
    args: 'value',
    ex: [['"The quick brown fox".lcase.split.includes@["d","f"]', '[false,true]']],
    see: 'element'
  }
});

R.register('element', {
  reqSource: true,
  numArg: 1,
  eval() {
    const ref = this.src;
    const sArr = this.cast0(this.args[0].eval(), types.stream, );
    for(const r of sArr.read())
      if(compareStreams(r, ref))
        return new Imm(true);
    // not found
    return new Imm(false);
  },
  help: {
    en: ['Returns `true` if `_value` is found in `_stream`, `false` otherwise.'],
    cs: ['Vrátí `true`, pokud `_value` je nalezena ve `_stream`, jinak `false`.'],
    cat: catg.streams,
    src: 'value',
    args: 'stream',
    ex: [['"test string".split.where(element("aeiou".split))', '["e","i"]']],
    see: 'includes'
  }
});

R.register('count', {
  reqSource: true,
  numArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream, {finite: true});
    const ref = this.args[0];
    let count = 0;
    for(const r of src.read()) {
      if(compareStreams(r, ref))
        count++;
    }
    return new Imm(count);
  },
  help: {
    en: ['Returns the count of occurrences of `_value` in `_source`.',
      '-To count elements with some property, use `select(...).length`'],
    cs: ['Vrátí počet výskytů prvku `_value` v proudu `_source`.',
      '-Pokud chcete spočítat prvky s nějakou vlastností, použijte `select(...).length`.'],
    cat: catg.streams,
    src: 'source',
    args: 'value',
    ex: [['"test string".split.count("t")', '3']]
  }
});

R.register(['counts', 'tally', 'freq'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream, {finite: true});
    const map = new Map();
    const fixed = (this.args.length !== 0);
    const vals = fixed ? [...this.cast0(this.args[0].eval(), types.stream, {finite: true}).read()] : [];
    const cnts = vals.map(_ => 0n);
    A: for(const r of src.read()) {
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
    return Stream.fromArray([...vals.keys()].map(ix => Stream.fromArray([vals[ix], new Imm(cnts[ix])])));
  },
  help: {
    en: ['Counts occurrences of distinct elements in `_source`. Returns in the format `[[_value,_count],...]`.',
      'If a second argument is given, counts only those elements and returns them in the same order, otherwise in the order of first appearance.'],
    cs: ['Počítá výskyty různých prvků v `_source`. Vrací je ve formátu `[[hodnota,počet],...]`.',
      'Jestliže je poskytnut druhý argument, počítá pouze takové prvky, které se vyskytují v něm, a vrátí v daném pořadí. Jinak v pořadí prvního výskytu.'],
    cat: catg.streams,
    src: 'source',
    args: 'values?',
    ex: [['"abracadabra".split.counts', '[["a",5],["b",2],["r",2],["c",1],["d",1]]'],
      ['"abracadabra".split.counts(["a","b","c"])', '[["a",5],["b",2],["c",1]]']],
    see: 'unrle'
  }
});

R.register('uniq', {
  reqSource: true,
  numArg: 0,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream, {finite: true});
    const set = new Set();
    return new Stream(this,
      function*() {
        A: for(const r of src.read()) {
          for(const s of set)
            if(compareStreams(r, s))
              continue A;
          // else
          set.add(r);
          yield r;
        }
      }
    );
  },
  help: {
    en: ['Returns distinct elements from input stream, discarding any duplicities.'],
    cs: ['Vrátí pouze rozdílné prvky vstupního proudu, všechny duplicity jsou odstraněny.'],
    cat: catg.streams,
    ex: [['binom(7)', '[1,7,21,35,35,21,7,1]'],
      ['binom(7).uniq', '[1,7,21,35]']],
    see: 'ddup'
  }
});

R.register('rle', {
  reqSource: true,
  numArg: 0,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    return new Stream(this,
      function*() {
        const stm = src.read();
        let prev = stm.next().value;
        if(!prev)
          return;
        let count = 1;
        for(const curr of stm) {
          if(compareStreams(curr, prev))
            count++;
          else {
            yield Stream.fromArray([prev, new Imm(count)]);
            count = 1;
          }
          prev = curr;
        }
        yield Stream.fromArray([prev, new Imm(count)]);
      }
    );
  },
  help: {
    en: ['Counts lengths of runs of equal elements of the input stream. Returns in the format `[[_value,_count],...]`.'],
    cs: ['Počítá délky segmentů opakování stejného prvku vstupního proudu. Vrací je ve formátu `[[hodnota,počet],...]`.'],
    cat: catg.streams,
    ex: [['[1,1,2,2,2,1].rle', '[[1,2],[2,3],[1,1]]'],
      ['10000.factor.rle', '[[2,4],[5,4]]']],
    see: 'unrle'
  }
});

R.register(['unrle', 'unfreq', 'untally'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    return new Stream(this,
      function*() {
        for(const r of src.read()) {
          const tmp = this.cast0(r, types.stream).read();
          const elm = tmp.next().value;
          const count = this.cast(tmp.next().value, types.N, {min: 0n});
          const test = tmp.next().done;
          if(!test || !elm || count === undefined)
            throw new StreamError(`${r.toString}: not in RLE format`);
          for(let i = 0n; i < count; i++)
            yield elm;
        }
      }
    );
  },
  help: {
    en: ['Expects the input in the format `[[_value,_count],...]`, as given by `counts` or `rle`. Repeats every `_value` `_count` times.'],
    cs: ['Očekává vstupní proud ve formátu `[[hodnota,počet],...]`, jak jej vrací `counts` nebo `rle`. Ve výstupu zopakuje každou `hodnotu` `počet`-krát.'],
    cat: catg.streams,
    ex: [['"abracadabra".split.counts("abc".split)', '[["a",5],["b",2],["c",1]]'],
      ['$.unrle.cat', '"aaaaabbc"']]
  }
});

R.register('isstream', {
  reqSource: true,
  numArg: 0,
  eval() {
    return new Imm(this.src.eval().type === types.stream);
  },
  help: {
    en: ['Tests if `_input` is a stream. Returns `true` or `false`.'],
    cs: ['Testuje, zda `_input` je proudem. Vrací `true` nebo `false`.'],
    cat: catg.streams,
    src: 'input',
    ex: [['[1,[2,3,4],"abc"]:isstream', '[false,true,false]']]
  }
});

R.register('with', {
  minArg: 2,
  prepare(scope) {
    const args = this.args.map((arg, ix, arr) => {
      if(ix < arr.length - 1) {
        if(arg.ident === 'equal')
          return arg.toAssign();
        else if(arg.ident === 'assign')
          return arg;
        else
          throw new StreamError(`expected assignment, found ${arg.desc()}`);
      } else
        return arg;
    });
    return this
      .modify({args})
      .prepareBase(scope, {},
        (arg, ix, arr) => {
          if(ix === arr.length - 1) // body
            return {register: undefined, partial: true, expand: false};
          else // assignments
            return {partial: true, expand: !scope.partial};
        },
        {_register: scope.register});
  },
  eval() {
    const outerReg = this.meta._register;
    if(!outerReg)
      throw new Error('register not defined');
    const innerReg = outerReg.child();
    const args = this.args.slice();
    const body = args.pop();
    for(const arg of args)
      arg.prepare({register: innerReg, referrer: arg}).eval();
    return body.prepare({register: innerReg}).eval();
  },
  help: {
    en: ['Allows temporary assignments to be made for the scope of `_body`.',
      '-A symbol can refer to its outer value safely.',
      '-Useful for reusing a complicated subexpression or for binding the value of `#`, e.g., in `foreach`.'],
    cs: ['Umožňuje udělat dočasná přiřazení platná v rámci `_body`.',
      '-Symbol může bezpečně být předefinován pomocí své vnější hodnoty.',
      '-Užitečné pro stručné pojmenování komplikovaného podvýrazu nebo pro zachycení hodnoty `#`, například ve `foreach`.'],
    args: 'var=expr...,body',
    cat: catg.base,
    ex: [['[2,3,4]:with(a=#,[a,"abcdef".split(a)])', '[[2,["ab","cd","ef"]],[3,["abc","def"]],[4,["abcd","ef"]]]', {en: '`split`(#) would not work here!', cs: '`split`(#) by zde nefungovalo!'}],
      ['with(a=5,with(b=a*(a+1),c=a*(a-1),[b,c,b-c]))', '[30,20,10]']]
  }
});

R.register(['subs', 'subst', 'replace', 'repl'], {
  reqSource: true,
  numArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const sSubs = this.cast0(this.args[0].eval(), types.stream, {finite: true});
    const map = new Map();
    for(const r of sSubs.read()) {
      const sTemp = this.cast0(r, types.stream).read();
      const key = sTemp.next().value;
      const val = sTemp.next().value;
      if(!key || !val || !(sTemp.next().done))
        throw new StreamError('substitutions not in the format [[a,b], ...]');
      if([...map.keys()].some(k => compareStreams(k, key)))
        throw new StreamError(`duplicate key ${key.toString()}`);
      map.set(key, val);
    }
    return new Stream(this,
      _ => {
        const stm = src.read();
        return [
          (function*() {
            A: for(const r of stm) {
              for(const [key, val] of map)
                if(compareStreams(r, key)) {
                  yield val;
                  continue A;
                }
              // else
              yield r;
            }
          })(),
          c => stm.skip(c)
        ];
      },
      src.length
    );
  },
  help: {
    en: ['Expects `_subs` in the format `[[_v1,_v2],...]`. Replaces occurrences of `_v1` by `_v2` in `_source`.',
      '-Character to character replacement in a string is easier using `tr`.'],
    cs: ['Očekává `_subs` ve formátu `[[_v1,_v2],...]`. Nahradí výskyty `_v1` v `_source` prvkem `_v2`.',
      '-Pro náhradu jednotlivých znaků v řetězci je snazší použít `tr`.'],
    cat: catg.streams,
    src: 'source',
    args: 'subs',
    ex: [['"abracadabra".split.subs([["a","aa"],["b",""]]).cat', '"aaraacaadaaraa"']],
    see: 'tr'
  }
});

R.register(['allequal', 'alleq', 'same', 'allsame'], {
  reqSource: true,
  maxArg: 1,
  prepare: Node.prototype.prepareForeach,
  checkArgs(srcPromise) {
    this.args[0].check(true);
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    if(this.args[0]) {
      const body = this.cast0(this.args[0], [types.symbol, types.expr]);
      let prev = null;
      for(const r of src.read()) {
        const curr = body.applySrc(r);
        if(prev === null)
          prev = curr;
        else if(!compareStreams(prev, curr))
          return new Imm(false);
      }
      if(prev !== null)
        return new Imm(true);
      else
        throw new StreamError('empty stream');
    } else {
      let prev = null;
      for(const r of src.read()) {
        if(prev === null)
          prev = r;
        else if(!compareStreams(prev, r))
          return new Imm(false);
      }
      if(prev !== null)
        return new Imm(true);
      else
        throw new StreamError('empty stream');
    }
  },
  help: {
    en: ['Checks if all elements of `_source` are equal. Returns `true` or `false`.',
      'If `_body` is given, checks if `_element._body` evaluates to the same value for all elements of `_source.'],
    cs: ['Vrací `true` nebo `false` podle toho, zda všechny prvky proudu `_source` jsou stejné.',
      'Jestliže je dáno `_body`, zkouší, zda `_element._body` dává pro všechny prvky `_source` stejný výsledek.'],
    cat: catg.streams,
    src: 'source',
    args: 'body?',
    ex: [['"one two six ten".split(" ").allequal(length)', 'true']],
    see: 'every'
  }
});

R.register('trans', {
  reqSource: true,
  numArg: 0,
  eval() {
    let i = 0n;
    const sFirst = this.cast0(this.src.eval(), types.stream).read().next().value;
    if(!sFirst)
      return Stream.fromArray([]);
    const self = this;
    return new Stream(this,
      _ => {
        const stm = this.cast0(sFirst, types.stream).read();
        let i = 1n;
        return [
          (function*() {
            for(const _ of stm)
              yield (new Node('transpart', self.token, self.src, [new Imm(i++)])).eval();
          })(),
          c => {
            stm.skip(c);
            i += c;
          }
        ];
      },
      sFirst.length
    );
  },
  help: {
    en: ['Expects a stream of streams as input. Outputs all first parts, then all second parts, etc.',
      'After any of the streams finishes, the further elements of output will be cut before that point. The length is thus determined by the first stream.'],
    cs: ['Očekává na vstupu proud tvořený proudy. Vrátí proud tvořený všemi prvními částmi, pak všemi druhými atd.',
      'Když některý proud skončí dříve než ostatní, následující prvky výstupu budou uťaty před touto pozicí. Délka je tedy určena prvním z proudů.'],
    cat: catg.streams,
    ex: [['[[1,4,7],[2,5],[6,5,3,9]].trans', '[[1,2,6],[4,5,5],[7]]', {en: '3,9 are never seen because second stream ended before third', cs: '3,9 nejsou vypsány, protože druhý proud skončil dříve'}],
      ['$.trans', '[[1,4,7],[2,5],[6,5]]'],
      ['[iota,[1,2]].trans', '[[1,1],[2,2],[3],[4],...]'],
      ['[[1,2],iota].trans', '[[1,1],[2,2]]']],
    see: 'zip'
  }
});

R.register('transpart', {
  reqSource: true,
  numArg: 1,
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const part = this.cast(this.args[0].eval(), types.N, {min: 1n});
    return new Stream(this,
      function*() {
        for(const r of src.read()) {
          const sIn = this.cast0(r, types.stream).read();
          sIn.skip(part - 1n);
          const rr = sIn.next().value;
          if(!rr)
            return;
          //else
          yield rr;
        }
      }
    );
  }
});
