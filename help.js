import Enum from './enum.js';
import mainReg from './register.js';

export const catg = Enum.fromArray(['base', 'sources', 'streams', 'strings', 'numbers']);

export const seeAlso = {
  en: ['See', 'See also'],
  cs: ['Viz', 'Viz též']
};

export function formatText(obj) {
  if(!obj.help.en && obj.help.see)
    return formatText(mainReg.get(obj.help.see));
  let out = '';
  for(const n of obj.aliases) {
    let ln = '';
    if(obj.help.src)
      ln += `${obj.help.src}.`;
    else if(obj.reqSource)
      ln += '(...).';
    ln += n;
    if(obj.help.args)
      ln += `(${obj.help.args})`;
    else if(obj.minArg || obj.maxArg || obj.numArg)
      ln += `(...)`;
    out += `${ln}\n`;
  }
  out += '\n';
  for(const line of obj.help.en) {
    if(line[0] === '-')
      out += `[→] ${line.substring(1).replaceAll('_', '')}\n`;
    else if(line[0] === '!')
      out += `[!] ${line.substring(1).replaceAll('_', '')}\n`;
    else
      out += `${line.replaceAll('_', '')}\n`;
  }
  if(obj.help.see) {
    if(obj.help.see instanceof Array)
      out += `See also: ${obj.help.see.join(', ')}\n`;
    else
      out += `See also: ${obj.help.see}\n`;
  }
  out += '\nExamples:\n';
  let ln = 1;
  for(const e of obj.help.ex) {
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
}
