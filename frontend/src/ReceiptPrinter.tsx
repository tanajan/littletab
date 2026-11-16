import {useEffect,useState} from 'react';
import {ArrowUpRight, LoaderCircle, ReceiptText} from 'lucide-react';

export function ReceiptPrinter({urls,filename}: {urls:string[];filename:string}) {
  const [zoom,setZoom]=useState(false);
  const [printing,setPrinting]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{setPrinting(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);setZoom(false);},[urls]);
  const preparing=urls.length===0;
  return <div className={`receipt-printer ${preparing||printing?'is-printing':'is-ready'}`}>
    <div className="receipt-machine"><div><span className="printer-brand">littletab print desk</span><span className="printer-light"/></div><div className="printer-slot"/></div>
    <div className="printer-status" role="status" aria-live="polite">{preparing?<><LoaderCircle className="spin" size={14}/> Preparing your receipt…</>:printing?<>Printing your receipt… <button onClick={()=>setPrinting(false)}>Show now</button></>:<>Fresh off the press. Ready to share.</>}</div>
    {preparing?<div className="printer-empty-paper"><ReceiptText size={32}/><p>Adding up the good times.</p></div>:<div className="receipt-image-preview">{urls.map((url,index)=><figure key={url}>
      <div className="receipt-paper" style={{animationDelay:`${Math.min(index,4)*120}ms`}} onAnimationEnd={event=>{if(event.target===event.currentTarget&&index===urls.length-1)setPrinting(false);}}><div className={`receipt-image-scroll ${zoom?'zoomed':''}`}><button className="receipt-image-zoom" aria-label={`${zoom?'Fit':'Zoom'} receipt image ${index+1}`} disabled={printing} onClick={()=>setZoom(!zoom)}><img src={url} alt={`Read-only receipt with every expense, shares and settlement payments, page ${index+1}`}/></button></div></div>
      <figcaption>{urls.length>1&&<span>Page {index+1} of {urls.length}</span>}<button className="secondary" disabled={printing} onClick={()=>setZoom(!zoom)}>{zoom?'Fit to preview':'View full size'} <ArrowUpRight size={15}/></button><a className="primary" href={url} download={`${filename}${urls.length>1?`-${index+1}`:''}.png`}>Download image <ReceiptText size={15}/></a></figcaption>
    </figure>)}</div>}
  </div>;
}
