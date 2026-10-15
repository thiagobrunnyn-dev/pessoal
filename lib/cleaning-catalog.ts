export const FREQUENCIES={daily:'Diária',weekly:'Semanal',fortnightly:'Quinzenal',monthly:'Mensal'} as const;
export type Frequency=keyof typeof FREQUENCIES;
export type Routine={id:string;label:string;frequency:Frequency;enabled:boolean;first_due:string;evidence:boolean};
export const DEFAULT_CLEANING:Routine[]=[
 {id:'environment',label:'Ambiente',frequency:'daily',enabled:true,first_due:'',evidence:false},
 {id:'sanitary',label:'Sanitário',frequency:'daily',enabled:true,first_due:'',evidence:false},
 {id:'waste',label:'Lixo',frequency:'daily',enabled:true,first_due:'',evidence:false},
 {id:'water',label:'Bebedouros',frequency:'daily',enabled:true,first_due:'',evidence:false},
 {id:'uniforms',label:'Lavagem de uniformes',frequency:'daily',enabled:true,first_due:'',evidence:false},
 {id:'linen',label:'Troca de lençóis e fronhas',frequency:'weekly',enabled:true,first_due:'',evidence:true},
 {id:'windows',label:'Janelas / portas / vidraçaria / cortinas',frequency:'fortnightly',enabled:true,first_due:'',evidence:false},
 {id:'fridge',label:'Geladeira',frequency:'fortnightly',enabled:true,first_due:'',evidence:false},
 {id:'ceiling',label:'Teto (teias e poeira)',frequency:'fortnightly',enabled:true,first_due:'',evidence:false},
 {id:'duvet',label:'Troca de edredons',frequency:'monthly',enabled:true,first_due:'',evidence:true},
];
export type CleaningResult={id:string;label:string;status:''|'done'|'pending'|'not_applicable';note:string;responsible?:string;recorded_at?:string};
export function parseCatalog(raw:string):Routine[]{try{const a=JSON.parse(raw);return Array.isArray(a)?a:[];}catch{return [];}}
export const statusLabel=(s:string)=>({done:'Feito',pending:'Pendente',not_applicable:'Não se aplica',completed:'Concluído',in_progress:'Em andamento',with_pending:'Com pendência',not_performed:'Sem execução'}[s]||s);
