import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { FieldRole } from '../../../../../src/clients/domain/enums/FieldRole';

describe('CustomFieldDefinition Entity', () => {
  it('creates a TEXT field definition', () => {
    const def = CustomFieldDefinition.create({
      id: 'field-1',
      tenantId: 'tenant-123',
      fieldName: 'industry',
      fieldType: FieldType.TEXT,
    });
    expect(def.id).toBe('field-1');
    expect(def.fieldName).toBe('industry');
    expect(def.fieldType).toBe(FieldType.TEXT);
    expect(def.options).toBeUndefined();
  });

  it('creates a SINGLE_SELECT field definition with options', () => {
    const def = CustomFieldDefinition.create({
      id: 'field-2',
      tenantId: 'tenant-123',
      fieldName: 'status',
      fieldType: FieldType.SINGLE_SELECT,
      options: ['A', 'B'],
    });
    expect(def.fieldType).toBe(FieldType.SINGLE_SELECT);
    expect(def.options).toEqual(['A', 'B']);
  });

  it('rejects SINGLE_SELECT creation if options are missing or empty', () => {
    expect(() => {
      CustomFieldDefinition.create({
        id: 'field-3',
        tenantId: 'tenant-123',
        fieldName: 'status',
        fieldType: FieldType.SINGLE_SELECT,
        options: [],
      });
    }).toThrow('SINGLE_SELECT fields must have at least one option.');
    
    expect(() => {
      CustomFieldDefinition.create({
        id: 'field-3',
        tenantId: 'tenant-123',
        fieldName: 'status',
        fieldType: FieldType.SINGLE_SELECT,
      });
    }).toThrow('SINGLE_SELECT fields must have at least one option.');
  });

  describe('the STATUS field (Slice 11, Q9)', () => {
    const statusField = () =>
      CustomFieldDefinition.create({
        id: 'field-status',
        tenantId: 'tenant-123',
        fieldName: 'Status',
        fieldType: FieldType.SINGLE_SELECT,
        options: ['LEAD', 'PROSPECT', 'CLIENT', 'FORMER_CLIENT'],
        role: FieldRole.STATUS,
        required: true,
      });

    it('is locked', () => {
      expect(statusField().isLocked).toBe(true);
    });

    it('may be renamed', () => {
      const renamed = statusField().update({ fieldName: 'Client status' });
      expect(renamed.fieldName).toBe('Client status');
    });

    it('refuses to lose its role or change type', () => {
      expect(() => statusField().update({ role: null })).toThrow('is locked');
      expect(() => statusField().update({ fieldType: FieldType.TEXT })).toThrow('is locked');
    });

    it('refuses to change its fixed options', () => {
      expect(() => statusField().update({ options: ['LEAD', 'PROSPECT'] })).toThrow('is locked');
    });

    it('accepts an update that leaves the options unchanged', () => {
      const updated = statusField().update({ options: ['LEAD', 'PROSPECT', 'CLIENT', 'FORMER_CLIENT'] });
      expect(updated.options).toEqual(['LEAD', 'PROSPECT', 'CLIENT', 'FORMER_CLIENT']);
    });
  });
});
