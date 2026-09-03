export type SubmissionSource = 'PUBLIC_LINK' | 'INTERNAL';

export interface FormSubmissionProps {
  id: string;
  tenantId: string;
  formId: string;
  /** Pins the submission to the exact document it was filled against — see
   *  `FormVersion`. Never re-pointed, even after the form is republished. */
  formVersionId: string;
  data: Record<string, unknown>;
  submittedAt?: Date;
  /** NULL for a public submission — the person filling a shared link has no
   *  account, which is the whole point of the share token. */
  submittedByUserId?: string | null;
  /** Set when the form carried client-bound fields and a Client row was
   *  created from this submission. */
  clientId?: string | null;
  source?: SubmissionSource;
  /** Salted hash, never a raw IP — enough to spot abuse, not PII retention. */
  ipHash?: string | null;
  userAgent?: string | null;
}

/**
 * One completed response to a published form version (spec §27, brief §8).
 *
 * `data` is structured and machine-readable, keyed by `FieldSpec.key` —
 * never a rendering (a PDF, an HTML snapshot) that would need to be parsed
 * back out to recover an answer. Immutable once created: a submission is a
 * record of what someone actually submitted, and there is no "edit" action
 * anywhere in this module — correcting one means submitting again.
 */
export class FormSubmission {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly formId: string;
  public readonly formVersionId: string;
  public readonly data: Record<string, unknown>;
  public readonly submittedAt: Date;
  public readonly submittedByUserId: string | null;
  public readonly clientId: string | null;
  public readonly source: SubmissionSource;
  public readonly ipHash: string | null;
  public readonly userAgent: string | null;

  private constructor(props: Required<Omit<FormSubmissionProps, 'submittedByUserId' | 'clientId' | 'ipHash' | 'userAgent'>> & {
    submittedByUserId: string | null;
    clientId: string | null;
    ipHash: string | null;
    userAgent: string | null;
  }) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.formId = props.formId;
    this.formVersionId = props.formVersionId;
    this.data = props.data;
    this.submittedAt = props.submittedAt;
    this.submittedByUserId = props.submittedByUserId;
    this.clientId = props.clientId;
    this.source = props.source;
    this.ipHash = props.ipHash;
    this.userAgent = props.userAgent;
  }

  public static create(props: FormSubmissionProps): FormSubmission {
    return new FormSubmission({
      id: props.id,
      tenantId: props.tenantId,
      formId: props.formId,
      formVersionId: props.formVersionId,
      data: props.data,
      submittedAt: props.submittedAt ?? new Date(),
      submittedByUserId: props.submittedByUserId ?? null,
      clientId: props.clientId ?? null,
      source: props.source ?? 'PUBLIC_LINK',
      ipHash: props.ipHash ?? null,
      userAgent: props.userAgent ?? null,
    });
  }

  public static reconstitute(props: FormSubmissionProps): FormSubmission {
    return FormSubmission.create(props);
  }
}
