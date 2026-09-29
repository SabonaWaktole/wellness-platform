import { AddContactPersonUseCase } from '../../../../../src/clients/application/use-cases/AddContactPersonUseCase';
import { UpdateContactPersonUseCase } from '../../../../../src/clients/application/use-cases/UpdateContactPersonUseCase';
import { RemoveContactPersonUseCase } from '../../../../../src/clients/application/use-cases/RemoveContactPersonUseCase';
import { SetPrimaryContactUseCase } from '../../../../../src/clients/application/use-cases/SetPrimaryContactUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { IContactPersonRepository } from '../../../../../src/clients/domain/repositories/IContactPersonRepository';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { ContactPerson } from '../../../../../src/clients/domain/entities/ContactPerson';
import { PrimaryContactRequiredError } from '../../../../../src/clients/domain/errors';
import { administrator, reception, scopeResolver } from '../../../../support/access';

const client = Client.reconstitute({
  id: 'c1', tenantId: 't1', name: 'Acme', contactInfo: {}, status: '', customFieldValues: {},
  lastUpdatedByUserId: 'u1', createdAt: new Date(), updatedAt: new Date(),
});

const contact = (id: string, isPrimary: boolean) =>
  ContactPerson.reconstitute({
    id, tenantId: 't1', clientId: 'c1', name: `Contact ${id}`, phone: '+355691234567',
    isPrimary, createdAt: new Date(), updatedAt: new Date(),
  });

describe('FR-CMP-04 contact person use cases', () => {
  let clientRepo: jest.Mocked<IClientRepository>;
  let contactRepo: jest.Mocked<IContactPersonRepository>;
  let writeTx: { run: jest.Mock };

  beforeEach(() => {
    clientRepo = { findById: jest.fn().mockResolvedValue(client) } as any;
    contactRepo = {
      listByClient: jest.fn().mockResolvedValue([]),
      listByClients: jest.fn(),
      saveMany: jest.fn(),
      softDelete: jest.fn(),
    };
    writeTx = { run: jest.fn((work) => work({ contacts: contactRepo })) };
  });

  const owner = { tenantId: 't1', clientId: 'c1', access: administrator() };

  describe('AddContactPersonUseCase', () => {
    it('adds a contact and makes it primary when the company had none', async () => {
      contactRepo.listByClient.mockResolvedValue([]);
      const useCase = new AddContactPersonUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      const result = await useCase.execute({ ...owner, name: 'Jane', phone: '+355691234567' });

      expect(result.isPrimary).toBe(true);
      expect(contactRepo.saveMany).toHaveBeenCalledWith('t1', [expect.objectContaining({ name: 'Jane', isPrimary: true })]);
    });

    it('does not make a second contact primary', async () => {
      contactRepo.listByClient.mockResolvedValue([contact('1', true)]);
      const useCase = new AddContactPersonUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      const result = await useCase.execute({ ...owner, name: 'Jane', phone: '+355691234567' });

      expect(result.isPrimary).toBe(false);
    });

    it('404s for a company outside the viewer scope', async () => {
      clientRepo.findById.mockResolvedValue(null);
      const useCase = new AddContactPersonUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      await expect(useCase.execute({ ...owner, name: 'Jane', phone: '+355691234567' }))
        .rejects.toThrow('Client not found');
    });

    it('a caller without companies.edit gets a not-found, same as a real scoped repository would 404 it (FR-RBAC-05)', async () => {
      // A real PrismaClientRepository would apply the 'none' scope and find
      // nothing; this double reproduces that outcome directly.
      clientRepo.findById.mockResolvedValue(null);
      const useCase = new AddContactPersonUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      await expect(
        useCase.execute({ ...owner, access: reception(), name: 'Jane', phone: '+355691234567' })
      ).rejects.toThrow('Client not found');
      expect(contactRepo.saveMany).not.toHaveBeenCalled();
    });
  });

  describe('UpdateContactPersonUseCase', () => {
    it('applies a partial patch, leaving unspecified fields alone', async () => {
      contactRepo.listByClient.mockResolvedValue([contact('1', true)]);
      const useCase = new UpdateContactPersonUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      const result = await useCase.execute({ ...owner, contactId: '1', position: 'Manager' });

      expect(result.position).toBe('Manager');
      expect(result.phone).toBe('+355691234567');
    });
  });

  describe('RemoveContactPersonUseCase', () => {
    it('refuses to remove the last contact', async () => {
      contactRepo.listByClient.mockResolvedValue([contact('1', true)]);
      const useCase = new RemoveContactPersonUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      await expect(useCase.execute({ ...owner, contactId: '1' })).rejects.toThrow(PrimaryContactRequiredError);
      expect(contactRepo.softDelete).not.toHaveBeenCalled();
    });

    it('removes the primary and promotes the named replacement', async () => {
      contactRepo.listByClient.mockResolvedValue([contact('1', true), contact('2', false)]);
      const useCase = new RemoveContactPersonUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      await useCase.execute({ ...owner, contactId: '1', newPrimaryContactId: '2' });

      expect(contactRepo.saveMany).toHaveBeenCalledWith('t1', [expect.objectContaining({ id: '2', isPrimary: true })]);
      expect(contactRepo.softDelete).toHaveBeenCalledWith('t1', '1');
    });

    it('removing a non-primary contact needs no replacement', async () => {
      contactRepo.listByClient.mockResolvedValue([contact('1', true), contact('2', false)]);
      const useCase = new RemoveContactPersonUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      await useCase.execute({ ...owner, contactId: '2' });

      expect(contactRepo.saveMany).not.toHaveBeenCalled();
      expect(contactRepo.softDelete).toHaveBeenCalledWith('t1', '2');
    });
  });

  describe('SetPrimaryContactUseCase', () => {
    it('moves primary status to the named contact', async () => {
      contactRepo.listByClient.mockResolvedValue([contact('1', true), contact('2', false)]);
      const useCase = new SetPrimaryContactUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      await useCase.execute({ ...owner, contactId: '2' });

      expect(contactRepo.saveMany).toHaveBeenCalledWith('t1', [
        expect.objectContaining({ id: '2', isPrimary: true }),
        expect.objectContaining({ id: '1', isPrimary: false }),
      ]);
    });

    it('is a no-op when the contact is already primary', async () => {
      contactRepo.listByClient.mockResolvedValue([contact('1', true)]);
      const useCase = new SetPrimaryContactUseCase(clientRepo, contactRepo, scopeResolver(), writeTx as any);

      await useCase.execute({ ...owner, contactId: '1' });

      expect(contactRepo.saveMany).not.toHaveBeenCalled();
    });
  });
});
