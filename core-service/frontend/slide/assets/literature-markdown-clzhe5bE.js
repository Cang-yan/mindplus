const R=/^<!--\s*(?:page|p|第)\s*[:：#-]?\s*\d+\s*(?:页)?\s*-->$/i,_=/^```(?:\s*(?:markdown|md))?\s*$/i,j=/^```(?:\s*(?:markdown|md))\s*$/i,F=/^```\s*$/;function P(e){return R.test(String(e||"").trim())}function g(e){let n=String(e??"");return n?n.replace(/[\u200B-\u200D\uFEFF]/g,"").replace(/\r\n?/g,`
`).replace(/\\r\\n/g,`
`).replace(/\\n/g,`
`):""}function I(e){for(let n=e.length-1;n>=0;n-=1){const t=e[n].trim();if(t)return t}return""}function $(e,n){for(let t=n;t<e.length;t+=1){const r=e[t].trim();if(r)return r}return""}function C(e,n){return _.test(e)?!n||P(n):!1}function W(e,n){for(let t=n;t<e.length;t+=1){if(!F.test(e[t].trim()))continue;const r=$(e,t+1);if(!r||P(r))return t}return-1}function L(e){const n=e.split(`
`),t=[];for(let r=0;r<n.length;r+=1){const i=n[r],s=i.trim(),o=I(t);if(C(s,o)){const u=W(n,r+1);if(u!==-1){t.push(...n.slice(r+1,u)),r=u;continue}}t.push(i)}return t.join(`
`)}function N(e){for(let n=0;n<e.length;n+=1)if(e[n].trim())return n;return-1}function b(e){for(let n=e.length-1;n>=0;n-=1)if(e[n].trim())return n;return-1}function w(e){if(!e.trim())return"";const n=e.split(`
`),t=N(n);if(t===-1)return"";const r=n[t].trim();if(!j.test(r))return e;n[t]="";const i=b(n);return i!==-1&&F.test(n[i].trim())&&(n[i]=""),n.join(`
`)}function S(e){const n=e.split(`
`);let t=0;for(const r of n)/^```/.test(r.trim())&&(t+=1);return t%2===0?e:`${e}
\`\`\``}function x(e){let n=g(e);return n?(n=L(n),n.split(`
`).map(t=>t.replace(/^[ \t]{4,}(#{1,6}\s+)/,"$1")).join(`
`).trim()):""}function c(e){let n=g(e);return n?(n=w(n),n=L(n),n=S(n),n.split(`
`).map(t=>t.replace(/^[ \t]{4,}(#{1,6}\s+)/,"$1")).join(`
`).trim()):""}function E(e){const n=g(e);if(!n.trim())return[];const t=n.split(`
`),r=[];let i=[],s=!1;for(const u of t){if(P(u)){(s||i.some(l=>l.trim()))&&r.push(i.join(`
`)),s=!0,i=[];continue}i.push(u)}r.push(i.join(`
`));const o=r.map(u=>c(u));return o.some(u=>u.trim())?o:[]}function h(e){return Array.isArray(e)?e.map(n=>c(n)).filter(n=>n.trim().length>0):E(e)}function B(e,n){const t=e.map(s=>c(s));if(n<=1)return t.slice(0,1);if(t.length===n)return t;if(t.length<n)return[...t,...Array.from({length:n-t.length},()=>"")];const r=t.slice(0,n-1),i=t.slice(n-1).filter(s=>s.trim()).join(`

`);return[...r,c(i)]}function A(e,n){const t=n.length;if(t<=1)return[c(e)];const r=x(e);if(!r.trim())return Array.from({length:t},()=>"");const i=r.split(`
`),s=n.map(a=>Math.max(1,c(a).length)),o=s.reduce((a,f)=>a+f,0)||t,u=Math.max(i.reduce((a,f)=>a+f.length+1,0),t),l=s.map(a=>Math.max(1,Math.round(a/o*u))),M=Array.from({length:t},()=>[]);let m=0,p=0,d=!1;for(let a=0;a<i.length;a+=1){const f=i[a],k=f.trim();M[m].push(f),p+=f.length+1,/^```/.test(k)&&(d=!d);const z=i.length-a-1,y=t-m-1;m<t-1&&!d&&z>=y&&p>=l[m]&&(m+=1,p=0)}return M.map(a=>c(a.join(`
`)))}function T(e){if(!Array.isArray(e))return[];const n=[];for(const t of e){const r=g(t);if(!r.trim())continue;const i=E(r);if(i.length>1){n.push(...i);continue}const s=c(r);(s||r.trim())&&n.push(s)}return n}function v(e){const n=h(e);return n.length?n.length===1?n[0]:n.map((t,r)=>{const i=c(t);return`<!-- Page ${r+1} -->
${i}`.trim()}).join(`

`).trim():""}function D(e,n,t){const r=h(n),i=r.length,s=h(t==null?void 0:t.preferredPages);if(i>1&&s.length===i)return{pages:s,mode:"preferred"};const o=E(e);if(i<=1){if(o.length>0)return{pages:o,mode:o.length===1?"single":"direct"};const l=c(e);return l.trim()?{pages:[l],mode:"single"}:{pages:[],mode:"empty"}}if(o.length===i)return{pages:o,mode:"direct"};if(o.length===1)return{pages:A(o[0],r),mode:"heuristic"};if(o.length>1)return{pages:B(o,i),mode:"resized"};const u=x(e);return u.trim()?{pages:A(u,r),mode:"heuristic"}:{pages:[],mode:"empty"}}export{c as a,T as b,D as c,v as d,x as n,E as s};
