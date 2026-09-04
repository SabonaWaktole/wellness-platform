import { FormFieldType } from '../enums/FormFieldType';
import type { FieldSpec } from '../value-objects/FormDocument';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates raw submitted data against a FORM VERSION's frozen `FieldSpec`s
 * — never against the tenant's live `CustomFieldDefinition`s or the draft
 * document. A client filling a shared link is filling exactly what was
 * published; the fields, their options and their rules must be exactly what
 * was true at publish time, or a submission could be accepted against
 * validation rules that no longer match what the owner sees when reviewing
 * it later (spec §27).
 *
 * Pure domain — no repository, no Prisma — so it is reusable from both the
 * public submit path and anywhere else a submission needs re-checking.
 *
 * Returns a map of `field.key -> message` rather than throwing: a form-fill
 * page needs to show every invalid field at once, not stop at the first one.
 * An empty object means the submission is valid.
 */
export class SubmissionValidator {
  static validate(fields: FieldSpec[], data: Record<string, unknown>): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      const message = this.validateField(field, data[field.key]);
      if (message) errors[field.key] = message;
    }
    return errors;
  }

  private static isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  }

  private static validateField(field: FieldSpec, value: unknown): string | null {
    if (this.isBlank(value)) {
      return field.required ? `${field.label} is required.` : null;
    }

    switch (field.dataType) {
      case FormFieldType.TEXT:
      case FormFieldType.LONG_TEXT:
      case FormFieldType.SIGNATURE:
      case FormFieldType.USER_REFERENCE:
        return this.validateText(field, value);
      case FormFieldType.EMAIL:
        return this.validateEmail(field, value);
      case FormFieldType.NUMBER:
        return this.validateNumber(field, value);
      case FormFieldType.DATE:
        return this.validateDate(field, value);
      case FormFieldType.BOOLEAN:
        return typeof value === 'boolean' ? null : `${field.label} is invalid.`;
      case FormFieldType.SINGLE_SELECT:
        return this.validateSingleSelect(field, value);
      case FormFieldType.MULTI_SELECT:
        return this.validateMultiSelect(field, value);
      default:
        return null;
    }
  }

  private static validateText(field: FieldSpec, value: unknown): string | null {
    if (typeof value !== 'string') return `${field.label} is invalid.`;
    const { minLength, maxLength, pattern } = field.validation ?? {};
    if (minLength !== undefined && value.length < minLength) {
      return `${field.label} must be at least ${minLength} characters.`;
    }
    if (maxLength !== undefined && value.length > maxLength) {
      return `${field.label} must be at most ${maxLength} characters.`;
    }
    if (pattern && !new RegExp(pattern).test(value)) {
      return `${field.label} is not in the expected format.`;
    }
    return null;
  }

  private static validateEmail(field: FieldSpec, value: unknown): string | null {
    if (typeof value !== 'string' || !EMAIL_PATTERN.test(value)) {
      return `${field.label} must be a valid email address.`;
    }
    return null;
  }

  private static validateNumber(field: FieldSpec, value: unknown): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `${field.label} must be a number.`;
    }
    const { min, max } = field.validation ?? {};
    if (min !== undefined && value < min) return `${field.label} must be at least ${min}.`;
    if (max !== undefined && value > max) return `${field.label} must be at most ${max}.`;
    return null;
  }

  private static validateDate(field: FieldSpec, value: unknown): string | null {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      return `${field.label} must be a valid date.`;
    }
    const time = Date.parse(value);
    const { minDate, maxDate } = field.validation ?? {};
    if (minDate !== undefined && time < Date.parse(minDate)) {
      return `${field.label} must be on or after ${minDate}.`;
    }
    if (maxDate !== undefined && time > Date.parse(maxDate)) {
      return `${field.label} must be on or before ${maxDate}.`;
    }
    return null;
  }

  private static validateSingleSelect(field: FieldSpec, value: unknown): string | null {
    if (typeof value !== 'string') return `${field.label} is invalid.`;
    if (!field.options?.some((o) => o.value === value)) {
      return `${field.label} has an invalid selection.`;
    }
    return null;
  }

  private static validateMultiSelect(field: FieldSpec, value: unknown): string | null {
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
      return `${field.label} is invalid.`;
    }
    const allowed = new Set(field.options?.map((o) => o.value) ?? []);
    if (value.some((v) => !allowed.has(v))) {
      return `${field.label} has an invalid selection.`;
    }
    return null;
  }
}
