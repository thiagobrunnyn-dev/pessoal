export type PersonMask = 'cpf' | 'phoneBR';
export type MaskValue = {value: string; masked: boolean};
export type MaskSelection = {start: number; end: number};
export type MaskEdit = MaskValue & MaskSelection;

const digits = (value: string) => value.replace(/\D/g, '');

function formatDigits(kind: PersonMask, value: string): string {
  if (kind === 'cpf') return value.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2').replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
  if (!value) return '';
  if (value.length < 2) return '(' + value;
  const local = value.slice(2), split = value.length > 10 ? 5 : 4;
  return '(' + value.slice(0, 2) + ')' + local.slice(0, split) + (local.length > split ? '-' + local.slice(split) : '');
}

function acceptsMask(kind: PersonMask, value: string): boolean {
  return (kind === 'cpf' ? /^[\d.\-\s]*$/ : /^[\d()\-\s]*$/).test(value) && digits(value).length <= 11 && (kind !== 'phoneBR' || !digits(value).startsWith('0'));
}

/** Only format recognizable stored values. The caller keeps the original value until an edit. */
export function initialMaskValue(kind: PersonMask, value: string): MaskValue {
  if (value === '') return {value, masked: true};
  const raw = digits(value);
  const complete = kind === 'cpf'
    ? /^\d{11}$/.test(value) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value)
    : /^[1-9]\d{9,10}$/.test(value) || /^\([1-9]\d\) ?\d{4,5}-\d{4}$/.test(value);
  const alreadyMasked = acceptsMask(kind, value) && value === formatDigits(kind, raw) && value !== raw;
  return complete || alreadyMasked ? {value: formatDigits(kind, raw), masked: true} : {value, masked: false};
}

function positionAfterDigits(value: string, count: number): number {
  let position = 0, found = 0;
  while (position < value.length && found < count) if (/\d/.test(value[position++])) found++;
  while (position < value.length && !/\d/.test(value[position])) position++;
  return position;
}

/** Format a browser edit and map its selection by digit position, without dropping any digits. */
export function applyMaskEdit(kind: PersonMask, previous: MaskValue, raw: string, selection: MaskSelection, inputType = '', beforeSelection?: MaskSelection): MaskEdit {
  const replacesAll = beforeSelection?.start === 0 && beforeSelection.end === previous.value.length;
  const phonePaste = kind === 'phoneBR' && (replacesAll || (previous.value === '' && (inputType === 'insertFromPaste' || inputType === 'insertReplacementText'))) && raw !== '';
  const recognizablePhone = /^[1-9]\d{0,10}$/.test(raw) || /^\([1-9]\d\) ?\d{4,5}-?\d{4}$/.test(raw);
  if (!acceptsMask(kind, raw) || (phonePaste && !recognizablePhone) || (!previous.masked && raw !== '' && !replacesAll)) {
    return {value: raw, masked: raw === '', ...selection};
  }
  let nextDigits = digits(raw);
  let start = digits(raw.slice(0, selection.start)).length, end = digits(raw.slice(0, selection.end)).length;
  // A browser may delete only a mask character. Consume the adjacent digit so Backspace/Delete do not get stuck.
  const collapsed = !beforeSelection || beforeSelection.start === beforeSelection.end;
  if (collapsed && nextDigits === digits(previous.value) && raw.length < previous.value.length && (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward')) {
    const index = inputType === 'deleteContentBackward' ? start - 1 : start;
    if (index >= 0 && index < nextDigits.length) {
      nextDigits = nextDigits.slice(0, index) + nextDigits.slice(index + 1);
      start = end = index;
    }
  }
  const value = formatDigits(kind, nextDigits);
  return {value, masked: true, start: positionAfterDigits(value, start), end: positionAfterDigits(value, end)};
}
