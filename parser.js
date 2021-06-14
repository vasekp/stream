import {Node, Filter, Atom, Stream, InfStream} from './base.js';
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

function parse0(iter, close, array) {
  const ss = Enum.fromArray(['base', 'sym', 'term', 'oper']);
  let state = ss.base;
  let term = null;
  let ret = [];
  for(;;) {
    let {value: s, done} = iter.next();
    if(done)
      s = {value: '', cls: tc.close};
    switch(s.cls) {
      case tc.space:
        continue;
      case tc.number:
      case tc.string:
        if(state === ss.base || state === ss.oper) {
          const atom = new Atom(s.cls === tc.number ? BigInt(s.value) : s.value);
          if(term)
            throw 'atom.src'; // TODO: other opers
          term = atom;
        } else
          throw `${s.cls} after ${state}`;
        state = ss.term;
        break;
      case tc.ident:
        if(state === ss.base || state === ss.oper) {
          const node = new Node(s.value);
          node.src = term;
          term = node;
        } else
          throw `${s.cls} after ${state}`;
        state = ss.sym;
        break;
      case tc.open:
        if(state === ss.base) {
          switch(s.value) {
            case '[':
              term = new Node('array');
              term.args = parse0(iter, ']', true);
              state = ss.term;
              break;
            case '(':
              term = parse0(iter, ')', false);
              state = ss.term;
              break;
            case '{':
              term = parse0(iter, '}', false);
              state = ss.sym;
              break;
            default:
              throw `unknown open ${s.value}`;
          }
        } else if(state === ss.sym && s.value === '(') {
          term.args = parse0(iter, ')', true);
          state = ss.term;
        } else if(s.value === '{' && state === ss.oper) {
          // TODO compound
          term = parse0(iter, '}', false);
          state = ss.sym;
        } else if(s.value === '[' && (state === ss.sym || state === ss.term)) {
          const parts = new Node('part');
          parts.args = parse0(iter, ']', true);
          parts.src = term;
          term = parts;
          state = ss.term;
        } else
          throw `${s.cls} after ${state}`;
        break;
      case tc.close:
        if(s.value !== close)
          throw s.value ? `unexpected close ${s.value}` : 'unexpected end of input';
        if(state === ss.base) {
          if(!array)
            throw 'empty not allowed';
          else
            return [];
        } else if(state === ss.oper)
          throw 'unfinished expression';
        else {
          if(array) {
            ret.push(term);
            return ret;
          } else
            return term;
          return;
        }
      case tc.oper:
        if(state === ss.sym || state === ss.term)
          ;//console.log(`stash term, oper ${s.value}`);
        else if(state === ss.base && s.value === '-')
          // Unary minus
          term = new Atom(0);
        else
          throw `${s.cls} after ${state}`;
        state = ss.oper;
        break;
      case ',':
        if(!array)
          throw 'multi not allowed here';
        else if(state === ss.sym || state === ss.term)
          ret.push(term);
        else
          throw `${s.cls} after ${state}`;
        state = ss.base;
        term = null;
        break;
      default:
        throw `unknown input ${s.value}`;
    }
  }
}

export function parse(str) {
  return parse0(tokenize(str), '', false);
}
