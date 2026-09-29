import { useState, useCallback, useRef } from 'react';
import { clientService } from '../services/clientService';
import { useParams } from 'react-router-dom';
import type { Client, SearchClientsParams, CustomFieldDefinition, OutcomeCategory, ClientHistory, ClientRelatedCounts, ContactPersonInput, TimelineCategory } from '../types/client';
import { extractApiErrorMessage } from '../utils/apiError';

export const useClients = () => {
  const { tenantSlug } = useParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async (params: SearchClientsParams = {}) => {
    if (!tenantSlug) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await clientService.searchClients(tenantSlug, params);
      setClients(result.items);
      setTotal(result.total);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch clients');
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  return { clients, total, isLoading, error, fetchClients };
};

export const useClientDetail = (clientId: string) => {
  const { tenantSlug } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClient = useCallback(async () => {
    if (!tenantSlug || !clientId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientService.getClient(tenantSlug, clientId);
      setClient(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch client details');
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, clientId]);

  return { client, isLoading, error, fetchClient };
};

/**
 * The company timeline (FR-CMP-05): the first page for the chosen `types`,
 * then `loadMore` appends the next page by cursor. Changing `types` changes
 * `fetchHistory`, so a caller's effect on it refetches from the top. A
 * response that arrives after a newer request started is dropped, so quickly
 * toggling filters cannot leave an older filter's entries on screen.
 */
export const useClientHistory = (clientId: string) => {
  const { tenantSlug } = useParams();
  const [history, setHistory] = useState<ClientHistory | null>(null);
  const [types, setTypes] = useState<TimelineCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const fetchHistory = useCallback(async () => {
    if (!tenantSlug || !clientId) return;
    const request = ++latestRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientService.getClientHistory(tenantSlug, clientId, { types });
      if (request === latestRequest.current) setHistory(data);
    } catch (err: any) {
      if (request === latestRequest.current) setError(err.response?.data?.error || 'Failed to fetch history');
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  }, [tenantSlug, clientId, types]);

  const nextCursor = history?.nextCursor ?? null;
  const loadMore = useCallback(async () => {
    if (!tenantSlug || !clientId || !nextCursor) return;
    const request = latestRequest.current;
    setIsLoadingMore(true);
    try {
      const data = await clientService.getClientHistory(tenantSlug, clientId, { types, cursor: nextCursor });
      if (request === latestRequest.current) {
        setHistory((current) => ({
          timeline: [...(current?.timeline ?? []), ...data.timeline],
          nextCursor: data.nextCursor,
        }));
      }
    } catch (err: any) {
      if (request === latestRequest.current) setError(err.response?.data?.error || 'Failed to fetch history');
    } finally {
      setIsLoadingMore(false);
    }
  }, [tenantSlug, clientId, types, nextCursor]);

  return { history, types, setTypes, isLoading, isLoadingMore, error, fetchHistory, loadMore };
};

export const useClientSettings = () => {
  const { tenantSlug } = useParams();
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [outcomeCategories, setOutcomeCategories] = useState<OutcomeCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!tenantSlug) return;
    setIsLoading(true);
    setError(null);
    try {
      const [cf, oc] = await Promise.all([
        clientService.getCustomFields(tenantSlug),
        clientService.getOutcomeCategories(tenantSlug)
      ]);
      setCustomFields(cf);
      setOutcomeCategories(oc);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch client settings');
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  return { customFields, outcomeCategories, isLoading, error, fetchSettings };
};

export const useCreateClient = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createClient = async (data: any) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.createClient(tenantSlug, data);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create client';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { createClient, isLoading, error };
};

export const useUpdateClient = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateClient = async (clientId: string, data: any) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.updateClient(tenantSlug, clientId, data);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to update client';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateClient, isLoading, error };
};

export const useAddInteraction = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addInteraction = async (clientId: string, data: { channel: string; content: string; outcomeCategoryId?: string }) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.addInteraction(tenantSlug, clientId, data);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to add interaction';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { addInteraction, isLoading, error };
};

export const useDefineCustomField = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defineCustomField = async (data: { fieldName: string; fieldType: string; options?: string[]; role?: string | null; required?: boolean }) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.defineCustomField(tenantSlug, data);
    } catch (err: any) {
      // Validation failures arrive as `{ issues: [...] }`, not `{ error }`, so
      // reading only `.error` fell through to the generic fallback and the user
      // was told nothing about what was actually wrong.
      setError(extractApiErrorMessage(err, 'Failed to define custom field'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { defineCustomField, isLoading, error };
};

export const useUpdateCustomField = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCustomField = async (fieldId: string, data: { fieldName?: string; fieldType?: string; options?: string[]; role?: string | null; required?: boolean }) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.updateCustomField(tenantSlug, fieldId, data);
    } catch (err: any) {
      setError(extractApiErrorMessage(err, 'Failed to update custom field'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateCustomField, isLoading, error };
};

export const useDeleteCustomField = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteCustomField = async (fieldId: string) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.deleteCustomField(tenantSlug, fieldId);
    } catch (err: any) {
      setError(extractApiErrorMessage(err, 'Failed to delete custom field'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteCustomField, isLoading, error };
};

/**
 * Archives a client (soft delete). The client leaves the active list but its
 * invoices, quotations, appointments and history stay intact — see
 * ArchiveClientUseCase on the backend.
 */
export const useArchiveClient = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archiveClient = async (clientId: string) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.archiveClient(tenantSlug, clientId);
    } catch (err: any) {
      setError(extractApiErrorMessage(err, 'Failed to delete client'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { archiveClient, isLoading, error };
};

export const useRestoreClient = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restoreClient = async (clientId: string) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.restoreClient(tenantSlug, clientId);
    } catch (err: any) {
      setError(extractApiErrorMessage(err, 'Failed to restore client'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { restoreClient, isLoading, error };
};

/** Fetches what a client is attached to, for the archive confirmation dialog. */
export const useClientRelatedCounts = () => {
  const { tenantSlug } = useParams();
  const [counts, setCounts] = useState<ClientRelatedCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRelatedCounts = useCallback(async (clientId: string) => {
    if (!tenantSlug) return;
    setIsLoading(true);
    setCounts(null);
    try {
      setCounts(await clientService.getClientRelatedCounts(tenantSlug, clientId));
    } catch {
      // The dialog still works without counts — it just omits the detail line
      // rather than blocking the owner from archiving.
      setCounts(null);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  return { counts, isLoading, fetchRelatedCounts };
};

export const useReorderCustomFields = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reorderCustomFields = async (orderedFieldIds: string[]) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.reorderCustomFields(tenantSlug, orderedFieldIds);
    } catch (err: any) {
      setError(extractApiErrorMessage(err, 'Failed to reorder custom fields'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { reorderCustomFields, isLoading, error };
};

/**
 * Contact person writes (FR-CMP-04): add, edit, remove and set-primary,
 * each against the caller-supplied clientId — the editor calls these once
 * per row rather than resubmitting the whole company form.
 */
export const useContactPersons = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guard = async <T,>(work: () => Promise<T>, fallback: string): Promise<T> => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await work();
    } catch (err: any) {
      setError(extractApiErrorMessage(err, fallback));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const addContact = (clientId: string, data: ContactPersonInput) =>
    guard(() => clientService.addContact(tenantSlug!, clientId, data), 'Failed to add contact');

  const updateContact = (clientId: string, contactId: string, data: Partial<Omit<ContactPersonInput, 'isPrimary'>>) =>
    guard(() => clientService.updateContact(tenantSlug!, clientId, contactId, data), 'Failed to update contact');

  const removeContact = (clientId: string, contactId: string, newPrimaryContactId?: string) =>
    guard(() => clientService.removeContact(tenantSlug!, clientId, contactId, newPrimaryContactId), 'Failed to remove contact');

  const setPrimaryContact = (clientId: string, contactId: string) =>
    guard(() => clientService.setPrimaryContact(tenantSlug!, clientId, contactId), 'Failed to set the primary contact');

  return { addContact, updateContact, removeContact, setPrimaryContact, isLoading, error };
};

export const useDefineOutcomeCategory = () => {
  const { tenantSlug } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defineOutcomeCategory = async (data: { label: string }) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    setIsLoading(true);
    setError(null);
    try {
      return await clientService.defineOutcomeCategory(tenantSlug, data);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to define outcome category';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { defineOutcomeCategory, isLoading, error };
};
