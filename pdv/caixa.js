/* Login e caixa central. Nunca guarda senha ou sessão de login no armazenamento local. */
const PdvCaixa=(()=>{
  const PONTE='https://script.google.com/macros/s/AKfycbx0BzhNgKhnkTRuVgU0dRokGeuw7JgN2vkZv5wxzBS5vn72Uz34xPPbrZPualqWSAH5zg/exec';
  let token='',usuario=null,estado={aberto:null,ultimo:null},expira=0,busy=false;
  const admin=()=>usuario&&usuario.papel==='master';
  const diaPermitido=d=>!!usuario&&(admin()||d===today());
  const lock=fn=>navigator.locks?navigator.locks.request('pdv-damiao-operacao',fn):Promise.reject(Error('Atualize o Chrome para usar o controle de caixa.'));
  async function api(acao,dados={}){
    if(!navigator.onLine)throw Error('Conecte à internet para esta operação.');
    const r=await fetch(CFG.url||PONTE,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({app:1,acao,dados,token}),redirect:'follow'});
    const j=await r.json();if(!r.ok||!j.ok)throw Error(j.erro||'Não foi possível confirmar a operação no Google.');expira=Date.now()+5*60*60*1000;return j.r;
  }
  function barra(){const b=document.querySelector('#pdvOperadorBar');if(!b||!usuario)return;const c=estado.aberto;b.querySelector('span').textContent=usuario.nome+' · '+CFG.caixa+' · '+(c?'Caixa aberto · saldo confirmado '+R$(c.esperado):'Caixa fechado');b.querySelector('#pdvUsuarios').hidden=!admin();document.querySelectorAll('[data-act="ajustes"]').forEach(x=>x.hidden=!admin());}
  function podeVender(){if(!usuario||Date.now()>expira){bloquear('Entre novamente para continuar.');return false;}if(!estado.aberto||estado.aberto.caixa!==CFG.caixa){toast('Abra o caixa antes de vender.');go('caixa');return false;}return true;}
  async function atualizar(){estado=await api('pdvEstado',{caixa:CFG.caixa});barra();return estado;}
  function bloquear(msg=''){token='';usuario=null;estado={aberto:null,ultimo:null};document.body.classList.add('pdv-locked');document.querySelector('#pdvLogin').hidden=false;document.querySelector('#pdvSenha').value='';document.querySelector('#pdvLoginErro').textContent=msg;}
  async function iniciar(){
    const bar=document.createElement('div');bar.id='pdvOperadorBar';bar.innerHTML='<span></span><button type="button" id="pdvVerCaixa">Abertura e fechamento</button><button type="button" id="pdvUsuarios" hidden>Usuários do PDV</button><button type="button" id="pdvSair">Sair / trocar operador</button>';document.querySelector('.topbar').after(bar);
    bar.querySelector('#pdvUsuarios').onclick=()=>acao(usuarios);
    bar.querySelector('#pdvVerCaixa').onclick=()=>estado.aberto?abrirFechamento():go('caixa');
    bar.querySelector('#pdvSair').onclick=async()=>{if(finalizando||Sync.busy){toast('Aguarde a venda terminar de salvar e enviar.');return;}if(cart.itens.length){toast('Conclua ou limpe a venda em andamento antes de sair.');return;}try{if(token)await api('pdvSair',{sessao:token});bloquear();}catch(e){toast(e.message);}};
    document.querySelector('#pdvEntrarForm').onsubmit=async e=>{e.preventDefault();const b=document.querySelector('#pdvEntrar');b.disabled=true;try{
      if(!DB.durable())throw Error('O armazenamento local está indisponível. Não é seguro registrar vendas neste navegador.');
      const r=await api('pdvEntrar',{email:document.querySelector('#pdvEmail').value,senha:document.querySelector('#pdvSenha').value});token=r.token;usuario=r.usuario;expira=Date.now()+5*60*60*1000;document.querySelector('#pdvSenha').value='';
      await atualizar();await Sync.catalogo();document.body.classList.remove('pdv-locked');document.querySelector('#pdvLogin').hidden=true;barra();renderNames();go(estado.aberto?'inicio':'caixa');if(CFG.url)Sync.enviar();
    }catch(x){bloquear(x.message);}finally{b.disabled=false;}};
    bloquear();
  }
  async function semPendencias(){await Sync.enviar(true);const p=(await DB.all('vendas')).filter(v=>v.alteracaoPendente||v.status==='pendente'||v.status==='erro');if(p.length)throw Error('Existem '+p.length+' venda(s) sem confirmação no Bling. Envie ou resolva os erros antes de movimentar ou fechar o caixa.');}
  async function abrir(){
    await atualizar();const anteriores=(await DB.all('vendas')).filter(v=>!v.caixaSessaoId&&['pendente','erro','enviada'].includes(v.status)&&v.caixa===CFG.caixa);
    if(anteriores.length){
      if(!admin()||estado.ultimo)throw Error('O Master deve conferir as vendas anteriores antes de iniciar o novo controle de caixa.');
      if(anteriores.some(v=>v.dia!==today()))throw Error('Há vendas de outros dias sem caixa. Solicite a conferência pelo Master.');
      const c=estado.aberto||await api('pdvAbrir',{caixa:CFG.caixa});await atualizar();
      for(const v of anteriores){v.caixaSessaoId=c.id;v.anteriorAoCaixa=true;v.operadorOriginal=v.operador;v.status='pendente';v.tentativas=0;v.erro='';await DB.put('vendas',v);}
      await Sync.enviar(true);await render();toast('Caixa aberto. Vendas anteriores vinculadas para conferência e envio sem duplicar.');return;
    }
    await semPendencias();await api('pdvAbrir',{caixa:CFG.caixa});await render();
  }
  async function acao(fn){if(busy)return;busy=true;try{await lock(fn);}catch(e){toast(e.message);const p=document.querySelector('#caixaPainel');if(p){let m=p.querySelector('.caixa-erro');if(!m){m=document.createElement('p');m.className='caixa-erro';p.prepend(m);}m.textContent=e.message;}}finally{busy=false;}}
  async function usuarios(){
    if(!admin())throw Error('Somente o Master gerencia usuários do PDV.');
    const lista=await api('listarUsuarios'),existente=lista.find(x=>x.email==='caixa');
    if(existente&&existente.papel!=='caixa')throw Error('O login caixa pertence a outro perfil. Confira o cadastro no App.');
    document.querySelector('#mUsuarioCaixa')?.remove();const modal=document.createElement('div');modal.id='mUsuarioCaixa';modal.className='modal';modal.innerHTML='<div class="dlg" role="dialog" aria-modal="true"><div class="body"></div></div>';document.body.append(modal);const p=modal.querySelector('.body');
    p.innerHTML='<h2>Usuário Caixa</h2><p>Login: <b>caixa</b>. Perfil: operador de caixa. Visualiza somente as vendas e os relatórios de hoje. O histórico completo e as configurações ficam com o Master.</p><form id="novoUsuarioCaixa" class="caixa-form"><label>Nome<input value="Caixa" readonly></label><label>Usuário<input value="caixa" readonly autocomplete="username"></label><label>'+ (existente?'Nova senha':'Defina a senha') +'<input name="senha" type="password" minlength="6" required autocomplete="new-password"></label><button type="submit" class="btn">'+(existente?'Atualizar senha do Caixa':'Criar usuário Caixa')+'</button><button type="button" class="btn" id="voltarUsuarioCaixa">Voltar</button><p id="usuarioCaixaMsg" role="status"></p></form>';
    p.querySelector('#voltarUsuarioCaixa').onclick=()=>modal.remove();
    p.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;acao(async()=>{if(!admin())throw Error('Somente o Master gerencia usuários do PDV.');await api('salvarUsuario',{id:existente?.id,nome:'Caixa',email:'caixa',papel:'caixa',senha:f.elements.senha.value,ativo:'sim'});f.elements.senha.value='';p.querySelector('#usuarioCaixaMsg').textContent='Usuário Caixa salvo. Entre no PDV com o usuário caixa e a senha definida.';f.querySelector('[type="submit"]').disabled=true;});};
  }
  async function render(){
    let p=document.querySelector('#caixaPainel');if(!p){p=document.createElement('section');p.id='caixaPainel';p.className='caixa-painel';document.querySelector('#s-caixa .pg').prepend(p);}
    if(!usuario){p.textContent='Entre para acessar o caixa.';return;}
    try{if(navigator.onLine)await atualizar();}catch(e){p.innerHTML='<p class="caixa-erro">'+esc(e.message)+'</p>';return;}
    const c=estado.aberto||estado.ultimo,ab=estado.aberto;
    if(c?.saldoAnterior){p.innerHTML='<h2>'+esc(CFG.caixa)+' · '+(ab?'Caixa anterior pendente':'Caixa fechado')+'</h2><p>Saldo do sistema para a abertura: <b>'+R$(c.esperado)+'</b>. O histórico de outros dias está disponível somente ao Master.</p>'+(ab?'<p>Solicite ao Master a conferência do caixa anterior.</p>':'<button class="btn" id="abrirSaldoAnterior">Abrir caixa com '+R$(c.esperado)+'</button>');const b=p.querySelector('button');if(b)b.onclick=()=>acao(abrir);return;}
    p.innerHTML='<h2>'+esc(CFG.caixa)+' · '+(ab?'Caixa aberto':'Caixa fechado')+'</h2><p>A próxima abertura usa o saldo registrado no sistema. A contagem física e a diferença ficam no histórico.</p>'+(c?`<p>${ab?'Aberto':'Último fechamento'} · ${esc(c.operador)} · ${dtBR(ab?c.abertoEm:c.fechadoEm)}</p><div class="caixa-valores"><div>Abertura<strong>${R$(c.inicial)}</strong></div><div>Vendas em dinheiro<strong>${R$(c.vendasDinheiro)}</strong></div><div>Suprimentos<strong>${R$(c.suprimentos)}</strong></div><div>Sangrias<strong>${R$(c.sangrias)}</strong></div><div>Saldo do sistema<strong>${R$(c.esperado)}</strong></div>${!ab?`<div>Dinheiro contado<strong>${R$(c.contado)}</strong></div><div class="caixa-diferenca">Diferença<strong>${R$(c.diferenca)}</strong></div>`:''}</div>`:'<p>Primeira abertura: <b>R$ 0,00</b>.</p>')+`<div class="caixa-acoes">${ab?'<button class="btn" data-caixa="suprimento">Registrar suprimento</button><button class="btn" data-caixa="sangria">Registrar sangria</button><button class="btn" data-caixa="fechar">Fechar caixa</button>':'<button class="btn" data-caixa="abrir">Abrir caixa com '+R$(c?c.esperado:0)+'</button>'}${c?'<button class="btn" data-caixa="imprimir">Imprimir conferência</button>':''}<button class="btn" data-caixa="atualizar">Atualizar</button></div><div id="caixaFormulario"></div>`+(c?`<table class="caixa-mov"><thead><tr><th>Hora</th><th>Movimento</th><th>Responsável / motivo</th><th>Valor</th></tr></thead><tbody>${c.movimentos.map(m=>`<tr><td>${dtBR(m.em)}</td><td>${esc(m.tipo)}</td><td>${esc(m.operador)} · ${esc(m.motivo)}</td><td>${R$(m.tipo==='venda'?m.dinheiro:m.valor)}</td></tr>`).join('')}</tbody></table>`:'');
    p.querySelectorAll('[data-caixa]').forEach(b=>b.onclick=()=>{const tipo=b.dataset.caixa;if(tipo==='imprimir'){imprimir(c);return;}if(tipo==='atualizar'){acao(render);return;}if(tipo==='abrir'){acao(abrir);return;}formulario(tipo);});
    if(ab&&admin()&&!estado.ultimo){const antigas=(await DB.all('vendas')).filter(v=>!v.caixaSessaoId&&v.caixa===CFG.caixa&&['pendente','erro','enviada'].includes(v.status));if(antigas.length){const b=document.createElement('button');b.className='btn';b.textContent='Conferir '+antigas.length+' venda(s) anteriores ao novo controle';b.onclick=()=>acao(abrir);p.append(b);}}
  }
  function abrirFechamento(){
    if(!usuario||Date.now()>expira){bloquear('Entre novamente para continuar.');return;}
    if(cart.itens.length){toast('Conclua ou limpe a venda em andamento antes de fechar o caixa.');return;}
    if(!estado.aberto){toast('Abra o caixa antes de acessar o fechamento.');go('caixa');return;}
    go('fechamento');const box=document.querySelector('#fechamentoConteudo');
    box.innerHTML=`<form id="formFechamentoCaixa"><h1 class="fechamento-titulo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M9 4h10v16H9M3 12h11m-4-4 4 4-4 4"/></svg>Fechamento de caixa</h1><p class="fechamento-subtitulo">Informe os valores</p><label class="fechamento-campo" for="fechamentoDinheiro">Dinheiro</label><div class="fechamento-dinheiro"><span aria-hidden="true">R$</span><input id="fechamentoDinheiro" name="valor" value="0,00" inputmode="decimal" autocomplete="off" required aria-label="Dinheiro contado na gaveta"></div><p class="fechamento-erro" id="fechamentoErro" role="alert" hidden></p><button type="submit" class="fechamento-enviar">Fechar caixa</button></form>`;
    const f=box.querySelector('form'),erro=box.querySelector('#fechamentoErro'),b=f.querySelector('[type="submit"]');
    f.elements.valor.onblur=()=>{try{f.elements.valor.value=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false}).format(PdvMoney.centavos(f.elements.valor.value)/100);}catch(e){erro.hidden=false;erro.textContent=e.message;}};
    f.onsubmit=e=>{e.preventDefault();acao(async()=>{b.disabled=true;erro.hidden=true;try{
      if(cart.itens.length)throw Error('Conclua ou limpe a venda em andamento primeiro.');
      const contado=PdvMoney.centavos(f.elements.valor.value);await semPendencias();await atualizar();if(!estado.aberto)throw Error('O caixa já foi fechado.');
      const justificativa=contado===estado.aberto.esperado?'':'Diferença apurada na contagem física; motivo não informado.';
      const fechamento=await api('pdvFechar',{sessaoId:estado.aberto.id,contado,justificativa});
      estado={aberto:null,ultimo:fechamento};go('caixa');toast('Fechamento registrado. Imprimindo relatório.');imprimir(fechamento);
    }catch(e){erro.hidden=false;erro.textContent=e.message;throw e;}finally{b.disabled=false;}});};
    f.elements.valor.focus();f.elements.valor.select();
  }
  function formulario(tipo){
    if(tipo==='fechar'){abrirFechamento();return;}
    const id=uid(),box=document.querySelector('#caixaFormulario');
    box.innerHTML=`<form class="caixa-form"><h3>${tipo==='sangria'?'Retirada de dinheiro — sangria':'Entrada de dinheiro — suprimento'}</h3><label>Valor em dinheiro (R$)<input name="valor" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label><label>Motivo do movimento<textarea name="motivo" required minlength="3"></textarea></label><p>Este movimento registra somente dinheiro físico. Não altera PIX, cartão ou contas no Bling.</p><button class="btn" type="submit">Confirmar movimento</button><button class="btn" type="button" data-cancel>Voltar sem registrar</button></form>`;
    box.querySelector('[data-cancel]').onclick=()=>box.replaceChildren();
    box.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;acao(async()=>{const valor=PdvMoney.centavos(f.elements.valor.value);if(cart.itens.length)throw Error('Conclua ou limpe a venda em andamento primeiro.');await semPendencias();await atualizar();if(!estado.aberto)throw Error('O caixa já foi fechado.');await api('pdvMovimento',{id,sessaoId:estado.aberto.id,tipo,valor,motivo:f.elements.motivo.value});await render();toast('Movimento registrado.');});};box.querySelector('input').focus();
  }
  function relatorioHTML(c){
    const fechado=c.status==='fechado',mov=c.movimentos||[],dif=fechado?c.contado-c.esperado:null;
    const formas=Object.entries(c.formas||{}).filter(([n])=>!/dinheiro/i.test(n));
    const total=c.inicial+c.totalVendas+c.suprimentos-c.sangrias;
    const linha=(n,v)=>'<div class="fr-linha"><span>'+esc(n)+'</span><span>'+esc(String(v))+'</span></div>';
    const titulo=t=>'<div class="fr-titulo">'+t+'</div>';
    const valor=v=>v==null?'—':R$(v);
    const metodos=[{nome:'Dinheiro',informado:fechado?c.contado:null,registrado:c.esperado},...formas.map(([nome,v])=>({nome,informado:null,registrado:v}))];
    return '<article class="fechamento-recibo"><header>'+esc(String(CFG.cabecalho)).replaceAll('\n','<br>')+'</header>'+titulo('VALORES DE FECHAMENTO<br>'+(fechado?'FECHAMENTO DE CAIXA':'CONFERÊNCIA — CAIXA ABERTO'))+
    [['PDV:',c.caixa],['Caixa:',c.operador],['Abertura:',dtBR(c.abertoEm)],...(c.fechadoEm?[['Fechamento:',dtBR(c.fechadoEm)]]:[]),['Valor de abertura:',R$(c.inicial)],['Valor de fechamento:',R$(c.esperado)],['Valor de venda (Dinheiro):',R$(c.vendasDinheiro)],['Total de vendas:',mov.filter(m=>m.tipo==='venda').length]].map(([n,v])=>linha(n,v)).join('')+
    titulo('RESULTADO OPERACIONAL')+[['FATURAMENTO BRUTO:',c.totalVendas],['(+) Valor de abertura:',c.inicial],['(+) Suprimentos:',c.suprimentos],['(-) Sangrias:',c.sangrias],['RESULTADO OPERACIONAL:',total]].map(([n,v])=>linha(n,R$(v))).join('')+
    titulo('VALORES INFORMADOS')+'<table class="fr-tabela"><thead><tr><th>Método</th><th>Informado</th><th>Registrado</th></tr></thead><tbody>'+metodos.map(l=>'<tr><td>'+esc(l.nome)+'</td><td>'+valor(l.informado)+'</td><td>'+valor(l.registrado)+'</td></tr>').join('')+'</tbody><tfoot><tr><td>TOTAL</td><td>'+ (metodos.length===1?valor(fechado?c.contado:null):'—') +'</td><td>'+R$(total)+'</td></tr></tfoot></table><p class="fr-nota">— = valor não informado. Dinheiro registrado: saldo da gaveta; demais formas: vendas.</p>'+
    (fechado?linha('DIFERENÇA EM DINHEIRO',R$(dif))+'<p class="fr-resultado">'+(dif===0?'CONFERIDO — valor informado bate com o sistema':(dif<0?'FALTA: ':'SOBRA: ')+R$(Math.abs(dif)))+'</p><p class="fr-nota">Próxima abertura pelo sistema: '+R$(c.esperado)+'</p>':'')+
    titulo('SANGRIAS E SUPRIMENTOS')+(mov.filter(m=>m.tipo==='sangria'||m.tipo==='suprimento').map(m=>'<div class="fr-mov">'+linha(m.tipo==='sangria'?'Sangria':'Suprimento',R$(m.valor))+'<div>'+dtBR(m.em)+' · '+esc(m.operador)+'</div><div>'+esc(m.motivo)+'</div></div>').join('')||'<p class="fr-nota">Sem sangrias ou suprimentos.</p>')+
    '<div class="fr-assinatura">Assinatura:<div></div><p>'+esc(c.operador)+'</p></div><footer>PDV Damião<span>Impresso: '+dtBR(new Date().toISOString())+'</span></footer></article>';
  }
  function imprimir(c){
    if(c.saldoAnterior){toast('Somente o Master consulta relatórios de outros dias.');return;}
    printHTML(relatorioHTML(c));
  }
  async function imprimirAtual(){try{await atualizar();const c=estado.aberto||estado.ultimo;if(!c)throw Error('Nenhum caixa registrado.');imprimir(c);}catch(e){toast(e.message);}}
  return {alterarVenda:d=>api('pdvAlterarVenda',d),iniciar,podeVender,render,imprimirAtual,atualizar,lock,admin,diaPermitido,fechamento:abrirFechamento,catalogo:()=>api('pdvCatalogo'),versao:()=>api('pdvVersao'),get token(){return token;},get usuario(){return usuario;},get aberto(){return estado.aberto;},get autenticado(){return !!usuario&&Date.now()<expira;}};
})();
