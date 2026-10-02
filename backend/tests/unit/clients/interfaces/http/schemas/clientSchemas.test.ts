import { z } from 'zod';
import {
  createClientSchema,
  updateClientSchema,
  searchClientsSchema,
  addInteractionSchema,
  defineCustomFieldSchema,
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
    it('FR-ACT-02 validates an activity with when it happened, the contact, the result and the follow-up text', () => {
      const data = {
        content: 'Good call',
        channel: InteractionChannel.CALL,
        occurredAt: '2026-10-01T15:30:00.000Z',
        contactPersonId: 'contact-1',
        resultId: 'result-1',
        dealId: null,
        clientFeedback: 'Interested',
        nextAction: 'Send the offer',
      };
      expect(addInteractionSchema.parse(data)).toEqual({ ...data, occurredAt: new Date(data.occurredAt) });
    });

    it('FR-ACT-01 accepts the two new types and refuses an unknown one', () => {
      expect(addInteractionSchema.parse({ channel: 'VISIT' }).channel).toBe(InteractionChannel.VISIT);
      expect(addInteractionSchema.parse({ channel: 'ONLINE_MEETING' }).channel).toBe(InteractionChannel.ONLINE_MEETING);
      expect(() => addInteractionSchema.parse({ channel: 'FAX' })).toThrow();
      expect(() => addInteractionSchema.parse({ channel: 'CALL', occurredAt: 'not a date' })).toThrow();
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

  /*
   * A query string carries no types: every value arrives as a string. The
   * `archived` flag was declared `z.coerce.boolean()`, which is `Boolean(v)` —
   * and `Boolean('false')` is TRUE. So the Clients tab, which sends
   * `archived=false` on every load, asked for the ARCHIVED clients and got an
   * empty list back on any workspace that had archived nothing.
   *
   * The list looked broken while the API was answering exactly what it was
   * asked. These cases pin the wire format, not the intent.
   */
  describe('searchClientsSchema — the archived flag', () => {
    const archived = (query: Record<string, unknown>) => searchClientsSchema.parse(query).archived;

    it('reads the literal string "false" as false, not as a non-empty string', () => {
      expect(archived({ archived: 'false' })).toBe(false);
    });

    it('reads "true" as true', () => {
      expect(archived({ archived: 'true' })).toBe(true);
    });

    it.each(['0', 'FALSE', 'False', '', 'no', 'nope'])(
      'treats %p as not-archived',
      (value) => {
        expect(archived({ archived: value })).toBe(false);
      }
    );

    it.each(['1', 'TRUE', 'True'])('treats %p as archived', (value) => {
      expect(archived({ archived: value })).toBe(true);
    });

    it('leaves the flag undefined when it is absent, so the default applies', () => {
      expect(archived({})).toBeUndefined();
    });

    it('still accepts a real boolean, for callers that are not a query string', () => {
      expect(archived({ archived: false })).toBe(false);
      expect(archived({ archived: true })).toBe(true);
    });

    /* The exact query the Clients tab puts on the wire for its default view. */
    it('parses the Clients tab default view as active-only', () => {
      expect(searchClientsSchema.parse({ search: '', archived: 'false' }).archived).toBe(false);
    });
  });
});
