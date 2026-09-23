/* 1924 — administrator vakansiyasi: vaziyatlar va baholash.
   Bu fayl ishga.html va admin.html uchun umumiy. Savollarni faqat shu yerda oʻzgartiring. */
window.ZK = (function(){
  "use strict";

  var DIMS = {
    s: "Stressga chidamlilik",
    d: "Intizom",
    c: "Muloqot va sotuv",
    p: "Oʻsish salohiyati"
  };

  var Q = [
    {id:"s1",dim:"s",sarlavha:"Baqirayotgan ota-ona",
     text:"Ota-ona telefonda baqiryapti: «Bolam hech narsa oʻrganmadi, pulimni qaytaring!»",
     opts:[
      {k:"A",v:4,t:"Tinch ohangda oxirigacha eshitaman, muammoni yozib olaman va bugun rahbar bilan birga javob berishimni aytaman"},
      {k:"B",v:2,t:"Shartnoma boʻyicha pul qaytarilmasligini tushuntiraman"},
      {k:"C",v:1,t:"Rahbarning raqamini beraman — oʻzi hal qilsin"},
      {k:"D",v:1,t:"Uzr soʻrab, keyingi oyga chegirma vaʼda qilaman",f:"Rahbarsiz chegirma vaʼda qiladi"}]},
    {id:"s2",dim:"s",sarlavha:"Bir vaqtda uchta ish",
     text:"Bir vaqtning oʻzida: 3 ta yangi ariza keldi, ofisga ota-ona kirib keldi va telefon jiringlayapti.",
     opts:[
      {k:"A",v:4,t:"Ota-onani oʻtqazib, 2 daqiqa kutishini soʻrayman, telefonga javob berib qisqa yozib olaman, keyin arizalarga navbat bilan qoʻngʻiroq qilaman"},
      {k:"B",v:2,t:"Avval hamma arizalarga qoʻngʻiroq qilaman — 5 daqiqa qoidasi"},
      {k:"C",v:2,t:"Faqat ofisdagi ota-ona bilan shugʻullanaman, qolgani kutadi"},
      {k:"D",v:1,t:"Rahbarga yozib, nima qilishni soʻrayman"}]},
    {id:"s3",dim:"s",sarlavha:"Narxdagi oʻz xatosi",
     text:"Kun oxirida bilib qoldingiz: bitta mijozga notoʻgʻri narx aytgansiz.",
     opts:[
      {k:"A",v:4,t:"Oʻzim qoʻngʻiroq qilib xatoni tan olaman, toʻgʻri narxni aytaman va rahbarga ham xabar beraman"},
      {k:"B",v:1,t:"Hech kimga aytmayman — balki sezmas",f:"Oʻz xatosini yashiradi"},
      {k:"C",v:2,t:"Rahbarga aytaman, u hal qilsin"},
      {k:"D",v:2,t:"Mijoz ertaga kelsa, oʻshanda tushuntiraman"}]},
    {id:"d1",dim:"d",sarlavha:"19:55 dagi ariza",
     text:"Ish 20:00 da tugaydi. Soat 19:55 da yangi ariza keldi.",
     opts:[
      {k:"A",v:4,t:"Hozir qoʻngʻiroq qilaman — 5 daqiqa qoidasi"},
      {k:"B",v:3,t:"Xabar yozib qoʻyaman va ertaga ertalab birinchi boʻlib qoʻngʻiroq qilaman"},
      {k:"C",v:2,t:"Ertaga ertalab qoʻngʻiroq qilaman"},
      {k:"D",v:1,t:"Ertaga kimdir koʻrib qolar"}]},
    {id:"d2",dim:"d",sarlavha:"Toʻlov skrinshoti",
     text:"Mijoz toʻlov skrinshotini yubordi: «Toʻladim, shartnomani yuboring».",
     opts:[
      {k:"A",v:4,t:"Kabinetda pul tushganini tekshiraman, keyin shartnomani yuboraman"},
      {k:"B",v:1,t:"Skrinshot bor — darhol shartnomani yuboraman",f:"Toʻlov skrinshotiga ishonadi"},
      {k:"C",v:2,t:"Rahbardan nima qilishni soʻrayman"},
      {k:"D",v:2,t:"Mijozdan chek raqamini soʻrab, shartnomani yuboraman"}]},
    {id:"d3",dim:"d",sarlavha:"Kechikish",
     text:"Ertalab transport kechikdi — ishga 20 daqiqa kechikyapsiz.",
     opts:[
      {k:"A",v:4,t:"Hoziroq rahbarga yozib, qachon yetib kelishimni aytaman"},
      {k:"B",v:2,t:"Yetib kelganimda tushuntiraman"},
      {k:"C",v:1,t:"Hech narsa demayman — 20 daqiqa katta gap emas",f:"Kechikishini oldindan aytmaydi"},
      {k:"D",v:1,t:"Bugun umuman kelmayman, ertaga tushuntiraman"}]},
    {id:"c1",dim:"c",sarlavha:"«Qimmat, oʻylab koʻraman»",
     text:"Ota-ona: «Qimmat ekan, oʻylab koʻraman».",
     opts:[
      {k:"A",v:4,t:"«Albatta. Sizni narxi oʻylantiryaptimi yoki vaqti?» deb soʻrab, javobiga qarab tushuntiraman"},
      {k:"B",v:1,t:"«Mayli, qaror qilsangiz yozing» deb xayrlashaman"},
      {k:"C",v:1,t:"Oʻzim chegirma taklif qilaman",f:"Rahbarsiz chegirma vaʼda qiladi"},
      {k:"D",v:2,t:"Kursning barcha afzalliklarini yana bir bor aytib beraman"}]},
    {id:"c2",dim:"c",sarlavha:"Daromad kafolati",
     text:"Qiz soʻrayapti: «Kursdan keyin pul ishlashim aniqmi?»",
     opts:[
      {k:"A",v:4,t:"«Kafolat bermaymiz. Kursda amaliyot va portfolio boʻladi — batafsil uchrashuvda tushuntiramiz»"},
      {k:"B",v:1,t:"«Ha, albatta pul ishlaysiz»",f:"Daromad kafolatini vaʼda qiladi"},
      {k:"C",v:2,t:"«Bilmayman, rahbardan soʻrang»"},
      {k:"D",v:2,t:"«Hammasi oʻzingizga bogʻliq»"}]},
    {id:"c3",dim:"c",sarlavha:"Rus tilidagi savol",note:"Bu vaziyat rus tilida",ru:true,
     text:"Вам пишут: «Здравствуйте! Видела рекламу. Сколько стоит курс и где вы находитесь?»",
     opts:[
      {k:"A",v:4,t:"Отвечаю по-русски: называю цену, адрес и приглашаю на встречу"},
      {k:"B",v:1,t:"Отвечаю по-узбекски — мне так проще",f:"Rus tilidan qochadi"},
      {k:"C",v:2,t:"Отправляю ссылку без объяснений"},
      {k:"D",v:1,t:"Прошу написать по-узбекски",f:"Rus tilidan qochadi"}]},
    {id:"p1",dim:"p",sarlavha:"Rahbardan 5 ta xato",
     text:"Birinchi haftada rahbar qoʻngʻiroqlaringizni tinglab, 5 ta xato topdi.",
     opts:[
      {k:"A",v:4,t:"Xatolarni yozib olaman, keyingi qoʻngʻiroqlarda tuzataman va ertasi kuni natijani koʻrsataman"},
      {k:"B",v:2,t:"Xafa boʻlaman, lekin ishlashda davom etaman"},
      {k:"C",v:2,t:"Nega shunday qilganimni tushuntirishga harakat qilaman"},
      {k:"D",v:1,t:"Bu ish menga mos emas, degan xulosaga kelaman"}]},
    {id:"p2",dim:"p",sarlavha:"Boʻsh vaqt",
     text:"Bugun arizalar kam, boʻsh vaqt paydo boʻldi.",
     opts:[
      {k:"A",v:4,t:"«Oʻylab koʻraman» deganlarga qayta qoʻngʻiroq qilaman"},
      {k:"B",v:3,t:"Skriptni takrorlab, qoʻngʻiroqlarimni yaxshilayman"},
      {k:"C",v:2,t:"Ofis va hujjatlarni tartibga keltiraman"},
      {k:"D",v:1,t:"Telefonda dam olaman"}]},
    {id:"p3",dim:"p",sarlavha:"Kamerada 30 soniya",
     text:"Sizga kamerada 30 soniya loyiha haqida gapirishni taklif qilishdi.",
     opts:[
      {k:"A",v:4,t:"Tayyorlanaman va bir necha dubl olaman — sinab koʻraman"},
      {k:"B",v:3,t:"Darhol, tayyorgarliksiz gapiraman"},
      {k:"C",v:2,t:"Agar matnni yozib berishsa, gapiraman"},
      {k:"D",v:1,t:"Uyalaman, boshqa kishi qilsin"}]}
  ];

  function verdict(foiz){
    if(foiz >= 85) return "Kuchli nomzod — birinchi boʻlib chaqiring";
    if(foiz >= 70) return "Yaxshi — suhbatda zaif tomonini tekshiring";
    if(foiz >= 55) return "Oʻrtacha — yaxshirogʻi boʻlmasa";
    return "Mos emas";
  }

  /* javoblar: "ABDC..." (12 harf, savollar tartibida), test_sek / tanishuv_sek — soniyalar */
  function score(javoblar, testSek, tanishuvSek){
    var sums = {s:0,d:0,c:0,p:0}, jami = 0, flags = [], rows = [];
    for(var i=0;i<Q.length;i++){
      var q = Q[i], ch = (javoblar || "").charAt(i), o = null;
      for(var j=0;j<q.opts.length;j++){ if(q.opts[j].k === ch){ o = q.opts[j]; } }
      if(!o){ rows.push({sarlavha:q.sarlavha, javob:"—", ball:0}); continue; }
      sums[q.dim] += o.v; jami += o.v;
      if(o.f && flags.indexOf(o.f) === -1) flags.push(o.f);
      rows.push({sarlavha:q.sarlavha, javob:o.t, ball:o.v});
    }
    if(typeof testSek === "number" && testSek < 90) flags.push("12 ta vaziyatga " + testSek + " soniyada javob berdi — oʻqimagan boʻlishi mumkin");
    if(typeof tanishuvSek === "number" && tanishuvSek < 40) flags.push("HR suhbatini " + tanishuvSek + " soniyada oʻtdi — oʻqimagan boʻlishi mumkin");
    var dims = {};
    Object.keys(DIMS).forEach(function(k){ dims[k] = {nom:DIMS[k], ball:sums[k], foiz:Math.round(sums[k]/12*100)}; });
    var foiz = Math.round(jami/(Q.length*4)*100);
    return {jami:jami, foiz:foiz, xulosa:verdict(foiz), dims:dims, flags:flags, rows:rows};
  }

  return {DIMS:DIMS, Q:Q, score:score, verdict:verdict};
})();
