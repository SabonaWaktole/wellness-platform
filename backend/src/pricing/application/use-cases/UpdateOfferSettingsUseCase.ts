import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { AuditChange } from '../../../audit/domain/AuditChange';
import { InvalidRichTextError, richTextPlainText, sanitizeRichText } from '../../../shared/application/richText/sanitizeRichText';
import { OFFER_TEXT_FIELDS, OfferTextField } from '../../domain/DefaultOfferSettings';
import { InvalidPricingValueError } from '../../domain/errors';
import { OfferSettings, parseOfferSettings } from '../../domain/OfferSettings';
import { MANAGE_PRICING, pricingAuditEntry } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Sets the offer settings (FR-PCF-08): validity, contract length, number
 * prefix, the company details printed on the offer and the standard texts.
 * Only the fields sent change. Each text is sanitised before it is stored
 * (NFR-SEC-05). One audit entry with the changed fields' old and new values,
 * the texts as plain text (FR-AUD-09).
 */
export class UpdateOfferSettingsUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; values: Record<string, unknown> }): Promise<OfferSettings> {
    input.access.ensure(MANAGE_PRICING);
    const changes: Partial<OfferSettings> = parseOfferSettings(input.values);
    for (const field of OFFER_TEXT_FIELDS) {
      if (!(field in input.values) || input.values[field] === undefined) continue;
      try {
        changes[field] = sanitizeRichText(input.values[field]);
      } catch (error) {
        if (error instanceof InvalidRichTextError) {
          throw new InvalidPricingValueError('INVALID_RICH_TEXT', field, error.message);
        }
        throw error;
      }
    }

    const { offerSettings: current } = await this.store.settings(input.tenantId);
    const changed = (Object.keys(changes) as (keyof OfferSettings)[]).filter(
      (field) => JSON.stringify(changes[field]) !== JSON.stringify(current[field])
    );
    if (changed.length === 0) {
      return current;
    }

    const isText = (field: keyof OfferSettings): field is OfferTextField => (OFFER_TEXT_FIELDS as readonly string[]).includes(field);
    const audited: AuditChange[] = changed.map((field) =>
      isText(field)
        ? { field, old: richTextPlainText(current[field]), new: richTextPlainText(changes[field] ?? null) }
        : { field, old: current[field], new: changes[field] }
    );
    const write = Object.fromEntries(changed.map((field) => [field, changes[field]])) as Partial<OfferSettings>;

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.updateOfferSettings(input.tenantId, write);
      await auditTrail.record(
        pricingAuditEntry(
          input.access,
          input.tenantId,
          { entityType: 'PricingSettings', entityId: input.tenantId, entityLabel: null },
          AuditAction.Update,
          audited
        )
      );
    });
    return { ...current, ...write };
  }
}
