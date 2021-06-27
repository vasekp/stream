export class StreamError extends Error {
  constructor(msg, node) {
    super();
    this.msg = msg;
    if(node)
      this.withNode(node);
  }

  withNode(node) {
    if(this.node)
      return this;
    this.node = node;
    this.pos = node.token.pos;
    this.len = node.token.value.length;
    this.desc = node.toString();
    return this;
  }
}

export class TimeoutError extends Error {
  constructor(count) {
    super();
    this.count = count;
  }
}

export class ParseError extends Error {
  constructor(msg, a1, a2) {
    super();
    this.name = 'ParseError';
    this.msg = msg;
    this.pos = typeof a1 === 'object' ? a1.pos : a1;
    this.len = typeof a2 === 'object' ? a2.pos + a2.value.length - this.pos
      : typeof a2 === 'number' ? a2 - this.pos
      : typeof a1 === 'object' ? a1.value.length
      : 1;
  }
}
