import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfessionDto } from './dto/create-profession.dto';
import { UpdateProfessionDto } from './dto/update-profession.dto';

@Injectable()
export class ProfessionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createProfessionDto: CreateProfessionDto) {
    return this.prisma.profession.create({
      data: createProfessionDto,
    });
  }

  async findAll() {
    return this.prisma.profession.findMany({
      // Каталог — витрина демо, и порядок в нём смысловой: Profession.order
      // существует именно для этого, а сортировка по алфавиту его игнорировала.
      orderBy: { order: 'asc' },
      include: {
        levels: true,
        // Без данных рынка труда карточка профессии — просто описание.
        marketData: true,
      },
    });
  }

  findOne(id: string) {
    return this.prisma.profession.findUnique({
      where: { id },
      include: {
        levels: {
          orderBy: {
            order: 'asc',
          },
        },
      },
    });
  }

  update(id: string, updateProfessionDto: UpdateProfessionDto) {
    return this.prisma.profession.update({
      where: { id },
      data: updateProfessionDto,
    });
  }

  remove(id: string) {
    return this.prisma.profession.delete({
      where: { id },
    });
  }
}
