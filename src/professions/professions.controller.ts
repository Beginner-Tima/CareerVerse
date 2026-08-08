import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ProfessionsService } from './professions.service';
import { CreateProfessionDto } from './dto/create-profession.dto';
import { UpdateProfessionDto } from './dto/update-profession.dto';
import { Public } from '../auth/public.decorator';

@ApiTags('professions')
@Controller('professions')
export class ProfessionsController {
  constructor(private readonly professionsService: ProfessionsService) {}

  // Каталог читают все — он же витрина демо. Менять его может только владелец токена:
  // раньше DELETE /api/professions/:id был открыт наружу.
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Создать профессию' })
  create(@Body() createProfessionDto: CreateProfessionDto) {
    return this.professionsService.create(createProfessionDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Получить все профессии с уровнями' })
  findAll() {
    return this.professionsService.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Получить профессию по ID с уровнями' })
  @ApiParam({ name: 'id', description: 'UUID профессии' })
  findOne(@Param('id') id: string) {
    return this.professionsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обновить профессию' })
  @ApiParam({ name: 'id', description: 'UUID профессии' })
  update(@Param('id') id: string, @Body() updateProfessionDto: UpdateProfessionDto) {
    return this.professionsService.update(id, updateProfessionDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Удалить профессию' })
  @ApiParam({ name: 'id', description: 'UUID профессии' })
  remove(@Param('id') id: string) {
    return this.professionsService.remove(id);
  }
}
