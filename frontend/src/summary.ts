import { calculate, money, type Room } from './lib';

/** Local, read-only receipt snapshots. Paginate rather than truncate long item lists. */
export async function summaryImages(room: Room): Promise<Blob[]> {
  const totals = calculate(room);
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 2200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot create an image. Please try another browser.');
  const ink = '#354e3c', muted = '#727d65', line = '#dfe2d4';
  const pages: Blob[] = []; let y = 0;
  const dotTile=document.createElement('canvas');dotTile.width=dotTile.height=24;
  const tileContext=dotTile.getContext('2d')!;tileContext.fillStyle='#daddce';tileContext.beginPath();tileContext.arc(12,12,0.8,0,Math.PI*2);tileContext.fill();
  const paperGrid=ctx.createPattern(dotTile,'repeat');
  function text(value: string, x: number, top: number, size = 24, color = ink, align: CanvasTextAlign = 'left', width = 1056) {
    ctx!.textAlign = align;
    while (size > 14) {ctx!.font = `${size}px sans-serif`; if(ctx!.measureText(value).width <= width) break; size--;}
    ctx!.font = `${size}px sans-serif`; ctx!.fillStyle = color; ctx!.fillText(value,x,top);
  }
  function wrap(value: string, width: number, size: number) {
    ctx!.font = `${size}px sans-serif`;
    const rows: string[] = []; let row = '';
    for(const char of value) {if(row && ctx!.measureText(row+char).width>width){rows.push(row);row='';} row+=char;}
    if(row) rows.push(row); return rows;
  }
  function rule(top: number) {ctx!.strokeStyle=line;ctx!.beginPath();ctx!.moveTo(72,top);ctx!.lineTo(1128,top);ctx!.stroke();}
  function begin() {
    ctx!.fillStyle='#f7f5ee';ctx!.fillRect(0,0,1200,2200);if(paperGrid){ctx!.fillStyle=paperGrid;ctx!.fillRect(0,0,1200,2200);}ctx!.textBaseline='top';
    text('littletab.',72,48,36);text('GOOD TIMES. FAIR SHARES.',1128,60,16,muted,'right');rule(108);
    y=140;
    if(pages.length) {text(room.name,72,y,30);y+=55;text(`Receipt continued · ${room.currency}`,72,y,18,muted);y+=48;}
  }
  async function finish(last: boolean) {
    rule(y+10);text('Read-only snapshot · Arrange payments with your group outside Littletab.',72,y+34,18,muted);
    text(`All amounts in ${room.currency} · Page ${pages.length+1}`,72,y+67,17,muted);
    const output=document.createElement('canvas');output.width=1200;output.height=last ? y+118 :2200;
    output.getContext('2d')!.drawImage(canvas,0,0);
    pages.push(await new Promise<Blob>((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not create your receipt. Please try again.')),'image/png')));
  }
  async function ensure(height: number) {if(y+height>2060){await finish(false);begin();}}
  async function section(title: string, needed=140) {await ensure(needed);text(title,72,y,18,muted);y+=48;}
  begin();
  const title=wrap(room.name,1056,46); title.forEach((row,i)=>text(row,72,y+i*54,46));y+=title.length*54+25;
  text(`${room.items.length} ${room.items.length===1?'expense':'expenses'} · ${room.people.length} people · ${room.currency}`,72,y,20,muted);y+=46;
  ctx.fillStyle='#eaf0df';ctx.fillRect(72,y,1056,112);text('SHARED TOTAL',100,y+25,16,muted);text(money(totals.total,room.currency),1100,y+28,48,ink,'right',750);y+=155;
  await section('THE ITEM LIST');
  if(!room.items.length){text('No expenses yet.',72,y,24,muted);y+=70;}
  for(const item of room.items) {
    const rows=wrap(item.name,760,24); const height=rows.length*31+58;
    await ensure(height);rule(y);y+=17;
    rows.forEach((row,i)=>text(row,72,y+i*31,24));text(money(item.amount,room.currency),1128,y,25,ink,'right',260);y+=rows.length*31+7;
    const payer=room.people.find(p=>p.id===item.paidBy)?.name || 'Unknown';
    text(`Paid by ${payer} · ${item.participants.length} sharing · ${Object.keys(item.allocations||{}).length?'Custom amounts':'Equal split'}`,72,y,18,muted);y+=34;
  }
  y+=24;await section('EVERYONE’S SHARE',200);
  function headings(){text('PERSON',72,y,16,muted);text('PAID',624,y,16,muted,'right');text('SHARE',865,y,16,muted,'right');text('BALANCE',1128,y,16,muted,'right');y+=34;}
  headings();
  for(const person of room.people){
    if(y+84>2060){await finish(false);begin();await section('EVERYONE’S SHARE · CONTINUED');headings();}
    rule(y);y+=18;let size=23;while(wrap(person.name,290,size).length>2&&size>14)size--;
    wrap(person.name,290,size).forEach((row,i)=>text(row,72,y+i*28,size));
    text(money(totals.paid[person.id],room.currency),624,y,23,ink,'right',215);text(money(totals.shares[person.id],room.currency),865,y,23,ink,'right',215);
    const balance=totals.balances[person.id];text(`${balance>0?'+':''}${money(balance,room.currency)}`,1128,y,23,balance<0?'#9c674e':ink,'right',235);y+=66;
  }
  await ensure(68);text('Positive = gets back. Negative = owes.',72,y+2,18,muted);y+=65;
  await section('WHO PAYS WHOM');
  const name=(id:string)=>room.people.find(p=>p.id===id)!.name;
  for(const transfer of totals.transfers){await ensure(100);rule(y);y+=18;text(name(transfer.from),72,y,24,ink,'left',700);text(`pays ${name(transfer.to)}`,72,y+33,20,muted,'left',700);text(money(transfer.amount,room.currency),1128,y+16,28,ink,'right',310);y+=82;}
  if(!totals.transfers.length){await ensure(80);text('Everyone is square. Nothing to settle.',72,y+10,24);y+=80;}
  await finish(true);return pages;
}
