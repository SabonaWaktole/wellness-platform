import { z } from 'zod';
import {
  createClientSchema,
  updateClientSchema,
  searchClientsSchema,
  addInteractionSchema,
  defineCustomFieldSchema,
  defineOutcomeCategorySchema
} from '../../../../../../src/clients/interfaces/http/schemas/clientSchemas';
import { ClientStatus } from '../../../../../../src/clients/domain/enums/ClientStatus';
import { InteractionChannel } from '../../../../../../src/clients/domain/enums/InteractionChannel';
import { FieldType } from '../../../../../../src/clients/domain/enums/FieldType';

describe('clientSchemas', () => {
  describe('createClientSchema', () => {
    it('validates a correct payload', () => {
      const data = {
        customFieldValues: {
          Name: 'Acme Corp',
          Email: 'test@acme.com',
          Phone: '+1234567890',
          Status: ClientStatus.PROSPECT,
          industry: 'Tech',
        },
      };
      expect(createClientSchema.parse(data)).toEqual(data);
    });

    it('accepts a payload with no customFieldValues at all', () => {
      expect(createClientSchema.parse({})).toEqual({});
    });

    it('rejects a customFieldValues that is not an object', () => {
      expect(() => createClientSchema.parse({ customFieldValues: 'not-an-object' }))
        .toThrow();
    });
  });

  describe('updateClientSchema', () => {
    it('validates a partial payload', () => {
      const data = { customFieldValues: { Name: 'New Name' } };
      expect(updateClientSchema.parse(data)).toEqual(data);
    });
  });

  describe('searchClientsSchema', () => {
    it('validates and coerces numeric string pagination', () => {
      const data = { skip: '10', take: '20', name: 'Acme' };
      const parsed = searchClientsSchema.parse(data);
      expect(parsed.skip).toBe(10);
      expect(parsed.take).toBe(20);
      expect(parsed.name).toBe('Acme');
    });

    it('handles empty filters', () => {
      expect(searchClientsSchema.parse({})).toEqual({ skip: 0, take: 50 });
    });
    
    it('parses customFields JSON string', () => {
      const parsed = searchClientsSchema.parse({ customFields: '{"industry":"Tech"}' });
      expect(parsed.customFields).toEqual({ industry: 'Tech' });
    });
  });

  describe('addInteractionSchema', () => {
    it('validates correct payload', () => {
      const data = {
        content: 'Good call',
        channel: InteractionChannel.CALL,
        outcomeCategoryId: '123e4567-e89b-12d3-a456-426614174000',
      };
      expect(addInteractionSchema.parse(data)).toEqual(data);
    });
  });

  describe('defineCustomFieldSchema', () => {
    it('validates correct payload', () => {
      const data = { fieldName: 'industry', fieldType: FieldType.TEXT };
      expect(defineCustomFieldSchema.parse(data)).toEqual(data);
    });

    it('requires options for SINGLE_SELECT', () => {
      expect(() => defineCustomFieldSchema.parse({ fieldName: 'size', fieldType: FieldType.SINGLE_SELECT }))
        .toThrow('Options are required for SINGLE_SELECT and MULTI_SELECT fields');
    });

    it('requires options for MULTI_SELECT too', () => {
      expect(() => defineCustomFieldSchema.parse({ fieldName: 'services', fieldType: FieldType.MULTI_SELECT }))
        .toThrow('Options are required for SINGLE_SELECT and MULTI_SELECT fields');
    });

    // The settings UI has always offered a "Boolean" option; before it existed
    // in this enum every such submission was rejected with a 400 the user never
    // saw. Pinned here so the enum and the dropdown cannot drift apart silently.
    it('accepts BOOLEAN, which the settings UI offers', () => {
      const data = { fieldName: 'isVip', fieldType: FieldType.BOOLEAN };
      expect(defineCustomFieldSchema.parse(data)).toEqual(data);
    });

    it('accepts every FieldType the enum declares', () => {
      for (const fieldType of Object.values(FieldType)) {
        const data: any = { fieldName: 'someField', fieldType };
        // The two select types are the ones carrying an extra requirement.
        if (fieldType === FieldType.SINGLE_SELECT || fieldType === FieldType.MULTI_SELECT) {
          data.options = ['a', 'b'];
        }
        expect(() => defineCustomFieldSchema.parse(data)).not.toThrow();
      }
    });

    // Field names are shown to users as labels, so "Company Size" has to be a
    // legal name; the old /^[a-zA-Z0-9_]+$/ rule rejected every spaced name.
    it('accepts a field name containing spaces', () => {
      const data = { fieldName: 'Company Size', fieldType: FieldType.TEXT };
      expect(defineCustomFieldSchema.parse(data)).toEqual(data);
    });

    it('accepts hyphens and underscores', () => {
      expect(defineCustomFieldSchema.parse({ fieldName: 'vat-number_2', fieldType: FieldType.TEXT }).fieldName)
        .toBe('vat-number_2');
    });

    it('trims surrounding whitespace so look-alike duplicates cannot be created', () => {
      expect(defineCustomFieldSchema.parse({ fieldName: '  Company Size  ', fieldType: FieldType.TEXT }).fieldName)
        .toBe('Company Size');
    });

    it('rejects punctuation in a field name', () => {
      expect(() => defineCustomFieldSchema.parse({ fieldName: 'Bad!Name', fieldType: FieldType.TEXT }))
        .toThrow();
    });

    it('rejects a name that is only whitespace', () => {
      expect(() => defineCustomFieldSchema.parse({ fieldName: '   ', fieldType: FieldType.TEXT }))
        .toThrow();
    });

    it('accepts ALPHANUMERIC', () => {
      const data = { fieldName: 'Plate Number', fieldType: FieldType.ALPHANUMERIC };
      expect(defineCustomFieldSchema.parse(data)).toEqual(data);
    });

    it('rejects a type that is not in the enum', () => {
      expect(() => defineCustomFieldSchema.parse({ fieldName: 'x', fieldType: 'CHECKBOX' }))
        .toThrow();
    });
  });

  describe('defineOutcomeCategorySchema', () => {
    it('validates correct payload', () => {
      const data = { label: 'Closed Won' };
      expect(defineOutcomeCategorySchema.parse(data)).toEqual(data);
    });
  });
});
