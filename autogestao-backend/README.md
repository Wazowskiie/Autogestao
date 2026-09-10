# AutoGestão — Backend

Backend multi-tenant da plataforma AutoGestão, construído com NestJS, Prisma ORM (PostgreSQL) e autenticação JWT com refresh token rotativo. Este pacote implementa a **Fase 1** do roadmap descrito em `arquitetura-backend-autogestao.md`: autenticação, multi-tenancy, onboarding e CRUD de veículos.

## Stack

- Node.js 20+ e TypeScript
- NestJS 11
- PostgreSQL + Prisma ORM 7 (arquitetura sem engine nativo, via driver adapter `@prisma/adapter-pg`)
- Argon2id para hash de senhas
- JWT (access token de 15 min + refresh token rotativo de 7 dias, em cookie httpOnly)
- class-validator / class-transformer para validação de entrada
- Helmet, CORS configurável e rate limiting (`@nestjs/throttler`)

## Pré-requisitos

- Node.js 20 ou superior
- Um banco PostgreSQL 14+ — o `docker-compose.yml` incluído sobe um em segundos, ou use uma instância já existente

## Configuração inicial

```bash
# 1. instalar dependências
npm install

# 2. subir um Postgres local (ou aponte DATABASE_URL no .env para o seu próprio banco)
docker compose up -d

# 3. gerar o Prisma Client
npx prisma generate

# 4. criar as tabelas no banco (gera a primeira migration automaticamente)
npx prisma migrate dev --name init

# 5. popular os planos (Básico e Profissional, espelhando a tela de Planos do front-end)
npx prisma db seed

# 6. iniciar a API em modo desenvolvimento
npm run start:dev
```

A API sobe em `http://localhost:3000/api/v1`.

> **Nota sobre o passo 3/4:** o Prisma 7 baixa um binário (`schema-engine`) na primeira vez que você roda `generate` ou `migrate`. Isso exige acesso normal à internet (não funciona em redes que bloqueiam `binaries.prisma.sh`). Numa máquina de desenvolvimento comum isso é transparente — só vai falhar em ambientes com rede restrita.

O arquivo `.env` já vem preenchido com valores compatíveis com o `docker-compose.yml`. Para produção, troque `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` por valores aleatórios fortes (ex.: `openssl rand -base64 48`) e ajuste `DATABASE_URL`/`CORS_ORIGINS`.

## Estrutura

```
src/
  auth/            # registro (onboarding), login, refresh, logout, /me
  vehicles/         # CRUD de veículos (escopado por revenda)
  common/
    decorators/     # @Public, @Roles, @CurrentUser
    guards/         # JwtAuthGuard (global), RolesGuard (global)
  prisma/           # PrismaService (injeta o client em toda a app)
  generated/prisma/  # client gerado pelo Prisma — criado por `prisma generate`, não versionar
prisma/
  schema.prisma     # modelo de dados completo (13 entidades)
  seed.ts           # planos Básico/Profissional
```

## Como funciona o multi-tenancy

Cada revenda (`Dealership`) é o tenant. Toda tabela de negócio tem uma coluna `dealership_id`, e o `dealershipId` do usuário autenticado vem embutido no JWT (`sub`, `dealershipId`, `role`). Os services nunca confiam em um id vindo do cliente sem also filtrar por `dealershipId` — por isso uma revenda não consegue ler, editar ou apagar dados de outra mesmo que descubra o id de um registro (testado manualmente: buscar um veículo de outra revenda por id retorna 404, não os dados).

Os papéis (`owner`, `admin`, `seller`) são controlados pelo decorator `@Roles(...)` + `RolesGuard`. Hoje só o módulo de veículos usa isso (criar/editar exige `owner`, `admin` ou `seller`; apagar exige `owner` ou `admin`), mas o mesmo padrão se aplica a qualquer módulo novo.

## Limite de veículos por plano

`VehiclesService` verifica, antes de criar um veículo, se a revenda já tem uma `Subscription` ativa e se o número atual de veículos atingiu o `vehicleLimit` do `Plan`. Enquanto não existir cobrança real (fase 4 do roadmap), revendas sem assinatura não são bloqueadas — a checagem só entra em vigor quando uma subscription existe.

## Endpoints implementados

### Autenticação (`/api/v1/auth`)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/register` | Cria a revenda + usuário `owner` (onboarding) e já retorna tokens |
| POST | `/login` | Login por e-mail/senha |
| POST | `/refresh` | Rotaciona o refresh token (lido do cookie httpOnly) |
| POST | `/logout` | Revoga o refresh token atual |
| GET | `/me` | Retorna o usuário e a revenda autenticados |

### Veículos (`/api/v1/vehicles`)

| Método | Rota | Papéis | Descrição |
|---|---|---|---|
| GET | `/` | qualquer autenticado | Lista com paginação (`page`, `pageSize`) e filtros (`search`, `status`, `type`) |
| GET | `/:id` | qualquer autenticado | Busca por id (escopado à revenda) |
| POST | `/` | owner, admin, seller | Cria veículo |
| PATCH | `/:id` | owner, admin, seller | Atualiza veículo |
| DELETE | `/:id` | owner, admin | Remove veículo |

## O que falta (próximas fases do roadmap)

Conforme `arquitetura-backend-autogestao.md`: módulo de CRM (Leads/Customers/Sales/vendedores) na fase 2; Financeiro e Promissórias na fase 3; cobrança real (Stripe/Asaas/Pagar.me), vitrine pública com SSR para SEO e integração com portais de anúncio (OLX, WebMotors) na fase 4. O upload de fotos de veículo (`VehiclePhoto`) já está no schema do banco, mas o endpoint de upload (para S3/R2) ainda não foi implementado.

## Testes realizados

Este backend foi testado manualmente de ponta a ponta contra um PostgreSQL real: onboarding (criação de revenda + owner), login, `/me`, rotação de refresh token, logout com revogação, CRUD completo de veículos com paginação/filtro/busca, isolamento entre duas revendas diferentes, controle de papéis (seller bloqueado de apagar), limite de veículos por plano, e validação de entrada (e-mail duplicado, senha curta, campos obrigatórios, campos não permitidos).
