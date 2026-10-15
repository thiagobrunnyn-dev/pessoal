'use client';

import {useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes} from 'react';
import {applyMaskEdit, initialMaskValue, type MaskSelection, type PersonMask} from './person-input-mask';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'maxLength'> & {
  mask: PersonMask; value: string; onValueChange: (value: string) => void;
};

export default function PersonMaskedInput({mask, value, onValueChange, ...props}: Props) {
  const input = useRef<HTMLInputElement>(null), pendingSelection = useRef<MaskSelection | null>(null);
  const beforeSelection = useRef<MaskSelection | undefined>(undefined), composing = useRef(false), keyboardType = useRef('');
  const [draft, setDraft] = useState(() => ({source: value, ...initialMaskValue(mask, value)}));
  // A new value from the owner is a fresh snapshot. Formatting alone never marks the field dirty.
  let current = draft;
  if (draft.source !== value) {
    current = {source: value, ...initialMaskValue(mask, value)};
    setDraft(current);
  }

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const captureSelection = () => {beforeSelection.current = {start: element.selectionStart ?? 0, end: element.selectionEnd ?? 0};};
    element.addEventListener('beforeinput', captureSelection);
    return () => element.removeEventListener('beforeinput', captureSelection);
  }, []);

  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (selection && input.current === document.activeElement) input.current?.setSelectionRange(selection.start, selection.end);
    pendingSelection.current = null;
  });

  function commit(element: HTMLInputElement, inputType: string) {
    const next = applyMaskEdit(mask, current, element.value, {start: element.selectionStart ?? element.value.length, end: element.selectionEnd ?? element.value.length}, inputType, beforeSelection.current);
    beforeSelection.current = undefined; keyboardType.current = ''; pendingSelection.current = next;
    setDraft({source: next.value, value: next.value, masked: next.masked});
    if (next.value !== value) onValueChange(next.value);
  }

  return <input {...props} ref={input} value={current.value}
    onKeyDown={event => {
      keyboardType.current = event.key === 'Backspace' ? 'deleteContentBackward' : event.key === 'Delete' ? 'deleteContentForward' : '';
      beforeSelection.current = {start: event.currentTarget.selectionStart ?? 0, end: event.currentTarget.selectionEnd ?? 0};
      props.onKeyDown?.(event);
    }}
    onCompositionStart={event => {composing.current = true; props.onCompositionStart?.(event);}}
    onCompositionEnd={event => {composing.current = false; commit(event.currentTarget, 'insertCompositionText'); props.onCompositionEnd?.(event);}}
    onChange={event => {
      if (composing.current || (event.nativeEvent as InputEvent).isComposing) {
        setDraft({...current, value: event.currentTarget.value});
        return;
      }
      commit(event.currentTarget, (event.nativeEvent as InputEvent).inputType || keyboardType.current);
    }}/>;
}
