import { useRef, useState } from 'react';

export function PinInput({creating}: {creating: boolean}) {
  const [digits, setDigits] = useState(['','','','']);
  const [legacy, setLegacy] = useState(false);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  function distribute(raw: string, start: number) {
    const pasted = raw.replace(/[^0-9]/g, '').slice(0,4);
    if (!pasted) return;
    const offset = pasted.length === 4 ? 0 : start;
    setDigits(values => values.map((value,index) => index >= offset && index < offset + pasted.length ? pasted[index-offset] : value));
    boxes.current[Math.min(offset+pasted.length,3)]?.focus();
  }
  return <div className="pin-field"><fieldset><legend>{creating ? 'Set a 4-digit room PIN' : 'Room PIN'}</legend>{legacy ? <input name="password" type="password" aria-label="Older room password" maxLength={128} required autoComplete="current-password"/> : <><input type="hidden" name="password" value={digits.join('')}/><div className="pin-boxes">{digits.map((digit,index) => <input key={index} ref={element => {boxes.current[index] = element;}} type="text" inputMode="numeric" aria-label={`PIN digit ${index+1}`} autoComplete={index===0 ? 'one-time-code' : 'off'} pattern="[0-9]" maxLength={1} placeholder="•" value={digit} required onFocus={event => event.currentTarget.select()} onChange={event => {const value=event.target.value.replace(/[^0-9]/g,''); setDigits(values => values.map((old,i) => i===index ? value : old)); if(value) boxes.current[Math.min(index+1,3)]?.focus();}} onPaste={event => {event.preventDefault();distribute(event.clipboardData.getData('text'),index);}} onKeyDown={event => {if(event.key==='Backspace' && !digit && index>0) boxes.current[index-1]?.focus(); if(event.key==='ArrowLeft' && index>0){event.preventDefault();boxes.current[index-1]?.focus();} if(event.key==='ArrowRight' && index<3){event.preventDefault();boxes.current[index+1]?.focus();}}}/> )}</div></>}</fieldset>{!creating && <button type="button" className="legacy-pin" onClick={() => setLegacy(!legacy)}>{legacy ? 'Use a 4-digit PIN' : 'Have an older room password?'}</button>}</div>;
}
