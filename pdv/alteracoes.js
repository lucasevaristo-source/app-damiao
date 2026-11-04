/* A senha autoriza somente a operação enviada. Nunca é persistida. */
const PdvAlteracoes=(()=>{
  let ocupado=false;
  const payload=v=>({id:v.id,numero:v.numero,caixa:v.caixa,caixaSessaoId:v.caixaSessaoId,data:v.dia,criadaEm:v.criadaEm,revisao:v.revisao||0,clienteId:v.cliente?.id||null,cpf:v.cpf||'',vendedorId:v.vendedorId||null,anteriorAoCaixa:!!v.anteriorAoCaixa,operadorOriginal:v.operadorOriginal,
    itens:v.itens.map(i=>({produtoId:i.produtoId,codigo:i.codigo,nome:i.nome,unidade:i.unidade,qtd:i.qtd,valor:i.preco/100,descontoPct:i.descPct||0})),desconto:v.desconto/100,total:v.total/100,pagamentos:v.pagamentos.map(p=>({formaId:p.formaId,valor:p.valorLiquido/100}))});
  const decimal=v=>(v/100).toFixed(2).replace('.',',');
  async function abrir(id,tipo){
    const v=await DB.get('vendas',id);
    if(!v||!PdvCaixa.diaPermitido(v.dia)){toast('Seu acesso permite somente vendas de hoje.');return;}
    if(v.status==='cancelada'){toast('Esta venda já foi excluída.');return;}
    if(cart.itens.length){toast('Conclua ou limpe a venda em andamento antes de corrigir outra.');return;}
    if(v.alteracaoPendente){tipo=v.alteracaoPendente.tipo;}
    const retomar=!!v.alteracaoPendente,editar=tipo==='editar',modal=document.createElement('div');modal.className='modal';modal.id='mAlterarVenda';
    const itemRow=i=>`<tr data-produto="${esc(i.produtoId)}"><td>${esc(i.nome)}<input type="checkbox" aria-label="Remover ${esc(i.nome)}" data-remover> Remover</td><td><input aria-label="Quantidade ${esc(i.nome)}" data-qtd value="${esc(String(i.qtd).replace('.',','))}" inputmode="decimal" required></td><td><input aria-label="Preço ${esc(i.nome)}" data-preco value="${decimal(i.preco)}" inputmode="decimal" required></td><td><input aria-label="Desconto percentual ${esc(i.nome)}" data-desconto value="${String(i.descPct||0).replace('.',',')}" inputmode="decimal" required></td></tr>`;
    const pagamentoRow=p=>`<div class="alteracao-pagamento"><select aria-label="Forma de pagamento">${CAT.formas.map(f=>`<option value="${esc(f.id)}" ${String(f.id)===String(p.formaId)?'selected':''}>${esc(f.nome)}</option>`).join('')}</select><input aria-label="Valor do pagamento" data-valor value="${decimal(p.valorLiquido||0)}" inputmode="decimal"><button type="button" data-tirar-pagamento>Remover</button></div>`;
    const descontoItens=v.itens.reduce((s,i)=>s+Math.round(i.preco*i.qtd*(i.descPct||0)/100),0);
    let itens=v.itens.map(i=>({...i}));
    modal.innerHTML=`<div class="dlg wide" role="dialog" aria-modal="true" aria-labelledby="alteracaoTitulo"><header><h3 id="alteracaoTitulo">${retomar?'Retomar correção':editar?'Editar venda':'Excluir venda'} ${esc(v.numero)}</h3><button type="button" data-voltar aria-label="Fechar">×</button></header><form id="alterarVendaForm"><div class="body">${retomar?'<p>A operação anterior ainda precisa ser confirmada. Será retomada com os mesmos dados, sem repetir uma correção já concluída.</p>':editar?`<div class="alteracao-tabela"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço (R$)</th><th>Desc. (%)</th></tr></thead><tbody id="alteracaoItens">${itens.map(itemRow).join('')}</tbody></table></div><label>Adicionar produto<select id="alteracaoProduto"><option value="">Selecione</option>${CAT.produtos.map(p=>`<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</select></label><label>Desconto geral (R$)<input name="descontoGeral" value="${decimal(Math.max(0,v.desconto-descontoItens))}" inputmode="decimal" required></label><strong>Pagamentos</strong><div id="alteracaoPagamentos">${v.pagamentos.map(pagamentoRow).join('')}</div><button type="button" id="alteracaoAdicionarPagamento" class="btn">Adicionar pagamento</button><label>CPF/CNPJ no pedido<input name="cpf" value="${esc(v.cpf||'')}"></label>`:'<p>A venda será cancelada no PDV e no Bling, com os estornos correspondentes. O histórico de auditoria será preservado.</p>'}
    <label>Motivo<textarea name="motivo" required minlength="3" ${retomar?'readonly':''}>${retomar?esc(v.alteracaoPendente.motivo):''}</textarea></label><label>Senha do Master<input name="senha" type="password" required autocomplete="off"></label><p id="alteracaoErro" role="alert"></p></div><footer><button type="button" class="btn" data-voltar>Voltar</button><button type="submit" class="btn">${retomar?'Retomar operação':editar?'Salvar alteração':'Excluir venda'}</button></footer></form></div>`;
    document.body.append(modal);const form=modal.querySelector('form'),erro=modal.querySelector('#alteracaoErro');
    const sair=()=>{if(ocupado)return;form.elements.senha.value='';modal.remove();};modal.querySelectorAll('[data-voltar]').forEach(b=>b.onclick=sair);
    if(editar&&!retomar){
      modal.querySelector('#alteracaoProduto').onchange=e=>{const p=CAT.produtos.find(x=>String(x.id)===e.target.value);if(!p)return;const i={produtoId:p.id,codigo:p.codigo,nome:p.nome,unidade:p.unidade,preco:Math.round(p.preco*100),precoOriginal:Math.round(p.preco*100),qtd:1,descPct:0};itens.push(i);modal.querySelector('#alteracaoItens').insertAdjacentHTML('beforeend',itemRow(i));e.target.value='';};
      modal.querySelector('#alteracaoAdicionarPagamento').onclick=()=>{modal.querySelector('#alteracaoPagamentos').insertAdjacentHTML('beforeend',pagamentoRow({formaId:CAT.formas[0]?.id,valorLiquido:0}));};
      modal.querySelector('#alteracaoPagamentos').onclick=e=>{if(e.target.closest('[data-tirar-pagamento]'))e.target.closest('.alteracao-pagamento').remove();};
    }
    form.onsubmit=async e=>{e.preventDefault();if(ocupado)return;ocupado=true;const button=form.querySelector('[type="submit"]');button.disabled=true;erro.textContent='';
      try{await PdvCaixa.lock(async()=>{
        if(Sync.busy)throw Error('Aguarde o envio das vendas terminar.');
        const atual=await DB.get('vendas',v.id);if(!atual||atual.status==='cancelada')throw Error('Venda indisponível. Atualize a lista.');
        if((atual.revisao||0)!==(v.revisao||0))throw Error('Esta venda foi alterada em outra janela. Abra novamente.');
        let op=atual.alteracaoPendente;
        if(!op){
          let nova=null;
          if(editar){
            nova={...atual,itens:[],pagamentos:[]};delete nova.alteracaoPendente;
            [...modal.querySelectorAll('#alteracaoItens tr')].forEach((row,k)=>{if(row.querySelector('[data-remover]').checked)return;const i={...itens[k]},q=Number(row.querySelector('[data-qtd]').value.replace(',','.')),d=Number(row.querySelector('[data-desconto]').value.replace(',','.'));if(!Number.isFinite(q)||q<=0||!Number.isFinite(d)||d<0||d>100)throw Error('Confira a quantidade e o desconto dos itens.');i.qtd=q;i.preco=PdvMoney.centavos(row.querySelector('[data-preco]').value);if(i.preco<=0)throw Error('O preço precisa ser maior que zero.');i.descPct=d;i.total=Math.round(i.preco*i.qtd*(1-d/100));nova.itens.push(i);});
            if(!nova.itens.length)throw Error('Mantenha ao menos um produto. Para remover a venda, use Excluir.');
            nova.subtotal=nova.itens.reduce((s,i)=>s+Math.round(i.preco*i.qtd),0);const liquido=nova.itens.reduce((s,i)=>s+i.total,0);nova.total=liquido-PdvMoney.centavos(form.elements.descontoGeral.value);if(nova.total<=0)throw Error('O total deve ser maior que zero.');nova.desconto=nova.subtotal-nova.total;
            const pagamentos=[...modal.querySelectorAll('.alteracao-pagamento')].map(row=>{const formaId=row.querySelector('select').value,f=CAT.formas.find(x=>String(x.id)===formaId);if(!f)throw Error('Selecione uma forma de pagamento válida.');return {formaId,nome:f.nome,valor:PdvMoney.centavos(row.querySelector('[data-valor]').value)};});
            nova.pagamentos=PdvMoney.pagamentos(pagamentos,nova.total,CAT.formas);nova.recebido=pagamentos.reduce((s,p)=>s+p.valor,0);nova.troco=Math.max(0,nova.recebido-nova.total);nova.cpf=form.elements.cpf.value.trim();
          }
          op={id:uid(),tipo,anterior:payload(atual),nova:nova?payload(nova):null,local:nova,motivo:form.elements.motivo.value.trim()};atual.alteracaoPendente=op;await DB.put('vendas',atual);
        }
        form.querySelectorAll('input:not([type="password"]),textarea,select,[data-tirar-pagamento],#alteracaoAdicionarPagamento').forEach(el=>el.disabled=true);
        const r=await PdvCaixa.alterarVenda({id:op.id,tipo:op.tipo,anterior:op.anterior,nova:op.nova,motivo:op.motivo,senha:form.elements.senha.value});
        const salva=op.local||atual;delete salva.alteracaoPendente;salva.revisao=r.revisao;salva.historicoAlteracoes=[...(atual.historicoAlteracoes||[]),r];
        if(op.tipo==='excluir')salva.status='cancelada';else {salva.status=r.bling?'enviada':'pendente';if(r.bling)salva.bling=r.bling;salva.tentativas=0;}
        salva.erro='';await DB.put('vendas',salva);form.elements.senha.value='';modal.remove();updateQueue();await renderVendas();await PdvCaixa.atualizar();toast(op.tipo==='excluir'?'Venda excluída com registro de auditoria.':'Venda alterada e caixa atualizado.');
      });}catch(x){erro.textContent=x.message;}finally{form.elements.senha.value='';ocupado=false;button.disabled=false;}
    };
    form.elements.senha.focus();
  }
  return {abrir,payload,get ocupado(){return ocupado;}};
})();
