import {StreamError} from '../errors.js';
import {Node, Atom, Block, Stream, types} from '../base.js';
import R from '../register.js';
import {catg} from '../help.js';

export function ord(c) {
  const cp = c.codePointAt(0);
  if(c !== String.fromCodePoint(cp))
    throw new StreamError(`expected single character, got "${c}"`);
  return cp;
}

export function isSingleChar(c) {
  return c === String.fromCodePoint(c.codePointAt(0));
}

function* splitABC(str, abc, err = false) {
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
      yield [abc[bestIx], bestIx];
      ix += bestLen;
    } else {
      if(err)
        throw new StreamError(`no match for "...${str.substring(ix)}" in alphabet`);
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
    const str = this.src.evalAtom(types.S);
    if(this.args[0]) {
      const ev = this.args[0].eval().checkType([types.N, types.S, types.stream]);
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
      } else if(ev.type === types.stream) {
        const abc = this.args[0].evalAlphabet();
        return new Stream(this,
          (function*() {
            for(const [ch, _] of splitABC(str, abc))
              yield new Atom(ch);
          })()
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
  },
  help: {
    en: ['Splits a string into substrings.',
      'If `_rule` is a number, splits into parts of corresponding lengths.',
      'If `_rule` is a string, splits by this separator.',
      'If `_rule` is an alphabet, splits by its characters.',
      'If no `_rule` is given, separates single characters.'],
    cz: ['Rozdělí řetězec na podřetězce.',
      'Jestliže `_rule` je číslo, tvoří podřetězce této délky.',
      'Jestliže `_rule` je řetězec, dělí podle tohoto oddělovače.',
      'Jestliže `_rule` je abeceda, dělí na její znaky.',
      'Jestliže žádné `_rule` není dáno, odděluje jednotlivé znaky.'],
    cat: catg.strings,
    src: 'string',
    args: 'rule?',
    ex: [['"test string".split()', '["t","e","s","t"," ",...]'],
      ['"test string".split(3)', '["tes","t s","tri","ng"]'],
      ['"test string".split(" ")', '["test","string"]'],
      ['"test string".split(`abc`~"st")', '["t","e","st"," ","st",...]']]
  }
});

R.register('cat', {
  reqSource: true,
  maxArg: 1,
  eval() {
    const strs = [...this.src.evalStream({finite: true})].map(a => a.evalAtom(types.S));
    const sep = this.args[0] ? this.args[0].evalAtom(types.S) : '';
    return new Atom(strs.join(sep));
  },
  help: {
    en: ['Concatenates a stream of strings into one string.',
      '-If `_glue` is given, it is used between consecutive strings.'],
    cz: ['Sloučí proud řetězců do jednoho řetězce.'],
    cat: catg.strings,
    ex: [['"one two three".`split`(" ").cat(",")', '"one,two,three"'],
      ['`abc`[`pi`.`while`(#>0)].cat', '"cadaeibfecehigicbchdfbfdcchcbgie"'],
      ['abc.`perm`.`rnd`.cat', '"izsqefyhmlwjkrgdcptauxbvno"']],
    args: 'glue?',
    see: 'plus'
  }
});

R.register('ord', {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const c = nnode.src.evalAtom(types.S);
    if(nnode.args[0]) {
      const abc = nnode.args[0].evalAlphabet();
      const ix = abc.indexOf(c);
      if(ix < 0)
        throw new StreamError(`character "${c}" not in alphabet`);
      else
        return new Atom(ix + 1);
    } else
      return new Atom(ord(c));
  },
  help: {
    en: ['Returns the ordinal number of a character.',
      'If `_alphabet` is given, returns index into it. Otherwise, returns a Unicode code point.'],
    cz: ['Vrátí pořadové číslo znaku.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní. Jinak vrací Unicode kód.'],
    cat: catg.strings,
    src: 'char',
    args: 'alphabet?',
    ex: [['"😀".ord.`tobase`(16)', '"1f600"'],
      ['"test".`split`:ord(`abc`)', '[20,5,19,20]']],
    see: ['ords', 'chr']
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
      const abc = nnode.args[0].evalAlphabet();
      if(ix > abc.length)
        throw new StreamError(`index ${ix} beyond end`);
      else
        return new Atom(abc[Number(ix) - 1]);
    } else {
      const cp = nnode.src.evalNum({min: 0n});
      return new Atom(String.fromCodePoint(Number(cp)));
    }
  },
  help: {
    en: ['Returns the character with a given ordinal number.',
      'If `_alphabet` is given, works within it. Otherwise, returns a character at the given Unicode code point.'],
    cz: ['Vrátí znak dle pořadového čísla.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní. Jinak vrátí znak daného Unicode kódu.'],
    cat: catg.strings,
    src: 'index',
    args: 'alphabet?',
    ex: [['`range`(127761,127768):chr', '["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"]'],
      ['[20,5,19,20]:chr(`abc`)', '["t","e","s","t"]']],
    see: ['ord', 'chrm']
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
    const abc = nnode.args[0].evalAlphabet();
    ix = Number(ix % BigInt(abc.length));
    if(ix < 0) ix += abc.length;
    return new Atom(abc[ix]);
  },
  help: {
    en: ['Returns the character with a given ordinal number in an alphabet, wrapping over its length.',
      '-This avoids the need to use `mod` for overflows.'],
    cz: ['Vrátí znak dle pořadového čísla v abecedě. Čísla menší než 1 nebo větší než délka abecedy jsou interpretována cyklicky.',
      '-Toto efektivně odstraňuje potřebu používat `mod` proti přetečení.'],
    cat: catg.strings,
    src: 'index',
    args: 'alphabet',
    ex: [['"test".`ords`(`abc`)+13', '[33,18,32,33]'],
      ['$:chrm(abc).`cat`', '"grfg"'],
      ['`range`(24,28):chrm(abc)', '["x","y","z","a","b"]']]
  }
});

R.register('ords', {
  reqSource: true,
  numArg: 1,
  eval() {
    const str = this.src.evalAtom(types.S);
    const abc = this.args[0].evalAlphabet();
    return new Stream(this,
      (function*() {
        for(const [_, ix] of splitABC(str, abc, true))
          yield new Atom(ix + 1);
      })()
    );
  },
  help: {
    en: ['Returns ordinal numbers of characters of `_string` in the alphabet `_alphabet`.',
      '-This avoids the need for using `_alphabet` twice: `_string.split(_alphabet):ord(_alphabet)`.'],
    cz: ['Vrátí pořadová čísla znaků řetězce `_string` v abecedě `_alphabet`.',
      '-Toto odstraňuje potřebu použít `_alphabet` dvakrát: `_string.split(_alphabet):ord(_alphabet)`.'],
    cat: catg.strings,
    src: 'string',
    args: 'alphabet',
    ex: [['abch=`abc`.`take`(8)~"ch"~abc.`drop`(8) ;Czech alphabet without diacritics', '["abch"]'],
      ['"czech".ords(abch)', '[3,27,5,9]']]
  }
});

R.register(['lcase', 'lc'], {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const pnode = this.prepareAll(scope);
    if(scope.partial)
      return pnode;
    const str = pnode.src.evalAtom(types.S);
    return new Atom(str.toLowerCase());
  },
  help: {
    en: ['Converts `_string` to lowercase.'],
    cz: ['Vrátí řetězec `_string` převedený na malá písmena.'],
    cat: catg.strings,
    src: 'string',
    ex: [['"Слово".lcase ;also works for non-Latin characters', '"слово"']],
    see: 'ucase'
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
  },
  help: {
    en: ['Converts `_string` to uppercase.'],
    cz: ['Vrátí řetězec `_string` převedený na velká písmena.'],
    cat: catg.strings,
    src: 'string',
    ex: [['"Слово".lcase ;also works for non-Latin characters', '"СЛОВО"']],
    see: 'lcase'
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
  },
  help: {
    en: ['The 26-letter English alphabet.',
      '!If spelled as `ABC`, gives the alphabet in capitals. No other intrinsic or user-defined filter can mimic this distinction.'],
    cz: ['Anglická 26-písmenná abeceda.',
      '!Jestliže je zapsáno jako `ABC`, dává abecedu velkými písmeny. Žádná jiná vnitřní ani uživatelská funkce nedokáže toto chování replikovat.'],
    cat: [catg.sources, catg.strings],
    ex: [['abc', '["a","b","c","d",...]'],
      ['ABC', '["A","B","C","D",...]']]
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
  },
  help: {
    en: ['Tests if `_input` is a string. Returns `true` or `false`.'],
    cz: ['Testuje, zda `_input` je řetězcem. Vrací `true` nebo `false`.'],
    cat: catg.strings,
    src: 'input',
    ex: [['[1,[2,3,4],"abc"]:isstring', '[false,false,true]']]
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
  },
  help: {
    en: ['Tests if `_input` is a digit (`"0"` through `"9"`). Returns `true` or `false`.'],
    cz: ['Testuje, zda `_input` je číslice (`"0"` až `"9"`). Vrací `true` nebo `false`.'],
    cat: catg.strings,
    src: 'input',
    ex: [['[1,"1","a","A"]:isdigit', '[false,true,false,false]']]
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
      const abc = nnode.args[0].evalAlphabet()
        .map(a => a.evalAtom(types.S).toLowerCase());
      return new Atom(abc.includes(c.toLowerCase()));
    } else
      return new Atom(isSingleChar(c) && (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'));
  },
  help: {
    en: ['Tests if `_input` is a letter. Returns `true` or `false`.',
      'If `_alphabet` is given, uses that, otherwise uses English alphabet (`"a"` through `"z"` and uppercase variants).'],
    cz: ['Testuje, zda `_input` je písmeno. Vrací `true` nebo `false`.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní, jinak používá anglickou abecedu (`"a"` až `"z"` a velká písmena).'],
    cat: catg.strings,
    src: 'input',
    ex: [['[1,"1","a","A"]:isletter', '[false,false,true,true]']]
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
      const abc = nnode.args[0].evalAlphabet()
        .map(a => a.evalAtom(types.S).toUpperCase());
      return new Atom(abc.includes(c));
    } else
      return new Atom(isSingleChar(c) && c >= 'A' && c <= 'Z');
  },
  help: {
    en: ['Tests if `_input` is an uppercase letter. Returns `true` or `false`.',
      'If `_alphabet` is given, uses that, otherwise uses English alphabet (`"A"` through `"Z"`).'],
    cz: ['Testuje, zda `_input` je velké písmeno. Vrací `true` nebo `false`.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní, jinak používá anglickou abecedu (`"A"` až `"Z"`).'],
    cat: catg.strings,
    src: 'input',
    ex: [['[1,"1","a","A"]:isupper', '[false,false,false,true]']]
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
      const abc = nnode.args[0].evalAlphabet()
        .map(a => a.evalAtom(types.S).toLowerCase());
      return new Atom(abc.includes(c));
    } else
      return new Atom(isSingleChar(c) && c >= 'a' && c <= 'z');
  },
  help: {
    en: ['Tests if `_input` is an lowercase letter. Returns `true` or `false`.',
      'If `_alphabet` is given, uses that, otherwise uses English alphabet (`"a"` through `"z"`).'],
    cz: ['Testuje, zda `_input` je malé písmeno. Vrací `true` nebo `false`.',
      'Jestliže je dána abeceda `_alphabet`, pracuje v ní, jinak používá anglickou abecedu (`"a"` až `"z"`).'],
    cat: catg.strings,
    src: 'input',
    ex: [['[1,"1","a","A"]:islower', '[false,false,true,false]']]
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
  },
  help: {
    en: ['Returns `_count` first characters of `_string`. If `_string` is shorter than `_count`, returns all of it.',
      '-A negative `_count` removes `-_count` characters from the end.'],
    cz: ['Vrátí `_count` prvních znaků řetězce `_string`. Jestliže `_string` je kratší než `_count`, vrátí jej celý.',
      '-Záporný `_count` odstraní `-_count` znaků z konce.'],
    cat: catg.strings,
    src: 'string',
    args: 'count',
    ex: [['"string".prefix(2)', 'st'],
      ['"string".prefix(-2)', 'stri']],
    see: 'postfix'
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
  },
  help: {
    en: ['Returns `_count` last characters of `_string`. If `_string` is shorter than `_count`, returns all of it.',
      '-A negative `_count` removes `-_count` characters from the beginning.'],
    cz: ['Vrátí `_count` posledních znaků řetězce `_string`. Jestliže `_string` je kratší než `_count`, vrátí jej celý.',
      '-Záporný `_count` odstraní `-_count` znaků ze začátku.'],
    cat: catg.strings,
    src: 'string',
    args: 'count',
    ex: [['"string".postfix(2)', 'ng'],
      ['"string".postfix(2)', 'ring']],
    see: 'prefix'
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
  },
  help: {
    en: ['Tests if `_string` ends with `_postfix`. Returns `true` or `false`.'],
    cz: ['Testuje, zda řetězec `_string` končí podřetězcem `_postfix`. Vrací `true` nebo `false`.'],
    cat: catg.strings,
    src: 'string',
    args: 'postfix',
    ex: [['"this is a test".`split`(" ").`select`(ends("s"))', '["this","is"]']],
    see: 'starts'
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
  },
  help: {
    en: ['Tests if `_string` begins with `_prefix`. Returns `true` or `false`.'],
    cz: ['Testuje, zda řetězec `_string` začíná podřetězcem `_prefix`. Vrací `true` nebo `false`.'],
    cat: catg.strings,
    src: 'string',
    args: 'prefix',
    ex: [['"this is a test".`split`(" ").`select`(starts("t"))', '["this","test"]']],
    see: 'ends'
  }
});

R.register('shift', {
  reqSource: true,
  numArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const str = nnode.src.evalAtom(types.S);
    let shift = nnode.args[0].evalNum();
    const abc = nnode.args[1].evalAlphabet();
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
    return new Atom(ret);
  },
  help: {
    en: ['Shifts `_string` by `_count` characters forward in the given `_alphabet`.'],
    cz: ['Posune `_string` o `_count` znaků dopředu v abecedě `_alphabet`.'],
    cat: catg.strings,
    src: 'string',
    args: 'count,alphabet',
    ex: [['"caesar".`nest`(shift(1,`abc`))', '["caesar","dbftbs","ecguct",...]'],
      ['"grfg".shift(13,`abc`)', '"test"']]
  }
});

R.register('tr', {
  reqSource: true,
  minArg: 2,
  maxArg: 3,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const str = nnode.src.evalAtom(types.S);
    const from = nnode.args[0].evalAtom(types.S);
    const to = nnode.args[1].evalAtom(types.S);
    if(nnode.args[2]) {
      const abc = nnode.args[2].evalAlphabet();
      const fArr = [...splitABC(from, abc)].map(([ch, _]) => ch);
      const tArr = [...splitABC(to, abc)].map(([ch, _]) => ch);
      if(fArr.length !== tArr.length)
        throw new StreamError('pattern and replacement strings of different lengths');
      let ret = '';
      for(const [ch, _] of splitABC(str, abc)) {
        const ix = fArr.indexOf(ch);
        ret += ix >= 0 ? tArr[ix] : ch;
      }
      return new Atom(ret);
    } else {
      if(from.length !== to.length)
        throw new StreamError('pattern and replacement strings of different lengths');
      let ret = '';
      for(const ch of [...str]) {
        const ix = from.indexOf(ch);
        ret += ix >= 0 ? to[ix] : ch;
      }
      return new Atom(ret);
    }
  },
  help: {
    en: ['Substitutes characters from `_pattern` by those in the same positions in `_replacements`.'],
    cz: ['Nahrazuje znaky z `_pattern` znaky na stejných pozicích v `_replacements`.'],
    cat: catg.strings,
    src: 'string',
    args: 'pattern,replacements',
    ex: [['"test".tr("ts","st")', '"sets"']],
    see: 'subs'
  }
});
