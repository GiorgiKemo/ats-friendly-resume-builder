// Resume language support shared by the preview, PDF and DOCX renderers:
// localized section headings, dates and "Present", text direction and
// script-aware upper-casing for the 20 supported languages.

export const RESUME_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', dir: 'ltr' },
  { code: 'es', name: 'Spanish', native: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'French', native: 'Français', dir: 'ltr' },
  { code: 'de', name: 'German', native: 'Deutsch', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', native: 'Português', dir: 'ltr' },
  { code: 'it', name: 'Italian', native: 'Italiano', dir: 'ltr' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', dir: 'ltr' },
  { code: 'pl', name: 'Polish', native: 'Polski', dir: 'ltr' },
  { code: 'ru', name: 'Russian', native: 'Русский', dir: 'ltr' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', dir: 'ltr' },
  { code: 'ka', name: 'Georgian', native: 'ქართული', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', dir: 'ltr' },
  { code: 'zh', name: 'Chinese (Simplified)', native: '简体中文', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', native: '日本語', dir: 'ltr' },
  { code: 'ko', name: 'Korean', native: '한국어', dir: 'ltr' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', dir: 'ltr' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', dir: 'ltr' },
];

export const RESUME_LANGUAGE_CODES = RESUME_LANGUAGES.map((language) => language.code);

// Section headings per language. English keeps each design's own wording.
const LABELS = {
  es: ['Perfil profesional', 'Experiencia laboral', 'Educación', 'Habilidades', 'Certificaciones', 'Proyectos', 'Información adicional', 'Actualidad'],
  fr: ['Profil professionnel', 'Expérience professionnelle', 'Formation', 'Compétences', 'Certifications', 'Projets', 'Informations complémentaires', "Aujourd'hui"],
  de: ['Profil', 'Berufserfahrung', 'Ausbildung', 'Kenntnisse', 'Zertifizierungen', 'Projekte', 'Weitere Informationen', 'Heute'],
  pt: ['Resumo profissional', 'Experiência profissional', 'Formação acadêmica', 'Competências', 'Certificações', 'Projetos', 'Informações adicionais', 'Atual'],
  it: ['Profilo professionale', 'Esperienza professionale', 'Istruzione', 'Competenze', 'Certificazioni', 'Progetti', 'Informazioni aggiuntive', 'Presente'],
  nl: ['Profiel', 'Werkervaring', 'Opleiding', 'Vaardigheden', 'Certificeringen', 'Projecten', 'Aanvullende informatie', 'Heden'],
  pl: ['Podsumowanie zawodowe', 'Doświadczenie zawodowe', 'Wykształcenie', 'Umiejętności', 'Certyfikaty', 'Projekty', 'Dodatkowe informacje', 'Obecnie'],
  ru: ['Профиль', 'Опыт работы', 'Образование', 'Навыки', 'Сертификаты', 'Проекты', 'Дополнительная информация', 'Настоящее время'],
  uk: ['Профіль', 'Досвід роботи', 'Освіта', 'Навички', 'Сертифікати', 'Проєкти', 'Додаткова інформація', 'Дотепер'],
  ka: ['პროფესიული პროფილი', 'სამუშაო გამოცდილება', 'განათლება', 'უნარები', 'სერტიფიკატები', 'პროექტები', 'დამატებითი ინფორმაცია', 'დღემდე'],
  tr: ['Profesyonel Özet', 'İş Deneyimi', 'Eğitim', 'Yetenekler', 'Sertifikalar', 'Projeler', 'Ek Bilgiler', 'Halen'],
  ar: ['الملخص المهني', 'الخبرة العملية', 'التعليم', 'المهارات', 'الشهادات', 'المشاريع', 'معلومات إضافية', 'حتى الآن'],
  hi: ['पेशेवर सारांश', 'कार्य अनुभव', 'शिक्षा', 'कौशल', 'प्रमाणपत्र', 'परियोजनाएँ', 'अतिरिक्त जानकारी', 'वर्तमान'],
  bn: ['পেশাগত সারসংক্ষেপ', 'কর্ম অভিজ্ঞতা', 'শিক্ষা', 'দক্ষতা', 'সার্টিফিকেশন', 'প্রকল্প', 'অতিরিক্ত তথ্য', 'বর্তমান'],
  zh: ['个人简介', '工作经历', '教育背景', '技能', '证书', '项目经历', '其他信息', '至今'],
  ja: ['職務要約', '職務経歴', '学歴', 'スキル', '資格', 'プロジェクト', 'その他', '現在'],
  ko: ['경력 요약', '경력', '학력', '기술', '자격증', '프로젝트', '추가 정보', '현재'],
  id: ['Ringkasan Profesional', 'Pengalaman Kerja', 'Pendidikan', 'Keahlian', 'Sertifikasi', 'Proyek', 'Informasi Tambahan', 'Sekarang'],
  vi: ['Tóm tắt nghề nghiệp', 'Kinh nghiệm làm việc', 'Học vấn', 'Kỹ năng', 'Chứng chỉ', 'Dự án', 'Thông tin bổ sung', 'Hiện tại'],
};

const LABEL_KEYS = ['summary', 'experience', 'education', 'skills', 'certifications', 'projects', 'additional', 'present'];
const ENGLISH = { additional: 'Additional Information', present: 'Present' };
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const normalizeResumeLanguage = (value) => {
  const code = `${value ?? ''}`.trim().toLowerCase().split(/[-_]/)[0];
  return RESUME_LANGUAGE_CODES.includes(code) ? code : '';
};

/** Localized labels for a template; English returns the design's own labels. */
export const getResumeLabels = (template, language) => {
  const row = LABELS[language];
  if (!row) return { ...template.labels, additional: ENGLISH.additional, present: ENGLISH.present };
  return Object.fromEntries(LABEL_KEYS.map((key, index) => [key, row[index]]));
};

// Script share of letters decides the language when the resume does not set one.
const SCRIPT_LANGUAGE = [
  [/\p{Script=Georgian}/u, 'ka'],
  [/\p{Script=Arabic}/u, 'ar'],
  [/\p{Script=Devanagari}/u, 'hi'],
  [/\p{Script=Bengali}/u, 'bn'],
  [/\p{Script=Hangul}/u, 'ko'],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'ja'],
  [/\p{Script=Han}/u, 'zh'],
  [/\p{Script=Cyrillic}/u, 'cyrillic'],
];

/** Best-effort language from content: only non-Latin scripts are detected. */
export const detectResumeLanguage = (text = '') => {
  const counts = new Map();
  let letters = 0;
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue;
    letters += 1;
    for (const [test, code] of SCRIPT_LANGUAGE) {
      if (test.test(char)) { counts.set(code, (counts.get(code) || 0) + 1); break; }
    }
  }
  if (!letters) return 'en';
  // Japanese mixes kana with Han; any real kana share means Japanese.
  if ((counts.get('ja') || 0) / letters > 0.05) return 'ja';
  const [best, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (!best || count / letters <= 0.5) return 'en';
  if (best === 'cyrillic') return /[ієїґЄІЇҐ]/u.test(text) ? 'uk' : 'ru';
  return best;
};

export const resolveResumeLanguage = (resume = {}, text = '') => (
  normalizeResumeLanguage(resume.language || resume.resumeLanguage || resume.resume_language) || detectResumeLanguage(text)
);

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);
export const isRtlLanguage = (language) => RTL_LANGUAGES.has(language);

/** Document direction: the language's, or right-to-left when RTL letters dominate. */
export const resolveResumeDirection = (language, text = '') => {
  if (isRtlLanguage(language)) return 'rtl';
  if (language && language !== 'en') return 'ltr';
  let rtl = 0;
  let letters = 0;
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue;
    letters += 1;
    if (/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(char)) rtl += 1;
  }
  return letters && rtl / letters > 0.5 ? 'rtl' : 'ltr';
};

const dateFormatters = new Map();
/** "2022-03" → "Mar 2022" (English) or the language's own short month form. */
export const formatResumeDate = (value, language = 'en') => {
  const text = `${value ?? ''}`.trim();
  const match = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(text);
  if (!match) return text;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return text;
  if (!language || language === 'en' || typeof Intl === 'undefined') return `${EN_MONTHS[month - 1]} ${match[1]}`;
  if (!dateFormatters.has(language)) {
    // Western digits keep dates easy for applicant tracking systems to read.
    dateFormatters.set(language, new Intl.DateTimeFormat(`${language}-u-nu-latn`, { month: 'short', year: 'numeric', timeZone: 'UTC' }));
  }
  return dateFormatters.get(language).format(new Date(Date.UTC(Number(match[1]), month - 1, 1)));
};

// Upper-case only scripts with a conventional capital form. Georgian
// Mtavruli capitals, for example, are not used for names or headings.
const CASED = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}]+/gu;
export const applyResumeCase = (text, mode, language = 'en') => {
  if (!text || mode !== 'upper') return text || '';
  const locale = normalizeResumeLanguage(language) || 'en';
  return text.replace(CASED, (part) => part.toLocaleUpperCase(locale));
};
