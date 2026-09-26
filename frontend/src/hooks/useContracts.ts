import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { contractService } from '../services/contractService';
import type { ClientContracts, ContractDetail } from '../types/contract';

export interface UseContractsOptions {
  query?: string;
  status?: string;
  clientId?: string;
  assignedUserId?: string;
  /** Active contracts ending within this many days — the renewals worklist. */
  expiringWithinDays?: number;
  page?: number;
  limit?: number;
}

/**
 * Reads. Mirrors `useInvoices` — the tenant slug comes from the route rather
 * than from props, so a component never threads it through.
 */
export function useContracts() {
  const { tenantSlug } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async <T,>(work: (slug: string) => Promise<T>): Promise<T> => {
      if (!tenantSlug) throw new Error('Missing tenant context');
      setLoading(true);
      setError(null);
      try {
        return await work(tenantSlug);
      } catch (err: any) {
        // The server's message is more useful than axios's "Request failed
        // with status code 400", so it is preferred where there is one.
        const message = err?.response?.data?.error ?? err.message;
        setError(typeof message === 'string' ? message : 'Something went wrong');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tenantSlug]
  );

  const fetchContracts = useCallback(
    (options: UseContractsOptions = {}) => call((slug) => contractService.fetchContracts(slug, options)),
    [call]
  );

  const fetchContractDetail = useCallback(
    (id: string): Promise<ContractDetail> =>
      call((slug) => contractService.fetchContractDetail(slug, id)),
    [call]
  );

  const fetchClientContracts = useCallback(
    (clientId: string): Promise<ClientContracts> =>
      call((slug) => contractService.fetchClientContracts(slug, clientId)),
    [call]
  );

  return { fetchContracts, fetchContractDetail, fetchClientContracts, loading, error };
}

/**
 * Writes. Separated from the reads above for the same reason
 * `useInvoiceActions` is: a page that only lists contracts should not have its
 * `loading` flag flipped by a mutation it never performs.
 */
export function useContractActions() {
  const { tenantSlug } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async <T,>(work: (slug: string) => Promise<T>): Promise<T> => {
      if (!tenantSlug) throw new Error('Missing tenant context');
      setLoading(true);
      setError(null);
      try {
        return await work(tenantSlug);
      } catch (err: any) {
        const message = err?.response?.data?.error ?? err.message;
        setError(typeof message === 'string' ? message : 'Something went wrong');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tenantSlug]
  );

  return {
    createContract: (data: any) => call((slug) => contractService.createContract(slug, data)),
    updateContract: (id: string, data: any) =>
      call((slug) => contractService.updateContract(slug, id, data)),
    activateContract: (id: string) => call((slug) => contractService.performAction(slug, id, 'activate')),
    cancelContract: (id: string, reason?: string) =>
      call((slug) => contractService.performAction(slug, id, 'cancel', { reason })),
    renewContract: (id: string, data?: any) =>
      call((slug) => contractService.performAction(slug, id, 'renew', data)),
    addPayment: (id: string, data: any) => call((slug) => contractService.addPayment(slug, id, data)),
    updatePayment: (id: string, paymentId: string, data: any) =>
      call((slug) => contractService.updatePayment(slug, id, paymentId, data)),
    recordPayment: (id: string, paymentId: string, data: any) =>
      call((slug) => contractService.recordPayment(slug, id, paymentId, data)),
    deletePayment: (id: string, paymentId: string) =>
      call((slug) => contractService.deletePayment(slug, id, paymentId)),
    uploadDocument: (id: string, file: File) =>
      call((slug) => contractService.uploadDocument(slug, id, file)),
    removeDocument: (id: string) => call((slug) => contractService.removeDocument(slug, id)),
    loading,
    error,
  };
}
