import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { PermissionDeniedError } from '../../../../access/domain/errors';
import { CALENDAR_KINDS, CONTRACT_CALENDAR_KINDS } from '../../../application/calendar/calendarViews';
import { GetCalendarUseCase, InvalidCalendarRangeError } from '../../../application/calendar/GetCalendarUseCase';

/** `userIds[]=a&userIds[]=b`, `userIds=a` and `userIds=a,b` all mean the same list. */
const list = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((value) => {
    if (value === undefined) return undefined;
    const parts = Array.isArray(value) ? value : [value];
    return parts.flatMap((part) => String(part).split(',')).map((part) => part.trim()).filter(Boolean);
  }, z.array(item).max(100).optional());

const calendarQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  userIds: list(z.string()),
  kinds: list(z.enum([...CALENDAR_KINDS, ...CONTRACT_CALENDAR_KINDS])),
  types: list(z.string().max(30)),
});

/** The calendar feed (M2 Slice 12). Parses, calls the use case, maps the errors. */
export class CalendarController {
  constructor(private readonly getCalendar: GetCalendarUseCase) {}

  feed = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // The query-string parser nests `userIds[]` under `userIds`; both spellings are accepted.
      const raw = { ...req.query } as Record<string, unknown>;
      for (const name of ['userIds', 'kinds', 'types']) {
        if (raw[`${name}[]`] !== undefined) raw[name] = raw[`${name}[]`];
      }
      const query = calendarQuery.parse(raw);
      const data = await this.getCalendar.execute({ access: req.access!, tenantId: requireTenantId(req), timezone: req.tenant?.timezone, ...query });
      res.status(200).json({ data });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
      }
      if (error instanceof InvalidCalendarRangeError) return res.status(400).json({ error: error.message });
      if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
      return next(error);
    }
  };
}
