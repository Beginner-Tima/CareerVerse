import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ProfessionsService } from './professions.service';
import { CreateProfessionDto } from './dto/create-profession.dto';
import { UpdateProfessionDto } from './dto/update-profession.dto';

@ApiTags('professions')
@Controller('professions')
export class ProfessionsController {
  constructor(private readonly professionsService: ProfessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Создать профессию' })
  create(@Body() createProfessionDto: CreateProfessionDto) {
    return this.professionsService.create(createProfessionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все профессии с уровнями' })
  findAll() {
    return this.professionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить профессию по ID с уровнями' })
  @ApiParam({ name: 'id', description: 'UUID профессии' })
  findOne(@Param('id') id: string) {
    return this.professionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить профессию' })
  @ApiParam({ name: 'id', description: 'UUID профессии' })
  update(@Param('id') id: string, @Body() updateProfessionDto: UpdateProfessionDto) {
    return this.professionsService.update(id, updateProfessionDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить профессию' })
  @ApiParam({ name: 'id', description: 'UUID профессии' })
  remove(@Param('id') id: string) {
    return this.professionsService.remove(id);
  }
}

