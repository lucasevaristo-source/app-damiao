(function(root){
  'use strict';
  const core={
    centavos(text){const s=String(text).trim();if(!/^\d+(?:[,.]\d{1,2})?$/.test(s))throw Error('Informe um valor como 10,50, sem separador de milhares.');const [a,b='']=s.replace(',','.').split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>100000000)throw Error('Valor fora do limite.');return n;},
    esperado(inicial,vendas,suprimentos,sangrias){return inicial+vendas+suprimentos-sangrias;},
    pagamentos(pags,total,formas){let troco=Math.max(0,pags.reduce((s,p)=>s+p.valor,0)-total);const r=pags.map(p=>{const f=formas.find(f=>String(f.id)===String(p.formaId));let n=p.valor;if(f&&/dinheiro/i.test(f.nome)){const t=Math.min(n,troco);n-=t;troco-=t;}return {...p,valorLiquido:n};}).filter(p=>p.valorLiquido>0);if(troco||r.reduce((s,p)=>s+p.valorLiquido,0)!==total)throw Error('Confira os pagamentos e o troco em dinheiro.');return r;}
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=core;else root.PdvMoney=core;
})(typeof window!=='undefined'?window:globalThis);
