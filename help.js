import Enum from './enum.js';

export const catg = Enum.fromArray(['base', 'sources', 'streams']);

const catgNames = new Map();

catgNames.set('all', 'All');
catgNames.set(catg.base, 'Base functions');
catgNames.set(catg.sources, 'Sources');
catgNames.set(catg.streams, 'Stream ops');

const _map = new Map();

export const help = {
  register(names, obj) {
    if(names instanceof Array) {
      const fname = names[0];
      const names1 = [];
      for(const name of names) {
        if(name[0] === fname[0])
          names1.push(name);
        else
          _map.set(name, {names: [name], see: fname});
      }
      _map.set(fname, {names: names1, ...obj});
    } else
      _map.set(names, {names: [names], ...obj});
  }
};

async function populate() {
  if(document.body.id !== 'help')
    return;
  await Promise.all([
    import('./filters/lang.js'),
    import('./filters/iface.js'),
    import('./filters/streams.js'),
  ]);
  const head = document.getElementById('head');
  const nav = document.getElementById('abc');
  const list = document.getElementById('filter-list');
  const catSet = new Set();
  let lastLett = '';
  for(const name of [..._map.keys()].sort()) {
    const obj = _map.get(name);
    if(name[0].toUpperCase() !== lastLett) {
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
    const sec = document.createElement('section');
    sec.id = `id-${name}`;
    sec.dataset.cat = 'all';
    if(obj.cat) {
      catSet.add(obj.cat);
      if(obj.cat instanceof Array)
        sec.dataset.cat += ' ' + obj.cat.join(' ');
      else
        sec.dataset.cat += ` ${obj.cat}`;
    }
    for(const n of obj.names) {
      const h = document.createElement('h3');
      if(obj.reqSource)
        h.dataset.pre = obj.src ? `${obj.src}.` : '(...).';
      if(obj.args)
        h.dataset.post = `(${obj.args})`;
      else if(obj.minArg || obj.maxArg || obj.numArg)
        h.dataset.post = `(...)`;
      h.textContent = n;
      sec.append(h);
    }
    if(obj.en)
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
          return '<i-pre>' + m.replace(/\w+/g, mm => {
            if(_map.has(mm) && mm !== name)
              return `<a href="#id-${mm}">${mm}</a>`;
            else if(mm[0] === '_')
              return mm.substring(1);
            else
              return mm;
          }) + '</i-pre>';
        });
        p.innerHTML = html;
        sec.append(p);
      }
    if(obj.see) {
      const p = document.createElement('p');
      let html = obj.en ? 'See also ' : 'See ';
      if(obj.see instanceof Array)
        html += obj.see.map(ident => `<i-pre><a href="#id-${ident}">${ident}</a></i-pre>`).join(', ');
      else
        html += `<i-pre><a href="#id-${obj.see}">${obj.see}</a></i-pre>`;
      p.innerHTML = html + '.';
      sec.append(p);
    }
    if(obj.ex) {
      const exDiv = document.createElement('div');
      exDiv.classList.add('stream-example');
      let hi = 1;
      for(let [inp, out] of obj.ex) {
        const html = inp.replace(/`([^``]*)`/g, (_, m) => {
          if(_map.has(m))
            return `<a href="#id-${m}">${m}</a>`;
          else
            return m;
        });
        const d1 = document.createElement('div');
        d1.classList.add('input');
        d1.innerHTML = html;
        const d2 = document.createElement('div');
        if(out[0] !== '!') {
          d2.classList.add('output');
          d2.textContent = out;
          d2.dataset.pre = `$${hi++}: `;
        } else {
          d2.classList.add('error');
          d2.textContent = out.substring(1);
        }
        exDiv.append(d1, d2);
      }
      sec.append(exDiv);
    }
    list.append(sec);
  }
  /*** Category selection ***/
  const cats = [...catgNames.keys()].filter(cat => catSet.has(cat) || cat === 'all');
  for(const cat of cats) {
    const ckbox = document.createElement('input');
    ckbox.type = 'radio';
    ckbox.name = 'category';
    ckbox.value = cat;
    ckbox.id = `cat-${cat}`;
    ckbox.hidden = true;
    ckbox.checked = cat === 'all';
    head.parentElement.insertBefore(ckbox, head);
    const label = document.createElement('label');
    label.htmlFor = ckbox.id;
    label.textContent = catgNames.get(cat);
    head.append(label);
  }
  const css1 = cats.map(cat => `#cat-${cat}:checked ~ main section:not([data-cat~="${cat}"])`).join(', ');
  const css2 = cats.map(cat => `#cat-${cat}:checked ~ header label[for="cat-${cat}"]`).join(', ');
  const css = `${css1} { display: none; } ${css2} { background: #eee; border-color: #888; }`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = URL.createObjectURL(new Blob([css], {type: 'text/css'}));
  document.head.append(link);
}

if(typeof window !== 'undefined')
  window.addEventListener('DOMContentLoaded', populate);
