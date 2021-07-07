import Enum from './enum.js';

export const catg = Enum.fromArray(['lang']);

const _map = new Map();

export const help = {
  register(names, obj) {
    if(names instanceof Array) {
      const fname = name[0];
      const names1 = [];
      for(const name of names) {
        if(name[0] === fname[0])
          names1.push(name);
        else
          _map.set(name, {names: [name], see: fname});
      }
      _map.set(fname, {names: names1, ...obj});
    } else
      _map.set(names, {names, ...obj});
  }
};

function populate() {
  if(document.body.id !== 'help')
    return;
  const head = document.getElementById('head');
  const nav = document.getElementById('abc');
  const list = document.getElementById('filter-list');
  let lastLett = '';
  for(const name of [..._map.keys()].sort()) {
    if(name[0] !== lastLett) {
      lastLett = name[0].toUpperCase();
      const anchor = document.createElement('div');
      anchor.classList.add('anchor');
      anchor.id = `nav-${lastLett}`;
      list.append(anchor);
      const navItem = document.createElement('a');
      navItem.href = `#${anchor.id}`;
      navItem.textContent = lastLett;
      nav.append(navItem);
    }
    const obj = _map.get(name);
    const sec = document.createElement('section');
    sec.id = name;
    const h = document.createElement('h3');
    for(const n of obj.names) {
      const span = document.createElement('span');
      if(obj.reqSource)
        span.dataset.pre = '().';
      if(obj.args)
        span.dataset.post = `(${obj.args})`;
      else if(obj.minArg || obj.maxArg || obj.numArg)
        span.dataset.post = `(...)`;
      span.textContent = n;
      h.append(span);
    }
    sec.append(h);
    for(let line of obj.en) {
      const p = document.createElement('p');
      if(line[0] === '-') {
        p.classList.add('info');
        line = line.substring(1);
      } else if(line[0] === '!') {
        p.classList.add('warn');
        line = line.substring(1);
      }
      const html = line.replace(/`([^``]*)`/g, (_, m) => {
        if(_map.has(m))
          return `<i-pre><a href="#${m}">${m}</a></i-pre>`;
        else
          return `<i-pre>${m}</i-pre>`;
      });
      p.innerHTML = html;
      sec.append(p);
    }
    if(obj.ex) {
      const exDiv = document.createElement('div');
      exDiv.classList.add('stream-example');
      let hi = 1;
      for(let [inp, out] of obj.ex) {
        const html = inp.replace(/`([^``]*)`/g, (_, m) => {
          if(_map.has(m))
            return `<a href="#${m}">${m}</a>`;
          else
            return m;
        });
        const d1 = document.createElement('div');
        d1.classList.add('input');
        d1.textContent = html;
        const d2 = document.createElement('div');
        d2.classList.add('output');
        d2.textContent = out;
        d2.dataset.pre = `$${hi++}: `;
        exDiv.append(d1, d2);
      }
      sec.append(exDiv);
    }
    list.append(sec);
  }
}

if(typeof window !== 'undefined')
  window.addEventListener('DOMContentLoaded', populate);
