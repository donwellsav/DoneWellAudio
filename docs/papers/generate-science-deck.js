const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');

const C = {
  bg:'0D1117', bgCard:'161B22', bgCode:'1C2128',
  accent1:'16A085', accent2:'E67E22', accent3:'3498DB',
  accent4:'E74C3C', accent5:'9B59B6',
  text:'E6EDF3', textMuted:'8B949E', textDim:'484F58',
  border:'30363D', green:'2ECC71', white:'FFFFFF',
};
const FONT='Arial', FONT_MONO='Courier New';

async function createGradient(fn,c1,c2,w=1920,h=1080){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#${c1}"/><stop offset="100%" style="stop-color:#${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(fn); return fn;
}

function sn(s,n,t){s.addText(`${n} / ${t}`,{x:8.5,y:5.2,w:1.2,h:0.3,fontSize:9,fontFace:FONT,color:C.textDim,align:'right'});}
function ft(s){s.addText('Kill The Ring  •  killthering.com',{x:0.3,y:5.2,w:4,h:0.3,fontSize:9,fontFace:FONT,color:C.textDim});}
function at(s,t,o={}){s.addText(t,{x:0.6,y:0.3,w:8.8,h:0.7,fontSize:28,fontFace:FONT,color:C.accent1,bold:true,...o});}
function as(s,t){s.addText(t,{x:0.6,y:0.95,w:8.8,h:0.4,fontSize:14,fontFace:FONT,color:C.textMuted,italic:true});}
function al(s){s.addShape(pptx.shapes.RECTANGLE,{x:0.6,y:1.2,w:2.0,h:0.04,fill:{color:C.accent1}});}

const pptx=new pptxgen();
pptx.layout='LAYOUT_16x9'; pptx.author='Don Wells';
pptx.title='Emergent Room Resonance Analysis via Multi-Algorithm Feedback Detection';
const T=15;
function ns(){const s=pptx.addSlide();s.background={fill:C.bg};return s;}

async function build(){
  const sd=path.join(__dirname,'slides');
  if(!fs.existsSync(sd))fs.mkdirSync(sd,{recursive:true});
  const tbg=await createGradient(path.join(sd,'title-bg.png'),'0D1117','1A2332');

  // 1: Title
  let s=ns(); s.addImage({path:tbg,x:0,y:0,w:10,h:5.625});
  s.addShape(pptx.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.06,fill:{color:C.accent1}});
  s.addText('TECHNICAL PRESENTATION',{x:0.8,y:1.0,w:8.4,h:0.4,fontSize:12,fontFace:FONT,color:C.accent2,bold:true});
  s.addText('Emergent Room Acoustic Resonance\nAnalysis via Multi-Algorithm\nFeedback Detection',{x:0.8,y:1.5,w:8.4,h:2.0,fontSize:30,fontFace:FONT,color:C.white,bold:true,lineSpacingMultiple:1.15});
  s.addText('How Six Fused Algorithms Accidentally Became a Room Analyzer',{x:0.8,y:3.5,w:8.4,h:0.5,fontSize:15,fontFace:FONT,color:C.accent1,italic:true});
  s.addShape(pptx.shapes.RECTANGLE,{x:0.8,y:4.2,w:3.0,h:0.03,fill:{color:C.accent1}});
  s.addText('Don Wells  •  Kill The Ring Project  •  March 2026',{x:0.8,y:4.4,w:8.4,h:0.3,fontSize:12,fontFace:FONT,color:C.textMuted});
  sn(s,1,T);

  // 2: Observation
  s=ns();at(s,'The Observation');as(s,'March 20, 2026 — An Unexpected Result');al(s);
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:0.6,y:1.5,w:8.8,h:1.6,fill:{color:'1C2128'},rectRadius:0.1,line:{color:C.accent2,width:2}});
  s.addText([{text:'KTR running in Ring Out mode (2 dB threshold)\n',options:{fontSize:14,color:C.white,bold:true}},{text:'No feedback loop present — mic not routed to speakers\n',options:{fontSize:13,color:C.text}},{text:'System generates sustained EQ advisories for persistent spectral peaks\n',options:{fontSize:13,color:C.text}},{text:'Advisory frequencies match expected room resonance modes',options:{fontSize:13,color:C.accent1,bold:true}}],{x:0.9,y:1.6,w:8.2,h:1.4,valign:'middle',lineSpacingMultiple:1.4});
  s.addText([{text:'The system was detecting ',options:{fontSize:15,color:C.text}},{text:'room resonances',options:{fontSize:15,color:C.accent2,bold:true}},{text:' and generating ',options:{fontSize:15,color:C.text}},{text:'room correction EQ',options:{fontSize:15,color:C.accent2,bold:true}},{text:' — with zero setup.',options:{fontSize:15,color:C.text}}],{x:0.6,y:3.5,w:8.8,h:0.6});
  s.addText('This is not a bug. It is physics.',{x:0.6,y:4.3,w:8.8,h:0.5,fontSize:18,fontFace:FONT,color:C.accent1,bold:true,italic:true});
  ft(s);sn(s,2,T);

  // 3: Architecture
  s=ns();at(s,'System Architecture');as(s,'Three-Layer Real-Time Processing Pipeline');al(s);
  const ly=[{l:'MAIN THREAD',d:'AudioContext → 8192-pt FFT\nPeak Detection (50 fps)\nProminence via Prefix-Sum O(1)\nPersistence Scoring',c:C.accent3,x:0.6},{l:'WEB WORKER',d:'6 Detection Algorithms\nContent-Adaptive Fusion\n5 Multiplicative Gates\nML Meta-Model (ONNX)',c:C.accent1,x:3.6},{l:'UI LAYER',d:'Canvas RTA (30 fps)\nAdvisory Cards\nPEQ Recommendations\nExport (PDF/TXT/CSV)',c:C.accent2,x:6.6}];
  for(const l of ly){s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:l.x,y:1.5,w:2.8,h:3.0,fill:{color:C.bgCard},rectRadius:0.1,line:{color:l.c,width:2}});s.addText(l.l,{x:l.x,y:1.6,w:2.8,h:0.4,fontSize:11,fontFace:FONT,color:l.c,bold:true,align:'center'});s.addShape(pptx.shapes.RECTANGLE,{x:l.x+0.3,y:2.05,w:2.2,h:0.02,fill:{color:C.border}});s.addText(l.d,{x:l.x+0.2,y:2.2,w:2.4,h:2.2,fontSize:11,fontFace:FONT_MONO,color:C.text,valign:'top',lineSpacingMultiple:1.5});}
  for(const ax of[3.4,6.4])s.addText('→',{x:ax-0.15,y:2.7,w:0.5,h:0.5,fontSize:24,color:C.accent1,align:'center'});
  s.addText('Zero-copy Transferable Buffers  •  Worker backpressure: drop if busy',{x:0.6,y:4.7,w:8.8,h:0.3,fontSize:10,fontFace:FONT_MONO,color:C.textMuted,align:'center'});
  ft(s);sn(s,3,T);

  // 4: Algorithms Table
  s=ns();at(s,'Six Detection Algorithms');as(s,'Independent Analysis of Different Physical Characteristics');al(s);
  s.addTable([[{text:'#',options:{fill:{color:C.accent1},color:C.white,bold:true,align:'center'}},{text:'Algorithm',options:{fill:{color:C.accent1},color:C.white,bold:true}},{text:'Measures',options:{fill:{color:C.accent1},color:C.white,bold:true}},{text:'Method',options:{fill:{color:C.accent1},color:C.white,bold:true}},{text:'Origin',options:{fill:{color:C.accent1},color:C.white,bold:true}}],['1','MSD','Magnitude stability','2nd-derivative stencil, sparse 256-slot pool','Rohdenburg (DAFx-16)'],['2','Phase Coherence','Phase stability','Circular statistics mean phasor','Fisher (1993)'],['3','Spectral Flatness','Tonal character','Geometric/arithmetic mean + kurtosis','Glasberg-Moore'],['4','Comb Pattern','Harmonic spacing','f, 2f, 3f matching ±5%, ≥3 harmonics','Acoustic path delay'],[{text:'5',options:{color:C.accent5,bold:true}},{text:'IHR',options:{color:C.accent5,bold:true}},'Inter-harmonic energy','Sideband energy ratio ±5-40 bins',{text:'NOVEL',options:{color:C.accent5,bold:true}}],[{text:'6',options:{color:C.accent5,bold:true}},{text:'PTMR',options:{color:C.accent5,bold:true}},'Peak sharpness','Peak dB − median(40-bin window)',{text:'NOVEL',options:{color:C.accent5,bold:true}}]],{x:0.4,y:1.5,w:9.2,colW:[0.4,1.4,1.4,3.2,1.4],border:{pt:0.5,color:C.border},color:C.text,fontSize:10,fontFace:FONT,rowH:[0.35,0.4,0.4,0.4,0.4,0.4,0.4],fill:{color:C.bgCard},valign:'middle'});
  s.addText('+ ML Meta-Model (MLP 11→32→16→1, 929 params, 4KB ONNX) as 7th fusion component',{x:0.6,y:4.6,w:8.8,h:0.3,fontSize:10,fontFace:FONT_MONO,color:C.accent2});
  ft(s);sn(s,4,T);

  // 5: Formulas
  s=ns();at(s,'Algorithm Formulas');as(s,'Mathematical Foundation of Each Detection Algorithm');al(s);
  const fm=[['MSD','MSD(k) = (1/N) Σ|v(k,n) − 2·v(k,n−1) + v(k,n−2)|²'],['Phase','C = |(1/N) Σ[cos(Δφᵢ) + j·sin(Δφᵢ)]|'],['Flatness','SF = (∏ xᵢ)^(1/N) / (1/N · Σ xᵢ)'],['Comb','Δf = c/d    (speed of sound / path length)'],['IHR','IHR = E_interharmonic / E_harmonic'],['PTMR','PTMR_dB = S[peak] − median(S[peak ± 20 bins])']];
  let fy=1.5;
  for(const[nm,eq]of fm){s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:0.6,y:fy,w:8.8,h:0.48,fill:{color:C.bgCode},rectRadius:0.05});s.addText(nm,{x:0.8,y:fy+0.02,w:1.2,h:0.44,fontSize:11,fontFace:FONT,color:C.accent1,bold:true,valign:'middle'});s.addText(eq,{x:2.0,y:fy+0.02,w:7.2,h:0.44,fontSize:12,fontFace:FONT_MONO,color:C.text,valign:'middle'});fy+=0.56;}
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:0.6,y:fy+0.15,w:8.8,h:0.55,fill:{color:C.bgCode},rectRadius:0.05,line:{color:C.accent2,width:2}});
  s.addText('Fusion',{x:0.8,y:fy+0.17,w:1.2,h:0.5,fontSize:11,fontFace:FONT,color:C.accent2,bold:true,valign:'middle'});
  s.addText('P(fb) = Σ(sᵢ · wᵢ) / Σ(wᵢ)    Confidence = P · (0.5 + 0.5 · (1 − √Var))',{x:2.0,y:fy+0.17,w:7.2,h:0.5,fontSize:12,fontFace:FONT_MONO,color:C.accent2,valign:'middle'});
  ft(s);sn(s,5,T);

  // 6: Weight Chart
  s=ns();at(s,'Content-Adaptive Weighted Fusion');as(s,'Four Weight Profiles Selected by Real-Time Content Classification');al(s);
  s.addChart(pptx.charts.BAR,[{name:'Default',labels:['MSD','Phase','Spectral','Comb','IHR','PTMR','ML'],values:[0.27,0.23,0.11,0.07,0.12,0.10,0.10]},{name:'Speech',labels:['MSD','Phase','Spectral','Comb','IHR','PTMR','ML'],values:[0.30,0.22,0.09,0.04,0.09,0.16,0.10]},{name:'Music',labels:['MSD','Phase','Spectral','Comb','IHR','PTMR','ML'],values:[0.07,0.32,0.09,0.07,0.22,0.13,0.10]},{name:'Compressed',labels:['MSD','Phase','Spectral','Comb','IHR','PTMR','ML'],values:[0.11,0.27,0.16,0.07,0.16,0.13,0.10]}],{x:0.4,y:1.5,w:9.2,h:3.8,barDir:'col',barGrouping:'clustered',showTitle:false,showLegend:true,legendPos:'b',legendFontSize:10,legendColor:C.textMuted,showCatAxisTitle:false,showValAxisTitle:true,valAxisTitle:'Weight',valAxisTitleColor:C.textMuted,valAxisLabelColor:C.textMuted,catAxisLabelColor:C.text,catAxisLabelFontSize:10,valAxisMaxVal:0.35,valAxisMinVal:0,chartColors:[C.accent3,C.accent1,C.accent2,C.accent5],plotArea:{fill:{color:C.bgCard}}});
  ft(s);sn(s,6,T);

  // 7: Gates
  s=ns();at(s,'Post-Fusion Multiplicative Gates');as(s,'Five Independent False-Positive Suppression Gates');al(s);
  s.addTable([[{text:'Gate',options:{fill:{color:C.accent1},color:C.white,bold:true}},{text:'Factor',options:{fill:{color:C.accent1},color:C.white,bold:true,align:'center'}},{text:'Activation Condition',options:{fill:{color:C.accent1},color:C.white,bold:true}},{text:'Suppresses',options:{fill:{color:C.accent1},color:C.white,bold:true}}],['IHR Gate','× 0.65','harmonics ≥ 3 AND IHR > 0.35','Musical instruments'],['PTMR Gate','× 0.80','PTMR feedbackScore < 0.2','Broad spectral features'],['Comb Stability','× 0.25','Spacing CV > 0.05 (16 frames)','Flangers / phasers'],['Formant Gate','× 0.65','2+ peaks in F1/F2/F3, Q ∈ [3,20]','Sustained singing vowels'],['Chromatic Gate','× 0.60','±5 cents from 12-TET, coh > 0.80','Auto-Tuned vocals']],{x:0.4,y:1.5,w:9.2,colW:[1.6,0.8,3.4,2.4],border:{pt:0.5,color:C.border},color:C.text,fontSize:11,fontFace:FONT,rowH:[0.35,0.45,0.45,0.45,0.45,0.45],fill:{color:C.bgCard},valign:'middle'});
  s.addText('Gates are multiplicative and stack. Musical instrument: IHR + Comb = P × 0.65 × 0.25 = 83.75% reduction.',{x:0.6,y:4.5,w:8.8,h:0.4,fontSize:10,fontFace:FONT,color:C.textMuted,italic:true});
  ft(s);sn(s,7,T);

  // 8: Physical Equivalence
  s=ns();at(s,'The Physical Equivalence',{color:C.accent2});as(s,"Why Room Resonances ARE Feedback — From the Spectrum's Perspective");al(s);
  const bx=[{l:'ACOUSTIC FEEDBACK',d:'Sustained by electroacoustic loop\n(mic → amp → speaker → air → mic)\n\nSelf-sustaining narrowband oscillation\nat a specific frequency',c:C.accent4,x:0.6},{l:'ROOM RESONANCE',d:'Sustained by wall reflections\n(standing wave between surfaces)\n\nSelf-sustaining narrowband oscillation\nat a specific frequency',c:C.accent3,x:5.2}];
  for(const b of bx){s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:b.x,y:1.5,w:4.2,h:2.2,fill:{color:C.bgCard},rectRadius:0.1,line:{color:b.c,width:2}});s.addText(b.l,{x:b.x,y:1.55,w:4.2,h:0.35,fontSize:12,fontFace:FONT,color:b.c,bold:true,align:'center'});s.addText(b.d,{x:b.x+0.2,y:2.0,w:3.8,h:1.6,fontSize:11,fontFace:FONT,color:C.text,valign:'top',lineSpacingMultiple:1.3});}
  s.addText('≡',{x:4.5,y:2.0,w:1.0,h:1.0,fontSize:48,fontFace:FONT,color:C.accent2,bold:true,align:'center',valign:'middle'});
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:0.6,y:4.0,w:8.8,h:0.7,fill:{color:C.bgCode},rectRadius:0.08,line:{color:C.accent2,width:2}});
  s.addText('Spectral Signature Equivalence:  ‖S_fb − S_rm‖₂ → 0   for persistent narrowband peaks',{x:0.8,y:4.05,w:8.4,h:0.6,fontSize:14,fontFace:FONT_MONO,color:C.accent2,align:'center',valign:'middle',bold:true});
  ft(s);sn(s,8,T);

  // 9: Score Comparison
  s=ns();at(s,'Algorithm Score Comparison');as(s,'Room Resonance vs. Acoustic Feedback — All Six Algorithms');al(s);
  s.addTable([[{text:'Algorithm',options:{fill:{color:C.accent1},color:C.white,bold:true}},{text:'Room Resonance',options:{fill:{color:C.accent3},color:C.white,bold:true,align:'center'}},{text:'Acoustic Feedback',options:{fill:{color:C.accent4},color:C.white,bold:true,align:'center'}},{text:'Distinguishable?',options:{fill:{color:C.accent2},color:C.white,bold:true,align:'center'}}],['MSD','≈ 0 (very stable)','≈ 0 (very stable)',{text:'NO',options:{color:C.accent4,bold:true,align:'center'}}],['Phase Coherence','0.85 – 0.95','0.85 – 0.98',{text:'NO',options:{color:C.accent4,bold:true,align:'center'}}],['Spectral Flatness','< 0.05 (tonal)','< 0.05 (tonal)',{text:'NO',options:{color:C.accent4,bold:true,align:'center'}}],['Comb Pattern','May match (axial)','Matches (loop)',{text:'~',options:{color:C.accent2,bold:true,align:'center'}}],['IHR','≈ 0 (clean)','≈ 0 (pure tone)',{text:'NO',options:{color:C.accent4,bold:true,align:'center'}}],['PTMR','High (sharp peak)','High (sharp peak)',{text:'NO',options:{color:C.accent4,bold:true,align:'center'}}]],{x:0.3,y:1.5,w:9.4,colW:[2.4,2.2,2.2,1.6],border:{pt:0.5,color:C.border},color:C.text,fontSize:11,fontFace:FONT,rowH:[0.35,0.42,0.42,0.42,0.42,0.42,0.42],fill:{color:C.bgCard},valign:'middle'});
  s.addText('5 of 6 algorithms produce completely indistinguishable scores.',{x:0.6,y:4.7,w:8.8,h:0.3,fontSize:11,fontFace:FONT,color:C.accent4,bold:true,italic:true});
  ft(s);sn(s,9,T);

  // 10: Gate Bypass
  s=ns();at(s,'Gate Bypass Analysis');as(s,'Why None of the Five Gates Suppress Room Resonances');al(s);
  s.addTable([[{text:'Gate',options:{fill:{color:C.accent1},color:C.white,bold:true}},{text:'Status',options:{fill:{color:C.accent1},color:C.white,bold:true,align:'center'}},{text:'Reason Room Modes Bypass',options:{fill:{color:C.accent1},color:C.white,bold:true}}],['IHR Gate',{text:'BYPASSED',options:{color:C.green,bold:true,align:'center'}},'Isolated peaks: harmonicsFound = 0–1, IHR ≈ 0.05'],['PTMR Gate',{text:'BYPASSED',options:{color:C.green,bold:true,align:'center'}},'Sharp peaks: PTMR feedbackScore ≈ 0.7–0.9 (above threshold)'],['Comb Stability',{text:'BYPASSED',options:{color:C.green,bold:true,align:'center'}},'Stationary peaks: spacing CV ≈ 0 (below threshold)'],['Formant Gate',{text:'BYPASSED',options:{color:C.green,bold:true,align:'center'}},'Single isolated peak, not in vocal formant pattern'],['Chromatic Gate',{text:'BYPASSED',options:{color:C.green,bold:true,align:'center'}},'Room mode freqs ≠ 12-TET semitone grid'],[{text:'Room Mode Gates',options:{color:C.accent2,bold:true}},{text:'DISABLED',options:{color:C.accent2,bold:true,align:'center'}},{text:'roomPreset = "none" (default) → entire block skipped',options:{color:C.accent2}}]],{x:0.3,y:1.5,w:9.4,colW:[1.6,1.2,5.6],border:{pt:0.5,color:C.border},color:C.text,fontSize:11,fontFace:FONT,rowH:[0.35,0.42,0.42,0.42,0.42,0.42,0.42],fill:{color:C.bgCard},valign:'middle'});
  s.addText('Room modes pass through the entire detection pipeline without any suppression.',{x:0.6,y:4.7,w:8.8,h:0.3,fontSize:12,fontFace:FONT,color:C.accent4,bold:true});
  ft(s);sn(s,10,T);

  // 11: EQ Output
  s=ns();at(s,'EQ Advisory Output');as(s,'What the System Produces — Room Correction Filter Specs');al(s);
  const ad=[{f:'127 Hz',n:'B2',q:'12.4',d:'-3.8 dB',sv:'MODERATE',c:C.accent2},{f:'247 Hz',n:'B3',q:'8.3',d:'-4.2 dB',sv:'MODERATE',c:C.accent2},{f:'315 Hz',n:'D#4',q:'15.1',d:'-2.6 dB',sv:'LOW',c:C.accent1},{f:'502 Hz',n:'B4',q:'6.7',d:'-5.1 dB',sv:'HIGH',c:C.accent4}];
  let ay=1.5;
  for(const a of ad){s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:0.6,y:ay,w:4.2,h:0.7,fill:{color:C.bgCard},rectRadius:0.08,line:{color:a.c,width:1.5}});s.addText([{text:`${a.f} (${a.n})`,options:{fontSize:14,bold:true,color:C.white}},{text:`   Q: ${a.q}   Cut: ${a.d}`,options:{fontSize:11,color:C.text}},{text:`   ${a.sv}`,options:{fontSize:9,bold:true,color:a.c}}],{x:0.8,y:ay+0.05,w:3.8,h:0.6,valign:'middle'});ay+=0.8;}
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:5.2,y:1.5,w:4.4,h:3.5,fill:{color:C.bgCode},rectRadius:0.1});
  s.addText([{text:'Each advisory card IS a room\ncorrection filter specification:\n\n',options:{fontSize:13,color:C.white,bold:true}},{text:'Frequency → room mode freq\n',options:{fontSize:12,color:C.text}},{text:'Q factor → resonance width\n',options:{fontSize:12,color:C.text}},{text:'Cut depth → MINDS + ERB scaling\n\n',options:{fontSize:12,color:C.text}},{text:'ERB(f) = 24.7·(4.37f/1000 + 1)\n',options:{fontSize:10,fontFace:FONT_MONO,color:C.accent1}},{text:'×0.7 (<500Hz)  ×1.0  ×1.2 (>2kHz)',options:{fontSize:10,fontFace:FONT_MONO,color:C.accent1}}],{x:5.4,y:1.6,w:4.0,h:3.3,valign:'top',lineSpacingMultiple:1.2});
  ft(s);sn(s,11,T);

  // 12: Prior Art
  s=ns();at(s,'Prior Art Comparison');as(s,'KTR Room Analysis vs. Existing Tools');al(s);
  s.addTable([[{text:'Feature',options:{fill:{color:C.accent1},color:C.white,bold:true}},{text:'KTR',options:{fill:{color:C.accent2},color:C.white,bold:true,align:'center'}},{text:'Smaart v8',options:{fill:{color:C.accent1},color:C.white,bold:true,align:'center'}},{text:'REW',options:{fill:{color:C.accent1},color:C.white,bold:true,align:'center'}},{text:'Dirac Live',options:{fill:{color:C.accent1},color:C.white,bold:true,align:'center'}}],['Test signal',{text:'No',options:{color:C.green,bold:true}},'Pink noise','Swept sine','Swept sine'],['Cal. mic',{text:'No',options:{color:C.green,bold:true}},'Required','Required','Required'],['Real-time',{text:'Yes (50fps)',options:{color:C.green,bold:true}},'Yes','No','No'],['Audience OK',{text:'Yes',options:{color:C.green,bold:true}},'Difficult','No','No'],['Setup time',{text:'Zero',options:{color:C.green,bold:true}},'15–30 min','10–20 min','15–30 min'],['Output','PEQ recs','Xfer func','IR + EQ','Room corr.'],['Cost',{text:'Free',options:{color:C.green,bold:true}},'~$800','Free','~$400']],{x:0.3,y:1.5,w:9.4,colW:[1.4,1.8,1.5,1.5,1.5],border:{pt:0.5,color:C.border},color:C.text,fontSize:10,fontFace:FONT,rowH:[0.35,0.38,0.38,0.38,0.38,0.38,0.38,0.38],fill:{color:C.bgCard},valign:'middle'});
  s.addText('Trade-off: No phase response measurement (magnitude-only analysis)',{x:0.6,y:4.75,w:8.8,h:0.3,fontSize:10,fontFace:FONT,color:C.textMuted,italic:true});
  ft(s);sn(s,12,T);

  // 13: Performance
  s=ns();at(s,'Performance Engineering');as(s,'Real-Time Constraints and Optimizations');al(s);
  const pf=[['Sparse MSD Pool','256 slots × 64 frames = 64 KB\n(vs. 1 MB dense). LRU eviction.',C.accent1],['Prefix-Sum O(1)','Float64Array prefix sum for\nO(1) neighborhood averaging.',C.accent3],['EXP_LUT','1001-entry dB→linear table.\nBins 12 dB below threshold skip.',C.accent2],['Transferable Buffers','Zero-copy Float32Array transfer\nbetween threads.',C.accent5],['Worker Backpressure','If worker busy, peak DROPPED.\nReal-time > completeness.',C.accent4],['Canvas 30fps','Sufficient for spectrum viz.\nSaves 50% GPU vs 60fps.',C.accent1]];
  for(let i=0;i<pf.length;i++){const[tt,dd,cc]=pf[i];const cx=0.4+(i%3)*3.1,cy=1.5+Math.floor(i/3)*1.7;s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:cx,y:cy,w:2.9,h:1.5,fill:{color:C.bgCard},rectRadius:0.1,line:{color:cc,width:1.5}});s.addText(tt,{x:cx+0.15,y:cy+0.1,w:2.6,h:0.35,fontSize:11,fontFace:FONT,color:cc,bold:true});s.addText(dd,{x:cx+0.15,y:cy+0.5,w:2.6,h:0.9,fontSize:10,fontFace:FONT_MONO,color:C.text,valign:'top',lineSpacingMultiple:1.3});}
  ft(s);sn(s,13,T);

  // 14: Limitations
  s=ns();at(s,'Known Limitations');as(s,'Honest Assessment');al(s);
  s.addText([{text:'Lower SNR than dedicated measurement signals\n',options:{bold:true,color:C.accent4,fontSize:13}},{text:'Ambient excitation is uncontrolled — frequency coverage depends on sounds present.\n\n',options:{color:C.text,fontSize:12}},{text:'No phase response measurement\n',options:{bold:true,color:C.accent4,fontSize:13}},{text:'Magnitude-only analysis. Cannot perform minimum-phase EQ corrections.\n\n',options:{color:C.text,fontSize:12}},{text:'Cannot distinguish room modes from other persistent peaks\n',options:{bold:true,color:C.accent4,fontSize:13}},{text:'HVAC noise, structural vibration, electrical hum produce similar signatures.\n\n',options:{color:C.text,fontSize:12}},{text:'Uncalibrated microphone\n',options:{bold:true,color:C.accent4,fontSize:13}},{text:'Mitigated by A-weighting + MEMS calibration profiles.\n\n',options:{color:C.text,fontSize:12}},{text:'Sensitivity trade-off\n',options:{bold:true,color:C.accent4,fontSize:13}},{text:'High sensitivity for room analysis increases FP rate for feedback detection.',options:{color:C.text,fontSize:12}}],{x:0.6,y:1.5,w:8.8,h:4.0,valign:'top',lineSpacingMultiple:1.1});
  ft(s);sn(s,14,T);

  // 15: Conclusion
  s=ns();s.addImage({path:tbg,x:0,y:0,w:10,h:5.625});
  s.addShape(pptx.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.06,fill:{color:C.accent1}});
  s.addText('Conclusion',{x:0.8,y:0.6,w:8.4,h:0.6,fontSize:28,fontFace:FONT,color:C.accent1,bold:true});
  s.addShape(pptx.shapes.RECTANGLE,{x:0.8,y:1.15,w:2.0,h:0.04,fill:{color:C.accent1}});
  s.addText([{text:'Room resonances and acoustic feedback are spectrally identical.\n',options:{fontSize:16,color:C.white,bold:true}},{text:'A system designed to detect one inherently detects the other.\n\n',options:{fontSize:14,color:C.text}},{text:'This is not an implementation artifact — it is a consequence of the\nSpectral Signature Equivalence Theorem: ',options:{fontSize:13,color:C.text}},{text:'‖S_fb − S_rm‖₂ → 0\n\n',options:{fontSize:14,fontFace:FONT_MONO,color:C.accent2,bold:true}}],{x:0.8,y:1.4,w:8.4,h:2.4,valign:'top',lineSpacingMultiple:1.3});
  const nx=[{n:'1',t:'Formal validation\nvs. Smaart/REW',c:C.accent3},{n:'2',t:'Dedicated Room\nAnalysis mode',c:C.accent1},{n:'3',t:'ML discrimination\n(room vs. feedback)',c:C.accent2},{n:'4',t:'Cross-platform\nvalidation study',c:C.accent5}];
  for(let i=0;i<nx.length;i++){const x=0.8+i*2.25;s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x,y:3.8,w:2.05,h:1.0,fill:{color:C.bgCard},rectRadius:0.08,line:{color:nx[i].c,width:1.5}});s.addText(nx[i].n,{x:x+0.1,y:3.85,w:0.4,h:0.35,fontSize:14,fontFace:FONT,color:nx[i].c,bold:true});s.addText(nx[i].t,{x:x+0.5,y:3.85,w:1.45,h:0.9,fontSize:10,fontFace:FONT,color:C.text,valign:'middle',lineSpacingMultiple:1.3});}
  s.addText('Don Wells  •  Kill The Ring  •  killthering.com  •  March 2026',{x:0.8,y:5.0,w:8.4,h:0.3,fontSize:10,fontFace:FONT,color:C.textDim});
  sn(s,15,T);

  const out=process.argv[2]||'ktr-scientific-pitch-deck.pptx';
  await pptx.writeFile({fileName:out});
  console.log(`Scientific pitch deck: ${out}`);
  console.log(`${T} slides, dark theme, algorithm tables, weight chart, formulas`);
}

build().catch(e=>{console.error(e);process.exit(1);});
