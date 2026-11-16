import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { Person } from './lib';

export function PaymentDetails({person}: {person:Person}) {
  const [copied,setCopied]=useState(false);
  const payment=person.payment;
  if(!payment) return null;
  const text=payment.method==='bank'?`${payment.accountName}\nSort code: ${payment.sortCode.match(/.{2}/g)?.join('-')}\nAccount number: ${payment.accountNumber}`:payment.paypal;
  return <details className="payment-details"><summary>How to pay {person.name}</summary>{payment.method==='bank'?<dl><div><dt>Account name</dt><dd>{payment.accountName}</dd></div><div><dt>Sort code</dt><dd>{payment.sortCode.match(/.{2}/g)?.join('-')}</dd></div><div><dt>Account number</dt><dd>{payment.accountNumber}</dd></div></dl>:<p className="paypal-detail">PayPal <strong>{payment.paypal}</strong></p>}<button className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setCopied(false);}}}>{copied?<Check size={13}/>:<Copy size={13}/>} {copied?'Copied':'Copy details'}</button></details>;
}
