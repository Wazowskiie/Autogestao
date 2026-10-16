# CRM comercial da AutoGestão

## Iniciar a atualização

Na pasta do projeto, encerre a execução anterior com `Ctrl+C` e execute novamente:

```powershell
node run-local.mjs
```

O lançador aplica a nova migração e compila o sistema. Quando há migrações novas sobre um banco local existente, ele gera antes um backup recuperável em `.local-backups`. Os dados continuam em `.local-data`. O teste de restauração desse backup foi aprovado. As configurações do Ollama permanecem no seu `.env`; a atualização não exige cadastrar novamente sua loja ou seus veículos.

Abra o endereço que o terminal apresentar e entre com sua conta. A nova tela está no menu **CRM**. O lançador escolhe portas livres automaticamente.

## Funil, lista e filtros

O CRM possui cinco etapas: **Novos**, **Em contato**, **Negociação**, **Ganhos** e **Perdidos**. Use o seletor do cartão ou arraste-o para outra coluna. Para marcar uma oportunidade como perdida, informe um motivo. Leads ganhos com uma venda vinculada permanecem ganhos.

- **Funil:** mostra até 20 cartões por coluna inicialmente, com botão para carregar os próximos. As contagens consideram todo o filtro, não apenas os cartões visíveis.
- **Lista:** exibe registros paginados, cliente, interesse, responsável, origem, orçamento e próximo compromisso.
- **Agenda:** reúne tarefas pendentes, concluídas e canceladas; permite filtrar por hoje, vencidas ou a vencer.
- **Busca:** cliente, telefone, e-mail, veículo ou etiqueta.
- **Filtros:** etapa, origem, temperatura, responsável, datas de criação, leads sem responsável, tarefas vencidas e arquivados.

Os indicadores mostram total de leads, orçamento de oportunidades abertas, taxa de ganho e tarefas vencidas. A taxa é `leads ganhos / total de leads do filtro`. O orçamento em aberto é uma estimativa comercial, não receita recebida.

## Cadastro e edição

Clique em **Novo lead**. Você pode escolher um cliente existente ou informar nome, telefone e e-mail. Contatos já cadastrados são reutilizados pelo telefone ou e-mail, evitando criar novamente a mesma pessoa. Clientes ambíguos devem ser selecionados explicitamente.

Registre veículo de interesse, orçamento, pagamento pretendido, origem, temperatura, responsável, etiquetas e observações. A busca no formulário carrega clientes e veículos do conjunto de opções; continue digitando para encontrar um registro que não esteja na lista inicial.

Uma data em **Próximo contato** cria uma tarefa de retorno na agenda. Ao editar ou remover a data, essa tarefa é ajustada ou cancelada. Na ficha do lead, **Editar lead** permite atualizar os dados e limpar campos opcionais.

Na aba **Contato**, ajuste nome, telefone e e-mail, ou use os atalhos de ligação, WhatsApp e e-mail. Esses dados pertencem ao cadastro compartilhado do cliente e podem afetar outras oportunidades da mesma pessoa. Os atalhos abrem os aplicativos correspondentes; não enviam mensagens automaticamente.

## Histórico e tarefas

A ficha do lead tem uma linha do tempo com criação, edições, mudança de etapa, atribuições, tarefas, contatos, vendas vinculadas e entradas do chat. Registre uma anotação, ligação, conversa de WhatsApp, e-mail ou visita. Contatos realizados atualizam **Último contato**; anotações não alteram essa data.

Em **Tarefas**, crie título, detalhes, vencimento, prioridade, responsável e lembrete. O lembrete deve ser anterior ou igual ao vencimento. Conclua, cancele ou reabra uma tarefa. Reabrir uma tarefa exige que o lead esteja ativo.

O botão **Lembretes** apresenta tarefas vencidas ou cujo horário de lembrete já chegou. A consulta é renovada a cada 30 segundos com o painel aberto. Não há envio automático de WhatsApp/e-mail nem notificações externas em segundo plano nesta versão.

Ao concluir um lead como ganho ou perdido, as tarefas abertas são canceladas para evitar cobranças de retorno sobre oportunidades encerradas. O histórico é mantido.

## Permissões escolhidas

**Vendedor:** consulta e trabalha apenas os leads atribuídos a ele. Leads novos criados por um vendedor ficam automaticamente sob sua responsabilidade. Ele não pode reatribuir oportunidades a colegas nem arquivar/restaurar leads. Tarefas são limitadas ao vendedor e aos seus leads. As rotas antigas de leads também usam essa regra.

**Gestor (`owner` ou `admin`):** consulta todos os leads da sua loja, define responsáveis, distribui oportunidades vindas do chat e arquiva/restaura registros. Reatribuir um lead também transfere suas tarefas abertas vinculadas ao responsável anterior e ajusta o acesso às conversas.

O gestor deve cadastrar os vendedores na tela **Vendedores** para que apareçam no seletor de responsáveis. Leads sem responsável ficam visíveis apenas para os gestores até serem distribuídos. Dados de outra revenda não são acessíveis pelo CRM. Também foram limitados os acessos a clientes e vendas associados para evitar atalhos entre vendedores.

## Integração com o chat e vendas

Quando o visitante deixa contato no chat, o CRM registra o cliente, o interesse e uma atividade de origem **Site / chat**. Sem responsável definido, o gestor deve distribuir o lead.

Na ficha do lead, **Conversas → Abrir atendimento** leva ao histórico do chat. Em **Atendimentos**, **Abrir lead no CRM** faz o caminho inverso. Um vendedor só acessa os atendimentos dos próprios leads; um gestor pode consultar todos os atendimentos da loja.

Na aba **Venda**, escolha uma venda já registrada na tela Vendas. Ela precisa corresponder ao mesmo cliente e ao veículo de interesse. Uma venda não pode ser vinculada a dois leads. O vínculo marca a oportunidade como ganha e mantém o histórico. Esse fluxo não cria cobranças nem recebimentos: usa a venda existente.

## Arquivamento e exportação

Arquivar remove a oportunidade das listas ativas e dos lembretes sem apagar o histórico. Para restaurar, marque **Arquivados**, abra a ficha e clique em **Restaurar**. Apenas gestores podem executar essas ações.

**CSV** exporta os leads autorizados usando os filtros atuais. A exportação é limitada a 10.000 registros por vez; para conjuntos maiores, refine o filtro. Os campos de texto são escapados e neutralizados para reduzir o risco de fórmulas ao abrir em planilhas.

## Validação da entrega

- Build do backend e build do frontend com checagem de tipos aprovados.
- 28 testes de chat/CRM aprovados, usando migrações SQL e Prisma sobre PostgreSQL embarcado temporário.
- Dois testes do lançador aprovados, incluindo seleção de portas e recuperação do backup anterior à migração.
- Rotas HTTP verificadas com dois vendedores; acesso indevido, reatribuição indevida e dados inválidos recusados.
- Teste com 16 consultas simultâneas aprovado no modo local. O banco embarcado utiliza uma conexão de aplicação para impedir mistura de consultas; PostgreSQL convencional mantém sua configuração normal.
- Telas verificadas com cadastro de lead, registro de ligação, tarefa, conclusão e mudança de etapa.

Dentro de `autogestao-backend`, use `npm test` para compilar e executar os testes de chat/CRM. Na raiz, use `node --test scripts/local-ports.test.mjs scripts/local-migrations.test.mjs` para testar o lançador.

Esta entrega cobre a rotina comercial de CRM descrita acima. Importação em massa, campanhas e automações por serviços externos exigem uma etapa adicional. Os demais módulos legados do projeto ainda devem seguir as correções apontadas na análise original, especialmente cálculos financeiros e cobrança. A validação desta entrega foi local; Docker e hospedagem de produção não foram homologados aqui.
