/**
 * One file of a contract's signed document (FR-CON-19). A contract keeps every
 * file ever attached; exactly the newest is current and the rest are previous
 * versions, each with the date and the user that uploaded it.
 */
export class ContractDocument {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly contractId: string,
    readonly fileName: string,
    readonly url: string,
    readonly uploadedByUserId: string,
    readonly uploadedAt: Date,
    public isCurrent: boolean
  ) {}

  static create(props: {
    id: string;
    tenantId: string;
    contractId: string;
    fileName: string;
    url: string;
    uploadedByUserId: string;
    uploadedAt?: Date;
    isCurrent?: boolean;
  }): ContractDocument {
    return new ContractDocument(
      props.id,
      props.tenantId,
      props.contractId,
      props.fileName,
      props.url,
      props.uploadedByUserId,
      props.uploadedAt ?? new Date(),
      props.isCurrent ?? true
    );
  }

  /** The version list entry. The stored URL is not sent: the file is read through the download endpoint. */
  toJSON() {
    return {
      id: this.id,
      fileName: this.fileName,
      uploadedByUserId: this.uploadedByUserId,
      uploadedAt: this.uploadedAt,
      isCurrent: this.isCurrent,
    };
  }
}
