import { DomainError } from '../../../shared/domain/errors/DomainError';
import { FormDocument } from '../value-objects/FormDocument';

export interface FormVersionProps {
  id: string;
  tenantId: string;
  formId: string;
  versionNumber: number;
  document: FormDocument;
  publishedAt?: Date;
  publishedByUserId?: string | null;
}

/**
 * An immutable, frozen snapshot of a form's document at the moment it was
 * published (spec §28, brief §8).
 *
 * Unlike `ClientForm`, this has no mutators at all — not even a soft delete.
 * A `FormSubmission` is pinned to the exact version it was filled against
 * (`FormSubmission.formVersionId`), so a version row must outlive every edit
 * made to the draft after it, including the form being republished a dozen
 * times since. Deleting or altering one would make every submission that
 * references it unrenderable. `versionNumber` is 1-based and monotonically
 * increasing per form — never reused, even if a would-be version failed to
 * save, so a gap in the sequence is possible but a collision is not.
 */
export class FormVersion {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly formId: string;
  public readonly versionNumber: number;
  public readonly document: FormDocument;
  public readonly publishedAt: Date;
  public readonly publishedByUserId: string | null;

  private constructor(props: Required<Omit<FormVersionProps, 'publishedByUserId'>> & {
    publishedByUserId: string | null;
  }) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.formId = props.formId;
    this.versionNumber = props.versionNumber;
    this.document = props.document;
    this.publishedAt = props.publishedAt;
    this.publishedByUserId = props.publishedByUserId;
  }

  public static create(props: FormVersionProps): FormVersion {
    if (props.versionNumber < 1) {
      throw new DomainError('A form version number must be at least 1.');
    }
    return new FormVersion({
      id: props.id,
      tenantId: props.tenantId,
      formId: props.formId,
      versionNumber: props.versionNumber,
      document: props.document,
      publishedAt: props.publishedAt ?? new Date(),
      publishedByUserId: props.publishedByUserId ?? null,
    });
  }

  public static reconstitute(props: FormVersionProps): FormVersion {
    return FormVersion.create(props);
  }
}
