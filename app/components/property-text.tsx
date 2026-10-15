'use client';
import {useState,type InputHTMLAttributes,type TextareaHTMLAttributes,type SyntheticEvent} from 'react';
import {uppercasePropertyText} from '../../lib/property-text';
import './property-text.css';
type Control=HTMLInputElement|HTMLTextAreaElement;
export function propertyTextEvent(event:SyntheticEvent<Control>,onValue:(value:string)=>void){const field=event.currentTarget,raw=field.value;if((event.nativeEvent as InputEvent).isComposing){onValue(raw);return;}const value=uppercasePropertyText(raw),start=field.selectionStart,end=field.selectionEnd;onValue(value);if(raw!==value&&start!==null&&end!==null){const a=uppercasePropertyText(raw.slice(0,start)).length,b=uppercasePropertyText(raw.slice(0,end)).length;window.requestAnimationFrame(()=>{if(field.isConnected&&document.activeElement===field&&field.value===value)field.setSelectionRange(a,b);});}}
type InputProps=Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'onCompositionEnd'>;
type AreaProps=Omit<TextareaHTMLAttributes<HTMLTextAreaElement>,'value'|'onChange'|'onCompositionEnd'>;
export function PropertyTextInput({defaultValue='',...props}:InputProps){const [value,setValue]=useState(()=>uppercasePropertyText(String(defaultValue)));return <input {...props} type="text" autoCapitalize="characters" value={value} onChange={e=>propertyTextEvent(e,setValue)} onCompositionEnd={e=>propertyTextEvent(e,setValue)}/>;}
export function PropertyTextArea({defaultValue='',...props}:AreaProps){const [value,setValue]=useState(()=>uppercasePropertyText(String(defaultValue)));return <textarea {...props} autoCapitalize="characters" value={value} onChange={e=>propertyTextEvent(e,setValue)} onCompositionEnd={e=>propertyTextEvent(e,setValue)}/>;}
