import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { IClientRepository } from '../../domain/repositories/IClientRepository';

/** The repositories a custom-field edit writes through, all on one connection. */
export interface CustomFieldWriteRepos {
  customFieldRepo: ICustomFieldDefinitionRepository;
  clientRepo: IClientRepository;
}

/**
 * Runs a custom-field definition edit and its `Client.customFieldValues` key
 * rename atomically.
 *
 * Renaming a field is two writes on two different tables — the definition
 * (`CustomFieldDefinition.fieldName`) and, when the name actually changed,
 * every affected client's `customFieldValues` key
 * (`IClientRepository.renameCustomFieldKey`). Two independent awaits would
 * leave the definition renamed and every client's stored value still under
 * the OLD key if the second write failed, which is the exact bug this port
 * exists to close (see UpdateCustomFieldUseCase).
 *
 * Mirrors `IQuotationWriteTransaction`, not `IUnitOfWork` — the deleted
 * no-op that opened a `$transaction` without ever handing repositories the
 * transaction client, so nothing inside it actually joined the transaction
 * (see TD-032). This port hands the caller repositories bound to `tx`, so the
 * atomicity is real.
 */
export interface ICustomFieldWriteTransaction {
  run<T>(work: (repos: CustomFieldWriteRepos) => Promise<T>): Promise<T>;
}
