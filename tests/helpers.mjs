import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_CONFIG } from '../dist/config.js';
export function fixture(t, files={'src/util.ts':'export const n = 1;\n'}) {
  const root=mkdtempSync(join(tmpdir(),'rr-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const put=(path,text)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),text)};
  git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');
  for(const [p,c] of Object.entries(files))put(p,c);
  git('add','.');git('commit','-m','baseline');
  const base=git('rev-parse','HEAD').trim();
  const options=(extra={})=>({repo:root,base,provider:'heuristic',out:join(root,'.review-radar'),config:structuredClone(DEFAULT_CONFIG),...extra});
  return {root,git,put,base,options};
}
export function usage(){return {requests:0,cacheHits:0,errors:0,budgetSkipped:0,inputTokens:0,outputTokens:0,redactions:0}}
export function validResponse(qs,custom={}) {
  const answers={};
  for(const [id,q] of Object.entries(qs)) {
    if(q.type==='score')answers[id]={type:'score',score:2,confidence:1,probabilities:Object.fromEntries(q.criteria.map((_,i)=>[i,i===2?1:0]))};
    else {
      const choice={verification:'unknown',context:'sufficient',focus:'general',evidence:'E0'}[id]??Object.keys(q.criteria)[0];
      answers[id]={type:'choice',choice,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))};
    }
  }
  return {model:'jev-test-model',answers:{...answers,...custom},usage:{input_tokens:100,output_tokens:12}};
}
export function simpleQuestions(){return {risk:{type:'score',instructions:'Rate this changed behavior',criteria:['none','local','workflow','data','critical']}}}
