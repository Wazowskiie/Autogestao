// Mapa do sistema que a assistente usa para explicar onde fica cada coisa.
// Quando uma tela mudar, atualize este texto.
export const SYSTEM_GUIDE = `
Menu da esquerda e o que tem em cada tela:
- Dashboard: resumo do mês (estoque, leads, vendas, receita), leads recentes e veículos parados há mais de 30 dias.
- Estoque: lista de veículos. "Adicionar veículo" abre o cadastro; digitando a placa completa, marca, modelo, ano, cor e combustível se preenchem sozinhos (consulta de placa). Clicando na linha do veículo abre o painel "Dados do veículo" com as abas:
  · Veículo (todos os dados do cadastro) · Arquivos (CRLV, documentos do fornecedor, links) · NF-e / RENAVE (notas emitidas e recebidas, importar XML, situação da entrada e saída no RENAVE) · Mídias (enviar fotos, escolher a capa com a estrela) · Lançamentos (orçamentos, despesas e receitas do veículo; despesa pode somar ao custo) · Resumo (custo total, lucro, margem, dias em estoque) · Web (título, preço web, promoção, YouTube, destaque) · Entrada (fornecedor, documento em nome de, valores de compra, quitação e débitos) · Pendências (lista de coisas a resolver) · Financeiro (tudo que entrou e saiu daquele veículo).
  O lápis edita, o globo publica no site e a lixeira exclui.
- Vendas: "Registrar venda" → escolher veículo e cliente (dá pra cadastrar cliente novo ali mesmo), custo e preço. Bloco "Veículo na troca": adicionar o veículo que o cliente deu, buscar pela placa e informar a avaliação (ele entra sozinho no estoque). Bloco "Formas de pagamento": adicionar quantas formas precisar (PIX, dinheiro, cartão com parcelas e taxa da maquininha, financiamento, consórcio, promissórias). Só confirma quando aparecer "Pagamento fechado". Clicar numa venda mostra os detalhes.
- Clientes: cadastro e histórico dos clientes.
- CRM: funil de vendas (Novos, Em contato, Negociação, Ganhos, Perdidos), lista, agenda de tarefas, histórico de contatos, filtros e exportação CSV. "Novo lead" cria uma oportunidade; dá pra arrastar o cartão entre as colunas. Vendedor vê só os próprios leads.
- Atendimentos: conversas do chat do site com clientes. "Assumir" passa a conversa para um vendedor; "Reativar IA" volta para o automático.
- Vendedores: cadastro da equipe e comissões (só dono/admin).
- Financeiro: receitas e despesas, pagas e a pagar, por mês. Lançamentos de vendas e de veículos entram aqui sozinhos.
- Promissórias: notas a receber, vencidas e pagas; marcar como paga.
- Peças: estoque de peças com código, quantidade, custo e preço.
- Renave: configuração da integração com o Renave Fácil.
- Meu Site / vitrine: página pública da loja com os veículos disponíveis e o chat de atendimento.
- Configurações (menu lateral): abas Loja (nome, CNPJ, telefone, cidade, logo, capa e cor do site), Juros das promissórias (tabela de faixas de parcelas: editar a porcentagem, adicionar faixa como 19x a 21x, apagar faixa; o juro total é aplicado sobre o valor parcelado), Nota fiscal (token e dados da Focus NFe, ambiente de homologação ou produção), Integrações (o que está ligado: NF-e, RENAVE, assistente, consulta de placa, chat) e Minha conta (mudar o nome e trocar a senha). Vendedores só veem Minha conta e a tabela de juros (sem editar).
- Plano: assinatura do sistema.
Atalho: o botão roxo da assistente (canto inferior direito) abre esta conversa em qualquer tela.
`;
