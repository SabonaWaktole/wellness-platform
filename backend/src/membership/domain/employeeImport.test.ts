import {
  cellDay,
  classifyRows,
  hasRequiredColumns,
  mapHeaders,
  previewCounts,
  safeCell,
  type KnownMember,
  type RawRow,
} from './employeeImport';

const TODAY = '2027-03-01';
const raw = (row: number, values: RawRow['values']): RawRow => ({ row, values });
const none = async (): Promise<KnownMember[]> => [];

describe('Employee upload rules (M4 Slice 9)', () => {
  it('FR-EMP-02: accepts the Albanian and English headers', () => {
    expect(mapHeaders(['Emri*', 'Mbiemri*', 'Data e lindjes', 'Telefoni', 'Email', 'Gjuha'])).toEqual({
      'Emri*': 'firstName', 'Mbiemri*': 'lastName', 'Data e lindjes': 'dateOfBirth', Telefoni: 'phone', Email: 'email', Gjuha: 'language',
    });
    expect(hasRequiredColumns(['First name*', 'Last name*', 'Phone'])).toBe(true);
    expect(hasRequiredColumns(['First name*', 'Phone'])).toBe(false);
  });

  it('FR-EMP-02: reports a row without a last name or without an identifier, with its row number', async () => {
    const rows = await classifyRows([raw(2, { firstName: 'Ana' }), raw(3, { firstName: 'Ben', lastName: 'Li' })], 'c1', TODAY, none);
    expect(rows.map((r) => [r.row, r.outcome])).toEqual([[2, 'ERROR'], [3, 'ERROR']]);
    expect(rows[1]!.reason).toMatch(/date of birth, a phone number or an email/);
  });

  it('FR-EMP-02: an empty language is Albanian, and dates in DD.MM.YYYY are read', async () => {
    const [row] = await classifyRows([raw(2, { firstName: 'Ana', lastName: 'Li', dateOfBirth: '14.05.1990' })], 'c1', TODAY, none);
    expect(row!.details).toMatchObject({ language: 'sq', dateOfBirth: '1990-05-14' });
    expect(cellDay('1990-05-14T00:00:00.000Z')).toBe('1990-05-14');
  });

  it('FR-EMP-04: classifies new, existing, repeated, linked elsewhere and error rows', async () => {
    const known: Record<string, KnownMember> = {
      'ex@x.al': { id: 'm-ex', employerClientId: null, status: 'ACTIVE' },
      'here@x.al': { id: 'm-here', employerClientId: 'c1', status: 'ACTIVE' },
      'else@x.al': { id: 'm-else', employerClientId: 'c2', status: 'ACTIVE' },
    };
    const find = async (d: { email: string | null }) => (d.email && known[d.email] ? [known[d.email]!] : []);
    const rows = await classifyRows(
      [
        raw(2, { firstName: 'A', lastName: 'One', email: 'new@x.al' }),
        raw(3, { firstName: 'A', lastName: 'Dup', email: 'NEW@x.al' }),
        raw(4, { firstName: 'B', lastName: 'Two', email: 'ex@x.al' }),
        raw(5, { firstName: 'C', lastName: 'Three', email: 'here@x.al' }),
        raw(6, { firstName: 'D', lastName: 'Four', email: 'else@x.al' }),
        raw(7, { firstName: 'E', lastName: '' , email: 'e@x.al' }),
      ],
      'c1',
      TODAY,
      find
    );
    expect(rows.map((r) => r.outcome)).toEqual(['NEW', 'SKIPPED', 'EXISTING', 'SKIPPED', 'REFUSED', 'ERROR']);
    expect(rows[1]!.reason).toBe('Repeated in the file');
    expect(rows[4]!.reason).toBe('Linked to another company');
    expect(rows[2]!.memberId).toBe('m-ex');
    expect(previewCounts(rows)).toEqual({ created: 1, linked: 1, skipped: 2, refused: 1, errors: 1 });
  });

  it('FR-MEM-04: a person matching two members is an error, a closed member is not linked', async () => {
    const two = await classifyRows([raw(2, { firstName: 'A', lastName: 'B', phone: '+355691234567' })], 'c1', TODAY, async () => [
      { id: 'a', employerClientId: null, status: 'ACTIVE' },
      { id: 'b', employerClientId: null, status: 'ACTIVE' },
    ]);
    expect(two[0]!.outcome).toBe('ERROR');
    const closed = await classifyRows([raw(2, { firstName: 'A', lastName: 'B', phone: '+355691234567' })], 'c1', TODAY, async () => [
      { id: 'a', employerClientId: null, status: 'CLOSED' },
    ]);
    expect(closed[0]!.reason).toBe('The member is closed');
  });

  it('NFR-SEC-09: a cell that starts like a formula is neutralised in an output file', () => {
    expect(safeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(safeCell('Row 3')).toBe('Row 3');
  });
});
