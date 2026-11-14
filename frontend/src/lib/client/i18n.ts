import type { Lang } from '@/config/app';

/** Interface strings. Risk explanations come from the server in the same language. */
const STRINGS = {
  balance: { en: 'Balance', hi: 'बैलेंस', bn: 'ব্যালেন্স' },
  pay: { en: 'Pay', hi: 'भुगतान', bn: 'পেমেন্ট' },
  request: { en: 'Request', hi: 'पैसे मांगें', bn: 'টাকা চান' },
  check: { en: 'Check a message', hi: 'संदेश जांचें', bn: 'বার্তা যাচাই' },
  requests: { en: 'Requests for you', hi: 'आपके लिए अनुरोध', bn: 'আপনার জন্য অনুরোধ' },
  noRequests: { en: 'No pending requests', hi: 'कोई अनुरोध नहीं', bn: 'কোনো অনুরোধ নেই' },
  history: { en: 'Recent activity', hi: 'हाल की गतिविधि', bn: 'সাম্প্রতিক লেনদেন' },
  noHistory: { en: 'No payments yet', hi: 'अभी कोई भुगतान नहीं', bn: 'এখনও কোনো পেমেন্ট নেই' },
  approve: { en: 'Approve', hi: 'स्वीकार करें', bn: 'অনুমোদন' },
  decline: { en: 'Decline', hi: 'अस्वीकार करें', bn: 'প্রত্যাখ্যান' },
  wantsMoney: { en: 'is asking you to PAY', hi: 'आपसे भुगतान मांग रहा है', bn: 'আপনার কাছে টাকা চাইছে' },
  payTo: { en: 'Pay to UPI ID', hi: 'UPI आईडी पर भुगतान', bn: 'UPI আইডিতে পেমেন্ট' },
  amount: { en: 'Amount (₹)', hi: 'राशि (₹)', bn: 'পরিমাণ (₹)' },
  note: { en: 'Note (optional)', hi: 'नोट (वैकल्पिक)', bn: 'নোট (ঐচ্ছিক)' },
  continue: { en: 'Continue', hi: 'आगे बढ़ें', bn: 'এগিয়ে যান' },
  checking: { en: 'Kavach is checking this payment…', hi: 'कवच इस भुगतान की जांच कर रहा है…', bn: 'কবচ এই পেমেন্ট যাচাই করছে…' },
  enterPin: { en: 'Enter UPI PIN', hi: 'UPI पिन डालें', bn: 'UPI পিন দিন' },
  payNow: { en: 'Pay now', hi: 'अभी भुगतान करें', bn: 'এখন পেমেন্ট করুন' },
  cancel: { en: 'Cancel payment', hi: 'भुगतान रद्द करें', bn: 'পেমেন্ট বাতিল করুন' },
  typeAmount: {
    en: 'To continue, type the amount you are sending',
    hi: 'आगे बढ़ने के लिए भेजी जाने वाली राशि लिखें',
    bn: 'এগোতে, যে পরিমাণ পাঠাচ্ছেন তা লিখুন',
  },
  heldUntil: { en: 'On hold for safety until', hi: 'सुरक्षा के लिए रोका गया, समय', bn: 'নিরাপত্তার জন্য আটকে রাখা হয়েছে, সময়' },
  holdOver: {
    en: 'The cooling period is over. Only continue if you are sure.',
    hi: 'प्रतीक्षा अवधि समाप्त। तभी आगे बढ़ें जब आप पूरी तरह आश्वस्त हों।',
    bn: 'অপেক্ষার সময় শেষ। নিশ্চিত হলে তবেই এগোন।',
  },
  declineRequest: { en: 'Decline this request', hi: 'यह अनुरोध अस्वीकार करें', bn: 'এই অনুরোধ প্রত্যাখ্যান করুন' },
  done: { en: 'Done', hi: 'ठीक है', bn: 'ঠিক আছে' },
  sent: { en: 'Payment successful', hi: 'भुगतान सफल', bn: 'পেমেন্ট সফল' },
  stopped: { en: 'No money was sent', hi: 'कोई पैसा नहीं भेजा गया', bn: 'কোনো টাকা পাঠানো হয়নি' },
  riskScore: { en: 'Risk score', hi: 'जोखिम स्कोर', bn: 'ঝুঁকি স্কোর' },
  why: { en: 'Why', hi: 'क्यों', bn: 'কেন' },
  aiOk: { en: 'AI check: done', hi: 'AI जांच: पूरी', bn: 'AI যাচাই: সম্পন্ন' },
  aiCached: { en: 'AI check: cached', hi: 'AI जांच: कैश्ड', bn: 'AI যাচাই: ক্যাশড' },
  aiOff: { en: 'AI check unavailable — rules only', hi: 'AI जांच उपलब्ध नहीं — केवल नियम', bn: 'AI যাচাই নেই — শুধু নিয়ম' },
  aiExplained: { en: 'Explained by Gemini, checked against the facts', hi: 'Gemini द्वारा समझाया गया, तथ्यों से जांचा गया', bn: 'Gemini ব্যাখ্যা করেছে, তথ্যের সঙ্গে মেলানো' },
  messageHint: {
    en: 'Paste an SMS or WhatsApp message, or attach a screenshot. Kavach tells you what it really asks you to do.',
    hi: 'SMS या WhatsApp संदेश चिपकाएं या स्क्रीनशॉट लगाएं। कवच बताएगा कि यह असल में आपसे क्या करवाना चाहता है।',
    bn: 'SMS বা WhatsApp বার্তা পেস্ট করুন বা স্ক্রিনশট দিন। কবচ জানাবে এটি আসলে আপনাকে কী করতে বলছে।',
  },
  analyse: { en: 'Check message', hi: 'संदेश जांचें', bn: 'বার্তা যাচাই করুন' },
  attach: { en: 'Attach screenshot', hi: 'स्क्रीनशॉट लगाएं', bn: 'স্ক্রিনশট যুক্ত করুন' },
  back: { en: 'Back', hi: 'वापस', bn: 'ফিরে যান' },
  requestFrom: { en: 'Request money from UPI ID', hi: 'इस UPI आईडी से पैसे मांगें', bn: 'এই UPI আইডি থেকে টাকা চান' },
  sendRequest: { en: 'Send request', hi: 'अनुरोध भेजें', bn: 'অনুরোধ পাঠান' },
  requestSent: { en: 'Request sent', hi: 'अनुरोध भेजा गया', bn: 'অনুরোধ পাঠানো হয়েছে' },
  messageAbout: {
    en: 'Did they send you a message about this payment? (optional)',
    hi: 'क्या इस भुगतान के बारे में कोई संदेश आया था? (वैकल्पिक)',
    bn: 'এই পেমেন্ট নিয়ে কোনো বার্তা পেয়েছেন? (ঐচ্ছিক)',
  },
  listen: { en: 'Listen to the reason', hi: 'कारण सुनें', bn: 'কারণ শুনুন' },
  stopListening: { en: 'Stop', hi: 'रोकें', bn: 'থামান' },
  voiceLoading: { en: 'Preparing audio…', hi: 'आवाज़ तैयार हो रही है…', bn: 'অডিও তৈরি হচ্ছে…' },
  voiceIn: { en: 'Read aloud in', hi: 'इस भाषा में सुनें', bn: 'এই ভাষায় শুনুন' },
  txnDetails: { en: 'Transaction', hi: 'लेन-देन', bn: 'লেনদেন' },
  youSent: { en: 'You sent', hi: 'आपने भेजे', bn: 'আপনি পাঠিয়েছেন' },
  youReceived: { en: 'You received', hi: 'आपको मिले', bn: 'আপনি পেয়েছেন' },
  status: { en: 'Status', hi: 'स्थिति', bn: 'অবস্থা' },
  when: { en: 'When', hi: 'कब', bn: 'কখন' },
  downloadPdf: { en: 'Download all transactions with this account (PDF)', hi: 'इस खाते के साथ सभी लेन-देन डाउनलोड करें (PDF)', bn: 'এই অ্যাকাউন্টের সঙ্গে সব লেনদেন ডাউনলোড করুন (PDF)' },
  downloadHint: {
    en: 'Every payment between you and this account, in both directions, with Kavach risk checks. Attach it to a complaint.',
    hi: 'आपके और इस खाते के बीच दोनों तरफ़ के सभी भुगतान, कवच जांच के साथ। इसे शिकायत के साथ लगाएं।',
    bn: 'আপনার ও এই অ্যাকাউন্টের মধ্যে দুই দিকের সব পেমেন্ট, কবচ যাচাই সহ। অভিযোগের সঙ্গে এটি যুক্ত করুন।',
  },
  downloaded: { en: 'PDF downloaded', hi: 'PDF डाउनलोड हो गया', bn: 'PDF ডাউনলোড হয়েছে' },
  report: { en: 'Report this account', hi: 'इस खाते की शिकायत करें', bn: 'এই অ্যাকাউন্টের বিরুদ্ধে অভিযোগ করুন' },
  reportHint: {
    en: 'Official government channels. They open in a new tab; Kavach does not send anything for you.',
    hi: 'आधिकारिक सरकारी माध्यम। ये नए टैब में खुलेंगे; कवच आपकी ओर से कुछ नहीं भेजता।',
    bn: 'সরকারি অফিসিয়াল মাধ্যম। এগুলো নতুন ট্যাবে খুলবে; কবচ আপনার হয়ে কিছু পাঠায় না।',
  },
  reportCybercrime: {
    en: 'You lost money or were targeted by an online financial fraud.',
    hi: 'आपके पैसे गए हैं या आप ऑनलाइन वित्तीय धोखाधड़ी का निशाना बने हैं।',
    bn: 'আপনার টাকা খোয়া গেছে বা আপনি অনলাইন আর্থিক প্রতারণার শিকার হয়েছেন।',
  },
  report1930: {
    en: 'Call right away if money has already left your account.',
    hi: 'अगर पैसे खाते से निकल चुके हैं तो तुरंत कॉल करें।',
    bn: 'অ্যাকাউন্ট থেকে টাকা চলে গেলে এখনই ফোন করুন।',
  },
  reportChakshu: {
    en: 'Report the fraud call, SMS or WhatsApp message itself.',
    hi: 'धोखाधड़ी वाली कॉल, SMS या WhatsApp संदेश की शिकायत करें।',
    bn: 'প্রতারণার কল, SMS বা WhatsApp বার্তার বিরুদ্ধে অভিযোগ করুন।',
  },
  reportRbi: {
    en: 'Complain about how your bank or payment app handled it.',
    hi: 'आपके बैंक या पेमेंट ऐप ने मामला कैसे संभाला, इसकी शिकायत करें।',
    bn: 'আপনার ব্যাংক বা পেমেন্ট অ্যাপ বিষয়টি কীভাবে সামলেছে, তা নিয়ে অভিযোগ করুন।',
  },
  stCompleted: { en: 'Completed', hi: 'पूरा हुआ', bn: 'সম্পন্ন' },
  stOnHold: { en: 'On hold', hi: 'रोका गया', bn: 'আটকে আছে' },
  stPending: { en: 'Pending', hi: 'बाकी', bn: 'অপেক্ষমাণ' },
  stNotCompleted: { en: 'Not completed (failed or cancelled)', hi: 'पूरा नहीं हुआ (विफल या रद्द)', bn: 'সম্পন্ন হয়নি (ব্যর্থ বা বাতিল)' },
  stReversed: { en: 'Reversed', hi: 'वापस किया गया', bn: 'ফেরত দেওয়া হয়েছে' },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang];
}

export const DECISION_TEXT: Record<'allow' | 'warn' | 'hold', Record<Lang, string>> = {
  allow: { en: 'Looks safe', hi: 'सुरक्षित लगता है', bn: 'নিরাপদ মনে হচ্ছে' },
  warn: { en: 'Check before you pay', hi: 'भुगतान से पहले जांचें', bn: 'পেমেন্টের আগে যাচাই করুন' },
  hold: { en: 'Payment stopped', hi: 'भुगतान रोका गया', bn: 'পেমেন্ট থামানো হয়েছে' },
};

export const SCAM_TYPE_TEXT: Record<string, string> = {
  none: 'No scam pattern found',
  refund_collect: 'Fake refund / "approve to receive" request',
  fake_qr: 'Fake QR code "to receive money"',
  kyc_phishing: 'Fake KYC or account-block warning',
  otp_phishing: 'Asks for your PIN or OTP',
  screen_share: 'Screen-sharing / remote-access app',
  lottery_prize: 'Fake prize or lottery',
  investment: 'Fake investment, job or task scheme',
  impersonation: 'Impersonation',
  other: 'Suspicious message',
};
