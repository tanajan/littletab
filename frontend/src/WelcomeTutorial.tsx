import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Plus, ReceiptText, Users, X } from 'lucide-react';

export function WelcomeTutorial({close,guide}: {close:()=>void;guide:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [remember,setRemember]=useState(()=>{try{return localStorage.getItem('littletab-hide-tutorial')==='yes';}catch{return false;}});
  useEffect(()=>{const el=dialog.current!;el.showModal();return()=>el.close();},[]);
  function dismiss(){try{if(remember)localStorage.setItem('littletab-hide-tutorial','yes');else localStorage.removeItem('littletab-hide-tutorial');}catch{}close();}
  const steps=[{verb:'Make',title:'the party.',hint:'Create a room. Share the code.',Icon:Plus},{verb:'Add',title:'the good stuff.',hint:'Dinner, tickets, one more coffee.',Icon:ReceiptText},{verb:'Pick',title:'your people.',hint:'Choose who shares. Auto or custom.',Icon:Users},{verb:'Square',title:'it up.',hint:'See who pays whom. Share a receipt.',Icon:Check}];
  return <dialog ref={dialog} className="modal tutorial-modal" aria-labelledby="tutorial-title" onCancel={dismiss}><button className="icon-button tutorial-close" aria-label="Close tutorial" onClick={dismiss}><X size={20}/></button><span className="tiny-label">GOOD TIMES, WITHOUT THE MATHS</span><h2 id="tutorial-title">A little party.<br/>A fair share.</h2><p className="tutorial-subtitle">Four little steps. Then you’re off.</p><ol className="tutorial-steps">{steps.map(({verb,title,hint,Icon},index)=><li key={verb}><span className="tutorial-step-icon"><Icon size={21}/></span><div><h3><strong>{verb}</strong> {title}</h3><p>{hint}</p></div><span className="tutorial-number">0{index+1}</span></li>)}</ol><label className="tutorial-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Don’t show this again</label><button className="primary full" onClick={dismiss}>Let’s get together <ArrowRight size={17}/></button><button className="tutorial-guide" onClick={()=>{dismiss();guide();}}>Read the full guide</button></dialog>;
}
