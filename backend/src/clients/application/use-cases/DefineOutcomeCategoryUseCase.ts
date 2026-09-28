import { AccessContext } from '../../../access/domain/AccessContext';
import { IOutcomeCategoryRepository } from '../../domain/repositories/IOutcomeCategoryRepository';
import { OutcomeCategory } from '../../domain/entities/OutcomeCategory';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { randomUUID } from 'crypto';

interface DefineOutcomeCategoryDTO {
  tenantId: string;
  access: AccessContext;
  label: string;
}

export class DefineOutcomeCategoryUseCase {
  constructor(private outcomeRepo: IOutcomeCategoryRepository) {}

  async execute(dto: DefineOutcomeCategoryDTO): Promise<OutcomeCategory> {
    dto.access.ensure('settings.manage');

    const category = OutcomeCategory.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      label: dto.label,
    });

    await this.outcomeRepo.save(dto.tenantId, category);
    return category;
  }
}
