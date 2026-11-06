/** The languages a provider's titles come in, by the code used for them here. */
export const LANGUAGES: Record<string, string> = {
	en: 'English',
	af: 'African',
	sq: 'Albanian',
	ar: 'Arabic',
	bg: 'Bulgarian',
	da: 'Danish',
	nl: 'Dutch',
	fr: 'French',
	de: 'German',
	el: 'Greek',
	hi: 'Hindi',
	hu: 'Hungarian',
	it: 'Italian',
	kn: 'Kannada',
	ml: 'Malayalam',
	mr: 'Marathi',
	fa: 'Persian',
	pl: 'Polish',
	pt: 'Portuguese',
	pa: 'Punjabi',
	ro: 'Romanian',
	ru: 'Russian',
	sc: 'Scandinavian',
	sh: 'Serbo-Croatian',
	so: 'Somali',
	si: 'South Indian',
	es: 'Spanish',
	lat: 'Spanish (Latin America)',
	ta: 'Tamil',
	te: 'Telugu',
	ur: 'Urdu'
};

export const DEFAULT_LANGUAGE = 'en';

export function languageLabel(code: string): string {
	return LANGUAGES[code] ?? 'Other';
}
