import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Регистрация: имя, класс, город',
    description:
      'Ни почты, ни пароля: подростку 14-17 лет мы их сознательно не задаём. Вместо пароля выдаётся код входа.',
  })
  @ApiResponse({ status: 201, description: 'Аккаунт создан, выданы токен и код входа.' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход по коду, выданному при регистрации' })
  @ApiResponse({ status: 401, description: 'Кода не существует.' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Профиль и история прохождений текущего пользователя' })
  me(@CurrentUser('id') userId: string) {
    return this.auth.me(userId);
  }
}
