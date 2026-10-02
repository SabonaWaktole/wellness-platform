import { Interaction } from '../../../../../src/clients/domain/entities/Interaction';
import { InteractionChannel } from '../../../../../src/clients/domain/enums/InteractionChannel';
import { OutcomeCategory } from '../../../../../src/clients/domain/entities/OutcomeCategory';
import { InvalidActivityError } from '../../../../../src/clients/domain/errors';

describe('Interaction Entity', () => {
  it('creates an interaction with an outcome category', () => {
    const outcome = OutcomeCategory.create({ id: 'out-1', tenantId: 'tenant-1', label: 'Positive' });
    
    const interaction = Interaction.create({
      id: 'int-1',
      tenantId: 'tenant-1',
      clientId: 'client-1',
      authorUserId: 'user-1',
      content: 'Met with client.',
      channel: InteractionChannel.MEETING,
      outcomeCategory: outcome,
      createdAt: new Date(),
    });

    expect(interaction.id).toBe('int-1');
    expect(interaction.channel).toBe(InteractionChannel.MEETING);
    expect(interaction.outcomeCategory?.label).toBe('Positive');
  });

  it('rejects outcome category if tenantId does not match interaction tenantId', () => {
    const outcome = OutcomeCategory.create({ id: 'out-2', tenantId: 'tenant-2', label: 'Positive' });
    
    expect(() => {
      Interaction.create({
        id: 'int-2',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        authorUserId: 'user-1',
        content: 'Met with client.',
        channel: InteractionChannel.MEETING,
        outcomeCategory: outcome,
        createdAt: new Date(),
      });
    }).toThrow('Outcome category does not belong to this tenant.');
  });
});

describe('Interaction as an activity (M2 Slice 7)', () => {
  const now = new Date('2026-10-02T10:00:00.000Z');
  const who = { id: 'int-9', tenantId: 'tenant-1', clientId: 'client-1', authorUserId: 'user-1' };
  const call = {
    channel: InteractionChannel.CALL,
    content: '',
    occurredAt: new Date('2026-10-01T15:30:00.000Z'),
    contactPersonId: 'contact-1',
    resultId: 'result-1',
    clientFeedback: 'Wants a price for two employees.',
    nextAction: 'Send the offer.',
  };

  const fieldOf = (work: () => unknown) => {
    try {
      work();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidActivityError);
      return (error as InvalidActivityError).field;
    }
    throw new Error('expected an InvalidActivityError');
  };

  it('FR-ACT-01 records each of the six types', () => {
    expect(Object.values(InteractionChannel).sort()).toEqual(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'ONLINE_MEETING', 'VISIT']);
    for (const channel of Object.values(InteractionChannel)) {
      const activity = Interaction.record({ ...who, ...call, channel, content: 'Notes' }, now);
      expect(activity.channel).toBe(channel);
    }
  });

  it('FR-ACT-02 an activity keeps when it happened, the contact, the result, the feedback and the next action', () => {
    const activity = Interaction.record({ ...who, ...call }, now);
    expect(activity).toMatchObject({
      occurredAt: call.occurredAt,
      contactPersonId: 'contact-1',
      resultId: 'result-1',
      clientFeedback: 'Wants a price for two employees.',
      nextAction: 'Send the offer.',
      createdAt: now,
      updatedAt: null,
    });
  });

  it('FR-ACT-02 the time defaults to now and may be in the past, never in the future', () => {
    expect(Interaction.record({ ...who, ...call, occurredAt: undefined }, now).occurredAt).toEqual(now);
    expect(fieldOf(() => Interaction.record({ ...who, ...call, occurredAt: new Date('2026-10-02T10:05:00.000Z') }, now))).toBe('occurredAt');
    // Up to a minute ahead is the clock of the device that sent it, not the future.
    expect(() => Interaction.record({ ...who, ...call, occurredAt: new Date('2026-10-02T10:00:30.000Z') }, now)).not.toThrow();
  });

  it('FR-ACT-02 every type but a note needs a contact person and a result', () => {
    expect(fieldOf(() => Interaction.record({ ...who, ...call, contactPersonId: null }, now))).toBe('contactPersonId');
    expect(fieldOf(() => Interaction.record({ ...who, ...call, resultId: undefined }, now))).toBe('resultId');
    const note = Interaction.record({ ...who, channel: InteractionChannel.NOTE, content: 'Prefers mornings.' }, now);
    expect(note).toMatchObject({ contactPersonId: null, resultId: null, occurredAt: now });
  });

  it('FR-ACT-02 a note needs text; an activity does not', () => {
    expect(fieldOf(() => Interaction.record({ ...who, channel: InteractionChannel.NOTE, content: '   ' }, now))).toBe('content');
    expect(Interaction.record({ ...who, ...call, content: '  ' }, now).content).toBe('');
  });

  it('FR-ACT-06 an edit keeps the author and creation time and records who edited it', () => {
    const activity = Interaction.record({ ...who, ...call }, now);
    const later = new Date('2026-10-02T12:00:00.000Z');
    const edited = activity.edit({ ...call, channel: InteractionChannel.VISIT, nextAction: 'Visit on Monday.' }, 'manager-1', later);
    expect(edited).toMatchObject({
      id: 'int-9',
      authorUserId: 'user-1',
      createdAt: now,
      channel: InteractionChannel.VISIT,
      nextAction: 'Visit on Monday.',
      updatedAt: later,
      updatedByUserId: 'manager-1',
    });
  });

  it('FR-ACT-06 an edit cannot turn a note into an activity or back', () => {
    const activity = Interaction.record({ ...who, ...call }, now);
    expect(fieldOf(() => activity.edit({ channel: InteractionChannel.NOTE, content: 'x' }, 'user-1', now))).toBe('channel');
    const note = Interaction.record({ ...who, channel: InteractionChannel.NOTE, content: 'x' }, now);
    expect(fieldOf(() => note.edit({ ...call }, 'user-1', now))).toBe('channel');
  });

  it('FR-ACT-06 the author may edit for 24 hours after recording', () => {
    const activity = Interaction.record({ ...who, ...call }, now);
    expect(activity.authorMayStillEdit(new Date('2026-10-03T09:59:59.000Z'))).toBe(true);
    expect(activity.authorMayStillEdit(new Date('2026-10-03T10:00:00.000Z'))).toBe(false);
  });

  it('FR-ACT-07 a legacy interaction with no occurredAt is dated by its creation', () => {
    const legacy = Interaction.create({ ...who, content: 'Old call', channel: InteractionChannel.CALL, createdAt: now });
    expect(legacy.occurredAt).toEqual(now);
    expect(legacy.contactPersonId).toBeNull();
    expect(legacy.resultId).toBeNull();
  });
});
