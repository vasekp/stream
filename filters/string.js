import {StreamError} from '../errors.js';
import {Node, Imm, Block, Stream, INF, types} from '../base.js';
import R from '../register.js';
import {catg} from '../help.js';

export function ord(c, blame) {
  const cp = c.codePointAt(0);
  if(c !== String.fromCodePoint(cp))
    throw new StreamError(`expected single character, got "${c}"`, blame);
  return cp;
}

export function isSingleChar(c) {
  return c === String.fromCodePoint(c.codePointAt(0));
}

// Expects abc in lowercase!
function* splitABC(str, abc, blame) {
  let ix = 0;
  const strl = str.toLowerCase();
  while(ix < str.length) {
    let bestLen = 0;
    let bestIx;
    for(let i = 0; i < abc.length; i++) {
      const ch = abc[i];
      if(ch.length <= bestLen)
        continue;
      if(strl.startsWith(ch, ix)) {
        bestLen = ch.length;
        bestIx = i;
      }
    }
    if(bestLen) {
      yield [str.substring(ix, ix + bestLen), bestIx];
      ix += bestLen;
    } else {
      if(blame)
        throw new StreamError(`no match for "...${str.substring(ix)}" in alphabet`, blame);
      const ch = String.fromCodePoint(str.codePointAt(ix));
      yield [ch, -1];
      ix += ch.length;
    }
  }
}

R.register(['split', 'chars'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const str = this.cast(this.src.eval(), types.S);
    if(this.args[0]) {
      const ev = this.cast0(this.args[0].eval(), [types.N, types.S, types.stream]);
      if(ev.type === types.S) {
        const sep = ev.value;
        const split = str.split(sep);
        return new Stream(this,
          function*() {
            for(const c of split)
              yield new Imm(c);
          },
          BigInt(split.length)
        );
      } else if(ev.type === types.N) {
        const l = ev.value;
        const re = new RegExp(`.{1,${l}}`, 'ug');
        const split = [...str.match(re)];
        return new Stream(this,
          function*() {
            for(const c of split)
              yield new Imm(c);
          },
          BigInt(split.length)
        );
      } else if(ev.type === types.stream) {
        const abc = this.args[0].evalAlphabet(true);
        return new Stream(this,
          function*() {
            for(const [ch, _] of splitABC(str, abc))
              yield new Imm(ch);
          }
        );
      }
    } else {
      const chars = [...str];
      return new Stream(this,
        function*() {
          for(const c of chars)
            yield new Imm(c);
        },
        BigInt(chars.length)
      );
    }
  },
  help: {
    en: ['Splits a string into substrings.',
      'If `_rule` is a number, splits into parts of corresponding lengths.',
      'If `_rule` is a string, splits by this separator.',
      'If `_rule` is an alphabet, splits by its characters.',
      'If no `_rule` is given, separates single characters.'],
    cs: ['Rozdělí řetězec na podřetězce.',
      'Jestliže `_rule` je číslo, tvoří podřetězce této délky.',
      'Jestliže `_rule` je řetězec, dělí podle tohoto oddělovače.',
      'Jestliže `_rule` je abeceda, dělí na její znaky.',
      'Jestliže žádné `_rule` není dáno, odděluje jednotlivé znaky.'],
    cat: catg.strings,
    src: 'string',
    args: 'rule?',
    ex: [['"Test string".split()', '["T","e","s","t"," ",...]'],
      ['"Test string".split(3)', '["Tes","t s","tri","ng"]'],
      ['"Test string".split(" ")', '["Test","string"]'],
      ['"Test string".split(abc~"st")', '["T","e","st"," ","st",...]', {en: 'custom alphabet', cs: 'upravená abeceda'}]]
  }
});

R.register('cat', {
  reqSource: true,
  maxArg: 1,
  eval() {
    const strs = [...this.cast0(this.src.eval(), types.stream, {finite: true}).read()].map(a => this.cast(a.eval(), types.S));
    const sep = this.args[0] ? this.cast(this.args[0].eval(), types.S) : '';
    return new Imm(strs.join(sep));
  },
  help: {
    en: ['Concatenates a stream of strings into one string.',
      '-If `_glue` is given, it is used between consecutive strings.'],
    cs: ['Sloučí proud řetězců do jednoho řetězce.'],
    cat: catg.strings,
    ex: [['"one two three".split(" ").cat(",")', '"one,two,three"'],
      ['abc[pi.while(#>0)].cat', '"cadaeibfecehigicbchdfbfdcchcbgie"'],
      ['abc.perm.random.cat', '"izsqefyhmlwjkrgdcptauxbvno"', {skipTest: true}]],
    args: 'glue?',
    see: 'plus'
  }
});

R.register('ord', {
  reqSource: true,
  maxArg: 1,
  eval() {
    const c = this.cast(this.src.eval(), types.S);
    if(this.args[0]) {
      const abc = this.args[0].evalAlphabet(true);
      const ix = abc.indexOf(c.toLowerCase());
      if(ix < 0)
        throw new StreamError(`character "${c}" not in alphabet`, this);
      else
        return new Imm(ix + 1);
    } else
      return new Imm(ord(c, this));
  },
  help: {
    en: ['Returns the ordinal number of a character.',
      'If `_alphabet` is given, returns index into it. Otherwise, returns a Unicode code point.'],
    cs: ['Vrátí pořadové číslo znaku.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní. Jinak vrací Unicode kód.'],
    cat: catg.strings,
    src: 'char',
    args: 'alphabet?',
    ex: [['"😀".ord.tobase(16)', '"1f600"'],
      ['"Test".split:ord(abc)', '[20,5,19,20]']],
    see: ['ords', 'chr']
  }
});

R.register('chr', {
  reqSource: true,
  maxArg: 1,
  eval() {
    if(this.args[0]) {
      const ix = this.cast(this.src.eval(), types.N, {min: 1n});
      const abc = this.args[0].evalAlphabet();
      if(ix > abc.length)
        throw new StreamError(`index ${ix} beyond end`, this);
      else
        return new Imm(abc[Number(ix) - 1]);
    } else {
      const cp = this.cast(this.src.eval(), types.N, {min: 0n});
      return new Imm(String.fromCodePoint(Number(cp)));
    }
  },
  help: {
    en: ['Returns the character with a given ordinal number.',
      'If `_alphabet` is given, works within it. Otherwise, returns a character at the given Unicode code point.'],
    cs: ['Vrátí znak dle pořadového čísla.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní. Jinak vrátí znak daného Unicode kódu.'],
    cat: catg.strings,
    src: 'index',
    args: 'alphabet?',
    ex: [['range(127761,127768):chr', '["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"]'],
      ['[20,5,19,20]:chr(abc)', '["t","e","s","t"]']],
    see: ['ord', 'chrm']
  }
});

R.register('chrm', {
  reqSource: true,
  numArg: 1,
  eval() {
    let ix = this.cast(this.src.eval(), types.N) - 1n;
    const abc = this.args[0].evalAlphabet();
    ix = Number(ix % BigInt(abc.length));
    if(ix < 0) ix += abc.length;
    return new Imm(abc[ix]);
  },
  help: {
    en: ['Returns the character with a given ordinal number in an alphabet, wrapping over its length.',
      '-This avoids the need to use `mod` for overflows.'],
    cs: ['Vrátí znak dle pořadového čísla v abecedě. Čísla menší než 1 nebo větší než délka abecedy jsou interpretována cyklicky.',
      '-Toto efektivně odstraňuje potřebu používat `mod` proti přetečení.'],
    cat: catg.strings,
    src: 'index',
    args: 'alphabet',
    ex: [['"test".ords(abc)+13', '[33,18,32,33]'],
      ['$:chrm(abc).cat', '"grfg"'],
      ['range(24,28):chrm(abc)', '["x","y","z","a","b"]']]
  }
});

R.register('ords', {
  reqSource: true,
  numArg: 1,
  eval() {
    const str = this.cast(this.src.eval(), types.S);
    const abc = this.args[0].evalAlphabet(true);
    return new Stream(this,
      function*() {
        for(const [_, ix] of splitABC(str, abc, this))
          yield new Imm(ix + 1);
      }
    );
  },
  help: {
    en: ['Returns ordinal numbers of characters of `_string` in the alphabet `_alphabet`.',
      '-This avoids the need for using `_alphabet` twice: `_string.split(_alphabet):ord(_alphabet)`.'],
    cs: ['Vrátí pořadová čísla znaků řetězce `_string` v abecedě `_alphabet`.',
      '-Toto odstraňuje potřebu použít `_alphabet` dvakrát: `_string.split(_alphabet):ord(_alphabet)`.'],
    cat: catg.strings,
    src: 'string',
    args: 'alphabet',
    ex: [['abch=abc.take(8)~"ch"~abc.drop(8)', '["abch"]', {en: 'Czech alphabet without diacritics', cs: 'abeceda s ch'}],
      ['"Czech".ords(abch)', '[3,27,5,9]']]
  }
});

R.register(['lcase', 'lc'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const str = this.cast(this.src.eval(), types.S);
    return new Imm(str.toLowerCase());
  },
  help: {
    en: ['Converts `_string` to lowercase.'],
    cs: ['Vrátí řetězec `_string` převedený na malá písmena.'],
    cat: catg.strings,
    src: 'string',
    ex: [['"Слово".lcase', '"слово"', {en: 'also works for non-Latin characters', cs: 'funguje také mimo latinku'}]],
    see: 'ucase'
  }
});

R.register(['ucase', 'uc'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const str = this.cast(this.src.eval(), types.S);
    return new Imm(str.toUpperCase());
  },
  help: {
    en: ['Converts `_string` to uppercase.'],
    cs: ['Vrátí řetězec `_string` převedený na velká písmena.'],
    cat: catg.strings,
    src: 'string',
    ex: [['"Слово".ucase', '"СЛОВО"', {en: 'also works for non-Latin characters', cs: 'funguje také mimo latinku'}]],
    see: 'lcase'
  }
});

R.register('abc', {
  reqSource: false,
  numArg: 0,
  eval() {
    return new Stream(this,
      _ => {
        let i = 97;
        return [
          (function*() {
            while(i < 97 + 26)
              yield new Imm(String.fromCharCode(i++));
          })(),
          c => i += Number(c)
        ];
      },
      26n
    );
  },
  help: {
    en: ['The 26-letter English alphabet in lower case.',
      '-Filters like `split` do not require character case match.'],
    cs: ['Anglická 26-písmenná abeceda malými písmeny.',
      '-Filtry jako `split` mezi velikostí písmen nerozlišují.'],
    cat: [catg.sources, catg.strings],
    ex: [['abc.take(8)~"ch"~abc.drop(8)', '["a","b","c","d",...]', {en: 'Czech alphabet with "ch" after h', cs: 'česká abeceda s "ch"'}],
      ['$.length', '27']],
    see: 'upabc'
  }
});

R.register(['upabc', 'uabc'], {
  reqSource: false,
  numArg: 0,
  eval() {
    return new Stream(this,
      _ => {
        let i = 65;
        return [
          (function*() {
            while(i < 65 + 26)
              yield new Imm(String.fromCharCode(i++));
          })(),
          c => i += Number(c)
        ];
      },
      26n
    );
  },
  help: {
    en: ['The 26-letter English alphabet in upper case.',
      '-Filters like `split` do not require character case match.'],
    cs: ['Anglická 26-písmenná abeceda velkými písmeny.',
      '-Filtry jako `split` mezi velikostí písmen nerozlišují.'],
    cat: [catg.sources, catg.strings],
    ex: [['upabc', '["A","B","C","D",...]']],
    see: 'abc'
  }
});

R.register(['isstring', 'isstr'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const c = this.src.eval();
    return new Imm(c.type === types.S);
  },
  help: {
    en: ['Tests if `_input` is a string. Returns `true` or `false`.'],
    cs: ['Testuje, zda `_input` je řetězcem. Vrací `true` nebo `false`.'],
    cat: catg.strings,
    src: 'input',
    ex: [['[1,[2,3,4],"abc"]:isstring', '[false,false,true]']]
  }
});

R.register('isdigit', {
  reqSource: true,
  numArg: 0,
  eval() {
    const r = this.src.eval();
    if(r.type !== types.S)
      return new Imm(false);
    const c = r.value;
    return new Imm(isSingleChar(c) && c >= '0' && c <= '9');
  },
  help: {
    en: ['Tests if `_input` is a digit (`"0"` through `"9"`). Returns `true` or `false`.'],
    cs: ['Testuje, zda `_input` je číslice (`"0"` až `"9"`). Vrací `true` nebo `false`.'],
    cat: catg.strings,
    src: 'input',
    ex: [['[1,"1","a","A"]:isdigit', '[false,true,false,false]']]
  }
});

R.register('isletter', {
  reqSource: true,
  maxArg: 1,
  eval() {
    const r = this.src.eval();
    if(r.type !== types.S)
      return new Imm(false);
    const c = r.value;
    if(this.args[0]) {
      const abc = this.args[0].evalAlphabet(true);
      return new Imm(abc.includes(c.toLowerCase()));
    } else
      return new Imm(isSingleChar(c) && (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'));
  },
  help: {
    en: ['Tests if `_input` is a letter. Returns `true` or `false`.',
      'If `_alphabet` is given, uses that, otherwise uses English alphabet (`"a"` through `"z"` and uppercase variants).'],
    cs: ['Testuje, zda `_input` je písmeno. Vrací `true` nebo `false`.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní, jinak používá anglickou abecedu (`"a"` až `"z"` a velká písmena).'],
    cat: catg.strings,
    src: 'input',
    args: 'alphabet?',
    ex: [['[1,"1","a","A"]:isletter', '[false,false,true,true]']]
  }
});

R.register(['isupper', 'isucase', 'isuc'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const r = this.src.eval();
    if(r.type !== types.S)
      return new Imm(false);
    const c = r.value;
    if(this.args[0]) {
      const abc = this.args[0].evalAlphabet().map(a => a.toUpperCase());
      return new Imm(abc.includes(c));
    } else
      return new Imm(isSingleChar(c) && c >= 'A' && c <= 'Z');
  },
  help: {
    en: ['Tests if `_input` is an uppercase letter. Returns `true` or `false`.',
      'If `_alphabet` is given, uses that, otherwise uses English alphabet (`"A"` through `"Z"`).'],
    cs: ['Testuje, zda `_input` je velké písmeno. Vrací `true` nebo `false`.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní, jinak používá anglickou abecedu (`"A"` až `"Z"`).'],
    cat: catg.strings,
    src: 'input',
    args: 'alphabet?',
    ex: [['[1,"1","a","A"]:isupper', '[false,false,false,true]']]
  }
});

R.register(['islower', 'islcase', 'islc'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const r = this.src.eval();
    if(r.type !== types.S)
      return new Imm(false);
    const c = r.value;
    if(this.args[0]) {
      const abc = this.args[0].evalAlphabet(true);
      return new Imm(abc.includes(c));
    } else
      return new Imm(isSingleChar(c) && c >= 'a' && c <= 'z');
  },
  help: {
    en: ['Tests if `_input` is an lowercase letter. Returns `true` or `false`.',
      'If `_alphabet` is given, uses that, otherwise uses English alphabet (`"a"` through `"z"`).'],
    cs: ['Testuje, zda `_input` je malé písmeno. Vrací `true` nebo `false`.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní, jinak používá anglickou abecedu (`"a"` až `"z"`).'],
    cat: catg.strings,
    src: 'input',
    args: 'alphabet?',
    ex: [['[1,"1","a","A"]:islower', '[false,false,true,false]']]
  }
});

R.register('prefix', {
  reqSource: true,
  numArg: 1,
  eval() {
    const str = this.cast(this.src.eval(), types.S);
    const length = this.cast(this.args[0].eval(), types.N);
    return new Imm(str.slice(0, Number(length))); // works for ≥ 0 as well as < 0
  },
  help: {
    en: ['Returns `_count` first characters of `_string`. If `_string` is shorter than `_count`, returns all of it.',
      '-A negative `_count` removes `-_count` characters from the end.'],
    cs: ['Vrátí `_count` prvních znaků řetězce `_string`. Jestliže `_string` je kratší než `_count`, vrátí jej celý.',
      '-Záporný `_count` odstraní `-_count` znaků z konce.'],
    cat: catg.strings,
    src: 'string',
    args: 'count',
    ex: [['"string".prefix(2)', '"st"'],
      ['"string".prefix(-2)', '"stri"']],
    see: 'postfix'
  }
});

R.register('postfix', {
  reqSource: true,
  numArg: 1,
  eval() {
    const str = this.cast(this.src.eval(), types.S);
    const length = this.cast(this.args[0].eval(), types.N);
    return length === 0n ? new Imm("") : new Imm(str.slice(Number(-length)));
  },
  help: {
    en: ['Returns `_count` last characters of `_string`. If `_string` is shorter than `_count`, returns all of it.',
      '-A negative `_count` removes `-_count` characters from the beginning.'],
    cs: ['Vrátí `_count` posledních znaků řetězce `_string`. Jestliže `_string` je kratší než `_count`, vrátí jej celý.',
      '-Záporný `_count` odstraní `-_count` znaků ze začátku.'],
    cat: catg.strings,
    src: 'string',
    args: 'count',
    ex: [['"string".postfix(2)', '"ng"'],
      ['"string".postfix(-2)', '"ring"']],
    see: 'prefix'
  }
});

R.register('starts', {
  reqSource: true,
  numArg: 1,
  eval() {
    const str = this.cast(this.src.eval(), types.S).toLowerCase();
    const pfx = this.cast(this.args[0].eval(), types.S).toLowerCase();
    return new Imm(str.startsWith(pfx));
  },
  help: {
    en: ['Tests if `_string` begins with `_prefix`. Returns `true` or `false`.',
      '-Does not distinguish between upper and lower case.'],
    cs: ['Testuje, zda řetězec `_string` začíná podřetězcem `_prefix`. Vrací `true` nebo `false`.',
      '-Nerozlišuje mezi malými a velkými písmeny.'],
    cat: catg.strings,
    src: 'string',
    args: 'prefix',
    ex: [['"This is a test".split(" ").select(starts("t"))', '["This","test"]']],
    see: ['ends', 'contains']
  }
});

R.register('ends', {
  reqSource: true,
  numArg: 1,
  eval() {
    const str = this.cast(this.src.eval(), types.S).toLowerCase();
    const pfx = this.cast(this.args[0].eval(), types.S).toLowerCase();
    return new Imm(str.endsWith(pfx));
  },
  help: {
    en: ['Tests if `_string` ends with `_postfix`. Returns `true` or `false`.',
      '-Does not distinguish between upper and lower case.'],
    cs: ['Testuje, zda řetězec `_string` končí podřetězcem `_postfix`. Vrací `true` nebo `false`.',
      '-Nerozlišuje mezi malými a velkými písmeny.'],
    cat: catg.strings,
    src: 'string',
    args: 'postfix',
    ex: [['"This is a test".split(" ").select(ends("s"))', '["This","is"]']],
    see: ['starts', 'contains']
  }
});

R.register('contains', {
  reqSource: true,
  numArg: 1,
  eval() {
    const str = this.cast(this.src.eval(), types.S).toLowerCase();
    const pfx = this.cast(this.args[0].eval(), types.S).toLowerCase();
    return new Imm(str.includes(pfx));
  },
  help: {
    en: ['Tests if `_string` contains `_substr`. Returns `true` or `false`.',
      '-Does not distinguish between upper and lower case.'],
    cs: ['Testuje, zda řetězec `_string` obsahuje podřetězec `_substr`. Vrací `true` nebo `false`.',
      '-Nerozlišuje mezi malými a velkými písmeny.'],
    cat: catg.strings,
    src: 'string',
    args: 'substr',
    ex: [['"This is a test".split(" ").select(contains("is"))', '["This","is"]']],
    see: ['starts', 'ends']
  }
});

R.register('shift', {
  reqSource: true,
  numArg: 2,
  eval() {
    const str = this.cast(this.src.eval(), types.S);
    let shift = this.cast(this.args[0].eval(), types.N);
    const abc = this.args[1].evalAlphabet(true);
    shift = Number(shift % BigInt(abc.length));
    if(shift < 0)
      shift += abc.length;
    let ret = '';
    for(const [ch, ix] of splitABC(str, abc)) {
      if(ix >= 0)
        ret += abc[(ix + shift) % abc.length];
      else
        ret += ch;
    }
    return new Imm(ret);
  },
  help: {
    en: ['Shifts `_string` by `_count` characters forward in the given `_alphabet`.',
      '-Upper/lower case is not maintained during shift.'],
    cs: ['Posune `_string` o `_count` znaků dopředu v abecedě `_alphabet`.',
      '-Během posunu se ztratí původní velikost písmen.'],
    cat: catg.strings,
    src: 'string',
    args: 'count,alphabet',
    ex: [['"grfg".shift(13,abc)', '"test"'],
      ['"Caesar".nest(shift(1,abc))', '["Caesar","dbftbs","ecguct",...]']]
  }
});

R.register('tr', {
  reqSource: true,
  minArg: 2,
  maxArg: 3,
  eval() {
    const str = this.cast(this.src.eval(), types.S);
    const from = this.cast(this.args[0].eval(), types.S).toLowerCase();
    const to = this.cast(this.args[1].eval(), types.S);
    if(this.args[2]) {
      const abc = this.args[2].evalAlphabet(true);
      const fArr = [...splitABC(from, abc)].map(([ch, _]) => ch);
      const tArr = [...splitABC(to, abc)].map(([ch, _]) => ch);
      if(fArr.length !== tArr.length)
        throw new StreamError('pattern and replacement strings of different lengths', this);
      let ret = '';
      for(const [ch, _] of splitABC(str, abc)) {
        const ix = fArr.indexOf(ch);
        ret += ix >= 0 ? tArr[ix] : ch;
      }
      return new Imm(ret);
    } else {
      if(from.length !== to.length)
        throw new StreamError('pattern and replacement strings of different lengths', this);
      const strl = str.toLowerCase();
      const lowerIter = strl[Symbol.iterator]();
      let ret = '';
      let read = 0;
      for(const ch of str) {
        const lch = lowerIter.next().value; // assumption: str and strl have the same length in code points
        const ix = from.indexOf(lch);
        ret += ix >= 0 ? to[ix] : ch;
      }
      return new Imm(ret);
    }
  },
  help: {
    en: ['Substitutes characters from `_pattern` by those in the same positions in `_replacements`.',
      '-Does not distinguish between upper and lower case in input. The character case of output follows `_replacements`.'],
    cs: ['Nahrazuje znaky z `_pattern` znaky na stejných pozicích v `_replacements`.',
      '-Nerozlišuje mezi velkými a malými písmeny vstupu. Velikost písmen ve výstupu je dle `_replacements`.'],
    cat: catg.strings,
    src: 'string',
    args: 'pattern,replacements',
    ex: [['"substitution".tr("aeiou","iouae")', '"sebstutetuan"'],
      ['"Test".tr("ts","st")', '"sets"']],
    see: 'subs'
  }
});
