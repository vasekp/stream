import StreamSession from './interface.js';
import mainReg from './register.js';

import * as fs from 'fs/promises';

const more_tests = [
  [['[1,1].nest([#[2],#[1]+#[2]])', '[[1,1],[1,2],[2,3],[3,5],...]']],
  [['1.nest({##})', '[1,1,1,1,...]']],
  [['iota.fold([#1,#2])', '[1,[1,2],[[1,2],3],...]']],
  [['seq.g(1).fl.td(1.rep)', '[1,3,5,7,9,11,13,...]']],
  [['"🏳️‍🌈".split:ord:tbase(16)', '["1f3f3","fe0f","200d","1f308"]']],
  [['iota:with(a=#,a+1)', '[2,3,4,5,6,...]']],
  [['{1.nest(#*#1).first(5)}@r(3)', '[[1,1,1,1,1],[1,2,4,8,16],[1,3,9,27,81]]']],
  [['{r(2):(#+#1)}.over(r(3))', '[[2,3],[3,4],[4,5]]']],
  [['r@r(7)', '[[1],[1,2],[1,2,3],...]']],
  [['recur([1],[1],join):len', '[1,1,2,3,5,8,13,21,...]']],
  [['{3.[2,#,#1,1].sort}@r(7)', '[[1,1,2,3],[1,2,2,3],[1,2,3,3],...]']],
  [['{{[#1,#1.len]}(r(7).droplast(#1))}@r(3)', '[[[1,2,3,4,5,6],6],[[1,2,3,4,5],5],[[1,2,3,4],4]]']],
  [['{#1.len}@(r@r(7))', '[1,2,3,4,5,6,7]']],
  [['pi:if(#>0,abc[#],#)', '["c","a","d","a","e","i","b","f",...]']],
  [['3.primes[#]', '5']],
  [['a=##+1', '["a"]'],
   ['a=r(##):a', '["a"]'] ,
   ['a=(#1+1).a', '["a"]'],
   ['a(7)', '[2,3,4,5,6,7,8,9]']],
  [['iota:(#-1)%[].nest(#~[#])', '[[0,[]],[1,[[]]],[2,[[],[[]]]],...]']],
  [['(1.nest(#*2))[65]', '18446744073709551616']],
  [['(0~1.nest(#~(#+1))).fl', '[0,1,1,2,1,2,2,3,1,2,2,3,...]']],
  [['0~iota.fold(#1~#2~#1,#2~#1,0).fl', '[0,1,0,2,0,1,0,3,0,...]']],
  [['1.nest((#~0)+(0~#))', '[1,[1,1],[1,2,1],[1,3,3,1],...]']],
  [['27.nest(if(#.odd,3*#+1,#/2))', '[27,82,41,124,62,...]']],
  [['iota:(#.nest(if(#.odd,3*#+1,#/2)).while(#>1).len)', '[0,1,7,2,5,8,16,3,19,6,...]']],
  [['iota:(#.nest(#/2).while(#>0).len)', '[1,2,2,3,3,3,3,4,4,...]']],
  [['iota:(#.nest(#/2).while(even).len)', '[0,1,0,2,0,1,0,3,0,...]']],
  [['iota.fold(times)', '[1,2,6,24,120,720,...]']],
  [['iota:{"caesar".split:ord(abc):(#+##):chrm(abc).cat}', '["dbftbs","ecguct","fdhvdu","geiwev",...]']],
  [['{"caesar".ords(abc):(#+#1):chrm(abc).cat}.over(iota)', '["dbftbs","ecguct","fdhvdu","geiwev",...]']],
  [['"caesar".nest(#.shift(1,abc))', '["caesar","dbftbs","ecguct","fdhvdu",...]']],
  [['"cxsd".split:ord(abc):(#*9):chrm(abc.first(8)~"ch"~abc.drop(8)).cat', '"zzchch"']],
  [['range(127761,127768):chr', '["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"]']],
  [['{5.nest((#^2).mod(10^#1)).fixed}(50)', '57423423230896109004106619977392256259918212890625']],
  [['{5.nest((#^2).mod(10^#1)).fixed.tdig(10,#1).first}@iota', '[5,2,6,0,9,8,2,1,2,8,1,9,9,5,2,6,...]']],
  [['abc[pi.while(#>0)].cat', '"cadaeibfecehigicbchdfbfdcchcbgie"']],
  [['r(7).(len.r(#))', '[1,2,3,4,5,6,7]']],
  [['with(a=3,with(b=a^2,with(c=b/2,with(a=c,a))))', '4']],
  [['with(a=3,(a^2).with(b=#,with(c=b/2,c)))', '4']],
  [['with(a=3,(a^2).with(b=#,with(c=b/2,with(a=c,a))))', '4']],
  [['r(100).perm.rnd.tally:last.tally', '[[1,100]]']],
  [['{((-1).rep(3)~1.rep(3)).perm:ac:count(#1).sum}@r(-3,3)', '[1,8,29,44,29,8,1]']],
  [['binom(10)', '[1,10,45,120,210,252,210,120,45,10,1]']],
  [['[1,2,3].tuples(2) = [1,2,3].td([1,0].cc).tuples(2) = tuples([1,2,3],[1,2,3]).td([1,0].cc)', 'true']],
  [['[1,1,2,2].perm = [1,1,2,2].g(1).fl.perm = [1,1,2,2].perm.g(1).fl(1)', 'true']],
  [['[0,1,2].tuples(3):fdig(3) = r(0,26)', 'true']],
  [['r(10).ss(2,0,2):(#:len).tally', '[[[2,0,2],1260]]']],
  [['[0,1,2].tuples(5):{##.perm=##.perm.td([1,0].cc)}.reduce(and)', 'true']],
  [['[1,1,2,2].perm = [1,1,2,2].g(1).fl.perm = [1,1,2,2].perm.g(1).fl(1)', 'true']],
//[['[0,1].tuples(40).rnd(1000):total.freq(r(40)):last', '']],
  [['("příliš žluťoučný kůň úpěl ďábelské ódy".split.where(#<>" ")~abc~"ch").sort.rle:first.cat(" ")', '"a á b c č d ď e é ě f g h ch i í j k l m n ň o ó p q r ř s š t ť u ú ů v w x y ý z ž"']],
//[['abc.perm.rnd.cat', '']],
  [['pi.iwhere(#=0)', '[33,51,55,66,72,78,86,98,...]']],
  [['iota.fold([#1,#2].len)', '[1,2,2,2,2,2,2,...]']],
  [['"The quick brown fox".lcase.split.includes@["d","f"]', '[false,true]']],
  [['r(7):with(n=#,range(n).perm.select(ineq@(#,range(n)).all).len)', '[0,1,2,9,44,265,1854]']],
  [['primes.map2([#1,#2]).sel(#[2]-#[1]=2)', '[[3,5],[5,7],[11,13],[17,19],...]']],
  [['primes.first(1000):mod(6).counts', '[[2,1],[3,1],[5,508],[1,490]]']],
  [['range(10000).iwhere(#.divisors.sum-#==#)', '[6,28,496,8128]']],
  [['iota(0):tdig(2):sum:mod(2) ; Thue-Morse', '[0,1,1,0,1,0,0,1,1,0,0,...]']],
  [['fib=recur(1,2,plus)', '["fib"]'],
   ['fibdec1=with(n=#1,fib.while(#<n).rev.fold(#1.mod(#2),#1/#2,n))', '["fibdec1"]'],
   ['fibdec2=fib.while(#<#1).rev.fold(#1.mod(#2),#1/#2,#1)', '["fibdec2"]'],
   ['fibdec1(42)', '[1,0,0,1,0,0,0,0]'],
   ['fibdec2(42)', '[1,0,0,1,0,0,0,0]'],
   ['(fib*$.rev).total', '42']],
  [['iota.sel(#.divisors.total = 2*#)', '[6,28,496,8128,...?]']],
  [['[1].nest(#.rle.flatten)', '[[1],[1,1],[1,2],[1,1,2,1],...]']],
  [['collatz = ##.nest(if(#.odd,3*#+1,#/2)).while(#<>1)', '["collatz"]'],
   ['(iota%iota:collatz:len).fold([#1,#2].max(last)).ddup', '[[1,0],[2,1],[3,7],[6,8],[7,16],...]']],
];

let passed = 0, failed = 0;

for(const [ident, obj] of mainReg) {
  if(ident !== obj.aliases[0])
    continue;
  if(!obj.help?.ex)
    continue;
  if(obj.help.skipTest)
    continue;
  const sess = new StreamSession();
  for(const [input, expOut, extra] of obj.help.ex) {
    const res = sess.eval(input);
    const realOut = res.result === 'ok' ? res.output : `!${res.error}`;
    let happy;
    if(realOut === expOut)
      happy = true;
    else if(expOut.endsWith('...]'))
      happy = realOut.substring(0, expOut.length - 4) === expOut.substring(0, expOut.length - 4);
    else if(extra?.skipTest)
      happy = true;
    else
      happy = false;
    if(!happy) {
      console.error(`Key:\t${obj.aliases[0]}`);
      console.error(`Input:\t${input}`);
      console.error(`Expect:\t${expOut}`);
      console.error(`Actual:\t${realOut}`);
      console.error();
    }
    if(happy)
      passed++;
    else
      failed++;
  }
}

for(const seq of more_tests) {
  const sess = new StreamSession();
  for(const [input, expOut] of seq) {
    const res = sess.eval(input);
    const realOut = res.result === 'ok' ? res.output : `!${res.error}`;
    let happy;
    if(realOut === expOut)
      happy = true;
    else if(expOut.endsWith('...]'))
      happy = realOut.substring(0, expOut.length - 4) === expOut.substring(0, expOut.length - 4);
    else
      happy = false;
    if(!happy) {
      console.error(`Input:\t${input}`);
      console.error(`Expect:\t${expOut}`);
      console.error(`Actual:\t${realOut}`);
      console.error();
    }
    if(happy)
      passed++;
    else
      failed++;
  }
}

console.log(`${passed} passed`);
console.log(`${failed} failed`);
