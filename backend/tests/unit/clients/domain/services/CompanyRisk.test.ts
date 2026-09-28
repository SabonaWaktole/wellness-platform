import { riskFor } from '../../../../../src/clients/domain/services/CompanyRisk';
import { businessType, riskLevel } from '../../../../support/fakeLookups';

describe('riskFor', () => {
  const low = riskLevel({ id: 'rl1', level: 1 });
  const high = riskLevel({ id: 'rl2', level: 2 });
  const cafe = businessType({ id: 'bt1', nameSq: 'Kafene', riskLevelId: 'rl1' });
  const casino = businessType({ id: 'bt2', nameSq: 'Kazino', riskLevelId: 'rl2' });

  it('derives the risk level from the business type', () => {
    expect(riskFor('bt1', [cafe, casino], [low, high])).toBe(low);
  });

  it('changing the business type changes the derived risk', () => {
    expect(riskFor('bt2', [cafe, casino], [low, high])).toBe(high);
  });

  it('returns null when there is no business type', () => {
    expect(riskFor(null, [cafe], [low])).toBeNull();
    expect(riskFor(undefined, [cafe], [low])).toBeNull();
  });

  it('returns null for a business type or risk level that no longer exists', () => {
    expect(riskFor('missing', [cafe], [low])).toBeNull();
    expect(riskFor('bt1', [{ ...cafe, riskLevelId: 'gone' }], [low])).toBeNull();
  });
});
