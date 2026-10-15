'use client';
import {useId,useRef} from 'react';
import {Camera,ImagePlus} from 'lucide-react';

type Props={onSelect:(input:HTMLInputElement)=>void|Promise<void>;disabled?:boolean;multiple?:boolean;accept?:string;capture?:'environment'|'user';cameraLabel?:string;fileLabel?:string;inputName?:string};
/** Buttons only open the native picker. Preparation and upload remain owned by the calling form. */
export default function PhotoFileControls({onSelect,disabled=false,multiple=false,accept='image/jpeg,image/png,image/webp',capture='environment',cameraLabel='Tirar foto',fileLabel='Escolher arquivo',inputName}:Props){
 const id=useId(),camera=useRef<HTMLInputElement>(null),file=useRef<HTMLInputElement>(null);
 function open(input:HTMLInputElement|null){if(!disabled&&input&&!input.matches(':disabled'))input.click();}
 return <div className="photo-file-controls">
  <button type="button" className="button secondary photo-pick-button" disabled={disabled} aria-controls={id+'-camera'} onClick={()=>open(camera.current)}><Camera size={19} aria-hidden="true"/>{cameraLabel}</button>
  <input ref={camera} id={id+'-camera'} hidden className="photo-file-input" type="file" accept={accept} capture={capture} name={inputName} disabled={disabled} aria-label={cameraLabel} onChange={event=>void onSelect(event.currentTarget)}/>
  <button type="button" className="button secondary photo-pick-button" disabled={disabled} aria-controls={id+'-file'} onClick={()=>open(file.current)}><ImagePlus size={19} aria-hidden="true"/>{fileLabel}</button>
  <input ref={file} id={id+'-file'} hidden className="photo-file-input" type="file" accept={accept} multiple={multiple} name={inputName} disabled={disabled} aria-label={fileLabel} onChange={event=>void onSelect(event.currentTarget)}/>
 </div>;
}
