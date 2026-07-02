import {
  assignUniqueDriverLoginUsernames,
  buildDriverLoginUsername,
  driverIdForLoginUsername,
} from './driverLoginUsername';

describe('driverLoginUsername', () => {
  it('builds firstname.lastinitial', () => {
    expect(buildDriverLoginUsername('John', 'Smith')).toBe('john.s');
    expect(buildDriverLoginUsername('Driver', 'One')).toBe('driver.o');
  });

  it('assigns unique usernames when last-initial collides', () => {
    const map = assignUniqueDriverLoginUsernames([
      { id: 'drv-01', firstName: 'Driver', lastName: 'One' },
      { id: 'drv-02', firstName: 'Driver', lastName: 'Two' },
      { id: 'drv-03', firstName: 'Driver', lastName: 'Three' },
      { id: 'drv-04', firstName: 'Driver', lastName: 'Four' },
    ]);

    expect(map.get('drv-01')).toBe('driver.o');
    expect(map.get('drv-02')).toBe('driver.t');
    expect(map.get('drv-03')).toBe('driver.th');
    expect(map.get('drv-04')).toBe('driver.f');
    expect(driverIdForLoginUsername('driver.th', map)).toBe('drv-03');
  });
});
