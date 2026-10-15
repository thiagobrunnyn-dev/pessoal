/** Presentation and new writes for human text in the people directory only. */
export function uppercasePersonText(value: string) {
  return value.normalize('NFC').toLocaleUpperCase('pt-BR');
}
