import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ArrowRight, Plus, X, Check, Copy, ChevronLeft, ChevronRight, Leaf, LockKeyhole, Users, ReceiptText, ArrowLeftRight, Trash2, Pencil, LogOut, LoaderCircle, CircleHelp, CheckCheck, Coffee, Utensils, Car, Home, Sparkles } from 'lucide-react';
import { api, calculate, money, sampleRoom, splitItem, animals, animalFor, animalTone, todayDate, formatExpenseDate, type PaymentPreference, type Person, type Animal, type Room, type Item, type Session } from './lib';
import './style.css';
import { summaryImages } from './summary';
import { AnimalIcon } from './animals';
import { PinInput } from './PinInput';
import { WelcomeTutorial } from './WelcomeTutorial';
import { PaymentDetails } from './PaymentDetails';
import { upgradeBrowserStorage } from './storage';

const id = () => crypto.randomUUID();
const AvatarPeopleContext = createContext<Person[]>([]);
function Avatar({ name, animal, index = 0, small = false }: { name: string; animal?: Animal | null; index?: number; small?: boolean }) {
  const people=useContext(AvatarPeopleContext);
  const person=people.find(p=>p.name===name);
  const chosen=animal || animalFor({name});
  const tone=person ? animalTone(people,person.id,chosen) : 0;
  return <span aria-hidden="true" className={`avatar animal-${chosen} avatar-tone-${tone} color-${index % 5} ${small ? 'small' : ''}`} title={`${name} · ${chosen}`}><AnimalIcon animal={chosen}/></span>;
}
function Brand() { return <span className="brand"><span className="brand-icon"><Leaf size={21} strokeWidth={1.7}/></span>littletab<span className="brand-dot">.</span></span>; }
function Modal({ title, children, close, wide = false }: { title: string; children: React.ReactNode; close: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const el = dialog.current!; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={close} onClick={e => { if (e.target === dialog.current) close(); }}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20}/></button></div>{children}</dialog>;
}
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [tab, setTab] = useState<'expenses' | 'settle'>('expenses');
  const [modal, setModal] = useState<'item' | 'people' | 'delete' | 'help' | 'identity' | 'profile' | 'invite' | null>(null);
  const [welcomePending,setWelcomePending]=useState(()=>{try{return localStorage.getItem('littletab-hide-tutorial')!=='yes';}catch{return true;}});
  const [inviteMessage,setInviteMessage]=useState('');
  const inviteInput=useRef<HTMLInputElement>(null);
  const [imageZoom, setImageZoom] = useState(false);
  const [imagePreview, setImagePreview] = useState<{urls: string[]; filename: string} | null>(null);
  useEffect(() => () => { imagePreview?.urls.forEach(url => URL.revokeObjectURL(url)); }, [imagePreview]);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const room = session?.room;
  const isDemo = room?.code === 'DEMO';
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('room');
    if (code) setMode('join');
    try {
      const saved = sessionStorage.getItem('littletab-session');
      if (saved) {
        const previous = JSON.parse(saved) as Session;
        if (!code || code === previous.room.code) {
        api<Room>(`/rooms/${previous.room.code}`, 'GET', undefined, previous.token).then(r => setSession({ ...previous, room: r })).catch(() => { sessionStorage.removeItem('littletab-session'); setNotice('Your previous room is no longer available. You can join again below.'); }).finally(() => setLoading(false));
        return;
        }
      }
    } catch { /* A fresh session is safe when browser storage is unavailable. */ }
    setLoading(false);
  }, []);
  useEffect(() => { if (loading) return; try { if (session && !isDemo) sessionStorage.setItem('littletab-session', JSON.stringify(session)); else sessionStorage.removeItem('littletab-session'); } catch { /* Session still works in memory. */ } }, [session, isDemo, loading]);
  useEffect(() => {
    if (!room || isDemo) return;
    const timer = window.setInterval(async () => {
      if (document.hidden || busy) return;
      try { const latest = await api<Room>(`/rooms/${room.code}`, 'GET', undefined, session!.token); setSession(s => s && s.room.version !== latest.version ? { ...s, room: latest } : s); }
      catch (err) { if ([401, 404].includes((err as Error & { status: number }).status)) { setSession(null); setError('This room has expired or was deleted.'); } }
    }, 5000);
    return () => clearInterval(timer);
  }, [room?.code, isDemo, busy, session?.token]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); } }, [notice]);
  async function enter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = mode === 'create' ? await api<Session>('/rooms', 'POST', { name: String(data.get('name')).trim(), creator: String(data.get('creator')).trim(), password: data.get('password'), currency: data.get('currency') }) : await api<Session>(`/rooms/${data.get('code')}/join`, 'POST', { password: data.get('password') });
      if (!result.ownerToken) { try { result.ownerToken = localStorage.getItem(`littletab-owner-${result.room.code}`) || undefined; } catch {} }
      if (result.ownerToken) { try { localStorage.setItem(`littletab-owner-${result.room.code}`, result.ownerToken); } catch {} }
      setSession(result); setModal(mode === 'create' ? 'people' : null); setTab('expenses'); history.replaceState(null, '', `?room=${result.room.code}`);
    } catch (err) { setError(err instanceof TypeError ? 'Cannot reach the server. Please check that the API is running.' : (err as Error).message); } finally { setBusy(false); }
  }
  async function save(next: Room): Promise<boolean> {
    if (!session || busy) return false;
    setBusy(true); setError('');
    try {
      const updated = isDemo ? { ...next, version: next.version + 1 } : await api<Room>(`/rooms/${room!.code}`, 'PUT', next, session.token);
      setSession({ ...session, room: updated }); return true;
    } catch (err) {
      setError((err as Error).message);
      if ((err as Error & { status: number }).status === 409) { const latest = await api<Room>(`/rooms/${room!.code}`, 'GET', undefined, session.token).catch(() => null); if (latest) setSession({ ...session, room: latest }); }
      return false;
    } finally { setBusy(false); }
  }
  function leave() { setSession(null); setError(''); setModal(null); setTab('expenses'); history.replaceState(null, '', location.pathname); }
  async function copyInvite() {
    const link=`${location.origin}${location.pathname}?room=${room!.code}`;
    try {await navigator.clipboard.writeText(link);setInviteMessage('Link copied. Send the PIN separately.');}
    catch {inviteInput.current?.select();setInviteMessage('Select and copy the link above.');}
  }
  const totals = room ? calculate(room) : null;
  const personName = (personId: string) => room?.people.find(p => p.id === personId)?.name || 'Unknown';
  const currentPerson = room?.people.find(p => p.id === session?.personId);
  const needsIdentity = Boolean(room && !isDemo && !currentPerson);
  async function identify(data: { personId?: string; name?: string }) {
    if (!session) return false;
    setBusy(true); setError('');
    try {
      const result = await api<{room: Room; personId: string}>(`/rooms/${session.room.code}/identify`, 'POST', data, session.token);
      setSession(s => s ? {...s, ...result} : s);
      return true;
    } catch (e) {
      setError((e as Error).message);
      const latest = await api<Room>(`/rooms/${session.room.code}`, 'GET', undefined, session.token).catch(() => null);
      if (latest) setSession(s => s ? {...s, room: latest} : s);
      return false;
    } finally { setBusy(false); }
  }
  if (loading) return <div className="loading"><Brand/><LoaderCircle className="spin"/><p>Opening your notebook…</p></div>;
  return <AvatarPeopleContext.Provider value={room?.people || []}>
    <header className="site-header"><a href="/" className="brand-link" aria-label="Littletab home" onClick={e => { e.preventDefault(); if (room) leave(); }}><Brand/></a><div className="header-right"><span className="header-note">Good times. Fair shares.</span><button className="icon-button help-button" aria-label="How Littletab works" onClick={() => setWelcomePending(true)}><CircleHelp size={20}/></button>{room && <button className="text-button leave-button" onClick={leave}><LogOut size={16}/> Leave room</button>}</div></header>
    {notice && <div className="toast" role="status"><CheckCheck size={18}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16}/></button></div>}
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={17}/></button></div>}
    {!room ? <main className="lobby">
      <section className="hero"><div className="eyebrow"><span/> LESS MATH, MORE MEMORIES</div><h1>Good times.<br/>Fair shares.<br/><em>All settled.</em></h1><p className="hero-description">For the dinners that turn into nights out.<br className="desktop-break"/> The trips you talk about for years.<br className="desktop-break"/> Split the bill, keep the good stuff.</p><div className="hero-benefits"><span><Check size={15}/> No sign-up</span><span><Check size={15}/> No awkward maths</span><span><Check size={15}/> Just fair</span></div>
      <div className="paper-illustration" aria-hidden="true"><span className="doodle-spark spark-one">✳</span><div className="receipt"><div className="receipt-top"><Utensils size={21}/><span>A LITTLE GET-TOGETHER</span></div><div className="receipt-line"><span>Good food</span><span>✓</span></div><div className="receipt-line"><span>Great company</span><span>✓</span></div><div className="receipt-line"><span>Who's paying what?</span><span>sorted.</span></div><div className="receipt-total"><span>Friendship</span><span>priceless</span></div><div className="receipt-bottom">SPLIT WITH LOVE, BY LITTLETAB</div></div><div className="little-note">You make the memories.<br/>We’ll do the maths.<span>↗</span></div><span className="doodle-spark spark-two">✧</span></div>
      </section>
      <section className="room-card"><div className="card-topline"><span className="tiny-label">A PLACE FOR YOUR PEOPLE</span><Leaf size={20}/></div><h2>A little room.<br/>For a good time.</h2><p>One shared bill. Everyone on the same page.</p><div className="segmented" role="tablist" aria-label="Room access"><button role="tab" aria-selected={mode === 'create'} onClick={() => { setMode('create'); setError(''); }}>Create a room <Plus size={16}/></button><button role="tab" aria-selected={mode === 'join'} onClick={() => { setMode('join'); setError(''); }}>Join a room <ArrowUpRight size={16}/></button></div>
      <form onSubmit={enter} key={mode}>
        {mode === 'create' ? <><label>What’s the occasion?<input name="name" placeholder="e.g. A weekend in the Cotswolds" maxLength={80} required/></label><div className="form-row"><label>Your name<input name="creator" placeholder="e.g. Alex" maxLength={40} required/></label><label className="currency-label">Currency<select name="currency" defaultValue="GBP"><option value="GBP">GBP (£)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="THB">THB (฿)</option></select></label></div></> : <label>Five-digit room code<input name="code" className="code-input" inputMode="numeric" autoComplete="off" pattern="[0-9]{5}" maxLength={5} placeholder="0 0 0 0 0" defaultValue={new URLSearchParams(location.search).get('room') || ''} required/></label>}
        <PinInput creating={mode === 'create'}/><p className="field-hint">{mode === 'create' ? 'Share it with your group. Keep your room just yours.' : 'Ask your host for the room code and PIN.'}</p><button className="primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <>{mode === 'create' ? 'Make room for good times' : 'Join your people'}<ArrowRight size={18}/></>}</button>
      </form><div className="privacy-note"><LockKeyhole size={13}/><span>No accounts. Rooms clear automatically after 30 days.</span></div><div className="sample-link">Just looking around? <button onClick={() => { setSession({ room: sampleRoom(), token: 'demo', personId: 'a' }); setTab('expenses'); setError(''); }}>Try a sample room <ArrowUpRight size={13}/></button></div></section>
      <section className="how-it-works"><div className="section-intro"><span className="tiny-label">A FAIR SHARE, IN THREE STEPS</span><h3>Easy as one, two, together.</h3></div><div className="step"><span className="step-number">01</span><div><h4>Gather your people</h4><p>Create a room. Share the code.<br/>No one needs an account.</p></div></div><div className="step"><span className="step-number">02</span><div><h4>Add the good stuff</h4><p>Pop in your expenses and choose<br/>who’s sharing each one.</p></div></div><div className="step"><span className="step-number">03</span><div><h4>Leave things even</h4><p>See who owes what, and to whom.<br/>That’s one less thing to think about.</p></div></div></section>
    </main> : <main className="workspace">
      <div className="workspace-breadcrumb"><button className="text-button" onClick={leave}><ChevronLeft size={15}/> All rooms</button><span>/</span><span>{isDemo ? 'Sample room' : `Room ${room.code}`}</span><span className="room-live"><span/>{isDemo ? 'Try it out — changes aren’t saved' : 'Shared room · updates every 5s'}</span></div>
      <section className="room-heading"><div><div className="eyebrow">THE GOOD TIMES, ON PAPER</div><h1>{room.name}</h1><p>Make memories. We’ll keep track of the rest.</p>{currentPerson && <button className="identity-badge" onClick={() => setModal('profile')}><Avatar name={currentPerson.name} animal={currentPerson.avatar} small/> You’re {currentPerson.name} <Pencil size={11}/></button>}</div><button className="secondary" onClick={isDemo ? () => { leave(); setMode('create'); } : () => {setInviteMessage('');setModal('invite');}}>{isDemo ? <><Plus size={17}/> Create a real room</> : <><Copy size={16}/> Invite friends <span className="code-pill">{room.code}</span></>}</button></section>
      <div className="workspace-grid"><div className="main-column"><section className="summary-cards"><div className="summary-card total-card"><div><span className="tiny-label">THE SHARED TOTAL</span><ReceiptText size={18}/></div><strong>{money(totals!.total, room.currency)}</strong><span>{room.items.length} {room.items.length === 1 ? 'expense' : 'expenses'} · {room.currency}</span><p className="currency-note">All amounts in {room.currency}. No currency conversion.</p></div><div className="summary-card"><div><span className="tiny-label">GOOD COMPANY</span><Users size={18}/></div><strong>{String(room.people.length).padStart(2, '0')} <small>people</small></strong><div className="avatar-stack">{room.people.slice(0, 6).map((p, i) => <Avatar key={p.id} name={p.name} animal={p.avatar} index={i} small/>)}{room.people.length > 6 && <span>+{room.people.length - 6}</span>}<button className="add-person-mini" aria-label="Manage people" onClick={() => setModal('people')}><Plus size={14}/></button></div></div></section>
      <section className="expenses-panel"><div className="expenses-toolbar"><div className="tabs"><button className={tab === 'expenses' ? 'active' : ''} onClick={() => setTab('expenses')}><ReceiptText size={17}/> Expenses <span>{room.items.length}</span></button><button className={tab === 'settle' ? 'active' : ''} onClick={() => setTab('settle')}><ArrowLeftRight size={17}/> Settle up</button></div><button className="primary add-expense" disabled={busy} onClick={() => { setEditItem(null); setModal('item'); }}><Plus size={17}/> Add expense</button></div>
      {tab === 'expenses' ? room.items.length ? <><div className="expense-table"><div className="table-heading"><span>THE EXPENSE</span><span>SHARED BY</span><span>AMOUNT</span><span/></div>{room.items.map((item, index) => { const Icon = [Utensils, Coffee, Home, Car, ReceiptText][index % 5]; return <div className="expense-row" key={item.id}><div className="expense-description"><span className={`expense-icon expense-icon-${index % 4}`}><Icon size={20} strokeWidth={1.5}/></span><div><strong>{item.name}</strong><span>Paid by {personName(item.paidBy)}{item.expenseDate && <> · <time dateTime={item.expenseDate}>{formatExpenseDate(item.expenseDate)}</time></>}</span></div></div><div className="expense-shared"><div className="avatar-stack">{item.participants.slice(0, 4).map(p => <Avatar key={p} name={personName(p)} animal={room.people.find(person => person.id === p)?.avatar} index={room.people.findIndex(x => x.id === p)} small/>)}{item.participants.length > 4 && <span>+{item.participants.length - 4}</span>}</div><span>{item.participants.length === room.people.length ? 'Everyone' : `${item.participants.length} people`}{Object.keys(item.allocations || {}).length ? ' · custom' : ''}</span></div><strong className="expense-amount">{money(item.amount, room.currency)}</strong><button className="icon-button edit-expense" aria-label={`Edit ${item.name}`} onClick={() => { setEditItem(item); setModal('item'); }}><Pencil size={15}/></button></div>; })}</div><div className="table-total"><span>A good time, accounted for.</span><span>Total <strong>{money(totals!.total, room.currency)}</strong></span></div></> : <div className="empty-state"><span className="empty-icon"><ReceiptText size={30}/></span><h3>A blank page, a good beginning.</h3><p>Add your first expense. Dinner, tickets, a round of coffees —<br/>we’ll make sure everyone gets their fair share.</p><button className="secondary" onClick={() => { setEditItem(null); setModal('item'); }}><Plus size={16}/> Add your first expense</button></div> : <div className="settlements"><div className="settlement-intro"><span className="empty-icon"><ArrowLeftRight size={25}/></span><div><h3>Bring it back to even.</h3><p>{totals!.transfers.length ? 'A few simple payments, and everyone’s square.' : 'Everyone is square. Nothing to settle just yet.'}</p></div></div>{totals!.transfers.map((transfer, i) => <div className="transfer" key={i}><Avatar name={personName(transfer.from)} animal={room.people.find(p => p.id === transfer.from)?.avatar} index={room.people.findIndex(p => p.id === transfer.from)}/><div><strong>{personName(transfer.from)} <ArrowRight size={14}/> {personName(transfer.to)}</strong><span>pays {personName(transfer.to)}</span><PaymentDetails person={room.people.find(p=>p.id===transfer.to)!}/></div><strong>{money(transfer.amount, room.currency)}</strong></div>)}<p className="settlement-note">These are suggested payments. Arrange payment with your friends outside Littletab.</p><button className="secondary" disabled={exporting} onClick={async () => { setExporting(true); try { const blobs = await summaryImages(room); setImageZoom(false); setImagePreview({urls: blobs.map(blob => URL.createObjectURL(blob)), filename: `littletab-${room.code}-${room.currency}`}); } catch (e) { setError((e as Error).message); } finally { setExporting(false); } }}><ReceiptText size={16}/> {exporting ? 'Creating image…' : 'Preview summary image'}</button></div>}
      </section><div className="below-table"><Leaf size={15}/><span>A little less maths. A little more together.</span></div></div>
      <aside className="sidebar"><section className="people-panel"><div className="panel-title"><h3>Your people <span>{room.people.length}</span></h3><button className="icon-button" aria-label="Manage people" onClick={() => setModal('people')}><Plus size={18}/></button></div><div className="balance-key"><span>PERSON</span><span>BALANCE</span></div>{room.people.map((p, i) => <div className="person-row" key={p.id}><Avatar name={p.name} animal={p.avatar} index={i}/><div><strong>{p.name}</strong><span>{totals!.balances[p.id] > 0 ? 'gets back' : totals!.balances[p.id] < 0 ? 'owes' : 'all square'}</span></div><strong className={totals!.balances[p.id] > 0 ? 'positive' : totals!.balances[p.id] < 0 ? 'negative' : 'muted'}>{totals!.balances[p.id] > 0 ? '+' : ''}{money(totals!.balances[p.id], room.currency)}</strong></div>)}<button className="people-footer" onClick={() => setModal('people')}><Plus size={15}/> Add or manage people</button></section><div className="note-card"><span className="note-pin"/><Sparkles size={20}/><h3>Fair feels good.</h3><p>Set a person’s amount, or leave it blank to split the rest equally. Even the last penny has a home.</p><span className="note-signature">That’s the littletab way.</span></div><div className="room-details"><LockKeyhole size={14}/><p>{isDemo ? 'This is a sample room. Explore freely — your changes stay in this preview.' : <>This room clears on {new Date(room.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. No accounts, no loose ends.</>}</p></div>{session.ownerToken && !isDemo && <button className="delete-room text-button" onClick={() => setModal('delete')}><Trash2 size={14}/> Delete room</button>}</aside></div>
    </main>}
    <footer className="site-footer"><span>Made for sharing. Designed to be fair.</span><span>Less counting. More living.<Leaf size={14}/></span></footer>
    {welcomePending && !needsIdentity && !modal && !imagePreview && <WelcomeTutorial close={()=>setWelcomePending(false)} guide={()=>setModal('help')}/>}
    {!needsIdentity && modal==='invite' && room && <Modal title="Good company, one link away." close={()=>setModal(null)}><p className="modal-subtitle">Send this link to your people. The room code is filled in for them.</p><label>Invite link<div className="invite-link-row"><input ref={inviteInput} aria-label="Invite link" readOnly value={`${location.origin}${location.pathname}?room=${room.code}`} onFocus={e=>e.currentTarget.select()}/><button className="primary" onClick={copyInvite}><Copy size={15}/> Copy link</button></div></label><p className="invite-feedback" role="status">{inviteMessage || 'Your friends will enter the 4-digit PIN, then pick their name.'}</p><div className="invite-code"><span>Room code</span><strong>{room.code}</strong></div><p className="field-hint">Share the PIN separately. No account needed.</p><button className="secondary full" onClick={()=>setModal(null)}>All set <Check size={16}/></button></Modal>}
    {imagePreview && <Modal wide title="Your shared receipt" close={() => setImagePreview(null)}><p className="modal-subtitle">A read-only snapshot of your items, shares and payments. View it here, or download a copy.</p><div className="receipt-image-preview">{imagePreview.urls.map((url,index) => <figure key={url}><div className={`receipt-image-scroll ${imageZoom ? 'zoomed' : ''}`}><button className="receipt-image-zoom" aria-label={`${imageZoom ? 'Fit' : 'Zoom'} receipt image ${index+1}`} onClick={() => setImageZoom(!imageZoom)}><img src={url} alt={`Receipt with expense items and settlement summary, page ${index+1}`}/></button></div><figcaption>{imagePreview.urls.length>1 && <span>Page {index+1} of {imagePreview.urls.length}</span>}<button className="secondary" onClick={() => setImageZoom(!imageZoom)}>{imageZoom ? 'Fit to preview' : 'View full size'} <ArrowUpRight size={15}/></button><a className="primary" href={url} download={`${imagePreview.filename}${imagePreview.urls.length>1 ? `-${index+1}` : ''}.png`}>Download image <ReceiptText size={15}/></a></figcaption></figure>)}</div></Modal>}
    {!needsIdentity && modal === 'profile' && room && currentPerson && <ProfileForm person={currentPerson} error={error} busy={busy} close={() => setModal(null)} switchName={() => setModal('identity')} submit={async (avatar,payment) => {if(await save({...room, people: room.people.map(p => p.id===currentPerson.id ? {...p,avatar,payment} : p)})) setModal(null);}}/>}
    {(needsIdentity || modal === 'identity') && room && <IdentityForm room={room} busy={busy} error={error} currentId={session?.personId} close={needsIdentity ? leave : () => setModal(null)} submit={identify} done={() => setModal(null)}/>}
    {!needsIdentity && modal === 'help' && <Modal title="Good times, squared up." close={() => setModal(null)}><div className="help-content"><p>Create a room with a name and a four-digit PIN, then share the five-digit code with your group. No accounts needed.</p><p>Hosts can add everyone’s names before they join. Guests pick their name or add a new one. Record each expense and who paid, then select the people sharing it. Set custom amounts for anyone, or leave amounts blank to split the rest equally. Littletab shows who should pay whom.</p><p>Anyone with the code and PIN can edit. Only the creator can delete the room, using the browser where they created it. Rooms and their data automatically clear after 30 days.</p><p>All expenses and balances use the room’s currency; there is no automatic conversion. Preview a receipt with all your items, then download the image if you want to share it. Payments happen outside Littletab.</p></div><button className="primary full" onClick={() => setModal(null)}>Got it <Check size={17}/></button></Modal>}
    {!needsIdentity && modal === 'item' && room && <ItemForm defaultPayer={session?.personId} serverError={error} room={room} item={editItem} busy={busy} close={() => setModal(null)} submit={async item => { const next = { ...room, items: editItem ? room.items.map(i => i.id === editItem.id ? item : i) : [...room.items, item] }; if (await save(next)) { setModal(null); setNotice(editItem ? 'Expense updated. All squared up.' : 'Expense added. We’ve done the maths.'); } }} remove={editItem ? async () => { if (await save({ ...room, items: room.items.filter(i => i.id !== editItem.id) })) setModal(null); } : undefined}/>}
    {!needsIdentity && modal === 'people' && room && <PeopleForm serverError={error} room={room} busy={busy} save={save} close={() => setModal(null)}/>}
    {!needsIdentity && modal === 'delete' && room && <Modal title="Close this chapter?" close={() => setModal(null)}><p className="modal-copy">Deleting “{room.name}” permanently removes all expenses and everyone’s access. Download a summary first if you need a copy.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Keep room</button><button className="danger" disabled={busy} onClick={async () => { setBusy(true); try { await api(`/rooms/${room.code}`, 'DELETE', undefined, session.token, session.ownerToken); try { localStorage.removeItem(`littletab-owner-${room.code}`); } catch {} leave(); setNotice('Room deleted. Here’s to the next get-together.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Delete permanently</button></div></Modal>}
  </AvatarPeopleContext.Provider>;
}
function ItemForm({ defaultPayer, serverError, room, item, busy, close, submit, remove }: { defaultPayer?: string; serverError: string; room: Room; item: Item | null; busy: boolean; close: () => void; submit: (item: Item) => Promise<void>; remove?: () => Promise<void> }) {
  const [selected, setSelected] = useState(item?.participants || room.people.map(p => p.id));
  const [amount, setAmount] = useState(item ? (item.amount / 100).toFixed(2) : '');
  const [custom, setCustom] = useState<Record<string,string>>(Object.fromEntries(Object.entries(item?.allocations || {}).map(([id,cents]) => [id,(cents/100).toFixed(2)])));
  const [manual,setManual]=useState<Record<string,boolean>>(Object.fromEntries(Object.keys(item?.allocations || {}).map(id=>[id,true])));
  const [validation, setValidation] = useState('');
  const allocations = Object.fromEntries(selected.filter(id => manual[id] && custom[id]?.trim()).map(id => [id,Math.round(Number(custom[id])*100)]));
  let resolved: Record<string,number> = {}; let splitError = '';
  if(selected.some(id=>manual[id]&&!custom[id]?.trim())) splitError='Enter a custom amount, or turn Auto back on.';
  if(selected.length && !splitError) {try {resolved=splitItem({id:'preview',name:'Preview',amount:Math.round((Number(amount)||0)*100),paidBy:'',participants:selected,allocations});} catch(e) {splitError=(e as Error).message;}}
  return <Modal title={item ? 'Edit the expense' : 'Add a little to the list'} close={close}>
    <p className="modal-subtitle">Set a share, or leave it blank. We’ll do the rest.</p>
    {serverError && <p className="form-error" role="alert">{serverError}</p>}
    <form onSubmit={async e => {
      e.preventDefault();const values=new FormData(e.currentTarget);const cents=Math.round(Number(amount)*100);
      if(!String(values.get('name')).trim()){setValidation('Give this expense a name.');return;}
      if(!selected.length){setValidation('Choose at least one person to share this expense.');return;}
      if(!cents || cents>100000000){setValidation('Enter an amount between 0.01 and 1,000,000.');return;}
      if(splitError){setValidation(splitError);return;}
      await submit({id:item?.id || id(),name:String(values.get('name')).trim(),amount:cents,paidBy:String(values.get('paidBy')),participants:selected,allocations,expenseDate:String(values.get('expenseDate')||'')||null,createdAt:item?.createdAt || (item ? null : new Date().toISOString())});
    }}>
      <label>What was it for?<input name="name" defaultValue={item?.name} placeholder="e.g. Dinner with the gang" maxLength={100} required autoFocus/></label>
      <label className="expense-date-field">Expense date <span className="optional-label">optional</span><input name="expenseDate" type="date" defaultValue={item ? item.expenseDate || '' : todayDate()}/></label>
      <div className="form-row"><label>Amount ({room.currency})<input inputMode="decimal" type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setValidation('');}} placeholder="0.00" required/></label><label>Who paid?<select name="paidBy" defaultValue={item?.paidBy || defaultPayer || room.people[0].id}>{room.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
      <fieldset className="participant-fieldset"><legend>Who’s sharing?</legend><button className="select-all" type="button" onClick={()=>{setSelected(selected.length===room.people.length?[]:room.people.map(p=>p.id));setValidation('');}}>{selected.length===room.people.length?'Deselect all':'Select everyone'}</button>
        <p className="allocation-hint">Optional amounts are fixed shares. Blank amounts split the remainder equally.</p>
        <div className="allocation-list">{room.people.map((p,i)=><div className={`allocation-row ${selected.includes(p.id)?'selected':''}`} key={p.id}><label className="allocation-person"><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>{setSelected(e.target.checked?[...selected,p.id]:selected.filter(x=>x!==p.id));setValidation('');}}/><Avatar name={p.name} animal={p.avatar} index={i} small/><span>{p.name}</span></label><div className="allocation-amount"><button type="button" role="switch" aria-label={`Automatic share for ${p.name}`} aria-checked={!manual[p.id]} disabled={!selected.includes(p.id)} className={`auto-share-switch ${manual[p.id]?'custom-mode':'auto-mode'}`} onClick={()=>{const makeManual=!manual[p.id];setManual({...manual,[p.id]:makeManual});if(makeManual&&!custom[p.id]?.trim())setCustom({...custom,[p.id]:((resolved[p.id]||0)/100).toFixed(2)});setValidation('');}}><span className="switch-track"><span/></span><span>{manual[p.id]?'Custom':'Auto'}</span></button>{manual[p.id]?<input aria-label={`Custom amount for ${p.name}`} inputMode="decimal" type="number" min="0" max="1000000" step="0.01" placeholder="0.00" disabled={!selected.includes(p.id)} required={selected.includes(p.id)} value={custom[p.id]||''} onChange={e=>{setCustom({...custom,[p.id]:e.target.value});setValidation('');}}/>:selected.includes(p.id)&&!splitError&&<strong>{money(resolved[p.id]||0,room.currency)}</strong>}</div></div>)}</div>
      </fieldset>
      <div className={`split-preview ${splitError?'invalid-split':''}`} aria-live="polite">{splitError || (selected.length ? <><span>{Object.keys(allocations).length?`${Object.keys(allocations).length} fixed · ${selected.length-Object.keys(allocations).length} automatic`:`Equal split · ${selected.length} people`}</span><strong>{money(Math.round((Number(amount)||0)*100),room.currency)} assigned</strong></>:<span>Choose who’s sharing this one.</span>)}</div>
      {validation&&<p className="form-error" role="alert">{validation}</p>}
      <button className="primary full" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:<>{item?'Save changes':'Add expense'}<Check size={18}/></>}</button>
      {remove&&<button className="remove-expense" type="button" onClick={remove} disabled={busy}><Trash2 size={15}/> Delete this expense</button>}
    </form>
  </Modal>;
}
function ProfileForm({person,busy,error,close,switchName,submit}: {person:Person;busy:boolean;error:string;close:()=>void;switchName:()=>void;submit:(animal:Animal,payment:PaymentPreference|null)=>Promise<void>}) {
  const profilePeople=useContext(AvatarPeopleContext);
  const [choice,setChoice]=useState<Animal>(animalFor(person));
  const [includePayment,setIncludePayment]=useState(Boolean(person.payment));
  const [method,setMethod]=useState<'bank'|'paypal'>(person.payment?.method||'bank');
  const [accountName,setAccountName]=useState(person.payment?.method==='bank'?person.payment.accountName:'');
  const [sortCode,setSortCode]=useState(person.payment?.method==='bank'?person.payment.sortCode:'');
  const [accountNumber,setAccountNumber]=useState(person.payment?.method==='bank'?person.payment.accountNumber:'');
  const [paypal,setPaypal]=useState(person.payment?.method==='paypal'?person.payment.paypal:'');
  const [validation,setValidation]=useState('');
  return <Modal title="A little more you." close={close}><p className="modal-subtitle">Pick a buddy for {person.name}. Change it whenever you like.</p><form onSubmit={async e=>{e.preventDefault();setValidation('');let payment:PaymentPreference|null=null;if(includePayment){if(method==='bank'){if(!accountName.trim()){setValidation('Enter the name on your bank account.');return;}payment={method,accountName:accountName.trim(),sortCode,accountNumber};}else{const value=paypal.trim();if(!/^(https:\/\/(?:www\.)?paypal\.me\/[A-Za-z0-9_-]+\/?|[^@\s/]+@[^@\s/]+\.[^@\s/]+)$/.test(value)){setValidation('Enter a PayPal email or an https://paypal.me/ link.');return;}payment={method,paypal:value};}}await submit(choice,payment);}}>
    <fieldset className="animal-picker"><legend>Your animal</legend>{animals.map(animal=><label className={`animal-choice avatar-tone-${animalTone(profilePeople,person.id,animal)} ${choice===animal?'selected':''}`} key={animal}><input type="radio" name="animal" value={animal} checked={choice===animal} onChange={()=>setChoice(animal)}/><AnimalIcon animal={animal}/><span>{animal}</span><Check size={16}/></label>)}</fieldset>
    <div className="optional-payment"><button type="button" role="switch" aria-label="Add a way to get paid" aria-checked={includePayment} className={`auto-share-switch ${includePayment?'auto-mode':'custom-mode'}`} onClick={()=>{setIncludePayment(!includePayment);setValidation('');}}><span className="switch-track"><span/></span><span>Add a way to get paid <small>optional</small></span></button>{includePayment&&<div className="payment-fields"><p className="field-hint">Visible to people in this room. Payments happen outside Littletab.</p><div className="segmented" role="tablist" aria-label="Payment method"><button type="button" role="tab" aria-selected={method==='bank'} onClick={()=>{setMethod('bank');setValidation('');}}>UK bank transfer</button><button type="button" role="tab" aria-selected={method==='paypal'} onClick={()=>{setMethod('paypal');setValidation('');}}>PayPal</button></div>{method==='bank'?<><label>Name on account<input value={accountName} onChange={e=>setAccountName(e.target.value)} maxLength={100} placeholder="e.g. Alex Morgan" required/></label><div className="form-row"><label>Sort code<input inputMode="numeric" value={sortCode} onChange={e=>setSortCode(e.target.value.replace(/[^0-9]/g,'').slice(0,6))} pattern="[0-9]{6}" maxLength={6} placeholder="6 digits" required/></label><label>Account number<input inputMode="numeric" value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/[^0-9]/g,'').slice(0,8))} pattern="[0-9]{8}" maxLength={8} placeholder="8 digits" required/></label></div></>:<label>PayPal email or PayPal.Me link<input value={paypal} onChange={e=>setPaypal(e.target.value)} maxLength={150} placeholder="https://paypal.me/yourname" required/></label>}</div>}</div>
    {(error||validation)&&<p className="form-error" role="alert">{validation||error}</p>}<button className="primary full" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<>Save profile <Check size={17}/></>}</button></form><button className="switch-identity" onClick={switchName}>Not {person.name}? Pick another name <ArrowRight size={14}/></button></Modal>;
}
function IdentityForm({ room, busy, error, currentId, close, submit, done }: { room: Room; busy: boolean; error: string; currentId?: string; close: () => void; submit: (data: { personId?: string; name?: string }) => Promise<boolean>; done: () => void }) {
  const [selected, setSelected] = useState(currentId || '');
  const [newName, setNewName] = useState('');
  return <Modal title="Which one is you?" close={close}><p className="modal-subtitle">Your host may have already added you. Pick your name to keep your expenses together, or add a new one.</p><form onSubmit={async e => { e.preventDefault(); if (await submit(selected === 'new' ? { name: newName.trim() } : { personId: selected })) done(); }}><fieldset className="identity-options"><legend>Your name in this room</legend>{room.people.map((person, i) => <label className={`identity-option ${selected === person.id ? 'selected' : ''}`} key={person.id}><input type="radio" name="identity" value={person.id} checked={selected === person.id} onChange={() => setSelected(person.id)} required/><Avatar name={person.name} animal={person.avatar} index={i}/><span>{person.name}</span><Check size={16}/></label>)}<label className={`identity-option new-identity ${selected === 'new' ? 'selected' : ''}`}><input type="radio" name="identity" value="new" checked={selected === 'new'} onChange={() => setSelected('new')} disabled={room.people.length >= 100} required/><Plus size={21}/><span>I’m someone new</span><Check size={16}/></label></fieldset>{selected === 'new' && <label>Your name<input name="newName" value={newName} onChange={e => setNewName(e.target.value)} placeholder="What should we call you?" maxLength={40} required/></label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary full" disabled={busy || !selected || (selected === 'new' && !newName.trim())}>{busy ? <LoaderCircle className="spin" size={17}/> : <>That’s me <ArrowRight size={17}/></>}</button></form></Modal>;
}
function PeopleForm({ serverError, room, busy, save, close }: { serverError: string; room: Room; busy: boolean; save: (room: Room) => Promise<boolean>; close: () => void }) {
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  return <Modal title="Good company starts here." close={close}><p className="modal-subtitle">Set up your group now, even before they join. Friends can pick their name later.</p>{serverError && <p className="form-error" role="alert">{serverError}</p>}<div className="manage-people">{room.people.map((p, i) => { const used = room.items.some(item => item.paidBy === p.id || item.participants.includes(p.id)); return <div className="manage-person" key={p.id}><Avatar name={p.name} animal={p.avatar} index={i}/><span>{p.name}</span><button className="icon-button" disabled={busy || used || room.people.length === 1} title={used ? 'Remove this person from expenses first' : 'Remove person'} aria-label={`Remove ${p.name}`} onClick={async () => { await save({ ...room, people: room.people.filter(x => x.id !== p.id) }); }}><X size={16}/></button></div>; })}</div><form ref={form} onSubmit={async e => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get('person')).trim(); if (!name) { setError('Enter a name to add someone.'); return; } if (room.people.some(p => p.name.toLowerCase() === name.toLowerCase())) { setError('There’s already someone with this name. Add a surname or nickname.'); return; } if (await save({ ...room, people: [...room.people, { id: id(), name, avatar: animals[Math.floor(Math.random()*animals.length)] }] })) { form.current?.reset(); setError(''); } }}><label>Bring someone along<div className="inline-input"><input name="person" maxLength={40} placeholder="Their name" required/><button className="primary" disabled={busy || room.people.length >= 100} aria-label="Add person"><Plus size={18}/></button></div></label>{error && <p className="form-error" role="alert">{error}</p>}</form><p className="field-hint">People with expenses can’t be removed until those expenses are updated. Up to 100 people per room.</p><button className="secondary full" onClick={close}>Everyone’s here <Check size={16}/></button></Modal>;
}
upgradeBrowserStorage();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
