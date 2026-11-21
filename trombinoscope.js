'use strict';
/* Import local du trombinoscope PRONOTE, vérification avant création. */
window.EPSTrombinoscope = (() => {
  const key = name => name.trim().toLocaleLowerCase('fr');
  async function readImage(file) {
    // Sur iPad, certains fichiers issus de Photos/iCloud ne se chargent pas via blob:.
    // Une seconde tentative via data: permet de couvrir davantage de captures.
    const decode = src => new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>image.naturalWidth&&image.naturalHeight?resolve(image):reject(Error('Dimensions invalides'));
      image.onerror=()=>reject(Error('Décodage impossible'));
      image.src=src;
    });
    const url=URL.createObjectURL(file);
    try {return await decode(url);}
    catch(error) {
      try {
        const data=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(reader.result);
          reader.onerror=()=>reject(reader.error);
          reader.readAsDataURL(file);
        });
        return await decode(data);
      } catch(fallbackError) {
        const ext=(file.name||'').split('.').pop().toLowerCase();
        if(ext==='heic'||ext==='heif'||/hei[cf]/i.test(file.type))
          throw Error('Format HEIC non reconnu par Safari. Dans Photos, ouvre le trombinoscope, fais une capture d’écran, puis importe cette capture PNG/JPG.');
        throw Error('Impossible d’ouvrir cette image ('+(file.name||'fichier')+'). Essaie une capture d’écran PNG ou JPG depuis Photos, puis réimporte-la.');
      }
    } finally {URL.revokeObjectURL(url);}
  }
  function crop(image,x,y,w,h) {
    const c=document.createElement('canvas');c.width=96;c.height=116;
    c.getContext('2d').drawImage(image,x,y,w,h,0,0,96,116);
    return c.toDataURL('image/jpeg',.62);
  }
  function cells(image) {
    // La capture PRONOTE fournie possède cinq colonnes, et des photos au-dessus des noms.
    const width=image.width, height=image.height, cols=5;
    const top=height*.04, bottom=height*.985, rowStep=width*.259;
    const rows=Math.min(12,Math.max(1,Math.ceil((bottom-top)/rowStep)));
    const out=[];
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const x=width*(.008+col*.208),y=width*(.063+row*.259);
      const w=width*.135,h=width*.173;
      if(y+h>height)continue;
      out.push({photo:crop(image,x,y,w,h),name:'',col,row});
    }
    return out;
  }
  async function recognize(image, status) {
    if(!window.Tesseract){
      status.textContent='Chargement de la reconnaissance locale…';
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload=resolve;script.onerror=()=>reject(Error('OCR indisponible : vérifie la connexion.'));
        document.head.append(script);
      });
    }
    status.textContent='Lecture des noms sur l’iPad…';
    const worker=await window.Tesseract.createWorker('fra');
    try {
      const result=await worker.recognize(image);
      return result.data?.lines||[];
    } finally {await worker.terminate();}
  }
  async function open(file,onSave) {
    if(!file || !(file.type?.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name||'')))throw Error('Choisis une capture JPG ou PNG.');
    if(file.size>12e6)throw Error('Image trop volumineuse (12 Mo maximum).');
    const image=await readImage(file), tiles=cells(image);
    const overlay=document.createElement('div');
    overlay.className='trombi-overlay';
    overlay.innerHTML='<section class="trombi-dialog"><header><h3>Importer un trombinoscope</h3><button type="button" id="trombiClose">Fermer</button></header><p id="trombiStatus" role="status">Préparation de la capture…</p><p>Vérifie chaque nom et chaque photo avant d’enregistrer. Les noms non reconnus peuvent être saisis manuellement.</p><div id="trombiGrid" class="trombi-grid"></div><footer><button type="button" class="btn btn-primary" id="trombiSave">Enregistrer les élèves vérifiés</button></footer></section>';
    document.body.append(overlay);
    const status=overlay.querySelector('#trombiStatus'), grid=overlay.querySelector('#trombiGrid');
    const close=()=>overlay.remove();overlay.querySelector('#trombiClose').onclick=close;
    function paint(){
      grid.innerHTML=tiles.map((tile,i)=>'<label class="trombi-tile"><img alt="" src="'+tile.photo+'"><input maxlength="120" data-trombi-index="'+i+'" placeholder="Nom Prénom" value="'+tile.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')+'"></label>').join('');
    }
    paint();
    overlay.querySelector('#trombiSave').onclick=()=>{
      const students=[...grid.querySelectorAll('[data-trombi-index]')].map(input=>({name:input.value.trim().replace(/\s+/g,' '),portrait:tiles[Number(input.dataset.trombiIndex)].photo})).filter(x=>x.name);
      if(!students.length){alert('Renseigne au moins un élève.');return;}
      if(new Set(students.map(x=>key(x.name))).size!==students.length){alert('Certains noms sont en double. Corrige-les avant de continuer.');return;}
      if(!confirm('Enregistrer '+students.length+' élèves avec leurs photos ?'))return;
      onSave(students);close();
    };
    try{
      const lines=await recognize(image,status);
      // Les boîtes OCR sont associées à la colonne et à la ligne du texte, sous la photo.
      for(const line of lines){
        const text=(line.text||'').trim();
        const box=line.bbox;
        if(!text||!box)continue;
        const cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;
        const col=Math.round((cx/image.width-.075)/.208);
        const row=Math.round((cy/image.width-.245)/.259);
        const tile=tiles.find(t=>t.col===col&&t.row===row);
        if(tile&&col>=0&&col<5&&row>=0&&cy>image.width*(.215+row*.259)&&cy<image.width*(.325+row*.259)){
          tile.name+=(tile.name?' ':'')+text;
        }
      }
      status.textContent='Reconnaissance terminée. Corrige les noms avant d’enregistrer.';
      paint();
    }catch(e){status.textContent='Reconnaissance indisponible : '+e.message+'. Saisis les noms sous les photos.';}
  }
  return {open};
})();