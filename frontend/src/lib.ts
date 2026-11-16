export const animals = ['cat', 'capybara', 'dog', 'chameleon'] as const;
export type Animal = typeof animals[number];
export type PaymentPreference = {method: 'bank'; accountName: string; sortCode: string; accountNumber: string} | {method: 'paypal'; paypal: string};
export type Person = { id: string; name: string; avatar?: Animal | null; payment?: PaymentPreference | null };
export function animalFor(person: Pick<Person, 'name' | 'avatar'>): Animal {
  return person.avatar || animals[Array.from(person.name).reduce((sum,char)=>sum+char.charCodeAt(0),0)%animals.length];
}
export function animalTone(people: Person[], personId: string, override?: Animal): number {
  const person=people.find(p=>p.id===personId);
  if(!person) return 0;
  const animal=override || animalFor(person);
  const matching=people.filter(p=>(p.id===personId?animal:animalFor(p))===animal);
  return Math.max(0,matching.findIndex(p=>p.id===personId))%6;
}
export type Item = { id: string; name: string; amount: number; paidBy: string; participants: string[]; allocations?: Record<string, number>; expenseDate?: string | null; createdAt?: string | null };
export type Room = { code: string; name: string; currency: string; people: Person[]; items: Item[]; version: number; expiresAt: string };
export type Session = { room: Room; token: string; ownerToken?: string; personId?: string };
export const money = (cents: number, currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100);
/** Calendar dates use the user's local day, not a UTC conversion. */
export function todayDate(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
}
export function formatExpenseDate(value?: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(year,month-1,day,12);
  if(date.getFullYear()!==year || date.getMonth()!==month-1 || date.getDate()!==day) return '';
  return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(date);
}
export function splitItem(item: Item): Record<string, number> {
  const fixed = item.allocations || {};
  if (!item.participants.length || Object.keys(fixed).some(id => !item.participants.includes(id))) throw new Error('Choose valid participants for every amount.');
  const amounts = Object.values(fixed);
  if (amounts.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Custom amounts must be zero or more, with up to two decimals.');
  const remaining = item.amount - amounts.reduce((sum, value) => sum + value, 0);
  if (remaining < 0) throw new Error('Custom amounts exceed the expense total.');
  const automatic = item.participants.filter(id => !Object.hasOwn(fixed, id));
  if (!automatic.length && remaining !== 0) throw new Error('Custom amounts must add up to the total, or leave someone blank to split the rest.');
  const shares: Record<string, number> = Object.assign(Object.create(null), fixed);
  automatic.forEach((id, index) => { shares[id] = Math.floor(remaining / automatic.length) + (index < remaining % automatic.length ? 1 : 0); });
  return shares;
}
export function calculate(room: Room) {
  const balances: Record<string, number> = Object.fromEntries(room.people.map(p => [p.id, 0]));
  const shares: Record<string, number> = { ...balances };
  const paid: Record<string, number> = { ...balances };
  for (const item of room.items) {
    paid[item.paidBy] += item.amount;
    balances[item.paidBy] += item.amount;
    const split = splitItem(item);
    item.participants.forEach(id => { shares[id] += split[id]; balances[id] -= split[id]; });
  }
  const creditors = room.people.filter(p => balances[p.id] > 0).map(p => ({ id: p.id, amount: balances[p.id] }));
  const debtors = room.people.filter(p => balances[p.id] < 0).map(p => ({ id: p.id, amount: -balances[p.id] }));
  const transfers: { from: string; to: string; amount: number }[] = [];
  let c = 0, d = 0;
  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c].amount, debtors[d].amount);
    transfers.push({ from: debtors[d].id, to: creditors[c].id, amount });
    creditors[c].amount -= amount; debtors[d].amount -= amount;
    if (!creditors[c].amount) c++;
    if (!debtors[d].amount) d++;
  }
  return { balances, shares, paid, transfers, total: room.items.reduce((sum, item) => sum + item.amount, 0) };
}
export async function api<T>(path: string, method = 'GET', data?: unknown, token?: string, ownerToken?: string): Promise<T> {
  const response = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(ownerToken ? { 'X-Owner-Token': ownerToken } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(typeof body.detail === 'string' ? body.detail : 'Please check your details and try again.') as Error & { status: number };
    error.status = response.status; throw error;
  }
  return response.status === 204 ? undefined as T : response.json();
}
export function sampleRoom(): Room {
  return { code: 'DEMO', name: 'A weekend well spent', currency: 'GBP', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), version: 1, people: [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Jamie' }, { id: 'c', name: 'Sam' }, { id: 'd', name: 'Taylor' }], items: [
    { id: '1', name: 'Friday night dinner', amount: 8640, paidBy: 'a', participants: ['a', 'b', 'c', 'd'] },
    { id: '2', name: 'A very necessary coffee stop', amount: 1450, paidBy: 'b', participants: ['a', 'b', 'c'] },
    { id: '3', name: 'Our little home for the weekend', amount: 24000, paidBy: 'c', participants: ['a', 'b', 'c', 'd'] },
    { id: '4', name: 'Snacks for the road', amount: 2280, paidBy: 'a', participants: ['a', 'b', 'c', 'd'] },
  ] };
}
