import Enum from './enum.js';

export const catg = Enum.fromArray(['base', 'sources', 'streams', 'strings', 'numbers']);

const catNames = {
  en: {
    intro: 'Introduction',
    all: 'All filters',
    [catg.base]: 'Base functions',
    [catg.sources]: 'Sources',
    [catg.streams]: 'Stream ops',
    [catg.strings]: 'Strings',
    [catg.numbers]: 'Mathematical',
  }, cs: {
    intro: 'Úvod',
    all: 'Všechny filtry',
    [catg.base]: 'Základ',
    [catg.sources]: 'Zdroje',
    [catg.streams]: 'Proudy',
    [catg.strings]: 'Řetězce',
    [catg.numbers]: 'Matematika',
  }
};

const seeAlso = {
  en: ['See', 'See also'],
  cs: ['Viz', 'Viz též']
};

const map = new Map();

export const help = {
  register(names, obj) {
    if(!obj.cat)
      console.warn(`${names}: no category`);
    if(names instanceof Array) {
      const fname = names[0];
      for(const name of names)
        map.set(name, {names: [name], see: fname, merge: name[0] === fname[0]});
      map.set(fname, {names: names, ...obj});
    } else
      map.set(names, {names: [names], ...obj});
  },

  get(ident) {
    const obj = map.get(ident);
    if(!obj)
      return null;
    if(!obj.en && obj.see)
      return this.get(obj.see);
    else
      return obj;
  },

  formatText(obj) {
    let out = '';
    for(const n of obj.names) {
      let ln = '';
      if(obj.src)
        ln += `${obj.src}.`;
      else if(obj.reqSource)
        ln += '(...).';
      ln += n;
      if(obj.args)
        ln += `(${obj.args})`;
      else if(obj.minArg || obj.maxArg || obj.numArg)
        ln += `(...)`;
      out += `${ln}\n`;
    }
    out += '\n';
    for(const line of obj.en) {
      if(line[0] === '-')
        out += `[→] ${line.substring(1).replaceAll('_', '')}\n`;
      else if(line[0] === '!')
        out += `[!] ${line.substring(1).replaceAll('_', '')}\n`;
      else
        out += `${line.replaceAll('_', '')}\n`;
    }
    if(obj.see) {
      if(obj.see instanceof Array)
        out += `See also: ${obj.see.join(', ')}\n`;
      else
        out += `See also: ${obj.see}\n`;
    }
    out += '\nExamples:\n';
    let ln = 1;
    for(const e of obj.ex) {
      if(e[2]?.en)
        out += `> ${e[0]} ; ${e[2].en}\n`;
      else
        out += `> ${e[0]}\n`;
      if(e[1][0] === '!')
        out += `Error: ${e[1].substring(1)}\n`;
      else
        out += `$${ln++}: ${e[1]}\n`;
    }
    return out;
  },

  [Symbol.iterator]: map[Symbol.iterator].bind(map)
};

const entities = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;'};

async function populate() {
  const lang = new URLSearchParams(window.location.search).get('lang') === 'cs' ? 'cs' : 'en';
  if(document.body.id !== 'help')
    return;
  /*** Category selection ***/
  const cats = Object.keys(catNames[lang]);
  const head = document.getElementById('head');
  for(const cat of cats) {
    const ckbox = document.createElement('input');
    ckbox.type = 'radio';
    ckbox.name = 'category';
    ckbox.value = cat;
    ckbox.id = `cat-${cat}`;
    ckbox.hidden = true;
    ckbox.checked = cat === 'intro';
    head.parentElement.insertBefore(ckbox, head);
    const label = document.createElement('label');
    label.htmlFor = ckbox.id;
    label.textContent = catNames[lang][cat];
    head.append(label);
  }
  const css1 = cats.map(cat => `#cat-${cat}:checked ~ main section:not([data-cat~="${cat}"]) > *`).join(', ');
  const css2 = cats.map(cat => `#cat-${cat}:checked ~ header label[for="cat-${cat}"]`).join(', ');
  const css = `${css1} { display: none; } ${css2} { background: #eee; border-color: #888; }`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = URL.createObjectURL(new Blob([css], {type: 'text/css'}));
  document.head.append(link);
  /*** Load intro and filter documentation ***/
  document.getElementById('intro').innerHTML = await fetch(`./help-intro-${lang}.html`).then(r => r.text());
  await Promise.all([
    import('./filters/lang.js'),
    import('./filters/iface.js'),
    import('./filters/streams.js'),
    import('./filters/string.js'),
    import('./filters/combi.js'),
    import('./filters/numeric.js'),
  ]);
  const nav = document.getElementById('abc');
  const list = document.getElementById('filter-list');
  let lastLett = '';
  for(const name of [...map.keys()].sort()) {
    const obj = map.get(name);
    if(obj.merge)
      continue;
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
    sec.dataset.cat = 'all ';
    if(obj.cat) {
      if(obj.cat instanceof Array)
        sec.dataset.cat += obj.cat.join(' ');
      else
        sec.dataset.cat += obj.cat;
    }
    for(const n of obj.names) {
      const h = document.createElement('h3');
      if(obj.src)
        h.dataset.pre = `${obj.src}.`;
      else if(obj.reqSource)
        h.dataset.pre = '(...).';
      if(obj.args)
        h.dataset.post = `(${obj.args})`;
      else if(obj.minArg || obj.maxArg || obj.numArg)
        h.dataset.post = `(...)`;
      h.textContent = n;
      sec.append(h);
    }
    const desc = obj[lang] || obj.en;
    if(desc)
      for(let line of desc) {
        const p = document.createElement('p');
        if(line[0] === '-') {
          p.classList.add('info');
          line = line.substring(1);
        } else if(line[0] === '!') {
          p.classList.add('warn');
          line = line.substring(1);
        }
        const html = line
          .replace(/`([^``]*)`/g, (_, m) => {
            return '<i-pre>' + m.replace(/\w+|[<>&]/g, mm => {
              if(entities[mm])
                return entities[mm];
              else if(map.has(mm) && mm !== name)
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
      let html = `${seeAlso[lang][desc ? 1 : 0]} `;
      if(obj.see instanceof Array)
        html += obj.see.map(ident => {
          if(!map.has(ident))
            console.warn(`Broken help link ${obj.names[0]} => ${ident}`);
          return `<i-pre><a href="#id-${ident}">${ident}</a></i-pre>`
        }).join(', ');
      else {
        if(!map.has(obj.see))
          console.warn(`Broken help link ${obj.names[0]} => ${obj.see}`);
        html += `<i-pre><a href="#id-${obj.see}">${obj.see}</a></i-pre>`;
      }
      p.innerHTML = html + '.';
      sec.append(p);
    }
    if(obj.ex) {
      const exDiv = document.createElement('div');
      exDiv.classList.add('stream-example');
      let hi = 1;
      for(let [inp, out, comm] of obj.ex) {
        let html = inp
          .replace(/\w+|[<>&]/g, m => {
            if(entities[m])
              return entities[m];
            else if(map.has(m) && m !== name)
              return `<a href="#id-${m}">${m}</a>`;
            else
              return m;
          });
        if(comm && (comm[lang] || comm.en)) {
          html += ' <span class="comment">; ' + (comm[lang] || comm.en)
            .replace(/[<>&]/g, c => entities[c])
            .replace(/`([^``]*)`/g, (_, m) => {
              if(map.has(m) && m !== name)
                return `<a href="#id-${m}">${m}</a>`;
              else
                return m;
            }) + '</span>';
        }
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
  /*** Create links in Introduction ***/
  document.getElementById('intro').querySelectorAll('i-pre:not(.skiplink)').forEach(pre => {
    const html = pre.textContent
      .replace(/\w+|[<>&]/g, m => {
        if(entities[m])
          return entities[m];
        else if(map.has(m) && m !== name)
          return `<a href="#id-${m}">${m}</a>`;
        else if(m[0] === '_')
          return m.substring(1);
        else
          return m;
      });
    pre.innerHTML = html;
  });
  /*** Alter behaviour of links ***/
  function linkClick(e) {
    const id = e.currentTarget.href.split('#')[1];
    if(id.startsWith('id-')) {
      const cats = document.getElementById(id)?.dataset?.cat;
      if(cats && !cats.split(' ').some(cat => document.getElementById(`cat-${cat}`).checked))
        document.getElementById('cat-all').checked = true;
    }
    document.getElementById(id)?.scrollIntoView();
    e.preventDefault();
  }
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', linkClick));
}

if(typeof window !== 'undefined')
  window.addEventListener('DOMContentLoaded', populate);
