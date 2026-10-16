# AutoGestão — chat de atendimento integrado ao CRM

## Rodar no Windows, sem Docker

Instale **Node.js 24 LTS**, que inclui npm. Abra um terminal na pasta extraída deste projeto, onde está `run-local.mjs`, e execute:

```powershell
node run-local.mjs
```

Na primeira execução, o programa instala as dependências, cria os arquivos `.env` com segredos aleatórios, aplica as migrações em um banco local, compila os projetos e cria a loja de demonstração. É necessário acesso à internet nessa primeira preparação. Mantenha esse terminal aberto; `Ctrl+C` encerra os serviços.

- Painel: http://localhost:5173/
- Vitrine e chat: http://localhost:5173/loja/loja-demo
- E-mail: `demo@autogestao.local`
- Senha de demonstração: `DemoChat2026!`

Os dados locais ficam em `.local-data` e são preservados ao reiniciar. Esse modo usa [PGlite](https://pglite.dev/docs/pglite-socket), um PostgreSQL embarcado para desenvolvimento. Sua tabela de controle de migrações é própria do lançador local; não use `prisma migrate deploy` sobre esse banco. Para instalação com PostgreSQL convencional, use a opção Docker abaixo.

## Experimentar o atendimento

1. Abra a vitrine e clique em **Conversar com a loja**.
2. Digite “Estou procurando uma moto”. O modo demo apresenta opções do estoque, sem chamar um modelo externo.
3. Clique em **Deixar contato**, preencha nome e telefone, escolha opcionalmente um veículo e autorize o retorno. O contato e um lead são registrados na mesma loja. Reenvio do formulário reutiliza o lead da conversa; novas conversas com o mesmo telefone reutilizam um lead aberto do site.
4. Clique em **Falar com vendedor**. As respostas automáticas param.
5. Em outra aba, entre no painel e abra **Atendimentos**. Selecione a conversa, clique em **Assumir** e responda. A resposta aparece no chat do cliente em até cerca de seis segundos.
6. Abra **Leads** para ver o interesse, o cliente, o veículo escolhido e o registro textual inicial da conversa. O histórico completo está em **Atendimentos**.
7. Use **Reativar IA** para voltar ao automático, ou **Encerrar**. O cliente pode iniciar outra conversa em **Novo atendimento**.

Cada aba do visitante mantém seu token em `sessionStorage`; recarregar essa aba retoma o histórico. Fechar a aba pode encerrar esse acesso. Tokens expiram em sete dias. A equipe consulta o histórico com login. O chat acompanha atualizações por consultas periódicas, sem WebSocket.

## Usar uma LLM local com Ollama

O chat também aceita uma LLM executada no seu próprio computador, sem chave OpenAI. Instale o [Ollama para Windows](https://ollama.com/download/windows), abra-o e baixe o modelo local:

```powershell
ollama pull qwen3:4b-instruct
```

O [Qwen3:4b](https://ollama.com/library/qwen3:4b-instruct) tem download de aproximadamente 2,5 GB. A memória necessária para executar é maior que o tamanho do arquivo e depende do contexto. Esse é um candidato inicial; a velocidade precisa ser medida no seu computador.

Em `autogestao-backend/.env`, configure:

```dotenv
CHAT_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b-instruct
OLLAMA_TIMEOUT_MS=120000
```

Pare e reinicie o sistema com `node run-local.mjs`. O Ollama normalmente permanece ativo na bandeja do Windows. Se não estiver atendendo, execute `ollama serve` em outro terminal. Se a porta já estiver ocupada pelo próprio Ollama, não inicie uma segunda instância.

O backend envia as mensagens para `/api/chat` do Ollama, sem chave de API externa. O backend consulta os controles do modelo e usa somente a resposta final; raciocínio interno não é enviado ao cliente. O contexto é limitado a 20 veículos disponíveis recentes e oito mensagens recentes; o histórico completo continua no banco. O modelo local pode ser mais lento e precisa de avaliação das respostas antes de atender clientes reais. Modelos com tag `cloud` são recusados nesse modo.

Se usar Docker com o Ollama instalado no Windows, troque a URL por `http://host.docker.internal:11434` e garanta que o serviço seja acessível pelo container. Esse caminho não foi testado nesta máquina. Para começar, prefira o lançador sem Docker.

A execução local não cobra por mensagem de uma API: você utiliza seu hardware e energia. Para atender clientes online continuamente, o computador que executa o modelo precisa permanecer ligado e acessível pelo backend. Não exponha a porta do Ollama diretamente aos visitantes; eles acessam apenas o chat do site.

O suporte possui testes automatizados e foi verificado com o Qwen3:4b-instruct instalado localmente. No teste de listagem dos dois veículos de demonstração, a resposta final levou cerca de cinco segundos. A velocidade pode variar com o computador e o contexto.

## Ativar a LLM pela OpenAI

Edite **somente** `autogestao-backend/.env`:

```dotenv
CHAT_PROVIDER=openai
OPENAI_API_KEY=sua_chave_da_API
OPENAI_MODEL=identificador_do_modelo_habilitado_na_sua_conta
```

Não compartilhe esse arquivo ou cole a chave no frontend. Pare e inicie novamente `node run-local.mjs`. A integração usa a [Responses API da OpenAI](https://developers.openai.com/api/docs/guides/text), com armazenamento da resposta no provedor desabilitado por `store: false`. A conversa continua armazenada no banco da loja. As mensagens enviadas pelo cliente e um recorte de campos públicos do estoque são enviados ao modelo para responder. Nome e telefone do formulário não são acrescentados automaticamente ao contexto do modelo.

O projeto não inclui chave de API. A execução com LLM real depende da sua conta, do modelo configurado e da disponibilidade do serviço, e pode gerar cobrança por uso. No modo `demo`, o atendimento automático é uma simulação determinística, não uma LLM. Se o provedor falhar, o chat oferece atendimento humano e preserva o histórico.

O assistente vê até 80 veículos disponíveis mais recentes por loja. Consultas específicas fora desse recorte precisam de um vendedor. Não há extração automática de telefone/CPF, emissão de notas, reserva ou alteração de preço pela IA. O registro de contato acontece pelo formulário explícito. O resumo inicial do lead é textual, com mensagens do próprio visitante; não é um resumo gerado por LLM.

## Opção Docker com PostgreSQL convencional

Com Docker Desktop iniciado e Node instalado, execute na raiz:

```powershell
node setup.mjs
docker compose up --build
```

Esse caminho cria PostgreSQL 16, backend e frontend. O backend aplica `prisma migrate deploy` antes de iniciar. Para parar preservando o banco:

```powershell
docker compose down
```

As URLs e credenciais de demonstração são as mesmas. Não execute o modo local e o Docker simultaneamente: ambos usam as portas 5433, 3000 e 5173. Não foi possível construir/testar os containers nesta máquina porque o Docker Desktop estava indisponível; o arquivo Compose foi validado e o modo sem Docker foi executado e testado.

## Usar uma loja própria

No painel, escolha **Criar conta** e informe nome e identificador da loja. A vitrine usa `http://localhost:5173/loja/SEU-SLUG`. Cadastre veículos no estoque; o chat consulta somente veículos disponíveis dessa revenda. A configuração do provedor/modelo é global para esta instalação; conversas e dados são separados por loja.

## Testes

Dentro de `autogestao-backend`:

```powershell
npm run prisma:generate
npm run build
npm run test:chat
```

Os testes criam um PostgreSQL embarcado temporário, aplicam as migrações SQL e usam Prisma para verificar isolamento de sessão/revenda, envio repetido, consentimento, deduplicação, transferência, descarte de resposta pendente e falha de provedor. O contrato HTTP da OpenAI é testado com uma resposta simulada; não foi feita chamada real de LLM sem chave.

Dentro de `autogestao-frontend`:

```powershell
npm run build
```

O build inclui a checagem TypeScript da aplicação acessível a partir de `main.tsx`.

## O que foi acrescentado e corrigido

- Chat público, histórico persistido, sessão aleatória com hash no banco, prazo de acesso e limites por mensagem/conversa.
- Caixa paginada de atendimentos, responsável, resposta humana, encerramento e retorno ao assistente.
- Registro autorizado de contato, deduplicação por telefone dentro da loja e vínculo com veículo validado.
- Migração de conversas/mensagens, exemplo local e instruções de execução.
- Validação de usuário ativo em JWT/refresh; vínculos de leads validados pela revenda.
- Campos adicionais de clientes/leads preservados no cadastro; tipos de CRM alinhados.
- Resposta pública de veículos com lista explícita de campos, sem custo, chassi ou Renavam.
- Cobrança e fiscal antigos são opcionais por `ENABLE_BILLING` e `ENABLE_FISCAL`, desativados na configuração de demonstração. Para ativá-los, forneça as configurações exigidas pelos módulos.

## Limitações antes de publicar

Esta entrega implementa o chat solicitado, não corrige todo o diagnóstico anterior do sistema. Os módulos legados de vendas, financeiro, promissórias e cobrança ainda precisam das correções apontadas na análise original. Também existem alertas de dependências já identificados. Use esta versão inicialmente para desenvolvimento/homologação.

Para publicar, configure HTTPS, origem CORS e a URL da API do frontend, troque as credenciais de demonstração e use PostgreSQL convencional com backup. Defina aviso de privacidade, prazo de retenção das conversas e orçamento/limites na conta do provedor. Os limites atuais são 5 novas sessões/minuto/IP, 12 envios/minuto/IP, 2.000 caracteres por mensagem e aproximadamente 190 mensagens por conversa; não constituem um teto financeiro diário. Não há WhatsApp, notificação externa de vendedor, captura automática de horário/endereço ou configurações de atendimento por loja nesta primeira versão.

Se aparecer “porta em uso”, encerre a execução anterior. Se `npm ci` falhar, confira o acesso ao registro npm. Se o chat informar indisponibilidade da IA, confira `OPENAI_API_KEY`, `OPENAI_MODEL`, saldo/permissões da conta e reinicie o backend. O modo demo continua disponível com `CHAT_PROVIDER=demo`.

O lançador local agora escolhe portas livres automaticamente quando 5433, 3000 ou 5173 estiverem ocupadas. Use os endereços exibidos no terminal; a URL da API e o CORS são ajustados automaticamente.

## CRM comercial
O menu CRM foi ampliado com funil, lista, agenda, histórico, tarefas e controle por vendedor. Consulte CRM-GUIA.md para a atualização e os fluxos de uso.
