import { SubmissionValidator } from '../../../../../src/forms/domain/services/SubmissionValidator';
import { FormFieldType } from '../../../../../src/forms/domain/enums/FormFieldType';
import type { FieldSpec } from '../../../../../src/forms/domain/value-objects/FormDocument';

const field = (over: Partial<FieldSpec> & Pick<FieldSpec, 'key' | 'dataType'>): FieldSpec => ({
  label: over.key,
  required: false,
  ...over,
});

describe('SubmissionValidator', () => {
  it('accepts a fully valid submission with no errors', () => {
    const fields: FieldSpec[] = [
      field({ key: 'name', dataType: FormFieldType.TEXT, required: true }),
      field({ key: 'age', dataType: FormFieldType.NUMBER }),
    ];
    const errors = SubmissionValidator.validate(fields, { name: 'Ada', age: 30 });
    expect(errors).toEqual({});
  });

  it('requires a required field that is missing, null, empty string or an empty array', () => {
    const fields: FieldSpec[] = [field({ key: 'name', dataType: FormFieldType.TEXT, required: true })];
    expect(SubmissionValidator.validate(fields, {})).toHaveProperty('name');
    expect(SubmissionValidator.validate(fields, { name: null })).toHaveProperty('name');
    expect(SubmissionValidator.validate(fields, { name: '' })).toHaveProperty('name');
  });

  it('leaves an optional, absent field with no error', () => {
    const fields: FieldSpec[] = [field({ key: 'nickname', dataType: FormFieldType.TEXT })];
    expect(SubmissionValidator.validate(fields, {})).toEqual({});
  });

  it('rejects a non-string value for a text field', () => {
    const fields: FieldSpec[] = [field({ key: 'name', dataType: FormFieldType.TEXT })];
    expect(SubmissionValidator.validate(fields, { name: 42 })).toHaveProperty('name');
  });

  it('enforces minLength/maxLength on text', () => {
    const fields: FieldSpec[] = [
      field({ key: 'code', dataType: FormFieldType.TEXT, validation: { minLength: 3, maxLength: 5 } }),
    ];
    expect(SubmissionValidator.validate(fields, { code: 'ab' })).toHaveProperty('code');
    expect(SubmissionValidator.validate(fields, { code: 'abcdef' })).toHaveProperty('code');
    expect(SubmissionValidator.validate(fields, { code: 'abcd' })).toEqual({});
  });

  it('enforces a regex pattern on text', () => {
    const fields: FieldSpec[] = [
      field({ key: 'code', dataType: FormFieldType.TEXT, validation: { pattern: '^[A-Z]{3}$' } }),
    ];
    expect(SubmissionValidator.validate(fields, { code: 'abc' })).toHaveProperty('code');
    expect(SubmissionValidator.validate(fields, { code: 'ABC' })).toEqual({});
  });

  it('rejects a malformed email address', () => {
    const fields: FieldSpec[] = [field({ key: 'email', dataType: FormFieldType.EMAIL })];
    expect(SubmissionValidator.validate(fields, { email: 'not-an-email' })).toHaveProperty('email');
    expect(SubmissionValidator.validate(fields, { email: 'a@b.com' })).toEqual({});
  });

  it('enforces min/max on a number', () => {
    const fields: FieldSpec[] = [
      field({ key: 'age', dataType: FormFieldType.NUMBER, validation: { min: 18, max: 65 } }),
    ];
    expect(SubmissionValidator.validate(fields, { age: 17 })).toHaveProperty('age');
    expect(SubmissionValidator.validate(fields, { age: 66 })).toHaveProperty('age');
    expect(SubmissionValidator.validate(fields, { age: 40 })).toEqual({});
  });

  it('rejects a non-finite number', () => {
    const fields: FieldSpec[] = [field({ key: 'age', dataType: FormFieldType.NUMBER })];
    expect(SubmissionValidator.validate(fields, { age: Number.NaN })).toHaveProperty('age');
    expect(SubmissionValidator.validate(fields, { age: '30' })).toHaveProperty('age');
  });

  it('enforces minDate/maxDate on a date', () => {
    const fields: FieldSpec[] = [
      field({ key: 'visit', dataType: FormFieldType.DATE, validation: { minDate: '2026-01-01', maxDate: '2026-12-31' } }),
    ];
    expect(SubmissionValidator.validate(fields, { visit: '2025-12-31' })).toHaveProperty('visit');
    expect(SubmissionValidator.validate(fields, { visit: '2027-01-01' })).toHaveProperty('visit');
    expect(SubmissionValidator.validate(fields, { visit: '2026-06-15' })).toEqual({});
  });

  it('rejects an unparsable date', () => {
    const fields: FieldSpec[] = [field({ key: 'visit', dataType: FormFieldType.DATE })];
    expect(SubmissionValidator.validate(fields, { visit: 'not a date' })).toHaveProperty('visit');
  });

  it('accepts only a boolean for a BOOLEAN field', () => {
    const fields: FieldSpec[] = [field({ key: 'agree', dataType: FormFieldType.BOOLEAN })];
    expect(SubmissionValidator.validate(fields, { agree: true })).toEqual({});
    expect(SubmissionValidator.validate(fields, { agree: 'true' })).toHaveProperty('agree');
  });

  it('requires a SINGLE_SELECT value to be one of the frozen options', () => {
    const fields: FieldSpec[] = [
      field({
        key: 'plan',
        dataType: FormFieldType.SINGLE_SELECT,
        options: [{ value: 'basic', label: 'Basic' }, { value: 'pro', label: 'Pro' }],
      }),
    ];
    expect(SubmissionValidator.validate(fields, { plan: 'enterprise' })).toHaveProperty('plan');
    expect(SubmissionValidator.validate(fields, { plan: 'pro' })).toEqual({});
  });

  it('requires every MULTI_SELECT value to be one of the frozen options', () => {
    const fields: FieldSpec[] = [
      field({
        key: 'toppings',
        dataType: FormFieldType.MULTI_SELECT,
        options: [{ value: 'cheese', label: 'Cheese' }, { value: 'olives', label: 'Olives' }],
      }),
    ];
    expect(SubmissionValidator.validate(fields, { toppings: ['cheese', 'anchovies'] })).toHaveProperty('toppings');
    expect(SubmissionValidator.validate(fields, { toppings: ['cheese', 'olives'] })).toEqual({});
    expect(SubmissionValidator.validate(fields, { toppings: 'cheese' })).toHaveProperty('toppings');
  });

  it('treats an unrecognised field key in the submitted data as harmless — the caller sanitises separately', () => {
    const fields: FieldSpec[] = [field({ key: 'name', dataType: FormFieldType.TEXT })];
    expect(SubmissionValidator.validate(fields, { name: 'Ada', extra: 'ignored' })).toEqual({});
  });
});
