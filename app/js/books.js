// 66권 정보: [한글 이름, 약어, 영문 이름, 장 수]
const BOOKS = [
  ["창세기","창","Genesis",50],["출애굽기","출","Exodus",40],["레위기","레","Leviticus",27],
  ["민수기","민","Numbers",36],["신명기","신","Deuteronomy",34],["여호수아","수","Joshua",24],
  ["사사기","삿","Judges",21],["룻기","룻","Ruth",4],["사무엘상","삼상","1 Samuel",31],
  ["사무엘하","삼하","2 Samuel",24],["열왕기상","왕상","1 Kings",22],["열왕기하","왕하","2 Kings",25],
  ["역대상","대상","1 Chronicles",29],["역대하","대하","2 Chronicles",36],["에스라","스","Ezra",10],
  ["느헤미야","느","Nehemiah",13],["에스더","에","Esther",10],["욥기","욥","Job",42],
  ["시편","시","Psalms",150],["잠언","잠","Proverbs",31],["전도서","전","Ecclesiastes",12],
  ["아가","아","Song of Solomon",8],["이사야","사","Isaiah",66],["예레미야","렘","Jeremiah",52],
  ["예레미야애가","애","Lamentations",5],["에스겔","겔","Ezekiel",48],["다니엘","단","Daniel",12],
  ["호세아","호","Hosea",14],["요엘","욜","Joel",3],["아모스","암","Amos",9],
  ["오바댜","옵","Obadiah",1],["요나","욘","Jonah",4],["미가","미","Micah",7],
  ["나훔","나","Nahum",3],["하박국","합","Habakkuk",3],["스바냐","습","Zephaniah",3],
  ["학개","학","Haggai",2],["스가랴","슥","Zechariah",14],["말라기","말","Malachi",4],
  ["마태복음","마","Matthew",28],["마가복음","막","Mark",16],["누가복음","눅","Luke",24],
  ["요한복음","요","John",21],["사도행전","행","Acts",28],["로마서","롬","Romans",16],
  ["고린도전서","고전","1 Corinthians",16],["고린도후서","고후","2 Corinthians",13],["갈라디아서","갈","Galatians",6],
  ["에베소서","엡","Ephesians",6],["빌립보서","빌","Philippians",4],["골로새서","골","Colossians",4],
  ["데살로니가전서","살전","1 Thessalonians",5],["데살로니가후서","살후","2 Thessalonians",3],["디모데전서","딤전","1 Timothy",6],
  ["디모데후서","딤후","2 Timothy",4],["디도서","딛","Titus",3],["빌레몬서","몬","Philemon",1],
  ["히브리서","히","Hebrews",13],["야고보서","약","James",5],["베드로전서","벧전","1 Peter",5],
  ["베드로후서","벧후","2 Peter",3],["요한일서","요일","1 John",5],["요한이서","요이","2 John",1],
  ["요한삼서","요삼","3 John",1],["유다서","유","Jude",1],["요한계시록","계","Revelation",22]
];
const TOTAL_CHAPTERS = BOOKS.reduce((s, b) => s + b[3], 0); // 1189

// "요 3:16", "요한복음 3장 16절", "창1", "롬 8:28-30" 같은 참조를 해석
function parseRef(str) {
  const s = str.trim().replace(/\s+/g, " ");
  const m = s.match(/^(\d?\s?[가-힣A-Za-z.]+)\s*(\d+)?\s*(?:[:장편]\s*(\d+)?)?\s*(?:[-~]\s*(\d+))?\s*절?$/);
  if (!m) return null;
  const name = m[1].replace(/\s/g, "").toLowerCase();
  let idx = BOOKS.findIndex(b => b[0] === name || b[1] === name || b[2].replace(/\s/g, "").toLowerCase() === name);
  if (idx < 0) idx = BOOKS.findIndex(b => b[0].startsWith(name) || b[2].replace(/\s/g, "").toLowerCase().startsWith(name));
  if (idx < 0) return null;
  const ch = Math.min(parseInt(m[2] || "1", 10), BOOKS[idx][3]);
  return { book: idx, chapter: ch, verse: m[3] ? parseInt(m[3], 10) : null, verseEnd: m[4] ? parseInt(m[4], 10) : null };
}

function refLabel(book, chapter, verse) {
  return `${BOOKS[book][1]} ${chapter}${verse ? ":" + verse : ""}`;
}
