import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { lookupService, type LookupItemOf, type LookupListKey, type LookupValues } from '../services/lookupService';

const byOrder = <T extends { order: number }>(items: T[]) => [...items].sort((a, b) => a.order - b.order);

/**
 * One list's values for the Settings → Lists editor (Slice 8), inactive ones
 * included. Writes update the local copy from the server's answer, so the
 * screen always shows what was saved.
 */
export const useLookupList = <L extends LookupListKey>(list: L) => {
  const { tenantSlug } = useParams();
  const [items, setItems] = useState<LookupItemOf[L][]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      setItems(await lookupService.list(tenantSlug, list, true));
    } catch (error) {
      console.error(`Failed to fetch ${list}`, error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, list]);

  const replace = (item: LookupItemOf[L]) => setItems((current) => current.map((row) => (row.id === item.id ? item : row)));

  const create = async (values: LookupValues) => {
    const item = await lookupService.create(tenantSlug!, list, values);
    setItems((current) => byOrder([...current, item]));
  };

  const update = async (id: string, values: LookupValues) => replace(await lookupService.update(tenantSlug!, list, id, values));

  const reorder = async (ids: string[]) => {
    // Show the new order straight away; the server's answer then confirms it.
    const previous = items;
    setItems(ids.map((id, index) => ({ ...previous.find((item) => item.id === id)!, order: index + 1 })));
    try {
      setItems(await lookupService.reorder(tenantSlug!, list, ids));
    } catch (error) {
      setItems(previous);
      throw error;
    }
  };

  const setActive = async (id: string, active: boolean) => replace(await lookupService.setActive(tenantSlug!, list, id, active));

  const remove = async (id: string) => {
    await lookupService.remove(tenantSlug!, list, id);
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return { items, loading, loadFailed, fetchItems, create, update, reorder, setActive, remove };
};
