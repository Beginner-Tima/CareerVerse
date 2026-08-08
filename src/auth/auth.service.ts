import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

/**
 * Регистрация без почты и пароля — решение, а не упрощение.
 *
 * Пользователю 14-17 лет. Почта и пароль означают восстановление доступа,
 * рассылки, утечки и согласие родителя на обработку контактных данных по закону
 * РК о персональных данных несовершеннолетних. Продукту всё это не нужно: имя,
 * класс и город — единственное, что реально влияет на разговор.
 *
 * Вместо пароля — код входа, который человек видит один раз при регистрации.
 * Токен подписывается тем же секретом, что проверяет SupabaseStrategy, поэтому
 * весь существующий контур авторизации (глобальный guard, @Public, /users/me/*)
 * работает без единой правки.
 */

// Ни 0/O, ни 1/I/l: код диктуют вслух и переписывают с чужого экрана.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const TOKEN_TTL = '90d';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // Коллизия кода почти невозможна (32^8), но «почти» на проде мало значит:
    // уникальный индекс всё равно решает, кто первый, а мы просто пробуем снова.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const loginCode = this.generateCode();
      try {
        const user = await this.prisma.user.create({
          data: {
            name: dto.name.trim(),
            grade: dto.grade,
            city: dto.city?.trim() || null,
            loginCode,
          },
        });

        return {
          token: await this.sign(user.id, user.name),
          loginCode,
          user: this.viewUser(user),
          notice:
            'Запиши код входа — он заменяет пароль. Мы не спрашиваем почту и телефон, восстановить доступ без кода не сможем.',
        };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          this.logger.warn(`Код входа ${loginCode} уже занят, генерирую другой.`);
          continue;
        }
        throw error;
      }
    }

    throw new Error('Не удалось выдать код входа за пять попыток.');
  }

  async login(dto: LoginDto) {
    const code = this.normalizeCode(dto.code);
    const user = await this.prisma.user.findUnique({ where: { loginCode: code } });

    if (!user) {
      throw new UnauthorizedException('Такого кода нет. Проверь символы — их легко перепутать.');
    }

    return {
      token: await this.sign(user.id, user.name),
      user: this.viewUser(user),
    };
  }

  /** Профиль для шапки: очки, уровень и сколько ещё до следующего разбора. */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        sessions: {
          where: { claimedAt: { not: null } },
          orderBy: { completedAt: 'desc' },
          include: {
            interestProfile: { select: { topProfessions: true, confidence: true } },
            mentorReview: { select: { id: true } },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Аккаунт не найден — войди по коду ещё раз.');
    }

    const professionIds = user.sessions
      .flatMap((s) => this.topProfessionIds(s.interestProfile?.topProfessions))
      .filter((id, index, all) => all.indexOf(id) === index);

    const professions = await this.prisma.profession.findMany({
      where: { id: { in: professionIds } },
      select: { id: true, title: true },
    });

    return {
      user: this.viewUser(user),
      history: user.sessions.map((session) => {
        const topId = this.topProfessionIds(session.interestProfile?.topProfessions)[0];
        return {
          sessionId: session.id,
          completedAt: session.completedAt,
          confidence: session.interestProfile?.confidence ?? 0,
          topProfession: professions.find((p) => p.id === topId)?.title ?? null,
          hasMentorReview: session.mentorReview !== null,
        };
      }),
    };
  }

  private async sign(userId: string, name: string | null) {
    return this.jwt.signAsync(
      { sub: userId, name: name ?? undefined },
      { expiresIn: TOKEN_TTL },
    );
  }

  private generateCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return `${code.slice(0, 4)}-${code.slice(4)}`;
  }

  /** Код диктуют и вводят как попало: без дефиса, строчными, с пробелами. */
  private normalizeCode(raw: string) {
    const clean = raw.trim().toUpperCase().replace(/[\s-]/g, '');
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  }

  private topProfessionIds(value: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((m) => (m as { professionId?: unknown }).professionId)
      .filter((id): id is string => typeof id === 'string');
  }

  private viewUser(user: {
    id: string;
    name: string | null;
    grade: number | null;
    city: string | null;
    xp: number;
    coins: number;
    level: number;
  }) {
    return {
      id: user.id,
      name: user.name,
      grade: user.grade,
      city: user.city,
      xp: user.xp,
      coins: user.coins,
      level: user.level,
    };
  }
}
