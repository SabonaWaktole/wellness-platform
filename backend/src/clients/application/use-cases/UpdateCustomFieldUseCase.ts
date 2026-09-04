import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { FieldRole } from '../../domain/enums/FieldRole';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { ICustomFieldWriteTransaction } from '../ports/ICustomFieldWriteTransaction';

interface UpdateCustomFieldDTO {
  tenantId: string;
  requestingUserRole: string;
  fieldId: string;
  fieldName?: string;
  fieldType?: FieldType;
  options?: string[];
  role?: FieldRole | null;
  required?: boolean;
}

export class UpdateCustomFieldUseCase {
  constructor(private writeTransaction: ICustomFieldWriteTransaction) {}

  async execute(dto: UpdateCustomFieldDTO): Promise<CustomFieldDefinition> {
    if (dto.requestingUserRole !== UserRole.BUSINESS_OWNER && dto.requestingUserRole !== UserRole.SUPER_ADMIN) {
      throw new DomainError('Only Business Owners can edit custom fields');
    }

    return this.writeTransaction.run(async ({ customFieldRepo, clientRepo }) => {
      const existing = await customFieldRepo.findById(dto.tenantId, dto.fieldId);
      if (!existing) {
        throw new DomainError('Custom field not found');
      }

      if (dto.role) {
        const roleHolder = await customFieldRepo.findByTenantIdAndRole(dto.tenantId, dto.role);
        if (roleHolder && roleHolder.id !== existing.id) {
          throw new DomainError(`Field "${roleHolder.fieldName}" already has the "${dto.role}" role.`);
        }
      }

      // NOTE: this does not check whether existing Client.customFieldValues for
      // this field are still valid under a changed fieldType/options — doing so
      // requires scanning every client's JSON value for this key. Values that
      // become invalid simply won't re-validate the next time that client is
      // edited (Client.create runs the same check then).
      const updated = existing.update({
        fieldName: dto.fieldName,
        fieldType: dto.fieldType,
        options: dto.options,
        role: dto.role,
        required: dto.required,
      });

      await customFieldRepo.update(dto.tenantId, updated);

      // Only when the name actually changed: renaming with `from === to` is
      // already a no-op inside renameCustomFieldKey, but skipping the call
      // entirely avoids a scan over every client for the common case (type,
      // options, role or required changed, name did not).
      if (dto.fieldName !== undefined && dto.fieldName !== existing.fieldName) {
        await clientRepo.renameCustomFieldKey(dto.tenantId, existing.fieldName, updated.fieldName);
      }

      return updated;
    });
  }
}
