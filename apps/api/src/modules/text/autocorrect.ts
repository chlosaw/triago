/**
 * Offline spelling and punctuation fixes, used when no language model is
 * configured or the model call fails. Deliberately conservative: it only
 * fixes things that are almost always mistakes.
 */

// "wont", "ill", "lets" and "id" are real words, so they are not on this list.

const TYPOS: Record<string, string> = {
  teh: 'the',
  hte: 'the',
  adn: 'and',
  taht: 'that',
  recieve: 'receive',
  recieved: 'received',
  reciept: 'receipt',
  beleive: 'believe',
  acheive: 'achieve',
  wierd: 'weird',
  thier: 'their',
  alot: 'a lot',
  definately: 'definitely',
  definatly: 'definitely',
  seperate: 'separate',
  seperately: 'separately',
  occured: 'occurred',
  occurence: 'occurrence',
  untill: 'until',
  wich: 'which',
  becuase: 'because',
  becasue: 'because',
  adress: 'address',
  accomodate: 'accommodate',
  begining: 'beginning',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  goverment: 'government',
  enviroment: 'environment',
  existance: 'existence',
  sucess: 'success',
  succesful: 'successful',
  successfull: 'successful',
  neccessary: 'necessary',
  necesary: 'necessary',
  embarass: 'embarrass',
  refered: 'referred',
  occassion: 'occasion',
  persistant: 'persistent',
  independant: 'independent',
  acount: 'account',
  accesible: 'accessible',
  availible: 'available',
  avaliable: 'available',
  calender: 'calendar',
  comming: 'coming',
  commited: 'committed',
  completly: 'completely',
  concious: 'conscious',
  enviroments: 'environments',
  finaly: 'finally',
  foward: 'forward',
  freind: 'friend',
  garantee: 'guarantee',
  immediatly: 'immediately',
  libary: 'library',
  maintainance: 'maintenance',
  noticable: 'noticeable',
  payed: 'paid',
  posible: 'possible',
  prefered: 'preferred',
  probaly: 'probably',
  realy: 'really',
  recomend: 'recommend',
  responce: 'response',
  shoud: 'should',
  similiar: 'similar',
  speach: 'speech',
  suprise: 'surprise',
  truely: 'truly',
  usefull: 'useful',
  wether: 'whether',
  whith: 'with',
  woudl: 'would',
  dont: "don't",
  cant: "can't",
  doesnt: "doesn't",
  didnt: "didn't",
  isnt: "isn't",
  wasnt: "wasn't",
  arent: "aren't",
  werent: "weren't",
  couldnt: "couldn't",
  shouldnt: "shouldn't",
  wouldnt: "wouldn't",
  havent: "haven't",
  hasnt: "hasn't",
  im: "I'm",
  ive: "I've",
  youre: "you're",
  theyre: "they're",
  thats: "that's",
  whats: "what's"
};

/** Fixes the capitalisation of a replacement to match the word it replaces. */
function matchCase(original: string, fix: string): string {
  if (fix.startsWith("I'")) return fix; // I'm, I've are always capitalised
  if (original.length > 1 && original === original.toUpperCase()) return fix.toUpperCase();
  if (original[0] !== original[0]!.toLowerCase()) return fix[0]!.toUpperCase() + fix.slice(1);
  return fix;
}

/** URLs, email addresses and `code` spans are copied through untouched. */
const PROTECTED = /(\bhttps?:\/\/\S+|\bwww\.\S+|[\w.+-]+@[\w-]+\.[\w.-]+|`[^`]*`)/g;

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATION = /\b(?:e\.g|i\.e|etc|vs|approx|Mr|Mrs|Ms|Dr|No)\.$/i;

function correctProse(input: string): string {
  let text = input;

  // Spelling: whole words only, case preserved.
  text = text.replace(/\b[A-Za-z]+\b/g, (word) => {
    const fix = TYPOS[word.toLowerCase()];
    return fix ? matchCase(word, fix) : word;
  });
  // A lone "i" is "I" (but not the "i" in "i.e.").
  text = text.replace(/(^|[^\p{L}\p{N}_'.-])i(?![\p{L}\p{N}_'-]|\.\p{L})/gu, '$1I');
  // Doubled words: "the the" -> "the". Numbers are left alone.
  text = text.replace(/\b([A-Za-z]+)\s+\1\b/gi, '$1');
  // No space before , . ! ? ; : and one space after , ; ! ? before a letter.
  text = text.replace(/[ \t]+([,.!?;:])/g, '$1');
  text = text.replace(/([,;!?])(?=[A-Za-z])/g, '$1 ');
  // Runs of spaces become one; trailing spaces go.
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '');
  return text;
}

/** Capitalises the first letter of the text and of every sentence. */
function capitaliseSentences(text: string): string {
  return text.replace(
    /(^\s*|[.!?]["')\]]?\s+|\n\s*)([a-z])/g,
    (match, lead: string, letter: string, offset: number) => {
      const before = text.slice(Math.max(0, offset - 10), offset + lead.trimEnd().length);
      if (lead.trim().startsWith('.') && ABBREVIATION.test(before)) return match;
      return lead + letter.toUpperCase();
    }
  );
}

export function correctWithRules(input: string): string {
  // Replace protected spans with placeholders, fix the prose around them, then put them back.
  const kept: string[] = [];
  const masked = input.replace(PROTECTED, (span) => `\uE000${kept.push(span) - 1}\uE000`);
  const fixed = capitaliseSentences(correctProse(masked));
  return fixed.replace(/\uE000(\d+)\uE000/g, (_m, index: string) => kept[Number(index)]!).trim();
}
