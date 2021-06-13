import {Filter, Atom, Stream, InfStream} from './base.js';
import Enum from './enum.js';

function asstr(s) {
  if(!(s instanceof Atom))
    throw 'not atom';
  const v = s.value;
  if(typeof v !== 'string')
    throw 'not string';
  return v;
}

const cc = Enum.fromArray(['digit', 'alpha']);
const tc = Enum.fromArray(['ident', 'number', 'string', 'space', 'open', 'close', 'oper']);

function charcls(c) {
  if(c >= '0' && c <= '9')
    return cc.digit;
  else if(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z')
    return cc.alpha;
  else
    return c;
}

function tokcls(c) {
  switch(c) {
    case ' ':
    case '\t':
    case '\n':
      return tc.space;
    case '(':
    case '[':
    case '{':
      return tc.open;
    case ')':
    case ']':
    case '}':
      return tc.close;
    case '.':
    case ':':
    case '+':
    case '-':
    case '*':
    case '/':
    case '%':
    case '~':
      return tc.oper;
    default:
      return c;
  }
}

function* tokenize(str) {
  const ss = Enum.fromArray(['base', 'ident', 'number', 'string', 'stresc']);
  let state = ss.base;
  let accum = '';
  for(const c of str) {
    if(state === ss.string) {
      if(c === '"') {
        yield {value: accum, cls: tc.string};
        state = ss.base;
      }
      else if(c === '\\')
        state = ss.stresc;
      else
        accum += c;
      continue;
    } else if(state === ss.stresc) {
      accum += c;
      state = ss.string;
      continue;
    } else if(c === '"') {
      state = ss.string;
      accum = '';
      continue;
    }
    let cls = charcls(c);
    switch(cls) {
      case cc.digit:
        if(state === ss.number) {
          accum += c;
          continue;
        }
        // fallthrough
      case cc.alpha:
        if(state === ss.ident) {
          accum += c;
          continue;
        }
    }
    if(state === ss.ident)
      yield {value: accum, cls: tc.ident};
    else if(state === ss.number)
      yield {value: accum, cls: tc.number};
    switch(cls) {
      case cc.digit:
        state = ss.number;
        accum = c;
        break;
      case cc.alpha:
        state = ss.ident;
        accum = c;
        break;
      default:
        yield {value: c, cls: tokcls(c)};
        state = ss.base;
    }
  }
  // end of input
  switch(state) {
    case ss.ident:
      yield {value: accum, cls: tc.ident};
      break;
    case ss.number:
      yield {value: accum, cls: tc.number};
      break;
    case ss.string:
    case ss.stresc:
      throw 'unterminated string';
    case ss.base: // default:
      // nothing to do
  }
  yield {value: '', cls: tc.close};
}

export function parse(str) {
  const ss = Enum.fromArray(['base', 'expr', 'oper']);
  let state = ss.base;
  for(const s of tokenize(str)) {
    console.log(s);
    /*switch(s.cls) {
      case cc.space:
        continue;
      case cc.number:
      case cc.string:
        if(state === ss.base)
          console.log(`new expr ${s.value}`);
        else if(state === ss.oper)
          console.log(`new term ${s.value}`);
        else
          throw `${s.cls} after ${state}`;
        //expr = new Atom(s.cls = cc.number ? BigInt(s.value) : s.value);
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
    }*/
  }
}
