import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { IFormVersionRepository } from '../../domain/repositories/IFormVersionRepository';
import { FormStatus } from '../../domain/enums/FormStatus';
import { FormDocument } from '../../domain/value-objects/FormDocument';
import { FormSettings } from '../../domain/entities/ClientForm';

export interface PublicFormView {
  formId: string;
  formName: string;
  formDescription: string | null;
  document: FormDocument;
  versionNumber: number;
  settings: FormSettings;
}

/**
 * Resolves a public share token to the form's PUBLISHED snapshot — never the
 * mutable draft (spec §5, §8: a client filling a shared link must see
 * exactly what was published, not whatever the owner happens to be editing
 * right now).
 *
 * Returns `null` for every failure mode — unknown token, still a draft, not
 * accepting responses — the same "404 for everything" discipline
 * `GetPublicQuotationUseCase` uses: distinguishing them would tell a probing
 * caller which tokens are real, which is exactly the signal the token
 * length exists to deny.
 */
export class GetPublicFormUseCase {
  constructor(
    private formRepo: IClientFormRepository,
    private versionRepo: IFormVersionRepository
  ) {}

  async execute(token: string): Promise<PublicFormView | null> {
    const form = await this.formRepo.findByShareToken(token);
    if (!form) return null;
    if (form.status !== FormStatus.PUBLISHED || !form.publishedVersionId) return null;
    if (form.settings.acceptingResponses === false) return null;

    const version = await this.versionRepo.findById(form.publishedVersionId);
    if (!version) return null;

    return {
      formId: form.id,
      formName: form.name,
      formDescription: form.description,
      document: version.document,
      versionNumber: version.versionNumber,
      settings: form.settings,
    };
  }
}
