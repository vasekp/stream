import { Filter, Atom, Stream, InfStream } from './base.js';

function asstr(s) {
  if(!(s instanceof Atom))
    throw 'not atom';
  const v = s.value;
  if(typeof v !== 'string')
    throw 'not string';
  return v;
}

const cc = {
  digit: 'digit',
  alpha: 'alpha',
  space: 'space',
  open: 'open',
  close: 'close',
  oper: 'oper',
  string: 'string'
};

function charcls(c) {
  if(c >= '0' && c <= '9')
    return cc.digit;
  else if(c >= 'a' && c <= 'z')
    return cc.alpha;
  else switch(c) {
    case ' ':
    case '\n':
      return cc.space;
    case '(':
    case '[':
    case '{':
      return cc.open;
    case ')':
    case ']':
    case '}':
      return cc.close;
    case '.':
    case ':':
    case '+':
    case '-':
    case '*':
    case '/':
    case '%':
    case '~':
      return cc.oper;
    default:
      return c;
  }
}

function parsestr(iter) {
  let accum = '';
  let esc = false;
  for(;;) {
    const {value, done} = iter.next();
    if(done)
      throw 'unterminated string';
    if(esc) {
      accum += value;
      esc = false;
      continue;
    }
    if(value === '\\') {
      esc = true;
      continue;
    }
    if(value === '"')
      return accum;
    accum += value;
  }
}

function* split(str) {
  const iter = str[Symbol.iterator]();
  let lcls = null;
  let accum = '';
  for(;;) {
    const {value, done} = iter.next();
    const cls = charcls(value);
    if(cls !== lcls) { // TODO nechceme ((
      if(accum !== '')
        yield {value: accum, cls: lcls};
      accum = '';
    }
    if(value === '"') {
      lcls = 'string';
      yield {value: parsestr(iter), cls: lcls};
      continue;
    }
    if(done)
      break;
    accum += value;
    lcls = cls;
  }
  yield {value: '', cls: 'close'};
}

export function parse(str) {
  const ss = {
    base: 'base',
    expr: 'expr',
    oper: 'oper'
  };
  let state = ss.base;
  for(const s of split(str)) {
    switch(s.cls) {
      case cc.space:
        continue;
      case cc.digit:
      case cc.string:
        if(state === ss.base)
          console.log(`new expr ${s.value}`);
        else if(state === ss.oper)
          console.log(`new term ${s.value}`);
        else
          throw `${s.cls} after ${state}`;
        //expr = new Atom(s.cls = cc.digit ? BigInt(s.value) : s.value);
        state = ss.expr;
        break;
      case cc.alpha:
        if(state === ss.base)
          console.log(`new expr ${s.value}`);
        else if(state === ss.oper)
          console.log(`new term ${s.value}`);
        else
          throw `${s.cls} after ${state}`;
        state = ss.expr;
        break;
      case cc.open:
        if(state === ss.base)
          console.log('paren expr');
        else if(state === ss.expr)
          console.log('args');
        else if(state === ss.oper)
          console.log('paren term');
        else
          throw `${s.cls} after ${state}`;
        state = ss.base;
        break;
      case cc.close:
        if(state === ss.base)
          console.log('close imm');
        else if(state === ss.expr)
          console.log('close');
        else
          throw `${s.cls} after ${state}`;
        state = ss.expr;
        break;
      case cc.oper:
        if(state === ss.expr)
          console.log('oper');
        else if(state === ss.base && s.value === '-')
          console.log('minus');
        else
          throw `${s.cls} after ${state}`;
        state = ss.oper;
        break;
      case ',':
        if(state === ss.expr)
          console.log('stash expr');
        else
          throw `${s.cls} after ${state}`;
        state = ss.base;
        break;
      default:
        throw `unknown input ${s.value}`;
    }
  }
}
