const fs = require('fs');
const path = require('path');
const {Document,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,AlignmentType,
  BorderStyle,Header,Footer,PageNumber,NumberFormat,Packer,
  ShadingType,HeadingLevel,TabStopPosition,TabStopType,
  convertInchesToTwip,PageOrientation} = require('docx');

// One-page executive brief: tight, scannable, premium feel
// Color scheme: navy headers, gold accents, clean body
const NAVY='0B1426', GOLD='C49A2A', DARK='1A1A1A', GRAY='555555', LIGHT_GRAY='999999', WHITE='FFFFFF';
const FONT_BODY='Calibri', FONT_HEAD='Calibri';

function h(text,opts={}){
  return new Paragraph({spacing:{before:opts.before||120,after:opts.after||40},children:[
    new TextRun({text,bold:true,font:FONT_HEAD,size:opts.size||22,color:opts.color||NAVY})
  ],border:opts.underline?{bottom:{style:BorderStyle.SINGLE,size:1,color:GOLD,space:2}}:undefined});
}

function body(text,opts={}){
  return new Paragraph({spacing:{before:opts.before||0,after:opts.after||40},alignment:opts.align,children:[
    new TextRun({text,font:FONT_BODY,size:opts.size||18,color:opts.color||DARK,...opts})
  ]});
}

function bullet(text,opts={}){
  const runs=[];
  if(opts.boldPrefix){
    const idx=text.indexOf(':');
    if(idx>-1){
      runs.push(new TextRun({text:text.substring(0,idx+1),font:FONT_BODY,size:18,color:DARK,bold:true}));
      runs.push(new TextRun({text:text.substring(idx+1),font:FONT_BODY,size:18,color:DARK}));
    } else {
      runs.push(new TextRun({text,font:FONT_BODY,size:18,color:DARK}));
    }
  } else {
    runs.push(new TextRun({text,font:FONT_BODY,size:18,color:DARK}));
  }
  return new Paragraph({spacing:{before:0,after:20},bullet:{level:0},children:runs});
}

function spacer(h=40){
  return new Paragraph({spacing:{before:0,after:0},children:[new TextRun({text:'',size:h/5})]});
}

function hrule(){
  return new Paragraph({spacing:{before:60,after:60},border:{bottom:{style:BorderStyle.SINGLE,size:1,color:GOLD,space:2}},children:[new TextRun({text:'',size:2})]});
}

// Two-column helper via table
function twoCols(left,right,widths=[4800,4800]){
  return new Table({
    width:{size:9600,type:WidthType.DXA},
    rows:[new TableRow({children:[
      new TableCell({width:{size:widths[0],type:WidthType.DXA},borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},children:left}),
      new TableCell({width:{size:widths[1],type:WidthType.DXA},borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},children:right}),
    ]})],
  });
}

async function build(){
  const sections=[];

  // ── HEADER: Title block ──
  const titleChildren=[
    new Paragraph({spacing:{before:0,after:0},alignment:AlignmentType.LEFT,children:[
      new TextRun({text:'KILL THE RING',font:FONT_HEAD,size:36,bold:true,color:NAVY}),
      new TextRun({text:'  |  ',font:FONT_HEAD,size:28,color:LIGHT_GRAY}),
      new TextRun({text:'Executive Brief',font:FONT_HEAD,size:28,color:GOLD}),
    ]}),
    new Paragraph({spacing:{before:40,after:0},children:[
      new TextRun({text:'Emergent Room Acoustic Resonance Analysis via Multi-Algorithm Feedback Detection',font:FONT_BODY,size:18,italic:true,color:GRAY}),
    ]}),
    new Paragraph({spacing:{before:20,after:0},children:[
      new TextRun({text:'Don Wells  •  donewellaudio.com  •  March 2026  •  Confidential',font:FONT_BODY,size:16,color:LIGHT_GRAY}),
    ]}),
    hrule(),
  ];

  // ── EXECUTIVE SUMMARY ──
  titleChildren.push(h('EXECUTIVE SUMMARY',{size:20,before:40,after:20,underline:true}));
  titleChildren.push(body('DoneWell Audio (DWA) is a browser-based, real-time acoustic feedback detection system that employs six fused detection algorithms and a neural network meta-model. In March 2026, we discovered that when operated at elevated sensitivity, the system detects room acoustic resonance modes — effectively performing real-time room analysis without test signals, calibrated microphones, or any setup. This emergent capability replaces $800+ professional measurement systems with a free browser tab.',{after:20}));

  // ── KEY DISCOVERY (callout box) ──
  titleChildren.push(new Table({
    width:{size:9600,type:WidthType.DXA},
    rows:[new TableRow({children:[
      new TableCell({
        width:{size:9600,type:WidthType.DXA},
        shading:{fill:'F5F0E6',type:ShadingType.CLEAR},
        borders:{
          top:{style:BorderStyle.SINGLE,size:2,color:GOLD},
          bottom:{style:BorderStyle.SINGLE,size:2,color:GOLD},
          left:{style:BorderStyle.SINGLE,size:6,color:GOLD},
          right:{style:BorderStyle.SINGLE,size:2,color:GOLD},
        },
        margins:{top:80,bottom:80,left:120,right:120},
        children:[
          new Paragraph({spacing:{before:0,after:20},children:[
            new TextRun({text:'KEY DISCOVERY: ',font:FONT_HEAD,size:18,bold:true,color:GOLD}),
            new TextRun({text:'Room resonances and acoustic feedback produce identical spectral signatures — persistent, narrow, high-Q peaks with stable magnitude and phase. All six algorithms unanimously classify room modes as "feedback" because the signals are physically indistinguishable. ',font:FONT_BODY,size:18,color:DARK}),
            new TextRun({text:'‖S',font:'Cambria Math',size:18,color:NAVY}),
            new TextRun({text:'fb',font:'Cambria Math',size:14,color:NAVY,subScript:true}),
            new TextRun({text:' − S',font:'Cambria Math',size:18,color:NAVY}),
            new TextRun({text:'rm',font:'Cambria Math',size:14,color:NAVY,subScript:true}),
            new TextRun({text:'‖₂ → 0',font:'Cambria Math',size:18,color:NAVY}),
          ]}),
        ],
      }),
    ]})],
  }));

  titleChildren.push(spacer(20));

  // ── TWO COLUMNS: Technology + Market ──
  const leftCol=[
    h('TECHNOLOGY',{size:18,before:0,after:20,underline:true}),
    bullet('Six detection algorithms: MSD, Phase Coherence, Spectral Flatness, Comb Pattern, IHR (novel), PTMR (novel)',{boldPrefix:true}),
    bullet('Content-adaptive weighted fusion: 4 profiles auto-selected by real-time content classification',{boldPrefix:true}),
    bullet('Five multiplicative gates: eliminate false positives from vowels, Auto-Tune, flangers, instruments',{boldPrefix:true}),
    bullet('ML meta-model: 929-parameter MLP trained on user feedback, continuously improving',{boldPrefix:true}),
    bullet('Performance: 50fps analysis, zero-copy transferable buffers, 64KB sparse MSD pool',{boldPrefix:true}),
    spacer(10),
    h('COMPETITIVE ADVANTAGE',{size:18,before:0,after:20,underline:true}),
    bullet('Only tool offering real-time room analysis with zero setup'),
    bullet('Works with any microphone (including smartphone MEMS)'),
    bullet('Free, browser-based PWA — no install required'),
    bullet('Provisional patent filed (16 claims, March 2026)'),
    bullet('AES convention paper submitted'),
  ];

  const rightCol=[
    h('MARKET',{size:18,before:0,after:20,underline:true}),
    bullet('TAM: $6.0B (live sound + pro audio + room acoustics)',{boldPrefix:true}),
    bullet('SAM: $1.2B (engineers + venues using browser tools)',{boldPrefix:true}),
    bullet('SOM: $120M (capturable in 5 years, freemium model)',{boldPrefix:true}),
    spacer(10),
    h('TARGET SEGMENTS',{size:18,before:0,after:20,underline:true}),
    bullet('Houses of worship: 500K+ in U.S., volunteer sound teams',{boldPrefix:true}),
    bullet('Small/mid venues: 100K+ globally, no dedicated engineer',{boldPrefix:true}),
    bullet('Touring engineers: different venue nightly, need instant analysis',{boldPrefix:true}),
    bullet('Architectural acoustics: $1.8B market, room correction is core workflow',{boldPrefix:true}),
    spacer(10),
    h('BUSINESS MODEL',{size:18,before:0,after:20,underline:true}),
    bullet('Free: feedback detection + basic room analysis'),
    bullet('Pro ($9.99/mo): advanced analysis, export, history'),
    bullet('Enterprise: API, multi-venue, white-label'),
  ];

  titleChildren.push(twoCols(leftCol,rightCol));

  // ── BOTTOM: Status bar ──
  titleChildren.push(hrule());
  titleChildren.push(new Paragraph({spacing:{before:20,after:0},children:[
    new TextRun({text:'STATUS: ',font:FONT_HEAD,size:16,bold:true,color:NAVY}),
    new TextRun({text:'Live at donewellaudio.com  •  v0.159  •  37K+ LOC  •  488 tests  •  161 files  •  US Patent Pending  •  AES Paper Submitted',font:FONT_BODY,size:16,color:GRAY}),
  ]}));

  const doc=new Document({
    styles:{default:{document:{run:{font:FONT_BODY,size:18}}}},
    sections:[{
      properties:{
        page:{
          size:{width:convertInchesToTwip(8.5),height:convertInchesToTwip(11)},
          margin:{top:convertInchesToTwip(0.5),bottom:convertInchesToTwip(0.4),left:convertInchesToTwip(0.6),right:convertInchesToTwip(0.6)},
        },
      },
      children:titleChildren,
    }],
  });

  const out=process.argv[2]||'exec-brief.docx';
  const buf=await Packer.toBuffer(doc);
  fs.writeFileSync(out,buf);
  console.log(`Executive brief: ${out}`);
  console.log('One-page format, two-column layout, navy+gold theme');
}

build().catch(e=>{console.error(e);process.exit(1);});
