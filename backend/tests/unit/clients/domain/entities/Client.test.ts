import { Client } from '../../../../../src/clients/domain/entities/Client';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';

describe('Client Entity', () => {
  const tenantId = 'tenant-123';
  
  const textDef = CustomFieldDefinition.create({
    id: 'field-1',
    tenantId,
    fieldName: 'industry',
    fieldType: FieldType.TEXT,
  });

  const selectDef = CustomFieldDefinition.create({
    id: 'field-2',
    tenantId,
    fieldName: 'company_size',
    fieldType: FieldType.SINGLE_SELECT,
    options: ['1-10', '11-50', '51-200'],
  });

  const alphanumericDef = CustomFieldDefinition.create({
    id: 'field-3',
    tenantId,
    fieldName: 'Plate Number',
    fieldType: FieldType.ALPHANUMERIC,
  });

  const definitions = [textDef, selectDef, alphanumericDef];

  const clientWith = (customFieldValues: Record<string, any>) =>
    Client.create({
      id: 'client-x',
      tenantId,
      name: 'Acme Corp',
      contactInfo: { email: 'test@acmecorp.com' },
      status: ClientStatus.PROSPECT,
      customFieldValues,
      lastUpdatedByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }, definitions);

  it('creates a client successfully when all custom fields match definitions', () => {
    const client = Client.create({
      id: 'client-1',
      tenantId,
      name: 'Acme Corp',
      contactInfo: { email: 'test@acmecorp.com' },
      status: ClientStatus.PROSPECT,
      customFieldValues: {
        industry: 'Software',
        company_size: '11-50',
      },
      lastUpdatedByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }, definitions);

    expect(client.id).toBe('client-1');
    expect(client.customFieldValues).toEqual({
      industry: 'Software',
      company_size: '11-50',
    });
  });

  it('creates a client with no custom fields', () => {
    const client = Client.create({
      id: 'client-2',
      tenantId,
      name: 'Acme Corp',
      contactInfo: { email: 'test@acmecorp.com' },
      status: ClientStatus.PROSPECT,
      customFieldValues: {},
      lastUpdatedByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }, definitions);

    expect(client.id).toBe('client-2');
    expect(client.customFieldValues).toEqual({});
  });

  it('rejects creation when customFieldValues reference undefined fields', () => {
    expect(() => {
      Client.create({
        id: 'client-3',
        tenantId,
        name: 'Acme Corp',
        contactInfo: { email: 'test@acmecorp.com' },
        status: ClientStatus.PROSPECT,
        customFieldValues: {
          industry: 'Software',
          invalid_field: 'Some value',
        },
        lastUpdatedByUserId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }, definitions);
    }).toThrow('Field "invalid_field" is not defined for this tenant.');
  });

  it('rejects creation when SINGLE_SELECT value is not in options', () => {
    expect(() => {
      Client.create({
        id: 'client-4',
        tenantId,
        name: 'Acme Corp',
        contactInfo: { email: 'test@acmecorp.com' },
        status: ClientStatus.PROSPECT,
        customFieldValues: {
          company_size: '1000+', // Invalid option
        },
        lastUpdatedByUserId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }, definitions);
    }).toThrow('Value "1000+" is not a valid option for field "company_size".');
  });

  // TEXT is free-form: spaces and punctuation must survive untouched.
  it('accepts spaces and punctuation in a TEXT value', () => {
    const client = clientWith({ industry: 'Software & IT Services' });
    expect(client.customFieldValues.industry).toBe('Software & IT Services');
  });

  describe('ALPHANUMERIC fields', () => {
    it('accepts letters, numbers and spaces', () => {
      expect(clientWith({ 'Plate Number': 'AB 123' }).customFieldValues['Plate Number'])
        .toBe('AB 123');
    });

    it('rejects punctuation', () => {
      expect(() => clientWith({ 'Plate Number': 'AB-123' }))
        .toThrow('Value for field "Plate Number" must contain only letters, numbers and spaces.');
    });

    it('rejects a non-string value', () => {
      expect(() => clientWith({ 'Plate Number': 42 }))
        .toThrow('Value for field "Plate Number" must contain only letters, numbers and spaces.');
    });

    it('allows a blank value, which is how the form reports "left empty"', () => {
      expect(() => clientWith({ 'Plate Number': '' })).not.toThrow();
      expect(() => clientWith({ 'Plate Number': null })).not.toThrow();
    });
  });
});
