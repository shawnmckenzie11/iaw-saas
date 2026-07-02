import {
  QUICK_SELECT_LIMIT,
  allRegisteredDropoffs,
  quickDropoffOptions,
  quickPickupOptions,
  rankedRegisteredDropoffs,
} from '../../../frontend/src/data/quickSelectOptions';

describe('location quick select helpers', () => {
  const commonPickups = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];

  it('quickPickupOptions preserves archive frequency order and caps at 10', () => {
    const topPickups = ['Echo', 'Alpha', 'Missing', 'Bravo'];
    const quick = quickPickupOptions(topPickups, commonPickups, false);
    expect(quick).toEqual(['Echo', 'Alpha', 'Bravo']);
  });

  it('quickPickupOptions returns full list when showAll is true', () => {
    const quick = quickPickupOptions(['Echo'], commonPickups, true);
    expect(quick).toEqual(commonPickups);
  });

  it('quickDropoffOptions ranks pickup-specific dropoffs then tops up alphabetically', () => {
    const registered = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
    const ranked = ['Echo', 'Bravo'];
    const quick = quickDropoffOptions(ranked, registered, false, 5);
    expect(quick).toEqual(['Echo', 'Bravo', 'Alpha', 'Charlie', 'Delta']);
  });

  it('quickDropoffOptions ignores unregistered names in ranked list', () => {
    const registered = ['Alpha', 'Bravo', 'Charlie'];
    const quick = quickDropoffOptions(['Unknown', 'Bravo'], registered, false);
    expect(quick).toEqual(['Bravo', 'Alpha', 'Charlie']);
  });

  it('quickDropoffOptions returns all registered businesses when showAll is true', () => {
    const registered = ['Alpha', 'Bravo', 'Charlie'];
    expect(quickDropoffOptions(['Bravo'], registered, true)).toEqual(registered);
  });

  it('rankedRegisteredDropoffs filters to registered businesses only', () => {
    const conditional = {
      Wajax: ['Toromont', 'Unknown Co', 'Komatsu (260)'],
    };
    const registered = ['Wajax', 'Toromont', 'Komatsu (260)'];
    expect(rankedRegisteredDropoffs('Wajax', conditional, registered, 'Wajax')).toEqual([
      'Toromont',
      'Komatsu (260)',
    ]);
  });

  it('allRegisteredDropoffs excludes the active pickup location', () => {
    expect(allRegisteredDropoffs(['Alpha', 'Bravo'], 'Alpha')).toEqual(['Bravo']);
  });
});
