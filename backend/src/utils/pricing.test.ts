import { calculatePrice, getPriceCategory } from './pricing';

describe('pricing — Bus (ON) and Airport destinations', () => {
  it('recognizes Bus (ON) and Airport categories', () => {
    expect(getPriceCategory('Bus (ON)')).toBe('BUS_ON');
    expect(getPriceCategory('Ontario Northland')).toBe('BUS_ON');
    expect(getPriceCategory('Airport')).toBe('AIRPORT');
    expect(getPriceCategory('Sudbury Airport')).toBe('AIRPORT');
  });

  it('charges $15 for any route delivered to Bus (ON)', () => {
    const quote = calculatePrice('Wajax', 'Bus (ON)', 'Weight: Under 75', false, 'REGULAR');
    expect(quote.price).toBe(15);
    expect(quote.isManual).toBe(false);
    expect(quote.category).toBe('Bus (ON)');
  });

  it('charges $75 for any route delivered to Airport', () => {
    const quote = calculatePrice('Mobile Parts Inc.', 'Airport', 'Weight: Under 75', false, 'REGULAR');
    expect(quote.price).toBe(75);
    expect(quote.isManual).toBe(false);
    expect(quote.category).toBe('Airport');
  });

  it('prefers destination flat rates over Category 5 node pricing', () => {
    const busFromStaples = calculatePrice('Staples', 'Bus (ON)');
    const airportFromWajax = calculatePrice('Wajax', 'Airport');
    expect(busFromStaples.price).toBe(15);
    expect(airportFromWajax.price).toBe(75);
  });
});
