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
      include: {
        levels: true,
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
