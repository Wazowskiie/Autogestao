import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Dealership, User, UserRole } from '../generated/prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: Pick<User, 'id' | 'name' | 'email' | 'role'>;
  dealership: Pick<Dealership, 'id' | 'name' | 'slug'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() private readonly mail?: MailService,
  ) {}

  private readonly log = new Logger('Senha');

  /** O "Esqueci minha senha" só manda e-mail se o envio estiver configurado */
  passwordResetAvailable() {
    return !!this.mail?.isEnabled();
  }

  /**
   * Gera um link de uso único (1 hora) e manda por e-mail.
   * Responde igual exista ou não o e-mail, para não revelar quem tem conta.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, active: true } });
    if (!user || !this.mail?.isEnabled()) return;

    // Evita enxurrada: no máximo um e-mail a cada 2 minutos por pessoa
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 2 * 60_000) } },
    });
    if (recent) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // Um link novo invalida os anteriores
      this.prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: this.hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
      }),
    ]);

    const appUrl = (process.env.PUBLIC_APP_URL || (process.env.CORS_ORIGINS ?? '').split(',')[0] || 'http://localhost:5173').replace(/\/$/, '');
    const link = `${appUrl}/redefinir-senha?token=${token}`;
    const first = user.name.split(' ')[0];
    const sent = await this.mail.send({
      to: user.email,
      subject: 'Criar uma senha nova no AutoGestão',
      text: `Olá, ${first}.\n\nRecebemos um pedido para trocar a senha da sua conta no AutoGestão. Para criar uma senha nova, abra o link abaixo (vale por 1 hora):\n\n${link}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0F1923">
<p>Olá, ${escapeHtml(first)}.</p>
<p>Recebemos um pedido para trocar a senha da sua conta no AutoGestão.</p>
<p><a href="${link}" style="display:inline-block;background:#185FA5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">Criar senha nova</a></p>
<p style="color:#5B6675;font-size:13px">O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
</div>`,
    });
    if (!sent) this.log.warn(`Não foi possível enviar o link de senha para o usuário ${user.id}`);
  }

  /** Troca a senha pelo link do e-mail e encerra as sessões abertas */
  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: this.hashToken(token) }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.active) {
      throw new BadRequestException('Este link não vale mais. Peça um novo em "Esqueci minha senha".');
    }
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: record.userId, revoked: false }, data: { revoked: true } }),
    ]);
    return { success: true };
  }

  async register(dto: RegisterDto): Promise<TokenBundle> {
    const [existingEmail, existingSlug] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.ownerEmail } }),
      this.prisma.dealership.findUnique({ where: { slug: dto.dealershipSlug } }),
    ]);

    if (existingEmail) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }
    if (existingSlug) {
      throw new ConflictException('Esta URL de loja já está em uso, escolha outra');
    }

    const passwordHash = await argon2.hash(dto.password);

    const { dealership, user } = await this.prisma.$transaction(async (tx) => {
      const dealership = await tx.dealership.create({
        data: { name: dto.dealershipName, slug: dto.dealershipSlug },
      });

      const user = await tx.user.create({
        data: {
          dealershipId: dealership.id,
          name: dto.ownerName,
          email: dto.ownerEmail,
          passwordHash,
          role: UserRole.owner,
        },
      });

      return { dealership, user };
    });

    return this.issueTokens(user, dealership);
  }

  async login(dto: LoginDto): Promise<TokenBundle> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Mensagem genérica de propósito: não revela se o e-mail existe ou não.
    if (!user || !user.active || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const dealership = await this.prisma.dealership.findUniqueOrThrow({
      where: { id: user.dealershipId },
    });

    return this.issueTokens(user, dealership);
  }

  async refresh(rawToken: string): Promise<TokenBundle> {
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revoked: false, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!stored || !stored.user.active) {
      throw new UnauthorizedException('Sessão expirada, faça login novamente');
    }

    // Rotação: o refresh token usado é sempre invalidado, mesmo em caso de sucesso.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const dealership = await this.prisma.dealership.findUniqueOrThrow({
      where: { id: stored.user.dealershipId },
    });

    return this.issueTokens(stored.user, dealership);
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
  }

  private async issueTokens(user: User, dealership: Dealership): Promise<TokenBundle> {
    const payload: JwtPayload = {
      sub: user.id,
      dealershipId: dealership.id,
      role: user.role,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshTokenRaw = randomBytes(40).toString('hex');
    const expiresAt = this.addDuration(
      new Date(),
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshTokenRaw),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      refreshTokenExpiresAt: expiresAt,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      dealership: { id: dealership.id, name: dealership.name, slug: dealership.slug },
    };
  }

  // Refresh tokens têm alta entropia (são gerados por nós, não escolhidos por
  // humanos), então um hash rápido como SHA-256 é apropriado — Argon2 é
  // reservado para senhas, que têm entropia baixa e precisam de uma função
  // deliberadamente lenta.
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private addDuration(base: Date, duration: string): Date {
    const match = duration.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);

    const value = Number(match[1]);
    const unit = match[2] as 's' | 'm' | 'h' | 'd';
    const multipliers: Record<typeof unit, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };

    return new Date(base.getTime() + value * multipliers[unit]);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
