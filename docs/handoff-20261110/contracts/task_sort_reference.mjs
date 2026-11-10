// Reference specification with fixed clock. Integrate with server SQL authorization/keyset; not a repo patch.
export function bucket(t, asOf){
 const at=Date.parse(asOf),local=new Date(at+7*3600000),day=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-7*3600000;
 if(t.flow_mode==='LEGACY_REVIEW'&&t.status==='SUBMITTED')return 5;
 const open=['WAITING','IN_PROGRESS','ASSIGNED','ACCEPTED','CHANGES_REQUESTED'].includes(t.status);
 if(open){if(!t.due_at)return 4;const due=Date.parse(t.due_at);if(due<at)return 0;if(due<day+86400000)return 1;if(due<day+4*86400000)return 2;return 3;}
 if(t.status==='DONE')return 6;if(t.status==='CANCELLED')return 7;return 8;
}
export function compare(a,b,asOf,sort='ATTENTION'){
 const id=String(a.id).localeCompare(String(b.id));
 if(sort==='DUE_ASC')return (Date.parse(a.due_at||'9999-12-31')-Date.parse(b.due_at||'9999-12-31'))||id;
 if(sort==='COMPLETED_DESC')return (Date.parse(b.completed_at||0)-Date.parse(a.completed_at||0))||id;
 const ba=bucket(a,asOf),bb=bucket(b,asOf);if(ba!==bb)return ba-bb;
 if(ba<=3)return Number(a.priority!=='URGENT')-Number(b.priority!=='URGENT')||(Date.parse(a.due_at)-Date.parse(b.due_at))||(Date.parse(b.created_at||'1970-01-01')-Date.parse(a.created_at||'1970-01-01'))||id;
 const key=ba===6?'completed_at':ba===7?'cancelled_at':ba===5?'submitted_at':'updated_at';
 const av=Date.parse(a[key]||'1970-01-01'),bv=Date.parse(b[key]||'1970-01-01');return (ba===5?av-bv:bv-av)||id;
}
