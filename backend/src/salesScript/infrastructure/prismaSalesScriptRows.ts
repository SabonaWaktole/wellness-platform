import { Prisma } from '@prisma/client';
import type { RichTextDoc } from '../../shared/domain/richText';
import { SalesScriptStatus, SalesScriptVersion, ScriptAuthor } from '../domain/SalesScript';

/** The Albanian text, which every version has. */
export const richTextJson = (doc: RichTextDoc): Prisma.InputJsonObject => doc as unknown as Prisma.InputJsonObject;

/** A nullable rich-text column as written: SQL NULL rather than JSON null. */
export const richTextData = (doc: RichTextDoc | null): Prisma.InputJsonObject | typeof Prisma.DbNull =>
  doc === null ? Prisma.DbNull : (doc as unknown as Prisma.InputJsonObject);

const authorSelect = { select: { id: true, firstName: true, lastName: true, email: true } } as const;

export const salesScriptInclude = { createdBy: authorSelect, publishedBy: authorSelect } as const;

type AuthorRow = { id: string; firstName: string | null; lastName: string | null; email: string } | null;
type SalesScriptRow = Prisma.SalesScriptGetPayload<{ include: typeof salesScriptInclude }>;

const authorFromRow = (user: AuthorRow): ScriptAuthor | null =>
  user ? { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email } : null;

export function salesScriptFromRow(row: SalesScriptRow): SalesScriptVersion {
  return {
    id: row.id,
    version: row.version,
    status: row.status as SalesScriptStatus,
    // The sanitiser decided the shape on the way in.
    contentSq: row.contentSq as unknown as RichTextDoc,
    contentEn: (row.contentEn ?? null) as unknown as RichTextDoc | null,
    createdBy: authorFromRow(row.createdBy),
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    publishedBy: authorFromRow(row.publishedBy),
  };
}
