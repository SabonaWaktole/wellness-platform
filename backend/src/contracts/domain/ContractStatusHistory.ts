export class ContractStatusHistory {
  id: string;
  tenantId: string;
  contractId: string;
  fromStatus: string;
  toStatus: string;
  /** NULL when the scheduler made the change rather than a person. */
  changedByUserId: string | null;
  changedAt: Date;
  note: string | null;

  private constructor(props: {
    id: string;
    tenantId: string;
    contractId: string;
    fromStatus: string;
    toStatus: string;
    changedByUserId: string | null;
    changedAt: Date;
    note: string | null;
  }) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.contractId = props.contractId;
    this.fromStatus = props.fromStatus;
    this.toStatus = props.toStatus;
    this.changedByUserId = props.changedByUserId;
    this.changedAt = props.changedAt;
    this.note = props.note;
  }

  static create(props: {
    id: string;
    tenantId: string;
    contractId: string;
    fromStatus: string;
    toStatus: string;
    changedByUserId: string | null;
    note?: string | null;
    changedAt?: Date;
  }): ContractStatusHistory {
    return new ContractStatusHistory({
      ...props,
      changedAt: props.changedAt ?? new Date(),
      note: props.note ?? null,
    });
  }
}
