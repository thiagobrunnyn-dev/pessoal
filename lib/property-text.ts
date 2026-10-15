// Human property names/addresses only. Never apply to identifiers, enums or URLs.
export function uppercasePropertyText(value:string){
 return value.split(/([A-Z][A-Z0-9+.-]*:\/\/\S+|www\.\S+|mailto:\S+|[\p{L}\p{M}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{M}\p{N}.-]+\.[\p{L}]{2,})/giu).map((part,index)=>index%2?part:part.normalize('NFC').toLocaleUpperCase('pt-BR')).join('');
}
