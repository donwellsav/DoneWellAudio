const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');

// Investor deck: clean, premium, confident. Navy + gold + white.
const C = {
  bg:'0B1426', bgCard:'121E36', bgLight:'1A2944',
  navy:'0B1426', gold:'D4A843', goldDark:'B8912E', goldLight:'F0D080',
  white:'FFFFFF', offWhite:'F4F6F8', text:'E0E6ED', textMuted:'8894A5',
  green:'27AE60', red:'E74C3C', blue:'3498DB', teal:'16A085',
  border:'2A3A5C', accent:'D4A843',
};
const FONT='Arial', FONT_MONO='Courier New';
const T=14; // total slides

const pptx=new pptxgen();
pptx.layout='LAYOUT_16x9'; pptx.author='Don Wells';
pptx.title='DoneWell Audio — Investor Presentation';

async function grad(fn,c1,c2,w=1920,h=1080){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#${c1}"/><stop offset="100%" style="stop-color:#${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(fn); return fn;
}

function ns(){const s=pptx.addSlide();s.background={fill:C.bg};return s;}
function sn(s,n){s.addText(`${n} / ${T}`,{x:8.5,y:5.2,w:1.2,h:0.3,fontSize:9,fontFace:FONT,color:C.textMuted,align:'right'});}
function ft(s){s.addText('DoneWell Audio  •  Confidential',{x:0.3,y:5.2,w:4,h:0.3,fontSize:9,fontFace:FONT,color:C.textMuted});}
function at(s,t){s.addText(t,{x:0.6,y:0.3,w:8.8,h:0.7,fontSize:28,fontFace:FONT,color:C.gold,bold:true});}
function as(s,t){s.addText(t,{x:0.6,y:0.95,w:8.8,h:0.4,fontSize:14,fontFace:FONT,color:C.textMuted,italic:true});}
function al(s){s.addShape(pptx.shapes.RECTANGLE,{x:0.6,y:1.25,w:2.0,h:0.04,fill:{color:C.gold}});}
function card(s,x,y,w,h,opts={}){s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x,y,w,h,fill:{color:opts.fill||C.bgCard},rectRadius:0.1,line:{color:opts.border||C.border,width:1}});}
function metric(s,x,y,val,label,color=C.gold){
  card(s,x,y,2.0,1.2);
  s.addText(val,{x,y:y+0.1,w:2.0,h:0.6,fontSize:28,fontFace:FONT,color,bold:true,align:'center'});
  s.addText(label,{x,y:y+0.65,w:2.0,h:0.4,fontSize:11,fontFace:FONT,color:C.textMuted,align:'center'});
}

async function build(){
  const sd=path.join(__dirname,'investor-slides');
  if(!fs.existsSync(sd))fs.mkdirSync(sd,{recursive:true});
  const tbg=await grad(path.join(sd,'title-bg.png'),'0B1426','162040');
  const gbg=await grad(path.join(sd,'gold-accent.png'),'1A2944','0F1B30');

  // ── SLIDE 1: Title ──
  let s=ns(); s.addImage({path:tbg,x:0,y:0,w:10,h:5.625});
  s.addShape(pptx.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.06,fill:{color:C.gold}});
  s.addShape(pptx.shapes.RECTANGLE,{x:0,y:5.565,w:10,h:0.06,fill:{color:C.gold}});
  s.addText('KILL THE RING',{x:0.8,y:1.2,w:8.4,h:0.7,fontSize:42,fontFace:FONT,color:C.white,bold:true});
  s.addText('Real-Time Acoustic Intelligence\nfor Live Sound',{x:0.8,y:2.0,w:8.4,h:1.0,fontSize:22,fontFace:FONT,color:C.gold,lineSpacingMultiple:1.3});
  s.addShape(pptx.shapes.RECTANGLE,{x:0.8,y:3.2,w:3.0,h:0.03,fill:{color:C.gold}});
  s.addText('Investor Presentation  •  March 2026  •  Confidential',{x:0.8,y:3.5,w:8.4,h:0.3,fontSize:13,fontFace:FONT,color:C.textMuted});
  s.addText('Don Wells, Founder & CTO',{x:0.8,y:4.0,w:8.4,h:0.3,fontSize:13,fontFace:FONT,color:C.text});
  s.addText('donewellaudio.com',{x:0.8,y:4.4,w:8.4,h:0.3,fontSize:12,fontFace:FONT,color:C.gold});
  sn(s,1);

  // ── SLIDE 2: The Problem ──
  s=ns();at(s,'The Problem');as(s,'A $4.2B Industry Running on Guesswork');al(s);
  // Pain points
  const pains=[
    ['$800+','A professional room analyzer (Smaart) costs $800+ and requires a calibrated measurement microphone ($200+)'],
    ['30 min','Every venue requires 15-30 minutes of setup: pink noise, swept sine, audience-free measurement'],
    ['Zero','The number of tools that can analyze a room in real-time during a live performance with audience present'],
    ['50%','Of live sound engineers at small-to-mid venues have never performed a formal room analysis'],
  ];
  pains.forEach((p,i)=>{
    const yy=1.5+i*0.95;
    card(s,0.6,yy,1.6,0.8);
    s.addText(p[0],{x:0.6,y:yy+0.1,w:1.6,h:0.5,fontSize:24,fontFace:FONT,color:C.gold,bold:true,align:'center'});
    s.addText(p[1],{x:2.4,y:yy+0.05,w:7.0,h:0.75,fontSize:12,fontFace:FONT,color:C.text,valign:'middle'});
  });
  ft(s);sn(s,2);

  // ── SLIDE 3: The Solution ──
  s=ns();at(s,'The Solution');as(s,'Real-Time Room Analysis — Zero Setup, Zero Cost');al(s);
  card(s,0.6,1.5,8.8,1.2,{border:C.gold});
  s.addText('DoneWell Audio transforms any smartphone or laptop into a professional room analyzer.',{x:0.9,y:1.6,w:8.2,h:0.4,fontSize:16,fontFace:FONT,color:C.white,bold:true});
  s.addText('Open a browser. Grant mic access. Get real-time room correction EQ in seconds — during a live show, with audience present.',{x:0.9,y:2.1,w:8.2,h:0.4,fontSize:13,fontFace:FONT,color:C.text});

  const feats=[
    ['No Test Signal','Uses ambient sound as excitation source — music, speech, crowd noise'],
    ['No Calibration Mic','Works with any microphone, including smartphone MEMS mics'],
    ['Real-Time','50fps analysis, continuous room tracking during performance'],
    ['Browser-Based','PWA — no app install, works on any device with a browser'],
    ['Free','Zero cost to end users — professional-grade analysis, zero barrier'],
  ];
  feats.forEach((f,i)=>{
    const yy=3.0+i*0.48;
    s.addText('●',{x:0.8,y:yy,w:0.3,h:0.4,fontSize:12,color:C.gold});
    s.addText(f[0],{x:1.1,y:yy,w:2.0,h:0.4,fontSize:13,fontFace:FONT,color:C.gold,bold:true,valign:'middle'});
    s.addText(f[1],{x:3.1,y:yy,w:6.3,h:0.4,fontSize:12,fontFace:FONT,color:C.text,valign:'middle'});
  });
  ft(s);sn(s,3);

  // ── SLIDE 4: How It Works (simplified) ──
  s=ns();at(s,'How It Works');as(s,'Six Algorithms That Accidentally Discovered Something New');al(s);

  // Simple pipeline
  const steps=[
    {label:'LISTEN',desc:'Microphone captures ambient audio\n8192-point FFT at 50fps',color:C.blue},
    {label:'DETECT',desc:'6 algorithms + ML model\nanalyze every spectral peak',color:C.teal},
    {label:'CLASSIFY',desc:'Content-adaptive fusion\nwith false-positive gates',color:C.gold},
    {label:'ADVISE',desc:'Parametric EQ recommendations\nwith pitch translation',color:C.green},
  ];
  steps.forEach((st,i)=>{
    const xx=0.6+i*2.35;
    card(s,xx,1.5,2.1,1.8);
    s.addShape(pptx.shapes.RECTANGLE,{x:xx,y:1.5,w:2.1,h:0.06,fill:{color:st.color},rectRadius:0});
    s.addText(st.label,{x:xx,y:1.65,w:2.1,h:0.5,fontSize:16,fontFace:FONT,color:st.color,bold:true,align:'center'});
    s.addText(st.desc,{x:xx+0.15,y:2.2,w:1.8,h:0.9,fontSize:11,fontFace:FONT,color:C.text,align:'center',lineSpacingMultiple:1.3});
    if(i<3) s.addText('→',{x:xx+2.1,y:2.0,w:0.25,h:0.5,fontSize:20,color:C.textMuted,align:'center',valign:'middle'});
  });

  // The discovery box
  card(s,0.6,3.6,8.8,1.5,{border:C.gold,fill:'1A2230'});
  s.addText('THE DISCOVERY',{x:0.9,y:3.7,w:2.0,h:0.4,fontSize:14,fontFace:FONT,color:C.gold,bold:true});
  s.addText('Room resonances and acoustic feedback produce identical spectral signatures — persistent, narrow, high-Q peaks with stable magnitude and phase. Our 6-algorithm system detects room resonances as "feedback" because to a spectrum analyzer, they are physically indistinguishable.',{x:0.9,y:4.1,w:8.2,h:0.8,fontSize:12,fontFace:FONT,color:C.text,lineSpacingMultiple:1.3});
  s.addText('‖S_fb − S_rm‖₂ → 0',{x:7.0,y:3.65,w:2.5,h:0.4,fontSize:14,fontFace:FONT_MONO,color:C.gold,align:'right',bold:true});
  ft(s);sn(s,4);

  // ── SLIDE 5: Market Opportunity ──
  s=ns();at(s,'Market Opportunity');as(s,'Live Sound + Pro Audio + Architectural Acoustics');al(s);

  metric(s,0.6,1.5,'$4.2B','Live Sound Market\n(Verified Market Research 2024)',C.gold);
  metric(s,2.8,1.5,'2.1M','Live Sound Engineers\nWorldwide (est.)',C.gold);
  metric(s,5.0,1.5,'500K+','Houses of Worship\nU.S. alone (NCCS 2020)',C.gold);
  metric(s,7.2,1.5,'$1.8B','Room Acoustics Market\n(Grand View Research 2024)',C.gold);

  // TAM/SAM/SOM
  card(s,0.6,3.0,8.8,2.2);
  s.addText('Market Segmentation',{x:0.9,y:3.1,w:4.0,h:0.4,fontSize:16,fontFace:FONT,color:C.gold,bold:true});

  const mkt=[
    {label:'TAM',val:'$6.0B',desc:'Total live sound + pro audio + room acoustics market',color:C.gold,w:8.0},
    {label:'SAM',val:'$1.2B',desc:'Sound engineers + venues who would use browser-based tools',color:C.blue,w:5.5},
    {label:'SOM',val:'$120M',desc:'Realistically capturable in 5 years (freemium + pro tiers)',color:C.green,w:3.0},
  ];
  mkt.forEach((m,i)=>{
    const yy=3.6+i*0.55;
    // Use a dimmed version of the color for the fill (no alpha in PptxGenJS)
    const dimFill={[C.gold]:'2A2318',[C.blue]:'14202E',[C.green]:'122A1E'}[m.color]||C.bgCard;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE,{x:1.0,y:yy,w:m.w,h:0.4,fill:{color:dimFill},rectRadius:0.05,line:{color:m.color,width:1}});
    s.addText(m.label,{x:1.1,y:yy,w:0.6,h:0.4,fontSize:12,fontFace:FONT,color:m.color,bold:true,valign:'middle'});
    s.addText(m.val,{x:1.7,y:yy,w:1.0,h:0.4,fontSize:13,fontFace:FONT,color:C.white,bold:true,valign:'middle'});
    s.addText(m.desc,{x:2.8,y:yy,w:5.5,h:0.4,fontSize:11,fontFace:FONT,color:C.text,valign:'middle'});
  });
  ft(s);sn(s,5);

  // ── SLIDE 6: Competitive Landscape ──
  s=ns();at(s,'Competitive Landscape');as(s,'No Existing Tool Does What DWA Does');al(s);

  const compRows=[
    [{text:'Feature',options:{bold:true,color:C.gold,fontSize:11}},{text:'DWA',options:{bold:true,color:C.gold,fontSize:11}},{text:'Smaart\n($800)',options:{bold:true,color:C.textMuted,fontSize:10}},{text:'REW\n(Free)',options:{bold:true,color:C.textMuted,fontSize:10}},{text:'Dirac Live\n($400)',options:{bold:true,color:C.textMuted,fontSize:10}}],
    [{text:'Test signal required'},{text:'No',options:{color:C.green,bold:true}},{text:'Yes'},{text:'Yes'},{text:'Yes'}],
    [{text:'Calibrated mic required'},{text:'No',options:{color:C.green,bold:true}},{text:'Yes'},{text:'Yes'},{text:'Yes'}],
    [{text:'Real-time analysis'},{text:'50fps',options:{color:C.green,bold:true}},{text:'Yes'},{text:'No'},{text:'No'}],
    [{text:'Works with audience'},{text:'Yes',options:{color:C.green,bold:true}},{text:'Difficult'},{text:'No'},{text:'No'}],
    [{text:'Setup time'},{text:'0 sec',options:{color:C.green,bold:true}},{text:'15-30 min'},{text:'10-20 min'},{text:'15-30 min'}],
    [{text:'EQ recommendations'},{text:'Auto',options:{color:C.green,bold:true}},{text:'Manual'},{text:'Manual'},{text:'Auto'}],
    [{text:'Cost'},{text:'Free',options:{color:C.green,bold:true}},{text:'$800+'},{text:'Free'},{text:'$400+'}],
    [{text:'Platform'},{text:'Any browser',options:{color:C.green,bold:true}},{text:'Win/Mac'},{text:'Win/Mac/Lin'},{text:'Win/Mac'}],
  ];
  compRows.forEach(r=>r.forEach(c=>{if(!c.options)c.options={};c.options.fontSize=c.options.fontSize||10;c.options.color=c.options.color||C.text;c.options.fontFace=FONT;}));
  s.addTable(compRows,{x:0.6,y:1.5,w:8.8,colW:[2.2,1.3,1.3,1.3,1.3],rowH:0.4,border:{type:'solid',pt:0.5,color:C.border},
    fill:{color:C.bgCard},autoPage:false});
  s.addText('DWA is the only tool that performs real-time room analysis with zero setup.',{x:0.6,y:5.0,w:8.8,h:0.3,fontSize:12,fontFace:FONT,color:C.gold,bold:true,italic:true});
  ft(s);sn(s,6);

  // ── SLIDE 7: Product Modes ──
  s=ns();at(s,'Product Offering');as(s,'Two Breakthrough Capabilities in One Tool');al(s);

  // Feedback detection card
  card(s,0.6,1.5,4.2,3.5,{border:C.blue});
  s.addShape(pptx.shapes.RECTANGLE,{x:0.6,y:1.5,w:4.2,h:0.06,fill:{color:C.blue}});
  s.addText('MODE 1: FEEDBACK DETECTION',{x:0.8,y:1.65,w:3.8,h:0.4,fontSize:14,fontFace:FONT,color:C.blue,bold:true});
  s.addText('Core Product — Live Since 2025',{x:0.8,y:2.05,w:3.8,h:0.3,fontSize:11,fontFace:FONT,color:C.textMuted,italic:true});
  const fb_items=['Identifies feedback frequencies in real-time','6-algorithm fusion with ML meta-model','Content-adaptive: speech, music, worship, outdoor','EQ recommendations with pitch translation','8 venue-specific mode presets','Zero false positives on sustained vowels,\nAuto-Tune, flangers (gate system)'];
  fb_items.forEach((item,i)=>{
    s.addText('▸ '+item,{x:0.9,y:2.5+i*0.38,w:3.6,h:0.35,fontSize:11,fontFace:FONT,color:C.text,lineSpacingMultiple:1.1});
  });

  // Room analysis card
  card(s,5.2,1.5,4.2,3.5,{border:C.gold});
  s.addShape(pptx.shapes.RECTANGLE,{x:5.2,y:1.5,w:4.2,h:0.06,fill:{color:C.gold}});
  s.addText('MODE 2: ROOM ANALYSIS',{x:5.4,y:1.65,w:3.8,h:0.4,fontSize:14,fontFace:FONT,color:C.gold,bold:true});
  s.addText('Emergent Discovery — March 2026',{x:5.4,y:2.05,w:3.8,h:0.3,fontSize:11,fontFace:FONT,color:C.textMuted,italic:true});
  const ra_items=['Identifies room resonance modes in real-time','Uses ambient sound — no test signal needed','Works with any mic (even smartphone MEMS)','Generates room correction EQ profiles','Continuous monitoring during live events','Replaces $800+ measurement systems\nwith a browser tab'];
  ra_items.forEach((item,i)=>{
    s.addText('▸ '+item,{x:5.5,y:2.5+i*0.38,w:3.6,h:0.35,fontSize:11,fontFace:FONT,color:C.text,lineSpacingMultiple:1.1});
  });
  ft(s);sn(s,7);

  // ── SLIDE 8: Technology Moat ──
  s=ns();at(s,'Technology Moat');as(s,'Deep Technical IP Protecting a First-Mover Advantage');al(s);

  const moats=[
    {title:'6-Algorithm Fusion',desc:'MSD, Phase Coherence, Spectral Flatness, Comb Pattern, IHR (novel), PTMR (novel). Two algorithms are entirely novel inventions.',icon:'🔬',color:C.blue},
    {title:'Content-Adaptive Weights',desc:'4 weight profiles auto-selected by real-time content classification (centroid, rolloff, flatness, crest factor).',icon:'🎛️',color:C.teal},
    {title:'ML Meta-Model',desc:'Neural network (929 params) trained on labeled user feedback. Evolves continuously — gets smarter with every user.',icon:'🧠',color:C.gold},
    {title:'Provisional Patent Filed',desc:'USPTO provisional application filed March 20, 2026. 16 claims covering fusion architecture + room analysis discovery.',icon:'📄',color:C.green},
    {title:'5 Multiplicative Gates',desc:'IHR, PTMR, Comb Stability, Formant, Chromatic gates eliminate false positives. Competitors would need years to replicate.',icon:'🚪',color:'E74C3C'},
    {title:'AES Paper Submitted',desc:'Peer-reviewed publication establishing scientific priority. Formal academic validation of the discovery.',icon:'📚',color:'9B59B6'},
  ];
  moats.forEach((m,i)=>{
    const col=i%3, row=Math.floor(i/3);
    const xx=0.6+col*3.1, yy=1.5+row*1.9;
    card(s,xx,yy,2.9,1.7);
    s.addShape(pptx.shapes.RECTANGLE,{x:xx,y:yy,w:2.9,h:0.06,fill:{color:m.color}});
    s.addText(m.title,{x:xx+0.15,y:yy+0.15,w:2.6,h:0.35,fontSize:13,fontFace:FONT,color:m.color,bold:true});
    s.addText(m.desc,{x:xx+0.15,y:yy+0.55,w:2.6,h:1.0,fontSize:10,fontFace:FONT,color:C.text,lineSpacingMultiple:1.25});
  });
  ft(s);sn(s,8);

  // ── SLIDE 9: Traction & Metrics ──
  s=ns();at(s,'Traction & Status');as(s,'Built, Deployed, and Generating Data');al(s);

  metric(s,0.6,1.5,'LIVE','Production Status\ndonewellaudio.com',C.green);
  metric(s,2.8,1.5,'37K+','Lines of Code\n161 TypeScript files',C.gold);
  metric(s,5.0,1.5,'488','Automated Tests\n483 passing, 28 suites',C.blue);
  metric(s,7.2,1.5,'v0.159','Current Version\nShipping weekly',C.teal);

  card(s,0.6,3.0,4.2,2.1);
  s.addText('Technical Milestones',{x:0.9,y:3.1,w:3.6,h:0.35,fontSize:14,fontFace:FONT,color:C.gold,bold:true});
  const miles=['6-algorithm fusion engine (complete)','ML inference pipeline with ONNX (complete)','PWA with offline support (complete)','Ring-out wizard for calibration (complete)','Anonymous data collection pipeline (complete)','Room analysis discovery (March 2026)','US provisional patent filed (March 2026)'];
  miles.forEach((m,i)=>{
    s.addText('✓ '+m,{x:0.9,y:3.5+i*0.22,w:3.8,h:0.22,fontSize:10,fontFace:FONT,color:C.green});
  });

  card(s,5.2,3.0,4.2,2.1);
  s.addText('Next Milestones',{x:5.5,y:3.1,w:3.6,h:0.35,fontSize:14,fontFace:FONT,color:C.gold,bold:true});
  const next=['Dedicated Room Analysis mode in app','Formal validation vs Smaart/REW','AES paper publication','User growth + community building','Pro tier with advanced features','Mobile app (React Native)','Partnerships with audio equipment OEMs'];
  next.forEach((m,i)=>{
    s.addText('○ '+m,{x:5.5,y:3.5+i*0.22,w:3.8,h:0.22,fontSize:10,fontFace:FONT,color:C.textMuted});
  });
  ft(s);sn(s,9);

  // ── SLIDE 10: Business Model ──
  s=ns();at(s,'Business Model');as(s,'Freemium with Pro Tiers and Enterprise');al(s);

  const tiers=[
    {name:'FREE',price:'$0',color:C.textMuted,features:['Real-time feedback detection','Basic room analysis mode','8 venue mode presets','Browser-based PWA','Community support']},
    {name:'PRO',price:'$9.99/mo',color:C.gold,features:['Everything in Free','Advanced room analysis','Export: PDF/CSV/JSON','Custom sensitivity profiles','Session history & analytics','Priority support']},
    {name:'ENTERPRISE',price:'Custom',color:C.blue,features:['Everything in Pro','Multi-venue management','Team accounts & roles','API access','White-label option','Dedicated support & training']},
  ];
  tiers.forEach((t,i)=>{
    const xx=0.6+i*3.15;
    card(s,xx,1.5,2.9,3.5,{border:t.name==='PRO'?C.gold:C.border});
    if(t.name==='PRO') s.addShape(pptx.shapes.RECTANGLE,{x:xx,y:1.5,w:2.9,h:0.06,fill:{color:C.gold}});
    s.addText(t.name,{x:xx,y:1.65,w:2.9,h:0.35,fontSize:16,fontFace:FONT,color:t.color,bold:true,align:'center'});
    s.addText(t.price,{x:xx,y:2.0,w:2.9,h:0.45,fontSize:22,fontFace:FONT,color:C.white,bold:true,align:'center'});
    s.addShape(pptx.shapes.RECTANGLE,{x:xx+0.3,y:2.5,w:2.3,h:0.02,fill:{color:C.border}});
    t.features.forEach((f,j)=>{
      s.addText('✓ '+f,{x:xx+0.2,y:2.65+j*0.3,w:2.5,h:0.28,fontSize:10,fontFace:FONT,color:C.text});
    });
  });
  ft(s);sn(s,10);

  // ── SLIDE 11: Target Customers ──
  s=ns();at(s,'Target Customers');as(s,'From Small Venues to Global Tours');al(s);

  const segs=[
    {name:'Houses of Worship',size:'500K+ in U.S.',desc:'Weekly services, volunteer sound teams, limited budgets. Need simple tools that work without expertise.',color:C.gold},
    {name:'Small-to-Mid Venues',size:'100K+ globally',desc:'Bars, clubs, conference rooms, theaters. No dedicated sound engineer on staff.',color:C.blue},
    {name:'Touring Engineers',size:'50K+ globally',desc:'Different venue every night. Need instant room analysis without setup time.',color:C.teal},
    {name:'Architectural Acoustics',size:'$1.8B market',desc:'Acoustic consultants, architects, studio designers. Room correction is core workflow.',color:C.green},
    {name:'Education',size:'3K+ programs',desc:'Audio engineering schools, music technology programs. Teaching tool for room acoustics.',color:'9B59B6'},
    {name:'Pro Audio OEMs',size:'Partnership',desc:'Mixer/speaker manufacturers. White-label DWA into hardware products.',color:'E74C3C'},
  ];
  segs.forEach((seg,i)=>{
    const col=i%2, row=Math.floor(i/2);
    const xx=0.6+col*4.7, yy=1.5+row*1.3;
    card(s,xx,yy,4.4,1.15);
    s.addText(seg.name,{x:xx+0.15,y:yy+0.08,w:2.5,h:0.3,fontSize:13,fontFace:FONT,color:seg.color,bold:true});
    s.addText(seg.size,{x:xx+2.8,y:yy+0.08,w:1.4,h:0.3,fontSize:11,fontFace:FONT,color:C.textMuted,align:'right'});
    s.addText(seg.desc,{x:xx+0.15,y:yy+0.4,w:4.1,h:0.65,fontSize:10,fontFace:FONT,color:C.text,lineSpacingMultiple:1.2});
  });
  ft(s);sn(s,11);

  // ── SLIDE 12: Go-to-Market ──
  s=ns();at(s,'Go-to-Market Strategy');as(s,'Community-Led Growth with Strategic Partnerships');al(s);

  const phases=[
    {phase:'PHASE 1: FOUNDATION',time:'Now — Q3 2026',items:['Free PWA live at donewellaudio.com','Organic growth via audio engineering communities','Reddit (r/livesound, r/audioengineering), forums, YouTube','AES paper publication for credibility','Build user base for ML training data pipeline'],color:C.gold},
    {phase:'PHASE 2: MONETIZATION',time:'Q4 2026 — Q2 2027',items:['Launch Pro tier ($9.99/mo)','Room analysis as premium feature','PDF/CSV export, session history','Partnership outreach to pro audio brands','Targeted marketing to houses of worship'],color:C.blue},
    {phase:'PHASE 3: SCALE',time:'Q3 2027+',items:['Enterprise tier with API access','White-label partnerships with OEMs','Mobile app (React Native)','International expansion','Hardware integration (DSP processors)'],color:C.green},
  ];
  phases.forEach((p,i)=>{
    const xx=0.6+i*3.15;
    card(s,xx,1.5,2.9,3.6);
    s.addShape(pptx.shapes.RECTANGLE,{x:xx,y:1.5,w:2.9,h:0.06,fill:{color:p.color}});
    s.addText(p.phase,{x:xx+0.1,y:1.65,w:2.7,h:0.35,fontSize:12,fontFace:FONT,color:p.color,bold:true});
    s.addText(p.time,{x:xx+0.1,y:2.0,w:2.7,h:0.25,fontSize:10,fontFace:FONT,color:C.textMuted,italic:true});
    p.items.forEach((item,j)=>{
      s.addText('▸ '+item,{x:xx+0.1,y:2.4+j*0.42,w:2.7,h:0.4,fontSize:10,fontFace:FONT,color:C.text,lineSpacingMultiple:1.15});
    });
  });
  ft(s);sn(s,12);

  // ── SLIDE 13: Team & Vision ──
  s=ns();at(s,'Team & Vision');as(s,'Built by an Engineer, For Engineers');al(s);

  card(s,0.6,1.5,4.2,2.0,{border:C.gold});
  s.addText('Don Wells',{x:0.9,y:1.6,w:3.6,h:0.4,fontSize:18,fontFace:FONT,color:C.white,bold:true});
  s.addText('Founder & CTO',{x:0.9,y:2.0,w:3.6,h:0.3,fontSize:13,fontFace:FONT,color:C.gold});
  s.addText('Full-stack engineer with deep expertise in real-time audio signal processing, Web Audio API, and machine learning. Built the entire DWA system — 37K+ lines of TypeScript, 488 tests, 6 novel detection algorithms.',{x:0.9,y:2.4,w:3.6,h:0.9,fontSize:10,fontFace:FONT,color:C.text,lineSpacingMultiple:1.3});

  card(s,5.2,1.5,4.2,2.0,{border:C.blue});
  s.addText('Vision',{x:5.5,y:1.6,w:3.6,h:0.4,fontSize:18,fontFace:FONT,color:C.white,bold:true});
  s.addText('Democratize Professional Audio',{x:5.5,y:2.0,w:3.6,h:0.3,fontSize:13,fontFace:FONT,color:C.blue});
  s.addText('Every live sound engineer — from the volunteer at a church to the touring professional — deserves access to the same analysis tools the top 1% use. DWA makes that possible with zero cost, zero setup, and zero expertise required.',{x:5.5,y:2.4,w:3.6,h:0.9,fontSize:10,fontFace:FONT,color:C.text,lineSpacingMultiple:1.3});

  // IP Portfolio
  card(s,0.6,3.8,8.8,1.3);
  s.addText('Intellectual Property Portfolio',{x:0.9,y:3.9,w:4.0,h:0.3,fontSize:14,fontFace:FONT,color:C.gold,bold:true});
  const ips=[
    ['US Provisional Patent','Filed March 20, 2026 — 16 claims covering 6-algorithm fusion + room analysis','Filed'],
    ['AES Convention Paper','Peer-reviewed academic paper establishing scientific priority','Submitted'],
    ['Technical Whitepaper','Comprehensive technical documentation for partners and investors','Complete'],
    ['Trade Secrets','5 multiplicative gate algorithms, content-adaptive weight profiles, ML training pipeline','Protected'],
  ];
  ips.forEach((ip,i)=>{
    const yy=4.25+i*0.2;
    s.addText(ip[0],{x:0.9,y:yy,w:2.2,h:0.2,fontSize:10,fontFace:FONT,color:C.gold,bold:true});
    s.addText(ip[1],{x:3.2,y:yy,w:5.0,h:0.2,fontSize:9,fontFace:FONT,color:C.text});
    const stColor=ip[2]==='Filed'?C.green:ip[2]==='Submitted'?C.blue:C.teal;
    s.addText(ip[2],{x:8.3,y:yy,w:1.0,h:0.2,fontSize:9,fontFace:FONT,color:stColor,bold:true,align:'right'});
  });
  ft(s);sn(s,13);

  // ── SLIDE 14: The Ask / Closing ──
  s=ns(); s.addImage({path:tbg,x:0,y:0,w:10,h:5.625});
  s.addShape(pptx.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.06,fill:{color:C.gold}});
  s.addShape(pptx.shapes.RECTANGLE,{x:0,y:5.565,w:10,h:0.06,fill:{color:C.gold}});

  s.addText('KILL THE RING',{x:0.8,y:0.8,w:8.4,h:0.6,fontSize:36,fontFace:FONT,color:C.white,bold:true});
  s.addText('The world\'s first real-time room analyzer\nthat requires no test signal, no calibration mic,\nand no setup — powered by a patented\n6-algorithm acoustic intelligence engine.',{x:0.8,y:1.5,w:8.4,h:1.4,fontSize:16,fontFace:FONT,color:C.text,lineSpacingMultiple:1.4});

  s.addShape(pptx.shapes.RECTANGLE,{x:0.8,y:3.1,w:3.0,h:0.03,fill:{color:C.gold}});

  s.addText('Don Wells  •  don@donewellaudio.com  •  donewellaudio.com',{x:0.8,y:3.4,w:8.4,h:0.35,fontSize:14,fontFace:FONT,color:C.gold});
  s.addText('US Provisional Patent Filed  •  AES Paper Submitted  •  Live at donewellaudio.com',{x:0.8,y:3.9,w:8.4,h:0.3,fontSize:12,fontFace:FONT,color:C.textMuted});
  s.addText('Thank you.',{x:0.8,y:4.5,w:8.4,h:0.5,fontSize:24,fontFace:FONT,color:C.white,bold:true});
  sn(s,14);

  // ── WRITE FILE ──
  const out=process.argv[2]||'investor-deck.pptx';
  await pptx.writeFile({fileName:out});
  console.log(`Investor pitch deck: ${out}`);
  console.log(`${T} slides, navy+gold theme, market/business focus`);
}

build().catch(e=>{console.error(e);process.exit(1);});
