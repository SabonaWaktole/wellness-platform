import { apiClient as api } from '../api';
import type { RichTextDoc } from '../types/form';

/**
 * The sales script's client (M2 Slice 5: FR-SCR-03..07). Salespeople read
 * the published script; the Administrator edits a draft, publishes it, and
 * looks back at or restores earlier versions.
 */
export type ScriptLanguage = 'sq' | 'en';
export type ScriptStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';

export interface ScriptAuthor {
  id: string;
  name: string;
}

export interface ScriptSection {
  /** `section-<n>`: the n-th section heading (H2) of the script. */
  anchor: string;
  title: string;
}

/** What the panel shows: the published script in one language. */
export interface PublishedScript {
  version: number;
  publishedAt: string | null;
  /** The language shown: Albanian when English was asked for but is empty. */
  language: ScriptLanguage;
  content: RichTextDoc;
  sections: ScriptSection[];
}

/** A version as the editor sees it: both languages. */
export interface ScriptVersion {
  version: number;
  status: ScriptStatus;
  contentSq: RichTextDoc;
  contentEn: RichTextDoc | null;
  createdBy: ScriptAuthor | null;
  updatedAt: string;
  publishedAt: string | null;
  publishedBy: ScriptAuthor | null;
}

export interface ScriptVersionList {
  versions: Array<Pick<ScriptVersion, 'version' | 'status' | 'publishedAt' | 'publishedBy'>>;
  draft: Pick<ScriptVersion, 'version' | 'updatedAt' | 'createdBy'> | null;
}

const base = (tenantSlug: string) => `/${tenantSlug}/sales-script`;

export const salesScriptService = {
  published: async (tenantSlug: string, language: ScriptLanguage): Promise<PublishedScript> =>
    (await api.get<{ data: PublishedScript }>(base(tenantSlug), { params: { lang: language } })).data.data,

  draft: async (tenantSlug: string): Promise<{ draft: ScriptVersion | null; published: ScriptVersion | null }> =>
    (await api.get<{ data: { draft: ScriptVersion | null; published: ScriptVersion | null } }>(`${base(tenantSlug)}/draft`)).data
      .data,

  saveDraft: async (tenantSlug: string, content: { contentSq: RichTextDoc | null; contentEn: RichTextDoc | null }): Promise<ScriptVersion> =>
    (await api.put<{ data: ScriptVersion }>(`${base(tenantSlug)}/draft`, content)).data.data,

  publish: async (tenantSlug: string): Promise<ScriptVersion> =>
    (await api.post<{ data: ScriptVersion }>(`${base(tenantSlug)}/publish`)).data.data,

  versions: async (tenantSlug: string): Promise<ScriptVersionList> =>
    (await api.get<{ data: ScriptVersionList }>(`${base(tenantSlug)}/versions`)).data.data,

  version: async (tenantSlug: string, version: number): Promise<ScriptVersion> =>
    (await api.get<{ data: ScriptVersion }>(`${base(tenantSlug)}/versions/${version}`)).data.data,

  restore: async (tenantSlug: string, version: number): Promise<ScriptVersion> =>
    (await api.post<{ data: ScriptVersion }>(`${base(tenantSlug)}/versions/${version}/restore`)).data.data,
};
