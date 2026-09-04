import { ClientForm } from '../../../../../src/forms/domain/entities/ClientForm';
import { FormStatus } from '../../../../../src/forms/domain/enums/FormStatus';

describe('ClientForm.publish', () => {
  it('mints a share token on first publish, sets status and stamps the draft version', () => {
    const draft = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake', version: 3 });

    const published = draft.publish({ versionId: 'v1', shareToken: 'abc123' });

    expect(published.status).toBe(FormStatus.PUBLISHED);
    expect(published.publishedVersionId).toBe('v1');
    expect(published.shareToken).toBe('abc123');
    // A publish is itself a mutation, so it bumps `version` like every other
    // mutator — and the NEW value is what gets stamped, so
    // hasUnpublishedChanges reads false immediately afterwards.
    expect(published.version).toBe(4);
    expect(published.publishedAtDraftVersion).toBe(4);
  });

  it('keeps the existing share token on a re-publish rather than minting a new one', () => {
    const first = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake' }).publish({
      versionId: 'v1',
      shareToken: 'first-token',
    });

    const second = first.publish({ versionId: 'v2', shareToken: 'ignored-if-already-set' });

    expect(second.shareToken).toBe('first-token');
    expect(second.publishedVersionId).toBe('v2');
  });

  it('has no unpublished changes immediately after publishing', () => {
    const published = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake' }).publish({
      versionId: 'v1',
      shareToken: 'tok',
    });
    expect(published.hasUnpublishedChanges()).toBe(false);
  });

  it('reports unpublished changes after a further edit bumps the draft version', () => {
    const published = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake' }).publish({
      versionId: 'v1',
      shareToken: 'tok',
    });
    const edited = published.withSettings({ name: 'Renamed' });
    expect(edited.hasUnpublishedChanges()).toBe(true);
  });

  it('reports no unpublished changes on a form that has never been published', () => {
    const draft = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake' });
    expect(draft.hasUnpublishedChanges()).toBe(false);
  });
});
